/**
 * useJobManager - 全域狀態管理
 *
 * 管理已完成歌曲列表、處理中任務列表、選中狀態、抽屜狀態等
 * 所有歌曲資料儲存於 IndexedDB（純前端模式）
 */
import { ref, computed, readonly, onMounted, onUnmounted } from 'vue'
import { type CompletedJob, type ProcessingJob } from '@/services/api'
import { storageService, type SongRecord } from '@/services/storageService'
import { useLocalProcessor } from '@/composables/useLocalProcessor'

// 全域狀態（單例模式）
const completedJobs = ref<CompletedJob[]>([])
const processingJobs = ref<ProcessingJob[]>([])
const localSongs = ref<SongRecord[]>([]) // IndexedDB 本地歌曲
const selectedJobId = ref<string | null>(null)
const selectedSong = ref<SongRecord | null>(null) // 完整的歌曲資料
const drawerOpen = ref(window.innerWidth >= 768) // 桌面版預設開啟
const selectedJobIds = ref<Set<string>>(new Set()) // 勾選的歌曲（用於匯出）
const isPolling = ref(false)
const error = ref<string | null>(null)

let pollIntervalId: number | null = null
const POLL_INTERVAL = 2000 // 2 秒

// 從 IndexedDB 載入本地歌曲
async function fetchLocalSongs() {
  try {
    await storageService.init()
    localSongs.value = await storageService.getAllSongs()
  } catch (err) {
    console.error('Failed to fetch local songs:', err)
  }
}

// 載入歌曲列表（純前端 IndexedDB）
async function fetchJobs() {
  try {
    // 從 IndexedDB 載入本地歌曲
    await fetchLocalSongs()

    // 後端不再管理 jobs，全部使用本地儲存
    completedJobs.value = []
    processingJobs.value = []

    error.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '載入失敗'
    console.error('Failed to fetch jobs:', err)
  }
}

function startPolling() {
  if (isPolling.value) return
  isPolling.value = true
  fetchJobs() // 立即執行一次
  pollIntervalId = window.setInterval(fetchJobs, POLL_INTERVAL)
}

function stopPolling() {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
  isPolling.value = false
}

// 選取歌曲
async function selectJob(jobId: string | null) {
  selectedJobId.value = jobId

  if (jobId) {
    // 優先從本地歌曲載入
    const localSong = localSongs.value.find(s => s.id === jobId)
    if (localSong) {
      selectedSong.value = localSong
      return
    }

    // 嘗試從 IndexedDB 載入
    try {
      const song = await storageService.getSong(jobId)
      if (song) {
        selectedSong.value = song
        return
      }
    } catch (err) {
      console.error('Failed to load song:', err)
    }

    // 後端歌曲沒有完整資料，只有列表資訊
    selectedSong.value = null
  } else {
    selectedSong.value = null
  }
}

// 切換抽屜
function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function setDrawerOpen(open: boolean) {
  drawerOpen.value = open
}

// 勾選/取消勾選歌曲（用於匯出）
function toggleJobSelection(jobId: string) {
  const newSet = new Set(selectedJobIds.value)
  if (newSet.has(jobId)) {
    newSet.delete(jobId)
  } else {
    newSet.add(jobId)
  }
  selectedJobIds.value = newSet
}

function selectAllJobs() {
  selectedJobIds.value = new Set(allCompletedJobs.value.map(j => j.id))
}

function deselectAllJobs() {
  selectedJobIds.value = new Set()
}

// 刪除歌曲
async function deleteJob(jobId: string): Promise<boolean> {
  try {
    // 從 IndexedDB 刪除
    await storageService.deleteSong(jobId)
    localSongs.value = localSongs.value.filter(s => s.id !== jobId)

    // 取消選取
    if (selectedJobId.value === jobId) {
      selectedJobId.value = null
      selectedSong.value = null
    }
    selectedJobIds.value.delete(jobId)
    return true
  } catch (err) {
    console.error('Failed to delete job:', err)
    return false
  }
}

// 手動刷新
async function refreshJobs() {
  await fetchJobs()
}

