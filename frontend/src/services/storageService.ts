/**
 * IndexedDB 儲存服務
 * Feature: 005-frontend-processing
 */

import type { SongRecord } from '@/types/storage'

const DB_NAME = 'sing-local-db'
const DB_VERSION = 1
const SONGS_STORE = 'songs'

/**
 * IndexedDB 儲存服務
 */
class StorageService {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  /**
   * 初始化 IndexedDB 連線
   */
  async init(): Promise<void> {
    // 防止重複初始化
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        reject(new Error(`無法開啟 IndexedDB: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 建立 songs store
        if (!db.objectStoreNames.contains(SONGS_STORE)) {
          const store = db.createObjectStore(SONGS_STORE, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('title', 'title', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  /**
   * 確保資料庫已初始化
   */
  private async ensureInit(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) {
      throw new Error('IndexedDB 初始化失敗')
    }
    return this.db
  }

  /**
   * 儲存歌曲記錄
   */
  async saveSong(song: SongRecord): Promise<void> {
    const db = await this.ensureInit()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SONGS_STORE], 'readwrite')
      const store = transaction.objectStore(SONGS_STORE)
      const request = store.put(song)

      request.onerror = () => {
        reject(new Error(`儲存歌曲失敗: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        resolve()
      }
    })
  }

  /**
   * 取得單首歌曲
   */
  async getSong(id: string): Promise<SongRecord | null> {
    const db = await this.ensureInit()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SONGS_STORE], 'readonly')
      const store = transaction.objectStore(SONGS_STORE)
      const request = store.get(id)

      request.onerror = () => {
        reject(new Error(`取得歌曲失敗: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        resolve(request.result || null)
      }
    })
  }

  /**
   * 取得所有歌曲（依建立時間排序，最新在前）
   */
  async getAllSongs(): Promise<SongRecord[]> {
    const db = await this.ensureInit()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SONGS_STORE], 'readonly')
      const store = transaction.objectStore(SONGS_STORE)
      const index = store.index('createdAt')
      const request = index.openCursor(null, 'prev') // 降序排列

      const songs: SongRecord[] = []

      request.onerror = () => {
        reject(new Error(`取得歌曲列表失敗: ${request.error?.message}`))
      }

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          songs.push(cursor.value)
          cursor.continue()
        } else {
          resolve(songs)
        }
      }
    })
  }

  /**
   * 刪除歌曲
   */
  async deleteSong(id: string): Promise<void> {
    const db = await this.ensureInit()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SONGS_STORE], 'readwrite')
      const store = transaction.objectStore(SONGS_STORE)
      const request = store.delete(id)

      request.onerror = () => {
        reject(new Error(`刪除歌曲失敗: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        resolve()
      }
    })
  }

  /**
   * 重新命名歌曲
   */
  async renameSong(id: string, newTitle: string): Promise<void> {
    const song = await this.getSong(id)
    if (!song) {
      throw new Error('歌曲不存在')
    }

    song.title = newTitle
    await this.saveSong(song)
  }

  /**
   * 取得儲存使用量
   */
  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate()
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
        }
      }
    } catch {
      // 忽略錯誤
    }

    return { used: 0, quota: 0 }
  }

  /**
   * 清除所有資料（僅供測試使用）
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureInit()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SONGS_STORE], 'readwrite')
      const store = transaction.objectStore(SONGS_STORE)
      const request = store.clear()

      request.onerror = () => {
        reject(new Error(`清除資料失敗: ${request.error?.message}`))
      }

      request.onsuccess = () => {
        resolve()
      }
    })
  }
}

export const storageService = new StorageService()
export type { SongRecord }
export default storageService
