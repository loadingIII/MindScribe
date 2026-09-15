package com.ms.pojo.vo;

import com.fasterxml.jackson.annotation.JsonProperty;

/** 模板元信息生成接口的返回内容，包含大模型生成的模板名称与简介。 */
public record GenerateMetadataResponse(
        @JsonProperty("title") String title,
        @JsonProperty("description") String description
) {
}
