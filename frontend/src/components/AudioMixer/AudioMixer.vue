<script setup lang="ts">
import { ref, onMounted, watch, type Ref } from 'vue';
import { useWebAudio } from '@/composables/useWebAudio';
import { useAudioSync } from '@/composables/useAudioSync';
import TrackSlider from './TrackSlider.vue';
import PitchControl from './PitchControl.vue';
import type { TrackName, OutputFormat } from '@/types/audio';
import { api, type MixRequest } from '@/services/api';

import type { SongRecord } from '@/types/storage';

const props = defineProps<{
  jobId?: string;
  songRecord?: SongRecord;
  videoElement?: HTMLVideoElement | null;
  hideDownload?: boolean;
  hidePlaybackControls?: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'ready'): void;
  (e: 'error', message: string): void;
}>();

// Video element ref (can be passed as prop or found in parent)
const videoRef = ref<HTMLVideoElement | null>(props.videoElement ?? null);

// Web Audio composable - 支援後端 jobId 或本地 songRecord
const {
  isLoading,
  isPlaying,
  currentTime,
  duration,
  tracks,
  error,
  isReady,
  pitchShift,
  loadTracks,
  play,
  pause,
  stop,
  seek,
  setVolume,
  setPitchShift,
} = useWebAudio({ jobId: props.jobId, songRecord: props.songRecord });

// Audio-Video sync composable
// 影片作為主控制器，Web Audio 跟隨影片
const {
  enableSync,
} = useAudioSync({
  videoElement: videoRef as Ref<HTMLVideoElement | null>,
  isPlaying,
  currentTime,
  duration,
  play,
  pause,
  seek,
});

// Track names for iteration
const trackNames: TrackName[] = ['drums', 'bass', 'other', 'vocals'];

// Guide vocals (導唱) state
const guideVocalsEnabled = ref(false);

// Toggle guide vocals
const toggleGuideVocals = () => {
  if (guideVocalsEnabled.value) {
    // Turn off guide vocals - restore to 0
    setVolume('vocals', 0);
    guideVocalsEnabled.value = false;
  } else {
    // Turn on guide vocals - set to 100%
    setVolume('vocals', 1.0);
    guideVocalsEnabled.value = true;
  }
};

// Format time display
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Handle volume change
const handleVolumeChange = (track: TrackName, volume: number) => {
  setVolume(track, volume);
};

// Handle pitch change
const handlePitchChange = (value: number) => {
  setPitchShift(value);
};

// ========== 下載功能 ==========
const selectedFormat = ref<OutputFormat>('mp4');
const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadError = ref<string | null>(null);
const downloadUrl = ref<string | null>(null);

const formatLabels: Record<OutputFormat, string> = {
  mp4: 'MP4 (含影片)',
  mp3: 'MP3',
  m4a: 'M4A',
  wav: 'WAV (無損)',
};

const startDownload = async () => {
  if (isDownloading.value || !props.jobId) return;

  isDownloading.value = true;
  downloadProgress.value = 0;
  downloadError.value = null;
  downloadUrl.value = null;

  const jobId = props.jobId;

  try {
    // 建立混音請求
    const mixRequest: MixRequest = {
      drums_volume: tracks.drums.volume,
      bass_volume: tracks.bass.volume,
      other_volume: tracks.other.volume,
      vocals_volume: tracks.vocals.volume,
      pitch_shift: pitchShift.value,
      output_format: selectedFormat.value,
    };

    // 發送混音請求
    const response = await api.createMix(jobId, mixRequest);

    if (response.status === 'completed' && response.download_url) {
      // 快取命中，直接下載
      downloadUrl.value = response.download_url;
      downloadProgress.value = 100;
      triggerDownload(response.download_url);
      return;
    }

    // 輪詢混音狀態
    const mixId = response.mix_id;
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getMixStatus(jobId, mixId);
        downloadProgress.value = status.progress;

        if (status.status === 'completed' && status.download_url) {
          clearInterval(pollInterval);
          downloadUrl.value = status.download_url;
          triggerDownload(status.download_url);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          downloadError.value = status.error_message || '混音失敗';
          isDownloading.value = false;
        }
      } catch (err) {
        clearInterval(pollInterval);
        downloadError.value = '查詢狀態失敗';
        isDownloading.value = false;
      }
    }, 1000);

  } catch (err) {
    downloadError.value = '建立混音任務失敗';
    isDownloading.value = false;
  }
};

