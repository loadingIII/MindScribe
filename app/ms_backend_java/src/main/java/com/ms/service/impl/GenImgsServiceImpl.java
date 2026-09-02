package com.ms.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.AttemptVO;
import com.ms.pojo.vo.CreateTaskVO;
import com.ms.pojo.vo.TaskVO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import com.ms.mapper.GenImgsMapper;
import com.ms.service.GenImgsService;
import com.ms.utils.HttpClientUtil;
import com.ms.utils.OssStorageUtil;
import com.ms.utils.LogUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;

/** 图片生成业务：负责 DTO 转换、任务提交及结果反序列化。 */
@Service
public class GenImgsServiceImpl implements GenImgsService {
    private static final String PENDING = "pending";
    private static final String REFERENCE_IMAGES_DIR = "reference-images";
    private static final String REFERENCE_URL_FIELD = "reference_image_urls";
    private static final String IMAGE_MIME_TYPE = "image/png";
    private static final org.slf4j.Logger log = LogUtil.getLogger(GenImgsServiceImpl.class);
    private final HttpClientUtil http;
    private final ObjectMapper mapper;
    private final String serviceUrl;
    private final OssStorageUtil oss;
    private final GenImgsMapper dbMapper;
    private final StringRedisTemplate redis;
    private final Map<String, List<AttemptVO>> threads = new ConcurrentHashMap<>();

    public GenImgsServiceImpl(HttpClientUtil http, ObjectMapper mapper, OssStorageUtil oss, GenImgsMapper genImgsMapper, StringRedisTemplate redis,
                              @Value("${image-generation.base-url}") String host,
                              @Value("${image-generation.port}") int port) {
        this.http = http;
        this.mapper = mapper;
        this.oss = oss;
        this.dbMapper = genImgsMapper;
        this.redis = redis;
        this.serviceUrl = host.replaceAll("/$", "") + ":" + port;
    }

    /** 创建一次图片生成 Attempt。 */
    private CreateTaskVO create(GenerateImageDTO request, List<String> referenceUrls) throws IOException, InterruptedException {
        if (request == null || request.getPrompt() == null || request.getPrompt().isBlank()) {
            log.warn("图片生成请求缺少 prompt");
            throw new IllegalArgumentException("prompt 不能为空");
        }
        List<HttpClientUtil.Part> parts = new ArrayList<>();
        parts.add(HttpClientUtil.Part.text("prompt", request.getPrompt()));
        add(parts, "model", request.getModel());
        add(parts, "size", request.getSize());
        add(parts, "quality", request.getQuality());
        add(parts, "output_format", request.getOutputFormat());
        if (request.getN() != null) add(parts, "n", request.getN().toString());
        for (String referenceUrl : request.getReferenceImageUrls() == null ? List.<String>of() : request.getReferenceImageUrls()) {
            if (referenceUrl != null && !referenceUrl.isBlank()) parts.add(HttpClientUtil.Part.text(REFERENCE_URL_FIELD, referenceUrl));
        }
        for (MultipartFile file : request.getReferenceImages() == null ? List.<MultipartFile>of() : request.getReferenceImages()) {
            // 参考图统一存放在 reference-images 日期目录下。
            String referenceUrl = oss.upload(file, REFERENCE_IMAGES_DIR);
            referenceUrls.add(referenceUrl);
            parts.add(HttpClientUtil.Part.text(REFERENCE_URL_FIELD, referenceUrl));
        }
        try {
            CreateTaskVO task = mapper.readValue(http.postForm(serviceUrl + "/generate", parts).body(), CreateTaskVO.class);
            log.info("图片生成任务提交成功，taskId={}", task.taskId());
            return task;
        } catch (IOException | InterruptedException | RuntimeException e) {
            log.error("图片生成任务提交失败，serviceUrl={}", serviceUrl, e);
            throw e;
        }
    }

    /** 查询单个 Python 任务。 */
    private TaskVO getTask(String taskId) throws IOException, InterruptedException {
        log.debug("查询远程图片任务，taskId={}", taskId);
        return mapper.readValue(http.get(serviceUrl + "/tasks/" + taskId).body(), TaskVO.class);
    }

