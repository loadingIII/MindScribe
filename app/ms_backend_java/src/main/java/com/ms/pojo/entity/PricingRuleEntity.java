package com.ms.pojo.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 积分计价规则：管理端维护，生图链路经 PricingService 缓存只读。 */
@Data
public class PricingRuleEntity {
    private String id;
    /** 计费动作，当前仅 image_generation，预留 optimize/parse 等。 */
    private String action;
    /** 模型名；值为 default 的规则是同 action 下的兜底规则。 */
    private String model;
    /** 文生图单张基准价（积分）。 */
    private Integer baseCost;
    /** 图生图单张基准价（积分）。 */
    private Integer img2imgCost;
    /** 尺寸系数 JSON，如 {"auto":1,"1536x1024":1.25}。 */
    private String sizeMultipliers;
    /** 质量系数 JSON，如 {"high":1,"medium":0.8}。 */
    private String qualityMultipliers;
    /** 是否生效：1/0。 */
    private Boolean isActive;
    private String remark;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
