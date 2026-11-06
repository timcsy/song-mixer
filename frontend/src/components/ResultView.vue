<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount } from 'vue';
import JSZip from 'jszip';
import { getBackendCapabilities, type JobWithResult, type OutputFormat } from '../services/api';
import { storageService } from '@/services/storageService';
import { useDownload } from '@/composables/useDownload';
import { formatDuration, formatFileSize } from '@/utils/format';
import ProgressBar from './ProgressBar.vue';
import AudioMixer from './AudioMixer/AudioMixer.vue';
import type { SongRecord } from '@/types/storage';

const props = defineProps<{
  job: JobWithResult;
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
}>();

const isCompleted = computed(() => props.job.status === 'completed');
const isFailed = computed(() => props.job.status === 'failed');
const isProcessing = computed(() => !isCompleted.value && !isFailed.value);

// 後端功能偵測
const backend = getBackendCapabilities();

// 本地歌曲狀態（純靜態模式）
// 為了節省記憶體，不長期保留完整的 SongRecord：
// - 影片轉成 Blob URL 後就放掉原本的 ArrayBuffer
// - 音軌交給 AudioMixer 轉成 AudioBuffer 後就放掉 Int16 資料
// - 匯出時再從 IndexedDB 讀取
const songLoaded = ref(false);
const hasVideo = ref(false);
const videoSize = ref(0);
// 只在 AudioMixer 載入音軌期間持有，載入完成或失敗後即釋放
const mixerSongRecord = shallowRef<SongRecord | null>(null);

// Video element reference for AudioMixer sync
const videoElement = ref<HTMLVideoElement | null>(null);

// AudioMixer reference
const audioMixerRef = ref<InstanceType<typeof AudioMixer> | null>(null);

// AudioMixer state
const mixerReady = ref(false);
const mixerError = ref<string | null>(null);

const handleMixerReady = () => {
  mixerReady.value = true;
  // 音軌已轉為 AudioBuffer，釋放原始 Int16 資料
  mixerSongRecord.value = null;
};

const handleMixerError = (message: string) => {
  mixerError.value = message;
  mixerSongRecord.value = null;
};

// ========== 下載功能 ==========
const selectedFormat = ref<OutputFormat>('mp4');
const { state: downloadState, startDownload: doDownload, reset: resetDownload } = useDownload();

// 可用的下載格式（純靜態模式下，沒有原始影片則不支援 MP4/M4A）
const formatOptions = computed(() => {
  const options: { value: OutputFormat; label: string; disabled?: boolean }[] = [
    { value: 'wav', label: 'WAV' },
    { value: 'mp3', label: 'MP3' },
  ];

  // MP4/M4A 需要後端 FFmpeg 或本地原始影片
  const canExportVideo = backend.available || hasVideo.value;
  options.push(
    { value: 'm4a', label: 'M4A', disabled: !canExportVideo && !backend.ffmpeg },
    { value: 'mp4', label: 'MP4', disabled: !canExportVideo },
  );

  return options;
});

// 下載進度訊息
const downloadStageText = computed(() => {
  switch (downloadState.value.stage) {
    case 'preparing': return '準備中...';
    case 'mixing': return '混音中...';
    case 'encoding': return '編碼中...';
    case 'complete': return '完成';
    default: return '';
  }
});

const startDownload = async () => {
  if (downloadState.value.isDownloading || !audioMixerRef.value) return;

  // 檢查格式是否被禁用
  const formatOpt = formatOptions.value.find(f => f.value === selectedFormat.value);
  if (formatOpt?.disabled) {
    return;
  }

  resetDownload();

  try {
    const mixer = audioMixerRef.value;
    const mixerSettings = {
      drums: mixer.tracks?.drums?.volume ?? 1,
      bass: mixer.tracks?.bass?.volume ?? 1,
      other: mixer.tracks?.other?.volume ?? 1,
      vocals: mixer.tracks?.vocals?.volume ?? 0,
      pitchShift: mixer.pitchShift ?? 0,
    };

    await doDownload({
      songId: songLoaded.value ? props.job.id : undefined,
      format: selectedFormat.value,
      mixerSettings,
      title: props.job.source_title || '混音',
    });
  } catch (err) {
    // 錯誤已經設定到 downloadState.error
  }
};

