package com.ms.service.impl;

import com.ms.mapper.GenImgsMapper;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import com.ms.service.CreditService;
import com.ms.utils.LogUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 超时 Attempt 兜底清理：Python 重启可能丢失历史任务，导致 Attempt 永远停在
 * pending/running，预扣积分也因此无法通过轮询返还。定时把这些 Attempt 标记为
 * failed 并返还积分，覆盖轮询链路覆盖不到的场景。
 */
@Component
public class StaleAttemptSweeper {
    private static final org.slf4j.Logger log = LogUtil.getLogger(StaleAttemptSweeper.class);

    private final GenImgsMapper genImgsMapper;
    private final CreditService creditService;
    /** Attempt 超过该时长仍未终态即判定为僵死，单位小时。 */
    private final long staleHours;
    /** 单次扫描最多处理的数量，避免冷启动时一次性回填大量历史数据。 */
    private final int batchSize;

    public StaleAttemptSweeper(GenImgsMapper genImgsMapper, CreditService creditService,
                               @Value("${credits.stale-attempt-hours:24}") long staleHours,
                               @Value("${credits.stale-sweep-batch:50}") int batchSize) {
        this.genImgsMapper = genImgsMapper;
        this.creditService = creditService;
        this.staleHours = staleHours;
        this.batchSize = batchSize;
    }

    /** 每 10 分钟扫描一次僵死 Attempt；延迟启动 2 分钟，避开发布窗口。 */
    @Scheduled(initialDelay = 120_000, fixedDelay = 600_000)
    public void sweep() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(staleHours);
        List<java.util.Map<String, Object>> staleAttempts = genImgsMapper.findStaleAttempts(threshold, batchSize);
        if (staleAttempts.isEmpty()) return;
        log.info("发现僵死 Attempt {} 条，阈值小时={}", staleAttempts.size(), staleHours);
        for (java.util.Map<String, Object> attempt : staleAttempts) {
            markFailedAndRefund(attempt);
        }
    }

    /** 标记 failed 并返还积分；Thread 状态同步推进，避免前端永久轮询。 */
    private void markFailedAndRefund(java.util.Map<String, Object> attempt) {
        String attemptId = String.valueOf(attempt.get("id"));
        String threadId = String.valueOf(attempt.get("threadId"));
        String userId = String.valueOf(attempt.get("userId"));
        try {
            AttemptEntity update = new AttemptEntity();
            update.setId(attemptId);
            update.setStatus("failed");
            update.setErrorMessage("任务超时未完成，系统自动关闭");
            update.setFinishedAt(LocalDateTime.now());
            genImgsMapper.updateAttempt(update);
            // Thread 状态仅在仍停留在 pending/running 时推进，避免覆盖已重新发起的新 Attempt 状态。
            genImgsMapper.updateThreadStatusIfPending(threadId, "failed");
            // 是否真扣过由 refund 内部判断：无 consume 流水时直接跳过。
            creditService.refund(userId, attemptId, "任务超时返还");
            log.info("僵死 Attempt 已关闭并返还，attemptId={} threadId={}", attemptId, threadId);
        } catch (Exception e) {
            // 单条失败不影响其余扫描结果，下一轮会重试。
            log.warn("僵死 Attempt 处理失败，attemptId={}", attemptId, e);
        }
    }
}
