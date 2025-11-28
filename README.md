# 🎤 人聲去除服務 Vocal Remover

從影片中分離人聲，產生伴奏版本。支援 YouTube 網址和本地檔案上傳。

使用 [Demucs](https://github.com/facebookresearch/demucs) AI 模型進行音源分離。

## ✨ 功能特色

- 🎬 支援 YouTube 網址直接處理
- 📤 支援本地影片檔案上傳 (MP4, MOV, AVI, MKV, WebM)
- 🎵 高品質人聲分離 (使用 Demucs htdemucs 模型)
- 📊 即時進度追蹤
- 🚀 支援 GPU 加速 (NVIDIA CUDA)
- ☸️ 可部署到 Kubernetes

## 🚀 快速開始

### 本地執行 (Docker)

**需求:** Docker Desktop

#### macOS / Linux

```bash
# 一鍵執行
curl -fsSL https://raw.githubusercontent.com/timcsy/vocal-remover/main/run.sh | bash
# 或下載後執行
curl -fsSL https://raw.githubusercontent.com/timcsy/vocal-remover/main/run.sh -o run.sh
chmod +x run.sh
./run.sh          # CPU 模式
./run.sh --gpu    # GPU 模式 (需要 NVIDIA GPU)
```

#### Windows

```powershell
# 下載執行腳本
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/timcsy/vocal-remover/main/run.bat" -OutFile "run.bat"

# CPU 模式啟動
.\run.bat

# GPU 模式啟動 (需要 NVIDIA GPU)
.\run.bat --gpu
```

啟動後訪問: http://localhost:8080

### 管理命令

```bash
# 查看日誌
./run.sh logs

# 停止服務
./run.sh stop

# 查看狀態
./run.sh status

# 清理所有資料
./run.sh clean
```

## ☸️ Kubernetes 部署

### 使用 Helm

```bash
# 加入 repo (選用)
# helm repo add vocal-remover https://timcsy.github.io/vocal-remover

# 部署
helm install vocal-remover ./helm/vocal-remover \
  --namespace vocal-remover \
  --create-namespace \
  --set api.image.repository=ghcr.io/timcsy/vocal-remover-api \
  --set worker.image.repository=ghcr.io/timcsy/vocal-remover-api \
  --set frontend.image.repository=ghcr.io/timcsy/vocal-remover-frontend \
  --set minio.auth.accessKey=YOUR_ACCESS_KEY \
  --set minio.auth.secretKey=YOUR_SECRET_KEY

# 查看狀態
kubectl get pods -n vocal-remover

# 移除
helm uninstall vocal-remover -n vocal-remover
```

### Helm 設定參數

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `api.replicaCount` | API 副本數 | `2` |
| `worker.replicaCount` | Worker 副本數 | `1` |
| `worker.gpu.enabled` | 啟用 GPU | `true` |
| `worker.gpu.count` | GPU 數量 | `1` |
| `processing.device` | 處理裝置 (cuda/cpu) | `cuda` |
| `processing.maxVideoDuration` | 最大影片長度 (秒) | `600` |
| `ingress.enabled` | 啟用 Ingress | `true` |
| `ingress.hosts[0].host` | 域名 | `""` |

完整參數請參考 [values.yaml](helm/vocal-remover/values.yaml)

### CPU 模式部署

```bash
helm install vocal-remover ./helm/vocal-remover \
  --set worker.gpu.enabled=false \
  --set processing.device=cpu \
  --set worker.resources.requests.memory=4Gi \
  --set worker.resources.limits.memory=8Gi
```

## 🛠️ 開發

### 本地開發環境

```bash
# 啟動開發環境
docker compose up -d

# 查看日誌
docker compose logs -f

# 停止
docker compose down
```

### 建置映像檔

```bash
# 建置 API
docker build -t vocal-remover-api ./backend

# 建置 Frontend
docker build -t vocal-remover-frontend ./frontend
```

## 📁 專案結構

```
sing/
├── backend/                 # FastAPI 後端
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心設定
│   │   ├── models/         # 資料模型
│   │   ├── services/       # 服務層
│   │   └── workers/        # 背景任務
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # Vue.js 前端
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── helm/                   # Helm Chart
│   └── vocal-remover/
├── k8s/                    # K8s manifests (舊版)
├── .github/workflows/      # CI/CD
├── docker-compose.yaml     # 開發用
├── run.sh                  # 本地執行 (Linux/macOS)
└── run.bat                 # 本地執行 (Windows)
```

## 🔧 技術架構

- **Frontend:** Vue 3 + TypeScript + Vite
- **Backend:** FastAPI + Python 3.11
- **AI Model:** Demucs (htdemucs)
- **Task Queue:** Redis + RQ
- **Storage:** MinIO (S3 相容)
- **Container:** Docker + Kubernetes

## 📄 授權

MIT License

## 🙏 致謝

- [Demucs](https://github.com/facebookresearch/demucs) - Meta AI 的音源分離模型
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube 下載工具
