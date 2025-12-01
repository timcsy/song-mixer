# Data Model: 純前端人聲去除服務架構改造

**Date**: 2025-12-01
**Feature**: 005-frontend-processing

## 實體定義

### SongRecord

已處理歌曲的完整記錄，儲存於 IndexedDB。

```typescript
interface SongRecord {
  // 識別
  id: string;                          // UUID v4

  // 基本資訊
  title: string;                       // 歌曲標題
  sourceType: 'youtube' | 'upload';    // 來源類型
  sourceUrl?: string;                  // YouTube URL（僅 youtube 類型）
  thumbnailUrl?: string;               // 縮圖 URL（選填）

  // 音訊屬性
  duration: number;                    // 時長（秒）
  sampleRate: 44100;                   // 固定 44.1kHz

  // 分離後音軌（立體聲，Float32 編碼為 ArrayBuffer）
  tracks: {
    drums: ArrayBuffer;                // 鼓組
    bass: ArrayBuffer;                 // 貝斯
    other: ArrayBuffer;                // 其他樂器
    vocals: ArrayBuffer;               // 人聲
  };

  // 原始影片（用於 MP4 下載合併）
  originalVideo?: ArrayBuffer;

  // 時間戳記
  createdAt: Date;
}
```

**Validation Rules**:
- `id`: 必填，UUID v4 格式
- `title`: 必填，非空字串
- `sourceType`: 必填，限定 'youtube' | 'upload'
- `duration`: 必填，正數
- `tracks`: 必填，四軌皆須存在
- `createdAt`: 必填，有效 Date

**Indexes**:
- Primary Key: `id`
- Index: `createdAt` (排序用)
- Index: `title` (搜尋用)

---

### ProcessingState

處理進度的即時狀態（記憶體內，不持久化）。

```typescript
interface ProcessingState {
  stage: 'idle' | 'downloading' | 'extracting' | 'separating' | 'saving';
  progress: number;        // 0-100
  error: string | null;
  songId?: string;         // 處理完成後的 SongRecord.id
}
```

**State Transitions**:

```
idle → downloading → extracting → separating → saving → idle (success)
                                                     ↘ idle (error)
```

| From | To | Trigger |
|------|----|---------|
| idle | downloading | 開始 YouTube 下載（Docker 模式）|
| idle | extracting | 開始本地檔案處理 |
| downloading | extracting | 下載完成 |
| extracting | separating | 音頻提取完成 |
| separating | saving | 分離完成 |
| saving | idle | 儲存完成（設定 songId）|
| * | idle | 發生錯誤（設定 error）|

---

### MixerSettings

混音器即時設定（記憶體內）。

```typescript
interface MixerSettings {
  drums: TrackSettings;
  bass: TrackSettings;
  other: TrackSettings;
  vocals: TrackSettings;
  pitchShift: number;      // -12 to +12 semitones
  masterVolume: number;    // 0-1
}

interface TrackSettings {
  volume: number;          // 0-1
  muted: boolean;
  solo: boolean;
}
```

---

### ExportRequest

匯出下載請求。

```typescript
interface ExportRequest {
  songId: string;
  format: 'mp4' | 'mp3' | 'm4a' | 'wav';
  mixerSettings: MixerSettings;
}
```

**Format Processing**:

| Format | 純靜態模式 | Docker 模式 |
|--------|-----------|-------------|
| wav | Web Audio API | Web Audio API |
| mp3 | lamejs | lamejs |
| m4a | ffmpeg.wasm | 後端 FFmpeg |
| mp4 | ffmpeg.wasm | 後端 FFmpeg |

---

### BackendCapabilities

後端功能偵測結果。

```typescript
interface BackendCapabilities {
  available: boolean;      // /api/v1/health 是否可達
  youtube: boolean;        // YouTube 下載功能
  ffmpeg: boolean;         // 後端 FFmpeg 處理
}
```

---

### BrowserCapabilities

瀏覽器功能偵測結果。

```typescript
interface BrowserCapabilities {
  sharedArrayBuffer: boolean;  // SharedArrayBuffer 支援
  webGPU: boolean;             // WebGPU 支援（影響分離效能）
  indexedDB: boolean;          // IndexedDB 支援
  serviceWorker: boolean;      // Service Worker 支援
}
```

---

## IndexedDB Schema

```typescript
const DB_NAME = 'sing-local-db';
const DB_VERSION = 1;

const schema = {
  songs: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'createdAt', keyPath: 'createdAt', options: {} },
      { name: 'title', keyPath: 'title', options: {} }
    ]
  }
};
```

**Storage Estimation**:

| 項目 | 大小估計 |
|------|---------|
| 1 首歌 (3 min) 原始影片 | ~50MB |
| 4 軌分離音頻 (3 min, 44.1kHz, 32-bit) | ~32MB |
| **總計 / 首** | **~82MB** |

建議單一瀏覽器儲存 1-3 首歌曲。

---

## 關係圖

```
┌─────────────────┐
│  SongRecord     │
│  (IndexedDB)    │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐
│  MixerSettings  │
│  (Memory)       │
└─────────────────┘

┌─────────────────┐
│ ProcessingState │
│   (Memory)      │
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│BackendCapabilities│   │BrowserCapabilities│
│   (Memory)      │     │   (Memory)      │
└─────────────────┘     └─────────────────┘
```
