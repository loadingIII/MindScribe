"""Redis 访问工具，统一连接配置和 JSON 快照读写。"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

try:
    import redis
except ImportError:  # pragma: no cover - 依赖缺失时保留本地开发能力
    redis = None


logger = logging.getLogger(__name__)


class RedisUtil:
    """提供可选 Redis 连接和带过期时间的 JSON 读写。"""

    def __init__(self, client: Any | None) -> None:
        self._client = client

    @classmethod
    def from_env(cls) -> "RedisUtil":
        """根据环境变量创建连接；Redis 不可用时返回降级实例。"""
        if redis is None:
            return cls(None)
        try:
            client = redis.Redis(
                host=os.getenv("REDIS_HOST", "127.0.0.1"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DATABASE", "0")),
                password=os.getenv("REDIS_PASSWORD") or None,
                decode_responses=True,
                socket_connect_timeout=0.5,
            )
            client.ping()
            return cls(client)
        except Exception:
            logger.warning("Redis 不可用，任务状态暂使用进程内存")
            return cls(None)

    @property
    def available(self) -> bool:
        """返回当前是否已建立 Redis 连接。"""
        return self._client is not None

    def set_json(self, key: str, value: dict[str, Any], *, ttl_seconds: int) -> None:
        """写入 JSON，并设置过期时间。"""
        if self._client is None:
            return
        try:
            self._client.set(key, json.dumps(value), ex=ttl_seconds)
        except Exception:
            logger.warning("Redis 写入失败，key=%s", key, exc_info=True)

    def get_json(self, key: str) -> dict[str, Any] | None:
        """读取 JSON；键不存在时返回 None。"""
        if self._client is None:
            return None
        try:
            payload = self._client.get(key)
            return None if payload is None else json.loads(payload)
        except Exception:
            logger.warning("Redis 读取失败，key=%s", key, exc_info=True)
            return None
