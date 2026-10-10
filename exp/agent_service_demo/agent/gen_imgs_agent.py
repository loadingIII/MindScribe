"""生图智能体：通过对话收集创作需求，产出图片生成提案。

demo 阶段不真正调用图片生成服务，
而是通过 propose_image_generation 工具输出结构化提案，
由前端确认后走现有的生图链路。
"""

from langchain.agents import create_agent

from exp.agent_service_demo.agent.context import ChatContext
from exp.agent_service_demo.llms import chat_model
from exp.agent_service_demo.tools.propose_tool import propose_image_generation
from exp.agent_service_demo.utils import get_prompt_loader

# 加载生图提示词模板
gen_imgs_agent_prompt = get_prompt_loader().load("gen_imgs_agent_prompt")

gen_imgs_agent = create_agent(
    model=chat_model,
    tools=[propose_image_generation],
    system_prompt=gen_imgs_agent_prompt,
    context_schema=ChatContext,
)
