/**
 * Demucs 音源分離服務（主執行緒端）
 * Feature: 005-frontend-processing
 *
 * 實際運算在 Web Worker 中執行（services/demucs/demucs.worker.ts），
 * 主執行緒只負責傳送資料與接收進度／結果，不會因分離運算而卡住畫面。
 * 若瀏覽器無法建立 module worker，會自動退回主執行緒執行（較易卡頓）。
 */

import type {
  DemucsInitOptions,
  DemucsRequest,
  DemucsResponse,
  DemucsTracksResult,
  SeparationProgress,
} from './demucs/protocol'
import type { DemucsCore } from './demucs/demucsCore'

/** 分離被取消時的錯誤訊息（與 demucsCore 一致） */
const CANCELLED_MESSAGE = '處理已取消'

export type { DemucsTracksResult, SeparationProgress }

/**
 * 檢查瀏覽器是否支援 WebGPU
 */
function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * 檢查是否為行動裝置
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768
  const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  return mobileRegex.test(userAgent.toLowerCase()) || (isSmallScreen && hasTouch)
}

/**
 * 取得裝置記憶體（GB）
 * 僅 Chromium 瀏覽器支援，其他返回 undefined
 */
function getDeviceMemory(): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any
  return nav.deviceMemory
}

/**
 * 判斷是否為低記憶體裝置
 */
function isLowMemoryDevice(): boolean {
  const memory = getDeviceMemory()
  // 4GB 以下視為低記憶體裝置
  if (memory !== undefined && memory <= 4) {
    return true
  }
  // 行動裝置預設視為低記憶體
  return isMobileDevice()
}

/**
 * 取得 ONNX Runtime Session Options
 * 根據裝置類型自動調整記憶體設定
 */
function getSessionOptions(): Record<string, unknown> {
  const isLowMem = isLowMemoryDevice()
  const memory = getDeviceMemory()

  if (isLowMem) {
    console.log(`[Demucs] 偵測到低記憶體裝置 (${memory ?? '未知'} GB)，啟用記憶體優化模式`)
    return {
      // 關閉 CPU 記憶體競技場，避免預先分配大塊記憶體
      enableCpuMemArena: false,
      // 關閉記憶體模式優化，減少記憶體追蹤開銷
      enableMemPattern: false,
    }
  }

  console.log(`[Demucs] 裝置記憶體: ${memory ?? '未知'} GB，使用預設設定`)
  return {}
}

/**
 * 模型下載進度回呼
 */
type DownloadProgressCallback = (loaded: number, total: number) => void

/**
 * 執行後端介面（Worker 或主執行緒備援）
 */
interface DemucsBackend {
  readonly kind: 'worker' | 'inline'
  init(options: DemucsInitOptions, onDownloadProgress?: DownloadProgressCallback): Promise<void>
  separateWav(wav: ArrayBuffer, onProgress?: (p: SeparationProgress) => void): Promise<DemucsTracksResult>
  /** 取消進行中的分離（於下一個區段完成時中止） */
  cancel(): void
  dispose(): void
}

/**
 * Worker 無法啟動（例如瀏覽器不支援 module worker）
 * 遇到此錯誤時改用主執行緒備援
 */
class WorkerStartupError extends Error {}

/**
 * Worker 執行中崩潰（例如記憶體不足）
 * 只有這種錯誤需要重建 Worker；一般的分離錯誤不影響 Worker 與已載入的模型
 */
class WorkerCrashError extends Error {}

interface PendingRequest {
  resolve: (result: DemucsTracksResult | undefined) => void
  reject: (error: Error) => void
  onProgress?: (p: SeparationProgress) => void
  onDownloadProgress?: DownloadProgressCallback
}

/**
 * Web Worker 後端
 */
