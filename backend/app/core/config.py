from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """應用程式配置"""

    # App
    app_name: str = "人聲去除服務"
    debug: bool = False

    # Local Storage
    data_dir: str = "/data"
    uploads_dir: str = "/data/uploads"
    results_dir: str = "/data/results"

    # File constraints
    max_video_duration: int = 600  # 10 minutes in seconds
    job_timeout_minutes: int = 30

    # Concurrency
    max_concurrent_jobs: int = 2

    # Processing
    device: str = "cpu"  # cuda or cpu

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """取得快取的設定實例"""
    return Settings()
