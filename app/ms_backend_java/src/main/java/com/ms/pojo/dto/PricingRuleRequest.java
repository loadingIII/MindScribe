package com.ms.pojo.dto;

import lombok.Data;

/** 管理端计价规则新增/编辑入参；系数以 JSON 字符串提交。 */
@Data
public class PricingRuleRequest {
    /** 计费动作；新建时必填，编辑时不允许修改（与 model 共同构成唯一键）。 */
    private String action;
    /** 模型名；新建时必填。 */
    private String model;
    /** 文生图单张基准价。 */
    private Integer baseCost;
    /** 图生图单张基准价。 */
    private Integer img2imgCost;
    /** 尺寸系数 JSON，如 {"auto":1,"1536x1024":1.25}。 */
    private String sizeMultipliers;
    /** 质量系数 JSON，如 {"high":1,"medium":0.8}。 */
    private String qualityMultipliers;
    /** 是否生效。 */
    private Boolean isActive;
    /** 备注。 */
    private String remark;
}
