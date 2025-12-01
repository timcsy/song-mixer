"""
YouTube Downloader Service
精簡版 - 分離下載影片和音訊（不需要 FFmpeg）
"""
import logging
import os
import re
from pathlib import Path
from typing import Callable, Optional

import yt_dlp

logger = logging.getLogger(__name__)


class YouTubeDownloader:
    """yt-dlp YouTube 下載服務"""

    YOUTUBE_URL_PATTERN = re.compile(
        r'^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[a-zA-Z0-9_-]{11}'
    )

    def is_valid_url(self, url: str) -> bool:
        """驗證是否為有效的 YouTube 網址"""
        return bool(self.YOUTUBE_URL_PATTERN.match(url))

    def get_video_info(self, url: str) -> dict:
        """取得影片資訊"""
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
            }

    def download_separate(
        self,
        url: str,
        output_dir: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> tuple[str, str]:
        """
        分離下載 YouTube 影片和音訊（不需要 FFmpeg）

        Returns:
            (video_path, audio_path) 元組
        """
        if not self.is_valid_url(url):
            raise ValueError("無效的 YouTube 網址")

        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        video_id = self._extract_video_id(url)
        current_phase = {'name': 'video', 'base': 0}

        def progress_hook(d):
            if progress_callback:
                if d['status'] == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                    downloaded = d.get('downloaded_bytes', 0)
                    speed = d.get('speed', 0)
                    eta = d.get('eta', 0)

                    if total > 0:
                        phase_percent = (downloaded / total) * 100
                        overall_percent = current_phase['base'] + int(phase_percent * 0.5)

                        dl_mb = downloaded / (1024 * 1024)
                        total_mb = total / (1024 * 1024)
                        phase_name = "影片" if current_phase['name'] == 'video' else "音訊"
                        msg_parts = [f"下載{phase_name} {dl_mb:.1f}/{total_mb:.1f} MB"]

                        if speed and speed > 0:
                            msg_parts.append(f"{speed / (1024 * 1024):.1f} MB/s")
                        if eta and eta > 0:
                            if eta < 60:
                                msg_parts.append(f"剩餘 {int(eta)} 秒")
                            else:
                                msg_parts.append(f"剩餘 {int(eta/60)}:{int(eta%60):02d}")

                        progress_callback(overall_percent, " | ".join(msg_parts))
                elif d['status'] == 'finished':
                    msg = "影片下載完成" if current_phase['name'] == 'video' else "音訊下載完成"
                    progress_callback(current_phase['base'] + 50, msg)

        # 下載影片
        current_phase['name'] = 'video'
        current_phase['base'] = 0
        if progress_callback:
            progress_callback(0, "準備下載影片...")

        video_opts = {
            'format': 'bestvideo[ext=mp4][vcodec^=avc]/bestvideo[ext=mp4]/bestvideo',
            'outtmpl': str(output_path / f'{video_id}_video.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [progress_hook],
        }

        video_path = None
        with yt_dlp.YoutubeDL(video_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if 'requested_downloads' in info and info['requested_downloads']:
                video_path = info['requested_downloads'][0].get('filepath')

        if not video_path or not os.path.exists(video_path):
            for ext in ['mp4', 'webm', 'mkv']:
                filepath = output_path / f"{video_id}_video.{ext}"
                if filepath.exists():
                    video_path = str(filepath)
                    break

        # 下載音訊
        current_phase['name'] = 'audio'
        current_phase['base'] = 50
        if progress_callback:
            progress_callback(50, "準備下載音訊...")

        audio_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio',
            'outtmpl': str(output_path / f'{video_id}_audio.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [progress_hook],
        }

        audio_path = None
        with yt_dlp.YoutubeDL(audio_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if 'requested_downloads' in info and info['requested_downloads']:
                audio_path = info['requested_downloads'][0].get('filepath')

        if not audio_path or not os.path.exists(audio_path):
            for ext in ['m4a', 'webm', 'mp3', 'ogg']:
                filepath = output_path / f"{video_id}_audio.{ext}"
                if filepath.exists():
                    audio_path = str(filepath)
                    break

        if progress_callback:
            progress_callback(100, "下載完成")

        if not video_path:
            raise RuntimeError("下載影片失敗")
        if not audio_path:
            raise RuntimeError("下載音訊失敗")

        return video_path, audio_path

    def _extract_video_id(self, url: str) -> str:
        """從 URL 提取影片 ID"""
        patterns = [
            r'youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})',
            r'youtu\.be/([a-zA-Z0-9_-]{11})',
            r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return "video"


_downloader: Optional[YouTubeDownloader] = None


def get_youtube_downloader() -> YouTubeDownloader:
    """取得下載器實例"""
    global _downloader
    if _downloader is None:
        _downloader = YouTubeDownloader()
    return _downloader
