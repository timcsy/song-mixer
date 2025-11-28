# 人聲去除服務 Vocal Remover

從影片中分離人聲，產生伴奏版本。支援 YouTube 網址和本地檔案上傳。

使用 [Demucs](https://github.com/facebookresearch/demucs) AI 模型進行音源分離。

## 功能特色

- 支援 YouTube 網址直接處理
- 支援本地影片檔案上傳 (MP4, MOV, AVI, MKV, WebM)
- 高品質人聲分離 (使用 Demucs htdemucs 模型)
- 即時進度追蹤
- 支援 GPU 加速 (NVIDIA CUDA)
- 單一 Docker 容器，一鍵啟動

## 快速開始

### 需求

- Docker Desktop

### 建置與執行

```bash
# 建置映像
docker build -t vocal-remover .

# 執行（CPU 模式）
docker run -p 8080:80 vocal-remover

# 執行（GPU 模式，需要 NVIDIA GPU）
docker run --gpus all -p 8080:80 -e DEVICE=cuda vocal-remover
```

啟動後訪問: http://localhost:8080

### 使用 docker-compose

```bash
# 啟動
docker compose up -d

# 查看日誌
docker compose logs -f

# 停止
docker compose down
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `DEVICE` | `cpu` | 運算裝置 (cpu/cuda) |
| `MAX_CONCURRENT_JOBS` | `2` | 最大並發任務數 |
| `MAX_VIDEO_DURATION` | `600` | 最大影片長度（秒） |
| `JOB_TIMEOUT_MINUTES` | `30` | 任務超時時間（分鐘） |

## 持久化儲存（選配）

預設情況下，處理結果儲存在容器內，容器停止後資料會消失。若需持久化：

```bash
docker run -p 8080:80 -v vocal-data:/data vocal-remover
```

## 專案結構

```
sing/
├── backend/                 # FastAPI 後端
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心設定
│   │   ├── models/         # 資料模型
│   │   └── services/       # 服務層
│   └── requirements.txt
├── frontend/               # Vue.js 前端
│   └── src/
├── docker/                 # Docker 設定檔
│   ├── nginx.conf          # Nginx 反向代理設定
│   └── supervisord.conf    # 程序管理設定
├── Dockerfile              # 單一容器建置檔
└── docker-compose.yml      # Docker Compose 設定
```

## 技術架構

- **Frontend:** Vue 3 + TypeScript + Vite
- **Backend:** FastAPI + Python 3.11
- **AI Model:** Demucs (htdemucs)
- **Video Processing:** FFmpeg
- **YouTube Download:** yt-dlp
- **Process Manager:** Supervisor (Nginx + Uvicorn)
- **Container:** 單一 Docker 容器

## 開發

### 本地開發（僅後端）

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 本地開發（僅前端）

```bash
cd frontend
npm install
npm run dev
```

## 注意事項

- CPU 模式下處理時間較長，請耐心等待
- 建議單次處理一個任務以獲得最佳效能
- 影片長度限制預設為 10 分鐘

## 授權

MIT License

## 致謝

- [Demucs](https://github.com/facebookresearch/demucs) - Meta AI 的音源分離模型
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube 下載工具
