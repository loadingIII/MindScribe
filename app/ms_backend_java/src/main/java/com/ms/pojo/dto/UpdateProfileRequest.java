package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 修改个人资料请求：目前仅支持修改昵称。 */
public record UpdateProfileRequest(
        @NotBlank(message = "昵称不能为空") @Size(max = 100, message = "昵称不能超过 100 个字符") String displayName) {}
