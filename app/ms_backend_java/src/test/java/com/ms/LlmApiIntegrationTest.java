package com.ms;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * 真实调用大模型 API 的集成测试。
 *
 * 该测试默认关闭，只有显式设置 RUN_LLM_API_TEST=true 时才会执行。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "RUN_LLM_API_TEST", matches = "true")
class LlmApiIntegrationTest {

    @Autowired
    private ChatClient.Builder chatClientBuilder;

    /**
     * 使用 application.yml 中的 URL、API Key 和模型名称调用大模型。
     */
    @Test
    void shouldCallRealLlmApi() {
        ChatClient chatClient = chatClientBuilder.build();

        // 流式接收模型片段，拼接后再校验完整响应。
        String response = chatClient
                .prompt()
                .user("请只回复：Spring AI API 测试成功")
                .system("你是一个 AI 助手，回答问题时只回复：Spring AI API 测试成功")
                .stream()
                .content()
                .collect(Collectors.joining())
                .block();

        assertFalse(response == null || response.isBlank(),
                "大模型 API 返回内容不能为空");
        System.out.println("LLM response: " + response);
    }
}
