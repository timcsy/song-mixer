# Feature Specification: 單一 Docker 容器架構

**Feature Branch**: `002-single-container`
**Created**: 2025-11-28
**Status**: Draft
**Input**: 將多容器架構整合為單一 Docker 容器，適合個人桌面使用，使用本地檔案系統儲存

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 一鍵啟動服務 (Priority: P1)

使用者希望透過單一指令啟動人聲去除服務，無需配置多個容器或外部服務。只需執行一個 Docker 容器，即可在瀏覽器中使用完整功能。

**Why this priority**: 這是架構重構的核心價值，讓個人桌面使用變得簡單直接。

**Independent Test**: 執行單一 Docker 指令後，瀏覽器開啟 localhost 即可看到前端介面並使用服務。

**Acceptance Scenarios**:

1. **Given** 使用者已安裝 Docker，**When** 執行 `docker run -p 8080:80 song-mixer`，**Then** 服務在 30 秒內啟動完成，瀏覽器可存取 http://localhost:8080
2. **Given** 服務已啟動，**When** 使用者停止容器，**Then** 所有資源釋放，無殘留程序

---

### User Story 2 - 上傳影片並處理 (Priority: P1)

使用者上傳本地影片檔案，系統處理後產出人聲與伴奏分離的結果，使用者可直接下載。

**Why this priority**: 這是服務的核心功能，必須在新架構下正常運作。

**Independent Test**: 上傳一個測試影片，確認能成功分離人聲與伴奏並下載。

**Acceptance Scenarios**:

1. **Given** 服務已啟動，**When** 使用者上傳 MP4 影片檔案，**Then** 系統顯示處理進度並在合理時間內完成處理
2. **Given** 處理完成，**When** 使用者點擊下載，**Then** 可分別下載人聲音軌與伴奏音軌

---

### User Story 3 - YouTube 網址處理 (Priority: P2)

使用者貼上 YouTube 網址，系統自動下載影片並處理，產出人聲與伴奏分離結果。

**Why this priority**: 這是延伸功能，在核心上傳功能穩定後實現。

**Independent Test**: 貼上有效 YouTube 網址，確認能下載、處理並產出結果。

**Acceptance Scenarios**:

1. **Given** 服務已啟動，**When** 使用者輸入有效 YouTube 網址，**Then** 系統下載影片並顯示處理進度
2. **Given** YouTube 網址無效或無法存取，**When** 使用者提交，**Then** 系統顯示明確錯誤訊息

---

### Edge Cases

- 當磁碟空間不足時，系統應提示使用者並拒絕新的處理請求
- 當處理過程中容器被強制停止，下次啟動應能清理未完成的任務
- 當多個瀏覽器分頁同時發起請求，系統應依序處理或提示繁忙

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 透過單一 Docker 容器提供完整的人聲去除服務
- **FR-002**: 系統 MUST 在容器內整合前端介面與後端 API
- **FR-003**: 系統 MUST 使用本地檔案系統儲存上傳檔案與處理結果
- **FR-004**: 系統 MUST 將處理結果暫存於容器內（容器停止後資料消失）
- **FR-005**: 系統 MUST 支援上傳影片檔案（MP4、MKV、WebM 等常見格式）
- **FR-006**: 系統 MUST 支援 YouTube 網址輸入與下載
- **FR-007**: 系統 MUST 顯示處理進度讓使用者了解目前狀態
- **FR-008**: 系統 MUST 支援 CPU 模式運算（GPU 為選配）
- **FR-009**: 系統 MUST 在記憶體中追蹤任務狀態（取代外部資料庫）
- **FR-010**: 系統 MUST 提供結果預覽與下載功能
- **FR-011**: 系統 MUST 限制同時處理的任務數量以避免資源耗盡
- **FR-012**: 系統 MUST 在容器啟動時自動啟動所有必要服務

### Key Entities

- **Job（任務）**: 代表一次處理請求，包含狀態、進度、輸入檔案路徑、輸出結果路徑
- **Source（來源）**: 上傳檔案或 YouTube 網址
- **Result（結果）**: 包含人聲音軌與伴奏音軌的輸出檔案

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 使用者執行單一 Docker 指令後，服務在 60 秒內完全啟動並可使用
- **SC-002**: 處理完成時間與原多容器架構相當（差異不超過 20%）
- **SC-003**: 容器記憶體使用量在閒置時低於 500MB
- **SC-004**: 100% 的核心功能（上傳、處理、下載）在新架構下正常運作
- **SC-005**: 使用者無需安裝或配置任何外部服務（Redis、MinIO 等）

## Assumptions

- 目標使用者為個人桌面環境，非高併發生產環境
- 使用者已安裝 Docker 並具備基本操作能力
- 預設使用 CPU 運算，GPU 支援為選配功能
- 單一容器同時處理 1-2 個任務為合理負載
- 處理結果為暫時性，容器停止後自動清除
