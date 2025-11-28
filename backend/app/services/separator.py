import threading
import time
from pathlib import Path
from typing import Callable, Optional
import torch
import soundfile as sf
import numpy as np

from app.core.config import get_settings


class VocalSeparator:
    """Demucs 人聲分離服務"""

    def __init__(self):
        settings = get_settings()
        self.device = settings.device
        self.model = None

    def _load_model(self):
        """延遲載入模型"""
        if self.model is None:
            from demucs.pretrained import get_model
            self.model = get_model("htdemucs")
            self.model.to(self.device)
            self.model.eval()

    def separate(
        self,
        input_path: str,
        output_dir: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> dict:
        """
        分離音頻中的人聲與伴奏

        Args:
            input_path: 輸入音頻檔案路徑
            output_dir: 輸出目錄
            progress_callback: 進度回調函數 (progress, stage)

        Returns:
            dict: 包含 vocals 和 background 檔案路徑
        """
        from demucs.apply import apply_model

        if progress_callback:
            progress_callback(0, "載入 AI 模型中...")

        self._load_model()

        if progress_callback:
            progress_callback(5, "載入音頻檔案中...")

        # Load audio using soundfile
        audio_data, sr = sf.read(input_path)

        # 計算音頻長度（秒）
        audio_duration = len(audio_data) / sr
        if progress_callback:
            progress_callback(8, f"音頻長度: {audio_duration:.1f} 秒")

        # Convert to torch tensor (soundfile returns (samples, channels), we need (channels, samples))
        if len(audio_data.shape) == 1:
            # Mono audio
            wav = torch.from_numpy(audio_data).float().unsqueeze(0)
        else:
            # Stereo or multi-channel
            wav = torch.from_numpy(audio_data.T).float()

        # Resample if needed
        if sr != self.model.samplerate:
            if progress_callback:
                progress_callback(10, f"重新取樣中 ({sr}Hz → {self.model.samplerate}Hz)...")
            import torchaudio
            resampler = torchaudio.transforms.Resample(sr, self.model.samplerate)
            wav = resampler(wav)
            if progress_callback:
                progress_callback(15, "重新取樣完成")

        # Move to device
        wav = wav.to(self.device)

        # 計算音頻總長度
        total_samples = wav.shape[-1]
        audio_duration = total_samples / self.model.samplerate

        if progress_callback:
            progress_callback(18, f"開始 AI 分離 (使用 {self.device.upper()}, 音頻: {audio_duration:.1f}秒)...")

        # 估算處理時間 (CPU 大約每秒音頻需要 0.5-1 秒處理)
        # GPU 會快很多，約 0.1-0.2 秒
        if self.device == "cpu":
            estimated_time = audio_duration * 0.7  # CPU 估算
        else:
            estimated_time = audio_duration * 0.15  # GPU 估算

        # 使用背景執行緒更新進度
        progress_stop = threading.Event()

        def update_progress():
            start_time = time.time()
            while not progress_stop.is_set():
                elapsed = time.time() - start_time
                # 進度從 20% 到 72%，共 52%
                if estimated_time > 0:
                    pct = min(elapsed / estimated_time, 0.95)  # 最多到 95%
                else:
                    pct = min(elapsed / 60, 0.95)  # 預設 60 秒

                actual_progress = 20 + int(pct * 52)
                elapsed_min = int(elapsed // 60)
                elapsed_sec = int(elapsed % 60)

                if progress_callback:
                    progress_callback(
                        actual_progress,
                        f"AI 分離處理中... {elapsed_min}:{elapsed_sec:02d}"
                    )
                time.sleep(1)  # 每秒更新一次

        # 啟動進度更新執行緒
        progress_thread = threading.Thread(target=update_progress, daemon=True)
        progress_thread.start()

        # Apply model
        try:
            with torch.no_grad():
                sources = apply_model(
                    self.model,
                    wav[None],
                    split=True,  # 啟用分段處理以支援大檔案
                    progress=True  # 在 worker 日誌中顯示進度條
                )
        finally:
            # 停止進度更新執行緒
            progress_stop.set()
            progress_thread.join(timeout=2)

        if progress_callback:
            progress_callback(75, "AI 分離處理完成")

        if progress_callback:
            progress_callback(78, "分離完成，儲存結果中...")

        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Demucs output order: drums, bass, other, vocals
        track_names = ["drums", "bass", "other", "vocals"]
        track_tensors = {
            "drums": sources[0, 0],
            "bass": sources[0, 1],
            "other": sources[0, 2],
            "vocals": sources[0, 3],
        }

        # 向後相容：計算 background (drums + bass + other)
        background = sources[0, 0] + sources[0, 1] + sources[0, 2]

        # Resample back to original rate if needed
        if sr != self.model.samplerate:
            import torchaudio
            resampler = torchaudio.transforms.Resample(self.model.samplerate, sr)
            for name in track_names:
                track_tensors[name] = resampler(track_tensors[name].cpu())
            background = resampler(background.cpu())
        else:
            for name in track_names:
                track_tensors[name] = track_tensors[name].cpu()
            background = background.cpu()

        # 儲存四軌檔案
        track_paths = {}
        progress_base = 78
        progress_step = 4  # 每軌約 4%

        for i, name in enumerate(track_names):
            if progress_callback:
                progress_callback(progress_base + i * progress_step, f"儲存 {name} 軌道...")
            track_path = output_path / f"{name}.wav"
            track_np = track_tensors[name].numpy().T
            sf.write(str(track_path), track_np, sr)
            track_paths[name] = str(track_path)

        # 向後相容：儲存 background.wav
        if progress_callback:
            progress_callback(95, "儲存伴奏軌道...")
        background_path = output_path / "background.wav"
        background_np = background.numpy().T
        sf.write(str(background_path), background_np, sr)

        if progress_callback:
            progress_callback(100, "分離完成")

        return {
            "vocals": track_paths["vocals"],
            "background": str(background_path),
            "sample_rate": sr,
            "tracks": track_paths,  # 新增：四軌路徑
        }


# Global instance
_separator: Optional[VocalSeparator] = None


def get_separator() -> VocalSeparator:
    """取得分離器實例"""
    global _separator
    if _separator is None:
        _separator = VocalSeparator()
    return _separator
