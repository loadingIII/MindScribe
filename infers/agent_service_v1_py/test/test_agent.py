"""智能体模块的离线测试。

所有测试通过假智能体/假模型模拟 LLM 行为，
不访问任何外部服务，可直接用 pytest 运行：
    pytest exp/agent_service_demo/test -q
"""

import asyncio
import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.language_models import FakeListChatModel
from pydantic import BaseModel, ValidationError

from infers.agent_service_v1_py.agent.context import ChatContext
from infers.agent_service_v1_py.schemas import ChatMessage, ChatRequest
from infers.agent_service_v1_py.tools.context_tool import get_user_info
from infers.agent_service_v1_py.tools.propose_tool import propose_image_generation


def _make_runtime(context: ChatContext, stream_writer=None):
    """构造一个带 context 的 ToolRuntime，供直接调用工具使用。"""
    from langchain.tools import ToolRuntime

    return ToolRuntime(
        state=None, context=context, config=None,
        stream_writer=stream_writer, tool_call_id="test", store=None,
    )


class _FakeRouter:
    """假路由智能体：按预设结果返回结构化路由。"""

    def __init__(self, route_type: str):
        class _Resp(BaseModel):
            type: str

        self._resp = _Resp(type=route_type)
        self.calls = []

    async def ainvoke(self, inp, config=None, context=None):
        self.calls.append(inp)
        return {"structured_response": self._resp}


class _FakeSubAgent:
    """假子智能体：模拟真实行为，返回含输入历史的完整消息序列。"""

    def __init__(self, reply: str):
        self._reply = reply
        self.calls = []

    async def ainvoke(self, inp, config=None, context=None):
        self.calls.append({"input": inp, "config": config})
        # 真实子智能体会把输入消息也带回，节点层据此切分新增消息
        messages = list(inp["messages"]) + [AIMessage(content=self._reply)]
        return {"messages": messages}

    async def astream(self, inp, context=None, stream_mode=None):
        """模拟 astream：先产出 values（最终状态），行为与 ainvoke 一致。"""
        self.calls.append({"input": inp, "config": None})
        messages = list(inp["messages"]) + [AIMessage(content=self._reply)]
        yield "values", {"messages": messages}


@pytest.fixture
def wired_graph(monkeypatch):
    """加载编排图并把三个智能体都替换为假实现。"""
    from infers.agent_service_v1_py.agent import graph as graph_module

    router = _FakeRouter("gen_imgs")
    chat = _FakeSubAgent("客服假回复")
    gen = _FakeSubAgent("生图假回复")

    monkeypatch.setattr(graph_module, "router_agent", router)
    monkeypatch.setattr(graph_module, "chat_agent", chat)
    monkeypatch.setattr(graph_module, "gen_imgs_agent", gen)
    return graph_module, router, chat, gen


def _ctx(mode: str = "auto") -> ChatContext:
    """构造测试用上下文。"""
    return ChatContext(user_id="u", user_name="n", mode=mode)


# ---------------------------------------------------------------------------
# 工具层测试
# ---------------------------------------------------------------------------


def test_get_user_info_known_user():
    """已知用户应返回账号类型与积分信息。"""
    result = get_user_info.invoke(
        {"runtime": _make_runtime(ChatContext(user_id="user123", user_name="测试"))}
    )
    assert "Premium" in result
    assert "5000" in result


def test_get_user_info_unknown_user():
    """未知用户应返回友好提示而不是抛异常。"""
    result = get_user_info.invoke(
        {"runtime": _make_runtime(ChatContext(user_id="nobody", user_name="测试"))}
    )
    assert result == "用户不存在"


def test_propose_tool_returns_json_with_defaults():
    """提案工具应返回包含参数的 JSON 文本。"""
    result = propose_image_generation.invoke(
        {"prompt": "一只赛博朋克风格的猫", "summary": "赛博朋克猫"}
    )
    data = json.loads(result.split("\n", 1)[1].rsplit("\n", 1)[0])
    assert data["prompt"] == "一只赛博朋克风格的猫"
    assert data["size"] == "1024x1024"
    assert data["n"] == 1


def test_propose_tool_clamps_invalid_params():
    """非法尺寸与张数应被夹取到合法范围。"""
    result = propose_image_generation.invoke(
        {"prompt": "测试", "size": "999x999", "n": 99}
    )
    data = json.loads(result.split("\n", 1)[1].rsplit("\n", 1)[0])
    assert data["size"] == "1024x1024"
    assert data["n"] == 4


def test_propose_tool_streams_action_event():
    """有 stream_writer 时应推送 action 自定义事件。"""
    events = []
    runtime = _make_runtime(_ctx(), stream_writer=events.append)

    # runtime 需要作为输入的一部分传入，LangChain 才会完成注入
    propose_image_generation.invoke(
        {"prompt": "测试", "summary": "摘要", "runtime": runtime}
    )
    assert len(events) == 1
    assert events[0]["type"] == "action"
    assert events[0]["action"] == "generate_images"
    assert events[0]["proposal"]["prompt"] == "测试"


# ---------------------------------------------------------------------------
# 请求模型测试
# ---------------------------------------------------------------------------


def test_chat_request_validation():
    """空消息列表应校验失败。"""
    with pytest.raises(ValidationError):
        ChatRequest(messages=[])


def test_chat_message_role_restriction():
    """role 只允许 user / assistant。"""
    with pytest.raises(ValidationError):
        ChatMessage(role="system", content="hi")


def test_chat_request_mode_default_auto():
    """mode 缺省应为 auto。"""
    req = ChatRequest(messages=[ChatMessage(role="user", content="你好")])
    assert req.mode == "auto"
    assert req.user_id == "guest"


# ---------------------------------------------------------------------------
# 编排图测试（假智能体，不调用真实 LLM）
# ---------------------------------------------------------------------------


def test_graph_compiles():
    """编排图应能正常编译。"""
    from infers.agent_service_v1_py.agent.graph import orchestrator

    assert orchestrator is not None


def test_explicit_mode_skips_router(wired_graph):
    """显式指定 mode 时不调用路由器，直接分发给对应子智能体。"""
    graph_module, router, chat, gen = wired_graph

    state = asyncio.run(
        graph_module.orchestrator.ainvoke(
            {"messages": [HumanMessage(content="画一只猫")]},
            config={"configurable": {"mode": "gen_imgs"}},
            context=_ctx("gen_imgs"),
        )
    )
    assert state["route"] == "gen_imgs"
    assert router.calls == []
    assert gen.calls and gen.calls[0]["input"]["messages"][-1].content == "画一只猫"
    assert state["messages"][-1].content == "生图假回复"


def test_auto_mode_routes_to_gen_imgs(wired_graph):
    """auto 模式下路由器分类为 gen_imgs 时应交给生图智能体。"""
    graph_module, router, chat, gen = wired_graph

    state = asyncio.run(
        graph_module.orchestrator.ainvoke(
            {"messages": [HumanMessage(content="画一只猫")]},
            config={"configurable": {"mode": "auto"}},
            context=_ctx("auto"),
        )
    )
    assert len(router.calls) == 1
    assert state["route"] == "gen_imgs"
    assert not chat.calls
    assert state["messages"][-1].content == "生图假回复"


def test_auto_mode_routes_to_chat(wired_graph):
    """auto 模式下路由器分类为 chat 时应交给客服智能体。"""
    graph_module, router, chat, gen = wired_graph
    # 覆盖 fixture 的默认路由结果
    router._resp = type(router._resp)(type="chat")

    state = asyncio.run(
        graph_module.orchestrator.ainvoke(
            {"messages": [HumanMessage(content="积分怎么获得")]},
            config={"configurable": {"mode": "auto"}},
            context=_ctx("auto"),
        )
    )
    assert state["route"] == "chat"
    assert chat.calls and not gen.calls
    assert state["messages"][-1].content == "客服假回复"


class _FakeRuntime:
    """假 Runtime 对象：模拟 LangGraph 节点收到的 runtime.context。"""

    def __init__(self, context: ChatContext):
        self.context = context


def test_router_node_fallback(wired_graph):
    """路由器结构化输出缺失时应兜底到客服智能体。"""
    graph_module, router, chat, gen = wired_graph

    # router_node 内部对 getattr(response, "type", None) 取不到值时
    # 应返回 chat 兜底
    async def _invoke_router_node():
        return await graph_module.router_node(
            {"messages": []},
            runtime=_FakeRuntime(_ctx("auto")),
        )

    # 正常路径：假路由器返回 gen_imgs
    result = asyncio.run(_invoke_router_node())
    assert result["route"] == "gen_imgs"

    # 异常路径：structured_response 为 None 时应兜底 chat
    class _BrokenRouter:
        async def ainvoke(self, inp, config=None, context=None):
            return {"structured_response": None}

    graph_module.router_agent = _BrokenRouter()
    result = asyncio.run(_invoke_router_node())
    assert result["route"] == "chat"
