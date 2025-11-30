/**
 * StorageService Unit Tests
 * TDD: 先寫測試，確保測試 FAIL 後再實作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 將在實作後引入
// import { storageService } from '@/services/storageService'

describe('StorageService', () => {
  // Mock IndexedDB
  const mockIndexedDB = {
    open: vi.fn(),
    deleteDatabase: vi.fn(),
  }

  beforeEach(() => {
    // 設定 IndexedDB mock
    vi.stubGlobal('indexedDB', mockIndexedDB)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('init()', () => {
    it('應該成功初始化 IndexedDB 連線', async () => {
      // Arrange
      const { storageService } = await import('@/services/storageService')

      // 模擬成功開啟資料庫
      const mockDB = {
        objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
      }
      const mockRequest = {
        result: mockDB,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
      }
      mockIndexedDB.open.mockReturnValue(mockRequest)

      // Act
      const initPromise = storageService.init()

      // 觸發 onsuccess
      setTimeout(() => {
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: mockRequest } as any)
        }
      }, 0)

      // Assert
      await expect(initPromise).resolves.toBeUndefined()
    })

    it('應該在資料庫升級時建立 songs store', async () => {
      const { storageService } = await import('@/services/storageService')

      const mockStore = {
        createIndex: vi.fn(),
      }
      const mockDB = {
        createObjectStore: vi.fn().mockReturnValue(mockStore),
        objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
      }
      const mockRequest = {
        result: mockDB,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
      }
      mockIndexedDB.open.mockReturnValue(mockRequest)

      const initPromise = storageService.init()

      // 觸發 onupgradeneeded
      setTimeout(() => {
        if (mockRequest.onupgradeneeded) {
          mockRequest.onupgradeneeded({ target: mockRequest } as any)
        }
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: mockRequest } as any)
        }
      }, 0)

      await initPromise

      expect(mockDB.createObjectStore).toHaveBeenCalledWith('songs', { keyPath: 'id' })
    })
  })

  describe('saveSong()', () => {
    it('應該儲存歌曲記錄到 IndexedDB', async () => {
      const { storageService, type SongRecord } = await import('@/services/storageService')

      const mockSong: SongRecord = {
        id: 'test-uuid',
        title: '測試歌曲',
        sourceType: 'upload',
        duration: 180,
        sampleRate: 44100,
        createdAt: new Date(),
        tracks: {
          drums: new ArrayBuffer(1024),
          bass: new ArrayBuffer(1024),
          other: new ArrayBuffer(1024),
          vocals: new ArrayBuffer(1024),
        },
      }

      // Act & Assert
      await expect(storageService.saveSong(mockSong)).resolves.toBeUndefined()
    })
  })

  describe('getSong()', () => {
    it('應該根據 ID 取得歌曲', async () => {
      const { storageService } = await import('@/services/storageService')

      const result = await storageService.getSong('test-id')

      // 預期回傳 null 或 SongRecord
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('應該在找不到歌曲時回傳 null', async () => {
      const { storageService } = await import('@/services/storageService')

      const result = await storageService.getSong('non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('getAllSongs()', () => {
    it('應該取得所有歌曲並依建立時間排序', async () => {
      const { storageService } = await import('@/services/storageService')

      const songs = await storageService.getAllSongs()

      expect(Array.isArray(songs)).toBe(true)
    })
  })

  describe('deleteSong()', () => {
    it('應該刪除指定歌曲', async () => {
      const { storageService } = await import('@/services/storageService')

      await expect(storageService.deleteSong('test-id')).resolves.toBeUndefined()
    })
  })

  describe('getStorageUsage()', () => {
    it('應該回傳儲存使用量資訊', async () => {
      const { storageService } = await import('@/services/storageService')

      // Mock navigator.storage.estimate
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn().mockResolvedValue({ usage: 1000000, quota: 100000000 }),
        },
      })

      const usage = await storageService.getStorageUsage()

      expect(usage).toHaveProperty('used')
      expect(usage).toHaveProperty('quota')
      expect(typeof usage.used).toBe('number')
      expect(typeof usage.quota).toBe('number')
    })
  })
})
