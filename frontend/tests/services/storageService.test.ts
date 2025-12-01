/**
 * StorageService Unit Tests
 *
 * NOTE: IndexedDB 測試需要完整的瀏覽器環境或 fake-indexeddb
 * 這裡僅測試基本介面存在性，完整測試在整合測試中進行
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('StorageService', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('介面檢查', () => {
    it('應該匯出 storageService 物件', async () => {
      const module = await import('@/services/storageService')

      expect(module.storageService).toBeDefined()
    })

    it('應該有 init 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.init).toBe('function')
    })

    it('應該有 saveSong 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.saveSong).toBe('function')
    })

    it('應該有 getSong 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.getSong).toBe('function')
    })

    it('應該有 getAllSongs 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.getAllSongs).toBe('function')
    })

    it('應該有 deleteSong 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.deleteSong).toBe('function')
    })

    it('應該有 getStorageUsage 方法', async () => {
      const { storageService } = await import('@/services/storageService')

      expect(typeof storageService.getStorageUsage).toBe('function')
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
