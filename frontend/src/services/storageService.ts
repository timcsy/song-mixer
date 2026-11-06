/**
 * IndexedDB 儲存服務
 * Feature: 005-frontend-processing
 *
 * 資料結構（v2）：
 * - songs store：歌曲 metadata（SongMeta），體積小，可一次全部讀取
 * - songData store：音軌與影片（SongData），體積大，只在需要時依 id 讀取
 *
 * v1 時 metadata 與音訊資料存在同一筆記錄中，列出歌曲時會把所有音訊
 * 一併載入記憶體，歌曲一多就會耗盡記憶體，因此 v2 拆成兩個 store。
 */

import type { SongRecord, SongMeta, SongData } from '@/types/storage'

const DB_NAME = 'sing-local-db'
const DB_VERSION = 2
const SONGS_STORE = 'songs'
const SONG_DATA_STORE = 'songData'

/**
 * 將完整歌曲記錄拆成 metadata 與音訊資料
 */
function splitSongRecord(song: SongRecord): { meta: SongMeta; data: SongData } {
  const { tracks, originalVideo, ...rest } = song
  return {
    meta: { ...rest, hasVideo: !!originalVideo },
    data: { id: song.id, tracks, originalVideo },
  }
}

/**
 * 歌曲列表排序：有 order 的依 order 由小到大；
 * 沒有 order 的（新加入或舊資料）排在最前面，彼此依建立時間由新到舊
 */
function compareSongOrder(a: SongMeta, b: SongMeta): number {
  const byCreatedDesc = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  const aHas = typeof a.order === 'number'
  const bHas = typeof b.order === 'number'
  if (!aHas && !bHas) return byCreatedDesc
  if (!aHas) return -1
  if (!bHas) return 1
  return (a.order as number) - (b.order as number) || byCreatedDesc
}

/**
 * 將 IDBRequest 包裝成 Promise
 */
function promisifyRequest<T>(request: IDBRequest<T>, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(`${errorMessage}: ${request.error?.message}`))
  })
}

/**
 * 等待 transaction 完成
 */
function waitForTransaction(transaction: IDBTransaction, errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error(`${errorMessage}: ${transaction.error?.message}`))
    transaction.onabort = () => reject(new Error(`${errorMessage}: ${transaction.error?.message ?? '交易中止'}`))
  })
}

/**
 * v1 → v2 遷移：把 songs store 內的音訊資料搬到 songData store
 * 使用 cursor 逐筆處理，同一時間只有一首歌的資料在記憶體中
 */
