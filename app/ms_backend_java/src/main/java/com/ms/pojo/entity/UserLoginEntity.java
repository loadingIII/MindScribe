package com.ms.pojo.entity;

/** 登录校验所需的用户表字段。 */
public record UserLoginEntity(
        String id,
        String username,
        String passwordHash,
        String displayName,
        String role) {}
