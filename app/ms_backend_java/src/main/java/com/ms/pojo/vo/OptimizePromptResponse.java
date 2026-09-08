package com.ms.pojo.vo;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** 图片提示词优化接口的返回内容。 */
public record OptimizePromptResponse(
        @JsonProperty("tags_prompt") List<TagPrompt> tagsPrompt
) {

    /** 单条结构化图片标签。 */
    public record TagPrompt(
            @JsonProperty("tag_name") String tagName,
            @JsonProperty("tag_value") String tagValue
    ) {
    }
}
