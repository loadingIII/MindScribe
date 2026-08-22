"""图片生成 FastAPI 接口。"""

from __future__ import annotations

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError

from .schemas import CreateTaskResponse, ReferenceImage, TaskResponse
from .service import ImageGenerationService


MAX_REFERENCE_IMAGES = 4
MAX_REFERENCE_IMAGE_SIZE = 10 * 1024 * 1024

app = FastAPI(title="MindScribe 图片生成服务")
image_generation_service = ImageGenerationService()


async def _read_reference_images(files: list[UploadFile]) -> list[ReferenceImage]:
    """读取并校验上传参考图的数量、类型和单文件大小。"""
    if not files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="至少需要上传一张参考图")
    if len(files) > MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"参考图最多允许 {MAX_REFERENCE_IMAGES} 张",
        )

    images: list[ReferenceImage] = []
    for upload_file in files:
        if not (upload_file.content_type or "").startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="参考图必须是图片文件",
            )
        content = await upload_file.read(MAX_REFERENCE_IMAGE_SIZE + 1)
        if len(content) > MAX_REFERENCE_IMAGE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"单张参考图不能超过 {MAX_REFERENCE_IMAGE_SIZE // 1024 // 1024}MB",
            )
        if not content:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="参考图不能为空")
        images.append(
            ReferenceImage(
                filename=upload_file.filename or "reference-image",
                content=content,
                content_type=upload_file.content_type,
            )
        )
    return images


@app.post("/generate", response_model=CreateTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_generation_task(
    background_tasks: BackgroundTasks,
    prompt: str = Form(..., min_length=1),
    reference_images: list[UploadFile] = File(...),
    model: str | None = Form(None),
    size: str | None = Form(None),
    quality: str | None = Form(None),
    output_format: str | None = Form(None),
    n: int | None = Form(None),
) -> CreateTaskResponse:
    """接收前端表单请求，创建并提交后台图片生成任务。"""
    images = await _read_reference_images(reference_images)
    try:
        options = image_generation_service.options_from_request(model, size, quality, output_format, n)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.errors()) from exc

    task_id = image_generation_service.create_task()
    background_tasks.add_task(image_generation_service.run_task, task_id, prompt, images, options)
    return CreateTaskResponse(task_id=task_id)


@app.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_generation_task(task_id: str) -> TaskResponse:
    """根据任务标识返回当前图片生成状态、结果 URL 或错误信息。"""
    task = image_generation_service.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="图片生成任务不存在")
    return task
