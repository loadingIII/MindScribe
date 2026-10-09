package com.ms.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.pojo.dto.GenerateImageDTO;
import com.ms.pojo.vo.AttemptVO;
import com.ms.pojo.vo.CreateTaskVO;
import com.ms.pojo.vo.IterationNodeVO;
import com.ms.pojo.vo.IterationTreeVO;
import com.ms.pojo.vo.TaskVO;
import com.ms.pojo.vo.ThreadVO;
import com.ms.pojo.entity.AttemptEntity;
import com.ms.pojo.entity.ThreadEntity;
import com.ms.mapper.GenImgsMapper;
import com.ms.pojo.exception.InsufficientCreditException;
import com.ms.service.CreditService;
import com.ms.service.GenImgsService;
import com.ms.service.PricingService;
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
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentSkipListSet;

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
    private final CreditService creditService;
    private final PricingService pricingService;
    private final Map<String, List<AttemptVO>> threads = new ConcurrentHashMap<>();
    private final Set<String> missingPythonTasks = new ConcurrentSkipListSet<>();

    public GenImgsServiceImpl(HttpClientUtil http, ObjectMapper mapper, OssStorageUtil oss, GenImgsMapper genImgsMapper,
                              CreditService creditService, PricingService pricingService,
                              @Value("${image-generation.base-url}") String host,
                              @Value("${image-generation.port}") int port) {
        this.http = http;
        this.mapper = mapper;
        this.oss = oss;
        this.dbMapper = genImgsMapper;
        this.creditService = creditService;
        this.pricingService = pricingService;
        this.serviceUrl = host.replaceAll("/$", "") + ":" + port;
    }

    /** 创建一次图片生成 Attempt。 */
    private CreateTaskVO create(GenerateImageDTO request, List<String> referenceUrls) throws IOException, InterruptedException {
        if (request == null || request.getPrompt() == null || request.getPrompt().isBlank()) {
            log.warn("图片生成请求缺少 prompt");
            throw new IllegalArgumentException("prompt 不能为空");
        }
        log.info("###############\n提示词:"+request.getPrompt()+"\n###############");

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

    /** 清理本次新上传的参考图；仅删除 create 失败时产生的孤儿对象，删除失败不影响主流程。 */
    private void cleanupReferenceUrls(List<String> referenceUrls) {
        if (referenceUrls == null) return;
        for (String url : referenceUrls) oss.deleteQuietly(url);
        referenceUrls.clear();
    }

    /** 查询单个 Python 任务。 */
    private TaskVO getTask(String taskId) throws IOException, InterruptedException {
        log.debug("查询远程图片任务，taskId={}", taskId);
        var response = http.getAllowNotFound(serviceUrl + "/tasks/" + taskId);
        if (response.statusCode() == 404) {
            return null;
        }
        if (response.statusCode() >= 400) {
            throw new IOException("图片生成服务返回 HTTP " + response.statusCode() + ": " + response.body());
        }
        return mapper.readValue(response.body(), TaskVO.class);
    }

    /** 创建 Thread，并记录首个 Attempt；提交前预扣积分，扣费后任何环节失败都当场返还。 */
    public ThreadVO createThread(String userId, GenerateImageDTO request) throws IOException, InterruptedException {
        String threadId = UUID.randomUUID().toString();
        log.info("开始创建图片线程，threadId={} userId={}", threadId, userId);
        // 参考图上传发生在扣费前，为避免失败残留孤儿文件，后续任何一步失败都要清理本次新上传的对象。
        List<String> referenceUrls = new ArrayList<>();
        // 预生成 attemptId：积分流水要在 Attempt 落库前就能关联它。
        String attemptId = UUID.randomUUID().toString();
        try {
            // 计价与预扣放在上传之后：余额不足时抛异常并清理已上传的参考图。
            int cost = quote(userId, request, attemptId);
            // 从预扣成功起到 Attempt 落库为止，任何一步失败都必须当场返还，
            // 否则会留下只有 consume 流水、没有 Attempt 行的"孤儿扣费"。
            AttemptVO attempt = submitAttempt(request, referenceUrls, attemptId);
            ThreadEntity thread = toThread(threadId, userId, request, referenceUrls);
            dbMapper.insertThread(thread);
            dbMapper.insertAttempt(toAttempt(attempt, request, threadId, 1));
            List<AttemptVO> attempts = new ArrayList<>();
            attempts.add(attempt);
            threads.put(threadId, attempts);
            log.info("图片线程创建成功，threadId={} attempts={} cost={}", threadId, attempts.size(), cost);
            return new ThreadVO(threadId, attempts);
        } catch (IOException | InterruptedException | RuntimeException e) {
            // 扣费已发生才需要返还；未扣费（如余额不足）时 refund 会因无 consume 流水自动跳过。
            creditService.refund(userId, attemptId, "任务创建失败返还");
            cleanupReferenceUrls(referenceUrls);
            throw e;
        }
    }

    /** 重试时追加 Attempt，保留历史尝试；每次重试独立计价预扣。 */
    public ThreadVO retry(String userId, String threadId, GenerateImageDTO request) throws IOException, InterruptedException {
        requireThreadOwner(userId, threadId);
        // 每次重试都从 MySQL 读取历史，避免进程内缓存成为业务状态来源。
        List<AttemptEntity> stored = dbMapper.findAttemptsByThread(threadId, 1000000, 0);
        if (stored == null || stored.isEmpty()) {
            log.warn("重试失败，线程不存在，threadId={}", threadId);
            throw new IllegalArgumentException("Thread 不存在: " + threadId);
        }
        // 迭代生成：校验父 Attempt 属于当前 Thread 且已完成，成功后新 Attempt 挂到父节点下形成分支。
        String parentAttemptId = request.getParentAttemptId();
        if (parentAttemptId != null && !parentAttemptId.isBlank()) {
            AttemptEntity parent = dbMapper.findAttempt(parentAttemptId);
            if (parent == null || !threadId.equals(parent.getThreadId())) {
                throw new IllegalArgumentException("父迭代节点不存在或不属于当前任务");
            }
            if (!"succeeded".equals(parent.getStatus())) {
                throw new IllegalArgumentException("父迭代节点尚未完成，无法基于它继续迭代");
            }
        }
        List<AttemptVO> attempts = new ArrayList<>();
        for (AttemptEntity item : stored) attempts.add(toAttemptVO(item, parseResultUrls(item.getResults())));
        Collections.reverse(attempts);
        List<String> referenceUrls = new ArrayList<>();
        // 预生成 attemptId；计价预扣与提交、落库一并纳入保护，失败时返还并清理新上传参考图。
        String attemptId = UUID.randomUUID().toString();
        try {
            int cost = quote(userId, request, attemptId);
            AttemptVO attempt = submitAttempt(request, referenceUrls, attemptId);
            // 序号采用乐观分配：并发重试撞 uk_attempt_thread_no 唯一键时重读计数再插。
            int attemptNo = insertAttemptWithRetry(threadId, attempt, request);
            // 用空实体只更新目标字段：findThread 带回的 attemptCount 是旧值，
            // 整体回写会把刚自增的计数覆盖回去，并发下造成序号回退。
            ThreadEntity patch = new ThreadEntity();
            patch.setId(threadId);
            patch.setStatus("pending");
            if (!referenceUrls.isEmpty()) {
                ThreadEntity thread = dbMapper.findThread(threadId);
                if (thread != null) {
                    // 失败重试上传的新参考图需要写回 Thread，后续成功重试才能只复用 URL。
                    patch.setReferenceImages(mergeReferenceImages(thread.getReferenceImages(), referenceUrls));
                }
            }
            dbMapper.updateThread(patch);
            attempts.add(attempt);
            log.info("重试提交成功，threadId={} attemptNo={} parentNode={} cost={}", threadId, attemptNo, parentAttemptId, cost);
            return new ThreadVO(threadId, attempts);
        } catch (IOException | InterruptedException | RuntimeException e) {
            // 扣费已发生才需要返还；未扣费（如余额不足）时 refund 会因无 consume 流水自动跳过。
            creditService.refund(userId, attemptId, "任务重试失败返还");
            cleanupReferenceUrls(referenceUrls);
            throw e;
        }
    }

    /**
     * 乐观分配 Attempt 序号并落库：读 attempt_count + 1 后插入，唯一键冲突说明
     * 并发重试抢先占号，重读计数再试（最多 3 次）。插入成功后原子自增计数，
     * 保证计数只增不减，后续重试不会再算出已占用的序号。
     */
    private int insertAttemptWithRetry(String threadId, AttemptVO attempt, GenerateImageDTO request) {
        org.springframework.dao.DuplicateKeyException lastConflict = null;
        for (int round = 0; round < 3; round++) {
            ThreadEntity thread = dbMapper.findThread(threadId);
            int attemptNo = (thread == null || thread.getAttemptCount() == null) ? 1 : thread.getAttemptCount() + 1;
            try {
                dbMapper.insertAttempt(toAttempt(attempt, request, threadId, attemptNo));
                dbMapper.incrementAttemptCount(threadId);
                return attemptNo;
            } catch (org.springframework.dao.DuplicateKeyException e) {
                lastConflict = e;
                log.info("Attempt 序号冲突，重读后重试，threadId={} round={}", threadId, round + 1);
            }
        }
        throw lastConflict;
    }

    /** 合并已保存的参考图与本次重试新上传的 URL。 */
    private String mergeReferenceImages(String existing, List<String> additions) throws IOException {
        List<Map<String, Object>> references = new ArrayList<>();
        if (existing != null && !existing.isBlank()) {
            try {
                List<?> stored = mapper.readValue(existing, List.class);
                for (Object item : stored) {
                    if (item instanceof Map<?, ?> map) {
                        Map<String, Object> reference = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> entry : map.entrySet()) {
                            if (entry.getKey() != null) {
                                reference.put(String.valueOf(entry.getKey()), entry.getValue());
                            }
                        }
                        references.add(reference);
                    }
                }
            } catch (IOException | RuntimeException ignored) {
                log.warn("Thread 参考图记录格式异常，将仅保存本次 URL");
            }
        }
        for (String url : additions) {
            Map<String, Object> reference = new LinkedHashMap<>();
            reference.put("url", url);
            reference.put("filename", "reference-" + (references.size() + 1));
            reference.put("mimeType", "image/*");
            references.add(reference);
        }
        return mapper.writeValueAsString(references);
    }

    /** 轮询并刷新 Thread 下所有 Attempt 的状态。 */
    public ThreadVO getThread(String userId, String threadId) throws IOException {
        requireThreadOwner(userId, threadId);
        // MySQL 是 Thread/Attempt 的最终事实来源；内存只用于减少对象重建，不保存业务状态。
        List<AttemptEntity> stored = dbMapper.findAttemptsByThread(threadId, 1000000, 0);
        if (stored == null || stored.isEmpty()) throw new IllegalArgumentException("Thread 不存在: " + threadId);
        List<AttemptVO> attempts = new ArrayList<>();
        for (AttemptEntity item : stored) {
            attempts.add(toAttemptVO(item, parseResultUrls(item.getResults())));
        }
        Collections.reverse(attempts);
        List<AttemptVO> refreshed = new ArrayList<>();
        for (AttemptVO attempt : attempts) {
            // 终态记录直接返回 MySQL，不再重复请求 Python。
            if ((!PENDING.equals(attempt.status()) && !"running".equals(attempt.status()))
                    || attempt.taskId() == null || missingPythonTasks.contains(attempt.taskId())) {
                refreshed.add(attempt);
                continue;
            }
            try {
                TaskVO task = getTask(attempt.taskId());
                if (task == null) {
                    // Python 重启后历史任务可能已被清理，保留 Java 侧历史记录即可。
                    missingPythonTasks.add(attempt.taskId());
                    refreshed.add(attempt);
                    continue;
                }
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
                    attempt.outputFormat(),
                    attempt.parentAttemptId()
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
                    // 首次观察到 failed 终态时返还预扣积分；幂等由流水唯一键保证。
                    if ("failed".equals(task.status())) {
                        creditService.refund(userId, attempt.attemptId(), "生成失败返还");
                    }
                }
                List<Map<String, Object>> resultImages = new ArrayList<>();
                List<String> urls = normalizedUrls;
                for (int i = 0; i < urls.size(); i++) { Map<String, Object> image = new LinkedHashMap<>(); image.put("url", urls.get(i)); image.put("mimeType", IMAGE_MIME_TYPE); image.put("sortOrder", i + 1); resultImages.add(image); }
                update.setResults(mapper.writeValueAsString(resultImages));
                update.setErrorMessage(task.error()); update.setExternalTaskId(task.taskId());
                dbMapper.updateAttempt(update);
            } catch (Exception e) {
                // Python 暂时不可用时直接返回本次从 MySQL 读取的记录。
                log.warn("刷新任务状态失败，threadId={} taskId={}，保留数据库状态", threadId, attempt.taskId(), e);
                refreshed.add(attempt);
            }
        }
        threads.put(threadId, refreshed);
        AttemptVO latest = refreshed.isEmpty() ? null : refreshed.get(refreshed.size() - 1);
        if (latest != null) {
            ThreadEntity updateThread = new ThreadEntity(); updateThread.setId(threadId); updateThread.setStatus(latest.status());
            dbMapper.updateThread(updateThread);
        }
        return new ThreadVO(threadId, refreshed);
    }

    /** 提交 Python 任务并构造 Attempt VO；attemptId 由外部预生成，供积分流水提前关联。 */
    private AttemptVO submitAttempt(GenerateImageDTO request, List<String> referenceUrls, String attemptId) throws IOException, InterruptedException {
        CreateTaskVO task = create(request, referenceUrls);
        return new AttemptVO(
            attemptId,
            task.taskId(),
            PENDING,
            List.of(),
            null,
            request.getPrompt(),
            request.getModel(),
            request.getSize(),
            request.getQuality(),
            request.getOutputFormat(),
            request.getParentAttemptId()
        );
    }

    /** 计价并预扣积分；模式的判定与 Attempt 落库保持一致（有参考图即图生图）。 */
    private int quote(String userId, GenerateImageDTO request, String attemptId) {
        String mode = referenceImageCount(request) > 0 ? PricingService.MODE_IMAGE_TO_IMAGE : PricingService.MODE_TEXT_TO_IMAGE;
        int n = request.getN() == null ? 1 : request.getN();
        int cost = pricingService.quote(PricingService.ACTION_IMAGE_GENERATION, request.getModel(), mode,
                request.getSize(), request.getQuality(), n);
        creditService.deduct(userId, attemptId, cost);
        return cost;
    }

    @Override
    public List<ThreadEntity> findThreads(String userId, int page, int size) {
        int safeSize = normalizePageSize(size);
        List<ThreadEntity> result = dbMapper.findThreadsByUser(userId, safeSize, normalizePage(page) * safeSize);
        log.debug("查询用户线程完成，userId={} count={}", userId, result == null ? 0 : result.size());
        return result;
    }

    @Override
    public List<AttemptEntity> findAttempts(String userId, String threadId, int page, int size) {
        requireThreadOwner(userId, threadId);
        int safeSize = normalizePageSize(size);
        List<AttemptEntity> result = dbMapper.findAttemptsByThread(threadId, safeSize, normalizePage(page) * safeSize);
        log.debug("查询线程尝试完成，threadId={} count={}", threadId, result == null ? 0 : result.size());
        return result;
    }

    @Override
    public int renameThread(String userId, String threadId, String title) {
        requireThreadOwner(userId, threadId);
        // 仅白名单更新 title；status/attemptCount 等字段对客户端永远只读，
        // 防止篡改状态后被兜底任务误判为僵死而错误返还积分。
        ThreadEntity update = new ThreadEntity();
        update.setId(threadId);
        update.setTitle(title);
        int updated = dbMapper.updateThread(update);
        if (updated == 0) log.warn("线程重命名未命中记录，threadId={}", threadId);
        return updated;
    }

    /**
     * 构建指定 Thread 的迭代树：根节点是虚拟的"原图"节点（用户上传的参考图），
     * 无父节点关系的 Attempt（首次生成与历史重试）都作为根的直接子节点，
     * 迭代生成的 Attempt 按 parent_attempt_id 挂到对应父节点下。
     */
    @Override
    public IterationTreeVO getIterationTree(String userId, String threadId) throws IOException {
        requireThreadOwner(userId, threadId);
        ThreadEntity thread = dbMapper.findThread(threadId);
        // 按序号正序读取全部 Attempt；attempt_no=1 的即为首次生成。
        List<AttemptEntity> stored = dbMapper.findAttemptsByThread(threadId, 1000000, 0);
        if (stored == null || stored.isEmpty()) throw new IllegalArgumentException("Thread 不存在: " + threadId);
        // 结果按 attempt_no 倒序返回，先反转成创建正序再构建树。
        Collections.reverse(stored);
        Map<String, AttemptEntity> byId = new LinkedHashMap<>();
        for (AttemptEntity item : stored) byId.put(item.getId(), item);

        // 一次遍历建立父子索引；孤儿节点（父 Attempt 已被清理）回挂到根，保证树完整可达。
        Map<String, List<AttemptEntity>> children = new LinkedHashMap<>();
        List<AttemptEntity> rootChildren = new ArrayList<>();
        for (AttemptEntity item : stored) {
            String parent = item.getParentAttemptId();
            if (parent == null || parent.isBlank() || !byId.containsKey(parent)) {
                rootChildren.add(item);
            } else {
                children.computeIfAbsent(parent, key -> new ArrayList<>()).add(item);
            }
        }

        // 虚拟根节点：展示用户上传的原图，所有无父节点的 Attempt 都是它的子节点。
        List<IterationNodeVO> nodes = new ArrayList<>();
        List<String> rootChildIds = new ArrayList<>();
        for (AttemptEntity child : rootChildren) rootChildIds.add(child.getId());
        nodes.add(new IterationNodeVO(
                ROOT_NODE_ID, null, "原图", firstReferenceImage(thread),
                null, rootChildIds, null, null, null, null, null,
                "succeeded", thread == null ? null : String.valueOf(thread.getCreatedAt()),
                0, "initial", parseReferenceUrls(thread)
        ));
        for (AttemptEntity child : rootChildren) {
            buildTreeNodes(child, children, 1, nodes);
        }
        AttemptEntity latest = stored.get(stored.size() - 1);
        return new IterationTreeVO(threadId, thread == null ? "" : thread.getTitle(), ROOT_NODE_ID, latest.getId(), nodes);
    }

    /** 虚拟根节点（原图）的固定 ID，前端据此区分根与生成节点。 */
    private static final String ROOT_NODE_ID = "root";

    /** 递归展开迭代树：子节点按创建时间排列，深度从原图下第一层的 1 开始累加。 */
    private void buildTreeNodes(AttemptEntity node, Map<String, List<AttemptEntity>> children, int depth, List<IterationNodeVO> output) {
        List<AttemptEntity> nodeChildren = children.getOrDefault(node.getId(), List.of());
        List<String> childIds = new ArrayList<>();
        for (AttemptEntity child : nodeChildren) childIds.add(child.getId());
        output.add(toIterationNode(node, depth, childIds));
        for (AttemptEntity child : nodeChildren) {
            buildTreeNodes(child, children, depth + 1, output);
        }
    }

    /** 将 Attempt 数据库实体映射为迭代树节点 VO。 */
    private IterationNodeVO toIterationNode(AttemptEntity item, int depth, List<String> childIds) {
        List<String> urls = parseResultUrls(item.getResults());
        String imageUrl = urls.isEmpty() ? "" : urls.get(0);
        return new IterationNodeVO(
                item.getId(),
                item.getId(),
                "#" + String.format("%02d", item.getAttemptNo() == null ? 0 : item.getAttemptNo()),
                imageUrl,
                item.getParentAttemptId(),
                childIds,
                item.getPrompt(),
                null,
                item.getModelName(),
                item.getSize(),
                item.getQuality(),
                item.getStatus(),
                item.getCreatedAt() == null ? null : item.getCreatedAt().toString(),
                depth,
                item.getParentAttemptId() == null || item.getParentAttemptId().isBlank() ? "initial" : "refine",
                List.of()
        );
    }

    /** 读取 Thread 的第一张原图地址，用于虚拟根节点展示；无参考图时返回空串。 */
    private String firstReferenceImage(ThreadEntity thread) {
        List<String> urls = parseReferenceUrls(thread);
        return urls.isEmpty() ? "" : urls.get(0);
    }

    /** 从 Thread 的 reference_images JSON 中恢复原图地址列表；解析失败返回空列表。 */
    private List<String> parseReferenceUrls(ThreadEntity thread) {
        if (thread == null || thread.getReferenceImages() == null || thread.getReferenceImages().isBlank()) {
            return List.of();
        }
        try {
            List<?> stored = mapper.readValue(thread.getReferenceImages(), List.class);
            List<String> urls = new ArrayList<>();
            for (Object item : stored) {
                if (item instanceof Map<?, ?> map && map.get("url") != null) {
                    urls.add(String.valueOf(map.get("url")));
                } else if (item instanceof String value && !value.isBlank()) {
                    urls.add(value);
                }
            }
            return urls;
        } catch (IOException | RuntimeException e) {
            log.warn("Thread 参考图记录格式异常，原图节点无图可展示，threadId={}", thread.getId());
            return List.of();
        }
    }

    /** 校验 Attempt 属主并返回其所属 Thread ID，供基于节点的迭代入口反查归属。 */
    @Override
    public String resolveThreadIdByAttempt(String userId, String attemptId) {
        AttemptEntity attempt = attemptId == null ? null : dbMapper.findAttempt(attemptId);
        if (attempt == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "迭代节点不存在");
        }
        // 复用 Thread 属主校验：父节点所属 Thread 必须属于当前用户。
        requireThreadOwner(userId, attempt.getThreadId());
        return attempt.getThreadId();
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

    /** 校验 Thread 属于当前 JWT 用户，避免仅凭 ID 访问他人数据。 */
    private void requireThreadOwner(String userId, String threadId) {
        ThreadEntity thread = threadId == null ? null : dbMapper.findThread(threadId);
        if (thread == null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Thread 不存在");
        if (userId == null || !userId.equals(thread.getUserId())) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "无权访问该 Thread");
        }
    }

    /** 统一限制分页参数，避免异常值造成超大查询。 */
    private static int normalizePage(int page) { return Math.max(page, 0); }
    private static int normalizePageSize(int size) { return Math.max(1, Math.min(size, 50)); }

    private AttemptEntity toAttempt(AttemptVO source, GenerateImageDTO request, String threadId, int number) {
        AttemptEntity attempt = new AttemptEntity(); attempt.setId(source.attemptId()); attempt.setThreadId(threadId);
        attempt.setAttemptNo(number); attempt.setStatus(source.status()); attempt.setModelName(request.getModel());
        // prompt 字段存完整的结构化提示词 JSON，保留系统提示词与标签，便于后续按原始指令复现。
        attempt.setPrompt(request.getPrompt());
        attempt.setSize(request.getSize()); attempt.setQuality(request.getQuality()); attempt.setOutputFormat(request.getOutputFormat());
        attempt.setRequestedCount(request.getN() == null ? 1 : request.getN()); attempt.setResults("[]");
        // Java 根据最终提交的参考图数量决定生成模式，避免前端值与实际数据不一致。
        attempt.setMode(referenceImageCount(request) > 0 ? "image-to-image" : "text-to-image");
        // 迭代生成时记录父 Attempt，构建迭代树；普通重试该值为 null。
        attempt.setParentAttemptId(request.getParentAttemptId());
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

    /** 将数据库 Attempt 映射为轮询接口使用的响应对象，保留可回填的生成参数与迭代父节点。 */
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
            source.getOutputFormat(),
            source.getParentAttemptId()
        );
    }

    /** 从 MySQL 的 results JSON 中恢复生成图片地址。 */
    private List<String> parseResultUrls(String results) {
        if (results == null || results.isBlank()) return List.of();
        try {
            List<Map<String, Object>> images = mapper.readValue(results, List.class);
            List<String> urls = new ArrayList<>();
            for (Map<String, Object> image : images) {
                Object url = image.get("url");
                if (url != null && !String.valueOf(url).isBlank()) urls.add(normalizeImageUrl(String.valueOf(url)));
            }
            return urls;
        } catch (IOException | RuntimeException e) {
            log.warn("Attempt 结果记录格式异常，忽略无法解析的图片地址");
            return List.of();
        }
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
