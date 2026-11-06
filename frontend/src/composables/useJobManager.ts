/**
 * useJobManager - 全域狀態管理
 *
 * 管理已完成歌曲列表、處理中任務列表、選中狀態、抽屜狀態等
 * 所有歌曲資料儲存於 IndexedDB（純前端模式）
 */
import { ref, shallowRef, computed, readonly } from 'vue'
import { type CompletedJob, type ProcessingJob } from '@/services/api'
import { storageService, type SongMeta } from '@/services/storageService'
import { useLocalProcessor } from '@/composables/useLocalProcessor'

// 全域狀態（單例模式）
const completedJobs = ref<CompletedJob[]>([])
const processingJobs = ref<ProcessingJob[]>([])
// IndexedDB 本地歌曲 metadata（不含音訊資料，避免歌曲多時耗盡記憶體）
const localSongs = shallowRef<SongMeta[]>([])
const selectedJobId = ref<string | null>(null)
const selectedSong = shallowRef<SongMeta | null>(null) // 選中歌曲的 metadata
const drawerOpen = ref(window.innerWidth >= 768) // 桌面版預設開啟
const selectedJobIds = ref<Set<string>>(new Set()) // 勾選的歌曲（用於匯出）
const error = ref<string | null>(null)

// 從 IndexedDB 載入本地歌曲
async function fetchLocalSongs() {
  try {
    await storageService.init()
    localSongs.value = await storageService.getAllSongMetas()
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

// 註：不再定時輪詢。歌曲列表只在新增、匯入、改名、刪除後由呼叫端 refreshJobs() 更新
// 分頁回到前景時刷新一次（可能在其他分頁新增了歌曲；只讀 metadata，成本很低）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchJobs()
    }
  })
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

    // 嘗試從 IndexedDB 載入 metadata（完整音訊由播放器自行載入）
    try {
      const song = await storageService.getSongMeta(jobId)
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
    if (selectedJobIds.value.has(jobId)) {
      const newSet = new Set(selectedJobIds.value)
      newSet.delete(jobId)
      selectedJobIds.value = newSet
    }

    // 取消選取
    if (selectedJobId.value === jobId) {
      selectedJobId.value = null
      selectedSong.value = null
    }
    return true
  } catch (err) {
    console.error('Failed to delete job:', err)
    return false
  }
}

// ========== 歌曲列表順序 ==========

/** 可排序的欄位 */
export type SongSortKey = 'title' | 'createdAt' | 'duration' | 'size'
export type SortDirection = 'asc' | 'desc'

const titleCollator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' })

/**
 * 標題分組：數字開頭 → 英文開頭 → 其他（中文等），與一般檔案管理員的習慣一致
 * （zh-Hant 排序規則本身會把中文排在英文之前）
 */
function titleGroup(title: string): number {
  const first = title.trim().charAt(0)
  if (/[0-9]/.test(first)) return 0
  if (/[A-Za-z]/.test(first)) return 1
  return 2
}

function compareTitles(a: string, b: string): number {
  return titleGroup(a) - titleGroup(b) || titleCollator.compare(a, b)
}

/**
 * 依指定的 id 順序重新排列歌曲列表並儲存
 * 先更新畫面再寫入 IndexedDB；寫入失敗時重新讀取以還原
 */
async function reorderSongs(orderedIds: string[]): Promise<void> {
  const byId = new Map(localSongs.value.map(s => [s.id, s]))
  const ids = orderedIds.filter(id => byId.has(id))
  // 防呆：未列出的歌曲接在最後，避免遺失
  for (const s of localSongs.value) {
    if (!ids.includes(s.id)) ids.push(s.id)
  }

  localSongs.value = ids.map((id, order) => ({ ...byId.get(id)!, order }))

  try {
    await storageService.setSongOrder(ids)
  } catch (err) {
    console.error('Failed to save song order:', err)
    await fetchLocalSongs()
  }
}

/** 目前列表的 id 順序 */
function currentSongIds(): string[] {
  return localSongs.value.map(s => s.id)
}

/** 將一首歌從 fromIndex 移到 toIndex（拖曳） */
function moveSong(fromIndex: number, toIndex: number): Promise<void> {
  const ids = currentSongIds()
  if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
    return Promise.resolve()
  }
  const [moved] = ids.splice(fromIndex, 1)
  ids.splice(toIndex, 0, moved)
  return reorderSongs(ids)
}

/** 將多首歌移到列表最上面或最下面（保持它們之間的相對順序） */
function moveSongsTo(songIds: Iterable<string>, position: 'top' | 'bottom'): Promise<void> {
  const moving = new Set(songIds)
  const ids = currentSongIds()
  const picked = ids.filter(id => moving.has(id))
  const rest = ids.filter(id => !moving.has(id))
  return reorderSongs(position === 'top' ? [...picked, ...rest] : [...rest, ...picked])
}

/** 隨機排序（Fisher–Yates） */
function shuffleSongs(): Promise<void> {
  const ids = currentSongIds()
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return reorderSongs(ids)
}

/** 依欄位排序，排序結果成為新的自訂順序 */
function sortSongs(key: SongSortKey, direction: SortDirection): Promise<void> {
  const value = (s: SongMeta): number => {
    switch (key) {
      case 'createdAt': return new Date(s.createdAt).getTime()
      case 'duration': return s.duration || 0
      case 'size': return s.storageSize || 0
      default: return 0
    }
  }
  const sign = direction === 'asc' ? 1 : -1
  // 穩定排序：值相同時維持原本順序
  const sorted = [...localSongs.value].sort((a, b) =>
    key === 'title'
      ? sign * compareTitles(a.title || '', b.title || '')
      : sign * (value(a) - value(b))
  )
  return reorderSongs(sorted.map(s => s.id))
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
const {
  state: localProcessorState,
  currentTitle: localProcessorTitle,
  queuedTasks: localQueuedTasks,
} = useLocalProcessor()

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
  // 佇列中等待的本地任務
  const queued: ProcessingJob[] = localQueuedTasks.value.map(task => ({
    id: task.id,
    source_title: task.title,
    source_type: task.sourceType,
    status: 'pending' as const,
    progress: 0,
    current_stage: '排隊等待中',
  }))
  jobs.unshift(...queued)
  const localJob = localProcessingJob.value
  if (localJob) {
    jobs.unshift(localJob) // 處理中的本地任務放在最前面
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
  return {
    // 狀態（唯讀）
    completedJobs: allCompletedJobs, // 使用合併後的列表
    localSongs: readonly(localSongs),
    processingJobs: allProcessingJobs, // 使用合併後的列表（包含本地處理任務）
    selectedJobId: readonly(selectedJobId),
    selectedSong: readonly(selectedSong), // 選中歌曲的 metadata
    drawerOpen: readonly(drawerOpen),
    selectedJobIds: readonly(selectedJobIds),
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

    // 列表順序
    reorderSongs,
    moveSong,
    moveSongsTo,
    shuffleSongs,
    sortSongs,
  }
}
