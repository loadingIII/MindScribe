-- MindScribe 最小生成任务模型（MySQL 8.0+）
-- 图片文件存 OSS；JSON 字段只保存参考图/结果地址及 MLOps 元数据。
CREATE DATABASE IF NOT EXISTS mindscribe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mindscribe;

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL COMMENT '用户 ID',
    username VARCHAR(64) NULL COMMENT '登录用户名',
    email VARCHAR(128) NULL COMMENT '邮箱',
    password_hash VARCHAR(255) NULL COMMENT '密码哈希',
    display_name VARCHAR(100) NOT NULL COMMENT '展示名称',
    avatar_url VARCHAR(500) NULL COMMENT '头像地址',
    role VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT 'user/admin',
    status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
    credit_balance INT NOT NULL DEFAULT 0 COMMENT '算力余额',
    settings JSON NULL COMMENT '个人设置',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    last_login_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS threads (
    id CHAR(36) NOT NULL COMMENT 'Thread ID',
    user_id CHAR(36) NOT NULL COMMENT '所属用户',
    title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '创作标题',
    reference_images JSON NULL COMMENT 'Thread 创建时上传的参考图 OSS 地址及元数据',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        COMMENT 'pending/running/succeeded/failed',
    attempt_count INT NOT NULL DEFAULT 0 COMMENT '尝试次数',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    archived_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_threads_user_updated (user_id, updated_at),
    KEY idx_threads_user_status (user_id, status),
    CONSTRAINT fk_threads_user
        FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attempts (
    id CHAR(36) NOT NULL COMMENT 'Attempt ID',
    thread_id CHAR(36) NOT NULL COMMENT '所属 Thread',
    attempt_no INT NOT NULL COMMENT 'Thread 内的尝试序号，从 1 开始',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        COMMENT 'pending/running/succeeded/failed',

    prompt TEXT NOT NULL COMMENT '本次 Attempt 使用的用户提示词',
    model_name VARCHAR(128) NOT NULL COMMENT '模型名称',
    size VARCHAR(32) NOT NULL COMMENT '图片尺寸',
    quality VARCHAR(32) NOT NULL COMMENT '图片质量',
    output_format VARCHAR(16) NOT NULL DEFAULT 'png',
    requested_count TINYINT NOT NULL DEFAULT 1 COMMENT '生成数量',
    mode VARCHAR(32) NULL COMMENT '模式',

    results JSON NULL COMMENT '生成结果 OSS 地址及元数据',
    external_task_id VARCHAR(128) NULL COMMENT '推理服务任务 ID',
    error_code VARCHAR(64) NULL,
    error_message TEXT NULL,
    runtime_metadata JSON NULL COMMENT 'MLOps 运行元数据，如提供商、队列和耗时',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    started_at DATETIME(3) NULL,
    finished_at DATETIME(3) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_attempt_thread_no (thread_id, attempt_no),
    UNIQUE KEY uk_attempt_external_task (external_task_id),
    KEY idx_attempts_thread_created (thread_id, created_at),
    KEY idx_attempts_status_created (status, created_at),
    CONSTRAINT fk_attempts_thread
        FOREIGN KEY (thread_id) REFERENCES threads (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 提示词模板主表：模板元数据与当前发布状态。
CREATE TABLE IF NOT EXISTS prompt_templates (
    id CHAR(36) NOT NULL,
    owner_user_id CHAR(36) NULL COMMENT '创建者；官方模板可为空',
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    cover_url VARCHAR(500) NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'personal' COMMENT 'official/community/personal',
    category_code VARCHAR(64) NOT NULL DEFAULT 'illustration',
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' COMMENT 'public/private',
    status VARCHAR(20) NOT NULL DEFAULT 'published' COMMENT 'draft/published/archived',
    user_prompt_template TEXT NOT NULL,
    system_prompt TEXT NULL,
    builder_snapshot JSON NULL,
    reference_slots JSON NULL,
    model_defaults JSON NULL,
    tags JSON NULL,
    usage_count INT NOT NULL DEFAULT 0,
    favorite_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    published_at DATETIME(3) NULL,
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_prompt_templates_visibility (visibility, status, updated_at),
    KEY idx_prompt_templates_owner (owner_user_id, updated_at),
    KEY idx_prompt_templates_category (category_code, updated_at),
    CONSTRAINT fk_prompt_templates_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 模板收藏关系：一个用户对同一模板只能收藏一次。
CREATE TABLE IF NOT EXISTS prompt_template_favorites (
    user_id CHAR(36) NOT NULL,
    template_id CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, template_id),
    CONSTRAINT fk_prompt_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_prompt_favorites_template FOREIGN KEY (template_id) REFERENCES prompt_templates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 模板使用记录：用于最近使用与审计，不替代 attempts.prompt 快照。
CREATE TABLE IF NOT EXISTS prompt_template_usages (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    template_id CHAR(36) NOT NULL,
    thread_id CHAR(36) NULL,
    attempt_id CHAR(36) NULL,
    rendered_prompt JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_prompt_usages_user_created (user_id, created_at),
    KEY idx_prompt_usages_template_created (template_id, created_at),
    CONSTRAINT fk_prompt_usages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_prompt_usages_template FOREIGN KEY (template_id) REFERENCES prompt_templates (id) ON DELETE CASCADE,
    CONSTRAINT fk_prompt_usages_thread FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE SET NULL,
    CONSTRAINT fk_prompt_usages_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
