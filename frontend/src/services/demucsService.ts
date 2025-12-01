/**
 * Demucs-web 封裝服務
 * Feature: 005-frontend-processing
 *
 * 使用 demucs-web npm 套件進行瀏覽器端音源分離
 */

import * as ort from 'onnxruntime-web'
import { DemucsProcessor, CONSTANTS } from 'demucs-web'
import type { SeparationResult } from '@/types/storage'
import { stereoFloat32ToInt16Buffer, int16BufferToStereoFloat32 } from '@/utils/format'

// 設定 ONNX Runtime WASM 檔案路徑
// 使用 jsDelivr CDN（支援 CORS，版本須與 npm 一致）
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

/**
 * 模型下載進度回呼
 */
type DownloadProgressCallback = (loaded: number, total: number) => void

/**
 * 分離進度回呼參數
 */
interface SeparationProgress {
  progress: number
  currentSegment: number
  totalSegments: number
}

/**
 * Demucs 服務封裝
 */
class DemucsService {
  private processor: DemucsProcessor | null = null
  private modelLoaded = false
  private loadingPromise: Promise<void> | null = null
  private downloadProgressCallback: DownloadProgressCallback | null = null
  private separationProgressCallback: ((p: SeparationProgress) => void) | null = null

  /**
   * 初始化並載入模型（延遲載入）
   * @param onDownloadProgress 模型下載進度回呼 (loaded, total) bytes
   */
  async initialize(onDownloadProgress?: DownloadProgressCallback): Promise<void> {
    // 防止重複載入
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    if (this.modelLoaded) {
      return
    }

    this.loadingPromise = this.loadModel(onDownloadProgress)
    return this.loadingPromise
  }

  /**
   * 載入模型
   */
  private async loadModel(onDownloadProgress?: DownloadProgressCallback): Promise<void> {
    try {
      // 儲存下載進度回呼
      this.downloadProgressCallback = onDownloadProgress || null

      // demucs-web 沒有完整的 TypeScript 定義，使用 any 繞過
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const processorOptions: any = {
        ort,
        // onProgress 接收物件 { progress, currentSegment, totalSegments }
        onProgress: (progressInfo: any) => {
          // 分離進度（非下載進度）
          if (this.separationProgressCallback && progressInfo) {
            this.separationProgressCallback({
              progress: progressInfo.progress ?? 0,
              currentSegment: progressInfo.currentSegment ?? 0,
              totalSegments: progressInfo.totalSegments ?? 1,
            })
          }
        },
        // onDownloadProgress 接收 (loaded, total) bytes
        onDownloadProgress: (loaded: number, total: number) => {
          // 模型下載進度
          if (this.downloadProgressCallback) {
            this.downloadProgressCallback(loaded, total)
          }
          const percent = ((loaded / total) * 100).toFixed(1)
          const loadedMB = (loaded / 1024 / 1024).toFixed(1)
          const totalMB = (total / 1024 / 1024).toFixed(1)
          console.log(`[Demucs] 下載模型: ${loadedMB}/${totalMB} MB (${percent}%)`)
        },
        onLog: (phase: string, msg: string) => {
          console.log(`[Demucs ${phase}] ${msg}`)
        },
      }
      this.processor = new DemucsProcessor(processorOptions)

      await this.processor.loadModel(CONSTANTS.DEFAULT_MODEL_URL)
      this.modelLoaded = true
      this.downloadProgressCallback = null
    } catch (error) {
      this.loadingPromise = null
      this.downloadProgressCallback = null
      throw new Error(`模型載入失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 檢查模型是否已載入
   */
  isLoaded(): boolean {
    return this.modelLoaded
  }

  /**
   * 執行音源分離
   * @param left 左聲道 Float32Array (44.1kHz)
   * @param right 右聲道 Float32Array (44.1kHz)
   * @param onProgress 分離進度回呼 { progress: 0-1, currentSegment, totalSegments }
   */
  async separate(
    left: Float32Array,
    right: Float32Array,
    onProgress?: (info: { progress: number; currentSegment: number; totalSegments: number }) => void
  ): Promise<SeparationResult> {
    if (!this.processor || !this.modelLoaded) {
      throw new Error('模型尚未載入，請先呼叫 initialize()')
    }

    try {
      // 設定分離進度回呼（透過 processor 建構時的 onProgress）
      this.separationProgressCallback = onProgress
        ? (info) => {
            if (typeof info.progress === 'number' && !isNaN(info.progress) && isFinite(info.progress)) {
              onProgress({
                progress: Math.max(0, Math.min(1, info.progress)),
                currentSegment: info.currentSegment,
                totalSegments: info.totalSegments,
              })
            }
          }
        : null

      const result = await this.processor.separate(left, right)
      this.separationProgressCallback = null

      return {
        drums: {
          left: result.drums.left,
          right: result.drums.right,
        },
        bass: {
          left: result.bass.left,
          right: result.bass.right,
        },
        other: {
          left: result.other.left,
          right: result.other.right,
        },
        vocals: {
          left: result.vocals.left,
          right: result.vocals.right,
        },
      }
    } catch (error) {
      this.separationProgressCallback = null
      throw new Error(`音源分離失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 將分離結果轉換為 ArrayBuffer（用於儲存）
   * 使用 Int16 格式減少 50% 儲存空間
   */
  stereoToArrayBuffer(left: Float32Array, right: Float32Array): ArrayBuffer {
    return stereoFloat32ToInt16Buffer(left, right)
  }

  /**
   * 從 ArrayBuffer 還原為立體聲
   * 從 Int16 格式還原為 Float32
   */
  arrayBufferToStereo(buffer: ArrayBuffer): { left: Float32Array; right: Float32Array } {
    return int16BufferToStereoFloat32(buffer)
  }

  /**
   * 釋放資源
   */
  dispose(): void {
    if (this.processor) {
      // demucs-web 可能沒有 dispose 方法，依實際 API 調整
      this.processor = null
      this.modelLoaded = false
      this.loadingPromise = null
    }
  }
}

export const demucsService = new DemucsService()
export default demucsService
