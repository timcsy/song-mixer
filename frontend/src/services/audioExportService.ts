/**
 * 音訊匯出服務
 * Feature: 005-frontend-processing
 *
 * 使用 Web Audio API 進行混音輸出（WAV）
 * MP3/M4A 編碼由 ffmpegService 處理
 */

import { int16BufferToStereoFloat32 } from '@/utils/format'

/**
 * 音訊匯出服務
 */
class AudioExportService {
  /**
   * 混音並輸出為 WAV
   */
  async mixToWav(
    tracks: Array<{ buffer: AudioBuffer; volume: number }>,
    duration: number,
    sampleRate = 44100
  ): Promise<ArrayBuffer> {
    const length = Math.ceil(duration * sampleRate)
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate)

    for (const track of tracks) {
      const source = offlineCtx.createBufferSource()
      source.buffer = track.buffer

      const gain = offlineCtx.createGain()
      gain.gain.value = track.volume

      source.connect(gain)
      gain.connect(offlineCtx.destination)
      source.start(0)
    }

    const renderedBuffer = await offlineCtx.startRendering()
    return this.audioBufferToWav(renderedBuffer)
  }

  /**
   * 將 ArrayBuffer (Int16 立體聲) 轉換為 AudioBuffer
   */
  async arrayBufferToAudioBuffer(
    buffer: ArrayBuffer,
    sampleRate: number
  ): Promise<AudioBuffer> {
    // 從 Int16 格式還原為 Float32
    const { left: leftData, right: rightData } = int16BufferToStereoFloat32(buffer)

    const audioCtx = new AudioContext()
    const audioBuffer = audioCtx.createBuffer(2, leftData.length, sampleRate)

    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)

    // 複製資料到 AudioBuffer
    left.set(leftData)
    right.set(rightData)

    audioCtx.close()
    return audioBuffer
  }

  /**
   * 將 AudioBuffer 轉換為 WAV ArrayBuffer
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16

    const bytesPerSample = bitDepth / 8
    const blockAlign = numChannels * bytesPerSample
    const dataSize = buffer.length * blockAlign
    const headerSize = 44

    const arrayBuffer = new ArrayBuffer(headerSize + dataSize)
    const view = new DataView(arrayBuffer)

    // RIFF header
    this.writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    this.writeString(view, 8, 'WAVE')

    // fmt chunk
    this.writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true) // chunk size
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)

    // data chunk
    this.writeString(view, 36, 'data')
    view.setUint32(40, dataSize, true)

    // 交錯寫入音訊資料
    let offset = 44
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }

    return arrayBuffer
  }

  /**
   * 寫入字串到 DataView
   */
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }
}

export const audioExportService = new AudioExportService()
export default audioExportService
