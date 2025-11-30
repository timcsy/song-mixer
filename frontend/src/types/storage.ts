/**
 * 純前端人聲去除服務型別定義
 * Feature: 005-frontend-processing
 */

/**
 * 已處理歌曲記錄，儲存於 IndexedDB
 */
export interface SongRecord {
  /** UUID v4 */
  id: string
  /** 歌曲標題 */
  title: string
  /** 來源類型 */
  sourceType: 'youtube' | 'upload'
  /** YouTube URL（僅 youtube 類型） */
  sourceUrl?: string
  /** 縮圖 URL */
  thumbnailUrl?: string
  /** 時長（秒） */
  duration: number
  /** 取樣率，固定 44.1kHz */
  sampleRate: 44100
  /** 分離後音軌（立體聲，Float32 編碼為 ArrayBuffer） */
  tracks: {
    drums: ArrayBuffer
    bass: ArrayBuffer
    other: ArrayBuffer
    vocals: ArrayBuffer
  }
  /** 原始影片（用於 MP4 下載合併） */
  originalVideo?: ArrayBuffer
  /** 建立時間 */
  createdAt: Date
}

/**
 * 處理進度的即時狀態（記憶體內，不持久化）
 */
export interface ProcessingState {
  /** 處理階段 */
  stage: 'idle' | 'downloading' | 'extracting' | 'separating' | 'saving'
  /** 進度 0-100 */
  progress: number
  /** 錯誤訊息 */
  error: string | null
  /** 處理完成後的 SongRecord.id */
  songId?: string
}

/**
 * 單軌音訊設定
 */
export interface TrackSettings {
  /** 音量 0-1 */
  volume: number
  /** 是否靜音 */
  muted: boolean
  /** 是否獨奏 */
  solo: boolean
}

/**
 * 混音器即時設定（記憶體內）
 */
export interface MixerSettings {
  drums: TrackSettings
  bass: TrackSettings
  other: TrackSettings
  vocals: TrackSettings
  /** 升降 Key，-12 到 +12 半音 */
  pitchShift: number
  /** 主音量 0-1 */
  masterVolume: number
}

/**
 * 後端功能偵測結果
 */
export interface BackendCapabilities {
  /** /api/v1/health 是否可達 */
  available: boolean
  /** YouTube 下載功能 */
  youtube: boolean
  /** 後端 FFmpeg 處理 */
  ffmpeg: boolean
}

/**
 * 瀏覽器功能偵測結果
 */
export interface BrowserCapabilities {
  /** SharedArrayBuffer 支援 */
  sharedArrayBuffer: boolean
  /** WebGPU 支援（影響分離效能） */
  webGPU: boolean
  /** IndexedDB 支援 */
  indexedDB: boolean
  /** Service Worker 支援 */
  serviceWorker: boolean
}

/**
 * 輸出格式
 */
export type OutputFormat = 'mp4' | 'mp3' | 'm4a' | 'wav'

/**
 * 匯出下載請求
 */
export interface ExportRequest {
  songId: string
  format: OutputFormat
  mixerSettings: MixerSettings
}

/**
 * 音源分離結果
 */
export interface SeparationResult {
  drums: { left: Float32Array; right: Float32Array }
  bass: { left: Float32Array; right: Float32Array }
  other: { left: Float32Array; right: Float32Array }
  vocals: { left: Float32Array; right: Float32Array }
}

/**
 * YouTube 影片資訊
 */
export interface YouTubeInfo {
  title: string
  duration: number
  thumbnail: string
  uploader: string
}

/**
 * 處理選項
 */
export interface ProcessOptions {
  onProgress?: (state: ProcessingState) => void
}

/**
 * 預設混音器設定
 */
export const DEFAULT_MIXER_SETTINGS: MixerSettings = {
  drums: { volume: 1, muted: false, solo: false },
  bass: { volume: 1, muted: false, solo: false },
  other: { volume: 1, muted: false, solo: false },
  vocals: { volume: 1, muted: false, solo: false },
  pitchShift: 0,
  masterVolume: 1,
}

/**
 * 預設軌道設定
 */
export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  volume: 1,
  muted: false,
  solo: false,
}
