"""OpenAI 兼容的图片生成工具。

异步 API 适用于已运行 asyncio 事件循环的 Web 服务和其他应用。
同步 API 保留用于简单脚本。
"""

import asyncio
import base64
import random
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from openai import AsyncOpenAI, OpenAI


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


def gen_img_name(output_format: str = "png") -> Path:
    """返回唯一的本地输出路径。"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_num = random.randint(100, 999)
    return Path("output") / f"output_{timestamp}_{random_num}.{output_format}"


#TODO 后续会上传至云存储，返回 URL
def _save_image(image_base64: str, output_format: str) -> Path:
    """将 base64 编码的图片保存到本地，并返回文件路径。"""
    image_bytes = base64.b64decode(image_base64)
    output_file = gen_img_name(output_format)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_bytes(image_bytes)
    return output_file


def generate_img(
    client: OpenAI,
    prompt: str,
    model: str = "gpt-image-2",
    n: int = 1,
    size: str = "1536x1024",
    quality: str = "auto",
    output_format: str = "png",
    images: list[str] = [],
) -> Path:
    """同步生成图片并保存到本地。"""
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
    return _save_image(response.data[0].b64_json, output_format)


async def async_generate_img(
    client: AsyncOpenAI,
    prompt: str,
    model: str = "gpt-image-2",
    n: int = 1,
    size: str = "auto",
    quality: str = "auto",
    output_format: str = "png",
    images: list[str] = [],
) -> Path:
    """异步生成图片，不阻塞 asyncio 事件循环。"""
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
    return await asyncio.to_thread(
        _save_image, response.data[0].b64_json, output_format
    )


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