const triggerDownload = (url: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  isDownloading.value = false;
};

// Handle play/pause toggle
const togglePlay = async () => {
  if (isPlaying.value) {
    pause();
  } else {
    await play();
  }
};

// Handle seek
const handleSeek = (event: Event) => {
  const target = event.target as HTMLInputElement;
  seek(parseFloat(target.value));
};

// Initialize on mount
onMounted(async () => {
  await loadTracks();

  if (isReady.value) {
    emit('ready');

    // Enable sync if video element exists
    if (videoRef.value) {
      enableSync();
    }
  }
});

// Watch for errors
watch(error, (err) => {
  if (err) {
    emit('error', err);
  }
});

// Watch for video element changes
watch(() => props.videoElement, (video) => {
  videoRef.value = video ?? null;
  if (video && isReady.value) {
    enableSync();
  }
});

// Expose methods for parent component
defineExpose({
  play,
  pause,
  stop,
  seek,
  setVolume,
  setPitchShift,
  isPlaying,
  isReady,
  currentTime,
  duration,
  guideVocalsEnabled,
  toggleGuideVocals,
  togglePlay,
  formatTime,
  tracks,
  pitchShift,
});
</script>

<template>
  <div class="audio-mixer">
    <!-- Header -->
    <div class="mixer-header">
      <h3 class="mixer-title" :title="title">{{ title || '音軌混音' }}</h3>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="mixer-loading">
      <div class="loading-spinner"></div>
      <span>載入音軌中...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="mixer-error">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
    </div>

    <!-- Main content -->
    <div v-else class="mixer-content">
      <!-- Playback controls (can be hidden when displayed externally) -->
      <template v-if="!hidePlaybackControls">
        <div class="playback-controls">
          <button class="control-btn stop-btn" @click="stop" :disabled="!isReady">
            <span class="btn-icon">&#9632;</span>
          </button>
          <button class="control-btn play-btn" @click="togglePlay" :disabled="!isReady">
            <span class="btn-icon">{{ isPlaying ? '&#10074;&#10074;' : '&#9654;' }}</span>
          </button>
          <button
            class="guide-vocals-btn"
            :class="{ active: guideVocalsEnabled }"
            @click="toggleGuideVocals"
            :disabled="!isReady"
            title="導唱功能"
          >
            <span class="guide-icon">&#127908;</span>
            <span class="guide-label">{{ guideVocalsEnabled ? '關閉導唱' : '開啟導唱' }}</span>
          </button>
        </div>

        <!-- Time display and seek -->
        <div class="time-controls">
          <span class="time-display">{{ formatTime(currentTime) }}</span>
          <div class="seek-container">
            <div class="seek-track">
              <div
                class="seek-fill"
                :style="{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }"
              ></div>
            </div>
            <input
              type="range"
              class="seek-slider"
              min="0"
              :max="duration"
              step="0.1"
              :value="currentTime"
              @input="handleSeek"
              :disabled="!isReady"
            />
          </div>
          <span class="time-display">{{ formatTime(duration) }}</span>
        </div>
      </template>

      <!-- Track sliders -->
      <div class="track-sliders">
        <template v-for="name in trackNames" :key="name">
          <TrackSlider
            :track="tracks[name]"
            @update:volume="(v) => handleVolumeChange(name, v)"
          />
          <!-- 導唱按鈕 - 放在人聲滑桿下方 -->
          <div v-if="name === 'vocals'" class="guide-vocals-row">
            <button
              class="guide-vocals-btn"
              :class="{ active: guideVocalsEnabled }"
              @click="toggleGuideVocals"
              :disabled="!isReady"
            >
              <span class="guide-icon">&#127908;</span>
              <span>{{ guideVocalsEnabled ? '關閉導唱' : '開啟導唱' }}</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Pitch control -->
      <PitchControl
        :value="pitchShift"
        @update:value="handlePitchChange"
      />

      <!-- Download section -->
      <div v-if="!hideDownload" class="download-section">
        <div class="download-header">
          <span class="download-label">下載自訂混音</span>
        </div>

        <div class="format-selector">
          <label
            v-for="(label, format) in formatLabels"
            :key="format"
            class="format-option"
            :class="{ selected: selectedFormat === format }"
          >
            <input
              type="radio"
              :value="format"
              v-model="selectedFormat"
              :disabled="isDownloading"
            />
            <span class="format-label">{{ label }}</span>
          </label>
        </div>

        <button
          class="download-btn"
          @click="startDownload"
          :disabled="!isReady || isDownloading"
        >
          <span v-if="isDownloading" class="download-progress-text">
            處理中 {{ downloadProgress }}%
          </span>
          <span v-else>下載混音檔案</span>
        </button>

        <div v-if="isDownloading" class="download-progress-bar">
          <div class="progress-fill" :style="{ width: `${downloadProgress}%` }"></div>
        </div>

        <div v-if="downloadError" class="download-error">
          {{ downloadError }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-mixer {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
}

.mixer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.mixer-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #333;
}

