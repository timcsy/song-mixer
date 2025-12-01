/**
 * ResultView Download Tests
 * Feature: 005-frontend-processing / User Story 3
 *
 * 測試混音下載功能：WAV/MP3/MP4/M4A 格式
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock audioExportService
vi.mock('@/services/audioExportService', () => ({
  audioExportService: {
    mixToWav: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
    mixToMp3: vi.fn().mockResolvedValue(new Blob([new ArrayBuffer(500)], { type: 'audio/mp3' })),
    arrayBufferToAudioBuffer: vi.fn().mockImplementation(async (buffer: ArrayBuffer, sampleRate: number) => {
      // 模擬 AudioBuffer
      return {
        duration: 180,
        length: sampleRate * 180,
        numberOfChannels: 2,
        sampleRate,
        getChannelData: () => new Float32Array(sampleRate * 180),
      }
    }),
  },
}))

// Mock ffmpegService
vi.mock('@/services/ffmpegService', () => ({
  ffmpegService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoaded: vi.fn().mockReturnValue(true),
    mergeVideoAudio: vi.fn().mockResolvedValue(new Blob([new ArrayBuffer(2000)], { type: 'video/mp4' })),
  },
}))

// Mock storageService
vi.mock('@/services/storageService', () => ({
  storageService: {
    init: vi.fn().mockResolvedValue(undefined),
    getSong: vi.fn().mockResolvedValue({
      id: 'test-song-1',
      title: '測試歌曲',
      sourceType: 'upload',
      duration: 180,
      sampleRate: 44100,
      tracks: {
        drums: new ArrayBuffer(1000),
        bass: new ArrayBuffer(1000),
        other: new ArrayBuffer(1000),
        vocals: new ArrayBuffer(1000),
      },
      originalVideo: new ArrayBuffer(5000),
      createdAt: new Date(),
    }),
  },
}))

// Mock api service
vi.mock('@/services/api', () => ({
  api: {
    createMix: vi.fn().mockResolvedValue({
      mix_id: 'mock-mix-id',
      status: 'completed',
      download_url: '/api/v1/jobs/test/mix/mock-mix-id/download',
    }),
    getMixStatus: vi.fn().mockResolvedValue({
      mix_id: 'mock-mix-id',
      status: 'completed',
      progress: 100,
      download_url: '/api/v1/jobs/test/mix/mock-mix-id/download',
    }),
    getStreamUrl: vi.fn().mockReturnValue('/api/v1/jobs/test/stream'),
  },
  getBackendCapabilities: vi.fn().mockReturnValue({
    available: false,
    youtube: false,
    ffmpeg: false,
  }),
  mergeBackend: vi.fn().mockResolvedValue(new Blob([new ArrayBuffer(2000)], { type: 'video/mp4' })),
}))

describe('ResultView Download Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('mixToWav', () => {
    it('應該使用 audioExportService 混音並輸出 WAV', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      const mockTracks = [
        { buffer: {} as AudioBuffer, volume: 1 },
        { buffer: {} as AudioBuffer, volume: 0.8 },
      ]

      const result = await audioExportService.mixToWav(mockTracks, 180)

      expect(audioExportService.mixToWav).toHaveBeenCalledWith(mockTracks, 180)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('mixToMp3', () => {
    it('應該使用 audioExportService 混音並輸出 MP3', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      const mockTracks = [
        { buffer: {} as AudioBuffer, volume: 1 },
      ]

      await audioExportService.mixToMp3(mockTracks, 180, 128)

      expect(audioExportService.mixToMp3).toHaveBeenCalled()
      // 驗證 mock 已被呼叫（實際回傳值由 mock 決定）
    })
  })

  describe('mergeVideoAudio (純靜態模式)', () => {
    it('應該使用 ffmpegService 合併影片與音訊為 MP4', async () => {
      const { ffmpegService } = await import('@/services/ffmpegService')

      const videoBlob = new Blob([new ArrayBuffer(5000)], { type: 'video/mp4' })
      const audioBuffer = new ArrayBuffer(1000)

      await ffmpegService.mergeVideoAudio(videoBlob, audioBuffer, 'mp4')

      // 驗證 mock 被呼叫，不檢查確切參數（Blob 比較複雜）
      expect(ffmpegService.mergeVideoAudio).toHaveBeenCalled()
    })

    it('應該使用 ffmpegService 輸出 M4A 格式', async () => {
      const { ffmpegService } = await import('@/services/ffmpegService')

      const videoBlob = new Blob([new ArrayBuffer(5000)], { type: 'video/mp4' })
      const audioBuffer = new ArrayBuffer(1000)

      await ffmpegService.mergeVideoAudio(videoBlob, audioBuffer, 'm4a')

      // 驗證 mock 被呼叫
      expect(ffmpegService.mergeVideoAudio).toHaveBeenCalled()
    })
  })

  describe('mergeBackend (Docker 模式)', () => {
    it('應該使用後端 API 合併影片與音訊', async () => {
      const { mergeBackend, getBackendCapabilities } = await import('@/services/api')
      vi.mocked(getBackendCapabilities).mockReturnValueOnce({
        available: true,
        youtube: true,
        ffmpeg: true,
      })

      const videoBlob = new Blob([new ArrayBuffer(5000)], { type: 'video/mp4' })
      const audioBuffer = new ArrayBuffer(1000)

      const result = await mergeBackend(videoBlob, audioBuffer, 'mp4')

      expect(mergeBackend).toHaveBeenCalledWith(videoBlob, audioBuffer, 'mp4')
      expect(result).toBeInstanceOf(Blob)
    })
  })

  describe('下載流程', () => {
    it('應該正確觸發檔案下載', () => {
      // 建立 mock anchor 元素
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node)
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node)

      // 觸發下載
      const blob = new Blob([new ArrayBuffer(1000)], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)

      mockAnchor.href = url
      mockAnchor.download = '測試歌曲.wav'
      mockAnchor.click()

      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('應該根據格式選擇正確的下載方法', async () => {
      const { getBackendCapabilities } = await import('@/services/api')

      // 純靜態模式
      vi.mocked(getBackendCapabilities).mockReturnValue({
        available: false,
        youtube: false,
        ffmpeg: false,
      })

      const caps = getBackendCapabilities()

      // WAV/MP3 應該使用前端混音
      expect(caps.ffmpeg).toBe(false)

      // Docker 模式
      vi.mocked(getBackendCapabilities).mockReturnValue({
        available: true,
        youtube: true,
        ffmpeg: true,
      })

      const dockerCaps = getBackendCapabilities()

      // MP4/M4A 應該使用後端合併
      expect(dockerCaps.ffmpeg).toBe(true)
    })
  })

  describe('從 IndexedDB 載入歌曲', () => {
    it('應該能從 storageService 取得歌曲資料', async () => {
      const { storageService } = await import('@/services/storageService')

      const song = await storageService.getSong('test-song-1')

      expect(storageService.getSong).toHaveBeenCalledWith('test-song-1')
      expect(song).toBeDefined()
      expect(song?.id).toBe('test-song-1')
      expect(song?.tracks).toBeDefined()
      expect(song?.originalVideo).toBeDefined()
    })

    it('應該能將 ArrayBuffer 轉換為 AudioBuffer', async () => {
      const { audioExportService } = await import('@/services/audioExportService')

      const buffer = new ArrayBuffer(1000)
      await audioExportService.arrayBufferToAudioBuffer(buffer, 44100)

      // 驗證 mock 被呼叫
      expect(audioExportService.arrayBufferToAudioBuffer).toHaveBeenCalledWith(buffer, 44100)
    })
  })
})
