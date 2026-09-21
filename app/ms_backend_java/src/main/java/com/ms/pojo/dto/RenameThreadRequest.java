package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 重命名 Thread 的入参：只允许修改标题，杜绝借道实体字段篡改状态机。 */
public record RenameThreadRequest(
        @NotBlank(message = "标题不能为空")
        @Size(max = 255, message = "标题不能超过 255 个字符") String title) {}
