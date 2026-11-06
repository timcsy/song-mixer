/**
 * useLocalProcessor - 本地處理流程 composable
 * Feature: 005-frontend-processing
 *
 * 處理本地影片上傳：提取音頻 → 音源分離 → 儲存到 IndexedDB
 * 提供詳細的進度回報
 */
import { ref, readonly } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { ffmpegService } from '@/services/ffmpegService'
import { demucsService } from '@/services/demucsService'
import { storageService } from '@/services/storageService'
import { downloadYouTube, getBackendCapabilities } from '@/services/api'
import type { ProcessingState, SongRecord, ProcessOptions } from '@/types/storage'
import { readWavInfo } from '@/utils/wav'
import { formatDuration, formatFileSize } from '@/utils/format'

// 所有媒體處理都在前端執行（ffmpeg.wasm + demucs-web）

// 處理狀態
const state = ref<ProcessingState>({
  stage: 'idle',
  subStage: null,
  progress: 0,
  subProgress: 0,
  message: '',
  error: null,
  songId: undefined,
  sourceType: undefined,
})

// 當前處理中的任務標題（用於顯示在 TaskQueue）
const currentTitle = ref<string | null>(null)

// 取消標記（目前處理中的任務）
let cancelled = false

/**
 * 排隊等待中的任務
 * FFmpeg 與 Demucs 都只能一次處理一首，且處理狀態是全域共用的，
 * 因此任務一律依序執行，後加入的任務在佇列中等待。
 */
export interface QueuedTask {
  id: string
  title: string
  sourceType: 'youtube' | 'upload'
}
const queuedTasks = ref<QueuedTask[]>([])
const cancelledQueuedIds = new Set<string>()
let queueTail: Promise<unknown> = Promise.resolve()

/**
 * 將任務加入佇列，前一個任務結束（成功或失敗）後才開始
 */
function enqueue<T>(title: string, sourceType: QueuedTask['sourceType'], run: () => Promise<T>): Promise<T> {
  const id = uuidv4()
  queuedTasks.value = [...queuedTasks.value, { id, title, sourceType }]

  const job = queueTail.then(() => {
    queuedTasks.value = queuedTasks.value.filter(t => t.id !== id)
    if (cancelledQueuedIds.delete(id)) {
      throw new Error('處理已取消')
    }
    return run()
  })
  // 任一任務失敗不影響後續任務
  queueTail = job.catch(() => undefined)
  return job
}

/**
 * 確保進度值有效
 */
function sanitizeProgress(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * 更新處理狀態
 */
function updateState(
  partial: Partial<ProcessingState>,
  options?: ProcessOptions
) {
  // 確保進度值有效
  if (partial.progress !== undefined) {
    partial.progress = sanitizeProgress(partial.progress)
  }
  if (partial.subProgress !== undefined) {
    partial.subProgress = sanitizeProgress(partial.subProgress)
  }
  state.value = { ...state.value, ...partial }
  options?.onProgress?.(state.value)
}

/**
 * 重設狀態
 */
function resetState() {
  state.value = {
    stage: 'idle',
    subStage: null,
    progress: 0,
    subProgress: 0,
    message: '',
    error: null,
    songId: undefined,
    sourceType: undefined,
  }
  currentTitle.value = null
  cancelled = false
}

/**
 * 檢查是否已取消
 */
function checkCancelled() {
  if (cancelled) {
    throw new Error('處理已取消')
  }
}

// 重命名為 formatSize 以便內部使用
const formatSize = formatFileSize

// 支援的音檔副檔名
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma', '.aiff', '.opus']

/**
 * 檢查檔案是否為音檔
 */
function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return AUDIO_EXTENSIONS.some(ext => name.endsWith(ext))
}

/**
 * 處理本地上傳的影片或音檔
 * @param file 影片或音檔
 * @param title 歌曲標題
 * @param options 處理選項
 * @returns 新建立的 SongRecord.id
 */
