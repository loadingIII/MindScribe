package com.ms.pojo.entity;

import java.time.LocalDateTime;

/** 提示词模板持久化对象；JSON 字段以字符串保存，由服务层负责序列化。 */
public class PromptTemplateEntity {
    private String id;
    private String ownerUserId;
    private String title;
    private String description;
    private String coverUrl;
    private String sourceType;
    private String categoryCode;
    private String visibility;
    private String status;
    private String userPromptTemplate;
    private String systemPrompt;
    private String builderSnapshot;
    private String referenceSlots;
    private String modelDefaults;
    private String tags;
    private Integer usageCount;
    private Integer favoriteCount;
    private Boolean saved;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime publishedAt;
    private LocalDateTime deletedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(String ownerUserId) { this.ownerUserId = ownerUserId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public String getCategoryCode() { return categoryCode; }
    public void setCategoryCode(String categoryCode) { this.categoryCode = categoryCode; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getUserPromptTemplate() { return userPromptTemplate; }
    public void setUserPromptTemplate(String userPromptTemplate) { this.userPromptTemplate = userPromptTemplate; }
    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }
    public String getBuilderSnapshot() { return builderSnapshot; }
    public void setBuilderSnapshot(String builderSnapshot) { this.builderSnapshot = builderSnapshot; }
    public String getReferenceSlots() { return referenceSlots; }
    public void setReferenceSlots(String referenceSlots) { this.referenceSlots = referenceSlots; }
    public String getModelDefaults() { return modelDefaults; }
    public void setModelDefaults(String modelDefaults) { this.modelDefaults = modelDefaults; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public Integer getUsageCount() { return usageCount; }
    public void setUsageCount(Integer usageCount) { this.usageCount = usageCount; }
    public Integer getFavoriteCount() { return favoriteCount; }
    public void setFavoriteCount(Integer favoriteCount) { this.favoriteCount = favoriteCount; }
    public Boolean getSaved() { return saved; }
    public void setSaved(Boolean saved) { this.saved = saved; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
    public LocalDateTime getDeletedAt() { return deletedAt; }
    public void setDeletedAt(LocalDateTime deletedAt) { this.deletedAt = deletedAt; }
}
