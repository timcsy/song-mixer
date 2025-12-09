# Tasks: 背景播放與音檔上傳支援

**Input**: Design documents from `/specs/006-background-audio-upload/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 本專案無自動化測試框架，僅進行手動測試。

**Organization**: 任務按使用者故事分組，以支援獨立實作和測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可並行執行（不同檔案、無依賴）
- **[Story]**: 所屬使用者故事（US1、US2、US3）
- 包含確切檔案路徑

## Path Conventions

本專案為 Web 應用：
- **前端**: `frontend/src/`
- **後端**: `backend/app/`（本功能不修改）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 本功能無需專案初始化，專案已存在

- [x] T001 確認目前分支為 `006-background-audio-upload`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 本功能新增共用常數，需先於使用者故事實作

**⚠️ CRITICAL**: 使用者故事工作需在此階段完成後開始

- [x] T002 在 `frontend/src/services/ffmpegService.ts` 新增 `convertToWav` 方法

**Checkpoint**: 基礎建設就緒 - 可開始使用者故事實作

---

## Phase 3: User Story 1 - 背景播放 (Priority: P1) 🎯 MVP

**Goal**: 切換分頁或最小化視窗時音訊繼續播放

**Independent Test**: 播放任何已處理的歌曲，切換到其他分頁，確認音訊持續播放且返回時進度條正確

### Implementation for User Story 1

- [x] T003 [US1] 在 `frontend/src/composables/useWebAudio.ts` 新增 `timeUpdateInterval` 變數宣告（約第 89 行後）
- [x] T004 [US1] 修改 `frontend/src/composables/useWebAudio.ts` 的 `updateTime` 函數，僅在頁面可見時使用 `requestAnimationFrame`
- [x] T005 [US1] 在 `frontend/src/composables/useWebAudio.ts` 新增 `handleVisibilityChange` 函數處理頁面可見性變化
- [x] T006 [US1] 在 `frontend/src/composables/useWebAudio.ts` 的 `loadTracks` 函數中註冊 `visibilitychange` 事件（Tone.start() 後）
- [x] T007 [US1] 修改 `frontend/src/composables/useWebAudio.ts` 的 `cleanup` 函數，清理 interval 和事件監聯聽器

**Checkpoint**: User Story 1 完成 - 背景播放功能可獨立測試

---

## Phase 4: User Story 2 - 音檔上傳 (Priority: P1)

**Goal**: 支援上傳 9 種常見音檔格式並處理

**Independent Test**: 上傳一個 MP3 檔案，確認系統能夠處理並產生分離後的音軌，結果頁面顯示「純音訊模式」

### Implementation for User Story 2

- [x] T008 [US2] 更新 `frontend/src/components/AddSongModal.vue` 的 `<input>` accept 屬性，加入音檔格式（第 89 行）
- [x] T009 [US2] 更新 `frontend/src/components/AddSongModal.vue` 拖放區域提示文字（第 93-96 行）
- [x] T010 [US2] 在 `frontend/src/composables/useLocalProcessor.ts` 新增 `AUDIO_EXTENSIONS` 常數和 `isAudioFile` 輔助函數
- [x] T011 [US2] 修改 `frontend/src/composables/useLocalProcessor.ts` 的 `processUpload` 函數，檢測檔案類型並分支處理
- [x] T012 [US2] 修改 `frontend/src/composables/useLocalProcessor.ts` 的 `processUpload` 函數，音檔使用 `ffmpegService.convertToWav`
- [x] T013 [US2] 修改 `frontend/src/composables/useLocalProcessor.ts` 的 `processUpload` 函數，音檔不儲存 `originalVideo`

**Checkpoint**: User Story 2 完成 - 音檔上傳功能可獨立測試

---

## Phase 5: User Story 3 - 音檔預覽 (Priority: P2)

**Goal**: 選擇音檔後顯示音訊播放器預覽

**Independent Test**: 選擇音檔後確認可以播放預覽

### Implementation for User Story 3

- [x] T014 [US3] 在 `frontend/src/components/AddSongModal.vue` script 區域新增 `isAudioFile` computed 屬性
- [x] T015 [US3] 修改 `frontend/src/components/AddSongModal.vue` 檔案預覽區域，使用 `v-if/v-else` 條件渲染（第 100-117 行）
- [x] T016 [US3] 在 `frontend/src/components/AddSongModal.vue` 新增音檔預覽 UI（audio 元素 + 圖示）
- [x] T017 [US3] 在 `frontend/src/components/AddSongModal.vue` style 區域新增音檔預覽相關 CSS

**Checkpoint**: User Story 3 完成 - 音檔預覽功能可獨立測試

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 收尾工作和驗證

- [ ] T018 手動測試：背景播放（切換分頁、最小化、返回、播放完畢）
- [ ] T019 手動測試：音檔上傳（MP3、WAV、FLAC 等格式）
- [ ] T020 手動測試：音檔預覽（播放、移除）
- [ ] T021 手動測試：純音訊模式（無影片區域、匯出選項限制）
- [ ] T022 Git commit 所有變更

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴
- **Foundational (Phase 2)**: 依賴 Setup - 阻塞所有使用者故事
- **User Stories (Phase 3-5)**: 皆依賴 Foundational 階段完成
  - US1（背景播放）和 US2（音檔上傳）可並行
  - US3（音檔預覽）可與 US2 同時進行（僅修改 AddSongModal.vue）
- **Polish (Phase 6)**: 依賴所有使用者故事完成

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 完成後可開始 - 不依賴其他故事
- **User Story 2 (P1)**: Foundational 完成後可開始 - 不依賴其他故事
- **User Story 3 (P2)**: Foundational 完成後可開始 - 與 US2 修改同一檔案但不同區域

### Within Each User Story

- 按任務順序執行
- 每完成一個任務即標記為完成（✅ 憲法原則 V）
- 每個邏輯群組完成後 commit

### Parallel Opportunities

- **Phase 3 + Phase 4**: US1 和 US2 修改不同檔案，可並行
  - US1: `useWebAudio.ts`
  - US2: `useLocalProcessor.ts`, `ffmpegService.ts`
- **Phase 4 + Phase 5**: 部分可並行，但 US3 需注意 AddSongModal.vue 的變更

---

## Parallel Example: US1 + US2

```bash
# 可同時進行（不同檔案）：
# 開發者 A: User Story 1 (useWebAudio.ts)
Task: T003-T007 修改 useWebAudio.ts