// ========== 匯出功能 ==========
const isExporting = ref(false);

// Int16 PCM 資料轉 WAV 檔案
function int16ToWav(pcmData: ArrayBuffer, sampleRate: number, numChannels: number = 2): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcmData);
  const wavHeader = 44;
  const wavBuffer = new ArrayBuffer(wavHeader + pcmBytes.length);
  const view = new DataView(wavBuffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + pcmBytes.length, true); // file size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true); // channels
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, pcmBytes.length, true); // data size

  // PCM data
  new Uint8Array(wavBuffer, wavHeader).set(pcmBytes);

  return wavBuffer;
}

const exportSong = async () => {
  if (!songLoaded.value || isExporting.value) return;

  isExporting.value = true;
  try {
    // 匯出時才從 IndexedDB 讀取完整資料，用完即釋放
    const song = await storageService.getSong(props.job.id);
    if (!song) throw new Error('找不到歌曲資料');
    const zip = new JSZip();
    const sampleRate = song.sampleRate || 44100;

    // 建立元資料 JSON
    const metadata = {
      version: 1,
      exportedAt: new Date().toISOString(),
      song: {
        id: song.id,
        title: song.title,
        sourceType: song.sourceType,
        sourceUrl: song.sourceUrl,
        thumbnailUrl: song.thumbnailUrl,
        duration: song.duration,
        sampleRate: sampleRate,
        createdAt: song.createdAt.toISOString(),
        storageSize: song.storageSize,
      },
    };

    // 加入元資料
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 加入音軌（WAV 格式）
    const tracksFolder = zip.folder('tracks');
    if (tracksFolder) {
      tracksFolder.file('drums.wav', int16ToWav(song.tracks.drums, sampleRate));
      tracksFolder.file('bass.wav', int16ToWav(song.tracks.bass, sampleRate));
      tracksFolder.file('other.wav', int16ToWav(song.tracks.other, sampleRate));
      tracksFolder.file('vocals.wav', int16ToWav(song.tracks.vocals, sampleRate));
    }

    // 加入原始影片（如果有）
    if (song.originalVideo) {
      zip.file('video.mp4', song.originalVideo);
    }

    // 產生 ZIP 並下載
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.title || 'song'}.mix.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('匯出失敗:', err);
    alert('匯出失敗，請稍後再試');
  } finally {
    isExporting.value = false;
  }
};

// 元件是否已卸載（避免載入完成時元件已切走，造成 Blob URL 洩漏）
let isUnmounted = false;

// 載入本地歌曲資料（純靜態模式）
onMounted(async () => {
  // 嘗試從 IndexedDB 載入
  try {
    await storageService.init();
    const song = await storageService.getSong(props.job.id);
    if (!song || isUnmounted) return;

    hasVideo.value = !!song.originalVideo;
    videoSize.value = song.originalVideo?.byteLength ?? 0;
    // 如果沒有原始影片，預設選擇 WAV
    if (!song.originalVideo) {
      selectedFormat.value = 'wav';
    }

    // 影片轉成 Blob URL（Blob 會複製一份資料，之後不再引用原本的 ArrayBuffer）
    setupVideoUrl(song.originalVideo);

    // 音軌交給 AudioMixer，不帶影片
    mixerSongRecord.value = { ...song, originalVideo: undefined };
    songLoaded.value = true;
  } catch (err) {
    console.warn('無法載入本地歌曲資料:', err);
  }
});

const statusText = computed(() => {
  switch (props.job.status) {
    case 'pending':
      return '等待處理';
    case 'downloading':
      return '下載中';
    case 'separating':
      return '分離人聲中';
    case 'merging':
      return '影片擷取中';
    case 'completed':
      return '處理完成';
    case 'failed':
      return '處理失敗';
    default:
      return '未知狀態';
  }
});

