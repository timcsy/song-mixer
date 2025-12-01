<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2>處理進度</h2>
        <button class="close-btn" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- 歌曲標題 -->
        <div class="task-title">
          <span class="title-text">{{ job.source_title || '處理中...' }}</span>
        </div>

        <!-- 整體進度 -->
        <div class="overall-progress">
          <div class="progress-bar-large">
            <div class="progress-fill" :style="{ width: `${job.progress}%` }"></div>
          </div>
          <span class="progress-percent">{{ job.progress }}%</span>
        </div>

        <!-- 處理階段列表 -->
        <div class="stages">
          <div
            v-for="(stage, index) in stages"
            :key="stage.id"
            class="stage-item"
            :class="{
              completed: isStageCompleted(stage.id),
              active: isStageActive(stage.id),
              pending: isStagePending(stage.id)
            }"
          >
            <div class="stage-icon">
              <svg v-if="isStageCompleted(stage.id)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div v-else-if="isStageActive(stage.id)" class="spinner"></div>
              <span v-else class="stage-number">{{ index + 1 }}</span>
            </div>
            <div class="stage-info">
              <span class="stage-name">{{ stage.name }}</span>
              <span class="stage-desc">{{ stage.description }}</span>
            </div>
            <div v-if="isStageActive(stage.id)" class="stage-time">
              {{ formatElapsedTime(elapsedTime) }}
            </div>
          </div>
        </div>

        <!-- 當前狀態 -->
        <div class="current-status">
          <span class="status-label">目前狀態：</span>
          <span class="status-text">{{ currentStageText }}</span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="$emit('cancel', job.id)">取消處理</button>
        <button class="btn-secondary" @click="$emit('close')">關閉</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { ProcessingJob } from '@/services/api'

interface Props {
  job: ProcessingJob
}

const props = defineProps<Props>()

defineEmits<{
  close: []
  cancel: [jobId: string]
}>()

// 判斷是否為本地處理任務
const isLocalJob = computed(() => props.job.id === 'local-processing')

// 判斷是否為 YouTube 來源（使用 source_type 欄位）
const isYouTubeSource = computed(() => {
  return props.job.source_type === 'youtube'
})

// 本地處理階段定義（上傳檔案）
const localUploadStages = [
  { id: 'extracting', name: '載入引擎', description: '載入 FFmpeg 引擎' },
  { id: 'extracting_audio', name: '提取音頻', description: '從影片提取音頻' },
  { id: 'model_loading', name: '載入 AI 模型', description: '下載並載入 AI 分離模型' },
  { id: 'separating', name: 'AI 分離處理', description: '使用 AI 模型分離人聲與伴奏' },
  { id: 'saving', name: '儲存資料', description: '儲存音軌與影片資料' },
]

// 本地處理階段定義（YouTube）
const localYouTubeStages = [
  { id: 'downloading', name: '下載影片', description: '從 YouTube 下載影片與音訊' },
  { id: 'extracting', name: '轉換音訊', description: '載入 FFmpeg 並轉換音訊格式' },
  { id: 'model_loading', name: '載入 AI 模型', description: '下載並載入 AI 分離模型' },
  { id: 'separating', name: 'AI 分離處理', description: '使用 AI 模型分離人聲與伴奏' },
  { id: 'merging', name: '合併影片', description: '合併無聲影片與原始音訊' },
  { id: 'saving', name: '儲存資料', description: '儲存音軌與影片資料' },
]

// 後端處理階段定義（舊版相容）
const backendStages = [
  { id: 'pending', name: '等待處理', description: '排隊等待處理中' },
  { id: 'downloading', name: '下載影片', description: '從來源下載影片檔案' },
  { id: 'separating', name: 'AI 分離處理', description: '使用 AI 模型分離人聲與伴奏' },
  { id: 'merging', name: '影片合成', description: '將處理後的音訊與原始影片合成' },
]

// 根據任務類型選擇階段
const stages = computed(() => {
  if (isLocalJob.value) {
    return isYouTubeSource.value ? localYouTubeStages : localUploadStages
  }
  return backendStages
})

