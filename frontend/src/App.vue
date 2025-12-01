<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import JSZip from 'jszip';
import { useJobManager } from './composables/useJobManager';
import { useLocalProcessor } from './composables/useLocalProcessor';
import { api, type ImportConflict, type ProcessingJob, checkBackendHealth } from './services/api';
import { storageService } from './services/storageService';
import { browserCheck } from './utils/browserCheck';
import type { BrowserCapabilities, BackendCapabilities } from './types/storage';
import AppDrawer from './components/AppDrawer.vue';
import MainView from './components/MainView.vue';
import AddSongModal from './components/AddSongModal.vue';
import TaskQueue from './components/TaskQueue.vue';
import TaskDetailModal from './components/TaskDetailModal.vue';
import ImportConflictModal from './components/ImportConflictModal.vue';
import BrowserWarning from './components/BrowserWarning.vue';

// 瀏覽器與後端功能狀態
const browserCapabilities = ref<BrowserCapabilities | null>(null);
const backendCapabilities = ref<BackendCapabilities | null>(null);
const isInitialized = ref(false);

// 初始化應用程式
onMounted(async () => {
  // 1. 檢查瀏覽器相容性
  browserCapabilities.value = browserCheck.check();

  // 如果不支援核心功能，不繼續初始化
  if (!browserCheck.isSupported()) {
    return;
  }

  // 2. 偵測後端是否可用
  backendCapabilities.value = await checkBackendHealth();

  // 3. 初始化完成
  isInitialized.value = true;

  // 4. 重新整理任務列表
  refreshJobs();
});

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

// 處理批次刪除
async function handleDeleteSelected() {
  const count = selectedJobIds.value.size;
  if (count === 0) return;

  if (confirm(`確定要刪除 ${count} 首歌曲嗎？`)) {
    const jobIds = Array.from(selectedJobIds.value);
    for (const jobId of jobIds) {
      await deleteJob(jobId);
    }
    deselectAllJobs();
  }
}

// 處理重新命名
async function handleRenameJob(jobId: string, newTitle: string) {
  try {
    await storageService.renameSong(jobId, newTitle);
    refreshJobs();
  } catch (error) {
    console.error('Rename failed:', error);
    alert('重新命名失敗');
  }
}

// Int16 PCM 資料轉 WAV 檔案
function int16ToWav(pcmData: ArrayBuffer, sampleRate: number, numChannels: number = 2): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcmData);
  const wavHeader = 44;
  const wavBuffer = new ArrayBuffer(wavHeader + pcmBytes.length);
  const view = new DataView(wavBuffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + pcmBytes.length, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, pcmBytes.length, true);
  new Uint8Array(wavBuffer, wavHeader).set(pcmBytes);

  return wavBuffer;
}

// 處理單一歌曲匯出（從右鍵選單）
async function handleExportSingle(jobId: string) {
  try {
    await storageService.init();
    const song = await storageService.getSong(jobId);
    if (!song) {
      alert('找不到歌曲');
      return;
    }

    const sampleRate = song.sampleRate || 44100;
    const zip = new JSZip();

    // 元資料
    const metadata = {
      version: 1,
      exportedAt: new Date().toISOString(),
      song: {
        id: song.id,
        title: song.title,
        sourceType: song.sourceType,
        sourceUrl: song.sourceUrl,
        thumbnailUrl: song.thumbnailUrl,
        duration: song.duration,
        sampleRate: sampleRate,
        createdAt: song.createdAt.toISOString(),
        storageSize: song.storageSize,
      },
    };
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 音軌（WAV 格式）
    const tracksFolder = zip.folder('tracks');
    if (tracksFolder) {
      tracksFolder.file('drums.wav', int16ToWav(song.tracks.drums, sampleRate));
      tracksFolder.file('bass.wav', int16ToWav(song.tracks.bass, sampleRate));
      tracksFolder.file('other.wav', int16ToWav(song.tracks.other, sampleRate));
      tracksFolder.file('vocals.wav', int16ToWav(song.tracks.vocals, sampleRate));
    }

    // 原始影片
    if (song.originalVideo) {
      zip.file('video.mp4', song.originalVideo);
    }

    // 產生並下載 ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${song.title || 'song'}.mix.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    alert('匯出失敗，請稍後再試');
  }
}

