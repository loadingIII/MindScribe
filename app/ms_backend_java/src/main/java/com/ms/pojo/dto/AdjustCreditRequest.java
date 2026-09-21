package com.ms.pojo.dto;

import lombok.Data;

/** 管理端积分调整入参：amount 正为充值、负为扣减；reason 必填用于审计。 */
@Data
public class AdjustCreditRequest {
    /** 带符号调整量，不能为 0。 */
    private Integer amount;
    /** 调整原因，必填。 */
    private String reason;
}
