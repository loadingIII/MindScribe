package com.ms.service.impl;

import com.ms.mapper.CreditMapper;
import com.ms.service.CreditService;
import com.ms.utils.LogUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 孤儿扣费对账兜底：扣积分与 Attempt 落库分属两步，进程崩溃等极端情况下
 * 可能留下"有 consume 流水但没有 refund 流水"的孤儿扣费，用户积分就此蒸发。
 * 定时扫描这类流水并原额返还；金额以 consume 流水为准，幂等由 uk_attempt_type 保证。
 */
@Component
public class OrphanConsumeSweeper {
    private static final org.slf4j.Logger log = LogUtil.getLogger(OrphanConsumeSweeper.class);

    private final CreditMapper creditMapper;
    private final CreditService creditService;
    /** consume 流水早于该小时数才参与对账，避免误返还在途任务。 */
    private final long staleHours;
    /** 单轮最多处理条数，避免冷启动回填过多历史数据。 */
    private final int batchSize;

    public OrphanConsumeSweeper(CreditMapper creditMapper, CreditService creditService,
                                @Value("${credits.orphan-consume-hours:24}") long staleHours,
                                @Value("${credits.orphan-sweep-batch:50}") int batchSize) {
        this.creditMapper = creditMapper;
        this.creditService = creditService;
        this.staleHours = staleHours;
        this.batchSize = batchSize;
    }

    /** 每小时对账一次；延迟启动 5 分钟，避开发布窗口。 */
    @Scheduled(initialDelay = 300_000, fixedDelay = 3_600_000)
    public void sweep() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(staleHours);
        List<Map<String, Object>> orphans = creditMapper.findOrphanConsumes(threshold, batchSize);
        if (orphans.isEmpty()) return;
        log.info("发现孤儿扣费 {} 条，阈值小时={}", orphans.size(), staleHours);
        for (Map<String, Object> orphan : orphans) {
            refundOrphan(orphan);
        }
    }

    /** 返还单条孤儿扣费；无 refund 流水时 refund 才生效，重复调度天然幂等。 */
    private void refundOrphan(Map<String, Object> orphan) {
        String attemptId = String.valueOf(orphan.get("attemptId"));
        String userId = String.valueOf(orphan.get("userId"));
        int amount = ((Number) orphan.get("amount")).intValue();
        try {
            creditService.refund(userId, attemptId, "系统对账返还");
            log.info("孤儿扣费已返还，attemptId={} userId={} amount={}", attemptId, userId, amount);
        } catch (Exception e) {
            // 单条失败不影响本轮其余记录，下一轮会重试。
            log.warn("孤儿扣费返还失败，attemptId={}", attemptId, e);
        }
    }
}
