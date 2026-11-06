/**
 * FFmpeg.wasm 封裝服務
 * Feature: 005-frontend-processing
 *
 * 使用 ffmpeg.wasm 0.12（@ffmpeg/ffmpeg），FFmpeg 在 Web Worker 中執行，
 * 轉檔／合併時不會占住主執行緒。
 *
 * 使用單執行緒核心（@ffmpeg/core）：
 * - 不需要 SharedArrayBuffer
 * - 本專案的 FFmpeg 工作（抽音訊、AAC/MP3 編碼、-c:v copy 合併）都很輕，單執行緒即可
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

// ffmpeg-core 透過 CDN 載入（ESM 版本，供 module worker 使用）
const CORE_VERSION = '0.12.10'
const CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

// 保留最後幾行 log，失敗時附在錯誤訊息中方便除錯
const MAX_LOG_LINES = 20

/**
 * 下載檔案並轉為 Blob URL，可回報下載進度
 *
 * 不使用 @ffmpeg/util 的 toBlobURL 進度模式：CDN 啟用壓縮時 Content-Length 是壓縮後大小，
 * 與實際收到的位元組數不符，該函式會誤判下載不完整並重讀已消耗的 stream 而失敗。
 */
async function fetchToBlobURL(
  url: string,
  mimeType: string,
  onProgress?: (ratio: number) => void
): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下載失敗 (${response.status}): ${url}`)
  }

  let blob: Blob
  const total = parseInt(response.headers.get('Content-Length') || '0', 10)
  const reader = onProgress ? response.body?.getReader() : undefined

  if (reader) {
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) {
        // 壓縮傳輸時 received 可能超過 total，限制在 0-1
        onProgress?.(Math.min(1, received / total))
      }
    }
    blob = new Blob(chunks as BlobPart[], { type: mimeType })
  } else {
    blob = new Blob([await response.arrayBuffer()], { type: mimeType })
  }

  return URL.createObjectURL(blob)
}

/**
 * FFmpeg 服務封裝
 */
class FFmpegService {
  private ffmpeg: FFmpeg | null = null
  private loaded = false
  private loadingPromise: Promise<void> | null = null
  private progressCallback: ((progress: number) => void) | null = null
  private recentLogs: string[] = []
  // 所有操作共用同一個虛擬檔案系統，序列化執行避免檔名互相覆蓋
  private queue: Promise<unknown> = Promise.resolve()

  /**
   * 初始化 ffmpeg.wasm
   * @param onProgress 載入進度回呼（0-1）
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loaded) {
      onProgress?.(1)
      return
    }

    // 防止重複載入
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    this.loadingPromise = this.loadFFmpeg(onProgress)
    return this.loadingPromise
  }

  /**
   * 載入 FFmpeg
   */
  private async loadFFmpeg(onProgress?: (progress: number) => void): Promise<void> {
    try {
      const ffmpeg = new FFmpeg()

      ffmpeg.on('progress', ({ progress }) => {
        // 確保 progress 是有效數值（ffmpeg 有時會回報異常值）
        if (typeof progress === 'number' && isFinite(progress)) {
          this.progressCallback?.(Math.max(0, Math.min(1, progress)))
        }
      })

      ffmpeg.on('log', ({ message }) => {
        this.recentLogs.push(message)
        if (this.recentLogs.length > MAX_LOG_LINES) {
          this.recentLogs.shift()
        }
      })

      // 以 Blob URL 載入 core，避免跨來源 Worker 限制
      // wasm 約 30 MB，回報下載進度
      const [coreURL, wasmURL] = await Promise.all([
        fetchToBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        fetchToBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm', (ratio) => {
          onProgress?.(Math.min(0.95, ratio))
        }),
      ])

      try {
        await ffmpeg.load({ coreURL, wasmURL })
      } finally {
        // core 已載入 Worker，Blob URL 不再需要
        URL.revokeObjectURL(coreURL)
        URL.revokeObjectURL(wasmURL)
      }

      this.ffmpeg = ffmpeg
      this.loaded = true
      onProgress?.(1)
    } catch (error) {
      throw new Error(`FFmpeg 初始化失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.loadingPromise = null
    }
  }

  /**
   * 檢查是否已初始化
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * 依序執行 FFmpeg 操作（共用虛擬檔案系統，不可並行）
   */
  private run<T>(
    onProgress: ((progress: number) => void) | undefined,
    errorPrefix: string,
    task: (ffmpeg: FFmpeg) => Promise<T>
  ): Promise<T> {
    const job = this.queue.then(async () => {
      await this.initialize()
      const ffmpeg = this.ffmpeg
      if (!ffmpeg) {
        throw new Error('FFmpeg 初始化失敗')
      }

      this.progressCallback = onProgress || null
      this.recentLogs = []
      try {
        return await task(ffmpeg)
      } catch (error) {
        throw new Error(`${errorPrefix}: ${error instanceof Error ? error.message : '未知錯誤'}`)
      } finally {
        this.progressCallback = null
      }
    })
    // 失敗不影響後續排隊的操作
    this.queue = job.catch(() => undefined)
    return job
  }

  /**
   * 執行指令並檢查結束碼
   */
  private async exec(ffmpeg: FFmpeg, args: string[]): Promise<void> {
    const code = await ffmpeg.exec(args)
    if (code !== 0) {
      const tail = this.recentLogs.slice(-5).join('\n')
      throw new Error(`FFmpeg 結束碼 ${code}${tail ? `\n${tail}` : ''}`)
    }
  }

  /**
   * 讀取輸出檔並清理暫存檔
   */
  private async readAndCleanup(ffmpeg: FFmpeg, output: string, inputs: string[]): Promise<Uint8Array> {
    const data = await ffmpeg.readFile(output)
    await Promise.all([output, ...inputs].map(name => ffmpeg.deleteFile(name).catch(() => undefined)))
    if (typeof data === 'string') {
      throw new Error('輸出格式錯誤')
    }
    return data
  }

  /**
   * 取得與 Uint8Array 內容完全對應的 ArrayBuffer
   */
  private toArrayBuffer(data: Uint8Array): ArrayBuffer {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer as ArrayBuffer
    }
    return data.slice().buffer as ArrayBuffer
  }

  /**
   * 從影片提取音頻
   * @returns WAV ArrayBuffer (44.1kHz, 立體聲, 16-bit PCM)
   */
  async extractAudio(
    videoBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer> {
    return this.run(onProgress, '音頻提取失敗', async (ffmpeg) => {
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoBlob))

      // 執行轉換：提取音頻為 WAV (44.1kHz, 立體聲, 16-bit PCM)
      await this.exec(ffmpeg, [
        '-i', 'input.mp4',
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        'output.wav',
      ])

      const output = await this.readAndCleanup(ffmpeg, 'output.wav', ['input.mp4'])
      return this.toArrayBuffer(output)
    })
  }

  /**
   * 將音檔轉換為 WAV 格式
   * @param audioBlob 音檔 Blob（支援 MP3、FLAC、AAC、OGG 等格式）
   * @param onProgress 進度回呼
   * @returns WAV ArrayBuffer (44.1kHz, 立體聲, 16-bit PCM)
   */
  async convertToWav(
    audioBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer> {
    return this.run(onProgress, '音檔轉換失敗', async (ffmpeg) => {
      // 使用通用檔名，FFmpeg 會自動偵測格式
      await ffmpeg.writeFile('input_audio', await fetchFile(audioBlob))

      await this.exec(ffmpeg, [
        '-i', 'input_audio',
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        'output.wav',
      ])

      const output = await this.readAndCleanup(ffmpeg, 'output.wav', ['input_audio'])
      return this.toArrayBuffer(output)
    })
  }

  /**
   * 將 WAV 編碼為 MP3
   * 注意：audioBuffer 會移交給 FFmpeg Worker，呼叫後不可再使用
   * @returns MP3 Blob
   */
  async encodeToMp3(
    audioBuffer: ArrayBuffer,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    return this.run(onProgress, 'MP3 編碼失敗', async (ffmpeg) => {
      await ffmpeg.writeFile('input.wav', new Uint8Array(audioBuffer))

      // WAV → MP3 (192kbps)
      await this.exec(ffmpeg, [
        '-i', 'input.wav',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        'output.mp3',
      ])

      const output = await this.readAndCleanup(ffmpeg, 'output.mp3', ['input.wav'])
      return new Blob([output as BlobPart], { type: 'audio/mpeg' })
    })
  }

  /**
   * 將 WAV 編碼為 M4A (AAC)
   * 注意：audioBuffer 會移交給 FFmpeg Worker，呼叫後不可再使用
   * @returns M4A Blob
   */
  async encodeToM4a(
    audioBuffer: ArrayBuffer,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    return this.run(onProgress, 'M4A 編碼失敗', async (ffmpeg) => {
      await ffmpeg.writeFile('input.wav', new Uint8Array(audioBuffer))

      // WAV → M4A (AAC 192kbps)
      await this.exec(ffmpeg, [
        '-i', 'input.wav',
        '-c:a', 'aac',
        '-b:a', '192k',
        'output.m4a',
      ])

      const output = await this.readAndCleanup(ffmpeg, 'output.m4a', ['input.wav'])
      return new Blob([output as BlobPart], { type: 'audio/mp4' })
    })
  }

  /**
   * 合併影片與音訊
   * 注意：audioBuffer 會移交給 FFmpeg Worker，呼叫後不可再使用
   */
  async mergeVideoAudio(
    videoBlob: Blob,
    audioBuffer: ArrayBuffer,
    format: 'mp4' | 'm4a',
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    return this.run(onProgress, '合併失敗', async (ffmpeg) => {
      const outputFile = `output.${format}`
      const inputs = ['audio.wav']

      await ffmpeg.writeFile('audio.wav', new Uint8Array(audioBuffer))

      if (format === 'mp4') {
        await ffmpeg.writeFile('video.mp4', await fetchFile(videoBlob))
        inputs.push('video.mp4')

        // 合併影片與音訊
        await this.exec(ffmpeg, [
          '-i', 'video.mp4',
          '-i', 'audio.wav',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          outputFile,
        ])
      } else {
        // m4a：僅音訊容器
        await this.exec(ffmpeg, [
          '-i', 'audio.wav',
          '-c:a', 'aac',
          '-b:a', '192k',
          outputFile,
        ])
      }

      const output = await this.readAndCleanup(ffmpeg, outputFile, inputs)
      const mimeType = format === 'mp4' ? 'video/mp4' : 'audio/mp4'
      return new Blob([output as BlobPart], { type: mimeType })
    })
  }

  /**
   * 合併無聲影片與音訊檔案（直接 mux，不重新編碼）
   * @param videoBlob 無聲影片
   * @param audioBlob 音訊檔案
   * @param onProgress 進度回呼
   * @returns 合併後的影片 ArrayBuffer
   */
  async muxVideoAudio(
    videoBlob: Blob,
    audioBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer> {
    return this.run(onProgress, '影片合併失敗', async (ffmpeg) => {
      // 根據 blob type 判斷副檔名
      const videoExt = videoBlob.type.includes('webm') ? 'webm' : 'mp4'
      const audioExt = audioBlob.type.includes('webm') ? 'webm' : 'm4a'
      const videoFile = `input.${videoExt}`
      const audioFile = `input_audio.${audioExt}`

      await ffmpeg.writeFile(videoFile, await fetchFile(videoBlob))
      await ffmpeg.writeFile(audioFile, await fetchFile(audioBlob))

      // 直接複製影片和音訊串流（不重新編碼）
      await this.exec(ffmpeg, [
        '-i', videoFile,
        '-i', audioFile,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        'output.mp4',
      ])

      const output = await this.readAndCleanup(ffmpeg, 'output.mp4', [videoFile, audioFile])
      return this.toArrayBuffer(output)
    })
  }

  /**
   * 釋放資源（終止 FFmpeg Worker）
   */
  dispose(): void {
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate()
      } catch {
        // 忽略錯誤
      }
    }
    this.ffmpeg = null
    this.loaded = false
    this.loadingPromise = null
  }
}

export const ffmpegService = new FFmpegService()
export default ffmpegService
