"""客服咨询智能体：解答平台业务相关问题。"""

from langchain.agents import create_agent

from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.llms import chat_model
from exp.agent_service_demo.tools.context_tool import get_user_info
from exp.agent_service_demo.utils import get_prompt_loader

# 加载客服提示词模板（含 {user_name} 占位符）
chat_agent_prompt = get_prompt_loader().load("chat_agent_prompt")


def build_chat_agent():
    """构建客服智能体实例。

    提示词里的 {user_name} 需要按请求填充，因此不能在模块加载时
    固化单个实例，而是每次请求构建（模板文件本身有缓存，开销很小）。
    """
    return create_agent(
        model=chat_model,
        tools=[get_user_info],
        system_prompt=chat_agent_prompt,
        context_schema=ChatContext,
    )


chat_agent = build_chat_agent()


if __name__ == "__main__":
    from langchain_core.utils.uuid import uuid7
    # 测试聊天代理
    user_input = "我想查询我的账户信息。"
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}
    context = ChatContext(user_id="user123", user_name="测试用户")

    res = chat_agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config=config,
        context=context,
    )
    print(res["messages"][-1].content)
