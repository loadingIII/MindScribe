"""图片生成接口的请求、响应和内部数据模型。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class TaskStatus(str, Enum):
    """图片生成任务的执行状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class GenerateOptions(BaseModel):
    """前端可覆盖的图片生成参数。"""

    model: str = Field(min_length=1, max_length=128)
    size: str = Field(min_length=1, max_length=32)
    quality: str = Field(min_length=1, max_length=32)
    output_format: str = "png"
    n: int = Field(default=1, ge=1, le=4)

    @field_validator("output_format")
    @classmethod
    def validate_output_format(cls, value: str) -> str:
        """校验并规范化允许上传到 OSS 的图片格式。"""
        normalized_value = value.lower()
        if normalized_value not in {"png", "jpeg", "jpg", "webp"}:
            raise ValueError("output_format 仅支持 png、jpeg、jpg 或 webp")
        return normalized_value


class CreateTaskResponse(BaseModel):
    """创建图片生成任务后的响应模型。"""

    task_id: str


class TaskResponse(BaseModel):
    """查询图片生成任务时返回的状态和结果。"""

    task_id: str
    status: TaskStatus
    image_urls: list[str] = Field(default_factory=list)
    error: str | None = None


@dataclass(frozen=True)
class ReferenceImage:
    """已从 HTTP 请求读取、等待上传 OSS 的参考图片。"""

    filename: str
    content: bytes
    content_type: str | None
