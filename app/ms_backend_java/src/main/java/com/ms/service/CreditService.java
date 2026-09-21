package com.ms.service;

/** 积分账务服务：预扣、返还与调整，全部落流水并维护余额快照。 */
public interface CreditService {

    /**
     * 预扣积分：原子扣减余额 + 写 consume 流水，同一事务。
     * 余额不足、用户不存在或被禁用时抛 {@link com.ms.pojo.exception.InsufficientCreditException}。
     *
     * @param userId    用户 ID
     * @param attemptId 本次生成对应的 Attempt ID（预生成，用于幂等）
     * @param cost      扣减积分数（正数）
     * @return 扣减后的余额
     */
    int deduct(String userId, String attemptId, int cost);

    /**
     * 返还积分：金额取该 attempt 的 consume 流水金额，以流水为唯一依据，不重新计价。
     * 幂等：同一 attempt 重复调用时，refund 流水受唯一键保护，只生效一次。
     *
     * @param userId    用户 ID
     * @param attemptId 关联的 Attempt ID
     * @param reason    返还原因，写入流水
     */
    void refund(String userId, String attemptId, String reason);

    /**
     * 管理端调整积分：amount 正为充值、负为扣减；写 adjust 流水并记录操作人。
     *
     * @param userId     目标用户 ID
     * @param amount     带符号调整量（非 0）
     * @param reason     调整原因（必填）
     * @param operatorId 操作管理员 ID（从 JWT 取）
     * @return 调整后的余额
     */
    int adjust(String userId, int amount, String reason, String operatorId);

    /** 查询当前余额；用户不存在或被禁用时抛出业务异常。 */
    int balance(String userId);
}
