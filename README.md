# Song Mixer 歌曲混音器

AI 驅動的歌曲混音工具，從影片中分離音軌（人聲、鼓、貝斯、其他），支援即時混音控制。

使用 [Demucs](https://github.com/facebookresearch/demucs) AI 模型進行音源分離。

## 線上試用

GitHub Pages: https://timcsy.github.io/song-mixer/

## 功能特色

- 支援 YouTube 網址直接處理（需後端）
- 支援本地影片檔案上傳
- AI 音源分離（Demucs htdemucs 模型）
- 四軌獨立控制（人聲、鼓、貝斯、其他樂器）
- 即時音量調整與靜音
- 升降 Key 調整
- 多種輸出格式（MP4、MP3、M4A、WAV）
- 純前端處理模式（使用 WebAssembly）
- 處理結果本地儲存（IndexedDB）

## 使用方式

### 純前端模式（GitHub Pages）

直接訪問 https://timcsy.github.io/song-mixer/，上傳本地檔案即可處理。

### Docker 模式（支援 YouTube）

```bash
# 建置映像
docker build -t song-mixer .

# 執行（CPU 模式）
docker run -p 8080:80 song-mixer

# 執行（GPU 模式，需要 NVIDIA GPU）
docker run --gpus all -p 8080:80 -e DEVICE=cuda song-mixer
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

## 技術架構

- **Frontend:** Vue 3 + TypeScript + Vite + Tone.js
- **Backend:** FastAPI + Python 3.11（YouTube 代理）
- **AI Model:** Demucs (htdemucs) / ONNX Runtime (WebAssembly)
- **Audio Processing:** Web Audio API + Tone.js
- **Storage:** IndexedDB（前端）

## 開發

### 本地開發（前端）

```bash
cd frontend
npm install
npm run dev
```

### 本地開發（後端 + 前端）

```bash
# 啟動後端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 啟動前端
cd frontend
npm install
npm run dev
```

## 注意事項

- 純前端模式需要瀏覽器支援 SharedArrayBuffer
- CPU 模式下處理時間較長，請耐心等待
- 建議單次處理一個任務以獲得最佳效能
- 影片長度限制預設為 10 分鐘

## 授權

MIT License

## 致謝

- [Demucs](https://github.com/facebookresearch/demucs) - Meta AI 的音源分離模型
- [Tone.js](https://tonejs.github.io/) - Web Audio API 框架
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube 下載工具
