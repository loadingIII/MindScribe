package com.ms.pojo.vo;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** 迭代树响应：Task 的完整迭代历史，包含全部节点与根/最新节点定位。 */
public record IterationTreeVO(
        @JsonProperty("thread_id") String threadId,
        String title,
        @JsonProperty("root_node_id") String rootNodeId,
        @JsonProperty("latest_node_id") String latestNodeId,
        List<IterationNodeVO> nodes
) {}
