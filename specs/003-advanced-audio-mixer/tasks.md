# Tasks: 進階音軌控制功能

**Input**: Design documents from `/specs/003-advanced-audio-mixer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/app/`
- **Frontend**: `frontend/src/`

---

## Phase 1: Setup

**Purpose**: 新增依賴與基礎設定

- [ ] T001 安裝前端 Tone.js 依賴 in `frontend/package.json`
- [ ] T002 [P] 確認 Docker 映像包含 librubberband in `Dockerfile`
- [ ] T003 [P] 新增前端型別定義 in `frontend/src/types/audio.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 後端資料模型與分離器修改（所有 User Story 共用）

**⚠️ CRITICAL**: 必須完成此階段才能開始 User Story 實作

- [ ] T004 新增 TrackPaths 類別 in `backend/app/models/job.py`
- [ ] T005 新增 OutputFormat 列舉 in `backend/app/models/job.py`
- [ ] T006 新增 MixSettings 類別 in `backend/app/models/job.py`
- [ ] T007 擴充 Job 模型新增 track_paths 和 sample_rate 欄位 in `backend/app/models/job.py`
- [ ] T008 修改 separator.py 輸出四軌（drums, bass, other, vocals）in `backend/app/services/separator.py`
- [ ] T009 修改 processor.py 儲存四軌路徑到 Job in `backend/app/services/processor.py`
- [ ] T010 [P] 建立 mixer.py 服務框架 in `backend/app/services/mixer.py`

**Checkpoint**: 基礎架構就緒，分離後可產生四軌檔案

---

## Phase 3: User Story 1 - 預覽時調整音軌混音 (Priority: P1) 🎯 MVP

**Goal**: 使用者可在預覽時即時調整各音軌音量

**Independent Test**: 上傳影片處理完成後，調整滑桿即時聽到混音變化

### Implementation for User Story 1

- [ ] T011 [P] [US1] 實作 GET /jobs/{id}/tracks API in `backend/app/api/v1/jobs.py`
- [ ] T012 [P] [US1] 實作 GET /jobs/{id}/tracks/{name} 串流 API (支援 Range) in `backend/app/api/v1/jobs.py`
- [ ] T013 [P] [US1] 建立 useWebAudio composable（載入、播放、音量控制）in `frontend/src/composables/useWebAudio.ts`
- [ ] T014 [P] [US1] 建立 useAudioSync composable（影片音頻同步）in `frontend/src/composables/useAudioSync.ts`
- [ ] T015 [US1] 建立 TrackSlider 組件 in `frontend/src/components/AudioMixer/TrackSlider.vue`
- [ ] T016 [US1] 建立 AudioMixer 主容器組件 in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T017 [US1] 整合 AudioMixer 到 ResultView in `frontend/src/components/ResultView.vue`
- [ ] T018 [US1] 實作預設音量（人聲 0%，其他 100%）in `frontend/src/composables/useWebAudio.ts`

**Checkpoint**: 可調整四軌音量並即時聽到效果

---

## Phase 4: User Story 2 - 升降 Key 調整 (Priority: P1)

**Goal**: 使用者可即時調整音調高低（±12 半音）

**Independent Test**: 調整升降 Key 控制，即時聽到音調變化

### Implementation for User Story 2

- [ ] T019 [P] [US2] 在 useWebAudio 加入 Tone.js PitchShift 效果器 in `frontend/src/composables/useWebAudio.ts`
- [ ] T020 [US2] 建立 PitchControl 組件 in `frontend/src/components/AudioMixer/PitchControl.vue`
- [ ] T021 [US2] 整合 PitchControl 到 AudioMixer in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T022 [US2] 實作音高調整邏輯（維持原速）in `frontend/src/composables/useWebAudio.ts`

**Checkpoint**: 可調整升降 Key 並即時聽到效果

---

## Phase 5: User Story 3 - 導唱功能快速切換 (Priority: P2)

**Goal**: 使用者可快速開關人聲軌道

**Independent Test**: 點擊導唱按鈕，即時切換人聲有無

### Implementation for User Story 3

- [ ] T023 [US3] 新增導唱開關按鈕到 AudioMixer in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T024 [US3] 實作導唱切換邏輯（人聲音量 0 ↔ 100%）in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T025 [US3] 按鈕狀態同步顯示（開啟/關閉）in `frontend/src/components/AudioMixer/AudioMixer.vue`

**Checkpoint**: 導唱功能可正常切換

---

## Phase 6: User Story 4 - 自訂混音下載 (Priority: P2)

**Goal**: 使用者可下載自訂混音，支援多種格式

**Independent Test**: 調整設定後下載 MP4/MP3/M4A/WAV 格式

### Implementation for User Story 4

- [ ] T026 [P] [US4] 實作 AudioMixer.mix_tracks 方法（FFmpeg 混音）in `backend/app/services/mixer.py`
- [ ] T027 [P] [US4] 實作 pitch shift 計算（2^(semitones/12)）in `backend/app/services/mixer.py`
- [ ] T028 [US4] 實作四種輸出格式（MP4, MP3, M4A, WAV）in `backend/app/services/mixer.py`
- [ ] T029 [US4] 實作混音快取機制（設定雜湊索引）in `backend/app/services/mixer.py`
- [ ] T030 [US4] 實作 POST /jobs/{id}/mix API in `backend/app/api/v1/jobs.py`
- [ ] T031 [US4] 實作 GET /jobs/{id}/mix/{mix_id} 狀態查詢 API in `backend/app/api/v1/jobs.py`
- [ ] T032 [US4] 實作 GET /jobs/{id}/mix/{mix_id}/download API in `backend/app/api/v1/jobs.py`
- [ ] T033 [US4] 新增下載格式選擇 UI in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T034 [US4] 新增前端 API 呼叫（mix, 狀態查詢, 下載）in `frontend/src/services/api.ts`
- [ ] T035 [US4] 實作下載進度顯示 in `frontend/src/components/AudioMixer/AudioMixer.vue`

**Checkpoint**: 可下載自訂混音檔案

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 最終整合與品質提升

- [ ] T036 [P] 處理網路中斷時的錯誤提示 in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T037 [P] 處理音軌載入失敗的錯誤提示 in `frontend/src/composables/useWebAudio.ts`
- [ ] T038 [P] 處理瀏覽器不支援 Web Audio API 的相容性提示 in `frontend/src/components/AudioMixer/AudioMixer.vue`
- [ ] T039 重新建置 Docker image 並測試 in `Dockerfile`
- [ ] T040 執行 quickstart.md 驗證清單 in `specs/003-advanced-audio-mixer/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴，可立即開始
- **Foundational (Phase 2)**: 依賴 Setup 完成 - **阻擋所有 User Story**
- **User Stories (Phase 3-6)**: 皆依賴 Foundational 完成
  - US1 和 US2 皆為 P1，建議依序完成
  - US3 和 US4 為 P2，可在 P1 完成後開始