async function runUpload(
  file: File,
  title: string,
  options?: ProcessOptions
): Promise<string> {
  resetState()
  currentTitle.value = title
  state.value.sourceType = 'upload'

  // 檢測檔案類型
  const isAudio = isAudioFile(file)

  try {
    // 確保儲存服務已初始化
    await storageService.init()

    // 檢查儲存空間（預估需要約 200MB）
    const storage = await storageService.getStorageUsage()
    const estimatedSize = file.size * 10 // 粗略估計：原始檔案 + 4 軌音訊
    const remainingSpace = storage.quota - storage.used
    if (remainingSpace < estimatedSize && storage.quota > 0) {
      throw new Error(
        `儲存空間不足。需要約 ${Math.ceil(estimatedSize / 1024 / 1024)} MB，` +
        `剩餘 ${Math.ceil(remainingSpace / 1024 / 1024)} MB。` +
        `請刪除一些歌曲後再試。`
      )
    }

    const fileSizeStr = formatSize(file.size)
    let wavBuffer: ArrayBuffer

    // ========== 階段 1：提取/轉換音頻 (0-25%) ==========
    updateState({
      stage: 'extracting',
      subStage: 'ffmpeg_loading',
      progress: 0,
      subProgress: 0,
      message: '載入 FFmpeg 引擎...',
    }, options)
    checkCancelled()

    // 載入 FFmpeg（如果尚未載入）
    const ffmpegAlreadyLoaded = ffmpegService.isLoaded()
    if (!ffmpegAlreadyLoaded) {
      await ffmpegService.initialize((p) => {
        const subProg = sanitizeProgress(p * 100)
        updateState({
          subProgress: subProg,
          message: `載入 FFmpeg 引擎 (${subProg}%)`,
          progress: sanitizeProgress(p * 10), // 0-10%
        }, options)
      })
    }

    if (isAudio) {
      // 音檔：轉換格式
      updateState({
        subStage: 'ffmpeg_extracting',
        progress: 10,
        subProgress: 0,
        message: `轉換音檔格式 - ${fileSizeStr} (0%)`,
      }, options)
      checkCancelled()

      wavBuffer = await ffmpegService.convertToWav(file, (p) => {
        const subProg = sanitizeProgress(p * 100)
        updateState({
          subProgress: subProg,
          message: `轉換音檔格式 - ${fileSizeStr} (${subProg}%)`,
          progress: sanitizeProgress(10 + p * 15), // 10-25%
        }, options)
      })
    } else {
      // 影片：提取音頻
      updateState({
        subStage: 'ffmpeg_extracting',
        progress: 10,
        subProgress: 0,
        message: `提取音頻 - ${fileSizeStr} (0%)`,
      }, options)
      checkCancelled()

      wavBuffer = await ffmpegService.extractAudio(file, (p) => {
        const subProg = sanitizeProgress(p * 100)
        updateState({
          subProgress: subProg,
          message: `提取音頻 - ${fileSizeStr} (${subProg}%)`,
          progress: sanitizeProgress(10 + p * 15), // 10-25%
        }, options)
      })
    }

    updateState({ progress: 25 }, options)
    checkCancelled()

    // 讀取 WAV 標頭（完整解碼在 Worker 中進行）
    const { sampleRate, duration } = readWavInfo(wavBuffer)
    const durationStr = formatDuration(duration)
    const wavSizeStr = formatSize(wavBuffer.byteLength)

    // 驗證取樣率
    if (sampleRate !== 44100) {
      console.warn(`取樣率為 ${sampleRate}Hz，非預期的 44100Hz`)
    }

    // ========== 階段 2：音源分離 (25-90%) ==========
    // 載入模型（如果尚未載入）
    const modelAlreadyLoaded = demucsService.isLoaded()
    if (!modelAlreadyLoaded) {
      updateState({
        stage: 'separating',
        subStage: 'model_downloading',
        progress: 25,
        subProgress: 0,
        message: '下載 AI 模型 - 0/172 MB (0%)',
      }, options)
      checkCancelled()

      await demucsService.initialize((loaded, total) => {
        const percent = sanitizeProgress((loaded / total) * 100)
        const loadedMB = (loaded / 1024 / 1024).toFixed(1)
        const totalMB = (total / 1024 / 1024).toFixed(0)
        updateState({
          subStage: 'model_downloading',
          subProgress: percent,
          message: `下載 AI 模型 - ${loadedMB}/${totalMB} MB (${percent}%)`,
          progress: sanitizeProgress(25 + (loaded / total) * 10), // 25-35%
        }, options)
      })
    }

    updateState({
      stage: 'separating',
      subStage: 'separating',
      progress: 35,
      subProgress: 0,
      message: `分離音軌 - ${durationStr} / ${wavSizeStr} (0%)`,
    }, options)
    checkCancelled()

    // 執行分離 - 顯示分段進度
    let lastSepProgress = 0
    // wavBuffer 會移交給 Worker，之後不可再使用
    const separationResult = await demucsService.separateWav(wavBuffer, ({ progress, currentSegment, totalSegments }) => {
      const totalProg = sanitizeProgress(progress * 100)

      // 避免太頻繁更新（每 1% 更新一次）
      if (totalProg - lastSepProgress >= 1 || totalProg >= 99) {
        lastSepProgress = totalProg
        updateState({
          subProgress: totalProg,
          message: `分離音軌 - ${durationStr} - 區段 ${currentSegment}/${totalSegments} (${totalProg}%)`,
          progress: sanitizeProgress(35 + progress * 55), // 35-90%
        }, options)
      }
    })

    updateState({ progress: 90 }, options)
    checkCancelled()

    // ========== 階段 3：儲存到 IndexedDB (90-100%) ==========
    updateState({
      stage: 'saving',
      subStage: 'saving_tracks',
      progress: 90,
      subProgress: 0,
      message: '儲存音軌資料...',
    }, options)

    const songId = uuidv4()
    // Worker 已轉為 Int16 立體聲交錯格式
    const {
      drums: drumsBuffer,
      bass: bassBuffer,
      other: otherBuffer,
      vocals: vocalsBuffer,
    } = separationResult.tracks

    // 音檔不儲存原始檔案（無影片）
    const videoBuffer = isAudio ? undefined : await file.arrayBuffer()

    // 計算儲存大小（顯示為 WAV 匯出大小：PCM + 4 個 WAV header）
    const wavHeaderSize = 44 * 4 // 4 音軌，每個 WAV header 44 bytes
    const storageSize = drumsBuffer.byteLength + bassBuffer.byteLength +
      otherBuffer.byteLength + vocalsBuffer.byteLength +
      (videoBuffer?.byteLength ?? 0) + wavHeaderSize

    const song: SongRecord = {
      id: songId,
      title,
      sourceType: 'upload',
      duration,
      sampleRate: 44100,
      createdAt: new Date(),
      storageSize,
      tracks: {
        drums: drumsBuffer,
        bass: bassBuffer,
        other: otherBuffer,
        vocals: vocalsBuffer,
      },
      originalVideo: videoBuffer,
    }

    updateState({
      subStage: isAudio ? 'saving_tracks' : 'saving_video',
      progress: 95,
      subProgress: 50,
      message: isAudio ? '儲存音軌資料...' : '儲存影片資料...',
    }, options)

    await storageService.saveSong(song)

    updateState({
      stage: 'idle',
      subStage: null,
      progress: 100,
      subProgress: 100,
      message: '處理完成！',
      songId,
    }, options)
    return songId
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '處理失敗'
    updateState({
      stage: 'idle',
      subStage: null,
      progress: 0,
      subProgress: 0,
      message: '',
      error: errorMessage,
    }, options)
    throw error
  }
}

