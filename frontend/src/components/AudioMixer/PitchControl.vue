<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  value: number; // -12 to +12 semitones
}>();

const emit = defineEmits<{
  (e: 'update:value', value: number): void;
}>();

// Display text
const displayText = computed(() => {
  if (props.value === 0) return '原調';
  const sign = props.value > 0 ? '+' : '';
  return `${sign}${props.value} 半音`;
});

// Fill percentage: map -12 to +12 => 0% to 100%
const fillPercent = computed(() => ((props.value + 12) / 24) * 100);

// Handle slider change
const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:value', parseInt(target.value, 10));
};

// Quick adjust buttons
const adjustPitch = (delta: number) => {
  const newValue = Math.max(-12, Math.min(12, props.value + delta));
  emit('update:value', newValue);
};

// Reset to original key
const resetPitch = () => {
  emit('update:value', 0);
};
</script>

<template>
  <div class="pitch-control">
    <div class="pitch-header">
      <span class="pitch-label">升降 Key</span>
      <button
        v-if="value !== 0"
        class="reset-btn"
        @click="resetPitch"
      >
        重置
      </button>
      <span class="pitch-value">{{ displayText }}</span>
    </div>

    <div class="pitch-slider-row">
      <button
        class="adjust-btn"
        @click="adjustPitch(-1)"
        :disabled="value <= -12"
        title="降一個半音"
      >
        −
      </button>

      <div class="pitch-slider-container">
        <div class="pitch-track">
          <div
            class="pitch-fill-negative"
            :style="{ width: value < 0 ? `${Math.abs(value) / 12 * 50}%` : '0%' }"
          ></div>
          <div
            class="pitch-fill-positive"
            :style="{ width: value > 0 ? `${value / 12 * 50}%` : '0%' }"
          ></div>
          <div class="pitch-center-line"></div>
        </div>
        <input
          type="range"
          class="pitch-slider"
          min="-12"
          max="12"
          step="1"
          :value="value"
          @input="handleInput"
        />
      </div>

      <button
        class="adjust-btn"
        @click="adjustPitch(1)"
        :disabled="value >= 12"
        title="升一個半音"
      >
        +
      </button>
    </div>

    <div class="pitch-marks">
      <span>-12</span>
      <span>-6</span>
      <span class="center-mark">0</span>
      <span>+6</span>
      <span>+12</span>
    </div>
  </div>
</template>

<style scoped>
.pitch-control {
  padding: 0.5rem 0;
  border-top: 1px solid #e0e0e0;
}

.pitch-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.375rem;
  gap: 0.5rem;
}

.pitch-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #333;
}

.pitch-value {
  font-size: 0.8125rem;
  color: #4a90d9;
  font-weight: 600;
  margin-left: auto;
}

.reset-btn {
  padding: 0.125rem 0.5rem;
  background: none;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 0.6875rem;
  color: #666;
  cursor: pointer;
}

.reset-btn:hover {
  background: #f5f5f5;
}

.pitch-slider-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.adjust-btn {
  width: 24px;
  height: 24px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: bold;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.adjust-btn:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #ccc;
}

.adjust-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pitch-slider-container {
  flex: 1;
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.pitch-track {
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  pointer-events: none;
}

.pitch-fill-negative {
  position: absolute;
  right: 50%;
  top: 0;
  height: 100%;
  background: #e74c3c;
  border-radius: 3px 0 0 3px;
  transition: width 0.05s ease-out;
}

.pitch-fill-positive {
  position: absolute;
  left: 50%;
  top: 0;
  height: 100%;
  background: #3498db;
  border-radius: 0 3px 3px 0;
  transition: width 0.05s ease-out;
}

.pitch-center-line {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background: #999;
  transform: translateX(-50%);
}

.pitch-slider {
  position: relative;
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 20px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}

.pitch-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border: 2px solid #4a90d9;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.pitch-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: white;
  border: 2px solid #4a90d9;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.pitch-slider::-moz-range-track {
  background: transparent;
}

.pitch-marks {
  display: flex;
  justify-content: space-between;
  margin-top: 0.125rem;
  padding: 0 24px;
  font-size: 0.5625rem;
  color: #999;
}

.center-mark {
  color: #4a90d9;
  font-weight: 600;
}
</style>
