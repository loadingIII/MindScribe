package com.ms.pojo.entity;

import java.time.LocalDateTime;

/** 个人中心所需的用户资料字段；只读场景，不含密码哈希。 */
public record UserProfileEntity(
        String id,
        String email,
        String displayName,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt) {}