/**
 * 處理 YouTube 影片（僅 Docker 模式）
 * @param url YouTube 網址
 * @param options 處理選項
 * @returns 新建立的 SongRecord.id
 */
async function runYouTube(
  url: string,
  options?: ProcessOptions
): Promise<string> {
  resetState()
  currentTitle.value = 'YouTube 影片' // 初始標題，下載後會更新
  state.value.sourceType = 'youtube'

  const backend = getBackendCapabilities()
  if (!backend.available || !backend.youtube) {
    throw new Error('YouTube 功能僅在 Docker 部署模式下可用')
  }

  try {
    await storageService.init()

    // ========== 階段 1：下載影片 (0-30%) ==========
    updateState({
      stage: 'downloading',
      subStage: null,
      progress: 0,
      subProgress: 0,
      message: '從 YouTube 下載影片...',
    }, options)
    checkCancelled()

    const { video, videoExt, audio, audioExt, title, duration, thumbnail } = await downloadYouTube(
      url,
      (progress, message) => {
        const percent = sanitizeProgress(progress)
        updateState({
          subProgress: percent,
          message: message || `從 YouTube 下載影片 (${percent}%)`,
          progress: sanitizeProgress(progress * 0.3), // 0-30%
        }, options)
      }
    )
    currentTitle.value = title // 更新為實際標題
    const durationStr = formatDuration(duration)
    const audioSizeStr = formatSize(audio.byteLength)
    const totalSizeStr = formatSize(video.byteLength + audio.byteLength)

    updateState({ progress: 30, message: `下載完成 - ${durationStr} / ${totalSizeStr}` }, options)
    checkCancelled()

    // ========== 階段 2：提取音頻 (30-40%) ==========
    updateState({
      stage: 'extracting',
      subStage: 'ffmpeg_loading',
      progress: 30,
      subProgress: 0,
      message: '載入 FFmpeg 引擎...',
    }, options)
    checkCancelled()

    // 載入 FFmpeg
    const ffmpegAlreadyLoaded = ffmpegService.isLoaded()
    if (!ffmpegAlreadyLoaded) {
      await ffmpegService.initialize((p) => {
        const subProg = sanitizeProgress(p * 100)
        updateState({
          subProgress: subProg,
          message: `載入 FFmpeg 引擎 (${subProg}%)`,
          progress: sanitizeProgress(30 + p * 5), // 30-35%
        }, options)
      })
    }

    updateState({
      subStage: 'ffmpeg_extracting',
      progress: 35,
      subProgress: 0,
      message: '轉換音訊格式...',
    }, options)
    checkCancelled()

    // 將音訊轉換為 WAV（使用 ffmpeg.wasm）
    const audioFile = new File([audio], `audio.${audioExt}`, { type: 'audio/*' })
    const wavBuffer = await ffmpegService.extractAudio(audioFile, (p) => {
      const subProg = sanitizeProgress(p * 100)
      updateState({
        subProgress: subProg,
        message: `轉換音訊格式 (${subProg}%)`,
        progress: sanitizeProgress(35 + p * 5), // 35-40%
      }, options)
    })

    updateState({ progress: 40 }, options)
    checkCancelled()

    // ========== 階段 3：音源分離 (40-85%) ==========
    const modelAlreadyLoaded = demucsService.isLoaded()
    if (!modelAlreadyLoaded) {
      updateState({
        stage: 'separating',
        subStage: 'model_downloading',
        progress: 40,
        subProgress: 0,
        message: '下載 AI 模型 - 0/172 MB (0%)',
      }, options)
      checkCancelled()

      await demucsService.initialize((loaded, total) => {
        const percent = sanitizeProgress((loaded / total) * 100)
        const loadedMB = (loaded / 1024 / 1024).toFixed(1)
        const totalMB = (total / 1024 / 1024).toFixed(0)
        updateState({
          subProgress: percent,
          message: `下載 AI 模型 - ${loadedMB}/${totalMB} MB (${percent}%)`,
          progress: sanitizeProgress(40 + (loaded / total) * 10), // 40-50%
        }, options)
      })
    }

    updateState({
      stage: 'separating',
      subStage: 'separating',
      progress: 50,
      subProgress: 0,
      message: `分離音軌 - ${durationStr} / ${audioSizeStr} (0%)`,
    }, options)
    checkCancelled()

    let lastProg = 0
    // wavBuffer 會移交給 Worker，之後不可再使用
    const separationResult = await demucsService.separateWav(wavBuffer, ({ progress, currentSegment, totalSegments }) => {
      const totalProg = sanitizeProgress(progress * 100)
      if (totalProg - lastProg >= 1 || totalProg >= 99) {
        lastProg = totalProg
        updateState({
          subProgress: totalProg,
          message: `分離音軌 - ${durationStr} - 區段 ${currentSegment}/${totalSegments} (${totalProg}%)`,
          progress: sanitizeProgress(50 + progress * 35), // 50-85%
        }, options)
      }
    })

    updateState({ progress: 85 }, options)
    checkCancelled()

    // ========== 階段 4：合併影片 (85-95%) ==========
    updateState({
      stage: 'saving',
      subStage: 'merging_video',
      progress: 85,
      subProgress: 0,
      message: '合併影片與音訊...',
    }, options)

    // 使用 ffmpeg.wasm 合併無聲影片 + 原始音訊
    const videoFile = new File([video], `video.${videoExt}`, { type: 'video/*' })
    const mergedVideoBuffer = await ffmpegService.muxVideoAudio(videoFile, audioFile, (p) => {
      const subProg = sanitizeProgress(p * 100)
      updateState({
        subProgress: subProg,
        message: `合併影片與音訊 (${subProg}%)`,
        progress: sanitizeProgress(85 + p * 10), // 85-95%
      }, options)
    })

    updateState({ progress: 95 }, options)
    checkCancelled()

    // ========== 階段 5：儲存 (95-100%) ==========
    updateState({
      stage: 'saving',
      subStage: 'saving_tracks',
      progress: 95,
      subProgress: 0,
      message: '儲存音軌資料...',
    }, options)

    const songId = uuidv4()
    // Worker 已轉為 Int16 立體聲交錯格式
    const {
      drums: drumsBuffer,
      bass: bassBuffer,
      other: otherBuffer,
      vocals: vocalsBuffer,
    } = separationResult.tracks

    // 計算儲存大小（顯示為 WAV 匯出大小：PCM + 4 個 WAV header + 合併後影片）
    const wavHeaderSize = 44 * 4 // 4 音軌，每個 WAV header 44 bytes
    const storageSize = drumsBuffer.byteLength + bassBuffer.byteLength +
      otherBuffer.byteLength + vocalsBuffer.byteLength + mergedVideoBuffer.byteLength + wavHeaderSize

    const song: SongRecord = {
      id: songId,
      title,
      sourceType: 'youtube',
      sourceUrl: url,
      thumbnailUrl: thumbnail,
      duration,
      sampleRate: 44100,
      createdAt: new Date(),
      storageSize,
      tracks: {
        drums: drumsBuffer,
        bass: bassBuffer,
        other: otherBuffer,
        vocals: vocalsBuffer,
      },
      originalVideo: mergedVideoBuffer, // 儲存合併後的影片
    }

    await storageService.saveSong(song)

    updateState({
      stage: 'idle',
      subStage: null,
      progress: 100,
      subProgress: 100,
      message: '處理完成！',
      songId,
    }, options)
    return songId
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '處理失敗'
    updateState({
      stage: 'idle',
      subStage: null,
      progress: 0,
      subProgress: 0,
      message: '',
      error: errorMessage,
    }, options)
    throw error
  }
}

