package com.ms.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.pojo.dto.GenerateMetadataRequest;
import com.ms.pojo.dto.OptimizePromptRequest;
import com.ms.pojo.vo.GenerateMetadataResponse;
import com.ms.pojo.vo.OptimizePromptResponse;
import com.ms.utils.LogUtil;
import com.ms.utils.OssStorageUtil;
import com.ms.utils.PromptUtils;
import jakarta.validation.Valid;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.content.Media;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 提供由大模型驱动的提示词优化接口。 */
@RestController
@RequestMapping("/ai")
public class LlmController {

    private static final org.slf4j.Logger log = LogUtil.getLogger(LlmController.class);
    private static final String TAG_PROMPT_TEMPLATE = "GenImgsTagPrompt";
    private static final String METADATA_PROMPT_TEMPLATE = "GenTemplateMetadata";
    private static final String PROMPT_REFERENCE_IMAGES_DIR = "prompt-reference-images";
    private static final Pattern REFERENCE_MARK_PATTERN =
            Pattern.compile("\\[(\\d+):([^\\]]+)]");

    private final ChatClient chatClient;
    private final PromptUtils promptUtils;
    private final ObjectMapper objectMapper;
    private final OssStorageUtil ossStorageUtil;

    /** 使用 Spring AI 自动配置的 Builder 创建聊天客户端。 */
    public LlmController(
            ChatClient.Builder chatClientBuilder,
            PromptUtils promptUtils,
            ObjectMapper objectMapper,
            OssStorageUtil ossStorageUtil) {
        this.chatClient = chatClientBuilder.build();
        this.promptUtils = promptUtils;
        this.objectMapper = objectMapper;
        this.ossStorageUtil = ossStorageUtil;
    }

    /** 根据用户创作内容和关联图片生成结构化图片标签。 */
    @PostMapping(value = "/prompts/optimize", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public OptimizePromptResponse optimizePrompt(
            @Valid @ModelAttribute OptimizePromptRequest request) {
        try {
            List<ReferenceImage> referenceImages = uploadReferencedImages(request);
            // 使用流式响应逐段接收内容，全部片段拼接后再解析完整 JSON。
            String response = chatClient.prompt(new Prompt(List.of(
                            new SystemMessage(buildSystemPrompt(request, referenceImages)),
                            buildUserMessage(request, referenceImages))))
                    .stream()
                    .content()
                    .collect(Collectors.joining())
                    .block();
            return parseResponse(response);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            log.error("调用提示词优化模型失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "提示词优化服务暂时不可用",
                    exception);
        }
    }

    /** 根据用户提示词、已生成标签和结果图，生成模板名称与简介。 */
    @PostMapping(value = "/prompts/generate-metadata")
    public GenerateMetadataResponse generateMetadata(
            @Valid @RequestBody GenerateMetadataRequest request) {
        try {
            // 使用流式响应逐段接收内容，全部片段拼接后再解析完整 JSON。
            String response = chatClient.prompt(new Prompt(List.of(
                            new SystemMessage(buildMetadataSystemPrompt(request)),
                            buildMetadataUserMessage(request))))
                    .stream()
                    .content()
                    .collect(Collectors.joining())
                    .block();
            return parseMetadataResponse(response);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            log.error("调用模板元信息生成模型失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "模板信息生成服务暂时不可用",
                    exception);
        }
    }

    /** 读取并填充模板元信息提示词模板。 */
    private String buildMetadataSystemPrompt(GenerateMetadataRequest request) {
        try {
            String template = promptUtils.readPrompt(METADATA_PROMPT_TEMPLATE);
            return template
                    .replace("{{user_prompt}}", request.getUserPrompt().trim())
                    .replace("{{tags}}", objectMapper.writeValueAsString(
                            request.getTags() == null ? List.of() : request.getTags()));
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "标签信息格式不正确",
                    exception);
        } catch (IOException exception) {
            log.error("读取模板元信息提示词模板失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "模板元信息模板加载失败",
                    exception);
        }
    }

