/**
 * Demucs 核心處理邏輯
 *
 * 不依賴 DOM，可在 Web Worker（預設）或主執行緒（備援）中執行。
 * 包含：WAV 解析 → 音源分離 → 轉為 Int16 交錯格式，
 * 這些都是 CPU 密集的運算，放在 Worker 中可避免畫面卡頓。
 */

import * as ort from 'onnxruntime-web'
import { DemucsProcessor, CONSTANTS } from 'demucs-web'
import { parseWavToStereo } from '@/utils/wav'
import { stereoFloat32ToInt16Buffer } from '@/utils/format'
import type { DemucsInitOptions, DemucsTracksResult, SeparationProgress } from './protocol'

// 設定 ONNX Runtime WASM 檔案路徑
// 使用 jsDelivr CDN（支援 CORS，版本須與 npm 一致）
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

export interface DemucsCoreCallbacks {
  onDownloadProgress?: (loaded: number, total: number) => void
  onLog?: (phase: string, msg: string) => void
}

/**
 * 建立 Demucs 處理引擎
 */
export function createDemucsCore(callbacks: DemucsCoreCallbacks = {}) {
  let processor: DemucsProcessor | null = null
  let separationProgress: ((p: SeparationProgress) => void) | null = null

  return {
    /**
     * 載入模型
     */
    async init(options: DemucsInitOptions): Promise<void> {
      if (processor) return

      const p = new DemucsProcessor({
        ort,
        sessionOptions: options.sessionOptions,
        onProgress: (info) => {
          if (!separationProgress || !info) return
          const progress = typeof info.progress === 'number' && isFinite(info.progress)
            ? Math.max(0, Math.min(1, info.progress))
            : 0
          separationProgress({
            progress,
            currentSegment: info.currentSegment ?? 0,
            totalSegments: info.totalSegments ?? 1,
          })
        },
        onDownloadProgress: (loaded, total) => callbacks.onDownloadProgress?.(loaded, total),
        onLog: (phase, msg) => callbacks.onLog?.(phase, msg),
      })

      await p.loadModel(options.modelUrl || CONSTANTS.DEFAULT_MODEL_URL)
      processor = p
    },

    isLoaded(): boolean {
      return processor !== null
    },

    /**
     * 解析 WAV 並分離音軌，回傳 Int16 立體聲交錯格式的四軌資料
     */
    async separateWav(
      wav: ArrayBuffer,
      onProgress?: (p: SeparationProgress) => void
    ): Promise<DemucsTracksResult> {
      if (!processor) {
        throw new Error('模型尚未載入，請先呼叫 initialize()')
      }

      const { left, right, sampleRate, duration } = parseWavToStereo(wav)

      separationProgress = onProgress ?? null
      try {
        const result = await processor.separate(left, right)
        return {
          sampleRate,
          duration,
          tracks: {
            drums: stereoFloat32ToInt16Buffer(result.drums.left, result.drums.right),
            bass: stereoFloat32ToInt16Buffer(result.bass.left, result.bass.right),
            other: stereoFloat32ToInt16Buffer(result.other.left, result.other.right),
            vocals: stereoFloat32ToInt16Buffer(result.vocals.left, result.vocals.right),
          },
        }
      } finally {
        separationProgress = null
      }
    },
  }
}

export type DemucsCore = ReturnType<typeof createDemucsCore>
