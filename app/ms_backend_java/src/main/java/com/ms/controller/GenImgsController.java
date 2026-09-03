package com.ms.controller;

import com.ms.service.GenImgsService;
import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import com.ms.utils.LogUtil;

@RestController
@RequestMapping("/gen_imgs")
public class GenImgsController {
    private static final org.slf4j.Logger log = LogUtil.getLogger(GenImgsController.class);
    private final GenImgsService service;

    public GenImgsController(GenImgsService service) { this.service = service; }

    /** 创建 Thread，并自动创建首个 Attempt。 */
    @PostMapping(value = "/threads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ThreadVO> createThread(jakarta.servlet.http.HttpServletRequest servletRequest, @ModelAttribute GenerateImageDTO request) throws IOException, InterruptedException {
        String userId = currentUserId(servletRequest);
        log.info("创建图片线程，userId={}", userId);
        return ResponseEntity.accepted().body(service.createThread(userId, request));
    }

    /** 对 Thread 执行重试，每次重试新增一个 Attempt。 */
    @PostMapping(value = "/threads/{threadId}/attempts", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ThreadVO> retry(@PathVariable String threadId, jakarta.servlet.http.HttpServletRequest servletRequest, @ModelAttribute GenerateImageDTO request) throws IOException, InterruptedException {
        log.info("重试图片线程，threadId={}", threadId);
        return ResponseEntity.accepted().body(service.retry(currentUserId(servletRequest), threadId, request));
    }

    /** 查询 Thread 及其全部 Attempt 状态。 */
    @GetMapping("/threads/{threadId}")
    public ResponseEntity<ThreadVO> getThread(@PathVariable String threadId, jakarta.servlet.http.HttpServletRequest servletRequest) throws IOException {
        log.debug("查询图片线程，threadId={}", threadId);
        return ResponseEntity.ok(service.getThread(currentUserId(servletRequest), threadId));
    }

    /** 按用户倒序查询 Thread。 */
    @GetMapping("/threads")
    public List<ThreadEntity> findThreads(jakarta.servlet.http.HttpServletRequest servletRequest) { String userId = currentUserId(servletRequest); log.debug("查询用户线程，userId={}", userId); return service.findThreads(userId); }

    /** 按 Thread 倒序查询 Attempt。 */
    @GetMapping("/threads/{threadId}/attempts")
    public List<AttemptEntity> findAttempts(@PathVariable String threadId, jakarta.servlet.http.HttpServletRequest servletRequest) { log.debug("查询线程尝试，threadId={}", threadId); return service.findAttempts(currentUserId(servletRequest), threadId); }

    /** 修改 Thread 的可变字段。 */
    @PatchMapping("/threads/{threadId}")
    public int updateThread(@PathVariable String threadId, jakarta.servlet.http.HttpServletRequest servletRequest, @RequestBody ThreadEntity thread) {
        log.info("更新线程，threadId={}", threadId);
        thread.setId(threadId); return service.updateThread(currentUserId(servletRequest), thread);
    }

    /** 修改 Attempt 的状态机和运行结果字段。 */
    @PatchMapping("/attempts/{attemptId}")
    public int updateAttempt(@PathVariable String attemptId, jakarta.servlet.http.HttpServletRequest servletRequest, @RequestBody AttemptEntity attempt) {
        log.info("更新尝试，attemptId={}", attemptId);
        attempt.setId(attemptId); return service.updateAttempt(currentUserId(servletRequest), attempt);
    }

    /** JWT 拦截器已完成认证，这里只读取其写入的用户 ID。 */
    private String currentUserId(jakarta.servlet.http.HttpServletRequest request) {
        Object userId = request.getAttribute("userId");
        if (!(userId instanceof String value) || value.isBlank()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "请先登录");
        return value;
    }
}
