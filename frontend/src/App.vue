<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { api, type Job, type JobWithResult } from './services/api';
import UrlInput from './components/UrlInput.vue';
import FileUpload from './components/FileUpload.vue';
import ResultView from './components/ResultView.vue';

// 應用程式狀態
const currentJob = ref<JobWithResult | null>(null);
const error = ref<string | null>(null);
let pollInterval: number | null = null;

// 處理任務建立
function handleJobCreated(job: Job) {
  currentJob.value = { ...job, result: null };
  error.value = null;
  startPolling();
}

// 處理錯誤
function handleError(message: string) {
  error.value = message;
}

// 重置狀態
function reset() {
  stopPolling();
  currentJob.value = null;
  error.value = null;
}

// 開始輪詢任務狀態
function startPolling() {
  if (pollInterval) return;

  pollInterval = window.setInterval(async () => {
    if (!currentJob.value) {
      stopPolling();
      return;
    }

    try {
      const job = await api.getJob(currentJob.value.id);
      currentJob.value = job;

      // 如果任務完成或失敗，停止輪詢
      if (job.status === 'completed' || job.status === 'failed') {
        stopPolling();
      }
    } catch (e) {
      // 忽略輪詢錯誤
    }
  }, 1000); // 每秒更新一次進度
}

// 停止輪詢
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// 清理
onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>人聲去除服務</h1>
      <p>上傳影片或貼上 YouTube 網址，自動去除人聲產生伴奏</p>
    </header>

    <main class="main">
      <!-- 錯誤訊息 -->
      <div v-if="error" class="error-message">
        {{ error }}
        <button @click="error = null">關閉</button>
      </div>

      <!-- 輸入區域 - 當沒有進行中的任務時顯示 -->
      <div v-if="!currentJob" class="input-section">
        <UrlInput
          @job-created="handleJobCreated"
          @error="handleError"
        />
        <FileUpload
          @job-created="handleJobCreated"
          @error="handleError"
        />
      </div>

      <!-- 進度和結果區域 - 當有任務時顯示 -->
      <div v-else class="result-section">
        <ResultView
          :job="currentJob"
          @reset="reset"
        />
      </div>
    </main>

    <footer class="footer">
      <p>結果保留 24 小時，每小時最多 12 次請求</p>
    </footer>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.header p {
  color: #666;
}

.main {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  color: #c00;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-message button {
  background: none;
  border: none;
  color: #c00;
  cursor: pointer;
  font-size: 1rem;
}

.input-section,
.result-section {
  min-height: 200px;
}

.footer {
  text-align: center;
  margin-top: 2rem;
  color: #999;
  font-size: 0.875rem;
}
</style>
