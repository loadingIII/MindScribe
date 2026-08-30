/** 生图请求的提示词字段。最终组装由后端完成。 */
export const GEN_IMGS_SYSTEM_PROMPT = "你是一个专业的图片生成和图片PS大师，请根据用户描述和参考图生成高质量图片，准确理解主体、构图、风格、光线与色彩；"
+"不要添加用户未要求的文字、水印或标识，不得添加任何额外的内容。";

export function buildGenImgsPrompt(userPrompt, additionalSystemPrompt = "") {
  const normalizedPrompt = String(userPrompt ?? "").trim();
  if (!normalizedPrompt) throw new Error("请输入创作内容");
  return {
    system_prompt: [GEN_IMGS_SYSTEM_PROMPT, String(additionalSystemPrompt ?? "").trim()].filter(Boolean).join("\n\n"),
    user_prompt: normalizedPrompt
  };
}

export default buildGenImgsPrompt;
