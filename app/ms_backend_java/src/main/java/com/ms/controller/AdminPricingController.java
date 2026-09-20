package com.ms.controller;

import com.ms.mapper.PricingMapper;
import com.ms.pojo.dto.PricingRuleRequest;
import com.ms.pojo.entity.PricingRuleEntity;
import com.ms.service.PricingService;
import com.ms.utils.LogUtil;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 管理端计价规则接口：规则 CRUD，保存后同进程刷新 PricingService 缓存实现热更新。 */
@RestController
@RequestMapping("/admin/pricing")
public class AdminPricingController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(AdminPricingController.class);

    private final PricingMapper pricingMapper;
    private final PricingService pricingService;

    public AdminPricingController(PricingMapper pricingMapper, PricingService pricingService) {
        this.pricingMapper = pricingMapper;
        this.pricingService = pricingService;
    }

    /** 查询全部规则（含停用），供管理端列表与编辑回显。 */
    @GetMapping("/rules")
    public List<PricingRuleEntity> listRules() {
        return pricingMapper.findAllRules();
    }

    /** 新建规则；保存后刷新缓存即时生效。 */
    @PostMapping("/rules")
    @Transactional
    public PricingRuleEntity createRule(@RequestAttribute("userId") String operatorId,
                                        @RequestBody PricingRuleRequest request) {
        validate(request, true);
        PricingRuleEntity rule = new PricingRuleEntity();
        rule.setId(UUID.randomUUID().toString());
        rule.setAction(request.getAction().trim());
        rule.setModel(request.getModel().trim());
        rule.setBaseCost(request.getBaseCost());
        rule.setImg2imgCost(request.getImg2imgCost());
        rule.setSizeMultipliers(request.getSizeMultipliers());
        rule.setQualityMultipliers(request.getQualityMultipliers());
        rule.setIsActive(request.getIsActive() == null || request.getIsActive());
        rule.setRemark(request.getRemark());
        pricingMapper.insertRule(rule);
        pricingService.refresh();
        log.info("计价规则已创建，operator={} action={} model={}", operatorId, rule.getAction(), rule.getModel());
        return rule;
    }

    /** 编辑规则；保存后刷新缓存即时生效。 */
    @PutMapping("/rules/{id}")
    @Transactional
    public PricingRuleEntity updateRule(@RequestAttribute("userId") String operatorId,
                                        @PathVariable String id,
                                        @RequestBody PricingRuleRequest request) {
        PricingRuleEntity stored = pricingMapper.findRule(id);
        if (stored == null) throw new IllegalArgumentException("规则不存在");
        validate(request, false);
        PricingRuleEntity rule = new PricingRuleEntity();
        rule.setId(id);
        rule.setBaseCost(request.getBaseCost());
        rule.setImg2imgCost(request.getImg2imgCost());
        rule.setSizeMultipliers(request.getSizeMultipliers());
        rule.setQualityMultipliers(request.getQualityMultipliers());
        rule.setIsActive(request.getIsActive());
        rule.setRemark(request.getRemark());
        pricingMapper.updateRule(rule);
        pricingService.refresh();
        log.info("计价规则已更新，operator={} id={}", operatorId, id);
        return pricingMapper.findRule(id);
    }

    /** 停用规则（不物理删除）；default 规则停用前提示确认由前端负责，这里仅执行停用。 */
    @DeleteMapping("/rules/{id}")
    @Transactional
    public Map<String, Object> deactivateRule(@RequestAttribute("userId") String operatorId,
                                              @PathVariable String id) {
        int updated = pricingMapper.deactivateRule(id);
        if (updated == 0) throw new IllegalArgumentException("规则不存在");
        pricingService.refresh();
        log.info("计价规则已停用，operator={} id={}", operatorId, id);
        return Map.of("deactivated", true);
    }

    /** 入参校验：新建要求 action/model 必填，系数 JSON 合法性交给 PricingService 解析兜底。 */
    private void validate(PricingRuleRequest request, boolean creating) {
        if (request == null) throw new IllegalArgumentException("请求体不能为空");
        if (creating) {
            if (request.getAction() == null || request.getAction().isBlank()) {
                throw new IllegalArgumentException("计费动作必填");
            }
            if (request.getModel() == null || request.getModel().isBlank()) {
                throw new IllegalArgumentException("模型名必填");
            }
        }
        if (request.getBaseCost() != null && request.getBaseCost() < 0) throw new IllegalArgumentException("基准价不能为负");
        if (request.getImg2imgCost() != null && request.getImg2imgCost() < 0) throw new IllegalArgumentException("基准价不能为负");
    }
}
