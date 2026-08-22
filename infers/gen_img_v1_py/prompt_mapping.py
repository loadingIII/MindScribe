"""图片生成提示词的通用映射规则。"""


def build_prompt(prompt: str) -> str:
    """保留用户提示词，并添加适用于通用图片生成的基础约束。"""
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        raise ValueError("提示词不能为空")
    return (
        f"{normalized_prompt}\n\n"
        "请根据用户提示词和参考图生成高质量图片。"
    )
