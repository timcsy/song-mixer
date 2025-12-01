<template>
  <div class="task-item" @click="$emit('click', job.id)">
    <div class="task-info">
      <span class="task-title">{{ job.source_title || '處理中...' }}</span>
      <span class="task-status">{{ statusText }}</span>
    </div>
    <div class="task-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${displayProgress}%` }"></div>
      </div>
      <span class="progress-text">{{ displayProgress }}%</span>
    </div>
    <button
      class="cancel-btn"
      @click.stop="$emit('cancel', job.id)"
      title="取消處理"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProcessingJob } from '@/services/api'

interface Props {
  job: ProcessingJob
}

const props = defineProps<Props>()

defineEmits<{
  click: [jobId: string]
  cancel: [jobId: string]
}>()

// 確保進度值有效
const displayProgress = computed(() => {
  const progress = props.job.progress
  if (typeof progress !== 'number' || isNaN(progress) || !isFinite(progress)) {
    return 0
  }
  return Math.round(Math.max(0, Math.min(100, progress)))
})

const statusText = computed(() => {
  if (props.job.current_stage) {
    return props.job.current_stage
  }
  switch (props.job.status) {
    case 'pending':
      return '等待中'
    case 'downloading':
      return '下載中'
    case 'separating':
      return '分離人聲中'
    case 'merging':
      return '影片擷取中'
    case 'mixing':
      return '混音中'
    default:
      return '處理中'
  }
})
</script>

<style scoped>
.task-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #252525;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
  min-width: 200px;
}

.task-item:hover {
  background: #2a2a2a;
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.task-title {
  font-size: 0.85rem;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.task-status {
  font-size: 0.7rem;
  color: #888;
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-bar {
  width: 60px;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4a9eff;
  transition: width 0.3s;
}

.progress-text {
  font-size: 0.7rem;
  color: #888;
  font-family: monospace;
  min-width: 32px;
}

.cancel-btn {
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.cancel-btn:hover {
  background: #3d1a1a;
  color: #ff6b6b;
}
</style>
