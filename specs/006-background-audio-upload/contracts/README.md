# API Contracts: 背景播放與音檔上傳支援

**Date**: 2025-12-09
**Feature**: 006-background-audio-upload

## 說明

本功能為純前端實作，不涉及後端 API 變更。

### 不需要新增 API 的原因

1. **背景播放**：使用瀏覽器原生 Page Visibility API，不需要與後端通訊
2. **音檔上傳**：使用現有的本地處理流程（FFmpeg.wasm + demucs-web），所有處理在瀏覽器端完成
3. **資料儲存**：使用現有的 IndexedDB 儲存機制，SongRecord 結構已支援可選的 originalVideo

### 現有 API（不修改）

| 端點 | 用途 | 本功能影響 |
|------|------|-----------|
| `GET /api/v1/health` | 健康檢查 | 無 |
| `POST /api/v1/youtube/download/start` | YouTube 下載 | 無 |
| `GET /api/v1/youtube/download/progress/{task_id}` | 下載進度 | 無 |
| `GET /api/v1/youtube/download/result/{task_id}` | 下載結果 | 無 |
