package com.ms.utils;

import org.slf4j.Logger;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 提示词工具类，用于读取 classpath 下 prompt 目录中的提示词文件。
 * 支持 .md 和 .txt 格式。
 */
@Component
public class PromptUtils {

    private static final Logger log = LogUtil.getLogger(PromptUtils.class);

    /** 提示词文件存放的基础路径 */
    private static final String PROMPT_BASE_PATH = "com/ms/prompts/";

    /** 缓存已读取的提示词内容，避免重复 IO */
    private final Map<String, String> promptCache = new HashMap<>();

    /**
     * 读取指定名称的提示词文件。
     * <p>
     * 会优先查找 .md 文件，其次查找 .txt 文件。
     * 文件路径为：classpath:com/ms/prompt/{name}.md 或 classpath:com/ms/prompt/{name}.txt
     *
     * @param name 提示词文件名（不含扩展名）
     * @return 提示词内容
     * @throws IOException 当文件不存在或读取失败时抛出
     */
    public String readPrompt(String name) throws IOException {
        // 先检查缓存
        if (promptCache.containsKey(name)) {
            return promptCache.get(name);
        }

        String content = readPromptFile(name);
        promptCache.put(name, content);
        return content;
    }

    /**
     * 读取提示词文件，支持 .md 和 .txt 两种格式。
     *
     * @param name 提示词文件名（不含扩展名）
     * @return 文件内容
     * @throws IOException 读取失败时抛出
     */
    private String readPromptFile(String name) throws IOException {
        // 优先尝试读取 .md 文件
        Resource mdResource = new ClassPathResource(PROMPT_BASE_PATH + name + ".md");
        if (mdResource.exists()) {
            log.debug("读取提示词文件: {}.md", name);
            return readResource(mdResource);
        }

        // 再尝试读取 .txt 文件
        Resource txtResource = new ClassPathResource(PROMPT_BASE_PATH + name + ".txt");
        if (txtResource.exists()) {
            log.debug("读取提示词文件: {}.txt", name);
            return readResource(txtResource);
        }

        // 都不存在时抛出异常
        String errorMsg = String.format("提示词文件不存在: %s.md 或 %s.txt (路径: %s)", name, name, PROMPT_BASE_PATH);
        log.error(errorMsg);
        throw new IOException(errorMsg);
    }

    /**
     * 读取 Resource 的内容为字符串。
     *
     * @param resource 资源对象
     * @return 文件内容
     * @throws IOException 读取失败时抛出
     */
    private String readResource(Resource resource) throws IOException {
        try (InputStream inputStream = resource.getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /**
     * 清空提示词缓存。
     * 适用于开发环境热重载或配置更新场景。
     */
    public void clearCache() {
        promptCache.clear();
        log.info("提示词缓存已清空");
    }

    /**
     * 获取缓存中已加载的提示词名称列表。
     *
     * @return 提示词名称集合
     */
    public Map<String, String> getCachedPrompts() {
        return new HashMap<>(promptCache);
    }
}