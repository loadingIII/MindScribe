"""LLM 客户端配置：从 demo 目录下的 .env 读取 OpenAI 兼容端点配置。

显式按文件路径加载 .env，保证无论从哪个工作目录启动
（uvicorn / pytest / 直接运行）都能正确读到配置。
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# .env 与本文件位于同一目录
_ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(_ENV_PATH)

# 从环境变量中获取模型配置
model_name = os.getenv("OPENAI_MODEL_NAME")
model_url = os.getenv("OPENAI_URL")
model_api_key = os.getenv("OPENAI_API_KEY")

# 对话模型：客服与生图智能体共用
chat_model = ChatOpenAI(
    model=model_name,
    api_key=model_api_key,
    base_url=model_url,
)

# 路由模型：关闭思维链输出，降低路由延迟
router_model = ChatOpenAI(
    model=model_name,
    base_url=model_url,
    api_key=model_api_key,
    extra_body={
        "thinking": {"type": "disabled"}
    },
)
