"""图片生成模块的离线单元测试。"""

from __future__ import annotations

import asyncio
import base64

import pytest
from fastapi.testclient import TestClient

from infers.gen_img_v1_py import app as api_module
from infers.gen_img_v1_py import service as service_module
from infers.gen_img_v1_py import storage
from infers.gen_img_v1_py.prompt_mapping import build_prompt, build_prompt_from_payload
from infers.gen_img_v1_py.schemas import GenerateOptions, TaskStatus
from infers.gen_img_v1_py.service import ImageGenerationService


class FakeOSSService:
    """记录 OSS 调用参数的测试替身。"""

    uploads: list[tuple[str, bytes, str | None]] = []

    def __init__(self, config) -> None:
        """接收配置以模拟真实 OSS 服务构造方式。"""

    def upload_bytes(self, object_name: str, data: bytes, *, content_type: str | None = None) -> None:
        """记录上传内容，以便测试断言。"""
        self.uploads.append((object_name, data, content_type))

    def signed_url(self, object_name: str) -> str:
        """返回与对象名对应的模拟签名 URL。"""
        return f"https://oss.example/{object_name}"


def test_build_prompt_preserves_user_prompt() -> None:
    """通用提示词模板应保留用户提供的描述。"""
    assert "一只在云上的猫" in build_prompt("一只在云上的猫")


def test_build_prompt_from_payload_assembles_sections() -> None:
    """结构化提示词 JSON 应组装出系统要求、用户描述和标签补充三部分。"""
    payload = (
        '{"system_prompt": "生成高质量图片", '
        '"user_prompt": "一只在云上的猫", '
        '"tags_prompt": [{"tag_name": "风格", "tag_value": "水彩"}, {"tag_name": "", "tag_value": "脏数据"}]}'
    )
    result = build_prompt_from_payload(payload, "回退文本")
    assert "【系统要求】生成高质量图片" in result
    assert "【用户描述】一只在云上的猫" in result
    assert "- 风格: 水彩" in result
    # 无名称的标签应被剔除。
    assert "脏数据" not in result


def test_build_prompt_from_payload_falls_back_on_invalid() -> None:
    """JSON 解析失败或结构不符时应回退到普通文本提示词。"""
    fallback = build_prompt("回退文本")
    assert build_prompt_from_payload("不是JSON", "回退文本") == fallback
    assert build_prompt_from_payload('{"foo": 1}', "回退文本") == fallback
    assert build_prompt_from_payload('{"user_prompt": "  "}', "回退文本") == fallback


def test_options_merge_defaults_and_validate_output_format() -> None:
    """请求缺失参数应使用配置默认值，非法格式应被拒绝。"""
    service = ImageGenerationService(
        {"image_generation": {"model": "default-model", "size": "auto", "quality": "standard", "n": 1}}
    )
    options = service.options_from_request(None, None, None, None, None)
    assert options.model == "default-model"
    assert options.output_format == "png"
    with pytest.raises(ValueError, match="output_format"):
        GenerateOptions(model="model", size="auto", quality="standard", output_format="gif")


def test_storage_uploads_reference_and_generated_images(monkeypatch) -> None:
    """参考图和生成图应使用不同的 OSS 对象名前缀上传。"""
    FakeOSSService.uploads.clear()
    monkeypatch.setattr(storage, "OSSService", FakeOSSService)
    reference_url = storage.upload_reference_image("reference.jpg", b"reference", "image/jpeg")
    generated_url = storage.save_image_to_oss(base64.b64encode(b"generated").decode(), "png")

    assert "/reference-images/" in reference_url
    assert "/generated-images/" in generated_url
    assert FakeOSSService.uploads[0][2] == "image/jpeg"
    assert FakeOSSService.uploads[1][2] == "image/png"


