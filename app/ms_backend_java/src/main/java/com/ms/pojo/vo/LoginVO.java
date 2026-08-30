package com.ms.pojo.vo;

/** 登录成功后返回的最小用户信息。 */
public record LoginVO(String userId, String username, String displayName, String role) {}
