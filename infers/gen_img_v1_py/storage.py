"""图片生成模块的 OSS 存储定制逻辑。"""

from __future__ import annotations

import base64
import binascii
import uuid
from datetime import datetime
from typing import BinaryIO, Mapping

from libs.store.service import OSSService

try:
    from .config import config as app_config
except ImportError:
    from config import config as app_config


def _image_content_type(output_format: str) -> str:
    """根据图片输出格式返回上传 OSS 时使用的 Content-Type。"""
    content_types = {
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }
    try:
        return content_types[output_format.lower()]
    except KeyError as exc:
        raise ValueError(f"不支持的图片输出格式：{output_format}") from exc


def _object_name(prefix_key: str, extension: str, config: Mapping[str, object]) -> str:
    """根据配置前缀、当前日期和随机标识生成唯一 OSS 对象名。"""
    image_config = dict(config.get("image_generation", {}))
    prefix = str(image_config.get(prefix_key, prefix_key.replace("_prefix", ""))).strip("/")
    timestamp = datetime.now().strftime("%Y/%m/%d/%H%M%S")
    return f"{prefix}/{timestamp}_{uuid.uuid4().hex}.{extension}" if prefix else f"{timestamp}_{uuid.uuid4().hex}.{extension}"


def _oss_service() -> OSSService:
    """创建使用本模块 config.yml 配置的 OSS 服务。"""
    return OSSService(app_config)


def _public_url(object_name: str) -> str:
    """返回稳定对象地址，避免把会过期的签名参数写入任务记录。"""
    endpoint = str(app_config.get("oss", {}).get("endpoint", "")).replace("https://", "").replace("http://", "").rstrip("/")
    bucket = str(app_config.get("oss", {}).get("bucket_name", "")).strip()
    return f"https://{bucket}.{endpoint}/{object_name}"


def upload_reference_image(
    file_name: str,
    content: bytes | BinaryIO,
    content_type: str | None = None,
) -> str:
    """上传参考图片到 OSS，并返回供模型访问的临时签名 URL。"""
    image_bytes = content if isinstance(content, bytes) else content.read()
    if not image_bytes:
        raise ValueError("参考图片不能为空")
    extension = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
    content_type = content_type or "application/octet-stream"
    object_name = _object_name("reference_oss_prefix", extension, app_config)
    oss_service = _oss_service()
    oss_service.upload_bytes(object_name, image_bytes, content_type=content_type)
    return _public_url(object_name)


def save_image_to_oss(image_base64: str, output_format: str) -> str:
    """上传 Base64 图片到 OSS，并返回该图片的临时访问 URL。"""
    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("图片 Base64 数据无效") from exc

    if not image_bytes:
        raise ValueError("图片内容不能为空")
    object_name = _object_name("oss_prefix", output_format.lower(), app_config)
    oss_service = _oss_service()
    oss_service.upload_bytes(
        object_name,
        image_bytes,
        content_type=_image_content_type(output_format),
    )
    return _public_url(object_name)
