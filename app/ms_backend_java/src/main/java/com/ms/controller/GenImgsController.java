package com.ms.controller;

import com.ms.service.GenImgsService;
import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import com.ms.utils.LogUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/gen_imgs")
public class GenImgsController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(GenImgsController.class);
    private final GenImgsService service;

    public GenImgsController(GenImgsService service) { this.service = service; }

    /** 创建 Thread，并自动创建首个 Attempt。 */
    @PostMapping(value = "/threads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ThreadVO> createThread(
            HttpServletRequest servletRequest,
            @ModelAttribute GenerateImageDTO request) throws IOException, InterruptedException {
        String userId = currentUserId(servletRequest);
        log.info("创建图片线程，userId={}", userId);
        return ResponseEntity.accepted().body(service.createThread(userId, request));
    }

    /** 对 Thread 执行重试，每次重试新增一个 Attempt。 */
    @PostMapping(value = "/threads/{threadId}/attempts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ThreadVO> retry(
            @PathVariable String threadId,
            HttpServletRequest servletRequest,
            @ModelAttribute GenerateImageDTO request) throws IOException, InterruptedException {
        log.info("重试图片线程，threadId={}", threadId);
        return ResponseEntity.accepted().body(service.retry(currentUserId(servletRequest), threadId, request));
    }

    /** 查询 Thread 及其全部 Attempt 状态。 */
    @GetMapping("/threads/{threadId}")
    public ResponseEntity<ThreadVO> getThread(
            @PathVariable String threadId,
            HttpServletRequest servletRequest) throws IOException {
        log.debug("查询图片线程，threadId={}", threadId);
        return ResponseEntity.ok(service.getThread(currentUserId(servletRequest), threadId));
    }

    /** 按用户倒序查询 Thread。 */
    @GetMapping("/threads")
    public List<ThreadEntity> findThreads(
            HttpServletRequest servletRequest,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        String userId = currentUserId(servletRequest);
        log.debug("查询用户线程，userId={} page={} size={}", userId, page, size);
        return service.findThreads(userId, page, size);
    }

    /** 按 Thread 倒序查询 Attempt。 */
    @GetMapping("/threads/{threadId}/attempts")
    public List<AttemptEntity> findAttempts(
            @PathVariable String threadId,
            HttpServletRequest servletRequest,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        log.debug("查询线程尝试，threadId={} page={} size={}", threadId, page, size);
        return service.findAttempts(currentUserId(servletRequest), threadId, page, size);
    }

    /** 重命名 Thread：客户端唯一允许的写操作，状态机字段不对外开放。 */
    @PatchMapping("/threads/{threadId}")
    public Map<String, Object> renameThread(
            @PathVariable String threadId,
            HttpServletRequest servletRequest,
            @jakarta.validation.Valid @RequestBody com.ms.pojo.dto.RenameThreadRequest request) {
        service.renameThread(currentUserId(servletRequest), threadId, request.title().trim());
        log.info("重命名线程成功，threadId={}", threadId);
        return Map.of("id", threadId, "title", request.title().trim());
    }

    /** JWT 拦截器已完成认证，这里只读取其写入的用户 ID。 */
    private String currentUserId(HttpServletRequest request) {
        Object userId = request.getAttribute("userId");
        if (!(userId instanceof String value) || value.isBlank()){
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "请先登录");
        }
        return value;
    }
}
