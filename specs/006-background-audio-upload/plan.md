# Implementation Plan: 背景播放與音檔上傳支援

**Branch**: `006-background-audio-upload` | **Date**: 2025-12-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-background-audio-upload/spec.md`

## Summary

本功能實作兩個核心需求：
1. **背景播放**：使用 Page Visibility API 監聽頁面可見性，在背景時改用 setInterval 更新播放時間，確保 Tone.js 音訊在切換分頁或最小化視窗時持續播放。
2. **音檔上傳**：擴展檔案上傳介面支援 9 種常見音檔格式，新增 FFmpeg 音檔轉換方法，並調整處理流程區分影片與音檔來源。

## Technical Context

**Language/Version**: TypeScript 5.3 (前端) + Python 3.11 (後端 - 僅 YouTube 代理)
**Primary Dependencies**: Vue 3, Vite, Tone.js, FFmpeg.wasm 0.11.6, demucs-web, onnxruntime-web
**Storage**: IndexedDB (前端持久化)
**Testing**: 手動測試（目前專案無自動化測試框架）
**Target Platform**: 現代瀏覽器（Chrome、Firefox、Safari、Edge）
**Project Type**: Web 應用（前後端分離）
**Performance Goals**: 音訊播放零中斷、音檔上傳成功率 95%
**Constraints**: 瀏覽器需支援 Web Audio API、Page Visibility API
**Scale/Scope**: 單一使用者桌面/行動裝置使用

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check ✅

| 原則 | 狀態 | 說明 |
|------|------|------|
| I. 繁體中文優先 | ✅ 通過 | 所有文件使用繁體中文 |
| II. 簡潔設計 | ✅ 通過 | 僅實作直接需求的功能，無預設抽象層 |
| III. 最小文件產出 | ✅ 通過 | 僅產生必要的規格文件於 /specs/ |
| IV. Git 版本控制紀律 | ⏳ 待執行 | 各階段完成後需提交 |
| V. 任務追蹤完整性 | ⏳ 待執行 | 實作階段需即時更新任務狀態 |
| VI. 規格文件保護 | ✅ 通過 | 規格文件已建立，不會被覆蓋 |

### Post-Design Check ✅ (Phase 1 完成後)

| 原則 | 狀態 | 說明 |
|------|------|------|
| I. 繁體中文優先 | ✅ 通過 | research.md, data-model.md, quickstart.md 皆為繁體中文 |
| II. 簡潔設計 | ✅ 通過 | 設計方案使用原生 API、最小改動現有程式碼 |
| III. 最小文件產出 | ✅ 通過 | 僅產生必要的規格文件 |
| IV. Git 版本控制紀律 | ⏳ 待執行 | 計畫完成後需提交 |
| V. 任務追蹤完整性 | ⏳ 待執行 | 實作階段需即時更新任務狀態 |
| VI. 規格文件保護 | ✅ 通過 | 無覆蓋風險 |

## Project Structure

### Documentation (this feature)

```text
specs/006-background-audio-upload/
├── spec.md              # 功能規格
├── plan.md              # 本檔案
├── research.md          # Phase 0 研究輸出
├── data-model.md        # Phase 1 資料模型
├── quickstart.md        # Phase 1 快速開始指南
├── contracts/           # Phase 1 API 契約（本功能純前端，無新增 API）
└── tasks.md             # Phase 2 任務清單
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/v1/          # API 路由（本功能不修改）
│   ├── core/            # 設定
│   └── services/        # 服務層（本功能不修改）

frontend/
├── src/
│   ├── components/      # Vue 組件
│   │   ├── AddSongModal.vue      # 🔧 修改：新增音檔格式支援、音檔預覽 UI
│   │   └── AudioMixer/           # 混音器組件（不修改）
│   ├── composables/     # Composition API
│   │   ├── useWebAudio.ts        # 🔧 修改：新增 Page Visibility API 處理
│   │   └── useLocalProcessor.ts  # 🔧 修改：新增音檔處理流程分支
│   ├── services/        # 核心服務
│   │   └── ffmpegService.ts      # 🔧 修改：新增 convertToWav 方法
│   └── types/           # TypeScript 型別
│       └── storage.ts            # 參考（SongRecord 已支援可選 originalVideo）
```

**Structure Decision**: Web 應用結構，本功能主要修改前端程式碼（4 個檔案），後端不需修改。

## Complexity Tracking

> 無違反憲法的情況，不需要複雜度追蹤。
