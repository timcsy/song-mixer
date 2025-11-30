/**
 * 音訊匯出服務
 * Feature: 005-frontend-processing
 *
 * 使用 Web Audio API 和 lamejs 進行混音輸出
 */

import lamejs from 'lamejs'

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
   * 混音並輸出為 MP3
   */
  async mixToMp3(
    tracks: Array<{ buffer: AudioBuffer; volume: number }>,
    duration: number,
    bitrate = 128
  ): Promise<Blob> {
    // 先混音為 WAV
    const wavBuffer = await this.mixToWav(tracks, duration)

    // 解析 WAV 資料
    const audioBuffer = await this.wavToAudioBuffer(wavBuffer)

    // 使用 lamejs 編碼為 MP3
    return this.encodeToMp3(audioBuffer, bitrate)
  }

  /**
   * 將 ArrayBuffer (Float32 立體聲) 轉換為 AudioBuffer
   */
  async arrayBufferToAudioBuffer(
    buffer: ArrayBuffer,
    sampleRate: number
  ): Promise<AudioBuffer> {
    const float32 = new Float32Array(buffer)
    const samplesPerChannel = float32.length / 2
    const audioCtx = new AudioContext()
    const audioBuffer = audioCtx.createBuffer(2, samplesPerChannel, sampleRate)

    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)

    // 解交錯
    for (let i = 0; i < samplesPerChannel; i++) {
      left[i] = float32[i * 2]
      right[i] = float32[i * 2 + 1]
    }

    audioCtx.close()
    return audioBuffer
  }

  /**
   * 將 WAV ArrayBuffer 轉換為 AudioBuffer
   */
  private async wavToAudioBuffer(wavBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(wavBuffer)
    audioCtx.close()
    return audioBuffer
  }

  /**
   * 使用 lamejs 編碼為 MP3
   */
  private encodeToMp3(audioBuffer: AudioBuffer, bitrate: number): Blob {
    const channels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate)

    const mp3Data: Uint8Array[] = []
    const sampleBlockSize = 1152

    if (channels === 1) {
      // Mono
      const samples = this.float32ToInt16(audioBuffer.getChannelData(0))
      for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const chunk = samples.subarray(i, i + sampleBlockSize)
        const mp3Chunk = encoder.encodeBuffer(chunk)
        if (mp3Chunk.length > 0) mp3Data.push(new Uint8Array(mp3Chunk))
      }
    } else {
      // Stereo
      const left = this.float32ToInt16(audioBuffer.getChannelData(0))
      const right = this.float32ToInt16(audioBuffer.getChannelData(1))
      for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize)
        const rightChunk = right.subarray(i, i + sampleBlockSize)
        const mp3Chunk = encoder.encodeBuffer(leftChunk, rightChunk)
        if (mp3Chunk.length > 0) mp3Data.push(new Uint8Array(mp3Chunk))
      }
    }

    const finalChunk = encoder.flush()
    if (finalChunk.length > 0) mp3Data.push(new Uint8Array(finalChunk))

    // 合併所有 Uint8Array 為單一 ArrayBuffer
    const totalLength = mp3Data.reduce((acc, arr) => acc + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of mp3Data) {
      result.set(arr, offset)
      offset += arr.length
    }

    return new Blob([result.buffer], { type: 'audio/mp3' })
  }

  /**
   * Float32 轉 Int16
   */
  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return int16
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
