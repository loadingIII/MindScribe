"""智能体 Demo 服务入口。

提供两个端点：
- POST /agent/chat       ：非流式聊天，便于联调与自测
- POST /agent/chat/stream：SSE 流式聊天，前端实际使用的接口
- GET  /healthz          ：健康检查

启动方式（仓库根目录）：
    uvicorn exp.agent_service_demo.app:app --reload --port 8100
"""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage

from exp.agent_service_demo.agent.graph import orchestrator
from exp.agent_service_demo.agent.router_agent import router_agent
from exp.agent_service_demo.schemas import ChatRequest, ChatResponse
from exp.agent_service_demo.tools.propose_tool import propose_image_generation

app = FastAPI(title="MindScribe Agent Demo", version="0.1.0")

# 可视化测试页所在目录
_STATIC_DIR = Path(__file__).parent / "static"


def _build_context(request: ChatRequest):
    """根据请求组装两个子智能体共用的运行时上下文。"""
    from exp.agent_service_demo.agent.context import ChatContext

    return ChatContext(
        user_id=request.user_id,
        user_name=request.user_name,
        mode=request.mode,
    ) # type: ignore


def _to_langchain_messages(request: ChatRequest) -> list:
    """把请求中的对话历史转换为 LangChain 消息列表。"""
    return [
        HumanMessage(content=msg.content)
        if msg.role == "user"
        else AIMessage(content=msg.content)
        for msg in request.messages
    ]


def _sse(event: str, data: dict) -> str:
    """格式化一条 SSE 事件文本。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream_chat(request: ChatRequest):
    """SSE 流式聊天的事件生成器。

    事件类型：
    - route       ：路由结果（哪个智能体接管）
    - token       ：增量文本
    - tool_start  ：工具开始调用
    - action      ：结构化提案（生图参数），前端渲染确认卡片
    - done        ：正常结束
    - error       ：发生异常
    """
    config = {}
    context = _build_context(request)
    inputs = {"messages": _to_langchain_messages(request)}

    try:
        # messages 模式拿 token 增量，custom 模式拿提案等自定义事件；
        # 传多个 stream_mode 时每个 chunk 是 (模式名, 数据) 二元组
        async for chunk in orchestrator.astream(
            inputs, # type: ignore
            config=config, # type: ignore
            context=context,
            stream_mode=["messages", "custom"],
        ):
            if not (isinstance(chunk, tuple) and len(chunk) == 2):
                continue
            stream_kind, payload = chunk

            # custom 模式：编排图节点转发的 token 与提案事件
            if stream_kind == "custom" and isinstance(payload, dict):
                if payload.get("type") == "token":
                    yield _sse("token", {"delta": payload.get("delta", "")})
                else:
                    yield _sse("action", payload)
                continue

            if stream_kind != "messages":
                continue

            # messages 模式：payload 是 (token, metadata) 二元组；
            # 只转发最终回复的 token，工具调用参数等内部 token 不外发
            msg, _metadata = payload
            if (
                isinstance(msg, AIMessageChunk)
                and msg.content
                and not msg.tool_call_chunks
            ):
                text = (
                    "".join(msg.content)
                    if isinstance(msg.content, list)
                    else msg.content
                )
                if text:
                    yield _sse("token", {"delta": text})

        yield _sse("done", {})
    except Exception as exc:  # noqa: BLE001 —— 统一转换为 SSE error 事件
        yield _sse("error", {"message": str(exc)})


@app.get("/healthz")
async def healthz():
    """健康检查端点。"""
    return {"status": "ok"}


@app.get("/")
async def index():
    """可视化测试页（仅 demo 使用，正式版由 React 前端替代）。"""
    return FileResponse(_STATIC_DIR / "index.html")


@app.post("/agent/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """非流式聊天端点：阻塞至生成完成，返回完整回复。"""
    config = {}
    context = _build_context(request)
    inputs = {"messages": _to_langchain_messages(request)}

    # 路由结果直接从编排图最终状态读取
    final_state = await orchestrator.ainvoke(
        inputs, config=config, context=context
    )
    route = final_state.get("route")

    # 从最终消息里提取生图提案（工具调用的结构化参数）
    proposal = None
    for msg in reversed(final_state.get("messages", [])):
        for call in getattr(msg, "tool_calls", None) or []:
            if call.get("name") == propose_image_generation.name:
                args = call.get("args", {})
                from exp.agent_service_demo.schemas import ImageProposal

                proposal = ImageProposal(
                    prompt=args.get("prompt", ""),
                    summary=args.get("summary", ""),
                    size=args.get("size", "1024x1024"),
                    n=int(args.get("n", 1)),
                )
                break
        if proposal:
            break

    # 最后一条 AI 消息即文字回复
    reply = ""
    for msg in reversed(final_state.get("messages", [])):
        if isinstance(msg, AIMessage) or type(msg).__name__ == "AIMessage":
            reply = (
                "".join(msg.content)
                if isinstance(msg.content, list)
                else msg.content
            )
            break

    return ChatResponse(route=route, reply=reply, proposal=proposal)


@app.post("/agent/chat/stream")
async def chat_stream(request: ChatRequest):
    """SSE 流式聊天端点：前端实际使用的接口。"""
    return StreamingResponse(
        _stream_chat(request),
        media_type="text/event-stream",
        headers={
            # 禁用代理缓冲，保证 token 逐条到达前端
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8100)
