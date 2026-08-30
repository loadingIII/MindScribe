package com.ms.pojo.vo;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
/** 任务轮询响应。 */
public record TaskVO(@JsonProperty("task_id") String taskId, String status, @JsonProperty("image_urls") List<String> imageUrls, String error) {}
