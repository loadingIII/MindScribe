"""阿里云 OSS 存储服务。

本服务通过简洁的接口封装 OSS SDK，调用方不需要了解 ``oss2`` 请求对象。
默认读取同目录下的 ``config.yml``，也支持传入配置字典或配置文件路径覆盖。
"""

from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Mapping

import yaml


CONFIG_PATH = Path(__file__).resolve().parent / "config.yml"


def load_config(path: str | Path = CONFIG_PATH) -> dict:
    """读取 YAML 配置文件，空文件返回空字典。"""
    with Path(path).open("r", encoding="utf-8") as config_file:
        return yaml.safe_load(config_file) or {}


@dataclass(frozen=True)
class OSSConfig:
    """OSS 连接和默认行为配置。"""

    endpoint: str
    access_key_id: str
    access_key_secret: str
    bucket_name: str
    region: str | None = None
    signature_expires: int = 3600

    @classmethod
    def from_mapping(cls, config: Mapping[str, object]) -> OSSConfig:
        """从配置字典创建配置对象，密钥缺失时回退读取环境变量。"""
        values = dict(config.get("oss", config))
        # 支持通过环境变量提供密钥，避免将敏感信息写入 config.yml。
        def value(name: str, env_name: str) -> str:
            """读取配置项，并在配置文件没有值时读取指定环境变量。"""
            result = os.getenv(env_name, values.get(name))
            if not result:
                raise ValueError(f"缺少 OSS 配置项：{name}（或环境变量 {env_name}）")
            return str(result)

        expires = values.get("signature_expires", 3600)
        return cls(
            endpoint=value("endpoint", "OSS_ENDPOINT"),
            access_key_id=value("access_key_id", "OSS_ACCESS_KEY_ID"),
            access_key_secret=value("access_key_secret", "OSS_ACCESS_KEY_SECRET"),
            bucket_name=value("bucket_name", "OSS_BUCKET_NAME"),
            region=str(values["region"]) if values.get("region") else os.getenv("OSS_REGION"),
            signature_expires=int(expires),
        )


class OSSService:
    """阿里云 OSS 的同步服务封装。"""

    def __init__(
        self,
        config: OSSConfig | Mapping[str, object] | str | Path | None = None,
        *,
        bucket=None,
    ) -> None:
        """初始化服务；未传入 bucket 时根据配置连接已有的 OSS Bucket。"""
        if config is None:
            config = load_config()
        if isinstance(config, (str, Path)):
            config = load_config(config)
        self.config = config if isinstance(config, OSSConfig) else OSSConfig.from_mapping(config)
        self.bucket = bucket or self._build_client(self.config)

    @staticmethod
    def _build_client(config: OSSConfig):
        """使用配置连接已有 Bucket。"""
        try:
            import oss2
        except ImportError as exc:
            raise RuntimeError("阿里云 OSS 需要安装 oss2 依赖包") from exc
        auth = oss2.Auth(config.access_key_id, config.access_key_secret)
        return oss2.Bucket(auth, config.endpoint, config.bucket_name, region=config.region)

    def upload_bytes(self, object_name: str, data: bytes, *, content_type: str | None = None):
        """将内存中的字节数据上传到指定 OSS 对象。"""
        headers = {"Content-Type": content_type} if content_type else None
        return self.bucket.put_object(object_name, data, headers=headers)

    def upload_file(
        self, file_path: str | Path, object_name: str | None = None, *, prefix: str, content_type: str | None = None
    ):
        """读取本地文件并上传；未指定对象名时使用本地文件名。"""
        path = Path(file_path)
        object_name = f"{prefix}/{object_name or path.name}"        #组装 OSS 对象名
        content_type = content_type or mimetypes.guess_type(path.name)[0]
        with path.open("rb") as stream:
            return self.upload_stream(object_name, stream, content_type=content_type)

    def upload_stream(self, object_name: str, stream: BinaryIO, *, content_type: str | None = None):
        """将可读取的二进制流上传到指定 OSS 对象。"""
        headers = {"Content-Type": content_type} if content_type else None
        return self.bucket.put_object(object_name, stream, headers=headers)

    def download_bytes(self, object_name: str) -> bytes:
        """下载 OSS 对象并以字节串返回全部内容。"""
        return self.bucket.get_object(object_name).read()

    def download_file(self, object_name: str, file_path: str | Path) -> None:
        """以流式方式下载 OSS 对象并写入本地文件。"""
        result = self.bucket.get_object(object_name)
        with Path(file_path).open("wb") as output:
            for chunk in result:
                output.write(chunk)

    def delete(self, object_name: str):
        """删除指定的 OSS 对象。"""
        return self.bucket.delete_object(object_name)

    def exists(self, object_name: str) -> bool:
        """检查指定 OSS 对象是否存在。"""
        return bool(self.bucket.object_exists(object_name))

    def signed_url(self, object_name: str, *, expires: int | None = None, method: str = "GET") -> str:
        """生成指定对象的临时签名 URL，默认有效期为配置中的秒数。"""
        return self.bucket.sign_url(method, object_name, expires or self.config.signature_expires)
