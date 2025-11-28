from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """應用程式配置"""

    # App
    app_name: str = "人聲去除服務"
    debug: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "vocal-remover"
    minio_secure: bool = False

    # Rate limiting
    rate_limit_requests: int = 12
    rate_limit_window_seconds: int = 3600  # 1 hour

    # File constraints
    max_upload_size: int = 524288000  # 500MB in bytes
    max_video_duration: int = 600  # 10 minutes in seconds
    result_expiry_hours: int = 24
    job_timeout_minutes: int = 30

    # Processing
    device: str = "cpu"  # cuda or cpu

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """取得快取的設定實例"""
    return Settings()
