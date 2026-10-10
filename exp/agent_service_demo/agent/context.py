from langchain.agents import AgentState


class ChatContext(AgentState):
    """聊天上下文：由调用方在每次请求时注入的运行时信息。

    AgentState 本身是 TypedDict（dict 的类型化子类），
    因此不要加 @dataclass 装饰器，字段以字典键方式访问：
    context["user_id"]。
    """

    # 当前请求对应的用户 ID（demo 阶段由调用方传入，正式版应来自 JWT）
    user_id: str
    # 用户昵称，用于提示词中的称呼
    user_name: str
    # 路由模式：auto=智能体自动分类；chat / gen_imgs=显式指定跳过路由
    mode: str = "auto"
