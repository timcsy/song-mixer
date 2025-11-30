<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useJobManager } from './composables/useJobManager';
import { api, type ImportConflict, type ProcessingJob, checkBackendHealth } from './services/api';
import { browserCheck } from './utils/browserCheck';
import type { BrowserCapabilities, BackendCapabilities } from './types/storage';
import AppDrawer from './components/AppDrawer.vue';
import MainView from './components/MainView.vue';
import AddSongModal from './components/AddSongModal.vue';
import TaskQueue from './components/TaskQueue.vue';
import TaskDetailModal from './components/TaskDetailModal.vue';
import ImportConflictModal from './components/ImportConflictModal.vue';

// 瀏覽器與後端功能狀態
const browserCapabilities = ref<BrowserCapabilities | null>(null);
const backendCapabilities = ref<BackendCapabilities | null>(null);
const browserWarnings = ref<string[]>([]);
const isInitialized = ref(false);
const showBrowserWarning = ref(false);

// 初始化應用程式
onMounted(async () => {
  // 1. 檢查瀏覽器相容性
  browserCapabilities.value = browserCheck.check();
  browserWarnings.value = browserCheck.getWarnings();

  // 如果不支援核心功能，顯示警告
  if (!browserCheck.isSupported()) {
    showBrowserWarning.value = true;
    return;
  }

  // 2. 偵測後端是否可用
  backendCapabilities.value = await checkBackendHealth();

  // 3. 初始化完成
  isInitialized.value = true;

  // 4. 重新整理任務列表
  refreshJobs();
});

// 關閉瀏覽器警告（僅用於 WebGPU 等非致命警告）
function dismissWarning() {
  showBrowserWarning.value = false;
}

// 全域狀態管理
const {
  completedJobs,
  processingJobs,
  selectedJobId,
  drawerOpen,
  selectedJobIds,
  selectedJob,
  hasProcessingJobs,
  selectJob,
  toggleDrawer,
  setDrawerOpen,
  toggleJobSelection,
  selectAllJobs,
  deselectAllJobs,
  deleteJob,
  refreshJobs,
} = useJobManager();

// 模態視窗狀態
const showAddSongModal = ref(false);
const selectedTaskId = ref<string | null>(null);

// 匯入衝突狀態
const importConflicts = ref<ImportConflict[]>([]);
const currentConflict = ref<ImportConflict | null>(null);

// 處理新增歌曲
function handleAddSong() {
  showAddSongModal.value = true;
}

function handleCloseAddSongModal() {
  showAddSongModal.value = false;
}

function handleJobCreated() {
  showAddSongModal.value = false;
  refreshJobs();
}

// 處理刪除歌曲
async function handleDeleteJob(jobId: string) {
  if (confirm('確定要刪除這首歌曲嗎？')) {
    await deleteJob(jobId);
  }
}

// 處理匯出
async function handleExport() {
  const jobIds = Array.from(selectedJobIds.value);
  if (jobIds.length === 0) {
    return;
  }

  try {
    const response = await api.exportJobs(jobIds);
    // 開啟下載連結
    window.open(response.download_url, '_blank');
  } catch (error) {
    console.error('Export failed:', error);
    alert('匯出失敗，請稍後再試');
  }
}

// 處理匯入
async function handleImport() {
  // 開啟檔案選擇器
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const response = await api.importJobs(file);

      // 顯示匯入結果
      if (response.imported.length > 0) {
        refreshJobs();
      }

      if (response.errors.length > 0) {
        alert('部分匯入失敗:\n' + response.errors.join('\n'));
      }

      // 處理衝突
      if (response.conflicts.length > 0) {
        importConflicts.value = response.conflicts;
        currentConflict.value = importConflicts.value[0];
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('匯入失敗，請確認檔案格式正確');
    }
  };

  input.click();
}

// 處理衝突解決
async function handleResolveConflict(action: string, newTitle?: string) {
  if (!currentConflict.value) return;

  try {
    const response = await api.resolveImportConflict(
      currentConflict.value.conflict_id,
      action as 'overwrite' | 'rename',
      newTitle
    );

    if (response.error) {
      alert(response.error);
      return;
    }

    // 移除已解決的衝突
    importConflicts.value = importConflicts.value.filter(
      c => c.conflict_id !== currentConflict.value?.conflict_id
    );

    // 處理下一個衝突或關閉
    if (importConflicts.value.length > 0) {
      currentConflict.value = importConflicts.value[0];
    } else {
      currentConflict.value = null;
    }

    // 重新整理列表
    refreshJobs();
  } catch (error) {
    console.error('Resolve conflict failed:', error);
    alert('解決衝突失敗，請稍後再試');
  }
}

// 關閉衝突模態視窗
function handleCloseConflictModal() {
  // 取消所有剩餘衝突
  currentConflict.value = null;
  importConflicts.value = [];
}

