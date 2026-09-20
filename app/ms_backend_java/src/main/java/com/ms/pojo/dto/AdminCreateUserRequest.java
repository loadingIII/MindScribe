package com.ms.pojo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 管理端创建普通用户的入参。 */
public record AdminCreateUserRequest(
        @NotBlank(message = "邮箱不能为空") @Email(message = "邮箱格式不正确") String email,
        @NotBlank(message = "密码不能为空") @Size(min = 8, max = 64, message = "密码长度需在 8 到 64 位之间") String password,
        @NotBlank(message = "显示名不能为空") @Size(max = 100, message = "显示名不能超过 100 个字符") String displayName,
        @Size(max = 255, message = "备注不能超过 255 个字符") String reason) {}
