# Research: 純前端人聲去除服務架構改造

**Date**: 2025-12-01
**Feature**: 005-frontend-processing

## 研究項目

### 1. demucs-web - 瀏覽器音源分離

**Decision**: 使用 `demucs-web` npm 套件

**Rationale**: 這是專案擁有者自行開發的套件，已封裝 ONNX Runtime Web + HTDemucs 模型，API 設計符合需求。

**Alternatives Considered**:
- gianlourbano/demucs-onnx: 需要自行整合，API 不如 demucs-web 完整
- 後端 Demucs: 不符合純前端架構目標

**Integration Pattern**:

```typescript
import * as ort from 'onnxruntime-web';
import { DemucsProcessor, CONSTANTS } from 'demucs-web';

// 初始化
const processor = new DemucsProcessor({
  ort,
  onProgress: (progress) => updateUI(progress * 100),
  onLog: (phase, msg) => console.log(`[${phase}] ${msg}`)
});

// 載入模型（延遲載入，首次處理時才下載）
await processor.loadModel(CONSTANTS.DEFAULT_MODEL_URL);

// 分離（輸入必須為 44100Hz 立體聲）
const result = await processor.separate(leftChannel, rightChannel);
// result: { drums, bass, other, vocals } - 每個都有 left/right Float32Array
```

**Key Constants**:
- `SAMPLE_RATE`: 44100 Hz（固定）
- 模型大小: ~172MB（Hugging Face CDN）
- 輸出: 4 軌（drums, bass, other, vocals）

---

### 2. ffmpeg.wasm 0.11.6 - 瀏覽器影音處理

**Decision**: 使用 ffmpeg.wasm 0.11.6 CDN 載入

**Rationale**: 0.11.6 版本 API 穩定，文件完善，0.12.x 有重大 API 變更且較不成熟。

**Alternatives Considered**:
- ffmpeg.wasm 0.12.x: API 不穩定，多執行緒支援有問題
- @ffmpeg/core-st: 單執行緒版本，不需要 SharedArrayBuffer 但效能差

**Integration Pattern**:

```html
<!-- CDN 載入 -->
<script src="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js"></script>
```

```typescript
const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({
  log: false,
  progress: ({ ratio }) => updateUI(ratio * 100)
});

await ffmpeg.load();

// 提取音頻 (MP4 → WAV 44.1kHz)
ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoBlob));
await ffmpeg.run(
  '-i', 'input.mp4',
  '-vn',
  '-acodec', 'pcm_s16le',
  '-ar', '44100',
  '-ac', '2',
  'output.wav'
);
const audioData = ffmpeg.FS('readFile', 'output.wav');

// 清理記憶體
ffmpeg.FS('unlink', 'input.mp4');
ffmpeg.FS('unlink', 'output.wav');
```

**合併影片與混音音訊**:

```typescript
ffmpeg.FS('writeFile', 'video.mp4', await fetchFile(videoBlob));
ffmpeg.FS('writeFile', 'audio.wav', audioBuffer);

await ffmpeg.run(
  '-i', 'video.mp4',
  '-i', 'audio.wav',
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-map', '0:v:0',
  '-map', '1:a:0',
  '-shortest',
  'output.mp4'
);

const result = ffmpeg.FS('readFile', 'output.mp4');
```

**Limitations**:
- 檔案大小建議 < 100MB
- 效能約原生 FFmpeg 的 1/5 ~ 1/10
- 不支援 H.265/HEVC 編碼
- 需要 COOP/COEP headers

---

### 3. lamejs - MP3 編碼

**Decision**: 使用 lamejs 進行純 JS MP3 編碼

**Rationale**: 輕量、純 JS 實作、不需要額外 WASM，適合 WAV → MP3 轉換。

**Alternatives Considered**:
- ffmpeg.wasm: 過度殺雞用牛刀，載入成本高
- Web Audio API: 不支援 MP3 編碼

**Integration Pattern**:

```typescript
import lamejs from 'lamejs';

function encodeToMp3(audioBuffer: AudioBuffer, bitrate = 128): Blob {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);

  const mp3Data: Int8Array[] = [];
  const sampleBlockSize = 1152;

  if (channels === 1) {
    // Mono
    const samples = float32ToInt16(audioBuffer.getChannelData(0));
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const chunk = samples.subarray(i, i + sampleBlockSize);
      const mp3Chunk = encoder.encodeBuffer(chunk);
      if (mp3Chunk.length > 0) mp3Data.push(mp3Chunk);
    }
  } else {
    // Stereo
    const left = float32ToInt16(audioBuffer.getChannelData(0));
    const right = float32ToInt16(audioBuffer.getChannelData(1));
    for (let i = 0; i < left.length; i += sampleBlockSize) {
      const leftChunk = left.subarray(i, i + sampleBlockSize);
      const rightChunk = right.subarray(i, i + sampleBlockSize);
      const mp3Chunk = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3Chunk.length > 0) mp3Data.push(mp3Chunk);
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) mp3Data.push(new Int8Array(finalChunk));

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, float32[i])) * 0x7fff;
  }
  return int16;
}
```

**Performance**: ~20x realtime (132 秒音訊約 6.5 秒編碼)

---

### 4. coi-serviceworker - COOP/COEP Headers

**Decision**: 使用 coi-serviceworker 處理 GitHub Pages 的 SharedArrayBuffer 需求

**Rationale**: GitHub Pages 不支援自訂 HTTP headers，coi-serviceworker 透過 Service Worker 注入所需 headers。

**Alternatives Considered**:
- Cloudflare Workers: 需要額外設定，增加複雜度
- @ffmpeg/core-st: 犧牲效能換取相容性，不推薦

**Integration Pattern**:

```html
<!-- 放在 <head> 最前面 -->
<script src="coi-serviceworker.js"></script>
```

**安裝步驟**:
1. 下載 `coi-serviceworker.js` 到 `frontend/public/`
2. 在 `index.html` 最前面引入
3. 首次載入會自動 reload 以啟用 headers

**關鍵限制**:
- 必須作為獨立檔案，不能 bundle
- 必須從同源提供（不能用 CDN）
- 僅 HTTPS 或 localhost

**驗證**:
```typescript
if (window.crossOriginIsolated) {
  console.log('✅ SharedArrayBuffer 可用');
} else {
  console.log('❌ SharedArrayBuffer 不可用');
}
```

---

### 5. IndexedDB - 本地持久化

**Decision**: 使用原生 IndexedDB API 搭配 Promise 封裝

**Rationale**: 不引入額外依賴（如 Dexie.js），保持簡潔。

**Schema**:

```typescript
const DB_NAME = 'sing-local-db';
const DB_VERSION = 1;

interface SongRecord {
  id: string;
  title: string;
  sourceType: 'youtube' | 'upload';
  sourceUrl?: string;
  duration: number;
  sampleRate: 44100;
  createdAt: Date;
  tracks: {
    drums: ArrayBuffer;
    bass: ArrayBuffer;
    other: ArrayBuffer;
    vocals: ArrayBuffer;
  };
  originalVideo?: ArrayBuffer;
  thumbnailUrl?: string;
}

// Store: songs (keyPath: id, indexes: createdAt, title)
```

**Storage API**:
```typescript
class StorageService {
  async init(): Promise<void>;
  async saveSong(song: SongRecord): Promise<void>;
  async getSong(id: string): Promise<SongRecord | null>;
  async getAllSongs(): Promise<SongRecord[]>;
  async deleteSong(id: string): Promise<void>;
  async getStorageUsage(): Promise<{ used: number; quota: number }>;
}
```

---

### 6. Web Audio API - WAV 輸出

**Decision**: 使用 OfflineAudioContext 進行混音並輸出 WAV

**Rationale**: 原生 API，無需額外依賴，適合離線渲染。

**Integration Pattern**:

```typescript
async function mixToWav(
  tracks: { buffer: AudioBuffer; volume: number }[],
  duration: number,
  sampleRate = 44100
): Promise<ArrayBuffer> {
  const offlineCtx = new OfflineAudioContext(2, duration * sampleRate, sampleRate);

  for (const track of tracks) {
    const source = offlineCtx.createBufferSource();
    source.buffer = track.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = track.volume;

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(0);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer);
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;

  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // WAV header...
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave samples...
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}
```

---

## 決策總結

| 技術領域 | 選擇 | 理由 |
|----------|------|------|
| 音源分離 | demucs-web | 專案自有套件，API 完整 |
| 影音處理 | ffmpeg.wasm 0.11.6 | API 穩定，文件完善 |
| MP3 編碼 | lamejs | 輕量純 JS，無額外依賴 |
| WAV 輸出 | Web Audio API | 原生支援，效能佳 |
| COOP/COEP | coi-serviceworker | 解決 GitHub Pages 限制 |
| 持久化 | IndexedDB | 原生 API，足夠簡單 |

---

## 待確認項目

無 - 所有技術決策已確認。