// 取得選中的歌曲（用於列表顯示）
const selectedJob = computed(() => {
  if (!selectedJobId.value) return null
  // 優先從本地歌曲找
  const local = localSongs.value.find(s => s.id === selectedJobId.value)
  if (local) {
    return {
      id: local.id,
      source_title: local.title,
      source_type: local.sourceType,
      status: 'completed' as const,
      original_duration: local.duration,
      created_at: local.createdAt.toISOString(),
    }
  }
  return completedJobs.value.find(j => j.id === selectedJobId.value) || null
})

// 合併本地歌曲和後端歌曲的列表
const allCompletedJobs = computed(() => {
  // 將本地歌曲轉換為 CompletedJob 格式
  const localAsJobs: CompletedJob[] = localSongs.value.map(s => ({
    id: s.id,
    source_title: s.title,
    source_type: s.sourceType,
    status: 'completed' as const,
    original_duration: s.duration,
    created_at: s.createdAt.toISOString(),
    storage_size: s.storageSize,
  }))

  // 合併並去重（本地優先）
  const localIds = new Set(localAsJobs.map(j => j.id))
  const backendJobs = completedJobs.value.filter(j => !localIds.has(j.id))

  return [...localAsJobs, ...backendJobs]
})

// 取得本地處理狀態
const { state: localProcessorState, currentTitle: localProcessorTitle } = useLocalProcessor()

// 將本地處理任務轉換為 ProcessingJob 格式
const localProcessingJob = computed<ProcessingJob | null>(() => {
  const state = localProcessorState.value
  if (state.stage === 'idle') return null

  // 將 ProcessingState.stage 映射到 ProcessingJob.status
  const statusMap: Record<string, ProcessingJob['status']> = {
    downloading: 'downloading',
    extracting: 'separating', // extracting 視為 separating 的一部分
    separating: 'separating',
    saving: 'merging',
  }

  return {
    id: 'local-processing',
    source_title: localProcessorTitle.value || '處理中...',
    source_type: state.sourceType,
    status: statusMap[state.stage] || 'pending',
    progress: state.progress,
    current_stage: state.message || null,
  }
})

// 合併本地和遠端的 processing jobs
const allProcessingJobs = computed<readonly ProcessingJob[]>(() => {
  const jobs: ProcessingJob[] = [...processingJobs.value]
  const localJob = localProcessingJob.value
  if (localJob) {
    jobs.unshift(localJob) // 本地任務放在最前面
  }
  return jobs
})

// 是否有處理中任務
const hasProcessingJobs = computed(() => allProcessingJobs.value.length > 0)

// 是否有選中的歌曲（用於匯出）
const hasSelectedJobs = computed(() => selectedJobIds.value.size > 0)

// 選中歌曲數量
const selectedJobCount = computed(() => selectedJobIds.value.size)

// 取得儲存使用量
async function getStorageUsage() {
  return storageService.getStorageUsage()
}

export function useJobManager() {
  // 生命週期管理
  onMounted(() => {
    startPolling()
    // 響應式斷點監聽
    const handleResize = () => {
      // 只在視窗寬度變化跨越斷點時調整
      // 不強制覆蓋使用者手動設定的狀態
    }
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    stopPolling()
  })

  return {
    // 狀態（唯讀）
    completedJobs: allCompletedJobs, // 使用合併後的列表
    localSongs: readonly(localSongs),
    processingJobs: allProcessingJobs, // 使用合併後的列表（包含本地處理任務）
    selectedJobId: readonly(selectedJobId),
    selectedSong: readonly(selectedSong), // 完整歌曲資料
    drawerOpen: readonly(drawerOpen),
    selectedJobIds: readonly(selectedJobIds),
    isPolling: readonly(isPolling),
    error: readonly(error),

    // 計算屬性
    selectedJob,
    hasProcessingJobs,
    hasSelectedJobs,
    selectedJobCount,

    // 方法
    selectJob,
    toggleDrawer,
    setDrawerOpen,
    toggleJobSelection,
    selectAllJobs,
    deselectAllJobs,
    deleteJob,
    refreshJobs,
    getStorageUsage,
    startPolling,
    stopPolling,
  }
}
