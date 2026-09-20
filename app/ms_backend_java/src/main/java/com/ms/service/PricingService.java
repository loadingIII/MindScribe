package com.ms.service;

import com.ms.pojo.entity.PricingRuleEntity;

import java.util.List;

/** 计价服务：维护规则内存缓存，提供生图消耗的统一计算入口。 */
public interface PricingService {

    /** 计价常量：生图动作标识，对应 credit_pricing_rules.action。 */
    String ACTION_IMAGE_GENERATION = "image_generation";

    /** 计价模式：文生图，取规则的 base_cost。 */
    String MODE_TEXT_TO_IMAGE = "text-to-image";

    /** 计价模式：图生图，取规则的 img2img_cost。 */
    String MODE_IMAGE_TO_IMAGE = "image-to-image";

    /**
     * 计算一次生图的积分消耗。
     * 公式：ceil(基准价(模式) × 尺寸系数 × 质量系数) × n；未知尺寸/质量按系数 1.0。
     *
     * @param action  计费动作，当前仅 image_generation
     * @param model   模型名；无对应规则时回退到 default 规则
     * @param mode    text-to-image 或 image-to-image
     * @param size    尺寸参数，如 auto / 1024x1024
     * @param quality 质量参数，如 high / medium / low
     * @param n       生成张数，须大于 0
     * @return 单次消耗积分（正数）
     * @throws com.ms.pojo.exception.InsufficientCreditException 规则缺失时抛出，拒绝生成（fail-closed）
     */
    int quote(String action, String model, String mode, String size, String quality, int n);

    /** 全量刷新内存缓存；管理端修改规则后同进程调用，即时生效。 */
    void refresh();

    /** 读取当前缓存的全部生效规则（管理端保存后提示刷新使用）。 */
    List<PricingRuleEntity> getActiveRules();
}
