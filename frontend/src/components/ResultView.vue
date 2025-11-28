<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api, type JobWithResult, type MixRequest, type OutputFormat } from '../services/api';
import ProgressBar from './ProgressBar.vue';
import AudioMixer from './AudioMixer/AudioMixer.vue';

const props = defineProps<{
  job: JobWithResult;
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
}>();

const isCompleted = computed(() => props.job.status === 'completed');
const isFailed = computed(() => props.job.status === 'failed');
const isProcessing = computed(() => !isCompleted.value && !isFailed.value);

// Video element reference for AudioMixer sync
const videoElement = ref<HTMLVideoElement | null>(null);

// AudioMixer reference
const audioMixerRef = ref<InstanceType<typeof AudioMixer> | null>(null);

// AudioMixer state
const mixerReady = ref(false);
const mixerError = ref<string | null>(null);

const handleMixerReady = () => {
  mixerReady.value = true;
};

const handleMixerError = (message: string) => {
  mixerError.value = message;
};

// ========== 下載功能 ==========
const selectedFormat = ref<OutputFormat>('mp4');
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadError = ref<string | null>(null);

const formatOptions: { value: OutputFormat; label: string }[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'm4a', label: 'M4A' },
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
];

const startDownload = async () => {
  if (isDownloading.value || !audioMixerRef.value) return;

  isDownloading.value = true;
  downloadProgress.value = 0;
  downloadError.value = null;

  try {
    // Get current mixer settings
    const mixer = audioMixerRef.value;
    const mixRequest: MixRequest = {
      drums_volume: mixer.tracks?.drums?.volume ?? 1,
      bass_volume: mixer.tracks?.bass?.volume ?? 1,
      other_volume: mixer.tracks?.other?.volume ?? 1,
      vocals_volume: mixer.tracks?.vocals?.volume ?? 0,
      pitch_shift: mixer.pitchShift?.value ?? 0,
      output_format: selectedFormat.value,
    };

    const response = await api.createMix(props.job.id, mixRequest);

    if (response.status === 'completed' && response.download_url) {
      triggerDownload(response.download_url);
      return;
    }

    // Poll for completion
    const mixId = response.mix_id;
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getMixStatus(props.job.id, mixId);
        downloadProgress.value = status.progress;

        if (status.status === 'completed' && status.download_url) {
          clearInterval(pollInterval);
          triggerDownload(status.download_url);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          downloadError.value = status.error_message || '混音失敗';
          isDownloading.value = false;
        }
      } catch {
        clearInterval(pollInterval);
        downloadError.value = '查詢狀態失敗';
        isDownloading.value = false;
      }
    }, 1000);
  } catch {
    downloadError.value = '建立混音任務失敗';
    isDownloading.value = false;
  }
};

const triggerDownload = (url: string) => {
  // 直接在新分頁開啟下載 URL，讓瀏覽器處理下載
  // 後端已設定 Content-Disposition: attachment
  window.open(url, '_blank');
  isDownloading.value = false;
};

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

const downloadUrl = computed(() => {
  return api.getDownloadUrl(props.job.id);
});

const streamUrl = computed(() => {
  return api.getStreamUrl(props.job.id);
});

const fileSizeText = computed(() => {
  if (!props.job.result?.output_size) return '';
  const size = props.job.result.output_size;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
});

const durationText = computed(() => {
  if (!props.job.result?.original_duration) return '';
  const seconds = props.job.result.original_duration;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
});

// Fullscreen toggle
const toggleFullscreen = () => {
  if (videoElement.value) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoElement.value.requestFullscreen();
    }
  }
};
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
          </div>
        </div>

        <!-- 右側：混音控制 -->
        <div class="right-panel">
          <AudioMixer
            ref="audioMixerRef"
            :job-id="job.id"
            :video-element="videoElement"
            :title="job.source_title || '音軌混音'"
            @ready="handleMixerReady"
            @error="handleMixerError"
            hide-download
            hide-playback-controls
          />
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
              :class="{ selected: selectedFormat === opt.value }"
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="selectedFormat"
                :disabled="isDownloading"
              />
              {{ opt.label }}
            </label>
          </div>
          <button
            @click="startDownload"
            class="download-btn primary"
            :disabled="!mixerReady || isDownloading"
          >
            <span v-if="isDownloading">{{ downloadProgress }}%</span>
            <span v-else>下載</span>
          </button>
          <button @click="emit('reset')" class="download-btn secondary">
            處理新影片
          </button>
        </div>
        <div v-if="downloadError" class="download-error">{{ downloadError }}</div>
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

.format-option input {
  display: none;
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