function createWorkerBackend(): DemucsBackend {
  const worker = new Worker(new URL('./demucs/demucs.worker.ts', import.meta.url), {
    type: 'module',
    name: 'demucs',
  })
  const pending = new Map<number, PendingRequest>()
  let nextId = 1
  // 收過任何訊息代表 Worker 腳本已成功載入
  let started = false
  let disposed = false
  // 進行中的分離請求 id（用於取消）
  let activeSeparateId: number | null = null

  const failAll = (error: Error) => {
    pending.forEach(p => p.reject(error))
    pending.clear()
  }

  worker.onmessage = (event: MessageEvent<DemucsResponse>) => {
    started = true
    const msg = event.data

    if (msg.type === 'log') {
      console.log(`[Demucs ${msg.phase}] ${msg.msg}`)
      return
    }

    const req = pending.get(msg.id)
    if (!req) return

    switch (msg.type) {
      case 'downloadProgress':
        req.onDownloadProgress?.(msg.loaded, msg.total)
        break
      case 'progress':
        req.onProgress?.(msg.info)
        break
      case 'done':
        pending.delete(msg.id)
        req.resolve(msg.result)
        break
      case 'error':
        pending.delete(msg.id)
        req.reject(new Error(msg.message))
        break
    }
  }

  worker.onerror = (event: ErrorEvent) => {
    event.preventDefault()
    const message = event.message || 'Worker 發生未預期的錯誤'
    failAll(started ? new WorkerCrashError(message) : new WorkerStartupError(message))
  }

  worker.onmessageerror = () => {
    failAll(new WorkerCrashError('Worker 訊息解析失敗'))
  }

  const send = (
    request: DemucsRequest,
    callbacks: Omit<PendingRequest, 'resolve' | 'reject'>,
    transfer: Transferable[] = []
  ) => {
    if (disposed) {
      return Promise.reject(new Error('Demucs Worker 已釋放'))
    }
    return new Promise<DemucsTracksResult | undefined>((resolve, reject) => {
      pending.set(request.id, { resolve, reject, ...callbacks })
      worker.postMessage(request, transfer)
    })
  }

  return {
    kind: 'worker',

    async init(options, onDownloadProgress) {
      await send({ type: 'init', id: nextId++, options }, { onDownloadProgress })
    },

    async separateWav(wav, onProgress) {
      const id = nextId++
      activeSeparateId = id
      try {
        // transfer：WAV 資料移交給 Worker，主執行緒不再保留一份
        const result = await send({ type: 'separate', id, wav }, { onProgress }, [wav])
        if (!result) throw new Error('Worker 未回傳分離結果')
        return result
      } finally {
        if (activeSeparateId === id) activeSeparateId = null
      }
    },

    cancel() {
      if (activeSeparateId !== null && !disposed) {
        worker.postMessage({ type: 'cancel', id: activeSeparateId } satisfies DemucsRequest)
      }
    },

    dispose() {
      disposed = true
      failAll(new Error('Demucs Worker 已釋放'))
      worker.terminate()
    },
  }
}

/**
 * 主執行緒備援後端（無法使用 Worker 時）
 */
async function createInlineBackend(): Promise<DemucsBackend> {
  const { createDemucsCore } = await import('./demucs/demucsCore')
  let downloadCallback: DownloadProgressCallback | undefined
  let cancelRequested = false
  const core: DemucsCore = createDemucsCore({
    onDownloadProgress: (loaded, total) => downloadCallback?.(loaded, total),
    onLog: (phase, msg) => console.log(`[Demucs ${phase}] ${msg}`),
  })

  return {
    kind: 'inline',
    async init(options, onDownloadProgress) {
      downloadCallback = onDownloadProgress
      try {
        await core.init(options)
      } finally {
        downloadCallback = undefined
      }
    },
    async separateWav(wav, onProgress) {
      cancelRequested = false
      try {
        return await core.separateWav(wav, onProgress, () => cancelRequested)
      } finally {
        cancelRequested = false
      }
    },
    cancel() {
      cancelRequested = true
    },
    dispose() {
      // 主執行緒模式無需額外釋放
    },
  }
}

/**
 * Demucs 服務
 */
class DemucsService {
  private backend: DemucsBackend | null = null
  private modelLoaded = false
  private loadingPromise: Promise<void> | null = null
  private workerUnavailable = false
  // 同一個 ONNX session 不能同時推論，分離請求依序執行
  private separateQueue: Promise<unknown> = Promise.resolve()