def test_service_saves_multiple_generated_urls(monkeypatch) -> None:
    """任务成功时应保存模型返回的多张生成图片 URL。"""
    async def fake_generate(*args, **kwargs) -> list[str]:
        """返回固定多图 URL，避免调用真实模型。"""
        return ["https://oss.example/one.png", "https://oss.example/two.png"]

    monkeypatch.setattr(service_module, "async_generate_img", fake_generate)
    monkeypatch.setattr(service_module.ImageGenerationService, "_create_openai_client", lambda self: object())
    service = ImageGenerationService()
    task_id = service.create_task()
    options = GenerateOptions(model="test-model", size="1024x1024", quality="standard", n=2)

    # 参考图在上游已上传为 URL，服务直接透传给模型。
    asyncio.run(service.run_task(task_id, "测试", ["https://oss.example/ref.jpg"], options))
    task = service.get_task(task_id)
    assert task is not None
    assert task.status is TaskStatus.SUCCEEDED
    assert task.image_urls == ["https://oss.example/one.png", "https://oss.example/two.png"]


def test_service_uses_structured_prompt(monkeypatch) -> None:
    """prompt 为结构化提示词 JSON 时，模型应收到组装后的完整提示词。"""
    captured: dict[str, str] = {}

    async def fake_generate(_client, prompt, **kwargs) -> list[str]:
        """记录传给模型的最终提示词。"""
        captured["prompt"] = prompt
        return ["https://oss.example/one.png"]

    payload = '{"system_prompt": "系统要求", "user_prompt": "一只猫", "tags_prompt": []}'
    monkeypatch.setattr(service_module, "async_generate_img", fake_generate)
    monkeypatch.setattr(service_module.ImageGenerationService, "_create_openai_client", lambda self: object())
    service = ImageGenerationService()
    task_id = service.create_task()
    options = GenerateOptions(model="test-model", size="1024x1024", quality="standard")

    asyncio.run(service.run_task(task_id, payload, ["https://oss.example/ref.jpg"], options))
    task = service.get_task(task_id)
    assert task is not None and task.status is TaskStatus.SUCCEEDED
    assert "【用户描述】一只猫" in captured["prompt"]
    assert "【系统要求】系统要求" in captured["prompt"]


def test_service_records_failures(monkeypatch) -> None:
    """模型或 OSS 调用异常时任务应被标记为失败。"""
    async def failed_generate(*args, **kwargs) -> list[str]:
        """模拟模型服务异常。"""
        raise RuntimeError("模型不可用")

    monkeypatch.setattr(service_module, "async_generate_img", failed_generate)
    monkeypatch.setattr(service_module.ImageGenerationService, "_create_openai_client", lambda self: object())
    service = ImageGenerationService()
    task_id = service.create_task()
    options = GenerateOptions(model="test-model", size="1024x1024", quality="standard")

    asyncio.run(service.run_task(task_id, "测试", ["https://oss.example/ref.jpg"], options))
    task = service.get_task(task_id)
    assert task is not None
    assert task.status is TaskStatus.FAILED
    assert task.error == "模型不可用"


def test_api_creates_task_and_forwards_prompt(monkeypatch) -> None:
    """接口应创建任务并记录收到的 prompt，任务不存在时返回 404。"""
    created: list[dict] = []

    async def fake_run_task(task_id, prompt, images, options) -> None:
        """记录后台任务参数，避免调用外部服务。"""
        created.append({"task_id": task_id, "prompt": prompt})

    monkeypatch.setattr(api_module.image_generation_service, "run_task", fake_run_task)
    client = TestClient(api_module.app)
    prompt_json = '{"user_prompt": "测试图片", "tags_prompt": []}'
    response = client.post(
        "/generate",
        data={"prompt": prompt_json, "n": "2",
              "reference_image_urls": "https://oss.example/a.jpg"},
    )
    assert response.status_code == 202
    task_id = response.json()["task_id"]
    assert client.get(f"/tasks/{task_id}").json()["status"] == "pending"
    assert created and created[0]["prompt"] == prompt_json

    response = client.get("/tasks/unknown")
    assert response.status_code == 404