// 任務詳情
const selectedTask = computed<ProcessingJob | null>(() => {
  if (!selectedTaskId.value) return null;
  return processingJobs.value.find(job => job.id === selectedTaskId.value) || null;
});

function handleTaskClick(jobId: string) {
  selectedTaskId.value = jobId;
}

function handleCloseTaskDetail() {
  selectedTaskId.value = null;
}
</script>

<template>
  <div class="app">
    <!-- 瀏覽器不支援警告（致命錯誤：SharedArrayBuffer 不可用） -->
    <div v-if="showBrowserWarning && !browserCapabilities?.sharedArrayBuffer" class="browser-error">
      <div class="browser-error-content">
        <h2>瀏覽器不支援</h2>
        <p>您的瀏覽器不支援本服務所需的功能（SharedArrayBuffer）。</p>
        <p>請使用以下瀏覽器：</p>
        <ul>
          <li>Chrome 92+</li>
          <li>Firefox 79+</li>
          <li>Safari 15.2+</li>
          <li>Edge 92+</li>
        </ul>
        <p class="note">提示：請確認網站使用 HTTPS 協定。</p>
      </div>
    </div>

    <!-- WebGPU 不支援警告（非致命：可關閉） -->
    <div
      v-else-if="showBrowserWarning && browserCapabilities?.sharedArrayBuffer && !browserCapabilities?.webGPU"
      class="browser-warning"
    >
      <div class="browser-warning-content">
        <span>⚠️ 您的瀏覽器不支援 WebGPU，將使用較慢的 WASM 模式處理。</span>
        <button @click="dismissWarning">了解</button>
      </div>
    </div>

    <!-- 主應用內容（僅在初始化完成後顯示） -->
    <template v-if="isInitialized">
      <!-- 左側抽屜 -->
      <AppDrawer
      :isOpen="drawerOpen"
      :jobs="completedJobs"
      :selectedJobId="selectedJobId"
      :selectedJobIds="selectedJobIds"
      @close="setDrawerOpen(false)"
      @select="selectJob"
      @toggle="toggleJobSelection"
      @delete="handleDeleteJob"
      @selectAll="selectAllJobs"
      @deselectAll="deselectAllJobs"
      @addSong="handleAddSong"
      @export="handleExport"
      @import="handleImport"
    />

    <!-- 主內容區 -->
    <MainView
      :selectedJob="selectedJob"
      :drawerOpen="drawerOpen"
      @toggleDrawer="toggleDrawer"
      @addSong="handleAddSong"
    />

    <!-- 底部任務佇列 -->
    <TaskQueue
      v-if="hasProcessingJobs"
      :jobs="processingJobs"
      :drawerOpen="drawerOpen"
      @taskClick="handleTaskClick"
    />

    <!-- 新增歌曲模態視窗 -->
    <AddSongModal
      v-if="showAddSongModal"
      @close="handleCloseAddSongModal"
      @created="handleJobCreated"
    />

    <!-- 匯入衝突模態視窗 -->
    <ImportConflictModal
      v-if="currentConflict"
      :conflict="currentConflict"
      @close="handleCloseConflictModal"
      @resolve="handleResolveConflict"
    />

    <!-- 任務詳情模態視窗 -->
    <TaskDetailModal
      v-if="selectedTask"
      :job="selectedTask"
      @close="handleCloseTaskDetail"
    />
    </template>

    <!-- 載入中畫面 -->
    <div v-if="!isInitialized && !showBrowserWarning" class="loading">
      <div class="loading-spinner"></div>
      <p>正在初始化...</p>
    </div>
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
  background: #121212;
  color: #e0e0e0;
  min-height: 100vh;
}

.app {
  min-height: 100vh;
}

/* 瀏覽器不支援警告（致命） */
.browser-error {
  position: fixed;
  inset: 0;
  background: #121212;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.browser-error-content {
  background: #1e1e1e;
  border: 1px solid #ff4444;
  border-radius: 12px;
  padding: 32px;
  max-width: 400px;
  text-align: center;
}

.browser-error-content h2 {
  color: #ff4444;
  margin-bottom: 16px;
}

.browser-error-content ul {
  list-style: none;
  margin: 16px 0;
}

.browser-error-content li {
  padding: 4px 0;
}

.browser-error-content .note {
  color: #888;
  font-size: 14px;
  margin-top: 16px;
}

/* WebGPU 不支援警告（非致命） */
.browser-warning {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #ff9800;
  color: #000;
  z-index: 9999;
}

.browser-warning-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.browser-warning button {
  background: rgba(0, 0, 0, 0.2);
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  color: #000;
  font-weight: 500;
}

.browser-warning button:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 載入中 */
.loading {
  position: fixed;
  inset: 0;
  background: #121212;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #1db954;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
