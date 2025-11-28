from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings
from app.services.job_manager import get_job_manager

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check():
    """
    健康檢查

    檢查服務是否正常運作
    """
    storage_ok = False

    # Check local storage directories
    try:
        uploads_path = Path(settings.uploads_dir)
        results_path = Path(settings.results_dir)
        storage_ok = uploads_path.exists() and results_path.exists()
    except Exception:
        pass

    # Get processing status
    job_manager = get_job_manager()
    processing_count = job_manager.get_processing_count()

    status = "healthy" if storage_ok else "unhealthy"

    return {
        "status": status,
        "storage": storage_ok,
        "processing_jobs": processing_count,
        "max_concurrent_jobs": settings.max_concurrent_jobs,
        "version": "1.0.0"
    }
