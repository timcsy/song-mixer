import os
import re
import tempfile
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, HttpUrl

from app.core.config import get_settings
from app.core.rate_limit import check_rate_limit, RateLimitExceeded
from app.models.job import Job, JobStatus, SourceType, Result
from app.services.youtube import get_youtube_downloader
from app.services.storage import get_storage_service
from app.workers.tasks import get_job_from_redis, enqueue_job


router = APIRouter()
settings = get_settings()


class CreateJobRequest(BaseModel):
    """建立任務請求"""
    source_type: SourceType
    source_url: Optional[str] = None


class JobResponse(BaseModel):
    """任務回應"""
    id: str
    source_type: SourceType
    status: JobStatus
    progress: int
    current_stage: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    expires_at: datetime


class ResultResponse(BaseModel):
    """結果回應"""
    original_duration: Optional[int] = None
    output_size: Optional[int] = None
    download_url: Optional[str] = None


class JobWithResultResponse(JobResponse):
    """包含結果的任務回應"""
    result: Optional[ResultResponse] = None


class ErrorResponse(BaseModel):
    """錯誤回應"""
    code: str
    message: str


def get_client_ip(request: Request) -> str:
    """取得客戶端 IP"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}


def validate_file_extension(filename: str) -> bool:
    """驗證檔案副檔名"""
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


@router.post("/jobs", response_model=JobResponse, status_code=201)
async def create_job(request: Request, body: CreateJobRequest):
    """
    建立處理任務（JSON 格式）

    支援 YouTube 網址提交
    """
    client_ip = get_client_ip(request)

    # 檢查頻率限制
    try:
        check_rate_limit(client_ip)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": str(e)}
        )

    # YouTube 任務
    if body.source_type != SourceType.YOUTUBE:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SOURCE_TYPE", "message": "JSON 格式僅支援 YouTube 網址"}
        )

    if not body.source_url:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_URL", "message": "請提供 YouTube 網址"}
        )

    # 驗證 YouTube 網址
    downloader = get_youtube_downloader()
    if not downloader.is_valid_url(body.source_url):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_URL", "message": "無效的 YouTube 網址格式"}
        )

    # 建立任務
    job = Job(
        source_type=body.source_type,
        source_url=body.source_url,
        client_ip=client_ip
    )

    # 加入佇列
    enqueue_job(job)

    return JobResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        expires_at=job.expires_at
    )


@router.post("/jobs/upload", response_model=JobResponse, status_code=201)
async def create_upload_job(
    request: Request,
    file: UploadFile = File(...)
):
    """
    建立上傳任務（multipart/form-data 格式）

    支援本地影片檔案上傳
    """
    client_ip = get_client_ip(request)

    # 檢查頻率限制
    try:
        check_rate_limit(client_ip)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": str(e)}
        )

    # 驗證檔案
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_FILE", "message": "請選擇檔案"}
        )

    if not validate_file_extension(file.filename):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_FILE_TYPE", "message": f"不支援的檔案格式，支援: {', '.join(ALLOWED_EXTENSIONS)}"}
        )

    # 檢查檔案大小
    file_size = 0
    chunk_size = 1024 * 1024  # 1MB
    content = b""

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        file_size += len(chunk)
        content += chunk
        if file_size > settings.max_upload_size:
            raise HTTPException(
                status_code=400,
                detail={"code": "FILE_TOO_LARGE", "message": f"檔案大小超過限制 ({settings.max_upload_size // (1024*1024)}MB)"}
            )

    # 建立任務
    job = Job(
        source_type=SourceType.UPLOAD,
        source_filename=file.filename,
        client_ip=client_ip
    )

    # 儲存上傳檔案到 MinIO
    storage = get_storage_service()
    ext = os.path.splitext(file.filename)[1]
    upload_key = f"uploads/{job.id}/input{ext}"

    # 寫入暫存檔案再上傳
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        storage.upload_file(tmp_path, upload_key)
    finally:
        os.unlink(tmp_path)

    # 記錄上傳路徑
    job.source_url = upload_key

    # 加入佇列
    enqueue_job(job)

    return JobResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        expires_at=job.expires_at
    )


@router.get("/jobs/{job_id}", response_model=JobWithResultResponse)
async def get_job(job_id: str):
    """
    查詢任務狀態

    取得指定任務的處理狀態和進度
    """
    job = get_job_from_redis(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"code": "JOB_NOT_FOUND", "message": "任務不存在或已過期"}
        )

    result_response = None
    if job.status == JobStatus.COMPLETED and job.result_key:
        storage = get_storage_service()
        # 取得檔案大小
        file_size = storage.get_file_size(job.result_key)
        # 產生下載 URL
        download_url = storage.get_presigned_url(job.result_key)
        result_response = ResultResponse(
            original_duration=job.original_duration,
            output_size=file_size,
            download_url=download_url
        )

    return JobWithResultResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        expires_at=job.expires_at,
        result=result_response
    )


@router.get("/jobs/{job_id}/download")
async def download_result(job_id: str):
    """
    下載處理結果

    直接串流檔案給用戶下載
    """
    job = get_job_from_redis(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={"code": "JOB_NOT_FOUND", "message": "任務不存在或已過期"}
        )

    if job.status != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail={"code": "JOB_NOT_COMPLETED", "message": "任務尚未完成"}
        )

    if not job.result_key:
        raise HTTPException(
            status_code=400,
            detail={"code": "NO_RESULT", "message": "找不到結果檔案"}
        )

    storage = get_storage_service()

    # 串流下載檔案
    def file_iterator():
        response = storage.client.get_object(Bucket=storage.bucket, Key=job.result_key)
        body = response['Body']
        for chunk in body.iter_chunks(chunk_size=32 * 1024):  # 32KB chunks
            yield chunk
        body.close()

    # 取得檔案大小
    file_size = storage.get_file_size(job.result_key)

    # 設定檔案名稱 - 使用原始標題
    if job.source_title:
        # 清理檔名中的特殊字元
        safe_title = re.sub(r'[<>:"/\\|?*]', '_', job.source_title)
        safe_title = safe_title.strip()[:100]  # 限制長度
        filename = f"{safe_title}_伴奏.mp4"
    else:
        filename = f"karaoke_{job_id}.mp4"

    # 使用 RFC 5987 編碼處理非 ASCII 字元
    filename_encoded = quote(filename, safe='')

    return StreamingResponse(
        file_iterator(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}",
            "Content-Length": str(file_size)
        }
    )
