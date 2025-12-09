# Quickstart: 背景播放與音檔上傳支援

**Date**: 2025-12-09
**Feature**: 006-background-audio-upload

## 功能概述

本功能新增兩項能力：
1. **背景播放**：切換分頁或最小化視窗時音訊繼續播放
2. **音檔上傳**：支援直接上傳 MP3、WAV、FLAC 等純音檔

## 修改檔案清單

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `frontend/src/composables/useWebAudio.ts` | 修改 | 新增 Page Visibility API 處理 |
| `frontend/src/components/AddSongModal.vue` | 修改 | 更新 accept 屬性、新增音檔預覽 UI |
| `frontend/src/services/ffmpegService.ts` | 修改 | 新增 convertToWav 方法 |
| `frontend/src/composables/useLocalProcessor.ts` | 修改 | 新增音檔檢測與處理流程 |

## 實作步驟

### Step 1: 背景播放 (useWebAudio.ts)

1. 新增 `timeUpdateInterval` 變數
2. 修改 `updateTime` 函數，僅在頁面可見時使用 `requestAnimationFrame`
3. 新增 `handleVisibilityChange` 函數處理頁面可見性變化
4. 在 `loadTracks` 中註冊 `visibilitychange` 事件
5. 在 `cleanup` 中清理 interval 和事件監聽器

### Step 2: 音檔上傳介面 (AddSongModal.vue)

1. 更新 `<input>` 的 accept 屬性加入音檔格式
2. 更新拖放區域提示文字
3. 新增 `isAudioFile` computed 屬性
4. 新增音檔預覽 UI（audio 元素 + 圖示）
5. 新增音檔預覽相關 CSS

### Step 3: FFmpeg 音檔轉換 (ffmpegService.ts)

1. 新增 `convertToWav` 方法
2. 使用通用輸入檔名讓 FFmpeg 自動偵測格式
3. 輸出 44.1kHz、立體聲、16-bit PCM WAV

### Step 4: 處理流程分支 (useLocalProcessor.ts)

1. 新增 `isAudioFile` 輔助函數
2. 修改 `processUpload` 函數：
   - 檢測檔案類型
   - 音檔使用 `convertToWav`，影片使用 `extractAudio`
   - 音檔不儲存 `originalVideo`

## 測試驗證

### 背景播放測試

1. 播放任意歌曲
2. 切換到其他分頁 → 音訊應繼續播放
3. 最小化視窗 → 音訊應繼續播放
4. 返回頁面 → 進度條應顯示正確時間

### 音檔上傳測試

1. 選擇 MP3 檔案 → 應顯示音訊預覽（audio 元素）
2. 選擇 FLAC、WAV 等格式 → 應能正常處理
3. 處理完成後 → 應顯示「純音訊模式」（無影片區域）
4. 嘗試匯出 → MP4 選項應被禁用

## 注意事項

- 本功能純前端實作，後端不需修改
- SongRecord 的 `originalVideo` 欄位已是可選，無需調整型別定義
- 音檔上傳的 `sourceType` 仍為 `'upload'`，不新增類型
