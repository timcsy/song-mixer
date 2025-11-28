import threading
from datetime import datetime
from typing import Dict, Optional, Callable

from app.core.config import get_settings
from app.models.job import Job, JobStatus


class JobManager:
    """記憶體任務狀態管理"""

    def __init__(self):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()
        self._processing_count = 0
        settings = get_settings()
        self._max_concurrent = settings.max_concurrent_jobs

    def create_job(self, job: Job) -> Job:
        """建立任務"""
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        """取得任務"""
        with self._lock:
            return self._jobs.get(job_id)

    def update_job(self, job_id: str, **kwargs) -> Optional[Job]:
        """更新任務"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                for key, value in kwargs.items():
                    if hasattr(job, key):
                        setattr(job, key, value)
                job.updated_at = datetime.utcnow()
            return job

    def update_progress(self, job_id: str, progress: int, stage: str, status: Optional[JobStatus] = None):
        """更新任務進度"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.progress = progress
                job.current_stage = stage
                if status:
                    job.status = status
                job.updated_at = datetime.utcnow()

    def complete_job(self, job_id: str, result_path: str):
        """標記任務完成"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.COMPLETED
                job.progress = 100
                job.current_stage = "完成"
                job.result_key = result_path
                job.completed_at = datetime.utcnow()
                job.updated_at = datetime.utcnow()

    def fail_job(self, job_id: str, error_message: str):
        """標記任務失敗"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.FAILED
                job.error_message = error_message
                job.updated_at = datetime.utcnow()

    def delete_job(self, job_id: str) -> bool:
        """刪除任務"""
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                return True
            return False

    def can_accept_job(self) -> bool:
        """檢查是否可接受新任務"""
        with self._lock:
            return self._processing_count < self._max_concurrent

    def increment_processing(self):
        """增加處理中計數"""
        with self._lock:
            self._processing_count += 1

    def decrement_processing(self):
        """減少處理中計數"""
        with self._lock:
            if self._processing_count > 0:
                self._processing_count -= 1

    def get_processing_count(self) -> int:
        """取得處理中任務數量"""
        with self._lock:
            return self._processing_count


# Global instance
_job_manager: Optional[JobManager] = None


def get_job_manager() -> JobManager:
    """取得任務管理器實例"""
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
