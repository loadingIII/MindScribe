"""图片生成 FastAPI 接口。"""

from __future__ import annotations

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, status
from pydantic import ValidationError

from .schemas import CreateTaskResponse, TaskResponse
from .service import ImageGenerationService


MAX_REFERENCE_IMAGES = 4
MAX_REFERENCE_IMAGE_SIZE = 10 * 1024 * 1024

app = FastAPI(title="MindScribe 图片生成服务")
image_generation_service = ImageGenerationService()


@app.post("/generate", response_model=CreateTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_generation_task(
    background_tasks: BackgroundTasks,
    prompt: str = Form(..., min_length=1, max_length=5000),
    reference_image_urls: list[str] = Form(...),
    model: str | None = Form(None),
    size: str | None = Form(None),
    quality: str | None = Form(None),
    output_format: str | None = Form(None),
    n: int | None = Form(None),
) -> CreateTaskResponse:
    """接收前端表单请求，创建并提交后台图片生成任务。"""
    if not reference_image_urls:
        raise HTTPException(status_code=422, detail="至少需要一张参考图")
    try:
        options = image_generation_service.options_from_request(model, size, quality, output_format, n)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.errors()) from exc

    task_id = image_generation_service.create_task()
    background_tasks.add_task(image_generation_service.run_task, task_id, prompt, reference_image_urls, options)
    return CreateTaskResponse(task_id=task_id)


@app.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_generation_task(task_id: str) -> TaskResponse:
    """根据任务标识返回当前图片生成状态、结果 URL 或错误信息。"""
    task = image_generation_service.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="图片生成任务不存在")
    return task
