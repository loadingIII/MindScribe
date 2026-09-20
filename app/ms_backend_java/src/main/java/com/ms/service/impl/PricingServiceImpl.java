package com.ms.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.mapper.PricingMapper;
import com.ms.pojo.entity.PricingRuleEntity;
import com.ms.pojo.exception.InsufficientCreditException;
import com.ms.service.PricingService;
import com.ms.utils.LogUtil;
import jakarta.annotation.PostConstruct;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/** 计价实现：AtomicReference 持有规则快照，管理端修改后 refresh() 即时生效。 */
@Service
public class PricingServiceImpl implements PricingService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(PricingServiceImpl.class);
    /** 未知尺寸/质量的默认系数，避免规则漏配导致无法计价。 */
    private static final BigDecimal DEFAULT_MULTIPLIER = BigDecimal.ONE;

    private final PricingMapper pricingMapper;
    private final ObjectMapper mapper;
    /** 规则缓存快照；key 为 action + ":" + model。 */
    private final AtomicReference<Map<String, PricingRuleEntity>> cache = new AtomicReference<>(Map.of());

    public PricingServiceImpl(PricingMapper pricingMapper, ObjectMapper mapper) {
        this.pricingMapper = pricingMapper;
        this.mapper = mapper;
    }

    /** 启动时全量加载规则，保证首个请求前缓存可用。 */
    @PostConstruct
    public void init() {
        refresh();
    }

    @Override
    public synchronized void refresh() {
        // 规则总量小（几十行），全量拉取重建快照，不做增量比对。
        List<PricingRuleEntity> rules = pricingMapper.findActiveRules();
        Map<String, PricingRuleEntity> next = new java.util.HashMap<>();
        for (PricingRuleEntity rule : rules) {
            next.put(ruleKey(rule.getAction(), rule.getModel()), rule);
        }
        cache.set(Map.copyOf(next));
        log.info("计价规则缓存已刷新，规则数={}", next.size());
    }

    /** 兜底定时刷新：防缓存与库不一致，也为将来多实例部署预留。 */
    @Scheduled(fixedDelayString = "#{${credits.pricing-refresh-seconds:60} * 1000}")
    public void scheduledRefresh() {
        refresh();
    }

    @Override
    public int quote(String action, String model, String mode, String size, String quality, int n) {
        if (n <= 0) throw new IllegalArgumentException("生成张数必须大于 0");
        PricingRuleEntity rule = findRule(action, model);
        if (rule == null) {
            // fail-closed：查不到规则宁可拒绝生成，也不能按 0 分免费生图。
            log.warn("缺少计价规则，action={} model={}", action, model);
            throw new InsufficientCreditException("暂不支持该模型的计价配置，请联系管理员");
        }
        BigDecimal base = BigDecimal.valueOf(PricingService.MODE_IMAGE_TO_IMAGE.equals(mode)
                ? rule.getImg2imgCost() : rule.getBaseCost());
        BigDecimal sizeFactor = multiplier(rule.getSizeMultipliers(), size);
        BigDecimal qualityFactor = multiplier(rule.getQualityMultipliers(), quality);
        // ceil 后再乘张数：单张向上取整，避免多张时小数累计被一次性抹掉。
        BigDecimal unit = base.multiply(sizeFactor).multiply(qualityFactor)
                .setScale(0, RoundingMode.CEILING);
        int cost = unit.intValue() * n;
        log.debug("计价完成 action={} model={} mode={} size={} quality={} n={} cost={}",
                action, model, mode, size, quality, n, cost);
        return cost;
    }

    @Override
    public List<PricingRuleEntity> getActiveRules() {
        return new ArrayList<>(cache.get().values());
    }

    /** 规则查找：(action, model) 精确优先，miss 后回退 (action, 'default')。 */
    private PricingRuleEntity findRule(String action, String model) {
        Map<String, PricingRuleEntity> snapshot = cache.get();
        PricingRuleEntity exact = model == null ? null : snapshot.get(ruleKey(action, model));
        return exact != null ? exact : snapshot.get(ruleKey(action, "default"));
    }

    /** 从系数 JSON 中读取指定取值的系数；JSON 解析失败或键缺失均按 1.0。 */
    private BigDecimal multiplier(String json, String key) {
        if (json == null || json.isBlank() || key == null || key.isBlank()) return DEFAULT_MULTIPLIER;
        try {
            Map<?, ?> factors = mapper.readValue(json, Map.class);
            Object value = factors.get(key);
            if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        } catch (Exception e) {
            log.warn("计价系数解析失败，按 1.0 处理：{}", e.getMessage());
        }
        return DEFAULT_MULTIPLIER;
    }

    /** 缓存 key 规则：action 与 model 均为小写，避免大小写差异导致 miss。 */
    private static String ruleKey(String action, String model) {
        return String.valueOf(action).toLowerCase() + ":" + String.valueOf(model).toLowerCase();
    }
}
