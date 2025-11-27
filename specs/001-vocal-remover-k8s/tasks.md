# 任務清單：人聲去除服務

**輸入**: 設計文件來自 `/specs/001-vocal-remover-k8s/`
**前置條件**: plan.md、spec.md、research.md、data-model.md、contracts/

**組織方式**: 任務依使用者故事分組，每個故事可獨立實作與測試。

## 格式: `[ID] [P?] [Story?] 描述`

- **[P]**: 可平行執行（不同檔案、無相依性）
- **[Story]**: 所屬使用者故事（US1、US2、US3）
- 包含確切的檔案路徑

## 路徑慣例

- **後端**: `backend/app/`、`backend/tests/`
- **前端**: `frontend/src/`
- **K8s**: `k8s/`

---

## Phase 1: Setup（共用基礎設施）

**目的**: 專案初始化與基本結構

- [x] T001 建立專案目錄結構（backend/、frontend/、k8s/）
- [x] T002 初始化後端 Python 專案，建立 backend/requirements.txt
- [x] T003 [P] 初始化前端 Vue 3 專案，建立 frontend/package.json
- [x] T004 [P] 建立 backend/Dockerfile
- [x] T005 [P] 建立 frontend/Dockerfile
- [x] T006 建立 backend/app/core/config.py 配置管理（環境變數讀取）

---

## Phase 2: Foundational（阻塞性前置條件）

**目的**: 所有使用者故事共用的核心基礎設施

**⚠️ 重要**: 此階段完成前，不能開始任何使用者故事

- [x] T007 建立 backend/app/models/job.py（Job、Result、JobStatus 資料模型）
- [x] T008 [P] 建立 backend/app/core/rate_limit.py（IP 限流邏輯，12 次/小時）
- [x] T009 [P] 建立 backend/app/services/storage.py（MinIO 儲存服務）
- [x] T010 建立 backend/app/main.py（FastAPI 應用程式入口）
- [x] T011 建立 backend/app/api/v1/health.py（健康檢查 API）
- [x] T012 建立 backend/app/services/separator.py（Demucs 人聲分離服務）
- [x] T013 建立 backend/app/services/merger.py（FFmpeg 影片合併服務）
- [x] T014 建立 backend/app/workers/tasks.py（RQ 任務定義框架）
- [x] T015 建立 frontend/src/services/api.ts（API 呼叫封裝）
- [x] T016 建立 frontend/src/App.vue（主要應用程式框架）

**Checkpoint**: 基礎架構就緒，使用者故事實作可開始

---

## Phase 3: User Story 1 - 透過 YouTube 網址製作伴奏影片 (Priority: P1) 🎯 MVP

**目標**: 使用者輸入 YouTube 網址，系統下載影片、分離人聲、合併伴奏，提供下載

**獨立測試**: 輸入有效的 YouTube 音樂影片網址，驗證能成功下載去人聲的伴奏影片

### 實作 User Story 1

- [x] T017 [US1] 建立 backend/app/services/youtube.py（yt-dlp 下載服務）
- [x] T018 [US1] 在 backend/app/api/v1/jobs.py 實作 POST /jobs（建立 YouTube 任務）
- [x] T019 [US1] 在 backend/app/api/v1/jobs.py 實作 GET /jobs/{jobId}（查詢任務狀態）
- [x] T020 [US1] 在 backend/app/api/v1/jobs.py 實作 GET /jobs/{jobId}/download（下載結果）
- [x] T021 [US1] 在 backend/app/workers/tasks.py 實作 process_youtube_job 任務（下載→分離→合併流程）
- [x] T022 [P] [US1] 建立 frontend/src/components/UrlInput.vue（YouTube 網址輸入元件）
- [x] T023 [P] [US1] 建立 frontend/src/components/ResultView.vue（結果顯示與下載元件）
- [x] T024 [US1] 整合前端 UrlInput 與 ResultView 到 App.vue

**Checkpoint**: User Story 1 應已完全可用且可獨立測試

---

## Phase 4: User Story 2 - 上傳本地影片製作伴奏影片 (Priority: P2)

**目標**: 使用者上傳本地影片檔案，系統處理後提供下載

**獨立測試**: 上傳一個含人聲的本地影片，驗證能成功下載去人聲的伴奏影片

### 實作 User Story 2

- [ ] T025 [US2] 在 backend/app/api/v1/jobs.py 擴充 POST /jobs 支援 multipart/form-data 上傳
- [ ] T026 [US2] 在 backend/app/workers/tasks.py 實作 process_upload_job 任務（分離→合併流程）
- [ ] T027 [US2] 建立 frontend/src/components/FileUpload.vue（檔案上傳元件，含拖放支援）
- [ ] T028 [US2] 整合前端 FileUpload 到 App.vue

**Checkpoint**: User Story 1 和 2 都應可獨立運作

---

## Phase 5: User Story 3 - 查看處理進度與狀態 (Priority: P3)

**目標**: 使用者可即時查看任務處理進度與預估剩餘時間

