package com.ms.service;

/** 注册邮箱验证码服务。 */
public interface RegisterCodeService {
    void send(String email);
    boolean verify(String email, String code);
}
