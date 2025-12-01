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

// 取消標記
let cancelled = false

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

/**
 * 解析 WAV 檔案為立體聲 Float32Array
 */
function parseWavToStereo(wavBuffer: ArrayBuffer): {
  left: Float32Array
  right: Float32Array
  sampleRate: number
  duration: number
} {
  const view = new DataView(wavBuffer)

  // 驗證 WAV 標頭
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    throw new Error('無效的 WAV 檔案')
  }

  // 讀取格式資訊
  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)

  // 尋找 data chunk
  let dataOffset = 44
  let dataSize = 0

  // 簡單解析：假設 data chunk 在標準位置
  const dataMarker = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))
  if (dataMarker === 'data') {
    dataSize = view.getUint32(40, true)
  } else {
    // 搜尋 data chunk
    for (let i = 36; i < Math.min(wavBuffer.byteLength - 8, 200); i++) {
      if (
        view.getUint8(i) === 0x64 && // 'd'
        view.getUint8(i + 1) === 0x61 && // 'a'
        view.getUint8(i + 2) === 0x74 && // 't'
        view.getUint8(i + 3) === 0x61 // 'a'
      ) {
        dataSize = view.getUint32(i + 4, true)
        dataOffset = i + 8
        break
      }
    }
  }

  if (dataSize === 0) {
    throw new Error('無法解析 WAV 檔案')
  }

  const bytesPerSample = bitsPerSample / 8
  const samplesPerChannel = dataSize / bytesPerSample / numChannels
  const duration = samplesPerChannel / sampleRate

  // 轉換為 Float32Array
  const left = new Float32Array(samplesPerChannel)
  const right = new Float32Array(samplesPerChannel)

  if (bitsPerSample === 16) {
    for (let i = 0; i < samplesPerChannel; i++) {
      const sampleOffset = dataOffset + i * numChannels * bytesPerSample
      left[i] = view.getInt16(sampleOffset, true) / 32768
      if (numChannels === 2) {
        right[i] = view.getInt16(sampleOffset + 2, true) / 32768
      } else {
        right[i] = left[i] // 單聲道轉立體聲
      }
    }
  } else if (bitsPerSample === 32) {
    // Float32
    for (let i = 0; i < samplesPerChannel; i++) {
      const sampleOffset = dataOffset + i * numChannels * bytesPerSample
      left[i] = view.getFloat32(sampleOffset, true)
      if (numChannels === 2) {
        right[i] = view.getFloat32(sampleOffset + 4, true)
      } else {
        right[i] = left[i]
      }
    }
  }

  return { left, right, sampleRate, duration }
}

// 重命名為 formatSize 以便內部使用
const formatSize = formatFileSize

/**
 * 處理本地上傳的影片檔案
 * @param file 影片檔案
 * @param title 歌曲標題
 * @param options 處理選項
 * @returns 新建立的 SongRecord.id
 */
async function processUpload(
  file: File,
  title: string,
  options?: ProcessOptions
): Promise<string> {
  resetState()
  currentTitle.value = title
  state.value.sourceType = 'upload'

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

    // ========== 階段 1：提取音頻 (0-25%) ==========
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

    updateState({
      subStage: 'ffmpeg_extracting',
      progress: 10,
      subProgress: 0,
      message: `提取音頻 - ${fileSizeStr} (0%)`,
    }, options)
    checkCancelled()

    // 提取音頻
    const wavBuffer = await ffmpegService.extractAudio(file, (p) => {
      const subProg = sanitizeProgress(p * 100)
      updateState({
        subProgress: subProg,
        message: `提取音頻 - ${fileSizeStr} (${subProg}%)`,
        progress: sanitizeProgress(10 + p * 15), // 10-25%
      }, options)
    })

    updateState({ progress: 25 }, options)
    checkCancelled()

    // 解析 WAV 為立體聲
    const { left, right, sampleRate, duration: wavDuration } = parseWavToStereo(wavBuffer)
    const duration = wavDuration
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
    const separationResult = await demucsService.separate(left, right, ({ progress, currentSegment, totalSegments }) => {
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
    const drumsBuffer = demucsService.stereoToArrayBuffer(
      separationResult.drums.left,
      separationResult.drums.right
    )
    const bassBuffer = demucsService.stereoToArrayBuffer(
      separationResult.bass.left,
      separationResult.bass.right
    )
    const otherBuffer = demucsService.stereoToArrayBuffer(
      separationResult.other.left,
      separationResult.other.right
    )
    const vocalsBuffer = demucsService.stereoToArrayBuffer(
      separationResult.vocals.left,
      separationResult.vocals.right
    )
    const videoBuffer = await file.arrayBuffer()

    // 計算儲存大小（顯示為 WAV 匯出大小：PCM + 4 個 WAV header）
    const wavHeaderSize = 44 * 4 // 4 音軌，每個 WAV header 44 bytes
    const storageSize = drumsBuffer.byteLength + bassBuffer.byteLength +
      otherBuffer.byteLength + vocalsBuffer.byteLength + videoBuffer.byteLength + wavHeaderSize

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
      subStage: 'saving_video',
      progress: 95,
      subProgress: 50,
      message: '儲存影片資料...',
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
async function processYouTube(
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

    // 解析 WAV 為立體聲
    const { left, right } = parseWavToStereo(wavBuffer)

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
    const separationResult = await demucsService.separate(left, right, ({ progress, currentSegment, totalSegments }) => {
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
    const drumsBuffer = demucsService.stereoToArrayBuffer(
      separationResult.drums.left,
      separationResult.drums.right
    )
    const bassBuffer = demucsService.stereoToArrayBuffer(
      separationResult.bass.left,
      separationResult.bass.right
    )
    const otherBuffer = demucsService.stereoToArrayBuffer(
      separationResult.other.left,
      separationResult.other.right
    )
    const vocalsBuffer = demucsService.stereoToArrayBuffer(
      separationResult.vocals.left,
      separationResult.vocals.right
    )

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
function cancel() {
  cancelled = true
  resetState()
}

/**
 * useLocalProcessor composable
 */
export function useLocalProcessor() {
  return {
    state: readonly(state),
    currentTitle: readonly(currentTitle),
    processUpload,
    processYouTube,
    cancel,
  }
}

export default useLocalProcessor
