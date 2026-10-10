"""LLM 客户端配置：按 gen_img_v1_py 的 config.yml + ${ENV} 占位符风格加载。

config.yml 存放非敏感配置（模型名、服务地址），敏感的 api_key
通过 ${AGENT_API_KEY} 占位符从同目录 .env / 进程环境变量注入。
"""

import os
from pathlib import Path

from langchain_openai import ChatOpenAI

# 复用 gen_img_v1_py 的配置加载约定（YAML 占位符解析 + 可选 .env）
from infers.agent_service_v1_py.config import config as _app_config

# LLM 配置段
_llm_config = _app_config["llm"]

# 对话模型：客服与生图智能体共用
chat_model = ChatOpenAI(
    model_name=_llm_config["chat_model"],
    api_key=os.getenv("AGENT_API_KEY", _llm_config["api_key"]),
    base_url=_llm_config["base_url"],
    streaming=True,
)

# 路由模型：关闭思维链输出，降低路由延迟
router_model = ChatOpenAI(
    model=_llm_config["router_model"],
    base_url=_llm_config["base_url"],
    api_key=os.getenv("AGENT_API_KEY", _llm_config["api_key"]),
    streaming=True,
    extra_body={
        "thinking": {"type": "disabled"}
    },
)