const progressText = computed(() => {
  if (props.job.current_stage) {
    return props.job.current_stage;
  }
  return `${props.job.progress}%`;
});

// 影片串流 URL（後端模式）或 Blob URL（本地模式）
const videoUrl = ref<string | null>(null);

// 設定影片 URL
const setupVideoUrl = (video?: ArrayBuffer) => {
  // 優先使用本地 IndexedDB 的影片
  if (video) {
    const blob = new Blob([video], { type: 'video/mp4' });
    videoUrl.value = URL.createObjectURL(blob);
  }
  // 如無本地資料，才嘗試後端串流（舊版相容）
  // else if (backend.available) {
  //   videoUrl.value = api.getStreamUrl(props.job.id);
  // }
};

// 元件卸載時釋放影片 Blob URL 與歌曲資料，避免切換歌曲時記憶體持續累積
onBeforeUnmount(() => {
  isUnmounted = true;
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = null;
  }
  mixerSongRecord.value = null;
});

// streamUrl 向後相容
const streamUrl = computed(() => videoUrl.value || '');

const fileSizeText = computed(() => {
  // 優先使用本地歌曲的原始影片大小
  if (videoSize.value) {
    return formatFileSize(videoSize.value);
  }
  // 後端返回的輸出大小
  if (props.job.result?.output_size) {
    return formatFileSize(props.job.result.output_size);
  }
  return '';
});

const durationText = computed(() => {
  if (!props.job.result?.original_duration) return '';
  return formatDuration(props.job.result.original_duration);
});
</script>

