"""图片生成的业务编排和进程内任务状态管理。"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import uuid
from dataclasses import dataclass, field
from typing import Mapping

from libs.redis import RedisUtil

from .config import config as app_config
from .open_ai import async_generate_img, get_async_client
from .prompt_mapping import build_prompt, build_prompt_from_payload
from .schemas import GenerateOptions, TaskResponse, TaskStatus

# 模块级日志器：用于输出任务执行过程中的关键信息（如最终拼接的提示词）。
logger = logging.getLogger(__name__)


@dataclass
class _TaskRecord:
    """仅在当前应用进程中保存的图片生成任务记录。"""

    status: TaskStatus = TaskStatus.PENDING
    image_urls: list[str] = field(default_factory=list)
    error: str | None = None


class ImageGenerationService:
    """负责提交、执行和查询图片生成任务，并持久化任务快照。"""

    def __init__(self, config: Mapping[str, object] = app_config) -> None:
        """初始化任务存储和配置。"""
        self._config = config
        self._tasks: dict[str, _TaskRecord] = {}
        self._lock = threading.RLock()
        self._redis = RedisUtil.from_env()

    def _redis_key(self, task_id: str) -> str:
        return f"mindscribe:python:task:{task_id}"

    def create_task(self) -> str:
        """创建待执行任务并返回唯一任务标识。"""
        task_id = uuid.uuid4().hex
        with self._lock:
            self._tasks[task_id] = _TaskRecord()
        self._save_redis(task_id, TaskStatus.PENDING)
        return task_id

    def get_task(self, task_id: str) -> TaskResponse | None:
        """读取任务快照；任务不存在时返回 None。"""
        with self._lock:
            record = self._tasks.get(task_id)
            if record is not None:
                return TaskResponse(
                    task_id=task_id,
                    status=record.status,
                    image_urls=list(record.image_urls),
                    error=record.error,
                )

        payload = self._redis.get_json(self._redis_key(task_id))
        if payload is not None:
            return TaskResponse(
                task_id=task_id,
                status=TaskStatus(payload["status"]),
                image_urls=payload.get("image_urls", []),
                error=payload.get("error"),
            )
        return None

    def options_from_request(
        self,
        model: str | None,
        size: str | None,
        quality: str | None,
        output_format: str | None,
        n: int | None,
    ) -> GenerateOptions:
        """将请求可选参数与 config.yml 默认值合并并完成校验。"""
        defaults = dict(self._config.get("image_generation", {}))
        return GenerateOptions(
            model=model or defaults.get("model", "gpt-image-2"),
            size=size or defaults.get("size", "auto"),
            quality=quality or defaults.get("quality", "auto"),
            output_format=output_format or defaults.get("output_format", "png"),
            n=n if n is not None else defaults.get("n", 1),
        )

    async def run_task(
        self,
        task_id: str,
        prompt: str,
        reference_images: list[str],
        options: GenerateOptions,
    ) -> None:
        """执行上传参考图、生成图片和上传结果的完整异步任务流程。"""
        self._set_running(task_id)
        try:
            # prompt 可能是前端组装的结构化提示词 JSON；解析失败时按普通文本处理。
            final_prompt = build_prompt_from_payload(prompt, prompt)
            # 输出最终拼接结果，便于核对参照图清单与标记改写是否符合预期。
            # 注意：提示词可能包含用户创作内容，生产环境如需隐私可降级为 logger.debug。
            logger.info("任务 %s 最终提示词：\n%s", task_id, final_prompt)
            image_urls = await async_generate_img(
                self._create_openai_client(),
                final_prompt,
                model=options.model,
                n=options.n,
                size=options.size,
                quality=options.quality,
                output_format=options.output_format,
                images=reference_images,
            )
            self._set_succeeded(task_id, image_urls)
        except Exception as exc:
            self._set_failed(task_id, str(exc))

    def _create_openai_client(self):
        """使用环境变量或模块配置创建 OpenAI 异步客户端。"""
        base_url = os.getenv("OPENAI_API_BASE", str(self._config.get("base_url", "")))
        api_key = os.getenv("OPENAI_API_KEY", str(self._config.get("api_key", "")))
        return get_async_client(base_url, api_key)

    def _set_running(self, task_id: str) -> None:
        """将存在的任务更新为执行中状态。"""
        with self._lock:
            self._tasks[task_id].status = TaskStatus.RUNNING
        self._save_redis(task_id, TaskStatus.RUNNING)

    def _set_succeeded(self, task_id: str, image_urls: list[str]) -> None:
        """保存任务生成结果并标记为成功。"""
        with self._lock:
            record = self._tasks[task_id]
            record.status = TaskStatus.SUCCEEDED
            record.image_urls = image_urls
            record.error = None
        self._save_redis(task_id, TaskStatus.SUCCEEDED, image_urls=image_urls)

    def _set_failed(self, task_id: str, error: str) -> None:
        """保存错误信息并标记任务为失败。"""
        with self._lock:
            record = self._tasks[task_id]
            record.status = TaskStatus.FAILED
            record.error = error or "图片生成失败"
        self._save_redis(task_id, TaskStatus.FAILED, error=error or "图片生成失败")

    def _save_redis(self, task_id: str, status: TaskStatus, *, image_urls: list[str] | None = None, error: str | None = None) -> None:
        """更新 Redis 中的任务快照。"""
        payload = {"status": status.value, "image_urls": image_urls or [], "error": error}
        self._redis.set_json(self._redis_key(task_id), payload, ttl_seconds=7 * 24 * 3600)
