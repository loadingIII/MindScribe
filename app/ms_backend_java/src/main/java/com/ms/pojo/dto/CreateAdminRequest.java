package com.ms.pojo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 超级管理员创建管理员账号的入参。 */
public record CreateAdminRequest(
        @NotBlank(message = "邮箱不能为空") @Email(message = "邮箱格式不正确") String email,
        @NotBlank(message = "密码不能为空") @Size(min = 8, max = 64, message = "密码长度需在 8 到 64 位之间") String password,
        @NotBlank(message = "显示名不能为空") @Size(max = 100, message = "显示名不能超过 100 个字符") String displayName,
        @NotBlank(message = "角色不能为空")
        @Pattern(regexp = "admin|super-admin", message = "角色仅支持 admin 或 super-admin") String role) {}
