package com.ms.pojo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 图片提示词优化接口的 multipart 请求参数。
 *
 * <p>参考图数组顺序必须与前端创作页中的参考图顺序一致；用户输入中的
 * {@code [序号:图片名]} 标记会决定实际传给模型的图片。</p>
 */
@Data
public class OptimizePromptRequest {

    @NotBlank(message = "用户提示词不能为空")
    @Size(max = 8000, message = "用户提示词不能超过 8000 个字符")
    private String userPrompt;

    /** 前端全部参考图文件，后端只上传被文本标记关联的图片。 */
    private List<MultipartFile> referenceImages;

    /** 每个 multipart 图片对应的前端参考图序号，与 referenceImages 一一对应。 */
    private List<Integer> referenceIndexes;
}
