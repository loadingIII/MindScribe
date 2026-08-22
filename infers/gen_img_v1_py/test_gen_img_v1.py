"""图片生成模块的离线单元测试。"""

from __future__ import annotations

import asyncio
import base64

import pytest
from fastapi.testclient import TestClient

from infers.gen_img_v1_py import app as api_module
from infers.gen_img_v1_py import service as service_module
from infers.gen_img_v1_py import storage
from infers.gen_img_v1_py.prompt_mapping import build_prompt
from infers.gen_img_v1_py.schemas import GenerateOptions, ReferenceImage, TaskStatus
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

    monkeypatch.setattr(service_module, "upload_reference_image", lambda *args: "https://oss.example/ref.jpg")
    monkeypatch.setattr(service_module, "async_generate_img", fake_generate)
    monkeypatch.setattr(service_module.ImageGenerationService, "_create_openai_client", lambda self: object())
    service = ImageGenerationService()
    task_id = service.create_task()
    options = GenerateOptions(model="test-model", size="1024x1024", quality="standard", n=2)

    asyncio.run(service.run_task(task_id, "测试", [ReferenceImage("a.jpg", b"x", "image/jpeg")], options))
    task = service.get_task(task_id)
    assert task is not None
    assert task.status is TaskStatus.SUCCEEDED
    assert task.image_urls == ["https://oss.example/one.png", "https://oss.example/two.png"]


def test_service_records_failures(monkeypatch) -> None:
    """模型或 OSS 调用异常时任务应被标记为失败。"""
    async def failed_generate(*args, **kwargs) -> list[str]:
        """模拟模型服务异常。"""
        raise RuntimeError("模型不可用")

    monkeypatch.setattr(service_module, "upload_reference_image", lambda *args: "https://oss.example/ref.jpg")
    monkeypatch.setattr(service_module, "async_generate_img", failed_generate)
    monkeypatch.setattr(service_module.ImageGenerationService, "_create_openai_client", lambda self: object())
    service = ImageGenerationService()
    task_id = service.create_task()
    options = GenerateOptions(model="test-model", size="1024x1024", quality="standard")

    asyncio.run(service.run_task(task_id, "测试", [ReferenceImage("a.jpg", b"x", "image/jpeg")], options))
    task = service.get_task(task_id)
    assert task is not None
    assert task.status is TaskStatus.FAILED
    assert task.error == "模型不可用"


def test_api_validates_files_and_returns_task_id(monkeypatch) -> None:
    """接口应拒绝超过限制的文件，并可创建和查询正常任务。"""
    created_tasks: list[tuple[str, list[ReferenceImage]]] = []

    async def fake_run_task(task_id, prompt, images, options) -> None:
        """记录后台任务参数，避免调用外部服务。"""
        created_tasks.append((task_id, images))

    monkeypatch.setattr(api_module.image_generation_service, "run_task", fake_run_task)
    client = TestClient(api_module.app)
    response = client.post(
        "/generate",
        data={"prompt": "测试图片", "n": "2"},
        files=[("reference_images", ("a.png", b"image", "image/png"))],
    )
    assert response.status_code == 202
    task_id = response.json()["task_id"]
    assert client.get(f"/tasks/{task_id}").json()["status"] == "pending"
    assert created_tasks and created_tasks[0][0] == task_id

    too_many = [("reference_images", (f"{index}.png", b"x", "image/png")) for index in range(5)]
    response = client.post("/generate", data={"prompt": "测试"}, files=too_many)
    assert response.status_code == 422

    too_large = b"x" * (api_module.MAX_REFERENCE_IMAGE_SIZE + 1)
    response = client.post(
        "/generate",
        data={"prompt": "测试"},
        files=[("reference_images", ("large.png", too_large, "image/png"))],
    )
    assert response.status_code == 413

    response = client.get("/tasks/unknown")
    assert response.status_code == 404