// 處理多選匯出（本地 .mix.zip 格式）
async function handleExport() {
  const jobIds = Array.from(selectedJobIds.value);
  if (jobIds.length === 0) {
    return;
  }

  try {
    await storageService.init();
    const zip = new JSZip();

    for (const jobId of jobIds) {
      const song = await storageService.getSong(jobId);
      if (!song) continue;

      const sampleRate = song.sampleRate || 44100;
      const folderName = song.title || song.id;
      const folder = zip.folder(folderName);
      if (!folder) continue;

      // 元資料
      const metadata = {
        version: 1,
        exportedAt: new Date().toISOString(),
        song: {
          id: song.id,
          title: song.title,
          sourceType: song.sourceType,
          sourceUrl: song.sourceUrl,
          thumbnailUrl: song.thumbnailUrl,
          duration: song.duration,
          sampleRate: sampleRate,
          createdAt: song.createdAt.toISOString(),
          storageSize: song.storageSize,
        },
      };
      folder.file('metadata.json', JSON.stringify(metadata, null, 2));

      // 音軌（WAV 格式）
      const tracksFolder = folder.folder('tracks');
      if (tracksFolder) {
        tracksFolder.file('drums.wav', int16ToWav(song.tracks.drums, sampleRate));
        tracksFolder.file('bass.wav', int16ToWav(song.tracks.bass, sampleRate));
        tracksFolder.file('other.wav', int16ToWav(song.tracks.other, sampleRate));
        tracksFolder.file('vocals.wav', int16ToWav(song.tracks.vocals, sampleRate));
      }

      // 原始影片
      if (song.originalVideo) {
        folder.file('video.mp4', song.originalVideo);
      }
    }

    // 產生並下載 ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = jobIds.length === 1
      ? `${(await storageService.getSong(jobIds[0]))?.title || 'song'}.mix.zip`
      : `songs-${new Date().toISOString().slice(0, 10)}.mix.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 清除選取狀態
    deselectAllJobs();
  } catch (error) {
    console.error('Export failed:', error);
    alert('匯出失敗，請稍後再試');
  }
}

// WAV 解析：跳過 header 取得 PCM 資料
function wavToPcm(wavData: ArrayBuffer): ArrayBuffer {
  const view = new DataView(wavData);
  // 找到 "data" chunk
  let offset = 12; // 跳過 RIFF header
  while (offset < wavData.byteLength - 8) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x64617461) { // "data"
      return wavData.slice(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }
  throw new Error('Invalid WAV: data chunk not found');
}

// 處理匯入（本地 .mix.zip 格式）
async function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,.mix.zip';

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      await storageService.init();
      const zip = await JSZip.loadAsync(file);
      let importedCount = 0;
      const errors: string[] = [];

      // 檢查是否為單一歌曲或多歌曲 ZIP
      const hasRootMetadata = zip.file('metadata.json') !== null;

      if (hasRootMetadata) {
        // 單一歌曲格式
        try {
          await importSongFromZip(zip, '');
          importedCount++;
        } catch (err) {
          errors.push(`匯入失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
        }
      } else {
        // 多歌曲格式：每個資料夾是一首歌
        const folders = new Set<string>();
        zip.forEach((path) => {
          const parts = path.split('/');
          if (parts.length > 1 && parts[0]) {
            folders.add(parts[0]);
          }
        });

        for (const folderName of folders) {
          const folder = zip.folder(folderName);
          if (folder && folder.file('metadata.json')) {
            try {
              await importSongFromZip(folder, folderName + '/');
              importedCount++;
            } catch (err) {
              errors.push(`${folderName}: ${err instanceof Error ? err.message : '未知錯誤'}`);
            }
          }
        }
      }

      refreshJobs();

      if (errors.length > 0) {
        alert(`已匯入 ${importedCount} 首歌曲\n\n錯誤:\n${errors.join('\n')}`);
      } else if (importedCount > 0) {
        alert(`已成功匯入 ${importedCount} 首歌曲`);
      } else {
        alert('未找到可匯入的歌曲');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('匯入失敗，請確認檔案格式正確');
    }
  };

  input.click();
}

