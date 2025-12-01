/**
 * useDownload - 下載功能 composable
 * Feature: 005-frontend-processing / User Story 3
 *
 * 統一處理 WAV/MP3/MP4/M4A 格式的下載
 * 所有混音/編碼都在前端執行（ffmpeg.wasm）
 */
import { ref } from 'vue'
import { audioExportService } from '@/services/audioExportService'
import { ffmpegService } from '@/services/ffmpegService'
import { storageService } from '@/services/storageService'
import type { OutputFormat } from '@/types/storage'

// 所有編碼都在前端執行（ffmpeg.wasm）

export interface DownloadState {
  isDownloading: boolean
  progress: number
  stage: 'idle' | 'preparing' | 'mixing' | 'encoding' | 'complete'
  error: string | null
}

export interface DownloadOptions {
  /** 後端 job ID（Docker 模式） */
  jobId?: string
  /** 本地歌曲 ID（純靜態模式） */
  songId?: string
  /** 輸出格式 */
  format: OutputFormat
  /** 混音設定 */
  mixerSettings: {
    drums: number
    bass: number
    other: number
    vocals: number
    pitchShift: number
  }
  /** 歌曲標題（用於檔名） */
  title: string
  /** 進度回呼 */
  onProgress?: (state: DownloadState) => void
}

/**
 * 下載功能 composable
 */
export function useDownload() {
  const state = ref<DownloadState>({
    isDownloading: false,
    progress: 0,
    stage: 'idle',
    error: null,
  })

  /**
   * 更新狀態
   */
  function updateState(partial: Partial<DownloadState>, onProgress?: (state: DownloadState) => void) {
    state.value = { ...state.value, ...partial }
    onProgress?.(state.value)
  }

  /**
   * 重設狀態
   */
  function reset() {
    state.value = {
      isDownloading: false,
      progress: 0,
      stage: 'idle',
      error: null,
    }
  }

  /**
   * 觸發瀏覽器下載
   */
  function triggerBrowserDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * 使用前端處理下載（純靜態模式）
   */
  async function downloadFromLocal(options: DownloadOptions): Promise<void> {
    const { songId, format, mixerSettings, title, onProgress } = options

    if (!songId) {
      throw new Error('缺少 songId')
    }

    updateState({ stage: 'preparing', progress: 5 }, onProgress)

    // 從 IndexedDB 取得歌曲資料
    await storageService.init()
    const song = await storageService.getSong(songId)
    if (!song) {
      throw new Error('找不到歌曲資料')
    }

    updateState({ progress: 10 }, onProgress)

    // 將 ArrayBuffer 轉換為 AudioBuffer
    const trackBuffers = await Promise.all([
      audioExportService.arrayBufferToAudioBuffer(song.tracks.drums, song.sampleRate),
      audioExportService.arrayBufferToAudioBuffer(song.tracks.bass, song.sampleRate),
      audioExportService.arrayBufferToAudioBuffer(song.tracks.other, song.sampleRate),
      audioExportService.arrayBufferToAudioBuffer(song.tracks.vocals, song.sampleRate),
    ])

    updateState({ stage: 'mixing', progress: 20 }, onProgress)

    // 準備混音軌道
    const tracks = [
      { buffer: trackBuffers[0], volume: mixerSettings.drums },
      { buffer: trackBuffers[1], volume: mixerSettings.bass },
      { buffer: trackBuffers[2], volume: mixerSettings.other },
      { buffer: trackBuffers[3], volume: mixerSettings.vocals },
    ]

    let blob: Blob

    switch (format) {
      case 'wav': {
        updateState({ stage: 'encoding', progress: 40 }, onProgress)
        const wavBuffer = await audioExportService.mixToWav(tracks, song.duration)
        blob = new Blob([wavBuffer], { type: 'audio/wav' })
        break
      }

      case 'mp3': {
        updateState({ stage: 'encoding', progress: 40 }, onProgress)

        // 先混音為 WAV，再用 ffmpeg.wasm 轉 MP3
        const wavBufferForMp3 = await audioExportService.mixToWav(tracks, song.duration)

        updateState({ progress: 60 }, onProgress)

        await ffmpegService.initialize((p) => {
          updateState({ progress: 60 + p * 10 }, onProgress)
        })

        blob = await ffmpegService.encodeToMp3(wavBufferForMp3, (p) => {
          updateState({ progress: 70 + p * 25 }, onProgress)
        })
        break
      }

      case 'm4a': {
        updateState({ stage: 'encoding', progress: 40 }, onProgress)

        // 先混音為 WAV，再用 ffmpeg.wasm 轉 M4A
        const wavBufferForM4a = await audioExportService.mixToWav(tracks, song.duration)

        updateState({ progress: 60 }, onProgress)

        await ffmpegService.initialize((p) => {
          updateState({ progress: 60 + p * 10 }, onProgress)
        })

        blob = await ffmpegService.encodeToM4a(wavBufferForM4a, (p) => {
          updateState({ progress: 70 + p * 25 }, onProgress)
        })
        break
      }

      case 'mp4': {
        // MP4 需要原始影片
        if (!song.originalVideo) {
          throw new Error('此歌曲沒有原始影片，無法輸出 MP4 格式')
        }

        updateState({ stage: 'encoding', progress: 40 }, onProgress)

        // 先混音為 WAV
        const wavBuffer = await audioExportService.mixToWav(tracks, song.duration)

        updateState({ progress: 60 }, onProgress)

        // 使用 ffmpeg.wasm 合併
        await ffmpegService.initialize((p) => {
          updateState({ progress: 60 + p * 10 }, onProgress)
        })

        const videoBlob = new Blob([song.originalVideo], { type: 'video/mp4' })
        blob = await ffmpegService.mergeVideoAudio(videoBlob, wavBuffer, 'mp4', (p) => {
          updateState({ progress: 70 + p * 25 }, onProgress)
        })
        break
      }

      default:
        throw new Error(`不支援的格式: ${format}`)
    }

    updateState({ stage: 'complete', progress: 100 }, onProgress)

    // 觸發下載
    const extension = format === 'mp4' ? 'mp4' : format === 'm4a' ? 'm4a' : format
    const filename = `${title || '混音'}.${extension}`
    triggerBrowserDownload(blob, filename)
  }

  /**
   * 開始下載
   *
   * 注意：所有混音/編碼都在前端執行（ffmpeg.wasm）
   * 後端只負責 YouTube 下載，不提供混音 API
   */
  async function startDownload(options: DownloadOptions): Promise<void> {
    reset()
    state.value.isDownloading = true

    try {
      // 所有下載都使用前端處理（後端不再提供混音 API）
      if (options.songId) {
        await downloadFromLocal(options)
      } else {
        throw new Error('缺少 songId，無法下載')
      }
    } catch (err) {
      state.value.error = err instanceof Error ? err.message : '下載失敗'
      throw err
    } finally {
      state.value.isDownloading = false
    }
  }

  return {
    state,
    startDownload,
    reset,
  }
}

export default useDownload
