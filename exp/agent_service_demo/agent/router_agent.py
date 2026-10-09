from langchain.agents import create_agent
from pydantic import BaseModel

from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.llms import router_model
from exp.agent_service_demo.utils import get_prompt_loader

chat_agent_prompt = get_prompt_loader().load("router_agent_prompt")

class RouterResponse(BaseModel):
    """
    路由代理的响应模型。
    """
    route: str

router_agent = create_agent(
    model=router_model,
    tools=[],
    system_prompt=chat_agent_prompt,
    context_schema=ChatContext,
    response_format=RouterResponse,
)




if __name__ == "__main__":
    from langchain_core.utils.uuid import uuid7

    # 测试路由代理
    # user_input = "我想查询我的账户信息。"
    user_input = "帮我生成一张漫画头像。"
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}
    context = ChatContext(user_id="user123")

    res = router_agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config=config,
        context=context
    )
    obj = res["structured_response"]
    print(obj)