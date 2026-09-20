package com.ms.pojo.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 积分流水：所有积分变动的唯一事实来源，余额可由 SUM(amount) 审计。 */
@Data
public class CreditTransactionEntity {
    private Long id;
    private String userId;
    /** 关联的 Attempt ID；consume/refund 必填，管理端调整为空。 */
    private String attemptId;
    /** 流水类型：consume/refund/recharge/adjust。 */
    private String type;
    /** 带符号变动量：consume 为负，其余为正。 */
    private Integer amount;
    /** 变动后余额快照，用于对账排查。 */
    private Integer balanceAfter;
    /** 变动原因：管理端操作必填；系统返还写系统原因。 */
    private String reason;
    /** 操作人：管理端操作时从 JWT 取；系统动作为空。 */
    private String operatorId;
    private LocalDateTime createdAt;
}