  /**
   * 初始化並載入模型（延遲載入）
   * @param onDownloadProgress 模型下載進度回呼 (loaded, total) bytes
   */
  async initialize(onDownloadProgress?: DownloadProgressCallback): Promise<void> {
    if (this.modelLoaded) return

    // 防止重複載入
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    this.loadingPromise = this.loadModel(onDownloadProgress)
    return this.loadingPromise
  }

  private async loadModel(onDownloadProgress?: DownloadProgressCallback): Promise<void> {
    const options: DemucsInitOptions = { sessionOptions: getSessionOptions() }
    console.log(
      isWebGPUSupported()
        ? '[Demucs] 偵測到 WebGPU 支援，使用 WebGPU 加速'
        : '[Demucs] 使用 WASM（CPU）模式'
    )

    try {
      try {
        this.backend = await this.createBackend()
        await this.backend.init(options, onDownloadProgress)
      } catch (error) {
        if (!(error instanceof WorkerStartupError)) throw error
        // Worker 無法啟動 → 改用主執行緒
        console.warn('[Demucs] 無法啟動 Web Worker，改在主執行緒執行（處理時畫面可能卡頓）:', error.message)
        this.backend?.dispose()
        this.workerUnavailable = true
        this.backend = await this.createBackend()
        await this.backend.init(options, onDownloadProgress)
      }
      console.log(`[Demucs] 模型載入完成（${this.backend.kind === 'worker' ? 'Web Worker' : '主執行緒'}）`)
      this.modelLoaded = true
    } catch (error) {
      this.backend?.dispose()
      this.backend = null
      throw new Error(`模型載入失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.loadingPromise = null
    }
  }

  private async createBackend(): Promise<DemucsBackend> {
    if (!this.workerUnavailable && typeof Worker !== 'undefined') {
      try {
        return createWorkerBackend()
      } catch (error) {
        console.warn('[Demucs] 建立 Web Worker 失敗:', error)
        this.workerUnavailable = true
      }
    }
    return createInlineBackend()
  }

  /**
   * 檢查模型是否已載入
   */
  isLoaded(): boolean {
    return this.modelLoaded
  }

  /**
   * 解析 WAV 並執行音源分離
   *
   * 注意：wav 會以 transfer 移交給 Worker，呼叫後原本的 ArrayBuffer 會變成空的（detached），
   * 呼叫端不可再使用。
   *
   * @param wav WAV 檔案資料（ffmpeg 輸出的 16-bit PCM）
   * @param onProgress 分離進度回呼 { progress: 0-1, currentSegment, totalSegments }
   * @returns 四軌 Int16 立體聲交錯資料、取樣率與時長
   */
  async separateWav(
    wav: ArrayBuffer,
    onProgress?: (info: SeparationProgress) => void
  ): Promise<DemucsTracksResult> {
    const job = this.separateQueue.then(async () => {
      const backend = this.backend
      if (!backend || !this.modelLoaded) {
        throw new Error('模型尚未載入，請先呼叫 initialize()')
      }

      try {
        return await backend.separateWav(wav, onProgress)
      } catch (error) {
        // 只有 Worker 崩潰（例如記憶體不足）才重置，下次重新建立；
        // 一般錯誤或取消不影響 Worker 與已載入的模型
        if (error instanceof WorkerCrashError && this.backend === backend) {
          this.dispose()
        }
        const message = error instanceof Error ? error.message : '未知錯誤'
        if (message === CANCELLED_MESSAGE) {
          throw new Error(CANCELLED_MESSAGE)
        }
        throw new Error(`音源分離失敗: ${message}`)
      }
    })
    this.separateQueue = job.catch(() => undefined)
    return job
  }

  /**
   * 取消進行中的分離（於目前區段完成時中止，模型保留，不需重新下載）
   */
  cancel(): void {
    this.backend?.cancel()
  }

  /**
   * 釋放資源（終止 Worker）
   */
  dispose(): void {
    this.backend?.dispose()
    this.backend = null
    this.modelLoaded = false
    this.loadingPromise = null
  }
}

export const demucsService = new DemucsService()
export default demucsService
