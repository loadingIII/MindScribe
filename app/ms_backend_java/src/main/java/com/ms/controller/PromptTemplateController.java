package com.ms.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ms.pojo.dto.PromptTemplateRequest;
import com.ms.pojo.vo.PromptTemplateVO;
import com.ms.service.PromptTemplateService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** 提示词模板的增删改查、收藏和使用接口。 */
@RestController
@RequestMapping("/prompt_templates")
public class PromptTemplateController {
    private final PromptTemplateService service;

    public PromptTemplateController(PromptTemplateService service) { this.service = service; }

    @GetMapping
    public List<PromptTemplateVO> list(HttpServletRequest request,
            @RequestParam(defaultValue = "all") String source,
            @RequestParam(defaultValue = "") String category,
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.list(currentUserId(request), source, category, keyword, page, size);
    }

    @GetMapping("/{id}")
    public PromptTemplateVO get(@PathVariable String id, HttpServletRequest request) {
        return service.get(currentUserId(request), id);
    }

    @PostMapping
    public PromptTemplateVO create(@Valid @RequestBody PromptTemplateRequest body, HttpServletRequest request) {
        return service.create(currentUserId(request), body);
    }

    /** 更新模板封面：只接收图片文件，上传 OSS 后仅覆盖 cover_url 字段。 */
    @PostMapping(value = "/{id}/cover", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PromptTemplateVO updateCover(@PathVariable String id,
            @RequestPart("cover") MultipartFile cover, HttpServletRequest request) {
        try {
            return service.updateCover(currentUserId(request), id, cover);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "封面上传失败，请稍后重试", exception);
        }
    }

    @PutMapping("/{id}")
    public PromptTemplateVO update(@PathVariable String id, @Valid @RequestBody PromptTemplateRequest body, HttpServletRequest request) {
        return service.update(currentUserId(request), id, body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, HttpServletRequest request) {
        service.delete(currentUserId(request), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/favorite")
    public PromptTemplateVO favorite(@PathVariable String id, @RequestParam boolean saved, HttpServletRequest request) {
        return service.favorite(currentUserId(request), id, saved);
    }

    @PostMapping("/{id}/use")
    public ResponseEntity<Void> use(@PathVariable String id, @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
        service.use(currentUserId(request), id, body);
        return ResponseEntity.noContent().build();
    }

    private String currentUserId(HttpServletRequest request) {
        Object userId = request.getAttribute("userId");
        if (!(userId instanceof String value) || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
        return value;
    }
}
