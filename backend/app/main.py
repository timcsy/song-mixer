"""
Main Application Entry Point
Feature: 005-frontend-processing

後端僅提供 YouTube 下載代理
所有媒體處理（FFmpeg、Demucs）皆在前端執行
"""
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.api.v1 import health, youtube

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="人聲去除服務 - YouTube 下載代理",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """應用程式啟動事件"""
    # 確保資料目錄存在
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.results_dir).mkdir(parents=True, exist_ok=True)
    logger.info(f"資料目錄已就緒: {settings.data_dir}")
    logger.info(f"應用程式已啟動: {settings.app_name}")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全域例外處理"""
    logger.error(f"未處理的例外: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "內部伺服器錯誤，請稍後再試"
        }
    )


# Register routers
# 005-frontend-processing: 僅保留 YouTube 下載代理
app.include_router(health.router, prefix="/api/v1", tags=["健康檢查"])
app.include_router(youtube.router, prefix="/api/v1", tags=["YouTube"])


@app.get("/")
async def root():
    """根路徑"""
    return {
        "name": settings.app_name,
        "version": "2.0.0",
        "status": "running"
    }
