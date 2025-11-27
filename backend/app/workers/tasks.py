import os
import tempfile
import shutil
from datetime import datetime
from typing import Optional

import redis
from rq import Queue, get_current_job

from app.core.config import get_settings
from app.models.job import Job, JobStatus, SourceType
from app.services.storage import get_storage_service


settings = get_settings()

# Redis connection
redis_conn = redis.from_url(settings.redis_url)

# RQ Queue
task_queue = Queue("default", connection=redis_conn)


def get_job_from_redis(job_id: str) -> Optional[Job]:
    """從 Redis 取得 Job"""
    data = redis_conn.get(f"job:{job_id}")
    if data:
        return Job.model_validate_json(data)
    return None


def save_job_to_redis(job: Job):
    """儲存 Job 到 Redis"""
    redis_conn.setex(
        f"job:{job.id}",
        settings.result_expiry_hours * 3600,
        job.model_dump_json()
    )


def update_job_progress(job_id: str, progress: int, stage: str, status: Optional[JobStatus] = None):
    """更新 Job 進度"""
    job = get_job_from_redis(job_id)
    if job:
        job.progress = progress
        job.current_stage = stage
        if status:
            job.status = status
        job.updated_at = datetime.utcnow()
        save_job_to_redis(job)


def fail_job(job_id: str, error_message: str):
    """標記 Job 失敗"""
    job = get_job_from_redis(job_id)
    if job:
        job.status = JobStatus.FAILED
        job.error_message = error_message
        job.updated_at = datetime.utcnow()
        save_job_to_redis(job)


def complete_job(job_id: str, result_key: str):
    """標記 Job 完成"""
    job = get_job_from_redis(job_id)
    if job:
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_stage = "完成"
        job.result_key = result_key
        job.updated_at = datetime.utcnow()
        save_job_to_redis(job)


def enqueue_job(job: Job):
    """將 Job 加入佇列"""
    save_job_to_redis(job)

    if job.source_type == SourceType.YOUTUBE:
        task_queue.enqueue(
            process_youtube_job,
            job.id,
            job_timeout=settings.job_timeout_minutes * 60
        )
    else:
        task_queue.enqueue(
            process_upload_job,
            job.id,
            job_timeout=settings.job_timeout_minutes * 60
        )


def process_youtube_job(job_id: str):
    """
    處理 YouTube 任務

    流程：下載 → 分離人聲 → 合併 → 上傳結果
    """
    from app.services.youtube import get_youtube_downloader
    from app.services.separator import get_separator
    from app.services.merger import get_merger

    job = get_job_from_redis(job_id)
    if not job:
        return

    temp_dir = None
    try:
        # 建立暫存目錄
        temp_dir = tempfile.mkdtemp()

        # === 階段 1: 下載 YouTube 影片 ===
        update_job_progress(job_id, 0, "下載影片中...", JobStatus.DOWNLOADING)

        downloader = get_youtube_downloader()

        def download_progress(progress, stage):
            # 下載佔 0-20%
            update_job_progress(job_id, int(progress * 0.2), stage)

        video_path = downloader.download(
            url=job.source_url,
            output_dir=temp_dir,
            progress_callback=download_progress
        )

        # 取得影片時長
        info = downloader.get_video_info(job.source_url)
        original_duration = info.get('duration', 0)

        # 更新 job 的時長資訊
        job = get_job_from_redis(job_id)
        if job:
            job.original_duration = original_duration
            save_job_to_redis(job)

        # === 階段 2: 提取音頻 ===
        update_job_progress(job_id, 20, "提取音頻中...", JobStatus.SEPARATING)

        merger = get_merger()
        audio_path = os.path.join(temp_dir, "audio.wav")
        merger.extract_audio(video_path, audio_path)

        # === 階段 3: 分離人聲 ===
        update_job_progress(job_id, 30, "分離人聲中...", JobStatus.SEPARATING)

        separator = get_separator()
        separation_dir = os.path.join(temp_dir, "separated")

        def separation_progress(progress, stage):
            # 分離佔 30-70%
            update_job_progress(job_id, 30 + int(progress * 0.4), stage)

        separation_result = separator.separate(
            input_path=audio_path,
            output_dir=separation_dir,
            progress_callback=separation_progress
        )

        background_audio = separation_result["background"]

        # === 階段 4: 合併影片 ===
        update_job_progress(job_id, 70, "合併影片中...", JobStatus.MERGING)

        output_path = os.path.join(temp_dir, "output.mp4")

        def merge_progress(progress, stage):
            # 合併佔 70-90%
            update_job_progress(job_id, 70 + int(progress * 0.2), stage)

        merger.process_video(
            input_video_path=video_path,
            background_audio_path=background_audio,
            output_path=output_path,
            progress_callback=merge_progress
        )

        # === 階段 5: 上傳結果 ===
        update_job_progress(job_id, 90, "上傳結果中...")

        storage = get_storage_service()
        result_key = f"results/{job_id}/output.mp4"
        storage.upload_file(output_path, result_key)

        # 完成
        complete_job(job_id, result_key)

    except Exception as e:
        fail_job(job_id, str(e))
        raise
    finally:
        # 清理暫存目錄
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def process_upload_job(job_id: str):
    """
    處理上傳任務

    流程：分離人聲 → 合併 → 上傳結果
    """
    # 將在 Phase 4 (US2) 中實作完整邏輯
    pass
