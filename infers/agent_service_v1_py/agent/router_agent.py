"""路由代理：判断用户请求应交给哪个子智能体处理。"""

from typing import Literal

from langchain.agents import create_agent
from pydantic import BaseModel

from infers.agent_service_v1_py.agent.context import ChatContext
from infers.agent_service_v1_py.llms import router_model
from infers.agent_service_v1_py.utils import get_prompt_loader

# 加载路由提示词（agent/prompts/router_agent_prompt.md）
router_agent_prompt = get_prompt_loader().load("router_agent_prompt")


class RouterResponse(BaseModel):
    """路由代理的响应模型，字段名与提示词约定的 JSON 输出保持一致。

    - chat：平台业务咨询、日常对话
    - gen_imgs：图片生成、绘制、修改图片
    """

    type: Literal["chat", "gen_imgs"]


router_agent = create_agent(
    model=router_model,
    # 路由器只做分类，不需要任何工具
    tools=[],
    system_prompt=router_agent_prompt,
    context_schema=ChatContext,
    response_format=RouterResponse,
)


if __name__ == "__main__":
    from langchain_core.utils.uuid import uuid7

    # 简单自测：一条生图请求应路由到 gen_imgs
    user_input = "帮我生成一张漫画头像。"
    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}
    context = ChatContext(user_id="user123", user_name="测试用户")

    res = router_agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config=config,
        context=context,
    )
    print(res["structured_response"])
