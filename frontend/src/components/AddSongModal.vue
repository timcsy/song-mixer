<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2>新增歌曲</h2>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <div v-if="error" class="error-message">
          {{ error }}
          <button @click="error = null">×</button>
        </div>

        <div class="input-tabs">
          <button
            class="tab"
            :class="{ active: activeTab === 'url' }"
            @click="switchTab('url')"
          >
            YouTube 網址
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'upload' }"
            @click="switchTab('upload')"
          >
            上傳檔案
          </button>
        </div>

        <div class="tab-content">
          <!-- YouTube URL 輸入 -->
          <div v-if="activeTab === 'url'" class="url-input">
            <!-- YouTube 功能不可用提示 -->
            <div v-if="!backend.available || !backend.youtube" class="warning-message">
              <p>YouTube 功能僅在 Docker 部署模式下可用。</p>
              <p>請切換到「上傳檔案」標籤，上傳本地影片檔案。</p>
            </div>

            <input
              v-model="youtubeUrl"
              type="text"
              placeholder="貼上 YouTube 網址..."
              :disabled="isSubmitting || !backend.youtube"
              @input="onUrlInput"
              @paste="onUrlPaste"
              @keyup.enter="submitUrl"
            />

            <!-- YouTube 預覽 -->
            <div v-if="youtubePreview" class="preview-card">
              <div class="video-container">
                <iframe
                  :src="`https://www.youtube-nocookie.com/embed/${youtubePreview.videoId}`"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                  credentialless
                ></iframe>
              </div>
              <div class="preview-info">
                <p class="preview-title">{{ youtubePreview.title }}</p>
              </div>
            </div>

            <button
              class="submit-btn"
              :disabled="!youtubeUrl || isSubmitting || !backend.youtube"
              @click="submitUrl"
            >
              {{ isSubmitting ? currentProgressLabel : '開始處理' }}
            </button>
          </div>

          <!-- 檔案上傳 -->
          <div v-else class="file-upload">
            <div
              v-if="!selectedFile"
              class="drop-zone"
              :class="{ dragover: isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <input
                ref="fileInput"
                type="file"
                accept=".mp4,.mov,.avi,.mkv,.webm"
                @change="handleFileSelect"
                style="display: none"
              />
              <p>
                拖放影片檔案到這裡<br>
                或 <button class="link-btn" @click="fileInput?.click()">選擇檔案</button>
              </p>
            </div>

            <!-- 檔案預覽 -->
            <div v-else class="file-preview">
              <video
                ref="videoPreview"
                :src="filePreviewUrl"
                class="preview-video"
                controls
                muted
              ></video>
              <div class="file-info">
                <p class="file-name">{{ selectedFile.name }}</p>
                <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
                <button class="link-btn remove-btn" @click="clearFile">移除</button>
              </div>
              <!-- 檔案大小警告 -->
              <div v-if="fileSizeWarning" class="warning-message small">
                {{ fileSizeWarning }}
              </div>
            </div>

            <!-- 處理進度條 -->
            <div v-if="isSubmitting && processingState.stage !== 'idle'" class="progress-container">
              <!-- 主進度條 -->
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${safeProgress}%` }"></div>
              </div>
              <div class="progress-info">
                <p class="progress-label">{{ currentProgressLabel }}</p>
                <span class="progress-percent">{{ safeProgress }}%</span>
              </div>
              <!-- 子進度條（顯示當前子任務的細節進度） -->
              <div v-if="showSubProgress" class="sub-progress">
                <div class="sub-progress-bar">
                  <div class="sub-progress-fill" :style="{ width: `${safeSubProgress}%` }"></div>
                </div>
              </div>
            </div>

            <button
              class="submit-btn"
              :disabled="!selectedFile || isSubmitting"
              @click="submitFile"
            >
              {{ isSubmitting ? currentProgressLabel : '開始處理' }}
            </button>

            <!-- 取消按鈕 -->
            <button
              v-if="isSubmitting"
              class="cancel-btn"
              @click="handleCancel"
            >
              取消處理
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { getBackendCapabilities } from '@/services/api'
import { useLocalProcessor } from '@/composables/useLocalProcessor'
import { useJobManager } from '@/composables/useJobManager'
import type { ProcessingState } from '@/types/storage'

const emit = defineEmits<{
  close: []
  created: []
}>()

const { processUpload, processYouTube, state: processingState, cancel: cancelProcessing } = useLocalProcessor()
const { refreshJobs } = useJobManager()

const activeTab = ref<'url' | 'upload'>('url')
const youtubeUrl = ref('')
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const videoPreview = ref<HTMLVideoElement | null>(null)
const isSubmitting = ref(false)
const error = ref<string | null>(null)
const isDragging = ref(false)

// 後端功能偵測
const backend = getBackendCapabilities()

// 處理進度顯示 - 使用詳細的 message 欄位
const currentProgressLabel = computed(() => {
  const state = processingState.value
  if (state.stage === 'idle') return ''

  // 優先使用詳細訊息
  if (state.message) {
    return state.message
  }

  // 備用：基本階段標籤
  const progressStageLabels: Record<ProcessingState['stage'], string> = {
    idle: '',
    downloading: '下載影片中',
    extracting: '提取音頻中',
    separating: '分離人聲中',
    saving: '儲存中',
  }
  const label = progressStageLabels[state.stage]
  return `${label}...`
})

// 安全取得進度值
const safeProgress = computed(() => {
  const progress = processingState.value.progress
  if (typeof progress !== 'number' || isNaN(progress) || !isFinite(progress)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(progress)))
})

// 安全取得子進度值
const safeSubProgress = computed(() => {
  const subProgress = processingState.value.subProgress
  if (typeof subProgress !== 'number' || isNaN(subProgress) || !isFinite(subProgress)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(subProgress)))
})

// 是否顯示子進度條
const showSubProgress = computed(() => {
  return processingState.value.subStage !== null && safeSubProgress.value > 0
})

// YouTube 預覽
interface YouTubePreview {
  title: string
  thumbnail: string
  videoId: string
}
const youtubePreview = ref<YouTubePreview | null>(null)
let urlDebounceTimer: number | null = null

// 檔案預覽 URL
const filePreviewUrl = computed(() => {
  if (selectedFile.value) {
    return URL.createObjectURL(selectedFile.value)
  }
  return ''
})

// 清理 blob URL
watch(selectedFile, (newFile, oldFile) => {
  if (oldFile && !newFile) {
    // 檔案被清除時釋放舊的 blob URL
  }
})

onUnmounted(() => {
  if (filePreviewUrl.value) {
    URL.revokeObjectURL(filePreviewUrl.value)
  }
})

// 從 YouTube URL 解析影片 ID
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// URL 輸入防抖處理
function onUrlInput() {
  if (urlDebounceTimer) {
    clearTimeout(urlDebounceTimer)
  }
  urlDebounceTimer = window.setTimeout(() => {
    updateYoutubePreview()
  }, 500)
}

// 貼上時立即更新預覽
function onUrlPaste(event: ClipboardEvent) {
  const pastedText = event.clipboardData?.getData('text')
  if (pastedText) {
    // 使用 nextTick 確保 v-model 已更新
    setTimeout(() => {
      if (urlDebounceTimer) {
        clearTimeout(urlDebounceTimer)
      }
      updateYoutubePreview()
    }, 0)
  }
}

// 更新 YouTube 預覽
function updateYoutubePreview() {
  const videoId = extractVideoId(youtubeUrl.value)
  if (videoId) {
    youtubePreview.value = {
      videoId,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      title: '載入中...',
    }
    // 使用 noembed 取得標題（免費、無需 API key）
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
      .then(res => res.json())
      .then(data => {
        if (youtubePreview.value && youtubePreview.value.videoId === videoId) {
          youtubePreview.value.title = data.title || '未知標題'
        }
      })
      .catch(() => {
        if (youtubePreview.value && youtubePreview.value.videoId === videoId) {
          youtubePreview.value.title = 'YouTube 影片'
        }
      })
  } else {
    youtubePreview.value = null
  }
}

// 切換 tab
function switchTab(tab: 'url' | 'upload') {
  activeTab.value = tab
  error.value = null
}

// 清除檔案
function clearFile() {
  if (filePreviewUrl.value) {
    URL.revokeObjectURL(filePreviewUrl.value)
  }
  selectedFile.value = null
}

// 格式化檔案大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

async function submitUrl() {
  if (!youtubeUrl.value || isSubmitting.value) return

  // 檢查後端 YouTube 功能是否可用
  if (!backend.available || !backend.youtube) {
    error.value = 'YouTube 功能僅在 Docker 部署模式下可用。請上傳本地影片檔案，或自行從 YouTube 下載影片後上傳。'
    return
  }

  // 立即關閉 modal，讓處理在背景進行
  emit('close')

  // 使用本地處理流程（透過後端下載 YouTube）
  processYouTube(youtubeUrl.value)
    .then(() => refreshJobs())
    .catch((e: any) => {
      console.error('YouTube 處理失敗:', e.message || e)
    })
}

async function submitFile() {
  if (!selectedFile.value || isSubmitting.value) return

  const file = selectedFile.value
  const title = file.name.replace(/\.[^.]+$/, '') // 移除副檔名作為標題

  // 立即關閉 modal，讓處理在背景進行
  emit('close')

  // 使用本地處理流程（純前端）
  processUpload(file, title)
    .then(() => refreshJobs())
    .catch((e: any) => {
      console.error('檔案處理失敗:', e.message || e)
    })
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    selectedFile.value = input.files[0]
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    selectedFile.value = event.dataTransfer.files[0]
  }
}

// 取消處理
function handleCancel() {
  cancelProcessing()
  isSubmitting.value = false
}

// 檢查檔案大小警告（100MB 軟限制）
const fileSizeWarning = computed(() => {
  if (!selectedFile.value) return null
  const sizeMB = selectedFile.value.size / (1024 * 1024)
  if (sizeMB > 100) {
    return `檔案大小 ${sizeMB.toFixed(1)} MB 超過 100 MB，處理可能需要較長時間且佔用較多記憶體。`
  }
  return null
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #333;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
}

.close-btn {
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  padding: 1.5rem;
}

.error-message {
  background: #3d1a1a;
  color: #ff6b6b;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-message button {
  background: transparent;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 1rem;
}

.input-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: #2a2a2a;
  border: none;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.tab.active {
  background: #3a3a3a;
  color: #e0e0e0;
}

.tab:hover:not(.active) {
  background: #333;
}

.url-input {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.url-input input {
  padding: 0.75rem 1rem;
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.9rem;
}

.url-input input:focus {
  outline: none;
  border-color: #4a9eff;
}

.file-upload {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.drop-zone {
  padding: 2rem;
  border: 2px dashed #333;
  border-radius: 8px;
  text-align: center;
  color: #888;
  transition: all 0.15s;
}

.drop-zone.dragover {
  border-color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
}

.link-btn {
  background: transparent;
  border: none;
  color: #4a9eff;
  cursor: pointer;
  text-decoration: underline;
}

.submit-btn {
  padding: 0.75rem 1.5rem;
  background: #4a9eff;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.15s;
}

.submit-btn:hover:not(:disabled) {
  background: #3a8eef;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* YouTube 預覽 */
.preview-card {
  background: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.video-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 */
}

.video-container iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.preview-info {
  padding: 0.75rem 1rem;
}

.preview-title {
  font-size: 0.85rem;
  color: #e0e0e0;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

/* 檔案預覽 */
.file-preview {
  background: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.preview-video {
  width: 100%;
  max-height: 200px;
  background: #000;
  display: block;
}

.file-info {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.file-name {
  font-size: 0.85rem;
  color: #e0e0e0;
  margin: 0;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 0.75rem;
  color: #888;
  margin: 0;
}

.remove-btn {
  font-size: 0.8rem;
}

/* 警告訊息 */
.warning-message {
  background: #3d3a1a;
  color: #ffcc6b;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  line-height: 1.5;
}

.warning-message p {
  margin: 0;
}

.warning-message p + p {
  margin-top: 0.25rem;
}

.warning-message.small {
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  margin-top: 0.5rem;
}

/* 進度條 */
.progress-container {
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a9eff 0%, #6ab4ff 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.progress-label {
  font-size: 0.8rem;
  color: #e0e0e0;
  margin: 0;
  flex: 1;
}

.progress-percent {
  font-size: 0.8rem;
  color: #4a9eff;
  font-weight: 500;
  font-family: monospace;
  min-width: 40px;
  text-align: right;
}

/* 子進度條 */
.sub-progress {
  margin-top: 0.5rem;
}

.sub-progress-bar {
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  overflow: hidden;
}

.sub-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6ab4ff 0%, #8eccff 100%);
  border-radius: 2px;
  transition: width 0.2s ease;
  opacity: 0.7;
}

/* 取消按鈕 */
.cancel-btn {
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: 1px solid #666;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
  margin-top: 0.5rem;
  transition: all 0.15s;
}

.cancel-btn:hover {
  background: #333;
  color: #e0e0e0;
  border-color: #888;
}
</style>
