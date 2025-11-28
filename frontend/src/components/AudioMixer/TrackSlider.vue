<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { TRACK_LABELS, type TrackName, type TrackState } from '@/types/audio';

const props = defineProps<{
  track: TrackState;
}>();

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
}>();

const sliderRef = ref<HTMLInputElement | null>(null);

const label = computed(() => TRACK_LABELS[props.track.name]);

// 轉換 0-2 範圍到 0-200 百分比顯示
const displayPercent = computed(() => Math.round(props.track.volume * 100));

// 計算填充百分比 (0-200 映射到 0-100%)
const fillPercent = computed(() => (props.track.volume / 2) * 100);

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const value = parseFloat(target.value) / 100; // 轉回 0-2 範圍
  emit('update:volume', value);
};

const trackColors: Record<TrackName, string> = {
  drums: '#e74c3c',
  bass: '#3498db',
  other: '#2ecc71',
  vocals: '#9b59b6',
};

const trackColor = computed(() => trackColors[props.track.name]);
</script>

<template>
  <div class="track-slider" :class="{ loading: !track.loaded, error: track.error }">
    <div class="track-header">
      <span class="track-label">{{ label }}</span>
      <span class="track-percent">{{ displayPercent }}%</span>
    </div>

    <div class="slider-container">
      <div class="slider-track">
        <div
          class="slider-fill"
          :style="{
            width: `${fillPercent}%`,
            backgroundColor: trackColor
          }"
        ></div>
      </div>
      <input
        ref="sliderRef"
        type="range"
        min="0"
        max="200"
        step="1"
        :value="displayPercent"
        :disabled="!track.loaded || !!track.error"
        @input="handleInput"
        class="slider"
        :style="{ '--track-color': trackColor }"
      />
    </div>

    <div v-if="!track.loaded && !track.error" class="track-status loading-status">
      載入中...
    </div>
    <div v-if="track.error" class="track-status error-status">
      {{ track.error }}
    </div>
  </div>
</template>

<style scoped>
.track-slider {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.track-slider:last-child {
  border-bottom: none;
}

.track-slider.loading {
  opacity: 0.6;
}

.track-slider.error {
  opacity: 0.5;
}

.track-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.track-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #333;
}

.track-percent {
  font-size: 0.75rem;
  color: #666;
  min-width: 3rem;
  text-align: right;
}

.slider-container {
  position: relative;
  width: 100%;
  height: 20px;
  display: flex;
  align-items: center;
}

.slider-track {
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  pointer-events: none;
}

.slider-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.05s ease-out;
}

.slider {
  position: relative;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 20px;
  background: transparent;
  outline: none;
  cursor: pointer;
  margin: 0;
}

.slider:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--track-color, #4a90d9);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.1s;
  position: relative;
  z-index: 2;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--track-color, #4a90d9);
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.slider::-moz-range-track {
  background: transparent;
  height: 6px;
}

.track-status {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
}

.loading-status {
  color: #666;
}

.error-status {
  color: #e74c3c;
}
</style>