<template>
  <div class="result-view">
    <!-- 處理中 -->
    <div v-if="isProcessing" class="processing">
      <div class="status-icon processing-icon">
        <div class="spinner"></div>
      </div>
      <h2>{{ statusText }}</h2>
      <ProgressBar
        :progress="job.progress"
        :stage="job.current_stage || progressText"
        :status="job.status"
      />
    </div>

    <!-- 完成 -->
    <div v-else-if="isCompleted" class="completed">
      <!-- 主要區域：左側影片+播放 / 右側混音 -->
      <div class="main-area">
        <!-- 左側：影片 + 播放控制 -->
        <div class="left-panel">
          <div class="video-wrapper">
            <video
              v-if="streamUrl"
              ref="videoElement"
              :src="streamUrl"
              preload="metadata"
              controls
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              muted
            >
              您的瀏覽器不支援影片播放
            </video>
            <div v-else class="no-video-placeholder">
              <div class="placeholder-icon">🎵</div>
              <p>純音訊模式</p>
              <!-- 純音訊播放控制 -->
              <div v-if="audioMixerRef" class="audio-playback-controls">
                <div class="audio-controls-row">
                  <button class="audio-control-btn" @click="audioMixerRef.stop?.()" :disabled="!audioMixerRef.isReady">
                    <span>&#9632;</span>
                  </button>
                  <button class="audio-control-btn play" @click="audioMixerRef.togglePlay?.()" :disabled="!audioMixerRef.isReady">
                    <span>{{ audioMixerRef.isPlaying ? '&#10074;&#10074;' : '&#9654;' }}</span>
                  </button>
                </div>
                <div class="audio-time-display">
                  {{ audioMixerRef.formatTime?.(audioMixerRef.currentTime ?? 0) ?? '0:00' }}
                  /
                  {{ audioMixerRef.formatTime?.(audioMixerRef.duration ?? 0) ?? '0:00' }}
                </div>
                <div class="audio-seek-container">
                  <input
                    type="range"
                    class="audio-seek-slider"
                    min="0"
                    :max="audioMixerRef.duration ?? 0"
                    step="0.1"
                    :value="audioMixerRef.currentTime ?? 0"
                    @input="(e) => audioMixerRef?.seek?.((e.target as HTMLInputElement).valueAsNumber)"
                    :disabled="!audioMixerRef.isReady"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右側：混音控制 -->
        <div class="right-panel">
          <!-- 等待本地歌曲載入或使用後端模式 -->
          <AudioMixer
            v-if="backend.available || songLoaded"
            ref="audioMixerRef"
            :job-id="backend.available ? job.id : undefined"
            :song-record="mixerSongRecord || undefined"
            :video-element="videoElement"
            :title="job.source_title || '音軌混音'"
            @ready="handleMixerReady"
            @error="handleMixerError"
            hide-download
            hide-playback-controls
          />
          <div v-else class="mixer-loading">
            <div class="loading-spinner"></div>
            <span>載入音軌資料中...</span>
          </div>
        </div>
      </div>

      <!-- 下方：下載區 -->
      <div class="download-area">
        <div class="info-section">
          <span v-if="durationText" class="info-item">
            <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
            </svg>
            {{ durationText }}
          </span>
          <span v-if="fileSizeText" class="info-item">
            <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5h3V8h4v4h3l-5 5z"/>
            </svg>
            {{ fileSizeText }}
          </span>
        </div>
        <div class="download-actions">
          <div class="format-selector">
            <label
              v-for="opt in formatOptions"
              :key="opt.value"
              class="format-option"
              :class="{
                selected: selectedFormat === opt.value,
                disabled: opt.disabled
              }"
              :title="opt.disabled ? '此格式需要原始影片' : ''"
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="selectedFormat"
                :disabled="downloadState.isDownloading || opt.disabled"
              />
              {{ opt.label }}
            </label>
          </div>
          <button
            @click="startDownload"
            class="download-btn primary"
            :disabled="!mixerReady || downloadState.isDownloading"
          >
            <span v-if="downloadState.isDownloading">
              {{ downloadStageText }} {{ downloadState.progress }}%
            </span>
            <span v-else>下載</span>
          </button>
          <button
            v-if="songLoaded"
            @click="exportSong"
            class="download-btn export"
            :disabled="isExporting"
            title="匯出歌曲資料（可備份或轉移）"
          >
            <span v-if="isExporting">匯出中...</span>
            <span v-else>匯出</span>
          </button>
          <button @click="emit('reset')" class="download-btn secondary">
            處理新影片
          </button>
        </div>
        <!-- 下載進度條 -->
        <div v-if="downloadState.isDownloading" class="download-progress-bar">
          <div class="progress-fill" :style="{ width: `${downloadState.progress}%` }"></div>
        </div>
        <div v-if="downloadState.error" class="download-error">{{ downloadState.error }}</div>
      </div>
    </div>

    <!-- 失敗 -->
    <div v-else-if="isFailed" class="failed">
      <div class="status-icon error-icon">✕</div>
      <h2>處理失敗</h2>
      <p class="error-message">{{ job.error_message || '發生未知錯誤' }}</p>
      <button @click="emit('reset')" class="retry-btn">
        重新嘗試
      </button>
    </div>
  </div>
</template>

<style scoped>
.result-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Processing state */
.processing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}

.status-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.processing-icon {
  background: #e8f4fd;
}

.error-icon {
  background: #fee;
  color: #f44336;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #4a90d9;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

h2 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  color: #333;
}

/* Completed state */
.completed {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 1rem;
  min-height: 0;
}

/* Main area: video + mixer */
.main-area {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1rem;
  min-height: 0;
}

/* Left panel: video */
.left-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.video-wrapper {
  position: relative;
  flex: 1;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-wrapper video {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.no-video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 200px;
  color: #888;
  text-align: center;
}

.placeholder-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.placeholder-hint {
  font-size: 0.875rem;
  color: #666;
}

/* 純音訊播放控制 */
.audio-playback-controls {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0 3rem;
  box-sizing: border-box;
}

.audio-controls-row {
  display: flex;
  gap: 1rem;
}

.audio-control-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid #666;
  background: transparent;
  color: #888;
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.audio-control-btn:hover:not(:disabled) {
  border-color: #4a90d9;
  color: #4a90d9;
}

.audio-control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.audio-control-btn.play {
  width: 56px;
  height: 56px;
  font-size: 1.5rem;
}

.audio-time-display {
  font-size: 0.875rem;
  color: #888;
  font-variant-numeric: tabular-nums;
}

.audio-seek-container {
  width: 100%;
}

.audio-seek-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #444;
  border-radius: 2px;
  cursor: pointer;
}

