-- 迭代树功能增量迁移：为 attempts 增加 parent_attempt_id 字段（MySQL 8.0+）
-- 适用已有环境；新环境直接执行 schema.sql 即可。
USE mindscribe;

ALTER TABLE attempts
    ADD COLUMN parent_attempt_id CHAR(36) NULL
        COMMENT '迭代父 Attempt ID；NULL 表示该 Thread 的首个尝试' AFTER mode,
    ADD KEY idx_attempts_parent (parent_attempt_id);
