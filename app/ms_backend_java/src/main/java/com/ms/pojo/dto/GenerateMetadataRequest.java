package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 模板元信息生成接口的请求参数。
 *
 * <p>携带用户原始提示词、已生成的结构化标签和结果图地址，
 * 供大模型生成模板名称与简介。</p>
 */
@Data
public class GenerateMetadataRequest {

    @NotBlank(message = "用户提示词不能为空")
    @Size(max = 8000, message = "用户提示词不能超过 8000 个字符")
    private String userPrompt;

    /** 已生成的结构化标签，每项包含 key（标签名）和 value（标签内容）。 */
    private List<TagItem> tags;

    /** 结果图的可访问地址，帮助模型基于真实生成效果撰写简介；没有结果图时可为空。 */
    @Size(max = 2048, message = "结果图地址过长")
    private String resultImageUrl;

    /** 单条结构化标签。 */
    @Data
    public static class TagItem {

        /** 标签名称，例如"主体类型"。 */
        @Size(max = 64, message = "标签名称过长")
        private String key;

        /** 标签内容，例如"穿红色连衣裙的年轻女孩"。 */
        @Size(max = 2000, message = "标签内容过长")
        private String value;
    }
}