- **Polish (Phase 7)**: 依賴所有 User Story 完成

### User Story Dependencies

- **User Story 1 (P1)**: 基礎預覽功能 - 無其他 Story 依賴
- **User Story 2 (P1)**: 升降 Key - 依賴 US1 的 useWebAudio
- **User Story 3 (P2)**: 導唱切換 - 依賴 US1 的 AudioMixer
- **User Story 4 (P2)**: 下載功能 - 可獨立於預覽功能，但整合需要 US1/US2/US3

### Within Each User Story

- 後端 API 與前端 composable 可平行開發
- 組件依賴 composable 完成
- 整合任務在末尾

### Parallel Opportunities

**Phase 2 可平行：**
- T004-T007（models）可平行
- T010（mixer 框架）可與 T008-T009（separator 修改）平行

**Phase 3 可平行：**
- T011, T012（後端 API）
- T013, T014（前端 composables）

**Phase 6 可平行：**
- T026, T027（後端 mixer 邏輯）

---

## Parallel Example: User Story 1

```bash
# 後端與前端可同時進行：
# 後端開發者：
Task: "T011 實作 GET /jobs/{id}/tracks API"
Task: "T012 實作 GET /jobs/{id}/tracks/{name} 串流 API"

# 前端開發者：
Task: "T013 建立 useWebAudio composable"
Task: "T014 建立 useAudioSync composable"

# 完成上述後：
Task: "T015 建立 TrackSlider 組件"
Task: "T016 建立 AudioMixer 主容器"
Task: "T017 整合到 ResultView"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（**關鍵 - 阻擋所有 Story**）
3. 完成 Phase 3: User Story 1（音軌混音預覽）
4. 完成 Phase 4: User Story 2（升降 Key）
5. **停止並驗證**: 測試即時預覽功能
6. 可選：部署/展示 MVP

### Incremental Delivery

1. Setup + Foundational → 基礎就緒
2. User Story 1 → 測試 → 可用的混音預覽
3. User Story 2 → 測試 → 加入升降 Key
4. User Story 3 → 測試 → 加入導唱切換
5. User Story 4 → 測試 → 完整下載功能
6. 每個 Story 增加價值但不破壞先前功能

---

## Notes

- [P] = 可平行執行（不同檔案，無依賴）
- [Story] = 對應到 spec.md 中的 User Story
- 每個 User Story 應可獨立完成與測試
- 每完成一個任務後提交
- 在任何 Checkpoint 處可停下驗證
