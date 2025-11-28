from enum import Enum
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class SourceType(str, Enum):
    """來源類型"""
    YOUTUBE = "youtube"
    UPLOAD = "upload"


class JobStatus(str, Enum):
    """任務狀態"""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    SEPARATING = "separating"
    MERGING = "merging"
    MIXING = "mixing"  # 新增：混音處理中
    COMPLETED = "completed"
    FAILED = "failed"


class OutputFormat(str, Enum):
    """輸出格式"""
    MP4 = "mp4"   # 影片 + 音頻
    MP3 = "mp3"   # 純音頻 (lossy)
    M4A = "m4a"   # 純音頻 (AAC)
    WAV = "wav"   # 純音頻 (lossless)


class TrackPaths(BaseModel):
    """分離後的音軌檔案路徑"""
    drums: Optional[str] = None
    bass: Optional[str] = None
    other: Optional[str] = None
    vocals: Optional[str] = None


class MixSettings(BaseModel):
    """混音設定"""
    drums_volume: float = Field(1.0, ge=0.0, le=2.0)
    bass_volume: float = Field(1.0, ge=0.0, le=2.0)
    other_volume: float = Field(1.0, ge=0.0, le=2.0)
    vocals_volume: float = Field(0.0, ge=0.0, le=2.0)  # 預設關閉人聲
    pitch_shift: int = Field(0, ge=-12, le=12)
    output_format: OutputFormat = OutputFormat.MP4


class Job(BaseModel):
    """任務資料模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_type: SourceType
    source_url: Optional[str] = None
    source_filename: Optional[str] = None
    source_title: Optional[str] = None  # 原始影片/檔案標題
    status: JobStatus = JobStatus.PENDING
    progress: int = Field(default=0, ge=0, le=100)
    current_stage: Optional[str] = None
    error_message: Optional[str] = None
    result_key: Optional[str] = None
    original_duration: Optional[int] = None
    client_ip: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(hours=24)
    )
    # 進階音軌控制功能
    track_paths: Optional[TrackPaths] = None
    sample_rate: Optional[int] = None

    def update_status(self, status: JobStatus, progress: int = None, stage: str = None):
        """更新任務狀態"""
        self.status = status
        self.updated_at = datetime.utcnow()
        if progress is not None:
            self.progress = progress
        if stage is not None:
            self.current_stage = stage
        if status == JobStatus.COMPLETED:
            self.completed_at = datetime.utcnow()
            self.progress = 100

    def set_failed(self, error_message: str):
        """設定任務失敗"""
        self.status = JobStatus.FAILED
        self.error_message = error_message
        self.updated_at = datetime.utcnow()

    def to_dict(self) -> dict:
        """轉換為字典"""
        return {
            "id": self.id,
            "source_type": self.source_type.value,
            "source_url": self.source_url,
            "source_filename": self.source_filename,
            "status": self.status.value,
            "progress": self.progress,
            "current_stage": self.current_stage,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }


