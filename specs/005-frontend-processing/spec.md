# Feature Specification: 純前端人聲去除服務架構改造

**Feature Branch**: `005-frontend-processing`
**Created**: 2025-12-01
**Status**: Draft
**Input**: 使用純前端技術重新架構人聲去除服務，採用 demucs-web、ffmpeg.wasm、IndexedDB，支援雙部署模式（純靜態/Docker）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 本地影片上傳處理 (Priority: P1)

使用者可以上傳本地影片檔案，系統在瀏覽器中完成人聲分離處理，無需依賴後端伺服器。

**Why this priority**: 這是核心功能，純靜態部署（GitHub Pages）的唯一輸入方式，也是 Docker 部署的主要功能之一。

**Independent Test**: 可在 GitHub Pages 靜態部署環境單獨測試，上傳影片後應能完成人聲分離並播放。

**Acceptance Scenarios**:

1. **Given** 使用者在靜態部署網站，**When** 上傳 50MB MP4 影片，**Then** 系統顯示多階段進度（提取音頻 → 分離人聲 → 儲存），完成後可播放混音結果
2. **Given** 使用者在不支援 SharedArrayBuffer 的瀏覽器，**When** 開啟網站，**Then** 顯示瀏覽器不支援警告，建議使用 Chrome 92+ / Firefox 79+ / Safari 15.2+
3. **Given** 使用者在不支援 WebGPU 的瀏覽器，**When** 開始處理，**Then** 顯示提示「將使用較慢的 WASM 模式」，但仍可正常處理

---

### User Story 2 - 歌曲管理與刪除 (Priority: P1)

使用者可以查看已處理的歌曲列表，並刪除不需要的歌曲以釋放儲存空間。

**Why this priority**: IndexedDB 儲存空間有限（通常 50-100MB），使用者必須能管理空間。

**Independent Test**: 處理一首歌後，可在列表中看到並刪除它，確認 IndexedDB 儲存空間已釋放。

**Acceptance Scenarios**:

1. **Given** 使用者已處理多首歌曲，**When** 開啟歌曲列表，**Then** 顯示所有歌曲及其標題、時長、建立時間
2. **Given** 使用者點擊刪除某首歌曲，**When** 確認刪除，**Then** 歌曲從列表移除，IndexedDB 儲存空間釋放
3. **Given** 使用者想查看儲存使用量，**When** 查看介面，**Then** 顯示已使用/總配額空間

---

### User Story 3 - 混音下載輸出 (Priority: P2)

使用者可以調整音軌混音設定後，下載合併後的影片或音訊檔案。

**Why this priority**: 這是核心產出功能，但依賴 P1 的處理功能完成後才能使用。

**Independent Test**: 處理完成後，調整混音設定並下載 MP4，確認輸出檔案包含正確的混音音訊。

**Acceptance Scenarios**:

1. **Given** 使用者已完成歌曲處理，**When** 選擇 WAV 格式並點擊下載，**Then** Web Audio API 混音後直接下載（不需 ffmpeg）
2. **Given** 使用者已完成歌曲處理，**When** 選擇 MP3 格式並點擊下載，**Then** 使用 ffmpeg.wasm 編碼為 MP3 後下載
3. **Given** 使用者已完成歌曲處理，**When** 選擇 MP4 格式並點擊下載，**Then** ffmpeg.wasm 合併影片與混音音訊，瀏覽器下載檔案
4. **Given** 使用者已完成歌曲處理，**When** 選擇 M4A 格式並點擊下載，**Then** ffmpeg.wasm 編碼為 M4A 後下載
5. **Given** 使用者調整人聲音量為 0、伴奏音量為 1，**When** 下載，**Then** 輸出檔案僅包含伴奏音軌

---

### User Story 4 - YouTube 影片處理（Docker 模式）(Priority: P3)

在 Docker 部署環境中，使用者可以輸入 YouTube 網址，系統透過後端 yt-dlp 下載影片後處理。

**Why this priority**: 這是進階功能，僅在 Docker 部署時可用，純靜態模式無法使用（CORS 限制）。

**Independent Test**: 在 Docker 部署環境輸入 YouTube 網址，應能下載並完成人聲分離。

**Acceptance Scenarios**:

1. **Given** 使用者在 Docker 部署環境，**When** 輸入 YouTube 網址，**Then** 後端下載影片、提取音頻，前端執行人聲分離，完成後可播放
2. **Given** 使用者在純靜態環境，**When** 開啟網站，**Then** YouTube 輸入欄位隱藏，顯示提示「請自行下載 YouTube 影片後上傳」
3. **Given** 使用者輸入無效 YouTube 網址，**When** 提交，**Then** 顯示錯誤訊息「無法取得影片資訊」

---

### Edge Cases

- 使用者上傳超過 100MB 的大檔案時？→ 顯示警告但允許繼續（軟限制），提示可能導致瀏覽器記憶體不足
- 使用者在處理過程中關閉瀏覽器分頁，重新開啟後是否能恢復？（不能，顯示處理中斷提示）
- IndexedDB 儲存空間已滿時如何處理？（顯示錯誤，建議刪除舊歌曲）
- demucs-web ONNX 模型（~172MB）下載失敗時？→ 重試機制，成功後使用 Cache API 快取供離線使用；模型採延遲載入（點擊處理時才下載）
- YouTube 影片因地區限制或年齡限制無法下載時？（顯示具體錯誤訊息）
- 瀏覽器在分離過程中記憶體不足時？（捕獲錯誤，顯示「處理失敗，請嘗試較短的影片」）

## Requirements *(mandatory)*

### Functional Requirements

**前端處理核心**
- **FR-001**: 系統 MUST 使用 demucs-web 在瀏覽器執行音源分離（drums/bass/other/vocals）
- **FR-002**: 系統 MUST 使用 ffmpeg.wasm 0.11.6 在瀏覽器提取影片音頻（純靜態模式）
- **FR-003**: 系統 MUST 使用 Web Audio API (OfflineAudioContext) 混音並輸出 WAV 格式
- **FR-004**: 系統 MUST 使用 ffmpeg.wasm 將混音結果編碼為 MP3 格式
- **FR-005**: 系統 MUST 使用 ffmpeg.wasm 合併混音音訊與原始影片為 MP4/M4A
- **FR-006**: 系統 MUST 使用 IndexedDB 持久化儲存處理結果（音軌 ArrayBuffer、原始影片）

**雙模式架構**
- **FR-007**: 系統 MUST 在啟動時偵測後端是否可用（/api/v1/health）
- **FR-008**: 純靜態模式 MUST 隱藏 YouTube 輸入功能，顯示「請自行下載影片」提示
- **FR-009**: Docker 模式 MUST 顯示 YouTube 輸入功能，使用後端 yt-dlp 下載
- **FR-010**: 所有模式 MUST 使用 ffmpeg.wasm 進行音頻提取和影片合併（統一前端處理）

**COOP/COEP Headers**
- **FR-011**: 純靜態模式 MUST 使用 coi-serviceworker 設定 COOP/COEP headers
- **FR-012**: Docker 模式 MUST 透過 Nginx 設定 COOP/COEP headers
- **FR-013**: 開發模式 MUST 透過 Vite config 設定 COOP/COEP headers

**瀏覽器相容性**
- **FR-014**: 系統 MUST 在啟動時檢查 SharedArrayBuffer 支援
- **FR-015**: 不支援 SharedArrayBuffer 時 MUST 顯示全螢幕警告，阻止使用
- **FR-016**: 不支援 WebGPU 時 SHOULD 顯示效能警告，但允許使用（WASM fallback）

**歌曲管理**
- **FR-017**: 使用者 MUST 能夠查看所有已處理歌曲列表
- **FR-018**: 使用者 MUST 能夠刪除單首歌曲
- **FR-019**: 系統 SHOULD 顯示 IndexedDB 儲存使用量

### Key Entities

- **SongRecord**: 已處理歌曲記錄
  - id: 唯一識別碼
  - title: 歌曲標題
  - sourceType: 'youtube' | 'upload'
  - sourceUrl: YouTube 來源網址（選填）
  - duration: 時長（秒）
  - sampleRate: 固定 44100 (44.1kHz)
  - createdAt: 建立時間
  - tracks: { drums, bass, other, vocals } ArrayBuffer
  - originalVideo: 原始影片 ArrayBuffer（用於下載合併）
  - thumbnailUrl: 縮圖網址（選填）

- **ProcessingState**: 處理狀態
  - stage: 'idle' | 'downloading' | 'extracting' | 'separating' | 'saving'
  - progress: 0-100 百分比
  - error: 錯誤訊息（選填）

## Clarifications

### Session 2025-12-01

- Q: 處理一首 3 分鐘歌曲的最長可接受時間？ → A: ≤5 分鐘（~1.5x 音訊長度）
- Q: 100MB 檔案限制是軟限制還是硬限制？ → A: 軟限制（警告但允許繼續）
- Q: 系統音訊取樣率標準？ → A: 固定 44.1kHz（CD 品質，demucs 原生支援）
- Q: demucs 模型載入時機？ → A: 延遲載入（點擊處理時才下載，首頁載入快）
- Q: 升降 Key 功能是否保留？ → A: 保留，使用 Tone.js PitchShift 實作前端升降 Key

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 使用者可在純靜態環境（GitHub Pages）完成本地影片人聲分離
- **SC-008**: 處理 3 分鐘歌曲應在 5 分鐘內完成（WebGPU 模式下更快）
- **SC-002**: 使用者可在 Docker 環境使用 YouTube 下載功能
- **SC-003**: 處理後歌曲可在瀏覽器關閉後重新載入（IndexedDB 持久化）
- **SC-004**: 支援 Chrome 92+、Firefox 79+、Safari 15.2+ 瀏覽器
- **SC-005**: 不支援的瀏覽器顯示明確警告訊息
- **SC-006**: 現有 AudioMixer 即時混音播放功能正常運作（含升降 Key，使用 Tone.js PitchShift）
- **SC-007**: 下載功能在兩種模式下皆可正常輸出 MP4/MP3/M4A/WAV 格式
