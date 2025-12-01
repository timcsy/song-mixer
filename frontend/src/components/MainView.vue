<template>
  <main class="main-view" :class="{ 'drawer-open': drawerOpen }">
    <div class="main-header">
      <button class="menu-btn" @click="$emit('toggleDrawer')" title="選單">
        ☰
      </button>
      <h1 class="app-title">影片混音器</h1>
    </div>

    <div class="main-content">
      <template v-if="selectedJob && jobDetail">
        <!-- 使用 key 強制在切換歌曲時重新建立元件，確保音軌正確清理 -->
        <ResultView
          :key="jobDetail.id"
          :job="jobDetail"
          @reset="handleReset"
        />
      </template>
      <template v-else-if="selectedJob && loading">
        <div class="loading">載入中...</div>
      </template>
      <template v-else>
        <EmptyState
          title="選擇一首歌曲"
          description="從左側列表選擇歌曲，或新增歌曲開始處理"
        >
          <template #action>
            <button class="btn btn-primary" @click="$emit('addSong')">
              + 新增歌曲
            </button>
          </template>
        </EmptyState>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { api, type CompletedJob, type JobWithResult } from '@/services/api'
import { storageService } from '@/services/storageService'
import { getBackendCapabilities } from '@/services/api'
import EmptyState from './EmptyState.vue'
import ResultView from './ResultView.vue'

interface Props {
  selectedJob: CompletedJob | null
  drawerOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggleDrawer: []
  addSong: []
}>()

const jobDetail = ref<JobWithResult | null>(null)
const loading = ref(false)

// 當選中的歌曲改變時，載入詳細資料
watch(() => props.selectedJob, async (newJob) => {
  if (!newJob) {
    jobDetail.value = null
    return
  }

  loading.value = true
  try {
    const backend = getBackendCapabilities()

    // 優先從 IndexedDB 載入（純前端模式）
    const localSong = await storageService.getSong(newJob.id)
    if (localSong) {
      // 將 IndexedDB 的 SongRecord 轉換為 JobWithResult 格式
      jobDetail.value = {
        id: localSong.id,
        source_type: 'upload',
        status: 'completed',
        progress: 100,
        current_stage: null,
        error_message: null,
        created_at: localSong.createdAt,
        updated_at: localSong.createdAt,
        result: {
          original_duration: localSong.duration,
          output_size: null,
          download_url: null,
        },
        // 額外資訊給 ResultView 使用
        source_title: localSong.title,
        track_paths: localSong.tracks ? {
          drums: 'indexeddb',
          bass: 'indexeddb',
          other: 'indexeddb',
          vocals: 'indexeddb',
        } : null,
        sample_rate: 44100,
        // 標記這是本地歌曲
        _localSong: localSong,
      } as JobWithResult & { _localSong: typeof localSong }
    } else if (backend.available) {
      // 後端模式：從 API 載入
      jobDetail.value = await api.getJob(newJob.id)
    } else {
      console.error('Song not found in IndexedDB:', newJob.id)
      jobDetail.value = null
    }
  } catch (e) {
    console.error('Failed to load job detail:', e)
    jobDetail.value = null
  } finally {
    loading.value = false
  }
}, { immediate: true })

function handleReset() {
  // 在 Video Mixer 模式下，reset 不應該清空選擇
  // 只是重新整理當前選中的歌曲
}
</script>

<style scoped>
.main-view {
  margin-left: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
  background: #121212;
}

.main-view.drawer-open {
  margin-left: 300px;
}

.main-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
}

.menu-btn {
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.menu-btn:hover {
  color: #fff;
}

.app-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  color: #e0e0e0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  padding-bottom: 80px; /* 為底部任務佇列留空間 */
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.15s;
  margin-top: 1rem;
}

.btn-primary {
  background: #4a9eff;
  color: #fff;
}

.btn-primary:hover {
  background: #3a8eef;
}

/* 手機版 */
@media (max-width: 768px) {
  .main-view.drawer-open {
    margin-left: 0;
  }
}
</style>
