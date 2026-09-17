package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 图像解析接口的请求参数。
 *
 * <p>用户上传一张图片并提供解析意图（如"模仿构图"、"抽离画风"等），
 * 系统调用大模型进行视觉分析，返回结构化的标签提示词。</p>
 */
@Data
public class ParseImageRequest {

    /**
     * 用户的解析意图描述，例如：
     * - "模仿这个图片的构图"
     * - "抽离出这个图的画风"
     * - "提取氛围感"
     * - "全面解析"
     */
    @NotBlank(message = "解析意图不能为空")
    @Size(max = 500, message = "解析意图不能超过 500 个字符")
    private String userPrompt;

    /**
     * 待解析的图片文件（通过 MultipartFile 上传，在 Controller 层处理）。
     * 此字段仅用于文档说明，实际请求中图片作为 multipart/form-data 的 image 字段传递。
     */
    // MultipartFile image (handled in controller)
}
