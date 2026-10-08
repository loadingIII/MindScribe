package com.ms.service.impl;

import com.ms.mapper.ProfileMapper;
import com.ms.service.ProfileService;
import com.ms.utils.AttemptResultsUtil;
import com.ms.utils.LogUtil;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 个人中心聚合业务：组合统计、常用配置与最近作品三类查询。 */
@Service
public class ProfileServiceImpl implements ProfileService {
    private static final org.slf4j.Logger log = LogUtil.getLogger(ProfileServiceImpl.class);
    /** 作品墙数量上限，防止一次拉取过多 results JSON。 */
    private static final int MAX_GALLERY_SIZE = 20;
    /** 作品墙默认数量。 */
    private static final int DEFAULT_GALLERY_SIZE = 8;

    private final ProfileMapper profileMapper;

    public ProfileServiceImpl(ProfileMapper profileMapper) {
        this.profileMapper = profileMapper;
    }

    @Override
    /** 汇总创作统计、常用配置与最近作品；任何一段查询失败都不阻塞其余段落。 */
    public Map<String, Object> summary(String userId, Integer gallerySize) {
        int safeGallerySize = gallerySize == null ? DEFAULT_GALLERY_SIZE
                : Math.max(1, Math.min(gallerySize, MAX_GALLERY_SIZE));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stats", buildStats(userId));
        result.put("preferences", buildPreferences(userId));
        result.put("gallery", buildGallery(userId, safeGallerySize));
        return result;
    }

    /** 创作统计：attempt 次数与生成张数；MySQL SUM 返回 BigDecimal，统一转 int。 */
    private Map<String, Object> buildStats(String userId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        long totalAttempts = 0;
        long succeededCount = 0;
        long failedCount = 0;
        long totalImages = 0;
        long monthConsumed = 0;
        try {
            Map<String, Object> row = profileMapper.selectCreationStats(userId);
            if (row != null) {
                totalAttempts = asLong(row.get("totalAttempts"));
                succeededCount = asLong(row.get("succeededCount"));
                failedCount = asLong(row.get("failedCount"));
                totalImages = asLong(row.get("totalImages"));
            }
            // 本月消耗为负数合计，取绝对值对外展示。
            Long consumed = profileMapper.selectMonthConsumed(userId,
                    LocalDate.now().withDayOfMonth(1).atStartOfDay().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            monthConsumed = Math.abs(consumed == null ? 0 : consumed);
        } catch (RuntimeException ex) {
            log.warn("创作统计查询失败，返回零值兜底，userId={}", userId, ex);
        }
        stats.put("totalAttempts", totalAttempts);
        stats.put("succeededCount", succeededCount);
        stats.put("failedCount", failedCount);
        stats.put("totalImages", totalImages);
        stats.put("monthConsumed", monthConsumed);
        return stats;
    }

    /** 常用配置：成功 attempt 的模型/尺寸/模式众数；无记录时返回空对象。 */
    private Map<String, Object> buildPreferences(String userId) {
        Map<String, Object> preferences = new LinkedHashMap<>();
        try {
            Map<String, Object> row = profileMapper.selectPreferredConfig(userId);
            if (row != null) {
                preferences.put("modelName", row.get("modelName"));
                preferences.put("size", row.get("size"));
                preferences.put("mode", row.get("mode"));
            }
        } catch (RuntimeException ex) {
            log.warn("常用配置查询失败，返回空配置兜底，userId={}", userId, ex);
        }
        return preferences;
    }

    /**
     * 最近作品：解析每个成功 attempt 的 results JSON，只取第一张图；
     * results 脏数据时跳过该条（parseResultUrls 返回空列表），继续补充后续作品。
     */
    private List<Map<String, Object>> buildGallery(String userId, int limit) {
        List<Map<String, Object>> gallery = new ArrayList<>();
        try {
            for (Map<String, Object> row : profileMapper.selectRecentWorks(userId, limit)) {
                List<String> urls = AttemptResultsUtil.parseResultUrls(String.valueOf(row.get("results")));
                if (urls.isEmpty()) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("attemptId", row.get("attemptId"));
                item.put("threadId", row.get("threadId"));
                item.put("threadTitle", row.get("threadTitle"));
                item.put("url", urls.get(0));
                item.put("createdAt", row.get("createdAt"));
                gallery.add(item);
                if (gallery.size() >= limit) break;
            }
        } catch (RuntimeException ex) {
            log.warn("最近作品查询失败，返回空列表兜底，userId={}", userId, ex);
        }
        return gallery;
    }

    /** 数值安全转换：MySQL 聚合结果可能是 BigDecimal/Long/Integer。 */
    private static long asLong(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value == null) return 0;
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }
}
