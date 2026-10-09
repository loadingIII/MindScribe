from dataclasses import dataclass

from langchain.agents import AgentState


@dataclass
class ChatContext(AgentState):
    """"""
    user_id: str