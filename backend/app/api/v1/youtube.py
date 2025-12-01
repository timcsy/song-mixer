"""
YouTube API Endpoints
精簡版 - 僅 YouTube 下載代理

提供 YouTube 影片下載功能
分離下載影片和音訊，下載完成後立即清理
"""
import os
import io
import logging
import tempfile
import zipfile
import threading
import time
from typing import Dict, Any
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.youtube import get_youtube_downloader

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/youtube", tags=["youtube"])

# 任務設定
TASK_TIMEOUT = 600  # 10 分鐘後自動清理任務
MAX_VIDEO_DURATION = 600  # 最大影片時長 10 分鐘

# 下載進度儲存（簡單的記憶體儲存，key 為 task_id）
download_tasks: Dict[str, Dict[str, Any]] = {}
_cleanup_lock = threading.Lock()


def _cleanup_old_tasks():
    """清理過期任務"""
    with _cleanup_lock:
        now = time.time()
        expired = [
            task_id for task_id, task in download_tasks.items()
            if now - task.get('created_at', 0) > TASK_TIMEOUT
        ]
        for task_id in expired:
            task = download_tasks.pop(task_id, None)
            if task and 'tmpdir' in task:
                import shutil
                try:
                    shutil.rmtree(task['tmpdir'], ignore_errors=True)
                except:
                    pass
            logger.info(f"清理過期任務: {task_id}")


class YouTubeDownloadRequest(BaseModel):
    """YouTube 下載請求"""
    url: str


def _download_task(task_id: str, url: str):
    """背景下載任務"""
    downloader = get_youtube_downloader()
    task = download_tasks[task_id]

    try:
        # 取得影片資訊
        task['stage'] = 'info'
        task['message'] = '取得影片資訊...'
        info = downloader.get_video_info(url)
        task['title'] = info.get('title', 'Unknown')
        task['duration'] = info.get('duration', 0)
        task['thumbnail'] = info.get('thumbnail', '')

        if task['duration'] > MAX_VIDEO_DURATION:
            task['status'] = 'error'
            task['error'] = f"影片時長 {task['duration']} 秒超過限制 {MAX_VIDEO_DURATION} 秒"
            return

        # 建立暫存目錄
        tmpdir = tempfile.mkdtemp()
        task['tmpdir'] = tmpdir

        # 進度回調
        def progress_callback(progress: int, stage: str):
            task['progress'] = progress
            task['message'] = stage

        # 下載
        task['stage'] = 'downloading'
        video_path, audio_path = downloader.download_separate(url, tmpdir, progress_callback)

        # 建立 ZIP
        task['stage'] = 'packaging'
        task['message'] = '打包檔案...'
        task['progress'] = 95

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            video_ext = os.path.splitext(video_path)[1]
            zf.write(video_path, f"video{video_ext}")
            audio_ext = os.path.splitext(audio_path)[1]
            zf.write(audio_path, f"audio{audio_ext}")

        zip_buffer.seek(0)
        task['result'] = zip_buffer.getvalue()
        task['status'] = 'completed'
        task['progress'] = 100
        task['message'] = '下載完成'

    except Exception as e:
        logger.error(f"下載失敗: {e}")
        task['status'] = 'error'
        task['error'] = str(e)
    finally:
        # 清理暫存目錄
        if 'tmpdir' in task:
            import shutil
            try:
                shutil.rmtree(task['tmpdir'])
            except:
                pass


@router.post("/download/start")
async def start_download(request: YouTubeDownloadRequest):
    """
    啟動 YouTube 下載任務

    Returns:
        task_id 用於查詢進度和取得結果
    """
    import uuid

    # 清理過期任務
    _cleanup_old_tasks()

    downloader = get_youtube_downloader()

    if not downloader.is_valid_url(request.url):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_URL", "message": "無效的 YouTube 網址"}
        )

    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {
        'status': 'pending',
        'progress': 0,
        'message': '準備下載...',
        'stage': 'init',
        'title': '',
        'duration': 0,
        'thumbnail': '',
        'created_at': time.time(),
    }

    # 在背景執行下載
    thread = threading.Thread(target=_download_task, args=(task_id, request.url))
    thread.start()

    return {"task_id": task_id}


@router.get("/download/progress/{task_id}")
async def get_download_progress(task_id: str):
    """查詢下載進度"""
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="任務不存在")

    task = download_tasks[task_id]
    return {
        "status": task['status'],
        "progress": task['progress'],
        "message": task['message'],
        "stage": task.get('stage', ''),
        "title": task.get('title', ''),
        "duration": task.get('duration', 0),
        "thumbnail": task.get('thumbnail', ''),
        "error": task.get('error'),
    }


@router.get("/download/result/{task_id}")
async def get_download_result(task_id: str):
    """取得下載結果"""
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="任務不存在")

    task = download_tasks[task_id]

    if task['status'] == 'error':
        # 清理任務
        del download_tasks[task_id]
        raise HTTPException(
            status_code=500,
            detail={"code": "DOWNLOAD_ERROR", "message": task.get('error', '下載失敗')}
        )

    if task['status'] != 'completed':
        raise HTTPException(
            status_code=202,
            detail={"code": "NOT_READY", "message": "下載尚未完成"}
        )

    result = task['result']
    title = task.get('title', 'Unknown')
    duration = task.get('duration', 0)
    thumbnail = task.get('thumbnail', '')

    # 清理任務
    del download_tasks[task_id]

    return Response(
        content=result,
        media_type="application/zip",
        headers={
            "X-Video-Title": quote(title),
            "X-Video-Duration": str(duration),
            "X-Video-Thumbnail": thumbnail or "",
            "Content-Disposition": "attachment; filename=youtube_download.zip",
        }
    )
