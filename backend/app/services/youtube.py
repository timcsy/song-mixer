import os
import re
import tempfile
from pathlib import Path
from typing import Callable, Optional

import yt_dlp

from app.core.config import get_settings


class YouTubeDownloader:
    """yt-dlp YouTube 下載服務"""

    YOUTUBE_URL_PATTERN = re.compile(
        r'^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[a-zA-Z0-9_-]{11}'
    )

    def __init__(self):
        settings = get_settings()
        self.max_duration = settings.max_video_duration

    def is_valid_url(self, url: str) -> bool:
        """
        驗證是否為有效的 YouTube 網址

        Args:
            url: YouTube 網址

        Returns:
            是否有效
        """
        return bool(self.YOUTUBE_URL_PATTERN.match(url))

    def get_video_info(self, url: str) -> dict:
        """
        取得影片資訊

        Args:
            url: YouTube 網址

        Returns:
            dict: 包含 title, duration, thumbnail
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', None),
                'video_id': info.get('id', None)
            }

    def download(
        self,
        url: str,
        output_dir: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> str:
        """
        下載 YouTube 影片

        Args:
            url: YouTube 網址
            output_dir: 輸出目錄
            progress_callback: 進度回調函數 (progress, stage)

        Returns:
            下載的檔案路徑

        Raises:
            ValueError: 網址無效或影片過長
            RuntimeError: 下載失敗
        """
        if not self.is_valid_url(url):
            raise ValueError("無效的 YouTube 網址")

        # 取得影片資訊檢查時長
        if progress_callback:
            progress_callback(0, "取得影片資訊中...")

        info = self.get_video_info(url)
        duration = info.get('duration', 0)

        if duration > self.max_duration:
            raise ValueError(f"影片長度 {duration} 秒超過限制 {self.max_duration} 秒")

        # 確保輸出目錄存在
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # 設定下載選項
        output_template = str(output_path / '%(id)s.%(ext)s')

        def progress_hook(d):
            if progress_callback and d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                downloaded = d.get('downloaded_bytes', 0)
                if total > 0:
                    percent = int((downloaded / total) * 100)
                    progress_callback(percent, "下載中...")

        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [progress_hook],
            'merge_output_format': 'mp4',
        }

        if progress_callback:
            progress_callback(5, "開始下載...")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
                video_id = info['id']
                # 找到下載的檔案
                for ext in ['mp4', 'mkv', 'webm']:
                    filepath = output_path / f"{video_id}.{ext}"
                    if filepath.exists():
                        if progress_callback:
                            progress_callback(100, "下載完成")
                        return str(filepath)
                raise RuntimeError("下載後找不到檔案")
            except yt_dlp.DownloadError as e:
                raise RuntimeError(f"下載失敗: {str(e)}")


# Global instance
_downloader: Optional[YouTubeDownloader] = None


def get_youtube_downloader() -> YouTubeDownloader:
    """取得下載器實例"""
    global _downloader
    if _downloader is None:
        _downloader = YouTubeDownloader()
    return _downloader
