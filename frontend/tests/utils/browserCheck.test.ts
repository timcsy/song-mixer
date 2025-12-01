/**
 * BrowserCheck Unit Tests
 * TDD: 先寫測試，確保測試 FAIL 後再實作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('BrowserCheck', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('check()', () => {
    it('應該偵測 SharedArrayBuffer 支援狀態', async () => {
      // Arrange: 模擬支援 SharedArrayBuffer
      vi.stubGlobal('crossOriginIsolated', true)
      vi.stubGlobal('SharedArrayBuffer', function SharedArrayBuffer() {})

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.sharedArrayBuffer).toBe(true)
    })

    it('應該偵測 SharedArrayBuffer 不支援狀態', async () => {
      // Arrange: 模擬不支援 SharedArrayBuffer
      vi.stubGlobal('crossOriginIsolated', false)
      // 模擬 SharedArrayBuffer 建構時拋出錯誤
      vi.stubGlobal('SharedArrayBuffer', function() {
        throw new Error('SharedArrayBuffer is not available')
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.sharedArrayBuffer).toBe(false)
    })

    it('應該偵測 WebGPU 支援狀態', async () => {
      // Arrange: 模擬支援 WebGPU
      vi.stubGlobal('navigator', {
        gpu: {},
        storage: { estimate: vi.fn() },
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.webGPU).toBe(true)
    })

    it('應該偵測 WebGPU 不支援狀態', async () => {
      // Arrange: 模擬不支援 WebGPU
      vi.stubGlobal('navigator', {
        storage: { estimate: vi.fn() },
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.webGPU).toBe(false)
    })

    it('應該偵測 IndexedDB 支援狀態', async () => {
      // Arrange: 模擬支援 IndexedDB
      vi.stubGlobal('indexedDB', {})

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.indexedDB).toBe(true)
    })

    it('應該偵測 Service Worker 支援狀態', async () => {
      // Arrange: 模擬支援 Service Worker
      vi.stubGlobal('navigator', {
        serviceWorker: {},
        storage: { estimate: vi.fn() },
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      // Act
      const capabilities = browserCheck.check()

      // Assert
      expect(capabilities.serviceWorker).toBe(true)
    })
  })

  describe('isSupported()', () => {
    it('當 SharedArrayBuffer 可用時應該回傳 true', async () => {
      vi.stubGlobal('crossOriginIsolated', true)
      vi.stubGlobal('SharedArrayBuffer', function SharedArrayBuffer() {})
      vi.stubGlobal('indexedDB', {})

      const { browserCheck } = await import('@/utils/browserCheck')

      expect(browserCheck.isSupported()).toBe(true)
    })

    it('當 SharedArrayBuffer 不可用時應該回傳 false', async () => {
      vi.stubGlobal('crossOriginIsolated', false)

      const { browserCheck } = await import('@/utils/browserCheck')

      expect(browserCheck.isSupported()).toBe(false)
    })
  })

  describe('getWarnings()', () => {
    it('當所有功能都支援時應該回傳空陣列', async () => {
      vi.stubGlobal('crossOriginIsolated', true)
      vi.stubGlobal('SharedArrayBuffer', function SharedArrayBuffer() {})
      vi.stubGlobal('indexedDB', {})
      vi.stubGlobal('navigator', {
        gpu: {},
        serviceWorker: {},
        storage: { estimate: vi.fn() },
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      const warnings = browserCheck.getWarnings()

      expect(warnings).toEqual([])
    })

    it('當不支援 WebGPU 時應該回傳效能警告', async () => {
      vi.stubGlobal('crossOriginIsolated', true)
      vi.stubGlobal('SharedArrayBuffer', function SharedArrayBuffer() {})
      vi.stubGlobal('indexedDB', {})
      vi.stubGlobal('navigator', {
        serviceWorker: {},
        storage: { estimate: vi.fn() },
        // 沒有 gpu
      })

      const { browserCheck } = await import('@/utils/browserCheck')

      const warnings = browserCheck.getWarnings()

      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('WebGPU') || w.includes('WASM'))).toBe(true)
    })

    it('當不支援 SharedArrayBuffer 時應該回傳嚴重警告', async () => {
      vi.stubGlobal('crossOriginIsolated', false)
      vi.stubGlobal('indexedDB', {})

      const { browserCheck } = await import('@/utils/browserCheck')

      const warnings = browserCheck.getWarnings()

      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.includes('SharedArrayBuffer') || w.includes('瀏覽器'))).toBe(true)
    })
  })
})
