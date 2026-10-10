"""生图提案工具：生图智能体通过它输出结构化的生成参数。

采用“提案-确认”模式：工具本身不调用图片生成服务，
只把优化好的参数作为结构化数据交给前端渲染确认卡片，
用户确认后由前端走现有的 /gen_imgs/threads 流程，
保证积分扣减与迭代树记录不受影响。
"""

import json

from langchain.tools import ToolRuntime, tool

from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.schemas import ImageProposal

# demo 支持的尺寸白名单，与 gen_img_v1_py 的约定保持一致
ALLOWED_SIZES = {"1024x1024", "1024x1536", "1536x1024", "auto"}


@tool
def propose_image_generation(
    prompt: str,
    summary: str = "",
    size: str = "1024x1024",
    n: int = 1,
    runtime: ToolRuntime[ChatContext] | None = None,
) -> str:
    """向用户提交一份图片生成提案。收集齐用户的创作需求后调用此工具。

    Args:
        prompt: 优化后的完整英文或中文生图提示词，应包含主体、风格、
            构图、光线、画质等要素，而不是用户的原话。
        summary: 一句话说明准备生成什么图，展示在确认卡片上。
        size: 图片尺寸，只能是 1024x1024（方图）、1024x1536（竖图）、
            1536x1024（横图）或 auto 之一。
        n: 生成张数，1 到 4 之间。
    """
    # 参数兜底：模型可能给出白名单外的尺寸
    if size not in ALLOWED_SIZES:
        size = "1024x1024"
    n = max(1, min(4, int(n)))

    proposal = ImageProposal(
        prompt=prompt,
        size=size,
        n=n,
        summary=summary or f"生成 {n} 张图片",
    )

    # 通过自定义事件把提案推给流式通道，前端据此渲染确认卡片
    if runtime is not None and runtime.stream_writer is not None:
        runtime.stream_writer(
            {
                "type": "action",
                "action": "generate_images",
                "proposal": proposal.model_dump(),
            }
        )

    # 工具返回值会进入对话，引导模型向用户确认提案
    return (
        "提案已生成并通过自定义事件推送给前端，参数如下：\n"
        + json.dumps(proposal.model_dump(), ensure_ascii=False)
        + "\n请用简短的一句话向用户说明这份提案，并提醒用户点击卡片上的"
        "“立即生成”按钮来执行（不要重复罗列参数）。"
    )
