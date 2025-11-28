import os
import tempfile
import shutil
import threading
import logging
from typing import Optional

from app.core.config import get_settings
from app.models.job import Job, JobStatus, SourceType, TrackPaths
from app.services.job_manager import get_job_manager
from app.services.local_storage import get_local_storage
from app.services.separator import get_separator
from app.services.merger import get_merger
from app.services.youtube import get_youtube_downloader

logger = logging.getLogger(__name__)


def process_job_async(job: Job):
    """
    在背景執行緒中處理任務

    Args:
        job: 任務物件
    """
    thread = threading.Thread(target=_process_job, args=(job,), daemon=True)
    thread.start()


def _process_job(job: Job):
    """
    處理任務（在背景執行緒中執行）
    """
    job_manager = get_job_manager()
    storage = get_local_storage()

    try:
        job_manager.increment_processing()

        if job.source_type == SourceType.YOUTUBE:
            _process_youtube_job(job)
        else:
            _process_upload_job(job)

    except Exception as e:
        logger.error(f"任務處理失敗 {job.id}: {e}")
        job_manager.fail_job(job.id, str(e))
    finally:
        job_manager.decrement_processing()


def _process_youtube_job(job: Job):
    """處理 YouTube 任務"""
    job_manager = get_job_manager()
    storage = get_local_storage()

    temp_dir = None
    try:
        # 建立暫存目錄
        temp_dir = tempfile.mkdtemp()

        # === 階段 1: 下載 YouTube 影片 ===
        job_manager.update_progress(job.id, 0, "下載影片中...", JobStatus.DOWNLOADING)

        downloader = get_youtube_downloader()

        def download_progress(progress, stage):
            job_manager.update_progress(job.id, int(progress * 0.2), stage)

        video_path = downloader.download(
            url=job.source_url,
            output_dir=temp_dir,
            progress_callback=download_progress
        )

        # 取得影片資訊
        info = downloader.get_video_info(job.source_url)
        job_manager.update_job(
            job.id,
            original_duration=info.get('duration', 0),
            source_title=info.get('title', '')
        )

        # === 階段 2: 提取音頻 ===
        job_manager.update_progress(job.id, 20, "提取音頻中...", JobStatus.SEPARATING)

        merger = get_merger()
        audio_path = os.path.join(temp_dir, "audio.wav")
        merger.extract_audio(video_path, audio_path)

        # === 階段 3: 分離人聲 ===
        job_manager.update_progress(job.id, 30, "分離人聲中...", JobStatus.SEPARATING)

        separator = get_separator()
        separation_dir = os.path.join(temp_dir, "separated")

        def separation_progress(progress, stage):
            job_manager.update_progress(job.id, 30 + int(progress * 0.4), stage)

        separation_result = separator.separate(
            input_path=audio_path,
            output_dir=separation_dir,
            progress_callback=separation_progress
        )

        background_audio = separation_result["background"]

        # === 階段 3.5: 複製四軌到結果目錄 ===
        track_paths = {}
        if "tracks" in separation_result:
            for track_name, track_src in separation_result["tracks"].items():
                track_dst = storage.get_result_path(job.id, f"{track_name}.wav")
                shutil.copy2(track_src, str(track_dst))
                track_paths[track_name] = str(track_dst)

            job_manager.update_job(
                job.id,
                track_paths=TrackPaths(**track_paths),
                sample_rate=separation_result.get("sample_rate")
            )

        # === 階段 4: 合併影片 ===
        job_manager.update_progress(job.id, 70, "合併影片中...", JobStatus.MERGING)

        result_path = storage.get_result_path(job.id, "output.mp4")

        def merge_progress(progress, stage):
            job_manager.update_progress(job.id, 70 + int(progress * 0.25), stage)

        merger.process_video(
            input_video_path=video_path,
            background_audio_path=background_audio,
            output_path=str(result_path),
            progress_callback=merge_progress
        )

        # 完成
        job_manager.complete_job(job.id, str(result_path))
        logger.info(f"任務完成 {job.id}")

    finally:
        # 清理暫存目錄
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def _process_upload_job(job: Job):
    """處理上傳任務"""
    job_manager = get_job_manager()
    storage = get_local_storage()

    temp_dir = None
    try:
        # 建立暫存目錄
        temp_dir = tempfile.mkdtemp()

        # === 階段 1: 準備上傳檔案 ===
        job_manager.update_progress(job.id, 0, "準備檔案中...", JobStatus.DOWNLOADING)

        # 上傳檔案路徑已在 job.source_url 中
        video_path = job.source_url

        if not os.path.exists(video_path):
            raise RuntimeError(f"找不到上傳檔案: {video_path}")

        # === 階段 2: 提取音頻 ===
        job_manager.update_progress(job.id, 10, "提取音頻中...", JobStatus.SEPARATING)

        merger = get_merger()
        audio_path = os.path.join(temp_dir, "audio.wav")
        merger.extract_audio(video_path, audio_path)

        # 取得影片時長
        video_info = merger.get_video_info(video_path)
        job_manager.update_job(
            job.id,
            original_duration=int(video_info.get('duration', 0))
        )

        # === 階段 3: 分離人聲 ===
        job_manager.update_progress(job.id, 20, "分離人聲中...", JobStatus.SEPARATING)

        separator = get_separator()
        separation_dir = os.path.join(temp_dir, "separated")

        def separation_progress(progress, stage):
            job_manager.update_progress(job.id, 20 + int(progress * 0.5), stage)

        separation_result = separator.separate(
            input_path=audio_path,
            output_dir=separation_dir,
            progress_callback=separation_progress
        )

        background_audio = separation_result["background"]

        # === 階段 3.5: 複製四軌到結果目錄 ===
        track_paths = {}
        if "tracks" in separation_result:
            for track_name, track_src in separation_result["tracks"].items():
                track_dst = storage.get_result_path(job.id, f"{track_name}.wav")
                shutil.copy2(track_src, str(track_dst))
                track_paths[track_name] = str(track_dst)

            job_manager.update_job(
                job.id,
                track_paths=TrackPaths(**track_paths),
                sample_rate=separation_result.get("sample_rate")
            )

        # === 階段 4: 合併影片 ===
        job_manager.update_progress(job.id, 70, "合併影片中...", JobStatus.MERGING)

        result_path = storage.get_result_path(job.id, "output.mp4")

        def merge_progress(progress, stage):
            job_manager.update_progress(job.id, 70 + int(progress * 0.25), stage)

        merger.process_video(
            input_video_path=video_path,
            background_audio_path=background_audio,
            output_path=str(result_path),
            progress_callback=merge_progress
        )

        # 完成
        job_manager.complete_job(job.id, str(result_path))
        logger.info(f"任務完成 {job.id}")

    finally:
        # 清理暫存目錄
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
