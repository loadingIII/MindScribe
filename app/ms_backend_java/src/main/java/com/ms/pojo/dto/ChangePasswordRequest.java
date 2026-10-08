package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 修改密码请求；密码长度口径与注册保持一致（8-64 位）。 */
public record ChangePasswordRequest(
        @NotBlank(message = "原密码不能为空") String oldPassword,
        @NotBlank(message = "新密码不能为空") @Size(min = 8, max = 64, message = "密码长度需在 8 到 64 位之间") String newPassword) {}
