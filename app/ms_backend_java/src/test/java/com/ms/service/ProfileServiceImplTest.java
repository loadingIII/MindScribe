package com.ms.service;

import com.ms.mapper.ProfileMapper;
import com.ms.service.impl.ProfileServiceImpl;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 个人中心聚合业务单元测试：离线运行，mock 数据层。 */
@ExtendWith(MockitoExtension.class)
class ProfileServiceImplTest {
    @Mock
    private ProfileMapper profileMapper;

    /** 构造成功 attempt 的 results JSON，与生成链路落库格式一致。 */
    private static String resultsJson(String url) {
        return "[{\"url\":\"" + url + "?Expires=1&Signature=abc\"}]";
    }

    @Test
    void summaryConvertsAggregatesAndStripsSignedUrls() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalAttempts", new BigDecimal("42"));
        stats.put("succeededCount", new BigDecimal("38"));
        stats.put("failedCount", new BigDecimal("2"));
        stats.put("totalImages", new BigDecimal("76"));
        Mockito.when(profileMapper.selectCreationStats("u1")).thenReturn(stats);
        Mockito.when(profileMapper.selectMonthConsumed(Mockito.eq("u1"), Mockito.anyString())).thenReturn(-260L);

        Map<String, Object> config = new HashMap<>();
        config.put("modelName", "gpt-image-2");
        config.put("size", "auto");
        config.put("mode", "text-to-image");
        Mockito.when(profileMapper.selectPreferredConfig("u1")).thenReturn(config);

        Map<String, Object> work = new HashMap<>();
        work.put("attemptId", "a1");
        work.put("threadId", "t1");
        work.put("threadTitle", "测试任务");
        work.put("results", resultsJson("https://oss.example.com/gen_imgs/a1.png"));
        work.put("createdAt", "2026-10-01 12:00:00");
        Mockito.when(profileMapper.selectRecentWorks(Mockito.eq("u1"), Mockito.anyInt())).thenReturn(List.of(work));

        ProfileServiceImpl service = new ProfileServiceImpl(profileMapper);
        Map<String, Object> summary = service.summary("u1", 8);

        @SuppressWarnings("unchecked")
        Map<String, Object> statsOut = (Map<String, Object>) summary.get("stats");
        Assertions.assertEquals(42L, statsOut.get("totalAttempts"));
        Assertions.assertEquals(76L, statsOut.get("totalImages"));
        // 本月消耗为负数合计，对外展示绝对值。
        Assertions.assertEquals(260L, statsOut.get("monthConsumed"));

        @SuppressWarnings("unchecked")
        Map<String, Object> galleryItem = ((List<Map<String, Object>>) summary.get("gallery")).get(0);
        // 签名 URL 应被剥掉 query，仅保留稳定对象路径。
        Assertions.assertEquals("https://oss.example.com/gen_imgs/a1.png", galleryItem.get("url"));
    }

    @Test
    void summarySkipsCorruptedResultsAndLimitsGallery() {
        Mockito.when(profileMapper.selectCreationStats("u1")).thenReturn(Map.of());
        Mockito.when(profileMapper.selectMonthConsumed(Mockito.eq("u1"), Mockito.anyString())).thenReturn(0L);
        Mockito.when(profileMapper.selectPreferredConfig("u1")).thenReturn(null);

        Map<String, Object> corrupted = new HashMap<>();
        corrupted.put("attemptId", "bad");
        corrupted.put("results", "{not-json");
        Map<String, Object> good = new HashMap<>();
        good.put("attemptId", "ok");
        good.put("threadId", "t1");
        good.put("threadTitle", "正常任务");
        good.put("results", resultsJson("https://oss.example.com/gen_imgs/ok.png"));
        // 超量返回，验证服务层按 limit 截断。
        Mockito.when(profileMapper.selectRecentWorks(Mockito.eq("u1"), Mockito.eq(1))).thenReturn(List.of(corrupted, good));

        ProfileServiceImpl service = new ProfileServiceImpl(profileMapper);
        Map<String, Object> summary = service.summary("u1", 1);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> gallery = (List<Map<String, Object>>) summary.get("gallery");
        // 脏数据条目应被跳过，正常条目保留且不超出 limit。
        Assertions.assertEquals(1, gallery.size());
        Assertions.assertEquals("ok", gallery.get(0).get("attemptId"));
    }

    @Test
    void summaryClampsGallerySize() {
        Mockito.when(profileMapper.selectCreationStats("u1")).thenReturn(Map.of());
        Mockito.when(profileMapper.selectMonthConsumed(Mockito.eq("u1"), Mockito.anyString())).thenReturn(0L);
        Mockito.when(profileMapper.selectPreferredConfig("u1")).thenReturn(null);
        Mockito.when(profileMapper.selectRecentWorks(Mockito.eq("u1"), Mockito.eq(20))).thenReturn(List.of());

        ProfileServiceImpl service = new ProfileServiceImpl(profileMapper);
        // 超上限的 gallerySize 收敛到 20；空结果返回空数组而非异常。
        Map<String, Object> summary = service.summary("u1", 999);
        Assertions.assertTrue(((List<?>) summary.get("gallery")).isEmpty());
        Mockito.verify(profileMapper).selectRecentWorks("u1", 20);
    }
}
