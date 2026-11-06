<template>
  <div
    class="task-item"
    :class="{ pending: job.status === 'pending' }"
    :title="job.source_title || undefined"
    @click="$emit('click', job.id)"
  >
    <div class="task-row">
      <span class="task-title">{{ job.source_title || '處理中...' }}</span>
      <button
        class="cancel-btn"
        @click.stop="$emit('cancel', job.id)"
        title="取消處理"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="task-row">
      <span class="task-status">{{ statusText }}</span>
      <span class="progress-text">{{ displayProgress }}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${displayProgress}%` }"></div>
    </div>
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
/* 固定寬度、文字不換行：任務再多也只橫向捲動，佇列高度不變 */
.task-item {
  flex: 0 0 220px;
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.5rem 0.75rem;
  background: #252525;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
  box-sizing: border-box;
}

.task-item:hover {
  background: #2a2a2a;
}

/* 排隊中的任務淡化，與處理中的任務區分 */
.task-item.pending {
  opacity: 0.6;
}

.task-item.pending:hover {
  opacity: 1;
}

.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
}

.task-title,
.task-status {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-title {
  font-size: 0.85rem;
  color: #e0e0e0;
}

.task-status {
  font-size: 0.7rem;
  color: #888;
}

.progress-text {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: #888;
  font-family: monospace;
}

.progress-bar {
  height: 3px;
  margin-top: 0.15rem;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4a9eff;
  transition: width 0.3s;
}

.cancel-btn {
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0.15rem;
  margin: -0.15rem -0.25rem -0.15rem 0;
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
