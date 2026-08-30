package com.ms.pojo.vo;
import com.fasterxml.jackson.annotation.JsonProperty;
/** 创建任务响应。 */
public record CreateTaskVO(@JsonProperty("task_id") String taskId) {}
