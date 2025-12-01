# Tasks: 單一 Docker 容器架構

**Input**: Design documents from `/specs/002-single-container/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 無自動化測試（手動整合測試）

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/app/`
- **Frontend**: `frontend/src/`
- **Docker**: `docker/`, root `Dockerfile`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 專案結構準備與依賴清理

- [x] T001 建立 docker/ 目錄結構
- [x] T002 更新 backend/requirements.txt 移除 redis, boto3, rq 依賴
- [x] T003 [P] 刪除 backend/app/workers/ 目錄（Celery/RQ 相關）
- [x] T004 [P] 刪除 helm/ 目錄（K8s 相關）
- [x] T005 [P] 刪除 k8s/ 目錄（K8s 相關）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 核心服務重構，為所有 User Story 提供基礎

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 重構 backend/app/core/config.py 移除 Redis/MinIO 設定，新增本地儲存路徑設定
- [x] T007 建立 backend/app/services/local_storage.py 實作本地檔案系統儲存服務
- [x] T008 建立 backend/app/services/job_manager.py 實作記憶體任務狀態管理
- [x] T009 建立 backend/app/services/processor.py 實作背景任務處理（threading）
- [x] T010 更新 backend/app/services/youtube.py 移除 cobalt fallback 相關程式碼
- [x] T011 更新 backend/app/main.py 整合新的服務模組

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 一鍵啟動服務 (Priority: P1) 🎯 MVP

**Goal**: 使用者透過單一 Docker 指令啟動完整服務

**Independent Test**: 執行 `docker run -p 8080:80 song-mixer` 後，瀏覽器開啟 http://localhost:8080 可看到前端介面

### Implementation for User Story 1

- [x] T012 [US1] 建立 docker/nginx.conf Nginx 設定檔（靜態檔案 + API 反向代理）
- [x] T013 [US1] 建立 docker/supervisord.conf Supervisor 設定檔（管理 Nginx + Uvicorn）
- [x] T014 [US1] 建立根目錄 Dockerfile 多階段建置（frontend-builder → backend → final）
- [x] T015 [US1] 簡化 docker-compose.yml 為單一服務設定
- [x] T016 [US1] 更新 backend/app/api/v1/health.py 確認 health check 端點正常

**Checkpoint**: 容器可建置並啟動，前端介面可存取

---

## Phase 4: User Story 2 - 上傳影片並處理 (Priority: P1)

**Goal**: 使用者上傳影片檔案，系統處理後可下載結果

**Independent Test**: 上傳測試影片，確認處理完成後可下載人聲/伴奏分離結果

### Implementation for User Story 2

- [x] T017 [US2] 更新 backend/app/api/v1/jobs.py 中的 upload 端點使用新的 local_storage 和 job_manager
- [x] T018 [US2] 更新 backend/app/api/v1/jobs.py 中的 get_job 端點使用 job_manager
- [x] T019 [US2] 更新 backend/app/api/v1/jobs.py 中的 download 端點直接讀取本地檔案
- [x] T020 [US2] 更新 backend/app/api/v1/jobs.py 中的 stream 端點支援 Range 請求
- [x] T021 [US2] 整合 processor.py 與上傳任務流程（提取音頻 → 分離 → 合併）
- [x] T022 [US2] 新增並發任務限制檢查（超過限制回傳 503）

**Checkpoint**: 上傳影片功能完整運作

---

## Phase 5: User Story 3 - YouTube 網址處理 (Priority: P2)

**Goal**: 使用者輸入 YouTube 網址，系統下載並處理

**Independent Test**: 輸入有效 YouTube 網址，確認下載、處理、下載結果完整流程

### Implementation for User Story 3

- [x] T023 [US3] 更新 backend/app/api/v1/jobs.py 中的 youtube 端點使用新的 job_manager
- [x] T024 [US3] 整合 processor.py 與 YouTube 任務流程（下載 → 提取音頻 → 分離 → 合併）
- [x] T025 [US3] 確認 YouTube URL 驗證與錯誤處理正常

**Checkpoint**: YouTube 處理功能完整運作

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 清理與最終驗證

- [x] T026 [P] 刪除 frontend/Dockerfile（已整合至根目錄 Dockerfile）
- [x] T027 [P] 更新 backend/Dockerfile 為簡化版（僅用於開發）
- [x] T028 刪除不再使用的 backend/app/services/storage.py（MinIO 版本）
- [x] T029 手動測試完整流程：建置 → 啟動 → 上傳 → 處理 → 下載
- [x] T030 驗證 quickstart.md 中的指令可正常執行

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: 一鍵啟動 - 基礎建設完成後即可開始
- **User Story 2 (P1)**: 上傳處理 - 依賴 US1 完成（需要容器可運行）
- **User Story 3 (P2)**: YouTube 處理 - 依賴 US2 完成（共用處理流程）

### Within Each User Story

- Docker 設定 → 建置 → API 整合 → 測試

### Parallel Opportunities

- T003, T004, T005 可平行執行（刪除不同目錄）
- T026, T027 可平行執行（修改不同檔案）

---

## Parallel Example: Phase 1 Setup

```bash
# 可同時執行的刪除任務：
Task: "刪除 backend/app/workers/ 目錄"
Task: "刪除 helm/ 目錄"
Task: "刪除 k8s/ 目錄"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: 確認容器可建置、啟動、存取前端
5. 可選擇在此停止部署 MVP

### Incremental Delivery

1. Setup + Foundational → 基礎完成
2. User Story 1 → 容器可運行 → MVP
3. User Story 2 → 上傳功能可用
4. User Story 3 → YouTube 功能可用
5. Polish → 清理完成

---

## Notes

- 規格未要求自動化測試，使用手動整合測試
- 現有 separator.py, merger.py 保持不變
- 前端程式碼保持不變，僅整合至單一容器
- 每個任務完成後立即更新此檔案狀態
