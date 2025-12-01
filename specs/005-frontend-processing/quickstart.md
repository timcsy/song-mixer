# Quickstart: 純前端人聲去除服務

**Date**: 2025-12-01
**Feature**: 005-frontend-processing

## 開發環境設定

### 前置需求

- Node.js 20+
- Python 3.11+ (僅 Docker 模式後端)
- 現代瀏覽器 (Chrome 92+, Firefox 79+, Safari 15.2+)

### 安裝依賴

```bash
# Frontend
cd frontend
npm install

# 新增依賴
npm install demucs-web onnxruntime-web lamejs

# Backend (僅 Docker 模式需要)
cd ../backend
pip install -r requirements.txt
```

### 下載 coi-serviceworker

```bash
# 下載到 frontend/public/
curl -o frontend/public/coi-serviceworker.js \
  https://raw.githubusercontent.com/gzuidhof/coi-serviceworker/master/coi-serviceworker.min.js
```

### 設定 Vite COOP/COEP Headers

```typescript
// frontend/vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
});
```

### 更新 index.html

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <!-- 必須放在最前面 -->
  <script src="/coi-serviceworker.js"></script>
  <!-- ffmpeg.wasm CDN -->
  <script src="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js"></script>
  <!-- ... 其他內容 -->
</head>
```

## 啟動開發伺服器

### 純前端開發（不含 YouTube 功能）

```bash
cd frontend
npm run dev
# http://localhost:5173
```

### 完整功能開發（含後端）

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

## 驗證設定

### 檢查 SharedArrayBuffer

開啟瀏覽器 Console，輸入：

```javascript
console.log('crossOriginIsolated:', window.crossOriginIsolated);
// 應顯示: crossOriginIsolated: true
```

### 檢查 WebGPU（可選）

```javascript
if ('gpu' in navigator) {
  console.log('WebGPU: ✅ 支援（高效能模式）');
} else {
  console.log('WebGPU: ❌ 不支援（將使用 WASM 模式）');
}
```

## 核心流程

### 1. 本地檔案處理流程

```typescript
// 使用 useLocalProcessor composable
const { processUpload, state } = useLocalProcessor();

// 處理影片
const songId = await processUpload(file, '歌曲標題');

// state 會自動更新進度
// state.stage: 'extracting' → 'separating' → 'saving'
// state.progress: 0-100
```

### 2. YouTube 處理流程（Docker 模式）

```typescript
// 先檢查後端
const { available } = await api.checkHealth();

if (available) {
  const songId = await processYouTube(youtubeUrl);
}
```

### 3. 混音播放

```typescript
// 從 IndexedDB 載入
const song = await storageService.getSong(songId);

// 使用現有 AudioMixer 元件
<AudioMixer
  :tracks="song.tracks"
  :video-element="videoRef"
  @ready="onMixerReady"
/>
```

### 4. 下載輸出

```typescript
// WAV（純 Web Audio API）
const wavBuffer = await audioExportService.mixToWav(tracks, duration);

// MP3（lamejs）
const mp3Blob = await audioExportService.mixToMp3(tracks, duration, 128);

// MP4（ffmpeg.wasm 或後端 FFmpeg）
if (backendAvailable) {
  const mp4 = await api.mergeBackend(video, audio, 'mp4');
} else {
  const mp4 = await ffmpegService.mergeVideoAudio(video, audio, 'mp4');
}
```

## 部署

### GitHub Pages（純靜態）

```bash
cd frontend
npm run build
# 將 dist/ 部署到 GitHub Pages
# coi-serviceworker.js 會自動處理 COOP/COEP
```

**注意**: 純靜態模式無 YouTube 功能，使用者需自行下載影片後上傳。

### Docker（完整功能）

```bash
docker compose up -d
# http://localhost:8080
```

## 常見問題

### SharedArrayBuffer 不可用

1. 確認 `coi-serviceworker.js` 在 `public/` 目錄
2. 確認 `index.html` 有引入（放在 `<head>` 最前面）
3. 確認使用 HTTPS 或 localhost

### demucs 模型下載很慢

模型約 172MB，首次下載需要時間。下載成功後會快取到 Cache API。

### 處理大檔案時瀏覽器卡頓

建議檔案大小 < 100MB，影片長度 < 10 分鐘。如果經常處理大檔案，請使用 Docker 部署模式。