# 開發者 B: User Story 2 (ffmpegService.ts + useLocalProcessor.ts)
Task: T002 新增 ffmpegService.convertToWav
Task: T010-T013 修改 useLocalProcessor.ts

# 之後合併：User Story 3 (AddSongModal.vue)
Task: T008-T009, T014-T017 修改 AddSongModal.vue
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational
3. 完成 Phase 3: User Story 1（背景播放）
4. **STOP and VALIDATE**: 獨立測試背景播放
5. 可先部署/展示

### Incremental Delivery

1. 完成 Setup + Foundational → 基礎就緒
2. 新增 User Story 1 → 獨立測試 → 部署（背景播放 MVP）
3. 新增 User Story 2 → 獨立測試 → 部署（+音檔上傳）
4. 新增 User Story 3 → 獨立測試 → 部署（+音檔預覽）
5. 每個故事增加價值且不破壞之前功能

---

## Notes

- [P] 任務 = 不同檔案、無依賴
- [Story] 標籤將任務對應至特定使用者故事
- 每個使用者故事應可獨立完成和測試
- 每完成任務即標記為完成（憲法原則 V）
- 每個任務或邏輯群組完成後 commit（憲法原則 IV）
- 避免：模糊任務、同檔案衝突、破壞獨立性的跨故事依賴
