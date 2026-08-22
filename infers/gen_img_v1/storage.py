"""图片生成模块的 OSS 存储定制逻辑。"""

from __future__ import annotations

import base64
import binascii
import random
import uuid
from datetime import datetime
from pathlib import Path
from typing import Mapping

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


def _image_object_name(output_format: str, config: Mapping[str, object]) -> str:
    """根据模块配置生成带目录前缀的唯一 OSS 图片对象名。"""
    image_config = dict(config.get("image_generation", {}))
    prefix = str(image_config.get("oss_prefix", "generated-images")).strip("/")
    timestamp = datetime.now().strftime("%Y/%m/%d/%H%M%S")
    extension = output_format.lower()
    return f"{prefix}/{timestamp}_{uuid.uuid4().hex}.{extension}" if prefix else f"{timestamp}_{uuid.uuid4().hex}.{extension}"


def save_image_to_oss(image_base64: str, output_format: str) -> str:
    """上传 Base64 图片到 OSS，并返回该图片的临时访问 URL。"""
    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("图片 Base64 数据无效") from exc

    object_name = _image_object_name(output_format, app_config)
    oss_service = OSSService(app_config)
    oss_service.upload_bytes(
        object_name,
        image_bytes,
        content_type=_image_content_type(output_format),
    )
    return oss_service.signed_url(object_name)

# 本地存储函数
def gen_img_name(output_format: str = "png") -> Path:
    """返回唯一的本地输出路径。"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_num = random.randint(100, 999)
    return Path("output") / f"output_{timestamp}_{random_num}.{output_format}"


def _save_image_local(image_base64: str, output_format: str) -> Path:
    """将 base64 编码的图片保存到本地，并返回文件路径。"""
    image_bytes = base64.b64decode(image_base64)
    output_file = gen_img_name(output_format)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_bytes(image_bytes)
    return output_file
