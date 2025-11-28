import os
import re
from datetime import datetime
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Header
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.models.job import Job, JobStatus, SourceType
from app.services.youtube import get_youtube_downloader
from app.services.local_storage import get_local_storage
from app.services.job_manager import get_job_manager
from app.services.processor import process_job_async


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
    updated_at: datetime


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
    job_manager = get_job_manager()

    # 檢查並發限制
    if not job_manager.can_accept_job():
        raise HTTPException(
            status_code=503,
            detail={"code": "SERVICE_BUSY", "message": "伺服器忙碌中，請稍後再試"}
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

    # 儲存任務狀態
    job_manager.create_job(job)

    # 啟動背景處理
    process_job_async(job)

    return JobResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at
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
    job_manager = get_job_manager()
    storage = get_local_storage()

    # 檢查並發限制
    if not job_manager.can_accept_job():
        raise HTTPException(
            status_code=503,
            detail={"code": "SERVICE_BUSY", "message": "伺服器忙碌中，請稍後再試"}
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

    # 建立任務
    job = Job(
        source_type=SourceType.UPLOAD,
        source_filename=file.filename,
        client_ip=client_ip
    )

    # 讀取檔案內容
    content = await file.read()

    # 儲存上傳檔案到本地
    ext = os.path.splitext(file.filename)[1]
    upload_path = storage.save_upload(job.id, f"input{ext}", content)

    # 記錄上傳路徑
    job.source_url = upload_path
    job.source_title = os.path.splitext(file.filename)[0]

    # 儲存任務狀態
    job_manager.create_job(job)

    # 啟動背景處理
    process_job_async(job)

    return JobResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at
    )


@router.get("/jobs/{job_id}", response_model=JobWithResultResponse)
async def get_job(job_id: str):
    """
    查詢任務狀態

    取得指定任務的處理狀態和進度
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={"code": "JOB_NOT_FOUND", "message": "任務不存在或已過期"}
        )

    result_response = None
    if job.status == JobStatus.COMPLETED and job.result_key:
        # 取得檔案大小
        if os.path.exists(job.result_key):
            file_size = os.path.getsize(job.result_key)
            result_response = ResultResponse(
                original_duration=job.original_duration,
                output_size=file_size,
                download_url=f"/api/v1/jobs/{job_id}/download"
            )

    return JobWithResultResponse(
        id=job.id,
        source_type=job.source_type,
        status=job.status,
        progress=job.progress,
        current_stage=job.current_stage,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        result=result_response
    )


@router.get("/jobs/{job_id}/download")
async def download_result(job_id: str):
    """
    下載處理結果

    直接串流檔案給用戶下載
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

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

    if not job.result_key or not os.path.exists(job.result_key):
        raise HTTPException(
            status_code=400,
            detail={"code": "NO_RESULT", "message": "找不到結果檔案"}
        )

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

    return FileResponse(
        path=job.result_key,
        media_type="video/mp4",
        filename=filename,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"
        }
    )


@router.get("/jobs/{job_id}/stream")
async def stream_result(job_id: str, range: Optional[str] = Header(None)):
    """
    串流播放處理結果（支援 Range 請求）

    用於影片預覽播放，支援跳轉播放位置
    """
    job_manager = get_job_manager()
    job = job_manager.get_job(job_id)

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

    if not job.result_key or not os.path.exists(job.result_key):
        raise HTTPException(
            status_code=400,
            detail={"code": "NO_RESULT", "message": "找不到結果檔案"}
        )

    file_path = job.result_key
    file_size = os.path.getsize(file_path)

    # 解析 Range header
    start = 0
    end = file_size - 1

    if range:
        # 格式: bytes=start-end
        range_match = re.match(r'bytes=(\d+)-(\d*)', range)
        if range_match:
            start = int(range_match.group(1))
            if range_match.group(2):
                end = int(range_match.group(2))

    # 限制範圍
    if start >= file_size:
        raise HTTPException(status_code=416, detail="Range not satisfiable")

    end = min(end, file_size - 1)
    content_length = end - start + 1

    # 從本地檔案取得指定範圍的資料
    def range_file_iterator():
        with open(file_path, 'rb') as f:
            f.seek(start)
            remaining = content_length
            chunk_size = 64 * 1024  # 64KB chunks
            while remaining > 0:
                read_size = min(chunk_size, remaining)
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": "video/mp4",
    }

    # 如果有 Range 請求，返回 206 Partial Content
    status_code = 206 if range else 200

    return StreamingResponse(
        range_file_iterator(),
        status_code=status_code,
        media_type="video/mp4",
        headers=headers
    )
