from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
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
    current_stage: str
    error_message: Optional[str]
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


@router.post("/jobs", response_model=JobResponse, status_code=201)
async def create_job(request: Request, body: CreateJobRequest):
    """
    建立處理任務

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

    # 目前只支援 YouTube
    if body.source_type != SourceType.YOUTUBE:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SOURCE_TYPE", "message": "目前僅支援 YouTube 網址"}
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

    重新導向至下載連結
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
    download_url = storage.get_presigned_url(job.result_key)

    return RedirectResponse(url=download_url, status_code=302)