// 根據 current_stage 訊息判斷當前階段
const currentStageId = computed(() => {
  const msg = props.job.current_stage || ''
  const status = props.job.status

  if (isLocalJob.value) {
    // 本地處理：根據訊息內容判斷
    // YouTube 模式
    if (isYouTubeSource.value) {
      // 下載階段
      if (msg.includes('YouTube') || msg.includes('下載影片') || msg.includes('下載音訊') || msg.includes('準備下載')) {
        return 'downloading'
      }
      // 轉換音訊階段
      if (msg.includes('載入 FFmpeg') || msg.includes('FFmpeg') || msg.includes('轉換音訊')) {
        return 'extracting'
      }
      // 載入 AI 模型階段
      if (msg.includes('下載 AI 模型') || msg.includes('AI 模型')) {
        return 'model_loading'
      }
      // 分離階段
      if (msg.includes('分離音軌') || msg.includes('區段')) {
        return 'separating'
      }
      // 合併影片階段
      if (msg.includes('合併影片') || msg.includes('合併')) {
        return 'merging'
      }
      // 儲存階段
      if (msg.includes('儲存')) {
        return 'saving'
      }
      // 根據 status 備用判斷
      if (status === 'downloading') return 'downloading'
      if (status === 'separating') return 'separating'
      if (status === 'merging') return 'merging'
      return 'downloading'
    }

    // 上傳模式
    if (msg.includes('載入 FFmpeg') || msg.includes('FFmpeg')) {
      return 'extracting'
    }
    if (msg.includes('提取音頻')) {
      return 'extracting_audio'
    }
    if (msg.includes('下載 AI 模型') || msg.includes('AI 模型')) {
      return 'model_loading'
    }
    if (msg.includes('分離音軌') || msg.includes('區段')) {
      return 'separating'
    }
    if (msg.includes('儲存')) {
      return 'saving'
    }
    // 根據 status 備用判斷
    if (status === 'separating') return 'separating'
    if (status === 'merging') return 'saving'
    return 'extracting'
  }

  // 後端處理：直接使用 status
  return status
})

// 階段順序對應（動態計算）
const stageOrder = computed(() => {
  const order: Record<string, number> = {}
  stages.value.forEach((stage, index) => {
    order[stage.id] = index
  })
  order['completed'] = stages.value.length
  order['mixing'] = stages.value.length - 1
  return order
})

// 當前階段索引
const currentStageIndex = computed(() => {
  return stageOrder.value[currentStageId.value] ?? 0
})

// 判斷階段狀態
function isStageCompleted(stageId: string): boolean {
  const stageIdx = stageOrder.value[stageId] ?? 0
  return currentStageIndex.value > stageIdx
}

function isStageActive(stageId: string): boolean {
  const stageIdx = stageOrder.value[stageId] ?? 0
  return currentStageIndex.value === stageIdx
}

function isStagePending(stageId: string): boolean {
  const stageIdx = stageOrder.value[stageId] ?? 0
  return currentStageIndex.value < stageIdx
}

// 當前狀態文字
const currentStageText = computed(() => {
  if (props.job.current_stage) {
    return props.job.current_stage
  }
  switch (props.job.status) {
    case 'pending':
      return '等待處理中...'
    case 'downloading':
      return '下載影片中...'
    case 'separating':
      return 'AI 分離人聲中...'
    case 'merging':
      return '影片合成中...'
    case 'mixing':
      return '混音處理中...'
    default:
      return '處理中...'
  }
})

// 經過時間計時器
const elapsedTime = ref(0)
let timerInterval: number | null = null

onMounted(() => {
  timerInterval = window.setInterval(() => {
    elapsedTime.value++
  }, 1000)
})

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: #1e1e1e;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  transition: color 0.15s;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  padding: 1.5rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.task-title {
  margin-bottom: 1.25rem;
  flex-shrink: 0;
}

.title-text {
  font-size: 1.1rem;
  font-weight: 500;
  color: #e0e0e0;
}

.overall-progress {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.progress-bar-large {
  flex: 1;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a9eff, #6bb3ff);
  transition: width 0.3s ease;
}

.progress-percent {
  font-size: 1.1rem;
  font-weight: 600;
  color: #4a9eff;
  min-width: 48px;
  text-align: right;
}

.stages {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #252525;
  border-radius: 8px;
  transition: all 0.2s;
}

.stage-item.completed {
  background: rgba(76, 175, 80, 0.1);
}

.stage-item.active {
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.stage-item.pending {
  opacity: 0.5;
}

.stage-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #333;
  flex-shrink: 0;
}

.stage-item.completed .stage-icon {
  background: #4caf50;
  color: #fff;
}

.stage-item.active .stage-icon {
  background: #4a9eff;
}

.stage-number {
  font-size: 0.85rem;
  color: #888;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stage-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.stage-name {
  font-size: 0.9rem;
  color: #e0e0e0;
  font-weight: 500;
}

.stage-desc {
  font-size: 0.75rem;
  color: #888;
}

.stage-time {
  font-size: 0.8rem;
  color: #4a9eff;
  font-family: monospace;
}

.current-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #2a2a2a;
  border-radius: 6px;
  flex-shrink: 0;
}

.status-label {
  font-size: 0.85rem;
  color: #888;
}

.status-text {
  font-size: 0.9rem;
  color: #4a9eff;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid #333;
  flex-shrink: 0;
}

.btn-cancel {
  padding: 0.6rem 1.5rem;
  background: transparent;
  border: 1px solid #ff6b6b;
  border-radius: 4px;
  color: #ff6b6b;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
}

.btn-cancel:hover {
  background: rgba(255, 107, 107, 0.1);
}

.btn-secondary {
  padding: 0.6rem 1.5rem;
  background: #333;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.15s;
}

.btn-secondary:hover {
  background: #444;
}
</style>
