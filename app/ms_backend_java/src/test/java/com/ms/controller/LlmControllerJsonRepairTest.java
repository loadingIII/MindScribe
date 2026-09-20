package com.ms.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ms.utils.OssStorageUtil;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.web.server.ResponseStatusException;

/**
 * 提示词优化等 LLM 接口的模型输出 JSON 修复逻辑回归测试。
 *
 * 不启动 Spring 容器，仅用反射调用私有方法，保证测试离线运行。
 */
public class LlmControllerJsonRepairTest {

    /** 构造一个仅依赖 ObjectMapper 的控制器实例，其余协作对象全部 mock 掉。 */
    private LlmController newController() throws Exception {
        ChatClient.Builder builder = Mockito.mock(ChatClient.Builder.class);
        Mockito.when(builder.build()).thenReturn(Mockito.mock(ChatClient.class));
        return new LlmController(
                builder,
                Mockito.mock(com.ms.utils.PromptUtils.class),
                new ObjectMapper(),
                Mockito.mock(OssStorageUtil.class));
    }

    /** 通过反射调用私有的 repairModelJson 方法。 */
    private String repair(LlmController controller, String raw) throws Exception {
        var method = LlmController.class.getDeclaredMethod(
                "repairModelJson", String.class, java.util.function.Supplier.class);
        method.setAccessible(true);
        @SuppressWarnings("unchecked")
        var supplier = (java.util.function.Supplier<ResponseStatusException>) () ->
                new ResponseStatusException(
                        org.springframework.http.HttpStatusCode.valueOf(502), "测试错误");
        return (String) method.invoke(controller, raw, supplier);
    }

    /** 正常 JSON 直接通过，不做任何修改。 */
    @Test
    void shouldPassThroughCleanJson() throws Exception {
        LlmController controller = newController();
        String raw = "{\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"女孩\"}]}";
        Assertions.assertEquals(raw, repair(controller, raw));
    }

    /** 成对的 Markdown 围栏会被剥掉。 */
    @Test
    void shouldStripPairedMarkdownFence() throws Exception {
        LlmController controller = newController();
        String raw = "```json\n{\"title\":\"模板\",\"description\":\"简介\"}\n```";
        Assertions.assertEquals(
                "{\"title\":\"模板\",\"description\":\"简介\"}",
                repair(controller, raw));
    }

    /** 缺少闭合围栏的截断输出同样被剥掉起始围栏。 */
    @Test
    void shouldStripUnclosedMarkdownFence() throws Exception {
        LlmController controller = newController();
        String raw = "```json\n{\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"女孩\"}";
        String repaired = repair(controller, raw);
        Assertions.assertNotNull(new ObjectMapper().readTree(repaired));
    }

    /** JSON 前后夹杂说明文字时截取主体部分。 */
    @Test
    void shouldExtractJsonFromProse() throws Exception {
        LlmController controller = newController();
        String raw = "好的，以下是优化结果：\n{\"tags_prompt\":[{\"tag_name\":\"整体色调\",\"tag_value\":\"暖橙色\"}]}\n请确认。";
        String repaired = repair(controller, raw);
        Assertions.assertEquals(
                "{\"tags_prompt\":[{\"tag_name\":\"整体色调\",\"tag_value\":\"暖橙色\"}]}",
                repaired);
    }

    /** 输出中途截断时按括号栈补齐闭合符，salvage 已完整生成的标签。 */
    @Test
    void shouldCloseTruncatedJson() throws Exception {
        LlmController controller = newController();
        String raw = "{\"tags_prompt\":[{\"tag_name\":\"主体类型\",\"tag_value\":\"女孩\"},{\"tag_name\":\"情绪基调\",\"tag_va";
        String repaired = repair(controller, raw);
        var root = new ObjectMapper().readTree(repaired);
        Assertions.assertTrue(root.path("tags_prompt").isArray());
        Assertions.assertEquals(1, root.path("tags_prompt").size(),
                "应 salvage 出第一个完整标签，丢弃残缺的第二个");
    }

    /** 截断发生在字符串中间（含转义符）时补收尾引号。 */
    @Test
    void shouldCloseTruncatedStringWithEscape() throws Exception {
        LlmController controller = newController();
        String raw = "{\"tags_prompt\":[{\"tag_name\":\"整体风格\",\"tag_value\":\"赛博朋克，霓虹\\\\\"}]}";
        // 正常情况先确认能通过，再测截断版本。
        Assertions.assertNotNull(new ObjectMapper().readTree(repair(controller, raw)));
        String truncated = "{\"tags_prompt\":[{\"tag_name\":\"整体风格\",\"tag_value\":\"赛博朋克，霓虹\\";
        String repaired = repair(controller, truncated);
        Assertions.assertNotNull(new ObjectMapper().readTree(repaired));
    }

    /** 无法修复的输出抛出调用方提供的异常。 */
    @Test
    void shouldThrowProvidedExceptionWhenUnrepairable() throws Exception {
        LlmController controller = newController();
        Assertions.assertThrows(Exception.class, () -> repair(controller, "这不是JSON"));
    }
}
