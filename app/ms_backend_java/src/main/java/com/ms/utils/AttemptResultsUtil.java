package com.ms.utils;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** attempts.results JSON 的公共解析工具：提取图片稳定地址，脏数据安全降级。 */
public final class AttemptResultsUtil {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AttemptResultsUtil() { }

    /**
     * 从 results JSON（形如 [{"url":"..."}]）提取图片地址列表。
     * 地址统一剥掉签名 query 并解码，库内外均以稳定对象路径展示；
     * JSON 格式异常时返回空列表，不抛出，避免脏数据阻塞调用方。
     */
    public static List<String> parseResultUrls(String results) {
        if (results == null || results.isBlank()) return List.of();
        try {
            List<Map<String, Object>> images = MAPPER.readValue(results, List.class);
            List<String> urls = new ArrayList<>();
            for (Map<String, Object> image : images) {
                Object url = image.get("url");
                if (url != null && !String.valueOf(url).isBlank()) urls.add(normalizeImageUrl(String.valueOf(url)));
            }
            return urls;
        } catch (IOException | RuntimeException e) {
            LogUtil.getLogger(AttemptResultsUtil.class).warn("Attempt 结果记录格式异常，忽略无法解析的图片地址");
            return List.of();
        }
    }

    /** 清理历史签名 URL，只保留稳定、可读的对象路径。 */
    private static String normalizeImageUrl(String value) {
        if (value == null || value.isBlank()) return value;
        String path = value.split("\\?", 2)[0];
        return URLDecoder.decode(path, StandardCharsets.UTF_8);
    }
}