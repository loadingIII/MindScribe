package com.ms.pojo.vo;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
/** Thread 下的一次生成尝试。每次重试都会产生新的 Attempt；迭代生成的记录父节点。 */
public record AttemptVO(@JsonProperty("attempt_id") String attemptId, @JsonProperty("task_id") String taskId,
                        String status, @JsonProperty("image_urls") List<String> imageUrls, String error,
                        String prompt, String modelName, String size, String quality,
                        String outputFormat,
                        /** 迭代父 Attempt ID：NULL 表示非迭代生成（首次生成或普通重试）。 */
                        @JsonProperty("parent_attempt_id") String parentAttemptId) {}
