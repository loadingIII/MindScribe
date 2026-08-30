package com.ms.pojo.dto;

import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** 图片生成请求参数。 */
@Data
public class GenerateImageDTO {
    private String title;
    private String prompt;
    private List<MultipartFile> reference_images;
    /** 重试时直接复用已上传的 OSS 参考图地址。 */
    private List<String> reference_image_urls;
    private String model;
    private String size;
    private String quality;
    private String output_format;
    private Integer n;
}
