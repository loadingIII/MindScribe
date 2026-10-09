from langchain.agents import create_agent
from langchain_core.utils.uuid import uuid7

from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.llms import chat_model
from exp.agent_service_demo.tools.context_tool import get_user_info
from exp.agent_service_demo.utils import get_prompt_loader

chat_agent_prompt = get_prompt_loader().load("chat_agent_prompt")

chat_agent = create_agent(
    model=chat_model,
    tools=[get_user_info],
    system_prompt=chat_agent_prompt,
    context_schema=ChatContext,
)



if __name__ == "__main__":
    # 测试聊天代理
    user_input = "我想查询我的账户信息。"
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}
    context = ChatContext(user_id="user123")

    res = chat_agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config=config,
        context=context
    )
    print(res["messages"][-1].content)