    /** 构造模板元信息的用户消息；有结果图时附带图片媒体供模型视觉理解。 */
    private UserMessage buildMetadataUserMessage(GenerateMetadataRequest request) {
        UserMessage.Builder builder = UserMessage.builder()
                .text("请根据以上创作提示词与标签，生成模板名称与简介。");
        String resultImageUrl = request.getResultImageUrl();
        if (resultImageUrl != null && !resultImageUrl.isBlank()) {
            try {
                builder.media(new Media(
                        org.springframework.util.MimeTypeUtils.IMAGE_PNG,
                        new URI(resultImageUrl)));
            } catch (URISyntaxException exception) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "结果图访问地址无效",
                        exception);
            }
        }
        return builder.build();
    }

    /** 解析并清洗元信息模型输出，校验 title 与 description 非空。 */
    private GenerateMetadataResponse parseMetadataResponse(String response) {
        if (response == null || response.isBlank()) {
            throw invalidModelResponse();
        }
        try {
            JsonNode root = objectMapper.readTree(removeMarkdownFence(response));
            String title = root.path("title").asText("").trim();
            String description = root.path("description").asText("").trim();
            if (title.isEmpty() || description.isEmpty()) {
                throw invalidModelResponse();
            }
            return new GenerateMetadataResponse(title, description);
        } catch (JsonProcessingException exception) {
            throw invalidModelResponse();
        }
    }

    /** 读取并填充图片标签提示词模板。 */
    private String buildSystemPrompt(
            OptimizePromptRequest request,
            List<ReferenceImage> referenceImages) {
        try {
            String template = promptUtils.readPrompt(TAG_PROMPT_TEMPLATE);
            return template
                    .replace("{{user_input}}", request.getUserPrompt().trim())
                    .replace("{{reference_filenames}}", objectMapper.writeValueAsString(referenceImages));
        } catch (JsonProcessingException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "参考图信息格式不正确",
                    exception);
        } catch (IOException exception) {
            log.error("读取图片提示词模板失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "图片提示词模板加载失败",
                    exception);
        }
    }

    /** 构造包含 URL 映射和真实图片媒体的多模态用户消息。 */
    private UserMessage buildUserMessage(
            OptimizePromptRequest request,
            List<ReferenceImage> referenceImages) {
        String bindings = referenceImages.isEmpty()
                ? "没有关联参考图。"
                : referenceImages.stream()
                        .map(reference -> String.format(
                                "%s 对应第 %d 张参考图（%s），OSS URL：%s",
                                reference.marker(),
                                reference.index(),
                                reference.filename(),
                                reference.url()))
                        .reduce((left, right) -> left + "\n" + right)
                        .orElse("");
        UserMessage.Builder builder = UserMessage.builder()
                .text("用户创作输入：\n" + request.getUserPrompt().trim()
                        + "\n\n关联参考图映射：\n" + bindings
                        + "\n\n请结合随消息附带的对应图片，生成 tags_prompt。");
        for (ReferenceImage reference : referenceImages) {
            try {
                builder.media(new Media(
                        org.springframework.util.MimeTypeUtils.parseMimeType(reference.contentType()),
                        new URI(reference.url())));
            } catch (URISyntaxException exception) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "参考图访问地址无效",
                        exception);
            }
        }
        return builder.build();
    }

    /** 解析 [序号:图片名] 标记，只上传被用户实际关联的图片。 */
    private List<ReferenceImage> uploadReferencedImages(OptimizePromptRequest request) {
        List<MultipartFile> files = request.getReferenceImages() == null
                ? List.of()
                : request.getReferenceImages();
        List<Integer> indexes = request.getReferenceIndexes() == null
                ? List.of()
                : request.getReferenceIndexes();
        if (files.size() != indexes.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "参考图文件和序号数量不一致");
        }
        java.util.Map<Integer, MultipartFile> filesByIndex = new java.util.HashMap<>();
        for (int fileIndex = 0; fileIndex < files.size(); fileIndex++) {
            Integer referenceIndex = indexes.get(fileIndex);
            if (referenceIndex == null || referenceIndex < 1
                    || filesByIndex.put(referenceIndex, files.get(fileIndex)) != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "参考图序号无效或重复");
            }
        }
        List<ReferenceImage> references = new ArrayList<>();
        Set<Integer> usedIndexes = new LinkedHashSet<>();
        Matcher matcher = REFERENCE_MARK_PATTERN.matcher(request.getUserPrompt());
        while (matcher.find()) {
            int index = Integer.parseInt(matcher.group(1));
            String filename = matcher.group(2).trim();
            if (!usedIndexes.add(index)) {
                continue;
            }
            MultipartFile file = filesByIndex.get(index);
            if (index < 1 || file == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "关联参考图不存在：" + matcher.group());
            }
            validateImage(file, matcher.group());
            try {
                references.add(new ReferenceImage(
                        index,
                        matcher.group(),
                        filename,
                        ossStorageUtil.uploadForModel(file, PROMPT_REFERENCE_IMAGES_DIR),
                        file.getContentType()));
            } catch (IOException exception) {
                log.error("上传提示词关联参考图失败，index={}", index, exception);
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "关联参考图上传失败",
                        exception);
            }
        }
        return references;
    }

    /** 只允许上传图片类型，避免把任意文件写入 OSS。 */
    private void validateImage(MultipartFile file, String marker) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "关联参考图为空：" + marker);
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "关联参考图必须是图片：" + marker);
        }
    }

    /** 单张已关联、已上传的参考图及其模型输入信息。 */
    private record ReferenceImage(
            int index,
            String marker,
            String filename,
            String url,
            String contentType) {
    }

    /** 解析并清洗模型输出，只保留非空且不重复的标签。 */
    private OptimizePromptResponse parseResponse(String response) {
        if (response == null || response.isBlank()) {
            throw invalidModelResponse();
        }
        try {
            JsonNode tags = objectMapper.readTree(removeMarkdownFence(response)).path("tags_prompt");
            if (!tags.isArray()) {
                throw invalidModelResponse();
            }
            List<OptimizePromptResponse.TagPrompt> result = new ArrayList<>();
            Set<String> usedTagNames = new LinkedHashSet<>();
            for (JsonNode tag : tags) {
                String tagName = tag.path("tag_name").asText("").trim();
                String tagValue = tag.path("tag_value").asText("").trim();
                if (!tagName.isBlank() && !tagValue.isBlank() && usedTagNames.add(tagName)) {
                    result.add(new OptimizePromptResponse.TagPrompt(tagName, tagValue));
                }
            }
            if (result.isEmpty()) {
                throw invalidModelResponse();
            }
            return new OptimizePromptResponse(result);
        } catch (JsonProcessingException exception) {
            throw invalidModelResponse();
        }
    }

    /** 兼容模型附带的 Markdown JSON 代码块。 */
    private String removeMarkdownFence(String content) {
        String trimmed = content.trim();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        int firstLineEnd = trimmed.indexOf('\n');
        int lastFenceStart = trimmed.lastIndexOf("```");
        return firstLineEnd >= 0 && lastFenceStart > firstLineEnd
                ? trimmed.substring(firstLineEnd + 1, lastFenceStart).trim()
                : trimmed;
    }

    /** 避免把原始模型返回内容直接暴露给浏览器。 */
    private ResponseStatusException invalidModelResponse() {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "提示词优化服务返回的数据格式不正确");
    }
}