/**
 * 取消當前處理
 */
/**
 * 取消任務
 * @param taskId 佇列中任務的 id；省略時取消目前處理中的任務
 */
function cancel(taskId?: string) {
  if (taskId && queuedTasks.value.some(t => t.id === taskId)) {
    cancelledQueuedIds.add(taskId)
    queuedTasks.value = queuedTasks.value.filter(t => t.id !== taskId)
    return
  }

  // 先重設狀態再設定取消旗標（resetState 會清除旗標）
  resetState()
  cancelled = true
  // 分離可能長達數分鐘，主動中止，讓佇列中的下一個任務盡快開始
  demucsService.cancel()
}

/**
 * 處理本地上傳的影片或音檔（加入佇列依序處理）
 * @returns 新建立的 SongRecord.id
 */
function processUpload(file: File, title: string, options?: ProcessOptions): Promise<string> {
  return enqueue(title, 'upload', () => runUpload(file, title, options))
}

/**
 * 處理 YouTube 影片（加入佇列依序處理）
 * @returns 新建立的 SongRecord.id
 */
function processYouTube(url: string, options?: ProcessOptions): Promise<string> {
  return enqueue('YouTube 影片', 'youtube', () => runYouTube(url, options))
}

/**
 * useLocalProcessor composable
 */
export function useLocalProcessor() {
  return {
    state: readonly(state),
    currentTitle: readonly(currentTitle),
    queuedTasks: readonly(queuedTasks),
    processUpload,
    processYouTube,
    cancel,
  }
}

export default useLocalProcessor
