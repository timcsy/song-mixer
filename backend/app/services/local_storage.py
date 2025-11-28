import os
import shutil
from pathlib import Path
from typing import Optional

from app.core.config import get_settings


class LocalStorage:
    """本地檔案系統儲存服務"""

    def __init__(self):
        settings = get_settings()
        self.uploads_dir = Path(settings.uploads_dir)
        self.results_dir = Path(settings.results_dir)
        self._ensure_dirs()

    def _ensure_dirs(self):
        """確保目錄存在"""
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)

    def get_upload_path(self, job_id: str, filename: str) -> Path:
        """取得上傳檔案路徑"""
        job_dir = self.uploads_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir / filename

    def get_result_path(self, job_id: str, filename: str = "output.mp4") -> Path:
        """取得結果檔案路徑"""
        job_dir = self.results_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir / filename

    def save_upload(self, job_id: str, filename: str, content: bytes) -> str:
        """
        儲存上傳檔案

        Args:
            job_id: 任務 ID
            filename: 檔案名稱
            content: 檔案內容

        Returns:
            檔案路徑
        """
        file_path = self.get_upload_path(job_id, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        return str(file_path)

    def get_upload(self, job_id: str, filename: str) -> Optional[bytes]:
        """
        讀取上傳檔案

        Args:
            job_id: 任務 ID
            filename: 檔案名稱

        Returns:
            檔案內容或 None
        """
        file_path = self.get_upload_path(job_id, filename)
        if file_path.exists():
            with open(file_path, "rb") as f:
                return f.read()
        return None

    def file_exists(self, path: str) -> bool:
        """檢查檔案是否存在"""
        return Path(path).exists()

    def get_file_size(self, path: str) -> Optional[int]:
        """取得檔案大小"""
        p = Path(path)
        if p.exists():
            return p.stat().st_size
        return None

    def delete_job_files(self, job_id: str):
        """刪除任務相關檔案"""
        upload_dir = self.uploads_dir / job_id
        result_dir = self.results_dir / job_id

        if upload_dir.exists():
            shutil.rmtree(upload_dir, ignore_errors=True)
        if result_dir.exists():
            shutil.rmtree(result_dir, ignore_errors=True)


# Global instance
_storage: Optional[LocalStorage] = None


def get_local_storage() -> LocalStorage:
    """取得儲存服務實例"""
    global _storage
    if _storage is None:
        _storage = LocalStorage()
    return _storage
