package com.ms.pojo.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 一次模型执行记录，服务于任务状态机和后续 MLOps 采集。 */
@Data
public class AttemptEntity {
    private String id;
    private String threadId;
    private Integer attemptNo;
    private String status;
    private String prompt;
    private String modelName;
    private String size;
    private String quality;
    private String outputFormat;
    private Integer requestedCount;
    private String mode;
    /** 迭代父 Attempt ID；NULL 表示该 Thread 的首个尝试。 */
    private String parentAttemptId;
    private String results;
    private String externalTaskId;
    private String errorCode;
    private String errorMessage;
    private String runtimeMetadata;
    private LocalDateTime createdAt;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private LocalDateTime updatedAt;
}
