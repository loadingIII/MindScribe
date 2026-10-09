from langchain.tools import tool, ToolRuntime

from exp.agent_service_demo.agent.context import ChatContext

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
def get_user_info(runtime: ToolRuntime[ChatContext])-> str:
    """
    获取用户信息的工具函数。

    :param runtime: 工具运行时上下文，包含当前聊天状态
    :return: 用户信息字符串
    """
    """Get the current user's account information."""
    user_id = runtime.context['user_id']

    print(f"Fetching user info for user_id: {user_id}")
    if user_id in USER_DATABASE:
        user = USER_DATABASE[user_id]
        return (
            f"Account holder: {user['name']}\n"
            f"Type: {user['account_type']}\n"
            f"Balance: ${user['balance']}"
        )
    return "User not found"