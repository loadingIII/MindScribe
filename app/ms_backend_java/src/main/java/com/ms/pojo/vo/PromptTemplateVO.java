package com.ms.pojo.vo;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;

/** 提示词模板接口响应；将数据库 JSON 字符串还原为前端可直接使用的对象。 */
public record PromptTemplateVO(
        String id,
        String title,
        String description,
        String coverUrl,
        String source,
        String category,
        String visibility,
        String status,
        String userPromptTemplate,
        String systemPrompt,
        JsonNode builderSnapshot,
        JsonNode referenceSlots,
        JsonNode modelDefaults,
        JsonNode tags,
        int usageCount,
        int favoriteCount,
        boolean saved,
        boolean editable,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {}
