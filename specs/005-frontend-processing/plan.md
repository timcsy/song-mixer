# Implementation Plan: 純前端人聲去除服務架構改造

**Branch**: `005-frontend-processing` | **Date**: 2025-12-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-frontend-processing/spec.md`

## Summary

將人聲去除服務從後端處理架構改為純前端處理，使用 demucs-web（ONNX Runtime Web）執行音源分離、ffmpeg.wasm 處理影音、IndexedDB 持久化儲存。支援雙部署模式：純靜態（GitHub Pages）和 Docker 部署（含 YouTube 下載功能）。

## Technical Context

**Language/Version**: TypeScript 5.3 (Frontend) + Python 3.11 (Backend - 簡化後僅 YouTube 代理)
**Primary Dependencies**:
- Frontend: Vue 3, Vite, demucs-web, ffmpeg.wasm 0.11.6, Tone.js, lamejs
- Backend: FastAPI, yt-dlp (僅 Docker 模式)
**Storage**: IndexedDB (前端持久化)
**Testing**: Vitest (Frontend), pytest (Backend)
**Target Platform**: 現代瀏覽器 (Chrome 92+, Firefox 79+, Safari 15.2+)
**Project Type**: web (frontend + 簡化 backend)
**Performance Goals**: 處理 3 分鐘歌曲 ≤5 分鐘（~1.5x 音訊長度）
**Constraints**:
- 檔案大小軟限制 100MB（警告但允許繼續）
- 音訊取樣率固定 44.1kHz
- 需要 SharedArrayBuffer 支援（COOP/COEP headers）
**Scale/Scope**: 單一使用者本地處理，無並發需求

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 狀態 | 說明 |
|------|------|------|
| I. 繁體中文優先 | ✅ PASS | 所有文件使用繁體中文 |
| II. 簡潔設計 | ✅ PASS | 雙模式架構有明確使用場景（靜態/Docker），無過度抽象 |
| III. 最小文件產出 | ✅ PASS | 僅產生必要的 specs 文件 |
| IV. Git 版本控制紀律 | ✅ PASS | 每階段完成後提交 |
| V. 任務追蹤完整性 | ✅ PASS | 使用 tasks.md 追蹤 |
| VI. 規格文件保護 | ✅ PASS | 不會覆蓋 specs 目錄 |

**Gate Result**: ✅ PASS - 可進入 Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/005-frontend-processing/
├── spec.md              # 功能規格
├── plan.md              # 本文件
├── research.md          # Phase 0 研究結果
├── data-model.md        # Phase 1 資料模型
├── quickstart.md        # Phase 1 快速開始指南
├── contracts/           # Phase 1 API 契約
└── tasks.md             # Phase 2 任務清單
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/v1/
│   │   ├── health.py        # 健康檢查（保留）
│   │   └── youtube.py       # YouTube 代理 API（新增）
│   ├── services/
│   │   └── youtube.py       # yt-dlp 下載服務（保留）
│   └── main.py              # FastAPI 入口（簡化）
└── tests/

frontend/
├── public/
│   └── coi-serviceworker.js # COOP/COEP service worker（新增）
├── src/
│   ├── components/
│   │   ├── AudioMixer/      # 現有混音器元件（修改）
│   │   └── ...
│   ├── composables/
│   │   ├── useLocalProcessor.ts  # 本地處理流程（新增）
│   │   ├── useWebAudio.ts        # Web Audio 封裝（修改）
│   │   └── useJobManager.ts      # 任務管理（修改為 IndexedDB）
│   ├── services/
│   │   ├── storageService.ts     # IndexedDB CRUD（新增）
│   │   ├── demucsService.ts      # demucs-web 封裝（新增）
│   │   ├── ffmpegService.ts      # ffmpeg.wasm 封裝（新增）
│   │   ├── audioExportService.ts # 音訊匯出（新增）
│   │   └── api.ts                # API 客戶端（修改）
│   ├── types/
│   │   └── storage.ts            # 型別定義（新增）
│   └── utils/
│       └── browserCheck.ts       # 瀏覽器相容性檢查（新增）
└── tests/

docker/
├── nginx.conf           # Nginx 設定（新增 COOP/COEP headers）
└── supervisord.conf     # 程序管理
```

**Structure Decision**: 保留現有 Web 應用結構，前端新增處理服務模組，後端大幅簡化僅保留 YouTube 代理功能。

## Complexity Tracking

> 無違反憲法的複雜度問題

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | - | - |
