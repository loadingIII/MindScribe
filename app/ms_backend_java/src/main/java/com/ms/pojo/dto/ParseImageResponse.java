package com.ms.pojo.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 图像解析接口的响应数据。
 *
 * <p>包含图像分析摘要和结构化的标签提示词列表。</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParseImageResponse {

    /** 图像分析的简要摘要，概括核心视觉特征（1-2句话）。 */
    private String analysisSummary;

    /** 结构化标签提示词列表。 */
    private List<TagItem> tags;

    /** 单条结构化标签。 */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TagItem {

        /** 标签名称，例如"主体类型"、"构图方式"、"艺术风格"。 */
        private String tagName;

        /** 标签内容，例如"人物肖像"、"三分法构图"、"水彩画风格"。 */
        private String tagValue;
    }
}