    /** 创建 Thread，并记录首个 Attempt。 */
    public ThreadVO createThread(String userId, GenerateImageDTO request) throws IOException, InterruptedException {
        String threadId = UUID.randomUUID().toString();
        log.info("开始创建图片线程，threadId={} userId={}", threadId, userId);
        List<String> referenceUrls = new ArrayList<>();
        AttemptVO attempt = submitAttempt(request, referenceUrls);
        ThreadEntity thread = toThread(threadId, userId, request, referenceUrls);
        dbMapper.insertThread(thread);
        dbMapper.insertAttempt(toAttempt(attempt, request, threadId, 1));
        saveAttemptSnapshot(threadId, attempt);
        List<AttemptVO> attempts = new ArrayList<>();
        attempts.add(attempt);
        threads.put(threadId, attempts);
        log.info("图片线程创建成功，threadId={} attempts={}", threadId, attempts.size());
        return new ThreadVO(threadId, attempts);
    }

    /** 重试时追加 Attempt，保留历史尝试。 */
    public ThreadVO retry(String threadId, GenerateImageDTO request) throws IOException, InterruptedException {
        List<AttemptVO> attempts = threads.get(threadId);
        if (attempts == null) {
            log.warn("重试失败，线程不存在，threadId={}", threadId);
            throw new IllegalArgumentException("Thread 不存在: " + threadId);
        }
        attempts.add(submitAttempt(request, new ArrayList<>()));
        AttemptVO attempt = attempts.get(attempts.size() - 1);
        ThreadEntity thread = dbMapper.findThread(threadId);
        int attemptNo = thread == null ? attempts.size() : thread.getAttemptCount() + 1;
        dbMapper.insertAttempt(toAttempt(attempt, request, threadId, attemptNo));
        saveAttemptSnapshot(threadId, attempt);
        if (thread != null) { thread.setStatus("pending"); thread.setAttemptCount(attemptNo); dbMapper.updateThread(thread); }
        return new ThreadVO(threadId, attempts);
    }

    /** 轮询并刷新 Thread 下所有 Attempt 的状态。 */
    public ThreadVO getThread(String threadId) throws IOException {
        List<AttemptVO> attempts = threads.get(threadId);
        if (attempts == null) {
            // 服务重启后从数据库恢复外部任务 ID，避免只能查询内存任务。
            List<AttemptEntity> stored = dbMapper.findAttemptsByThread(threadId);
            if (stored == null || stored.isEmpty()) throw new IllegalArgumentException("Thread 不存在: " + threadId);
            attempts = new ArrayList<>();
            for (AttemptEntity item : stored) {
                attempts.add(toAttemptVO(item, List.of()));
            }
            threads.put(threadId, attempts);
        }
        List<AttemptVO> refreshed = new ArrayList<>();
        for (AttemptVO attempt : attempts) {
            try {
                TaskVO task = getTask(attempt.taskId());
                List<String> normalizedUrls = (task.imageUrls() == null ? List.<String>of() : task.imageUrls()).stream().map(GenImgsServiceImpl::normalizeImageUrl).toList();
                refreshed.add(new AttemptVO(
                    attempt.attemptId(),
                    task.taskId(),
                    task.status(),
                    normalizedUrls,
                    task.error(),
                    attempt.prompt(),
                    attempt.modelName(),
                    attempt.size(),
                    attempt.quality(),
                    attempt.outputFormat()
                ));
                AttemptEntity update = new AttemptEntity();
                update.setId(attempt.attemptId()); update.setStatus(task.status());
                // 只在状态首次进入运行或终态时补时间，避免轮询覆盖原始时间。
                if ("running".equals(task.status()) && !"running".equals(attempt.status())) {
                    update.setStartedAt(LocalDateTime.now());
                }
                if (("succeeded".equals(task.status()) || "failed".equals(task.status()))
                        && !"succeeded".equals(attempt.status()) && !"failed".equals(attempt.status())) {
                    LocalDateTime finishedAt = LocalDateTime.now();
                    update.setFinishedAt(finishedAt);
                    // 任务可能在首次轮询前就已结束，此时同时补齐开始时间。
                    if (!"running".equals(attempt.status())) {
                        update.setStartedAt(finishedAt);
                    }
                }
                List<Map<String, Object>> resultImages = new ArrayList<>();
                List<String> urls = normalizedUrls;
                for (int i = 0; i < urls.size(); i++) { Map<String, Object> image = new LinkedHashMap<>(); image.put("url", urls.get(i)); image.put("mimeType", IMAGE_MIME_TYPE); image.put("sortOrder", i + 1); resultImages.add(image); }
                update.setResults(mapper.writeValueAsString(resultImages));
                update.setErrorMessage(task.error()); update.setExternalTaskId(task.taskId());
                dbMapper.updateAttempt(update);
                saveAttemptSnapshot(threadId, refreshed.get(refreshed.size() - 1));
            } catch (Exception e) {
                AttemptVO snapshot = readAttemptSnapshot(attempt);
                if (snapshot != null) {
                    refreshed.add(snapshot);
                    continue;
                }
                log.warn("刷新任务状态失败，threadId={} taskId={}", threadId, attempt.taskId(), e);
                refreshed.add(attempt);
            }
        }
        attempts.clear();
        attempts.addAll(refreshed);
        AttemptVO latest = refreshed.isEmpty() ? null : refreshed.get(refreshed.size() - 1);
        if (latest != null) {
            ThreadEntity updateThread = new ThreadEntity(); updateThread.setId(threadId); updateThread.setStatus(latest.status());
            dbMapper.updateThread(updateThread);
        }
        return new ThreadVO(threadId, attempts);
    }

