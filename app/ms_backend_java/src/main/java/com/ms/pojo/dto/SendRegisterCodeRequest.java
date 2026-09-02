package com.ms.pojo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** 发送注册验证码请求。 */
public record SendRegisterCodeRequest(@NotBlank @Email String email) {}
