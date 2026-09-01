/** 生图请求的基础系统提示词，与前端追加内容一起组成最终的 system_prompt。 */
export const GEN_IMGS_SYSTEM_PROMPT = "你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；"
+"不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。";


/**
 * 组装生图请求的完整提示词 JSON。
 *
 * 最终结构由三部分组成：
 * - system_prompt：系统提示词，用于引导模型生成符合要求的图片；
 * - user_prompt：用户提示词，包含用户描述和参考图标记（如 [2:夕阳1.jpg]）；
 * - tags_prompt：标签提示词数组，每项为 { tag_name, tag_value }，用于补充结构化描述。
 *
 * @param {string} userPrompt 用户提示词（创作页输入框或构建页"用户输入"芯片内容）。
 * @param {Array<{key: string, value: string}>} [tags] 标签芯片列表（构建页 draft.tags）。
 * @param {string} [additionalSystemPrompt] 高级设置中追加的系统提示词。
 * @returns {{system_prompt: string, user_prompt: string, tags_prompt: Array<{tag_name: string, tag_value: string}>}}
 * @throws {Error} 用户提示词为空时抛出，提示需要先输入创作内容。
 */
export function buildGenImgsPrompt(userPrompt, tags = [], additionalSystemPrompt = "") {
  // 用户提示词必须非空，否则后续生成无从谈起。
  const normalizedPrompt = String(userPrompt ?? "").trim();
  if (!normalizedPrompt) throw new Error("请输入创作内容");

  // 标签统一收敛为 { tag_name, tag_value } 结构，剔除无名称的脏数据。
  const tagsPrompt = (Array.isArray(tags) ? tags : [])
    .map((tag) => ({
      tag_name: String(tag?.key ?? "").trim(),
      tag_value: String(tag?.value ?? "").trim()
    }))
    .filter((tag) => tag.tag_name);

  const assembled = {
    // 基础系统提示词与高级设置的追加内容拼接为最终 system_prompt。
    system_prompt: [GEN_IMGS_SYSTEM_PROMPT, String(additionalSystemPrompt ?? "").trim()].filter(Boolean).join("\n\n"),
    user_prompt: normalizedPrompt,
    tags_prompt: tagsPrompt
  };
  // 组装完成后输出日志，便于在浏览器控制台核对最终提交给后端的提示词内容。
  // TODO 生产环境请注释掉，避免泄露敏感信息。
  console.log("[gen_imgs] 提示词组装完成：", assembled);
  return assembled;
}

export default buildGenImgsPrompt;
