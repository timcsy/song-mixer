/**
 * useLocalProcessor - 本地處理流程 composable
 * Feature: 005-frontend-processing
 *
 * 處理本地影片上傳：提取音頻 → 音源分離 → 儲存到 IndexedDB
 */
import { ref, readonly } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { ffmpegService } from '@/services/ffmpegService'
import { demucsService } from '@/services/demucsService'
import { storageService } from '@/services/storageService'
import { downloadYouTube, getBackendCapabilities } from '@/services/api'
import type { ProcessingState, SongRecord, ProcessOptions } from '@/types/storage'

// 所有媒體處理都在前端執行（ffmpeg.wasm + demucs-web）

// 處理狀態
const state = ref<ProcessingState>({
  stage: 'idle',
  progress: 0,
  error: null,
  songId: undefined,
})

// 取消標記
let cancelled = false

/**
 * 更新處理狀態
 */
function updateState(
  partial: Partial<ProcessingState>,
  options?: ProcessOptions
) {
  state.value = { ...state.value, ...partial }
  options?.onProgress?.(state.value)
}

/**
 * 重設狀態
 */
function resetState() {
  state.value = {
    stage: 'idle',
    progress: 0,
    error: null,
    songId: undefined,
  }
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

    // 階段 1：使用 ffmpeg.wasm 提取音頻
    updateState({ stage: 'extracting', progress: 0 }, options)
    checkCancelled()

    let wavBuffer: ArrayBuffer
    let duration: number

    // 統一使用前端 ffmpeg.wasm 處理
    await ffmpegService.initialize((p) => {
      updateState({ progress: p * 30 }, options)
    })

    wavBuffer = await ffmpegService.extractAudio(file, (p) => {
      updateState({ progress: 30 + p * 20 }, options)
    })
    duration = 0 // 會在解析 WAV 時計算

    updateState({ progress: 50 }, options)
    checkCancelled()

    // 解析 WAV 為立體聲
    const { left, right, sampleRate, duration: wavDuration } = parseWavToStereo(wavBuffer)
    if (duration === 0) {
      duration = wavDuration
    }

    // 驗證取樣率
    if (sampleRate !== 44100) {
      console.warn(`取樣率為 ${sampleRate}Hz，非預期的 44100Hz`)
    }

    // 階段 2：音源分離
    updateState({ stage: 'separating', progress: 50 }, options)
    checkCancelled()

    await demucsService.initialize((p) => {
      updateState({ progress: 50 + p * 10 }, options)
    })

    const separationResult = await demucsService.separate(left, right, (p) => {
      updateState({ progress: 60 + p * 30 }, options)
    })

    updateState({ progress: 90 }, options)
    checkCancelled()

    // 階段 3：儲存到 IndexedDB
    updateState({ stage: 'saving', progress: 90 }, options)

    const songId = uuidv4()
    const song: SongRecord = {
      id: songId,
      title,
      sourceType: 'upload',
      duration,
      sampleRate: 44100,
      createdAt: new Date(),
      tracks: {
        drums: demucsService.stereoToArrayBuffer(
          separationResult.drums.left,
          separationResult.drums.right
        ),
        bass: demucsService.stereoToArrayBuffer(
          separationResult.bass.left,
          separationResult.bass.right
        ),
        other: demucsService.stereoToArrayBuffer(
          separationResult.other.left,
          separationResult.other.right
        ),
        vocals: demucsService.stereoToArrayBuffer(
          separationResult.vocals.left,
          separationResult.vocals.right
        ),
      },
      originalVideo: await file.arrayBuffer(),
    }

    await storageService.saveSong(song)

    updateState({ stage: 'idle', progress: 100, songId }, options)
    return songId
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '處理失敗'
    updateState({ stage: 'idle', progress: 0, error: errorMessage }, options)
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

  const backend = getBackendCapabilities()
  if (!backend.available || !backend.youtube) {
    throw new Error('YouTube 功能僅在 Docker 部署模式下可用')
  }

  try {
    await storageService.init()

    // 階段 1：下載影片
    updateState({ stage: 'downloading', progress: 0 }, options)
    checkCancelled()

    const { audio, title, duration, thumbnail } = await downloadYouTube(url)

    updateState({ progress: 50 }, options)
    checkCancelled()

    // 解析 WAV 為立體聲
    const { left, right } = parseWavToStereo(audio)

    // 階段 2：音源分離
    updateState({ stage: 'separating', progress: 50 }, options)
    checkCancelled()

    await demucsService.initialize((p) => {
      updateState({ progress: 50 + p * 10 }, options)
    })

    const separationResult = await demucsService.separate(left, right, (p) => {
      updateState({ progress: 60 + p * 30 }, options)
    })

    updateState({ progress: 90 }, options)
    checkCancelled()

    // 階段 3：儲存到 IndexedDB
    updateState({ stage: 'saving', progress: 90 }, options)

    const songId = uuidv4()
    const song: SongRecord = {
      id: songId,
      title,
      sourceType: 'youtube',
      sourceUrl: url,
      thumbnailUrl: thumbnail,
      duration,
      sampleRate: 44100,
      createdAt: new Date(),
      tracks: {
        drums: demucsService.stereoToArrayBuffer(
          separationResult.drums.left,
          separationResult.drums.right
        ),
        bass: demucsService.stereoToArrayBuffer(
          separationResult.bass.left,
          separationResult.bass.right
        ),
        other: demucsService.stereoToArrayBuffer(
          separationResult.other.left,
          separationResult.other.right
        ),
        vocals: demucsService.stereoToArrayBuffer(
          separationResult.vocals.left,
          separationResult.vocals.right
        ),
      },
      // YouTube 來源不儲存原始影片（節省空間）
    }

    await storageService.saveSong(song)

    updateState({ stage: 'idle', progress: 100, songId }, options)
    return songId
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '處理失敗'
    updateState({ stage: 'idle', progress: 0, error: errorMessage }, options)
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
    processUpload,
    processYouTube,
    cancel,
  }
}

export default useLocalProcessor