function migrateV1ToV2(transaction: IDBTransaction): void {
  const songsStore = transaction.objectStore(SONGS_STORE)
  const dataStore = transaction.objectStore(SONG_DATA_STORE)
  const cursorRequest = songsStore.openCursor()

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) return

    const record = cursor.value as SongRecord & { hasVideo?: boolean }
    if (record.tracks) {
      const { meta, data } = splitSongRecord(record)
      dataStore.put(data)
      cursor.update(meta)
    }
    cursor.continue()
  }
}

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

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        reject(new Error(`無法開啟 IndexedDB: ${request.error?.message}`))
      }

      request.onblocked = () => {
        console.warn('IndexedDB 升級被其他分頁阻擋，請關閉其他開啟此應用的分頁')
      }

      request.onsuccess = () => {
        this.db = request.result
        // 其他分頁要升級資料庫時，主動關閉連線避免阻擋
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
          this.initPromise = null
        }
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = request.result
        const transaction = request.transaction!
        const oldVersion = event.oldVersion

        // 建立 songs store（metadata）
        if (!db.objectStoreNames.contains(SONGS_STORE)) {
          const store = db.createObjectStore(SONGS_STORE, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('title', 'title', { unique: false })
        }

        // 建立 songData store（音訊資料）
        if (!db.objectStoreNames.contains(SONG_DATA_STORE)) {
          db.createObjectStore(SONG_DATA_STORE, { keyPath: 'id' })
        }

        // v1 → v2：拆分既有資料
        if (oldVersion >= 1 && oldVersion < 2) {
          migrateV1ToV2(transaction)
        }
      }
    }).catch((err) => {
      // 失敗時允許重試
      this.initPromise = null
      throw err
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
   * 儲存歌曲記錄（metadata 與音訊資料在同一個 transaction 寫入）
   */
  async saveSong(song: SongRecord): Promise<void> {
    const db = await this.ensureInit()
    const { meta, data } = splitSongRecord(song)

    const transaction = db.transaction([SONGS_STORE, SONG_DATA_STORE], 'readwrite')
    const songsStore = transaction.objectStore(SONGS_STORE)
    transaction.objectStore(SONG_DATA_STORE).put(data)

    // 覆寫既有歌曲（例如匯入時取代）時保留原本在列表中的位置
    const existing = await promisifyRequest<SongMeta | undefined>(songsStore.get(meta.id), '儲存歌曲失敗')
    if (meta.order === undefined && typeof existing?.order === 'number') {
      meta.order = existing.order
    }
    songsStore.put(meta)
    await waitForTransaction(transaction, '儲存歌曲失敗')
  }

  /**
   * 取得單首歌曲的 metadata（不含音訊資料）
   */
  async getSongMeta(id: string): Promise<SongMeta | null> {
    const db = await this.ensureInit()
    const store = db.transaction([SONGS_STORE], 'readonly').objectStore(SONGS_STORE)
    const result = await promisifyRequest<SongMeta | undefined>(store.get(id), '取得歌曲失敗')
    return result || null
  }

  /**
   * 取得單首歌曲的完整資料（含音軌與影片）
   * 注意：資料量很大，只在播放、匯出時使用，用完不要長期保留引用
   */
  async getSong(id: string): Promise<SongRecord | null> {
    const db = await this.ensureInit()
    const transaction = db.transaction([SONGS_STORE, SONG_DATA_STORE], 'readonly')

    const [meta, data] = await Promise.all([
      promisifyRequest<SongMeta | undefined>(
        transaction.objectStore(SONGS_STORE).get(id),
        '取得歌曲失敗'
      ),
      promisifyRequest<SongData | undefined>(
        transaction.objectStore(SONG_DATA_STORE).get(id),
        '取得歌曲資料失敗'
      ),
    ])

    if (!meta || !data) {
      return null
    }

    const { hasVideo: _hasVideo, ...rest } = meta
    return {
      ...rest,
      tracks: data.tracks,
      originalVideo: data.originalVideo,
    }
  }

  /**
   * 取得所有歌曲的 metadata（依列表自訂順序排列）
   * 不含音訊資料，歌曲數量多時也不會佔用大量記憶體
   */
  async getAllSongMetas(): Promise<SongMeta[]> {
    const db = await this.ensureInit()
    const store = db.transaction([SONGS_STORE], 'readonly').objectStore(SONGS_STORE)
    const songs = await promisifyRequest<SongMeta[]>(store.getAll(), '取得歌曲列表失敗')
    return songs.sort(compareSongOrder)
  }

  /**
   * 設定歌曲列表順序
   * @param orderedIds 依新順序排列的歌曲 id；未列出的歌曲維持原本的 order
   */
  async setSongOrder(orderedIds: string[]): Promise<void> {
    const db = await this.ensureInit()
    const orderById = new Map(orderedIds.map((id, index) => [id, index]))

    const transaction = db.transaction([SONGS_STORE], 'readwrite')
    const request = transaction.objectStore(SONGS_STORE).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const meta = cursor.value as SongMeta
      const order = orderById.get(meta.id)
      if (order !== undefined && meta.order !== order) {
        cursor.update({ ...meta, order })
      }
      cursor.continue()
    }
    await waitForTransaction(transaction, '儲存歌曲順序失敗')
  }

  /**
   * 刪除歌曲（metadata 與音訊資料）
   */
  async deleteSong(id: string): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction([SONGS_STORE, SONG_DATA_STORE], 'readwrite')
    transaction.objectStore(SONGS_STORE).delete(id)
    transaction.objectStore(SONG_DATA_STORE).delete(id)
    await waitForTransaction(transaction, '刪除歌曲失敗')
  }

  /**
   * 重新命名歌曲（只更新 metadata，不讀取音訊資料）
   */
  async renameSong(id: string, newTitle: string): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction([SONGS_STORE], 'readwrite')
    const store = transaction.objectStore(SONGS_STORE)

    const meta = await promisifyRequest<SongMeta | undefined>(store.get(id), '取得歌曲失敗')
    if (!meta) {
      throw new Error('歌曲不存在')
    }

    store.put({ ...meta, title: newTitle })
    await waitForTransaction(transaction, '重新命名歌曲失敗')
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
    const transaction = db.transaction([SONGS_STORE, SONG_DATA_STORE], 'readwrite')
    transaction.objectStore(SONGS_STORE).clear()
    transaction.objectStore(SONG_DATA_STORE).clear()
    await waitForTransaction(transaction, '清除資料失敗')
  }
}

export const storageService = new StorageService()
export type { SongRecord, SongMeta }
export default storageService