    private AttemptVO submitAttempt(GenerateImageDTO request, List<String> referenceUrls) throws IOException, InterruptedException {
        CreateTaskVO task = create(request, referenceUrls);
        return new AttemptVO(
            UUID.randomUUID().toString(),
            task.taskId(),
            PENDING,
            List.of(),
            null,
            request.getPrompt(),
            request.getModel(),
            request.getSize(),
            request.getQuality(),
            request.getOutputFormat()
        );
    }

    @Override
    public List<ThreadEntity> findThreads(String userId) {
        List<ThreadEntity> result = dbMapper.findThreadsByUser(userId);
        log.debug("查询用户线程完成，userId={} count={}", userId, result == null ? 0 : result.size());
        return result;
    }

    @Override
    public List<AttemptEntity> findAttempts(String threadId) {
        List<AttemptEntity> result = dbMapper.findAttemptsByThread(threadId);
        log.debug("查询线程尝试完成，threadId={} count={}", threadId, result == null ? 0 : result.size());
        return result;
    }

    @Override
    public int updateThread(ThreadEntity thread) {
        int updated = dbMapper.updateThread(thread);
        if (updated == 0) log.warn("线程更新未命中记录，threadId={}", thread == null ? null : thread.getId());
        return updated;
    }

    @Override
    public int updateAttempt(AttemptEntity attempt) {
        int updated = dbMapper.updateAttempt(attempt);
        if (updated == 0) log.warn("尝试更新未命中记录，attemptId={}", attempt == null ? null : attempt.getId());
        return updated;
    }

    private ThreadEntity toThread(String id, String userId, GenerateImageDTO request, List<String> referenceUrls) throws IOException {
        ThreadEntity thread = new ThreadEntity(); thread.setId(id); thread.setUserId(userId);
        // 默认任务名由前端生成；未提供时统一使用 "Untitled" 占位。
        thread.setTitle(request.getTitle() == null || request.getTitle().isBlank() ? "Untitled" : request.getTitle());
        List<Map<String, Object>> references = new ArrayList<>();
        List<MultipartFile> files = request.getReferenceImages() == null ? List.of() : request.getReferenceImages();
        for (int i = 0; i < (referenceUrls == null ? 0 : referenceUrls.size()); i++) {
            Map<String, Object> reference = new LinkedHashMap<>(); reference.put("url", referenceUrls.get(i));
            String filename = i < files.size() ? files.get(i).getOriginalFilename() : null;
            String mimeType = i < files.size() ? files.get(i).getContentType() : "image/*";
            reference.put("filename", filename == null ? "reference-" + (i + 1) : filename); reference.put("mimeType", mimeType == null ? "image/*" : mimeType); references.add(reference);
        }
        thread.setReferenceImages(mapper.writeValueAsString(references));
        thread.setStatus(PENDING); thread.setAttemptCount(1); return thread;
    }

