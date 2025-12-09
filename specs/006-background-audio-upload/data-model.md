# Data Model: 背景播放與音檔上傳支援

**Date**: 2025-12-09
**Feature**: 006-background-audio-upload

## 實體定義

### SongRecord（現有，無需修改）

已存在於 `frontend/src/types/storage.ts`，本功能利用現有的 `originalVideo?: ArrayBuffer` 可選欄位。

```typescript
interface SongRecord {
  id: string                    // UUID v4
  title: string                 // 歌曲標題
  sourceType: 'youtube' | 'upload'  // 來源類型
  sourceUrl?: string            // YouTube URL（僅 YouTube 來源）
  thumbnailUrl?: string         // 縮圖 URL（僅 YouTube 來源）
  duration: number              // 時長（秒）
  sampleRate: number            // 取樣率（44100）
  tracks: {
    drums: ArrayBuffer          // 鼓聲軌
    bass: ArrayBuffer           // 貝斯軌
    other: ArrayBuffer          // 其他樂器軌
    vocals: ArrayBuffer         // 人聲軌
  }
  originalVideo?: ArrayBuffer   // 原始影片（音檔上傳時為 undefined）
  createdAt: Date               // 建立時間
  storageSize?: number          // 儲存大小（bytes）
}
```

**本功能行為**:
- 影片上傳：`originalVideo` 儲存原始影片
- 音檔上傳：`originalVideo` 為 `undefined`
- UI 根據 `originalVideo` 是否存在決定顯示模式

---

### ProcessingState（現有，無需修改）

已存在於 `frontend/src/types/storage.ts`，現有的 `stage` 已涵蓋所需狀態。

```typescript
interface ProcessingState {
  stage: 'idle' | 'downloading' | 'extracting' | 'separating' | 'saving'
  subStage: ProcessingSubStage | null
  progress: number              // 0-100
  subProgress: number           // 0-100
  message: string               // 詳細訊息
  error: string | null
  songId?: string
  sourceType?: 'youtube' | 'upload'
}
```

**本功能行為**:
- 音檔上傳使用 `extracting` 階段（訊息改為「轉換音檔格式」）
- 流程與影片上傳相同，僅訊息文字調整

---

## 狀態轉換

### 音檔處理流程

```
[選擇音檔] → extracting (轉換音檔格式) → separating (分離音軌) → saving → idle
```

### 影片處理流程（現有）

```
[選擇影片] → extracting (提取音頻) → separating (分離音軌) → saving → idle
```

---

## 新增常數

### 音檔副檔名列表

```typescript
const AUDIO_EXTENSIONS = [
  '.mp3', '.wav', '.flac', '.aac', '.m4a',
  '.ogg', '.wma', '.aiff', '.opus'
]
```

### 檔案 accept 屬性

```typescript
const FILE_ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.flac,.aac,.m4a,.ogg,.wma,.aiff,.opus'
```

---

## 資料驗證規則

| 欄位 | 規則 | 驗證時機 |
|------|------|----------|
| 檔案類型 | 副檔名符合 FILE_ACCEPT | 檔案選擇時 |
| 檔案大小 | ≤ 100MB（軟限制，顯示警告） | 檔案選擇時 |
| 音訊取樣率 | 自動轉換為 44100Hz | FFmpeg 處理時 |
| 聲道數 | 自動轉換為立體聲 | FFmpeg 處理時 |
