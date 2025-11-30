/**
 * useLocalProcessor Composable Unit Tests
 * TDD: 先寫測試，確保測試 FAIL 後再實作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 建立有效的 WAV buffer
function createValidWavBuffer(): ArrayBuffer {
  // 建立最小的有效 WAV 檔案（44 byte header + 音頻資料）
  const sampleRate = 44100
  const numChannels = 2
  const bitsPerSample = 16
  const numSamples = 1024 // 每個聲道的樣本數
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  view.setUint8(0, 0x52) // 'R'
  view.setUint8(1, 0x49) // 'I'
  view.setUint8(2, 0x46) // 'F'
  view.setUint8(3, 0x46) // 'F'
  view.setUint32(4, 36 + dataSize, true) // file size - 8
  view.setUint8(8, 0x57) // 'W'
  view.setUint8(9, 0x41) // 'A'
  view.setUint8(10, 0x56) // 'V'
  view.setUint8(11, 0x45) // 'E'

  // fmt chunk
  view.setUint8(12, 0x66) // 'f'
  view.setUint8(13, 0x6d) // 'm'
  view.setUint8(14, 0x74) // 't'
  view.setUint8(15, 0x20) // ' '
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true) // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true) // block align
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  view.setUint8(36, 0x64) // 'd'
  view.setUint8(37, 0x61) // 'a'
  view.setUint8(38, 0x74) // 't'
  view.setUint8(39, 0x61) // 'a'
  view.setUint32(40, dataSize, true)

  // 填入靜音資料
  for (let i = 44; i < headerSize + dataSize; i++) {
    view.setUint8(i, 0)
  }

  return buffer
}

// Mock services
vi.mock('@/services/ffmpegService', () => ({
  ffmpegService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoaded: vi.fn().mockReturnValue(true),
    extractAudio: vi.fn().mockImplementation(() => Promise.resolve(createValidWavBuffer())),
  },
}))

vi.mock('@/services/demucsService', () => ({
  demucsService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoaded: vi.fn().mockReturnValue(true),
    separate: vi.fn().mockResolvedValue({
      drums: { left: new Float32Array(1024), right: new Float32Array(1024) },
      bass: { left: new Float32Array(1024), right: new Float32Array(1024) },
      other: { left: new Float32Array(1024), right: new Float32Array(1024) },
      vocals: { left: new Float32Array(1024), right: new Float32Array(1024) },
    }),
    stereoToArrayBuffer: vi.fn().mockReturnValue(new ArrayBuffer(2048)),
  },
}))

vi.mock('@/services/storageService', () => ({
  storageService: {
    init: vi.fn().mockResolvedValue(undefined),
    saveSong: vi.fn().mockResolvedValue(undefined),
    getSong: vi.fn().mockResolvedValue(null),
    getAllSongs: vi.fn().mockResolvedValue([]),
    deleteSong: vi.fn().mockResolvedValue(undefined),
    getStorageUsage: vi.fn().mockResolvedValue({ used: 0, quota: 1000000000 }), // 1GB
  },
}))

describe('useLocalProcessor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('processUpload()', () => {
    it('應該成功處理上傳的影片檔案', async () => {
      const { useLocalProcessor } = await import('@/composables/useLocalProcessor')
      const { processUpload, state } = useLocalProcessor()

      // 建立假的影片檔案
      const mockFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' })

      // Act
      const songId = await processUpload(mockFile, '測試歌曲')

      // Assert
      expect(songId).toBeDefined()
      expect(typeof songId).toBe('string')
      expect(state.value.stage).toBe('idle')
      expect(state.value.songId).toBe(songId)
    })

    it('應該依序更新處理階段', async () => {
      const { useLocalProcessor } = await import('@/composables/useLocalProcessor')
      const { processUpload, state } = useLocalProcessor()

      const stages: string[] = []

      // 監聽狀態變化
      const mockFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' })

      // 使用 onProgress callback 追蹤階段
      const processPromise = processUpload(mockFile, '測試歌曲', {
        onProgress: (s) => {
          if (!stages.includes(s.stage)) {
            stages.push(s.stage)
          }
        },
      })

      await processPromise

      // 應該經過這些階段：extracting → separating → saving → idle
      expect(stages).toContain('extracting')
      expect(stages).toContain('separating')
      expect(stages).toContain('saving')
    })

    it('應該在處理失敗時設定錯誤訊息', async () => {
      // 模擬 ffmpeg 失敗
      const ffmpegMock = await import('@/services/ffmpegService')
      vi.mocked(ffmpegMock.ffmpegService.extractAudio).mockRejectedValueOnce(
        new Error('音頻提取失敗')
      )

      const { useLocalProcessor } = await import('@/composables/useLocalProcessor')
      const { processUpload, state } = useLocalProcessor()

      const mockFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' })

      await expect(processUpload(mockFile, '測試歌曲')).rejects.toThrow()

      expect(state.value.error).toBeTruthy()
    })
  })

  describe('cancel()', () => {
    it('應該取消處理並重設狀態', async () => {
      const { useLocalProcessor } = await import('@/composables/useLocalProcessor')
      const { cancel, state } = useLocalProcessor()

      // 模擬處理中狀態
      state.value.stage = 'separating'
      state.value.progress = 50

      // Act
      cancel()

      // Assert
      expect(state.value.stage).toBe('idle')
      expect(state.value.progress).toBe(0)
      expect(state.value.error).toBeNull()
    })
  })

  describe('state', () => {
    it('應該有正確的初始狀態', async () => {
      const { useLocalProcessor } = await import('@/composables/useLocalProcessor')
      const { state } = useLocalProcessor()

      expect(state.value.stage).toBe('idle')
      expect(state.value.progress).toBe(0)
      expect(state.value.error).toBeNull()
      expect(state.value.songId).toBeUndefined()
    })
  })
})
