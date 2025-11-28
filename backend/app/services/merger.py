import os
import subprocess
from pathlib import Path
from typing import Callable, Optional

from app.core.config import get_settings


class VideoMerger:
    """FFmpeg 影片合併服務"""

    def __init__(self):
        settings = get_settings()
        self.ffmpeg_path = "ffmpeg"
        self.ffprobe_path = "ffprobe"

    def get_video_info(self, video_path: str) -> dict:
        """
        取得影片資訊

        Args:
            video_path: 影片檔案路徑

        Returns:
            dict: 包含 duration, has_audio, has_video
        """
        cmd = [
            self.ffprobe_path,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFprobe 失敗: {result.stderr}")

        import json
        info = json.loads(result.stdout)

        has_video = False
        has_audio = False
        duration = 0.0

        for stream in info.get("streams", []):
            if stream.get("codec_type") == "video":
                has_video = True
            elif stream.get("codec_type") == "audio":
                has_audio = True

        if "format" in info:
            duration = float(info["format"].get("duration", 0))

        return {
            "duration": duration,
            "has_video": has_video,
            "has_audio": has_audio
        }

    def _run_ffmpeg_with_progress(
        self,
        cmd: list,
        duration: float,
        progress_callback: Optional[Callable[[int, str], None]],
        stage_name: str
    ) -> subprocess.CompletedProcess:
        """
        執行 FFmpeg 並回報進度

        Args:
            cmd: FFmpeg 命令
            duration: 影片總時長（秒）
            progress_callback: 進度回調
            stage_name: 階段名稱

        Returns:
            執行結果
        """
        if not progress_callback or duration <= 0:
            # 無需進度回報，直接執行
            return subprocess.run(cmd, capture_output=True, text=True)

        # 使用 -progress pipe:1 來取得進度資訊
        cmd_with_progress = cmd.copy()
        # 在 -y 之前插入進度選項
        try:
            y_index = cmd_with_progress.index("-y")
            cmd_with_progress.insert(y_index, "-progress")
            cmd_with_progress.insert(y_index + 1, "pipe:1")
            cmd_with_progress.insert(y_index + 2, "-stats_period")
            cmd_with_progress.insert(y_index + 3, "0.5")
        except ValueError:
            cmd_with_progress.extend(["-progress", "pipe:1", "-stats_period", "0.5"])

        process = subprocess.Popen(
            cmd_with_progress,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # 讀取進度
        current_time = 0
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break

            if line.startswith("out_time_ms="):
                try:
                    time_ms = int(line.split("=")[1].strip())
                    current_time = time_ms / 1000000  # 轉換為秒
                    progress = min(int((current_time / duration) * 100), 99)
                    elapsed_str = f"{int(current_time // 60)}:{int(current_time % 60):02d}"
                    total_str = f"{int(duration // 60)}:{int(duration % 60):02d}"
                    progress_callback(progress, f"{stage_name} {elapsed_str}/{total_str}")
                except (ValueError, IndexError):
                    pass

        stderr = process.stderr.read()
        returncode = process.wait()

        return subprocess.CompletedProcess(cmd, returncode, "", stderr)

    def extract_audio(
        self,
        video_path: str,
        output_path: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> str:
        """
        從影片提取音頻

        Args:
            video_path: 影片檔案路徑
            output_path: 輸出音頻路徑
            progress_callback: 進度回調

        Returns:
            輸出檔案路徑
        """
        if progress_callback:
            progress_callback(0, "取得影片資訊中...")

        # 先取得影片時長
        video_info = self.get_video_info(video_path)
        duration = video_info.get("duration", 0)

        if progress_callback:
            duration_str = f"{int(duration // 60)}:{int(duration % 60):02d}"
            progress_callback(5, f"開始提取音頻 (長度: {duration_str})...")

        cmd = [
            self.ffmpeg_path,
            "-i", video_path,
            "-vn",  # 不要視頻
            "-acodec", "pcm_s16le",  # WAV 格式
            "-ar", "44100",  # 取樣率
            "-ac", "2",  # 雙聲道
            "-y",  # 覆蓋輸出
            output_path
        ]

        result = self._run_ffmpeg_with_progress(cmd, duration, progress_callback, "提取音頻")
        if result.returncode != 0:
            raise RuntimeError(f"音頻提取失敗: {result.stderr}")

        if progress_callback:
            progress_callback(100, "音頻提取完成")

        return output_path

    def merge_audio_video(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> str:
        """
        合併影片和音頻

        Args:
            video_path: 原始影片路徑
            audio_path: 新音頻路徑（伴奏）
            output_path: 輸出影片路徑
            progress_callback: 進度回調

        Returns:
            輸出檔案路徑
        """
        if progress_callback:
            progress_callback(0, "取得影片資訊中...")

        # 先取得影片時長
        video_info = self.get_video_info(video_path)
        duration = video_info.get("duration", 0)

        # 確保輸出目錄存在
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        if progress_callback:
            duration_str = f"{int(duration // 60)}:{int(duration % 60):02d}"
            progress_callback(5, f"開始合併影片 (長度: {duration_str})...")

        cmd = [
            self.ffmpeg_path,
            "-i", video_path,  # 原始影片（取視頻軌）
            "-i", audio_path,  # 新音頻（伴奏）
            "-c:v", "copy",  # 複製視頻編碼（不重新編碼）
            "-c:a", "aac",  # 音頻編碼為 AAC
            "-b:a", "192k",  # 音頻比特率
            "-map", "0:v:0",  # 使用第一個輸入的視頻軌
            "-map", "1:a:0",  # 使用第二個輸入的音頻軌
            "-shortest",  # 以較短的軌道為準
            "-y",  # 覆蓋輸出
            output_path
        ]

        result = self._run_ffmpeg_with_progress(cmd, duration, progress_callback, "合併影片")
        if result.returncode != 0:
            raise RuntimeError(f"影片合併失敗: {result.stderr}")

        if progress_callback:
            # 取得輸出檔案大小
            output_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
            size_mb = output_size / (1024 * 1024)
            progress_callback(100, f"合併完成 (檔案大小: {size_mb:.1f}MB)")

        return output_path

    def process_video(
        self,
        input_video_path: str,
        background_audio_path: str,
        output_path: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> str:
        """
        完整處理流程：將伴奏音頻與原始影片合併

        Args:
            input_video_path: 原始影片路徑
            background_audio_path: 伴奏音頻路徑（已去除人聲）
            output_path: 輸出影片路徑
            progress_callback: 進度回調

        Returns:
            輸出檔案路徑
        """
        return self.merge_audio_video(
            video_path=input_video_path,
            audio_path=background_audio_path,
            output_path=output_path,
            progress_callback=progress_callback
        )


# Global instance
_merger: Optional[VideoMerger] = None


def get_merger() -> VideoMerger:
    """取得合併器實例"""
    global _merger
    if _merger is None:
        _merger = VideoMerger()
    return _merger
