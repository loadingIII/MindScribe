package com.ms.pojo.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 创建或更新提示词模板的请求。
 * 所有字段均可选：创建时由服务层校验必填项；更新时只写入传入的字段（部分更新）。
 */
public class PromptTemplateRequest {
    private String title;
    private String description;
    private String coverUrl;
    private String categoryCode;
    private String visibility;
    private String userPromptTemplate;
    private String systemPrompt;
    private JsonNode builderSnapshot;
    private JsonNode referenceSlots;
    private JsonNode modelDefaults;
    private JsonNode tags;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
    public String getCategoryCode() { return categoryCode; }
    public void setCategoryCode(String categoryCode) { this.categoryCode = categoryCode; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public String getUserPromptTemplate() { return userPromptTemplate; }
    public void setUserPromptTemplate(String userPromptTemplate) { this.userPromptTemplate = userPromptTemplate; }
    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }
    public JsonNode getBuilderSnapshot() { return builderSnapshot; }
    public void setBuilderSnapshot(JsonNode builderSnapshot) { this.builderSnapshot = builderSnapshot; }
    public JsonNode getReferenceSlots() { return referenceSlots; }
    public void setReferenceSlots(JsonNode referenceSlots) { this.referenceSlots = referenceSlots; }
    public JsonNode getModelDefaults() { return modelDefaults; }
    public void setModelDefaults(JsonNode modelDefaults) { this.modelDefaults = modelDefaults; }
    public JsonNode getTags() { return tags; }
    public void setTags(JsonNode tags) { this.tags = tags; }
}