**獨立測試**: 提交任務後，驗證進度條與狀態訊息正確反映處理階段

### 實作 User Story 3

- [ ] T029 [US3] 在 backend/app/workers/tasks.py 加入進度更新邏輯（更新 Job.progress 和 current_stage）
- [ ] T030 [US3] 建立 frontend/src/components/ProgressBar.vue（進度條元件，顯示階段與預估時間）
- [ ] T031 [US3] 在前端實作輪詢機制，定期查詢 GET /jobs/{jobId} 更新進度
- [ ] T032 [US3] 整合 ProgressBar 到結果頁面流程

**Checkpoint**: 所有使用者故事應已獨立可用

---

## Phase 6: Kubernetes 部署

**目的**: 將服務部署到 Kubernetes 環境

- [ ] T033 [P] 建立 k8s/namespace.yaml
- [ ] T034 [P] 建立 k8s/configmap.yaml（環境配置）
- [ ] T035 [P] 建立 k8s/secrets.yaml（MinIO 認證資訊）
- [ ] T036 [P] 建立 k8s/redis/statefulset.yaml 和 k8s/redis/service.yaml
- [ ] T037 [P] 建立 k8s/minio/statefulset.yaml 和 k8s/minio/service.yaml
- [ ] T038 [P] 建立 k8s/api/deployment.yaml 和 k8s/api/service.yaml
- [ ] T039 [P] 建立 k8s/worker/deployment.yaml（含 GPU 資源請求）
- [ ] T040 [P] 建立 k8s/worker/keda-scaler.yaml（KEDA 自動擴展）
- [ ] T041 [P] 建立 k8s/frontend/deployment.yaml 和 k8s/frontend/service.yaml
- [ ] T042 建立 k8s/ingress.yaml（路由配置）

**Checkpoint**: 服務可在 Kubernetes 環境運行

---

## Phase 7: Polish & 跨切面關注點

**目的**: 跨使用者故事的改進

- [ ] T043 實作過期任務清理（24 小時後自動刪除 Job、Result 和檔案）
- [ ] T044 加入錯誤處理與使用者友善的錯誤訊息
- [ ] T045 驗證 quickstart.md 流程可正常運作
- [ ] T046 [P] 程式碼清理與最終檢查

---

## 相依性與執行順序

### Phase 相依性

- **Setup (Phase 1)**: 無相依性，可立即開始
- **Foundational (Phase 2)**: 相依於 Setup 完成，阻塞所有使用者故事
- **User Stories (Phase 3-5)**: 相依於 Foundational 完成
  - 可依優先順序執行（P1 → P2 → P3）
  - 或平行執行（若有多人）
- **K8s 部署 (Phase 6)**: 可與 User Stories 平行進行
- **Polish (Phase 7)**: 相依於所有使用者故事完成

### 使用者故事相依性

- **User Story 1 (P1)**: Foundational 完成後可開始，無其他故事相依性
- **User Story 2 (P2)**: Foundational 完成後可開始，與 US1 共用核心服務
- **User Story 3 (P3)**: Foundational 完成後可開始，與 US1/US2 共用進度模型

### 各 Story 內部順序

- 後端服務 → API 端點 → Worker 任務 → 前端元件 → 整合

### 平行機會

- Phase 1: T003、T004、T005 可平行
- Phase 2: T008、T009 可平行
- Phase 3: T022、T023 可平行
- Phase 6: 所有 K8s 配置檔可平行（T033-T041）

---

## 平行範例：Phase 6 K8s 部署

```bash
# 所有 K8s 配置檔可同時建立：
Task: "建立 k8s/namespace.yaml"
Task: "建立 k8s/configmap.yaml"
Task: "建立 k8s/secrets.yaml"
Task: "建立 k8s/redis/statefulset.yaml"
Task: "建立 k8s/minio/statefulset.yaml"
Task: "建立 k8s/api/deployment.yaml"
Task: "建立 k8s/worker/deployment.yaml"
Task: "建立 k8s/frontend/deployment.yaml"
```

---

## 實作策略

### MVP 優先（僅 User Story 1）

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（重要：阻塞所有故事）
3. 完成 Phase 3: User Story 1
4. **停止並驗證**: 獨立測試 User Story 1
5. 可先部署/展示 MVP

### 增量交付

1. Setup + Foundational → 基礎架構就緒
2. 加入 User Story 1 → 獨立測試 → 部署（MVP！）
3. 加入 User Story 2 → 獨立測試 → 部署
4. 加入 User Story 3 → 獨立測試 → 部署
5. 加入 K8s 部署 → 生產環境就緒

---

## 備註

- [P] 任務 = 不同檔案、無相依性，可平行執行
- [Story] 標籤對應特定使用者故事，便於追蹤
- 每個使用者故事應可獨立完成與測試
- 每完成一個任務或邏輯群組後提交
- 在任何檢查點可停止，獨立驗證該故事
- 避免：模糊任務、同檔案衝突、破壞獨立性的跨故事相依
