/**
 * FFmpeg.wasm 封裝服務
 * Feature: 005-frontend-processing
 *
 * 使用 ffmpeg.wasm 0.11.6 進行瀏覽器端影音處理
 */

// ffmpeg.wasm 0.11.6 透過 CDN 載入，使用全域變數
declare const FFmpeg: {
  createFFmpeg: (options?: {
    log?: boolean
    progress?: (params: { ratio: number }) => void
  }) => FFmpegInstance
  fetchFile: (data: Blob | ArrayBuffer | string) => Promise<Uint8Array>
}

interface FFmpegInstance {
  load: () => Promise<void>
  isLoaded: () => boolean
  run: (...args: string[]) => Promise<void>
  FS: (method: string, ...args: any[]) => any
  exit: () => void
}

/**
 * FFmpeg 服務封裝
 */
class FFmpegService {
  private ffmpeg: FFmpegInstance | null = null
  private loadingPromise: Promise<void> | null = null
  private progressCallback: ((progress: number) => void) | null = null

  /**
   * 初始化 ffmpeg.wasm
   * @param onProgress 載入進度回呼
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    // 防止重複載入
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    if (this.ffmpeg?.isLoaded()) {
      return
    }

    this.loadingPromise = this.loadFFmpeg(onProgress)
    return this.loadingPromise
  }

  /**
   * 載入 FFmpeg
   */
  private async loadFFmpeg(onProgress?: (progress: number) => void): Promise<void> {
    try {
      // 等待 CDN 載入
      if (typeof FFmpeg === 'undefined') {
        throw new Error('FFmpeg.wasm 尚未載入，請確認 index.html 有引入 CDN')
      }

      this.ffmpeg = FFmpeg.createFFmpeg({
        log: false,
        progress: ({ ratio }) => {
          // 確保 ratio 是有效數值
          if (typeof ratio === 'number' && !isNaN(ratio) && isFinite(ratio)) {
            this.progressCallback?.(Math.max(0, Math.min(1, ratio)))
          }
        },
      })

      await this.ffmpeg.load()
      onProgress?.(1)
    } catch (error) {
      this.loadingPromise = null
      throw new Error(`FFmpeg 初始化失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 檢查是否已初始化
   */
  isLoaded(): boolean {
    return this.ffmpeg?.isLoaded() ?? false
  }

  /**
   * 從影片提取音頻
   * @returns WAV ArrayBuffer (44.1kHz, 立體聲, 16-bit PCM)
   */
  async extractAudio(
    videoBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer> {
    if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
      await this.initialize()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 初始化失敗')
    }

    this.progressCallback = onProgress || null

    try {
      // 寫入輸入檔案
      const inputData = await FFmpeg.fetchFile(videoBlob)
      this.ffmpeg.FS('writeFile', 'input.mp4', inputData)

      // 執行轉換：提取音頻為 WAV (44.1kHz, 立體聲, 16-bit PCM)
      await this.ffmpeg.run(
        '-i', 'input.mp4',
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        'output.wav'
      )

      // 讀取輸出
      const outputData = this.ffmpeg.FS('readFile', 'output.wav')

      // 清理暫存檔案
      this.ffmpeg.FS('unlink', 'input.mp4')
      this.ffmpeg.FS('unlink', 'output.wav')

      return outputData.buffer
    } catch (error) {
      throw new Error(`音頻提取失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.progressCallback = null
    }
  }

  /**
   * 將 WAV 編碼為 MP3
   * @returns MP3 Blob
   */
  async encodeToMp3(
    audioBuffer: ArrayBuffer,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
      await this.initialize()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 初始化失敗')
    }

    this.progressCallback = onProgress || null

    try {
      // 寫入輸入檔案
      const audioData = new Uint8Array(audioBuffer)
      this.ffmpeg.FS('writeFile', 'input.wav', audioData)

      // 執行轉換：WAV → MP3 (192kbps)
      await this.ffmpeg.run(
        '-i', 'input.wav',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        'output.mp3'
      )

      // 讀取輸出
      const outputData = this.ffmpeg.FS('readFile', 'output.mp3')

      // 清理暫存檔案
      this.ffmpeg.FS('unlink', 'input.wav')
      this.ffmpeg.FS('unlink', 'output.mp3')

      return new Blob([outputData], { type: 'audio/mpeg' })
    } catch (error) {
      throw new Error(`MP3 編碼失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.progressCallback = null
    }
  }

  /**
   * 將 WAV 編碼為 M4A (AAC)
   * @returns M4A Blob
   */
  async encodeToM4a(
    audioBuffer: ArrayBuffer,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
      await this.initialize()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 初始化失敗')
    }

    this.progressCallback = onProgress || null

    try {
      // 寫入輸入檔案
      const audioData = new Uint8Array(audioBuffer)
      this.ffmpeg.FS('writeFile', 'input.wav', audioData)

      // 執行轉換：WAV → M4A (AAC 192kbps)
      await this.ffmpeg.run(
        '-i', 'input.wav',
        '-c:a', 'aac',
        '-b:a', '192k',
        'output.m4a'
      )

      // 讀取輸出
      const outputData = this.ffmpeg.FS('readFile', 'output.m4a')

      // 清理暫存檔案
      this.ffmpeg.FS('unlink', 'input.wav')
      this.ffmpeg.FS('unlink', 'output.m4a')

      return new Blob([outputData], { type: 'audio/mp4' })
    } catch (error) {
      throw new Error(`M4A 編碼失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.progressCallback = null
    }
  }

  /**
   * 合併影片與音訊
   */
  async mergeVideoAudio(
    videoBlob: Blob,
    audioBuffer: ArrayBuffer,
    format: 'mp4' | 'm4a',
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
      await this.initialize()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 初始化失敗')
    }

    this.progressCallback = onProgress || null

    try {
      // 寫入輸入檔案
      const videoData = await FFmpeg.fetchFile(videoBlob)
      this.ffmpeg.FS('writeFile', 'video.mp4', videoData)

      const audioData = new Uint8Array(audioBuffer)
      this.ffmpeg.FS('writeFile', 'audio.wav', audioData)

      const outputFile = `output.${format}`

      if (format === 'mp4') {
        // 合併影片與音訊
        await this.ffmpeg.run(
          '-i', 'video.mp4',
          '-i', 'audio.wav',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          outputFile
        )
      } else {
        // m4a：僅音訊容器
        await this.ffmpeg.run(
          '-i', 'audio.wav',
          '-c:a', 'aac',
          '-b:a', '192k',
          outputFile
        )
      }

      // 讀取輸出
      const outputData = this.ffmpeg.FS('readFile', outputFile)

      // 清理暫存檔案
      this.ffmpeg.FS('unlink', 'video.mp4')
      this.ffmpeg.FS('unlink', 'audio.wav')
      this.ffmpeg.FS('unlink', outputFile)

      const mimeType = format === 'mp4' ? 'video/mp4' : 'audio/mp4'
      return new Blob([outputData], { type: mimeType })
    } catch (error) {
      throw new Error(`合併失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.progressCallback = null
    }
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
    if (!this.ffmpeg || !this.ffmpeg.isLoaded()) {
      await this.initialize()
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg 初始化失敗')
    }

    this.progressCallback = onProgress || null

    try {
      // 寫入輸入檔案
      const videoData = await FFmpeg.fetchFile(videoBlob)
      const audioData = await FFmpeg.fetchFile(audioBlob)

      // 根據 blob type 判斷副檔名
      const videoExt = videoBlob.type.includes('webm') ? 'webm' : 'mp4'
      const audioExt = audioBlob.type.includes('webm') ? 'webm' : 'm4a'

      this.ffmpeg.FS('writeFile', `input.${videoExt}`, videoData)
      this.ffmpeg.FS('writeFile', `input.${audioExt}`, audioData)

      // 執行 mux：直接複製影片和音訊串流（不重新編碼）
      await this.ffmpeg.run(
        '-i', `input.${videoExt}`,
        '-i', `input.${audioExt}`,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        'output.mp4'
      )

      // 讀取輸出
      const outputData = this.ffmpeg.FS('readFile', 'output.mp4')

      // 清理暫存檔案
      this.ffmpeg.FS('unlink', `input.${videoExt}`)
      this.ffmpeg.FS('unlink', `input.${audioExt}`)
      this.ffmpeg.FS('unlink', 'output.mp4')

      return outputData.buffer
    } catch (error) {
      throw new Error(`影片合併失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      this.progressCallback = null
    }
  }

  /**
   * 釋放資源
   */
  dispose(): void {
    if (this.ffmpeg) {
      try {
        this.ffmpeg.exit()
      } catch {
        // 忽略錯誤
      }
      this.ffmpeg = null
      this.loadingPromise = null
    }
  }
}

export const ffmpegService = new FFmpegService()
export default ffmpegService
