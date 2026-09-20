package com.ms.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.ms.mapper.PromptTemplateMapper;
import com.ms.pojo.dto.PromptTemplateRequest;
import com.ms.pojo.entity.PromptTemplateEntity;
import com.ms.pojo.vo.PromptTemplateVO;
import com.ms.service.PromptTemplateService;
import com.ms.utils.OssStorageUtil;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** 提示词模板业务实现，负责权限校验与 JSON 字段转换。 */
@Service
public class PromptTemplateServiceImpl implements PromptTemplateService {
    /** 封面图在 OSS 中的目录前缀。 */
    private static final String TEMPLATE_COVER_DIR = "prompt-template-covers";

    private final PromptTemplateMapper mapper;
    private final ObjectMapper objectMapper;
    private final OssStorageUtil ossStorageUtil;

    public PromptTemplateServiceImpl(PromptTemplateMapper mapper, ObjectMapper objectMapper, OssStorageUtil ossStorageUtil) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.ossStorageUtil = ossStorageUtil;
    }

    @Override
    public List<PromptTemplateVO> list(String userId, String source, String category, String keyword, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 50));
        int safePage = Math.max(0, page);
        String safeSource = normalizeSource(source);
        String safeCategory = category == null ? "" : category.trim();
        String safeKeyword = keyword == null ? "" : keyword.trim();
        return mapper.findVisible(userId, safeSource, safeCategory, safeKeyword, safeSize, safePage * safeSize)
                .stream().map(item -> toView(item, userId)).collect(Collectors.toList());
    }

    @Override
    public PromptTemplateVO get(String userId, String id) {
        PromptTemplateEntity entity = requireVisible(userId, id);
        return toView(entity, userId);
    }

    @Override
    public PromptTemplateVO create(String userId, PromptTemplateRequest request) {
        // DTO 不再挂 @NotBlank（更新需要全部可选），创建场景在这里单独校验必填项。
        if (request.getTitle() == null || request.getTitle().isBlank()
                || request.getUserPromptTemplate() == null || request.getUserPromptTemplate().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "模板名称和提示词内容不能为空");
        }
        PromptTemplateEntity entity = fromRequest(request);
        entity.setId(UUID.randomUUID().toString());
        entity.setOwnerUserId(userId);
        entity.setSourceType("personal");
        mapper.insert(entity);
        return toView(mapper.findById(entity.getId()), userId);
    }

    @Override
    public PromptTemplateVO update(String userId, String id, PromptTemplateRequest request) {
        if (mapper.findOwned(userId, id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在或无权修改");
        PromptTemplateEntity next = patchFromRequest(request);
        next.setId(id);
        next.setOwnerUserId(userId);
        if (mapper.update(next) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在或无权修改");
        return toView(mapper.findById(id), userId);
    }

    @Override
    public PromptTemplateVO updateCover(String userId, String id, MultipartFile cover) throws IOException {
        if (cover == null || cover.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择要上传的封面图片");
        // 仅所有者可改封面；查询同时完成存在性与权限校验。
        if (mapper.findOwned(userId, id) == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在或无权修改");
        String coverUrl = ossStorageUtil.upload(cover, TEMPLATE_COVER_DIR);
        if (mapper.updateCover(id, userId, coverUrl) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在或无权修改");
        return toView(mapper.findById(id), userId);
    }

    @Override
    public void delete(String userId, String id) {
        if (mapper.softDelete(id, userId) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在或无权删除");
    }

    @Override
    public PromptTemplateVO favorite(String userId, String id, boolean saved) {
        requireVisible(userId, id);
        if (saved) {
            if (mapper.addFavorite(userId, id) > 0) mapper.changeFavoriteCount(id, 1);
        } else {
            if (mapper.removeFavorite(userId, id) > 0) mapper.changeFavoriteCount(id, -1);
        }
        return toView(mapper.findById(id), userId);
    }

    @Override
    public void use(String userId, String id, JsonNode renderedPrompt) {
        requireVisible(userId, id);
        mapper.increaseUsage(id);
        try {
            mapper.insertUsage(UUID.randomUUID().toString(), userId, id,
                    objectMapper.writeValueAsString(renderedPrompt == null ? JsonNodeFactory.instance.objectNode() : renderedPrompt));
        } catch (JsonProcessingException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "使用记录格式无效", ex);
        }
    }

    private PromptTemplateEntity requireVisible(String userId, String id) {
        PromptTemplateEntity entity = mapper.findById(id);
        if (entity == null || (!"public".equals(entity.getVisibility())
                && !"official".equals(entity.getSourceType())
                && !userId.equals(entity.getOwnerUserId()))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在");
        }
        return entity;
    }

    /** 创建场景的完整转换：必填字段取请求值，可选字段为空时落到数据库默认。 */
    private PromptTemplateEntity fromRequest(PromptTemplateRequest request) {
        PromptTemplateEntity entity = new PromptTemplateEntity();
        entity.setTitle(request.getTitle().trim());
        entity.setDescription(trimToNull(request.getDescription()));
        entity.setCoverUrl(trimToNull(request.getCoverUrl()));
        entity.setCategoryCode(blankDefault(request.getCategoryCode(), "illustration"));
        entity.setVisibility(normalizeVisibility(request.getVisibility()));
        entity.setUserPromptTemplate(request.getUserPromptTemplate().trim());
        entity.setSystemPrompt(trimToNull(request.getSystemPrompt()));
        entity.setBuilderSnapshot(writeJson(request.getBuilderSnapshot()));
        entity.setReferenceSlots(writeJson(request.getReferenceSlots()));
        entity.setModelDefaults(writeJson(request.getModelDefaults()));
        entity.setTags(writeJson(request.getTags()));
        return entity;
    }

    /**
     * 更新场景的部分转换：请求里未传（null 或 JSON null）的字段保持 null，
     * 由动态 SQL 跳过，数据库原值得以保留；只有显式传入的字段才覆盖。
     */
    private PromptTemplateEntity patchFromRequest(PromptTemplateRequest request) {
        PromptTemplateEntity entity = new PromptTemplateEntity();
        if (request.getTitle() != null) entity.setTitle(request.getTitle().trim());
        if (request.getDescription() != null) entity.setDescription(trimToNull(request.getDescription()));
        // coverUrl 显式传空串表示清除封面（写入空串而非跳过），非空则去除首尾空白。
        if (request.getCoverUrl() != null) entity.setCoverUrl(request.getCoverUrl().trim());
        if (request.getCategoryCode() != null) entity.setCategoryCode(request.getCategoryCode().trim());
        if (request.getVisibility() != null) entity.setVisibility(normalizeVisibility(request.getVisibility()));
        if (request.getUserPromptTemplate() != null) entity.setUserPromptTemplate(request.getUserPromptTemplate().trim());
        if (request.getSystemPrompt() != null) entity.setSystemPrompt(trimToNull(request.getSystemPrompt()));
        entity.setBuilderSnapshot(writeJson(request.getBuilderSnapshot()));
        entity.setReferenceSlots(writeJson(request.getReferenceSlots()));
        entity.setModelDefaults(writeJson(request.getModelDefaults()));
        entity.setTags(writeJson(request.getTags()));
        return entity;
    }

    private PromptTemplateVO toView(PromptTemplateEntity entity, String userId) {
        if (entity == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "模板不存在");
        return new PromptTemplateVO(
                entity.getId(),
                entity.getTitle(),
                entity.getDescription(),
                entity.getCoverUrl(),
                displaySource(entity.getSourceType(), entity.getVisibility()),
                entity.getCategoryCode(),
                entity.getVisibility(),
                entity.getStatus(),
                entity.getUserPromptTemplate(),
                entity.getSystemPrompt(),
                readJson(entity.getBuilderSnapshot()),
                readJson(entity.getReferenceSlots()),
                readJson(entity.getModelDefaults()),
                readJson(entity.getTags()),
                safeInt(entity.getUsageCount()),
                safeInt(entity.getFavoriteCount()),
                mapper.isFavorite(userId, entity.getId()),
                userId.equals(entity.getOwnerUserId()),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }

    private JsonNode readJson(String value) {
        if (value == null || value.isBlank()) return JsonNodeFactory.instance.nullNode();
        try { return objectMapper.readTree(value); } catch (JsonProcessingException ex) { return JsonNodeFactory.instance.nullNode(); }
    }

    private String writeJson(JsonNode value) {
        if (value == null || value.isNull()) return null;
        try { return objectMapper.writeValueAsString(value); } catch (JsonProcessingException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "模板结构格式无效", ex); }
    }

    private static String normalizeSource(String source) {
        return switch (source == null ? "all" : source.toLowerCase()) {
            case "official", "community", "mine" -> source.toLowerCase();
            default -> "all";
        };
    }

    private static String displaySource(String source, String visibility) {
        return switch (source) {
            case "official" -> "官方";
            case "community" -> "社区";
            case "personal" -> "public".equals(visibility) ? "社区" : "我的";
            default -> "我的";
        };
    }

    private static String trimToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String blankDefault(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.trim(); }
    /** 权限归一化：数据库 visibility 列只接受 public/private，其余取值按 private 处理。 */
    private static String normalizeVisibility(String value) { return "public".equalsIgnoreCase(value) ? "public" : "private"; }
    private static int safeInt(Integer value) { return value == null ? 0 : value; }
}
