package com.ms.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ms.pojo.dto.PromptTemplateRequest;
import com.ms.pojo.vo.PromptTemplateVO;
import java.io.IOException;
import java.util.List;
import org.springframework.web.multipart.MultipartFile;

/** 提示词模板业务接口。 */
public interface PromptTemplateService {
    List<PromptTemplateVO> list(String userId, String source, String category, String keyword, int page, int size);
    PromptTemplateVO get(String userId, String id);
    PromptTemplateVO create(String userId, PromptTemplateRequest request);
    PromptTemplateVO update(String userId, String id, PromptTemplateRequest request);
    /** 上传新封面并只更新 cover_url；仅模板所有者可操作。 */
    PromptTemplateVO updateCover(String userId, String id, MultipartFile cover) throws IOException;
    void delete(String userId, String id);
    PromptTemplateVO favorite(String userId, String id, boolean saved);
    void use(String userId, String id, JsonNode renderedPrompt);
}
