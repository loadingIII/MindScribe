"""智能体服务的请求与响应数据模型。"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """单条对话消息。

    role 为 user / assistant；demo 阶段历史由调用方随请求携带，
    服务端不持久化会话。
    """

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    """聊天请求体。

    messages 按时间升序携带本次对话历史（最后一条必须是 user），
    user_id / user_name 注入智能体上下文。
    """

    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    user_id: str = "guest"
    user_name: str = "用户"
    # auto 表示由路由器自动分流；显式指定时跳过路由器
    mode: Literal["auto", "chat", "gen_imgs"] = "auto"


class ImageProposal(BaseModel):
    """生图提案：生图智能体建议的图片生成参数。

    demo 阶段仅作为结构化数据返回给前端展示，
    不真正调用图片生成服务（提案-确认模式）。
    """

    # 优化后的完整提示词
    prompt: str = Field(min_length=1, max_length=10000)
    # 建议的模型，与现有 gen_img_v1_py 的可选模型保持一致
    model: str = Field(default="gpt-image-2")
    # 建议尺寸，如 1024x1024 / 1024x1536 / 1536x1024
    size: str = Field(default="auto")
    # 建议生成张数
    n: int = Field(default=1, ge=1, le=4)
    # 一句话说明这张图是什么，展示在确认卡片上
    summary: str = Field(default="", max_length=500)


class ChatResponse(BaseModel):
    """非流式接口的响应体，便于联调与自测。"""

    # 路由结果：chat=客服，gen_imgs=生图
    route: Optional[Literal["chat", "gen_imgs"]] = None
    # 智能体的文字回复
    reply: str
    # 生图模式下携带的提案参数，其余模式为空
    proposal: Optional[ImageProposal] = None
