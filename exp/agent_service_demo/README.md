# agent_service_demo

MindScribe 智能体模块的 Demo 服务：一个路由器 + 两个子智能体（客服咨询 / 生图提案），
基于 LangChain 1.x + LangGraph 1.0 实现，通过 FastAPI 对外提供 SSE 流式聊天接口。

## 架构

```
POST /agent/chat/stream (SSE)
        │
        ▼
   router 节点 ──── LLM 意图分类（auto 模式），显式 mode 时直接透传
     ├─ chat ────► chat_agent     客服咨询：查积分、账号信息（demo 假数据）
     └─ gen_imgs ► gen_imgs_agent 生图创作：对话收集需求 → 输出结构化提案
```

生图采用「提案-确认」模式：`gen_imgs_agent` 通过 `propose_image_generation`
工具输出参数（prompt / size / n），经 SSE `action` 事件推给前端渲染确认卡片，
**不直接调用图片生成服务**。用户确认后由前端走现有 `/gen_imgs/threads` 链路，
保证积分扣减与迭代树记录不受影响。

## 目录说明

| 路径 | 职责 |
| --- | --- |
| `app.py` | FastAPI 入口：`/agent/chat`（非流式）、`/agent/chat/stream`（SSE）、`/healthz` |
| `schemas.py` | 请求/响应模型（`ChatRequest`、`ImageProposal`、`ChatResponse`） |
| `agent/graph.py` | LangGraph 编排：路由分发 + 双子智能体 |
| `agent/router_agent.py` | 意图路由智能体（结构化输出 `{"type": "chat" \| "gen_imgs"}`） |
| `agent/chat_agent.py` | 客服智能体（工具：`get_user_info`） |
| `agent/gen_imgs_agent.py` | 生图智能体（工具：`propose_image_generation`） |
| `agent/context.py` | 运行时上下文（user_id / user_name / mode） |
| `agent/prompts/*.md` | 各智能体的系统提示词，由 `utils/prompt_loader.py` 加载 |
| `tools/` | 智能体可调用的工具 |
| `test/` | 离线 pytest（假模型，不访问外部服务） |

## 运行

```bash
# 1. 安装依赖
pip install -r exp/agent_service_demo/requirements.txt

# 2. 配置环境变量（参考 .env 已有的三个变量，不要提交真实密钥）
#    OPENAI_API_KEY / OPENAI_URL / OPENAI_MODEL_NAME

# 3. 启动服务（仓库根目录执行）
uvicorn exp.agent_service_demo.app:app --reload --port 8100
```

## 快速验证

```bash
# 健康检查
curl http://127.0.0.1:8100/healthz

# 客服模式（显式指定，跳过路由器）
curl -X POST http://127.0.0.1:8100/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"查询我的积分余额"}],"user_id":"user123","mode":"chat"}'

# 生图模式：返回结构化提案
curl -X POST http://127.0.0.1:8100/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"帮我画一张赛博朋克风格的猫"}],"mode":"gen_imgs"}'

# 自动路由 + SSE 流式（浏览器打开 static/index.html 可视化体验）
curl -N -X POST http://127.0.0.1:8100/agent/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"mode":"auto"}'
```

## SSE 事件协议

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `token` | `{"delta": "..."}` | 增量文本 |
| `action` | `{"type": "action", "action": "generate_images", "proposal": {...}}` | 生图提案，前端渲染确认卡片 |
| `done` | `{}` | 正常结束 |
| `error` | `{"message": "..."}` | 发生异常 |

## 测试

```bash
# 仓库根目录执行，全部为离线测试（假模型）
pytest exp/agent_service_demo/test -q
```
