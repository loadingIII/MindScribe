package com.ms.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.pojo.dto.GenerateMetadataRequest;
import com.ms.pojo.dto.OptimizePromptRequest;
import com.ms.pojo.dto.ParseImageRequest;
import com.ms.pojo.dto.ParseImageResponse;
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
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;
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
            JsonNode root = objectMapper.readTree(repairModelJson(response, this::invalidModelResponse));
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
            JsonNode tags = objectMapper
                    .readTree(repairModelJson(response, this::invalidModelResponse))
                    .path("tags_prompt");
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

    /** 避免把原始模型返回内容直接暴露给浏览器。 */
    private ResponseStatusException invalidModelResponse() {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "提示词优化服务返回的数据格式不正确");
    }

    /**
     * 图像解析接口：根据用户上传的图片和解析意图，调用大模型进行视觉分析，
     * 返回结构化的标签提示词。
     *
     * @param userPrompt 用户的解析意图（如"模仿构图"、"抽离画风"）
     * @param image 待解析的图片文件
     * @return 包含分析摘要和标签列表的响应
     */
    @PostMapping(value = "/prompts/parse-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ParseImageResponse parseImage(
            @RequestParam("userPrompt") String userPrompt,
            @RequestParam("image") MultipartFile image) {
        // 参数校验
        if (userPrompt == null || userPrompt.trim().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "解析意图不能为空");
        }
        if (userPrompt.length() > 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "解析意图不能超过 500 个字符");
        }
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "请上传待解析的图片");
        }

        try {
            // 1. 上传图片到 OSS
            String imageUrl = ossStorageUtil.upload(image, PROMPT_REFERENCE_IMAGES_DIR);
            log.info("图像解析：已上传图片到 OSS，URL: {}", imageUrl);

            // 2. 构建提示词并调用 LLM
            String systemPrompt = buildImageParseSystemPrompt(userPrompt);
            UserMessage userMessage = buildImageParseUserMessage(userPrompt, imageUrl);

            // 3. 流式接收响应并拼接
            String response = chatClient.prompt(new Prompt(List.of(
                            new SystemMessage(systemPrompt),
                            userMessage)))
                    .stream()
                    .content()
                    .collect(Collectors.joining())
                    .block();

            // 4. 解析响应 JSON 并附加 OSS 图片地址
            ParseImageResponse parseResponse = parseImageParseResponse(response);
            parseResponse.setImageUrl(imageUrl);
            return parseResponse;

        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException exception) {
            log.error("上传图片到 OSS 失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "图片上传失败，请稍后重试",
                    exception);
        } catch (Exception exception) {
            log.error("调用图像解析模型失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "图像解析服务暂时不可用",
                    exception);
        }
    }

    /** 读取并填充图像解析提示词模板。 */
    private String buildImageParseSystemPrompt(String userPrompt) {
        try {
            String template = promptUtils.readPrompt("GenPromptFromImage");
            // GenPromptFromImage.md 模板已包含完整指令，此处无需额外替换
            return template;
        } catch (IOException exception) {
            log.error("读取图像解析提示词模板失败", exception);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "图像解析模板加载失败",
                    exception);
        }
    }

    /** 构造图像解析的用户消息，包含用户意图和图片。 */
    private UserMessage buildImageParseUserMessage(String userPrompt, String imageUrl) {
        try {
            return UserMessage.builder()
                    .text("用户的解析意图：" + userPrompt.trim())
                    .media(new Media(
                            org.springframework.util.MimeTypeUtils.IMAGE_PNG,
                            new URI(imageUrl)))
                    .build();
        } catch (URISyntaxException exception) {
            log.error("图片 URL 格式错误: {}", imageUrl, exception);
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "图片地址格式不正确",
                    exception);
        }
    }

    /** 解析图像解析模型返回的 JSON 响应；模型输出可能带 Markdown 围栏或被内容审核截断，需先做修复。 */
    private ParseImageResponse parseImageParseResponse(String rawResponse) {
        if (rawResponse == null || rawResponse.isBlank()) {
            log.error("图像解析模型返回空内容");
            throw invalidImageParseResponse();
        }

        JsonNode root = null;
        try {
            root = objectMapper.readTree(
                    repairModelJson(rawResponse, this::invalidImageParseResponse));
        } catch (JsonProcessingException exception) {
            log.error("解析图像解析模型返回的 JSON 失败: {}", rawResponse, exception);
            throw invalidImageParseResponse();
        }

        // 提取 analysis_summary
        String summary = root.path("analysis_summary").asText("");

        // 提取 tags 数组，只保留名称与内容均非空的项
        List<ParseImageResponse.TagItem> tags = new ArrayList<>();
        if (root.has("tags") && root.get("tags").isArray()) {
            for (JsonNode tagNode : root.get("tags")) {
                String tagName = tagNode.path("tag_name").asText("").trim();
                String tagValue = tagNode.path("tag_value").asText("").trim();
                if (!tagName.isBlank() && !tagValue.isBlank()) {
                    tags.add(new ParseImageResponse.TagItem(tagName, tagValue));
                }
            }
        }

        if (tags.isEmpty()) {
            log.error("图像解析模型未返回有效标签");
            throw invalidImageParseResponse();
        }

        return new ParseImageResponse(summary, tags);
    }

    /**
     * 清洗并修复模型输出，使其可被 Jackson 解析。
     *
     * <p>处理三类常见问题：</p>
     * <ol>
     * <li>Markdown 围栏：正常成对的 ```json ... ``` 先剥掉围栏行；
     * 输出被中途截断导致缺少闭合围栏时，先剥掉起始的 ```json 行再交给修复逻辑。</li>
     * <li>JSON 前后夹杂说明文字：截取首个 "{" 到最后一个 "}" 的主体部分重试。</li>
     * <li>JSON 未闭合（截断的典型表现）：按括号栈逐字符补齐缺失的引号、数组与对象闭合符，
     * 字符串内的未闭合引号同样会被补上，salvage 出已完整生成的标签。</li>
     * </ol>
     *
     * @param rawResponse 模型原始返回内容
     * @param invalidException 修复后仍无法解析时抛出的异常，由各接口提供各自的错误文案
     * @return 可被 Jackson 直接解析的 JSON 字符串
     */
    private String repairModelJson(
            String rawResponse,
            Supplier<ResponseStatusException> invalidException) {
        String trimmed = rawResponse.trim();
        // 剥掉起始围栏行（```json 或 ```），兼容缺少闭合围栏的截断输出。
        if (trimmed.startsWith("```")) {
            int firstLineEnd = trimmed.indexOf('\n');
            trimmed = firstLineEnd >= 0 ? trimmed.substring(firstLineEnd + 1) : "";
            trimmed = trimmed.trim();
        }
        if (trimmed.endsWith("```")) {
            trimmed = trimmed.substring(0, trimmed.length() - 3).trim();
        }
        if (trimmed.isEmpty()) {
            throw invalidException.get();
        }

        // 尝试直接解析，成功则无需修复。
        try {
            objectMapper.readTree(trimmed);
            return trimmed;
        } catch (JsonProcessingException ignored) {
            // 依次尝试提取主体、补齐闭合符。
        }

        // 模型可能在 JSON 前后夹杂说明文字：先截取首个 { 到最后一个 } 的主体重试。
        String extracted = extractJsonObject(trimmed);
        if (extracted != null) {
            try {
                objectMapper.readTree(extracted);
                return extracted;
            } catch (JsonProcessingException ignored) {
                // 主体也不完整，继续走补齐逻辑。
            }
        }

        String repaired = closeUnclosedJson(extracted != null ? extracted : trimmed);
        try {
            objectMapper.readTree(repaired);
            log.warn("模型输出疑似被截断，已自动补齐 JSON 结构");
            return repaired;
        } catch (JsonProcessingException exception) {
            // 修复后仍无法解析，按原始失败路径报错。
            throw invalidException.get();
        }
    }

    /** 从夹杂说明文字的输出中截取首个 "{" 到最后一个 "}" 的 JSON 主体；找不到大括号时返回 null。 */
    private String extractJsonObject(String content) {
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        return start >= 0 && end > start ? content.substring(start, end + 1) : null;
    }

    /**
     * 按括号栈补齐截断 JSON 缺失的闭合符。
     *
     * <p>逐字符扫描：字符串内只关心未闭合的双引号（转义符跳过下一个字符），
     * 字符串外记录对象/数组嵌栈。扫描结束后依栈逆序闭合；若停在字符串中间，
     * 先补一个收尾双引号。值被截断时（如逗号或冒号后截断）由 Jackson 修复后再校验，
     * 仍失败则走原始报错。</p>
     */
    private String closeUnclosedJson(String input) {
        StringBuilder repaired = new StringBuilder(input);
        Deque<Character> stack = new ArrayDeque<>();
        boolean inString = false;
        boolean escaped = false;

        for (int i = 0; i < input.length(); i++) {
            char current = input.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == '"') {
                    inString = false;
                }
                continue;
            }
            switch (current) {
                case '"' -> inString = true;
                case '{' -> stack.push('}');
                case '[' -> stack.push(']');
                // push/pop 的栈顶在头部；只有栈顶恰好是对应闭合符时才弹出，保证嵌套顺序正确。
                case '}' -> {
                    if (!stack.isEmpty() && stack.peek() == '}') {
                        stack.pop();
                    }
                }
                case ']' -> {
                    if (!stack.isEmpty() && stack.peek() == ']') {
                        stack.pop();
                    }
                }
                default -> { }
            }
        }

        // 停在转义符上：先补一个反斜杠，避免收尾引号被解析成转义字符。
        if (escaped) {
            repaired.append('\\');
        }
        // 停在字符串中间：补收尾引号使字符串合法闭合。
        if (inString || escaped) {
            repaired.append('"');
        }

        // 截尾悬空符号：冒号后截断补 null，逗号/开头括号后截断直接去掉。
        String cleaned = repaired.toString().stripTrailing();
        while (cleaned.endsWith(":")) {
            cleaned = cleaned + "null";
            break;
        }
        cleaned = cleaned.replaceAll(",\\s*$", "");

        // 依栈逆序补齐闭合符。
        StringBuilder closed = new StringBuilder(cleaned);
        while (!stack.isEmpty()) {
            closed.append(stack.pop());
        }
        return closed.toString();
    }

    /** 避免把原始模型返回内容直接暴露给浏览器。 */
    private ResponseStatusException invalidImageParseResponse() {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "图像解析服务返回的数据格式不正确");
    }
}
