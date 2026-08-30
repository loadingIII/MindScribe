"""OpenAI 兼容的图片生成工具。

异步 API 适用于已运行 asyncio 事件循环的 Web 服务和其他应用。
同步 API 保留用于简单脚本。
"""

import asyncio
import urllib.request
from urllib.parse import urlparse

from openai import AsyncOpenAI, OpenAI

from infers.gen_img_v1_py.storage import save_image_to_oss


def _validate_config(base_url: str, api_key: str) -> None:
    """校验配置是否完整。"""
    if not api_key:
        raise ValueError("You should set OPENAI_API_KEY")
    if not base_url:
        raise ValueError("You should set OPENAI_API_BASE")


def get_client(base_url: str, api_key: str = "") -> OpenAI:
    """创建同步 OpenAI 兼容客户端。"""
    _validate_config(base_url, api_key)
    return OpenAI(base_url=base_url, api_key=api_key)


def get_async_client(base_url: str, api_key: str = "") -> AsyncOpenAI:
    """创建异步 OpenAI 兼容客户端。"""
    _validate_config(base_url, api_key)
    return AsyncOpenAI(base_url=base_url, api_key=api_key)


def _validate_image_url(images: list[str]) -> list[str]:
    """校验图片 URL 列表格式。"""
    for url in images:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"图片必须是有效的 URL，当前值: {url}")
    return images


def _save_generated_image(image, output_format: str) -> str:
    """兼容模型返回 Base64 或远程 URL 两种图片结果格式。"""
    if getattr(image, "b64_json", None):
        return save_image_to_oss(image.b64_json, output_format)
    image_url = getattr(image, "url", None)
    if image_url:
        with urllib.request.urlopen(image_url, timeout=60) as response:
            image_bytes = response.read()
        from infers.gen_img_v1_py.storage import _object_name, _oss_service, _image_content_type, app_config
        object_name = _object_name("oss_prefix", output_format.lower(), app_config)
        oss_service = _oss_service()
        oss_service.upload_bytes(object_name, image_bytes, content_type=_image_content_type(output_format))
        return oss_service.signed_url(object_name)
    raise ValueError("模型返回中既没有 b64_json，也没有图片 URL")



def generate_img(
    client: OpenAI,
    prompt: str,
    model: str = "gpt-image-2",
    n: int = 1,
    size: str = "auto",
    quality: str = "auto",
    output_format: str = "png",
    images: list[str] = [],
) -> list[str]:
    """同步调用模型生成图片，上传全部结果到 OSS 后返回 URL 列表。"""
    params = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "size": size,
        "quality": quality,
        "output_format": output_format,
    }
    if images:
        params["extra_body"] = {"image": _validate_image_url(images)}
    response = client.images.generate(**params)
    return [_save_generated_image(image, output_format) for image in response.data]


async def async_generate_img(
    client: AsyncOpenAI,
    prompt: str,
    model: str = "gpt-image-2",
    n: int = 1,
    size: str = "auto",
    quality: str = "auto",
    output_format: str = "png",
    images: list[str] = [],
) -> list[str]:
    """异步调用模型生成图片，并上传全部结果到 OSS 后返回 URL 列表。"""
    params = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "size": size,
        "quality": quality,
        "output_format": output_format,
    }
    if images:
        params["extra_body"] = {"image": _validate_image_url(images)}
    response = await client.images.generate(**params)
    return [
        await asyncio.to_thread(_save_generated_image, image, output_format)
        for image in response.data
    ]


if __name__ == "__main__":
    from config import config
    async def main() -> None:
        print(f'{config["base_url"]},{config["api_key"]}')
        client = get_async_client(config["base_url"], config["api_key"])
        output_file = await async_generate_img(
            client,
            quality="high",
            prompt="""
            观察照片的元素，画面覆盖手绘风注解，用白色细线沿每个物体外围随意描边，线条有一笔画的抖动感，不追求工整。配上箭头和虚线引导视线。
            请填写照片中的物品（例：披萨、汽水）每个物品旁用日系可爱手写体写简短碎念：饮料写温度、口感和心情，食物写满足感，空间写氛围。画面
            底部加一句总结小字。图片中的文字采用中文。适当点缀小星星、爱心、闪光和微微热气，但保留大量留白，不要铺满。整体像日记手账。
            """,
            images=["https://travel-shared-platform.oss-cn-guangzhou.aliyuncs.com/test/06b431262aa290aa2169cbd538dc56ce.jpg"]
        )
        print(f"Image saved to {output_file}")

    asyncio.run(main())