.audio-seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4a90d9;
  cursor: pointer;
}

.audio-seek-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4a90d9;
  border: none;
  cursor: pointer;
}

/* 隱藏影片播放列的下載、播放速度和音量按鈕（音量由混音器控制） */
.video-wrapper video::-webkit-media-controls-download-button,
.video-wrapper video::-webkit-media-controls-playback-rate-button,
.video-wrapper video::-webkit-media-controls-mute-button,
.video-wrapper video::-webkit-media-controls-volume-slider {
  display: none !important;
}

/* Right panel: mixer */
.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

.right-panel :deep(.audio-mixer) {
  margin: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.right-panel :deep(.mixer-content) {
  flex: 1;
  overflow-y: auto;
}

/* Download area */
.download-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #f8f9fa;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 1rem;
}

.info-section {
  display: flex;
  gap: 1.5rem;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #666;
  font-size: 0.875rem;
}

.info-icon {
  width: 18px;
  height: 18px;
  opacity: 0.7;
}

.download-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.format-selector {
  display: flex;
  gap: 0.25rem;
}

.format-option {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
}

.format-option:first-child {
  border-radius: 4px 0 0 4px;
}

.format-option:last-child {
  border-radius: 0 4px 4px 0;
}

.format-option:not(:last-child) {
  border-right: none;
}

.format-option:hover {
  background: #f5f5f5;
}

.format-option.selected {
  background: #4a90d9;
  border-color: #4a90d9;
  color: white;
}

.format-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f0f0f0;
}

.format-option.disabled:hover {
  border-color: #ddd;
  background: #f0f0f0;
}

.format-option input {
  display: none;
}

.download-progress-bar {
  width: 100%;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.download-progress-bar .progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s ease;
}

.download-error {
  width: 100%;
  padding: 0.5rem;
  background: #fee;
  color: #c00;
  border-radius: 4px;
  font-size: 0.75rem;
  text-align: center;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  border: none;
}

.download-btn.primary {
  background: #4caf50;
  color: white;
}

.download-btn.primary:hover {
  background: #43a047;
}

.download-btn.export {
  background: #9c27b0;
  color: white;
}

.download-btn.export:hover {
  background: #7b1fa2;
}

.download-btn.secondary {
  background: white;
  color: #666;
  border: 1px solid #ddd;
}

.download-btn.secondary:hover {
  background: #f5f5f5;
  border-color: #ccc;
}

/* Failed state */
.failed {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}

.error-message {
  color: #c00;
  margin: 1rem 0;
}

.retry-btn {
  padding: 0.625rem 1.5rem;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.retry-btn:hover {
  background: #3a7bc8;
}

/* RWD: Tablet & smaller screens */
@media (max-width: 900px) {
  .main-area {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .video-wrapper {
    aspect-ratio: 16 / 9;
    flex: none;
  }

  .download-area {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .info-section {
    justify-content: center;
  }

  .download-actions {
    flex-direction: column;
  }

  .download-btn {
    width: 100%;
  }
}

/* RWD: Mobile */
@media (max-width: 600px) {
  .completed {
    padding: 0.5rem;
    gap: 0.75rem;
  }

  .video-wrapper {
    border-radius: 6px;
  }

  .fullscreen-btn {
    opacity: 1;
    width: 32px;
    height: 32px;
    bottom: 8px;
    right: 8px;
  }

  .download-area {
    padding: 0.75rem;
  }

  .info-section {
    gap: 1rem;
    font-size: 0.75rem;
  }
}
</style>
