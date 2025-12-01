<!--
  瀏覽器相容性警告元件
  Feature: 005-frontend-processing

  T025: 瀏覽器不支援時的全螢幕警告
  T026: WebGPU 不支援時的效能警告提示
-->
<template>
  <!-- 全螢幕阻擋警告（瀏覽器完全不支援） -->
  <div v-if="!isSupported" class="fullscreen-warning">
    <div class="warning-content">
      <div class="warning-icon">⚠️</div>
      <h1>瀏覽器不支援</h1>
      <p class="description">
        您的瀏覽器不支援本應用程式所需的功能。
      </p>
      <div class="details">
        <p>需要以下功能：</p>
        <ul>
          <li :class="{ missing: !capabilities.sharedArrayBuffer }">
            SharedArrayBuffer
            <span v-if="!capabilities.sharedArrayBuffer" class="status">✗ 不支援</span>
            <span v-else class="status supported">✓ 支援</span>
          </li>
          <li :class="{ missing: !capabilities.indexedDB }">
            IndexedDB
            <span v-if="!capabilities.indexedDB" class="status">✗ 不支援</span>
            <span v-else class="status supported">✓ 支援</span>
          </li>
        </ul>
      </div>
      <div class="recommendations">
        <p>建議使用以下瀏覽器：</p>
        <ul>
          <li>Chrome 92+</li>
          <li>Edge 92+</li>
          <li>Firefox 79+</li>
          <li>Safari 15.2+</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- WebGPU 效能警告（可關閉） -->
  <div v-else-if="showPerformanceWarning && !capabilities.webGPU" class="performance-warning">
    <div class="warning-banner">
      <span class="icon">⚡</span>
      <span class="message">
        您的瀏覽器不支援 WebGPU，人聲分離將使用 CPU 運算，處理速度可能較慢。
      </span>
      <button @click="dismissPerformanceWarning" class="dismiss-btn">
        知道了
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BrowserCapabilities } from '@/types/storage'

const props = defineProps<{
  capabilities: BrowserCapabilities
}>()

// 是否支援（必要功能都具備）
const isSupported = computed(() => {
  return props.capabilities.sharedArrayBuffer && props.capabilities.indexedDB
})

// 效能警告狀態
const showPerformanceWarning = ref(true)

function dismissPerformanceWarning() {
  showPerformanceWarning.value = false
  // 記住使用者選擇
  localStorage.setItem('webgpu-warning-dismissed', 'true')
}

// 初始化時檢查使用者是否已經關閉過警告
if (localStorage.getItem('webgpu-warning-dismissed') === 'true') {
  showPerformanceWarning.value = false
}
</script>

<style scoped>
/* 全螢幕警告 */
.fullscreen-warning {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
}

.warning-content {
  max-width: 480px;
  text-align: center;
}

.warning-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.fullscreen-warning h1 {
  font-size: 1.75rem;
  color: #ff6b6b;
  margin: 0 0 1rem;
}

.fullscreen-warning .description {
  font-size: 1rem;
  color: #888;
  margin-bottom: 1.5rem;
}

.details,
.recommendations {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  text-align: left;
}

.details p,
.recommendations p {
  margin: 0 0 0.5rem;
  color: #e0e0e0;
  font-weight: 500;
}

.details ul,
.recommendations ul {
  margin: 0;
  padding-left: 1.5rem;
}

.details li,
.recommendations li {
  color: #888;
  padding: 0.25rem 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.details li.missing {
  color: #ff6b6b;
}

.status {
  font-size: 0.85rem;
  color: #ff6b6b;
}

.status.supported {
  color: #6bff6b;
}

/* 效能警告 */
.performance-warning {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(90deg, #3d3a1a 0%, #4d4a2a 100%);
  color: #ffcc6b;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}

.warning-banner .icon {
  font-size: 1.25rem;
}

.warning-banner .message {
  flex: 1;
}

.dismiss-btn {
  background: rgba(255, 204, 107, 0.2);
  border: 1px solid #ffcc6b;
  color: #ffcc6b;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.dismiss-btn:hover {
  background: rgba(255, 204, 107, 0.3);
}

/* 響應式 */
@media (max-width: 480px) {
  .warning-banner {
    flex-direction: column;
    text-align: center;
  }

  .warning-banner .message {
    margin-bottom: 0.5rem;
  }
}
</style>
