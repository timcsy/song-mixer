# Tasks: 純前端人聲去除服務架構改造

**Input**: Design documents from `/specs/005-frontend-processing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: ✅ 包含測試任務（TDD 方式：先寫測試再實作）

**Organization**: 任務依使用者故事分組，支援獨立實作與測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可並行執行（不同檔案，無依賴）
- **[Story]**: 所屬使用者故事（US1, US2, US3, US4）
- 描述包含確切檔案路徑

---

## Phase 1: Setup（專案設定）

**Purpose**: 專案初始化與基礎結構設定

- [X] T001 安裝前端新依賴：npm install demucs-web onnxruntime-web lamejs 於 frontend/
- [X] T002 [P] 下載 coi-serviceworker.js 到 frontend/public/coi-serviceworker.js
- [X] T003 [P] 更新 frontend/index.html 引入 coi-serviceworker.js 和 ffmpeg.wasm CDN
- [X] T004 [P] 更新 frontend/vite.config.ts 加入 COOP/COEP headers（開發模式）
- [X] T005 [P] 更新 docker/nginx.conf 加入 COOP/COEP headers（Docker 模式）

---

## Phase 2: Foundational（基礎建設）

**Purpose**: 所有使用者故事共用的核心基礎設施

**⚠️ CRITICAL**: 此階段必須完成後才能開始任何使用者故事

### Tests for Foundational Services ⚠️

> **NOTE: 先寫測試，確保測試 FAIL 後再實作**

- [X] T006 [P] 建立 storageService 單元測試 frontend/tests/services/storageService.test.ts
- [X] T007 [P] 建立 browserCheck 單元測試 frontend/tests/utils/browserCheck.test.ts
- [X] T008 [P] 建立 audioExportService 單元測試 frontend/tests/services/audioExportService.test.ts

### Implementation for Foundational

- [X] T009 建立型別定義檔 frontend/src/types/storage.ts（SongRecord, ProcessingState, MixerSettings 等）
- [X] T010 [P] 建立瀏覽器相容性檢查工具 frontend/src/utils/browserCheck.ts
- [X] T011 [P] 建立 IndexedDB 儲存服務 frontend/src/services/storageService.ts
- [X] T012 [P] 建立 demucs-web 封裝服務 frontend/src/services/demucsService.ts
- [X] T013 [P] 建立 ffmpeg.wasm 封裝服務 frontend/src/services/ffmpegService.ts
- [X] T014 [P] 建立音訊匯出服務 frontend/src/services/audioExportService.ts（WAV/MP3）
- [X] T015 更新 frontend/src/services/api.ts 加入後端偵測和 YouTube 代理 API
- [X] T016 建立 App 啟動時的瀏覽器檢查與後端偵測邏輯於 frontend/src/App.vue
- [X] T017 執行 Foundational 測試確保全部通過

**Checkpoint**: 基礎設施就緒 - 可開始使用者故事實作

---

## Phase 3: User Story 1 - 本地影片上傳處理 (Priority: P1) 🎯 MVP

**Goal**: 使用者可上傳本地影片，瀏覽器完成人聲分離，無需後端

**Independent Test**: 在 GitHub Pages 靜態部署環境上傳影片，應能完成分離並播放

### Tests for User Story 1 ⚠️

> **NOTE: 先寫測試，確保測試 FAIL 後再實作**

- [X] T018 [P] [US1] 建立 useLocalProcessor 單元測試 frontend/tests/composables/useLocalProcessor.test.ts
- [X] T019 [P] [US1] 建立 useJobManager 單元測試（IndexedDB 整合）frontend/tests/composables/useJobManager.test.ts

### Implementation for User Story 1

- [X] T020 [US1] 建立本地處理流程 composable frontend/src/composables/useLocalProcessor.ts
- [X] T021 [US1] 修改 frontend/src/composables/useJobManager.ts 改用 IndexedDB 儲存
- [X] T022 [US1] 修改 frontend/src/composables/useWebAudio.ts 支援從 ArrayBuffer 載入音軌
- [X] T023 [US1] 修改 frontend/src/components/AddSongModal.vue 整合本地處理流程
- [X] T024 [US1] 加入處理進度顯示（多階段：提取音頻 → 分離人聲 → 儲存）
- [X] T025 [US1] 加入瀏覽器不支援時的全螢幕警告元件
- [X] T026 [US1] 加入 WebGPU 不支援時的效能警告提示
- [X] T027 [US1] 加入檔案大小超過 100MB 的軟限制警告
- [X] T028 [US1] 執行 US1 測試確保全部通過

**Checkpoint**: User Story 1 完成 - 可獨立測試本地上傳處理功能

---

## Phase 4: User Story 2 - 歌曲管理與刪除 (Priority: P1)

**Goal**: 使用者可查看已處理歌曲列表，並刪除歌曲釋放空間

**Independent Test**: 處理一首歌後，在列表中看到並刪除它，確認空間已釋放

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] 建立歌曲列表元件測試 frontend/tests/components/SongList.test.ts

### Implementation for User Story 2

- [X] T030 [US2] 修改 frontend/src/components/SongList.vue 從 IndexedDB 載入歌曲列表
- [X] T031 [US2] 加入歌曲刪除功能（含確認對話框）
- [X] T032 [US2] 加入 IndexedDB 儲存使用量顯示
- [X] T033 [US2] 加入儲存空間已滿時的錯誤提示
- [X] T034 [US2] 執行 US2 測試確保全部通過

**Checkpoint**: User Stories 1 & 2 完成 - 可獨立測試歌曲管理功能

---

## Phase 5: User Story 3 - 混音下載輸出 (Priority: P2)

**Goal**: 使用者可調整混音後下載 MP4/MP3/M4A/WAV 檔案

**Independent Test**: 處理完成後，選擇不同格式下載，確認輸出正確

### Tests for User Story 3 ⚠️

- [X] T035 [P] [US3] 建立下載功能整合測試 frontend/tests/components/ResultView.download.test.ts

### Implementation for User Story 3

- [X] T036 [US3] 修改 frontend/src/components/ResultView.vue 整合新的下載邏輯
- [X] T037 [US3] 實作 WAV 下載（使用 audioExportService.mixToWav）
- [X] T038 [US3] 實作 MP3 下載（使用 audioExportService.mixToMp3 + lamejs）
- [X] T039 [US3] 實作 MP4/M4A 下載（純靜態模式：ffmpegService.mergeVideoAudio）
- [X] T040 [US3] 實作 MP4/M4A 下載（Docker 模式：後端 FFmpeg API）
- [X] T041 [US3] 根據後端可用性自動選擇下載方式
- [X] T042 [US3] 執行 US3 測試確保全部通過

**Checkpoint**: User Stories 1, 2 & 3 完成 - 純靜態部署功能完整

---

## Phase 6: User Story 4 - YouTube 影片處理（Docker 模式）(Priority: P3)

**Goal**: Docker 部署時，使用者可輸入 YouTube 網址下載處理

**Independent Test**: 在 Docker 環境輸入 YouTube 網址，應能下載並完成分離

### Tests for User Story 4 ⚠️

- [ ] T043 [P] [US4] 建立 YouTube API 端點測試 backend/tests/api/test_youtube.py
- [ ] T044 [P] [US4] 建立 FFmpeg API 端點測試 backend/tests/api/test_ffmpeg.py

### Backend Implementation

- [ ] T045 [P] [US4] 建立 YouTube 代理 API 端點 backend/app/api/v1/youtube.py
- [ ] T046 [P] [US4] 建立 FFmpeg 代理 API 端點（extract-audio, merge）於 backend/app/api/v1/ffmpeg.py
- [ ] T047 [US4] 更新 backend/app/main.py 註冊新路由
- [ ] T048 [US4] 簡化 backend/app/main.py 移除舊的 jobs API
- [ ] T049 [US4] 執行後端測試確保全部通過

### Frontend Implementation

- [ ] T050 [US4] 修改 frontend/src/components/AddSongModal.vue 根據後端可用性顯示/隱藏 YouTube 輸入
- [ ] T051 [US4] 實作 YouTube 下載處理流程於 useLocalProcessor.ts
- [ ] T052 [US4] 加入純靜態模式時的「請自行下載影片」提示
- [ ] T053 [US4] 加入 YouTube 網址驗證和錯誤處理

**Checkpoint**: 所有使用者故事完成 - Docker 部署功能完整

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨功能優化與清理

- [ ] T054 移除舊的後端處理程式碼（job_manager.py, processor.py, separator.py 等）
- [ ] T055 [P] 更新 Dockerfile 移除 Demucs 模型依賴（減小映像大小）
- [ ] T056 [P] 更新 frontend/package.json 移除不再需要的依賴
- [ ] T057 驗證 quickstart.md 所有步驟正確
- [ ] T058 效能測試：確認 3 分鐘歌曲處理時間 ≤5 分鐘
- [ ] T059 執行完整測試套件確保全部通過（npm run test && python -m pytest）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴 - 可立即開始
- **Foundational (Phase 2)**: 依賴 Setup 完成 - 阻塞所有使用者故事
- **User Stories (Phase 3-6)**: 依賴 Foundational 完成
  - US1 & US2 (P1) 可並行進行
  - US3 (P2) 依賴 US1 完成
  - US4 (P3) 可獨立進行（後端部分）
- **Polish (Phase 7)**: 依賴所有使用者故事完成

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 完成後可開始 - 無其他故事依賴
- **User Story 2 (P1)**: Foundational 完成後可開始 - 可與 US1 並行
- **User Story 3 (P2)**: 依賴 US1 的處理功能完成
- **User Story 4 (P3)**: 後端部分可獨立進行，前端整合依賴 US1

### Within Each User Story (TDD)

1. **先寫測試** - 確保測試 FAIL
2. **實作功能** - 讓測試 PASS
3. **驗證** - 執行測試確保全部通過

### Parallel Opportunities

- T002, T003, T004, T005 可並行（Setup 階段）
- T006, T007, T008 可並行（Foundational 測試）
- T010, T011, T012, T013, T014 可並行（Foundational 實作）
- T018, T019 可並行（US1 測試）
- US1 與 US2 可並行（兩者皆為 P1）
- T043, T044 可並行（US4 後端測試）
- T045, T046 可並行（US4 後端 API 建立）

---

## Parallel Example: Foundational Phase

```bash
# 先並行寫測試：
Task: "建立 storageService 單元測試 frontend/tests/services/storageService.test.ts"
Task: "建立 browserCheck 單元測試 frontend/tests/utils/browserCheck.test.ts"
Task: "建立 audioExportService 單元測試 frontend/tests/services/audioExportService.test.ts"

