"""智能体编排：路由器 + 客服智能体 + 生图智能体的分发图。

整体流程：
    START
      │
      ▼
   router 节点（LLM 意图分类，或显式指定模式时直接透传）
      │
      ├─ chat ────► chat_agent 节点（客服咨询）
      └─ gen_imgs ► gen_imgs_agent 节点（生图提案）
      │
      ▼
     END

两个子智能体各自维护独立的调用链，共享同一份会话消息历史。
"""

from typing import Literal

from langchain_core.messages import AIMessage, AIMessageChunk
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

from exp.agent_service_demo.agent.chat_agent import chat_agent
from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.agent.gen_imgs_agent import gen_imgs_agent
from exp.agent_service_demo.agent.router_agent import router_agent


class OrchestratorState(TypedDict):
    """编排图的顶层状态：消息列表 + 最终路由结果。"""

    messages: list
    route: str


# 显式指定模式时的合法取值，与 ChatRequest.mode 保持一致
EXPLICIT_ROUTES = {"chat", "gen_imgs"}


async def router_node(
    state: OrchestratorState, runtime: Runtime[ChatContext]
) -> dict:
    """意图路由：显式指定模式时直接使用，否则交给路由智能体分类。"""
    context = runtime.context
    if context["mode"] in EXPLICIT_ROUTES:
        return {"route": context["mode"]}

    # 调用路由智能体做意图分类（结构化输出 {"type": "chat"|"gen_imgs"}）
    result = await router_agent.ainvoke(
        {"messages": state["messages"]}, context=context
    )
    response = result.get("structured_response")
    route = getattr(response, "type", None)

    # 分类结果异常时兜底到客服智能体
    if route not in EXPLICIT_ROUTES:
        route = "chat"
    return {"route": route}


# 生图提案工具名：节点层据此识别提案并推送 action 事件
PROPOSAL_TOOL_NAME = "propose_image_generation"


async def _stream_sub_agent(
    agent, state: OrchestratorState, runtime: Runtime[ChatContext]
) -> list:
    """流式运行子智能体并转发 token / 提案事件。

    子智能体嵌套图里的 LLM token 与工具的 stream_writer 事件
    不会自动传播到外层图，因此节点内改用 astream 消费，
    通过 runtime.stream_writer 以自定义事件形式向上转发。
    返回子智能体新增的消息列表。
    """
    new_messages: list = []
    stream_writer = runtime.stream_writer

    async for mode, payload in agent.astream(
        {"messages": state["messages"]},
        context=runtime.context,
        stream_mode=["messages", "values"],
    ):
        if mode == "messages":
            # payload 是 (token, metadata) 二元组，只转发有内容的回复 token
            msg, _meta = payload
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
                if text and stream_writer is not None:
                    stream_writer({"type": "token", "delta": text})
        elif mode == "values":
            # values 模式在每步后给出完整状态，最后一次即最终结果
            new_messages = payload.get("messages", [])[len(state["messages"]):]

    return new_messages


async def chat_node(
    state: OrchestratorState, runtime: Runtime[ChatContext]
) -> dict:
    """客服智能体节点：解答平台业务问题。"""
    new_messages = await _stream_sub_agent(chat_agent, state, runtime)
    return {"messages": new_messages}


async def gen_imgs_node(
    state: OrchestratorState, runtime: Runtime[ChatContext]
) -> dict:
    """生图智能体节点：收集需求并输出生图提案。"""
    new_messages = await _stream_sub_agent(gen_imgs_agent, state, runtime)

    # 扫描新增消息中的提案工具调用，把参数作为 action 事件推给前端
    if runtime.stream_writer is not None:
        for msg in new_messages:
            for call in getattr(msg, "tool_calls", None) or []:
                if call.get("name") == PROPOSAL_TOOL_NAME:
                    args = call.get("args", {})
                    runtime.stream_writer(
                        {
                            "type": "action",
                            "action": "generate_images",
                            "proposal": {
                                "prompt": args.get("prompt", ""),
                                "summary": args.get("summary", ""),
                                "size": args.get("size", "1024x1024"),
                                "n": int(args.get("n", 1)),
                                "model": "gpt-image-2",
                            },
                        }
                    )

    return {"messages": new_messages}


def _build_graph():
    """构建并编译编排图。"""
    builder = StateGraph(OrchestratorState, context_schema=ChatContext)

    builder.add_node("router", router_node)
    builder.add_node("chat_agent", chat_node)
    builder.add_node("gen_imgs_agent", gen_imgs_node)

    builder.add_edge(START, "router")
    # 根据路由结果条件分发
    builder.add_conditional_edges(
        "router",
        lambda state: state["route"],
        {"chat": "chat_agent", "gen_imgs": "gen_imgs_agent"},
    )
    builder.add_edge("chat_agent", END)
    builder.add_edge("gen_imgs_agent", END)

    return builder.compile()


orchestrator = _build_graph()
