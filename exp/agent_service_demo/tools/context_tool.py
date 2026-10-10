"""用户信息查询工具（demo 用内存假数据）。"""

from langchain.tools import ToolRuntime, tool

from exp.agent_service_demo.agent.context import ChatContext

# demo 用的内存用户表，正式版应替换为 Java 后端接口
USER_DATABASE = {
    "user123": {
        "name": "Alice Johnson",
        "account_type": "Premium",
        "balance": 5000,
        "email": "alice@example.com",
    },
    "user456": {
        "name": "Bob Smith",
        "account_type": "Standard",
        "balance": 1200,
        "email": "bob@example.com",
    },
}


@tool
def get_user_info(runtime: ToolRuntime[ChatContext]) -> str:
    """查询当前用户的账号信息，包括昵称、账号类型和积分余额。

    当用户询问自己的账号信息或积分余额时使用此工具。"""
    # context 是 TypedDict（dict 子类），用字典方式取值
    user_id = runtime.context["user_id"]

    if user_id in USER_DATABASE:
        user = USER_DATABASE[user_id]
        return (
            f"昵称: {user['name']}\n"
            f"账号类型: {user['account_type']}\n"
            f"积分余额: {user['balance']}"
        )
    return "用户不存在"
