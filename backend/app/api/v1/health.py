"""
Health API Endpoints
精簡版 - 僅 YouTube 下載代理
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    健康檢查

    告訴前端後端支援的功能
    """
    return {
        "status": "healthy",
        "version": "2.0.0",
        "features": {
            "youtube": True,   # 支援 YouTube 下載
            "ffmpeg": False,   # FFmpeg 處理已移至前端 (ffmpeg.wasm)
        }
    }
