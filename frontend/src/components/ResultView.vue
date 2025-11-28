<script setup lang="ts">
import { computed } from 'vue';
import { api, type JobWithResult } from '../services/api';
import ProgressBar from './ProgressBar.vue';

const props = defineProps<{
  job: JobWithResult;
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
}>();

const isCompleted = computed(() => props.job.status === 'completed');
const isFailed = computed(() => props.job.status === 'failed');
const isProcessing = computed(() => !isCompleted.value && !isFailed.value);

const statusText = computed(() => {
  switch (props.job.status) {
    case 'pending':
      return '等待處理';
    case 'downloading':
      return '下載中';
    case 'separating':
      return '分離人聲中';
    case 'merging':
      return '合併影片中';
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
  // 總是使用 API 下載端點，避免 MinIO 內部 URL 問題
  return api.getDownloadUrl(props.job.id);
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
      <div class="status-icon success-icon">✓</div>
      <h2>處理完成</h2>
      <div class="result-info" v-if="job.result">
        <p v-if="durationText">影片長度：{{ durationText }}</p>
        <p v-if="fileSizeText">檔案大小：{{ fileSizeText }}</p>
      </div>
      <a :href="downloadUrl" class="download-btn" download>
        下載伴奏影片
      </a>
      <button @click="emit('reset')" class="new-btn">
        處理新影片
      </button>
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
  text-align: center;
  padding: 2rem;
}

.status-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.processing-icon {
  background: #e8f4fd;
}

.success-icon {
  background: #e8f8e8;
  color: #4caf50;
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
  to {
    transform: rotate(360deg);
  }
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.progress-text {
  color: #666;
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  max-width: 300px;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  margin: 0 auto;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4a90d9;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.result-info {
  margin: 1rem 0;
  color: #666;
}

.result-info p {
  margin: 0.25rem 0;
}

.download-btn {
  display: inline-block;
  padding: 0.75rem 2rem;
  background: #4caf50;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 1rem;
  margin-top: 1rem;
}

.download-btn:hover {
  background: #43a047;
}

.new-btn,
.retry-btn {
  display: block;
  margin: 1rem auto 0;
  padding: 0.5rem 1rem;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: #666;
  cursor: pointer;
}

.new-btn:hover,
.retry-btn:hover {
  background: #f5f5f5;
}

.error-message {
  color: #c00;
  margin: 1rem 0;
}

.retry-btn {
  background: #4a90d9;
  color: white;
  border: none;
}

.retry-btn:hover {
  background: #3a7bc8;
}
</style>
