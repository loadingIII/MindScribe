package com.ms.pojo.vo;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * 迭代树节点：对应一次生成 Attempt；树的根是虚拟的"原图"节点（用户上传的参考图）。
 * 每次生成固定产出 1 张图，因此 Attempt 与迭代节点一一对应，
 * parentNodeId 即数据库 attempts.parent_attempt_id；根节点的 parentNodeId 为 null。
 */
public record IterationNodeVO(
        String id,
        @JsonProperty("attempt_id") String attemptId,
        String label,
        @JsonProperty("image_url") String imageUrl,
        @JsonProperty("parent_node_id") String parentNodeId,
        @JsonProperty("child_node_ids") List<String> childNodeIds,
        String prompt,
        String tags,
        String modelName,
        String size,
        String quality,
        String status,
        @JsonProperty("created_at") String createdAt,
        int depth,
        @JsonProperty("iteration_type") String iterationType,
        /** 仅根节点携带：Thread 上传的全部原图地址，供"从原图继续"回填参考图。 */
        @JsonProperty("reference_images") List<String> referenceImages
) {}
