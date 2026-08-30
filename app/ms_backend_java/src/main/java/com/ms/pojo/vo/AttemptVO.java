package com.ms.pojo.vo;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
/** Thread 下的一次生成尝试。每次重试都会产生新的 Attempt。 */
public record AttemptVO(@JsonProperty("attempt_id") String attemptId, @JsonProperty("task_id") String taskId,
                        String status, @JsonProperty("image_urls") List<String> imageUrls, String error) {}
