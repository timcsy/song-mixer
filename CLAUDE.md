# sing Development Guidelines

## 專案概述

人聲去除服務 - 單一 Docker 容器架構

## 技術棧

- **Backend:** Python 3.11 + FastAPI
- **Frontend:** TypeScript + Vue 3 + Vite
- **AI Model:** Demucs (htdemucs)
- **Video Processing:** FFmpeg
- **YouTube Download:** yt-dlp
- **Process Manager:** Supervisor (Nginx + Uvicorn)

## 專案結構

```text
sing/
├── backend/app/           # FastAPI 後端
│   ├── api/v1/           # API 路由 (health.py, jobs.py)
│   ├── core/             # 設定 (config.py)
│   ├── models/           # 資料模型 (job.py)
│   └── services/         # 服務層
│       ├── local_storage.py   # 本地檔案儲存
│       ├── job_manager.py     # 記憶體任務管理
│       ├── processor.py       # 背景任務處理
│       ├── youtube.py         # YouTube 下載
│       ├── separator.py       # Demucs 音源分離
│       └── merger.py          # FFmpeg 影片合併
├── frontend/src/         # Vue 3 前端
├── docker/               # Docker 設定
│   ├── nginx.conf        # Nginx 反向代理
│   └── supervisord.conf  # 程序管理
├── Dockerfile            # 多階段建置
└── docker-compose.yml    # 單一服務設定
```

## 常用指令

```bash
# 建置
docker build -t song-mixer .

# 執行
docker run -p 8080:80 song-mixer

# 使用 docker-compose
docker compose up -d
docker compose logs -f
docker compose down

# 本地開發（後端）
cd backend && uvicorn app.main:app --reload

# 本地開發（前端）
cd frontend && npm run dev
```

## 程式碼風格

- Python: 遵循 PEP 8
- TypeScript: 遵循 ESLint 規則
- 使用繁體中文註解和訊息

## 資料流

1. 使用者上傳影片或提供 YouTube 網址
2. `job_manager` 建立任務，儲存於記憶體
3. `processor` 在背景執行緒處理：
   - YouTube: 下載 → 提取音頻 → 分離 → 合併
   - Upload: 提取音頻 → 分離 → 合併
4. 結果儲存於 `/data/results/`
5. 使用者下載結果

## API 端點

- `GET /api/v1/health` - 健康檢查
- `POST /api/v1/jobs` - 建立 YouTube 任務
- `POST /api/v1/jobs/upload` - 上傳檔案任務
- `GET /api/v1/jobs/{id}` - 查詢任務狀態
- `GET /api/v1/jobs/{id}/download` - 下載結果
- `GET /api/v1/jobs/{id}/stream` - 串流播放

## Active Technologies
- Python 3.11 (後端), TypeScript 5.3 (前端) + FastAPI, Vue 3, Demucs, FFmpeg (rubberband), Tone.js (003-advanced-audio-mixer)
- 本地檔案系統 (`/data/`) (003-advanced-audio-mixer)
- Python 3.11 (Backend) + TypeScript 5.3 (Frontend) + FastAPI, Pydantic, Vue 3, Vite, Tone.js (004-video-mixer)
- 本地檔案系統 + 記憶體狀態（無資料庫） (004-video-mixer)
- TypeScript 5.3 (Frontend) + Python 3.11 (Backend - 簡化後僅 YouTube 代理) (005-frontend-processing)
- IndexedDB (前端持久化) (005-frontend-processing)

## Recent Changes
- 003-advanced-audio-mixer: Added Python 3.11 (後端), TypeScript 5.3 (前端) + FastAPI, Vue 3, Demucs, FFmpeg (rubberband), Tone.js
