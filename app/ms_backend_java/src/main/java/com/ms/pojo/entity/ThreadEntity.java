package com.ms.pojo.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 一次不可变的生成请求；重试通过新增 Attempt 表示。 */
@Data
public class ThreadEntity {
    private String id;
    private String userId;
    private String title;
    private String referenceImages;
    private String status;
    private Integer attemptCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime archivedAt;
}