# 再並行實作：
Task: "建立瀏覽器相容性檢查工具 frontend/src/utils/browserCheck.ts"
Task: "建立 IndexedDB 儲存服務 frontend/src/services/storageService.ts"
Task: "建立 demucs-web 封裝服務 frontend/src/services/demucsService.ts"
Task: "建立 ffmpeg.wasm 封裝服務 frontend/src/services/ffmpegService.ts"
Task: "建立音訊匯出服務 frontend/src/services/audioExportService.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（**含測試**）
3. 完成 Phase 3: User Story 1（**含測試**）
4. 完成 Phase 4: User Story 2（**含測試**）
5. **STOP and VALIDATE**: 部署到 GitHub Pages 測試純靜態功能
6. 此時已可提供基本可用的服務

### Incremental Delivery

1. Setup + Foundational → 基礎就緒（測試通過）
2. Add US1 + US2 → 部署 GitHub Pages（MVP!）
3. Add US3 → 加入下載功能 → 更新部署
4. Add US4 + Backend → Docker 完整功能 → 完整部署

### Suggested MVP Scope

**最小可行產品 = Phase 1 + Phase 2 + Phase 3 + Phase 4**

功能：本地影片上傳、人聲分離、歌曲管理、即時播放混音
限制：僅支援即時播放，無下載功能
部署：GitHub Pages 純靜態
測試：15 項測試任務確保品質

---

## Test Summary

| Phase | 測試任務數 |
|-------|----------|
| Foundational | 3 |
| US1 | 2 |
| US2 | 1 |
| US3 | 1 |
| US4 | 2 |
| **Total** | **9** |

---

## Notes

- [P] 任務 = 不同檔案，無依賴，可並行
- [Story] 標籤對應 spec.md 中的使用者故事
- **TDD 流程**：先寫測試（FAIL）→ 實作（PASS）→ 驗證
- 每個使用者故事結束都有「執行測試確保通過」的驗證任務
- 每個任務或邏輯群組完成後提交
- 任何 Checkpoint 都可停下來驗證功能
