/**
 * 瀏覽器相容性檢查工具
 * Feature: 005-frontend-processing
 */

import type { BrowserCapabilities } from '@/types/storage'

/**
 * 瀏覽器相容性檢查服務
 */
export const browserCheck = {
  /**
   * 檢查瀏覽器功能支援
   */
  check(): BrowserCapabilities {
    return {
      sharedArrayBuffer: this.checkSharedArrayBuffer(),
      webGPU: this.checkWebGPU(),
      indexedDB: this.checkIndexedDB(),
      serviceWorker: this.checkServiceWorker(),
    }
  },

  /**
   * 檢查是否支援核心功能
   * @returns true 如果 SharedArrayBuffer 和 IndexedDB 可用
   */
  isSupported(): boolean {
    return this.checkSharedArrayBuffer() && this.checkIndexedDB()
  },

  /**
   * 取得不支援的功能警告訊息
   */
  getWarnings(): string[] {
    const warnings: string[] = []
    const capabilities = this.check()

    if (!capabilities.sharedArrayBuffer) {
      warnings.push(
        '您的瀏覽器不支援 SharedArrayBuffer，無法使用本服務。請使用 Chrome 92+、Firefox 79+ 或 Safari 15.2+ 版本。'
      )
    }

    if (!capabilities.indexedDB) {
      warnings.push('您的瀏覽器不支援 IndexedDB，無法儲存處理結果。')
    }

    if (!capabilities.webGPU && capabilities.sharedArrayBuffer) {
      warnings.push(
        '您的瀏覽器不支援 WebGPU，將使用較慢的 WASM 模式進行處理。'
      )
    }

    if (!capabilities.serviceWorker) {
      warnings.push(
        'Service Worker 不可用，部分離線功能可能受限。'
      )
    }

    return warnings
  },

  /**
   * 檢查 SharedArrayBuffer 支援
   */
  checkSharedArrayBuffer(): boolean {
    try {
      // 檢查 crossOriginIsolated（COOP/COEP headers）
      if (typeof window !== 'undefined' && window.crossOriginIsolated === true) {
        return true
      }

      // 檢查 SharedArrayBuffer 是否存在且可建構
      if (typeof SharedArrayBuffer !== 'undefined') {
        new SharedArrayBuffer(1)
        return true
      }

      return false
    } catch {
      return false
    }
  },

  /**
   * 檢查 WebGPU 支援
   */
  checkWebGPU(): boolean {
    try {
      return typeof navigator !== 'undefined' && 'gpu' in navigator
    } catch {
      return false
    }
  },

  /**
   * 檢查 IndexedDB 支援
   */
  checkIndexedDB(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null
    } catch {
      return false
    }
  },

  /**
   * 檢查 Service Worker 支援
   */
  checkServiceWorker(): boolean {
    try {
      return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    } catch {
      return false
    }
  },
}

export default browserCheck
