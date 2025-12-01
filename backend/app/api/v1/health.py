"""
Health API Endpoints
Feature: 005-frontend-processing

提供後端健康檢查與功能偵測
"""
from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check():
    """
    健康檢查

    檢查服務是否正常運作，並告訴前端後端支援的功能
    """
    storage_ok = False

    # Check local storage directories
    try:
        uploads_path = Path(settings.uploads_dir)
        results_path = Path(settings.results_dir)
        storage_ok = uploads_path.exists() and results_path.exists()
    except Exception:
        pass

    status = "healthy" if storage_ok else "unhealthy"

    return {
        "status": status,
        "storage": storage_ok,
        "version": "2.0.0",  # 005-frontend-processing
        # 告訴前端後端支援的功能
        "features": {
            "youtube": True,  # 支援 YouTube 下載
            "ffmpeg": False,  # FFmpeg 處理已移至前端 (ffmpeg.wasm)
        }
    }
