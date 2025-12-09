# Research: 背景播放與音檔上傳支援

**Date**: 2025-12-09
**Feature**: 006-background-audio-upload

## 研究主題

### 1. Page Visibility API 背景播放實作

**問題**: 如何在瀏覽器分頁切換或視窗最小化時維持音訊播放？

**研究發現**:

1. **requestAnimationFrame 行為**
   - 當頁面隱藏時，`requestAnimationFrame` 會暫停執行
   - 這是瀏覽器的電力節省機制
   - Tone.js 的 Transport 使用 Web Audio API 的 AudioContext，本身不受影響

2. **Page Visibility API**
   - `document.hidden` 屬性指示頁面是否可見
   - `visibilitychange` 事件在頁面可見性變化時觸發
   - 廣泛支援：Chrome 33+, Firefox 18+, Safari 7+, Edge 12+

3. **解決方案**
   - 監聽 `visibilitychange` 事件
   - 頁面隱藏時：停止 `requestAnimationFrame`，改用 `setInterval` 更新時間
   - 頁面可見時：停止 `setInterval`，恢復 `requestAnimationFrame`
   - setInterval 間隔建議 100ms（平衡準確性與效能）

**Decision**: 使用 Page Visibility API 動態切換時間更新機制
**Rationale**: 最小改動、瀏覽器原生支援、無需額外依賴
**Alternatives considered**:
- Web Workers：過度複雜，僅為了時間更新不值得
- Media Session API：可提供鎖定螢幕控制，但規格明確排除在範圍外

---

### 2. FFmpeg.wasm 音檔格式轉換

**問題**: 如何使用 FFmpeg.wasm 將各種音檔格式轉換為 WAV？

**研究發現**:

1. **FFmpeg.wasm 0.11.6 能力**
   - 支援讀取多種音訊格式：MP3, WAV, FLAC, AAC, M4A, OGG, WMA, AIFF, OPUS
   - 輸入檔案不需要指定正確的副檔名，FFmpeg 會自動偵測格式
   - 可直接使用通用檔名（如 `input_audio`）處理

2. **轉換命令**
   ```
   ffmpeg -i input_audio -vn -acodec pcm_s16le -ar 44100 -ac 2 output.wav
   ```
   - `-vn`：忽略視訊軌（如果有的話）
   - `-acodec pcm_s16le`：16-bit PCM 編碼
   - `-ar 44100`：44.1kHz 取樣率
   - `-ac 2`：立體聲

3. **現有程式碼參考**
   - `extractAudio` 方法已實作類似功能（從影片提取音訊）
   - 可複用相同的轉換參數，僅調整輸入處理

**Decision**: 新增 `convertToWav` 方法，使用通用輸入檔名
**Rationale**: 與現有 `extractAudio` 一致、FFmpeg 自動偵測格式、程式碼簡潔
**Alternatives considered**:
- 根據 MIME type 指定副檔名：增加複雜度，且 MIME type 不一定正確

---

### 3. 音檔與影片檔案區分

**問題**: 如何在前端區分音檔與影片檔案？

**研究發現**:

1. **副檔名檢測**（建議方案）
   - 簡單可靠
   - 音檔副檔名列表：`.mp3, .wav, .flac, .aac, .m4a, .ogg, .wma, .aiff, .opus`
   - 使用 `file.name.toLowerCase().endsWith(ext)` 檢測

2. **MIME type 檢測**
   - `file.type` 屬性
   - 可能不準確（取決於作業系統和瀏覽器）
   - 某些格式（如 FLAC）可能沒有標準 MIME type

3. **處理流程差異**
   - 音檔：轉換格式 → 音源分離 → 儲存（無 originalVideo）
   - 影片：提取音訊 → 音源分離 → 儲存（含 originalVideo）

**Decision**: 使用副檔名檢測區分檔案類型
**Rationale**: 簡單、可靠、與 HTML input accept 屬性一致
**Alternatives considered**:
- MIME type 檢測：不夠可靠
- Magic number 檢測：過度複雜

---

### 4. 音檔預覽 UI

**問題**: 如何在上傳介面顯示音檔預覽？

**研究發現**:

1. **HTML5 Audio 元素**
   - 原生支援 MP3, WAV, OGG 等格式
   - 可直接使用 `URL.createObjectURL(file)` 建立預覽 URL
   - 提供標準播放控制項

2. **UI 設計考量**
   - 影片：顯示 `<video>` 元素
   - 音檔：顯示圖示 + `<audio>` 元素
   - 使用 `v-if/v-else` 條件渲染

**Decision**: 使用 HTML5 `<audio>` 元素配合音樂圖示
**Rationale**: 原生支援、簡單實作、與現有影片預覽模式一致
**Alternatives considered**:
- 自訂音訊播放器：過度設計，不符合憲法原則 II

---

## 技術決策摘要

| 決策項目 | 選擇 | 理由 |
|----------|------|------|
| 背景時間更新 | Page Visibility API + setInterval | 原生支援、最小改動 |
| 音檔轉換 | FFmpeg.wasm convertToWav | 與現有架構一致 |
| 檔案類型區分 | 副檔名檢測 | 簡單可靠 |
| 音檔預覽 | HTML5 Audio | 原生支援 |

## 所有 NEEDS CLARIFICATION 已解決

無待釐清項目。
