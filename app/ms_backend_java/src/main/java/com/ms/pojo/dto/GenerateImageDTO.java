package com.ms.pojo.dto;

import lombok.Data;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** 图片生成请求参数。 */
@Data
public class GenerateImageDTO {
    private String title;
    /** 结构化提示词 JSON（system_prompt/user_prompt/tags_prompt），可读文本取其中的 user_prompt。 */
    private String prompt;
    @JsonProperty("reference_images")
    private List<MultipartFile> referenceImages;
    /** 重试时直接复用已上传的 OSS 参考图地址。 */
    @JsonProperty("reference_image_urls")
    private List<String> referenceImageUrls;
    private String model;
    private String size;
    private String quality;
    @JsonProperty("output_format")
    private String outputFormat;
    private Integer n;
}