    private AttemptEntity toAttempt(AttemptVO source, GenerateImageDTO request, String threadId, int number) {
        AttemptEntity attempt = new AttemptEntity(); attempt.setId(source.attemptId()); attempt.setThreadId(threadId);
        attempt.setAttemptNo(number); attempt.setStatus(source.status()); attempt.setModelName(request.getModel());
        // prompt 字段存完整的结构化提示词 JSON，保留系统提示词与标签，便于后续按原始指令复现。
        attempt.setPrompt(request.getPrompt());
        attempt.setSize(request.getSize()); attempt.setQuality(request.getQuality()); attempt.setOutputFormat(request.getOutputFormat());
        attempt.setRequestedCount(request.getN() == null ? 1 : request.getN()); attempt.setResults("[]");
        // Java 根据最终提交的参考图数量决定生成模式，避免前端值与实际数据不一致。
        attempt.setMode(referenceImageCount(request) > 0 ? "image-to-image" : "text-to-image");
        attempt.setExternalTaskId(source.taskId()); return attempt;
    }

    /** 统计请求中最终可用的参考图，包括复用 URL 和新上传文件。 */
    private static int referenceImageCount(GenerateImageDTO request) {
        int count = 0;
        if (request.getReferenceImageUrls() != null) {
            count += (int) request.getReferenceImageUrls().stream()
                .filter(value -> value != null && !value.isBlank()).count();
        }
        if (request.getReferenceImages() != null) {
            count += (int) request.getReferenceImages().stream().filter(file -> file != null && !file.isEmpty()).count();
        }
        return count;
    }

    /** 将数据库 Attempt 映射为轮询接口使用的响应对象，保留可回填的生成参数。 */
    private static AttemptVO toAttemptVO(AttemptEntity source, List<String> imageUrls) {
        return new AttemptVO(
            source.getId(),
            source.getExternalTaskId(),
            source.getStatus(),
            imageUrls,
            source.getErrorMessage(),
            source.getPrompt(),
            source.getModelName(),
            source.getSize(),
            source.getQuality(),
            source.getOutputFormat()
        );
    }

    /** 保存 Java 侧 Attempt 快照，供远程任务暂时不可用时兜底。 */
    private void saveAttemptSnapshot(String threadId, AttemptVO attempt) {
        try {
            redis.opsForValue().set("mindscribe:java:attempt:" + attempt.attemptId(), mapper.writeValueAsString(attempt), java.time.Duration.ofDays(7));
        } catch (Exception e) { log.warn("保存 Attempt Redis 快照失败，threadId={}", threadId, e); }
    }

    /** 读取最近一次 Java 快照；只在 Python 查询失败时使用。 */
    private AttemptVO readAttemptSnapshot(AttemptVO attempt) {
        try {
            String value = redis.opsForValue().get("mindscribe:java:attempt:" + attempt.attemptId());
            return value == null ? null : mapper.readValue(value, AttemptVO.class);
        } catch (Exception e) { return null; }
    }

    private static void add(List<HttpClientUtil.Part> parts, String name, String value) {
        if (value != null && !value.isBlank()) parts.add(HttpClientUtil.Part.text(name, value));
    }

    /** 清理历史签名 URL，数据库只保存稳定、可读的对象路径。 */
    private static String normalizeImageUrl(String value) {
        if (value == null || value.isBlank()) return value;
        String path = value.split("\\?", 2)[0];
        return URLDecoder.decode(path, StandardCharsets.UTF_8);
    }
}