.mixer-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.mixer-loading,
.mixer-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: #666;
}

.mixer-error {
  color: #e74c3c;
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: #e74c3c;
  color: white;
  border-radius: 50%;
  font-weight: bold;
  font-size: 0.875rem;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #4a90d9;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.mixer-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.playback-controls {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.control-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #4a90d9;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, transform 0.1s;
}

.control-btn:hover:not(:disabled) {
  background: #3a7bc8;
  transform: scale(1.05);
}

.control-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 0.875rem;
}

.stop-btn {
  background: #e74c3c;
}

.stop-btn:hover:not(:disabled) {
  background: #c0392b;
}

.time-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.time-display {
  font-size: 0.75rem;
  color: #666;
  min-width: 2.5rem;
  text-align: center;
}

.seek-container {
  flex: 1;
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.seek-track {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
  pointer-events: none;
}

.seek-fill {
  height: 100%;
  background: #4a90d9;
  border-radius: 2px;
  transition: width 0.05s linear;
}

.seek-slider {
  position: relative;
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 20px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}

.seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #4a90d9;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.seek-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #4a90d9;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.seek-slider::-moz-range-track {
  background: transparent;
}

.seek-slider:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.track-sliders {
  border-top: 1px solid #e0e0e0;
  padding-top: 0.5rem;
}

.guide-vocals-row {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0 0.5rem;
  border-bottom: 1px solid #eee;
}

.guide-vocals-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 20px;
  background: white;
  color: #666;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
}

.guide-vocals-btn:hover:not(:disabled) {
  border-color: #9b59b6;
  color: #9b59b6;
}

.guide-vocals-btn.active {
  background: #9b59b6;
  border-color: #9b59b6;
  color: white;
}

.guide-vocals-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.guide-icon {
  font-size: 1rem;
}

.guide-label {
  white-space: nowrap;
}

/* Download section */
.download-section {
  border-top: 1px solid #e0e0e0;
  padding-top: 1rem;
  margin-top: 0.5rem;
}

.download-header {
  margin-bottom: 0.75rem;
}

.download-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
}

.format-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.format-option {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s;
}

.format-option:hover {
  border-color: #4a90d9;
}

.format-option.selected {
  background: #4a90d9;
  border-color: #4a90d9;
  color: white;
}

.format-option input {
  display: none;
}

.download-btn {
  width: 100%;
  padding: 0.75rem;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.download-btn:hover:not(:disabled) {
  background: #43a047;
}

.download-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.download-progress-bar {
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin-top: 0.5rem;
  overflow: hidden;
}

.download-progress-bar .progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s;
}

.download-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #fee;
  color: #c00;
  border-radius: 4px;
  font-size: 0.75rem;
}
</style>
