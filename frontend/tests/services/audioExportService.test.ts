/**
 * AudioExportService Unit Tests
 * TDD: 先寫測試，確保測試 FAIL 後再實作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('AudioExportService', () => {
  // Mock AudioContext
  let mockAudioContext: any
  let mockOfflineAudioContext: any

  beforeEach(() => {
    vi.resetModules()

    // Mock OfflineAudioContext
    mockOfflineAudioContext = vi.fn().mockImplementation((channels, length, sampleRate) => ({
      sampleRate,
      length,
      destination: {},
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: { value: 1 },
        connect: vi.fn(),
      }),
      startRendering: vi.fn().mockResolvedValue({
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 44100 * 10, // 10 seconds
        getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
      }),
    }))

    vi.stubGlobal('OfflineAudioContext', mockOfflineAudioContext)

    // Mock AudioContext
    mockAudioContext = vi.fn().mockImplementation(() => ({
      sampleRate: 44100,
      decodeAudioData: vi.fn().mockResolvedValue({
        numberOfChannels: 2,
        sampleRate: 44100,
        length: 44100 * 10,
        duration: 10,
        getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
      }),
      createBuffer: vi.fn().mockImplementation((channels: number, length: number, sampleRate: number) => ({
        numberOfChannels: channels,
        sampleRate,
        length,
        duration: length / sampleRate,
        getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
      })),
      close: vi.fn().mockResolvedValue(undefined),
    }))

    vi.stubGlobal('AudioContext', mockAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('mixToWav()', () => {
    it('應該將多軌音訊混音並輸出為 WAV ArrayBuffer', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      // 建立假的 AudioBuffer
      const mockTracks = [
        {
          buffer: {
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100 * 10,
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
          } as unknown as AudioBuffer,
          volume: 1.0,
        },
        {
          buffer: {
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100 * 10,
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
          } as unknown as AudioBuffer,
          volume: 0.5,
        },
      ]

      const result = await audioExportService.mixToWav(mockTracks, 10)

      // Assert
      expect(result).toBeInstanceOf(ArrayBuffer)
      // WAV 檔案應該有正確的 header (RIFF)
      const view = new DataView(result)
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
      expect(riff).toBe('RIFF')
    })

    it('應該使用指定的取樣率', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      const mockTracks = [
        {
          buffer: {
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100 * 10,
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
          } as unknown as AudioBuffer,
          volume: 1.0,
        },
      ]

      await audioExportService.mixToWav(mockTracks, 10, 48000)

      // 確認 OfflineAudioContext 使用正確的取樣率
      expect(mockOfflineAudioContext).toHaveBeenCalledWith(2, expect.any(Number), 48000)
    })
  })

  describe('mixToMp3()', () => {
    it('應該將多軌音訊混音並輸出為 MP3 Blob', async () => {
      // 需要 mock lamejs
      vi.doMock('lamejs', () => ({
        default: {
          Mp3Encoder: vi.fn().mockImplementation(() => ({
            encodeBuffer: vi.fn().mockReturnValue(new Int8Array([0, 1, 2])),
            flush: vi.fn().mockReturnValue(new Int8Array([3, 4, 5])),
          })),
        },
      }))

      const { audioExportService } = await import('@/services/audioExportService')

      const mockTracks = [
        {
          buffer: {
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100 * 10,
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
          } as unknown as AudioBuffer,
          volume: 1.0,
        },
      ]

      const result = await audioExportService.mixToMp3(mockTracks, 10, 128)

      expect(result).toBeInstanceOf(Blob)
      expect(result.type).toBe('audio/mp3')
    })

    it('應該使用指定的 bitrate', async () => {
      vi.doMock('lamejs', () => ({
        default: {
          Mp3Encoder: vi.fn().mockImplementation((channels, sampleRate, bitrate) => {
            expect(bitrate).toBe(320)
            return {
              encodeBuffer: vi.fn().mockReturnValue(new Int8Array([0, 1, 2])),
              flush: vi.fn().mockReturnValue(new Int8Array([3, 4, 5])),
            }
          }),
        },
      }))

      const { audioExportService } = await import('@/services/audioExportService')

      const mockTracks = [
        {
          buffer: {
            numberOfChannels: 2,
            sampleRate: 44100,
            length: 44100 * 10,
            duration: 10,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(44100 * 10)),
          } as unknown as AudioBuffer,
          volume: 1.0,
        },
      ]

      await audioExportService.mixToMp3(mockTracks, 10, 320)
    })
  })

  describe('arrayBufferToAudioBuffer()', () => {
    it('應該將 ArrayBuffer 轉換為 AudioBuffer', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      // 建立一個簡單的 Float32 立體聲 ArrayBuffer
      const sampleCount = 44100 // 1 秒
      const float32Array = new Float32Array(sampleCount * 2) // 立體聲
      for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] = Math.sin(i * 0.01) // 簡單的正弦波
      }

      const result = await audioExportService.arrayBufferToAudioBuffer(
        float32Array.buffer,
        44100
      )

      expect(result).toBeDefined()
      expect(result.sampleRate).toBe(44100)
      expect(result.numberOfChannels).toBe(2)
    })

    it('應該正確處理不同的取樣率', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      const sampleCount = 48000
      const float32Array = new Float32Array(sampleCount * 2)

      const result = await audioExportService.arrayBufferToAudioBuffer(
        float32Array.buffer,
        48000
      )

      expect(result.sampleRate).toBe(48000)
    })
  })
})
