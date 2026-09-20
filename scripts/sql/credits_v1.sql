-- 积分模块增量 DDL：计价规则 + 积分流水。
-- 设计说明见 .docs/credits-module.md；所有语句可重复执行。

USE `mindscribe`;

-- 计价规则：管理端写，生图链路只读（经 PricingService 内存缓存）。
CREATE TABLE IF NOT EXISTS `credit_pricing_rules` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则 ID',
  `action` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image_generation' COMMENT '计费动作：image_generation（预留 optimize/parse 等）',
  `model` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型名，default 为兜底规则',
  `base_cost` int NOT NULL COMMENT '文生图单张基准价（积分）',
  `img2img_cost` int NOT NULL COMMENT '图生图单张基准价（积分）',
  `size_multipliers` json NOT NULL COMMENT '尺寸系数，如 {"auto":1,"1024x1024":1}',
  `quality_multipliers` json NOT NULL COMMENT '质量系数，如 {"high":1,"medium":0.8,"low":0.6}',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否生效：1/0',
  `remark` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_action_model` (`action`,`model`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分计价规则';

-- 积分流水：唯一事实来源；SUM(amount) 应等于 users.credit_balance。
CREATE TABLE IF NOT EXISTS `credit_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '流水 ID',
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属用户',
  `attempt_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联 Attempt（consume/refund 必填；不设外键，提交失败时 attempt 行可能不存在）',
  `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'consume/refund/recharge/adjust',
  `amount` int NOT NULL COMMENT '带符号变动量：consume 为负，其余为正；adjust 可负',
  `balance_after` int NOT NULL COMMENT '变动后余额快照，用于对账排查',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变动原因：管理端操作必填；系统返还写系统原因',
  `operator_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作人（管理端操作时从 JWT 取；系统动作为 NULL）',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attempt_type` (`attempt_id`,`type`),
  KEY `idx_tx_user_created` (`user_id`,`created_at`),
  KEY `idx_tx_type_created` (`type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分流水';

-- 初始计价规则（示例价，上线前在管理端调整）；重复执行不覆盖已有配置。
-- 合法取值以 infers/gen_img_v1_py 的请求校验为准（当前默认 gpt-image-2 / auto / high）。
INSERT INTO credit_pricing_rules (id, action, model, base_cost, img2img_cost, size_multipliers, quality_multipliers, is_active, remark)
VALUES
  (UUID(), 'image_generation', 'gpt-image-2', 20, 30,
   JSON_OBJECT('auto', 1, '1024x1024', 1, '1536x1024', 1.25, '1024x1536', 1.25),
   JSON_OBJECT('high', 1, 'medium', 0.8, 'low', 0.6), 1, '初始规则'),
  (UUID(), 'image_generation', 'default', 20, 30,
   JSON_OBJECT('auto', 1),
   JSON_OBJECT('high', 1, 'medium', 0.8, 'low', 0.6), 1, '兜底规则')
ON DUPLICATE KEY UPDATE updated_at = updated_at;

-- 存量用户一次性赠送（额度可调）：只补零余额账号，避免覆盖已调整过的用户。
UPDATE users SET credit_balance = 100 WHERE credit_balance = 0;
