/**
 * Demucs Worker 訊息協定（主執行緒 ↔ Worker）
 */

/** 分離進度 */
export interface SeparationProgress {
  /** 0-1 */
  progress: number
  currentSegment: number
  totalSegments: number
}

/** 模型初始化選項（裝置偵測需要 DOM，在主執行緒算好再傳入） */
export interface DemucsInitOptions {
  sessionOptions: Record<string, unknown>
  modelUrl?: string
}

/** 分離結果：四軌 Int16 立體聲交錯 ArrayBuffer */
export interface DemucsTracksResult {
  sampleRate: number
  duration: number
  tracks: {
    drums: ArrayBuffer
    bass: ArrayBuffer
    other: ArrayBuffer
    vocals: ArrayBuffer
  }
}

/** 主執行緒 → Worker */
export type DemucsRequest =
  | { type: 'init'; id: number; options: DemucsInitOptions }
  | { type: 'separate'; id: number; wav: ArrayBuffer }
  /** 取消進行中的分離（於下一個區段完成時中止，模型保留） */
  | { type: 'cancel'; id: number }

/** Worker → 主執行緒 */
export type DemucsResponse =
  | { type: 'downloadProgress'; id: number; loaded: number; total: number }
  | { type: 'progress'; id: number; info: SeparationProgress }
  | { type: 'log'; phase: string; msg: string }
  | { type: 'done'; id: number; result?: DemucsTracksResult }
  | { type: 'error'; id: number; message: string }
