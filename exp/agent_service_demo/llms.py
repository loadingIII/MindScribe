import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# 加载.env文件
load_dotenv()
# 从环境变量中获取模型名称
model_name = os.getenv("OPENAI_MODEL_NAME")
model_url = os.getenv("OPENAI_URL")
model_api_key = os.getenv("OPENAI_API_KEY")

#chat模型
chat_model = ChatOpenAI(
    model_name=model_name,
    api_key=model_api_key,
    base_url=model_url,
)

#router模型
router_model = ChatOpenAI(
    model=model_name,
    base_url=model_url,
    api_key=model_api_key,
    extra_body={
        "thinking" : { "type" : "disabled" }
        },
)
