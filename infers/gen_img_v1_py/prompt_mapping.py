"""图片生成提示词的通用映射规则。"""

import json
import re

# 匹配用户提示词中的参考图标记 [序号:图片名]，序号为参考图的 1 基下标。
REFERENCE_MARK = re.compile(r"\[(\d+):([^\]\n]+)\]")


def build_prompt(prompt: str) -> str:
    """保留用户提示词，并添加适用于通用图片生成的基础约束。"""
    normalized_prompt = prompt.strip()
    if not normalized_prompt:
        raise ValueError("提示词不能为空")
    return (
        f"{normalized_prompt}\n\n"
        "请根据用户提示词和参考图生成高质量图片。"
    )

# 后续需要对多图片进行映射

def build_prompt_from_payload(payload: str, fallback: str) -> str:
    """优先解析前端组装的结构化提示词 JSON，失败时回退到普通文本提示词。

    payload 为前端 buildGenImgsPrompt 组装的 JSON 字符串，包含
    system_prompt、user_prompt、references、tags_prompt 四部分；
    解析成功时把各部分拼接为模型可读文本，否则按普通文本提示词处理。
    """
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return build_prompt(fallback)
    # 结构不符（非对象或缺 user_prompt）时同样回退，保证旧调用方不受影响。
    if not isinstance(data, dict) or not str(data.get("user_prompt", "")).strip():
        return build_prompt(fallback)

    # 参考图文件名列表：与前端 files 顺序一致，标记中的序号即下标 + 1。
    references = [
        str(name).strip()
        for name in (data.get("references") or [])
        if str(name).strip()
    ]

    parts: list[str] = []
    # 系统提示词在前，用于约束生成行为。
    system_prompt = str(data.get("system_prompt", "")).strip()
    if system_prompt:
        parts.append(f"【系统要求】{system_prompt}")
    # 参照图清单在系统要求与用户描述之间，按序号列出，供模型对照标记引用。
    if references:
        ref_lines = [
            f"参考图{index}：{name}"
            for index, name in enumerate(references, start=1)
        ]
        parts.append("【参照图】\n" + "\n".join(ref_lines))
    # 用户提示词为核心描述；把 [1:头像1.jpg] 改写为 [参考图1:头像1.jpg]，
    # 与参照图清单中的称呼保持一致，便于模型关联引用。
    user_prompt = REFERENCE_MARK.sub(r"[参考图\1:\2]", str(data.get("user_prompt", "")).strip())
    parts.append(f"【用户描述】{user_prompt}")
    # 标签提示词为结构化补充描述，逐行列出。
    tags = data.get("tags_prompt") or []
    if isinstance(tags, list):
        tag_lines = [
            f"- {tag.get('tag_name')}: {tag.get('tag_value')}"
            for tag in tags
            if isinstance(tag, dict) and str(tag.get("tag_name", "")).strip()
        ]
        if tag_lines:
            parts.append("【标签补充】\n" + "\n".join(tag_lines))
    return "\n\n".join(parts)
