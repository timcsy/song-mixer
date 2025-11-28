import os
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Callable, Optional

from app.models.job import MixSettings, OutputFormat


class AudioMixer:
    """FFmpeg 音頻混音服務"""

    def __init__(self):
        self.ffmpeg_path = "ffmpeg"

    def calculate_pitch_value(self, semitones: int) -> float:
        """
        計算 FFmpeg rubberband 所需的 pitch 值

        Args:
            semitones: 半音數 (-12 to +12)

        Returns:
            pitch 值 (2^(semitones/12))
        """
        return 2 ** (semitones / 12)

    def get_cache_key(self, job_id: str, settings: MixSettings) -> str:
        """
        計算混音設定的快取鍵

        Args:
            job_id: 任務 ID
            settings: 混音設定

        Returns:
            快取鍵 (16 字元雜湊)
        """
        settings_dict = {
            "drums_volume": settings.drums_volume,
            "bass_volume": settings.bass_volume,
            "other_volume": settings.other_volume,
            "vocals_volume": settings.vocals_volume,
            "pitch_shift": settings.pitch_shift,
            "output_format": settings.output_format.value,
        }
        settings_str = json.dumps(settings_dict, sort_keys=True)
        hash_input = f"{job_id}:{settings_str}"
        return hashlib.md5(hash_input.encode()).hexdigest()[:16]

    def get_output_extension(self, output_format: OutputFormat) -> str:
        """取得輸出檔案副檔名"""
        return output_format.value

    def get_ffmpeg_audio_codec(self, output_format: OutputFormat) -> list:
        """
        取得 FFmpeg 音頻編碼參數

        Returns:
            FFmpeg 參數列表
        """
        if output_format == OutputFormat.MP4:
            return ["-c:a", "aac", "-b:a", "256k"]
        elif output_format == OutputFormat.MP3:
            return ["-c:a", "libmp3lame", "-b:a", "320k"]
        elif output_format == OutputFormat.M4A:
            return ["-c:a", "aac", "-b:a", "256k"]
        elif output_format == OutputFormat.WAV:
            return ["-c:a", "pcm_s16le", "-ar", "44100"]
        else:
            return ["-c:a", "aac", "-b:a", "256k"]

    def mix_tracks(
        self,
        track_paths: dict,
        settings: MixSettings,
        output_path: str,
        video_path: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> str:
        """
        混合音軌並輸出檔案

        Args:
            track_paths: 音軌路徑 {drums: path, bass: path, other: path, vocals: path}
            settings: 混音設定
            output_path: 輸出檔案路徑
            video_path: 原始影片路徑 (MP4 格式時需要)
            progress_callback: 進度回調

        Returns:
            輸出檔案路徑
        """
        if progress_callback:
            progress_callback(0, "準備混音中...")

        # 確保輸出目錄存在
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # 構建 FFmpeg 濾鏡圖
        filter_parts = []
        input_index = 0

        # 輸入檔案參數
        input_args = []
        track_order = ["drums", "bass", "other", "vocals"]

        for track_name in track_order:
            track_path = track_paths.get(track_name)
            if track_path and os.path.exists(track_path):
                input_args.extend(["-i", track_path])
                volume = getattr(settings, f"{track_name}_volume")
                filter_parts.append(f"[{input_index}:a]volume={volume}[{track_name}]")
                input_index += 1

        # 混合所有軌道
        mix_inputs = "".join(f"[{name}]" for name in track_order if track_paths.get(name))
        filter_parts.append(f"{mix_inputs}amix=inputs={input_index}:normalize=0[mixed]")

        # 加入 pitch shift (如果需要)
        if settings.pitch_shift != 0:
            pitch_value = self.calculate_pitch_value(settings.pitch_shift)
            filter_parts.append(f"[mixed]rubberband=pitch={pitch_value}[final]")
            final_output = "[final]"
        else:
            final_output = "[mixed]"

        filter_complex = ";".join(filter_parts)

        if progress_callback:
            progress_callback(10, "執行 FFmpeg 混音...")

        # 構建 FFmpeg 命令
        cmd = [self.ffmpeg_path]
        cmd.extend(input_args)

        # 加入影片輸入 (MP4 格式)
        if settings.output_format == OutputFormat.MP4 and video_path:
            cmd.extend(["-i", video_path])

        cmd.extend(["-filter_complex", filter_complex])

        # 映射輸出
        if settings.output_format == OutputFormat.MP4 and video_path:
            cmd.extend(["-map", f"{input_index}:v", "-map", final_output])
            cmd.extend(["-c:v", "copy"])
        else:
            cmd.extend(["-map", final_output])

        # 音頻編碼
        cmd.extend(self.get_ffmpeg_audio_codec(settings.output_format))

        # 輸出檔案
        cmd.extend(["-y", output_path])

        # 執行 FFmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg 混音失敗: {result.stderr}")

        if progress_callback:
            progress_callback(100, "混音完成")

        return output_path


# Global instance
_mixer: Optional[AudioMixer] = None


def get_mixer() -> AudioMixer:
    """取得混音器實例"""
    global _mixer
    if _mixer is None:
        _mixer = AudioMixer()
    return _mixer