// 從 ZIP 匯入單一歌曲
async function importSongFromZip(zip: JSZip, prefix: string) {
  const metadataFile = zip.file(prefix + 'metadata.json');
  if (!metadataFile) throw new Error('找不到 metadata.json');

  const metadataText = await metadataFile.async('string');
  const metadata = JSON.parse(metadataText);
  const songMeta = metadata.song;

  // 讀取音軌
  const loadTrack = async (name: string): Promise<ArrayBuffer> => {
    const wavFile = zip.file(prefix + `tracks/${name}.wav`);
    if (wavFile) {
      const wavData = await wavFile.async('arraybuffer');
      return wavToPcm(wavData);
    }
    // 嘗試讀取舊格式 .bin
    const binFile = zip.file(prefix + `tracks/${name}.bin`);
    if (binFile) {
      return binFile.async('arraybuffer');
    }
    throw new Error(`找不到音軌: ${name}`);
  };

  const tracks = {
    drums: await loadTrack('drums'),
    bass: await loadTrack('bass'),
    other: await loadTrack('other'),
    vocals: await loadTrack('vocals'),
  };

  // 讀取影片（可選）
  let originalVideo: ArrayBuffer | undefined;
  const videoFile = zip.file(prefix + 'video.mp4');
  if (videoFile) {
    originalVideo = await videoFile.async('arraybuffer');
  }

  // 計算儲存大小（顯示為 WAV 匯出大小：PCM + 4 個 WAV header）
  const wavHeaderSize = 44 * 4 // 4 音軌，每個 WAV header 44 bytes
  const storageSize = tracks.drums.byteLength + tracks.bass.byteLength +
    tracks.other.byteLength + tracks.vocals.byteLength +
    (originalVideo?.byteLength || 0) + wavHeaderSize;

  // 儲存到 IndexedDB
  await storageService.saveSong({
    id: songMeta.id || crypto.randomUUID(),
    title: songMeta.title,
    sourceType: songMeta.sourceType || 'upload',
    sourceUrl: songMeta.sourceUrl,
    thumbnailUrl: songMeta.thumbnailUrl,
    duration: songMeta.duration,
    sampleRate: songMeta.sampleRate || 44100,
    tracks,
    originalVideo,
    createdAt: new Date(songMeta.createdAt || Date.now()),
    storageSize,
  });
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

// 取消任務
const { cancel: cancelLocalProcessing } = useLocalProcessor();

function handleTaskCancel(jobId: string) {
  // 本地處理任務
  if (jobId === 'local-processing') {
    if (confirm('確定要取消目前的處理任務嗎？')) {
      cancelLocalProcessing();
    }
  }
  // TODO: 後端任務取消（如果需要）
}

function handleTaskCancelFromModal(jobId: string) {
  handleTaskCancel(jobId);
  // 取消後關閉 modal
  selectedTaskId.value = null;
}
</script>

<template>
  <div class="app">
    <!-- 瀏覽器相容性警告元件 -->
    <BrowserWarning
      v-if="browserCapabilities"
      :capabilities="browserCapabilities"
    />

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
      @deleteSelected="handleDeleteSelected"
      @export="handleExportSingle"
      @exportSelected="handleExport"
      @rename="handleRenameJob"
      @selectAll="selectAllJobs"
      @deselectAll="deselectAllJobs"
      @addSong="handleAddSong"
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
      @taskCancel="handleTaskCancel"
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
      @cancel="handleTaskCancelFromModal"
    />
    </template>

    <!-- 載入中畫面（僅當瀏覽器支援且尚未初始化時顯示） -->
    <div v-if="!isInitialized && browserCapabilities?.sharedArrayBuffer && browserCapabilities?.indexedDB" class="loading">
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
