/**
 * Demucs-web 封裝服務
 * Feature: 005-frontend-processing
 *
 * 使用 demucs-web npm 套件進行瀏覽器端音源分離
 */

import * as ort from 'onnxruntime-web'
import { DemucsProcessor, CONSTANTS } from 'demucs-web'
import type { SeparationResult } from '@/types/storage'

/**
 * Demucs 服務封裝
 */
class DemucsService {
  private processor: DemucsProcessor | null = null
  private modelLoaded = false
  private loadingPromise: Promise<void> | null = null

  /**
   * 初始化並載入模型（延遲載入）
   * @param onProgress 模型下載進度回呼 (0-1)
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    // 防止重複載入
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    if (this.modelLoaded) {
      return
    }

    this.loadingPromise = this.loadModel(onProgress)
    return this.loadingPromise
  }

  /**
   * 載入模型
   */
  private async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    try {
      this.processor = new DemucsProcessor({
        ort,
        onProgress: (progress: number) => {
          onProgress?.(progress)
        },
        onLog: (phase: string, msg: string) => {
          console.log(`[Demucs ${phase}] ${msg}`)
        },
      })

      await this.processor.loadModel(CONSTANTS.DEFAULT_MODEL_URL)
      this.modelLoaded = true
    } catch (error) {
      this.loadingPromise = null
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
   * @param onProgress 分離進度回呼 (0-1)
   */
  async separate(
    left: Float32Array,
    right: Float32Array,
    onProgress?: (progress: number) => void
  ): Promise<SeparationResult> {
    if (!this.processor || !this.modelLoaded) {
      throw new Error('模型尚未載入，請先呼叫 initialize()')
    }

    try {
      // demucs-web 的 separate 方法
      const result = await this.processor.separate(left, right, onProgress)

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
      throw new Error(`音源分離失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 將分離結果轉換為 ArrayBuffer（用於儲存）
   */
  stereoToArrayBuffer(left: Float32Array, right: Float32Array): ArrayBuffer {
    const interleavedLength = left.length + right.length
    const interleaved = new Float32Array(interleavedLength)

    // 交錯排列左右聲道
    for (let i = 0; i < left.length; i++) {
      interleaved[i * 2] = left[i]
      interleaved[i * 2 + 1] = right[i]
    }

    return interleaved.buffer
  }

  /**
   * 從 ArrayBuffer 還原為立體聲
   */
  arrayBufferToStereo(buffer: ArrayBuffer): { left: Float32Array; right: Float32Array } {
    const interleaved = new Float32Array(buffer)
    const length = interleaved.length / 2
    const left = new Float32Array(length)
    const right = new Float32Array(length)

    for (let i = 0; i < length; i++) {
      left[i] = interleaved[i * 2]
      right[i] = interleaved[i * 2 + 1]
    }

    return { left, right }
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
