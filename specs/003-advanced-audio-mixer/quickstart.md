# 快速開始：進階音軌控制功能

## 前置需求

### 後端
- Python 3.11+
- FFmpeg（含 librubberband）
- 現有 song-mixer 環境

### 前端
- Node.js 18+
- npm/yarn

## 安裝新依賴

### 前端
```bash
cd frontend
npm install tone
```

### 後端
無需新增 Python 套件。確認 Docker 映像包含 librubberband：
```dockerfile
RUN apt-get update && apt-get install -y librubberband-dev
```

## 開發流程

### 1. 後端開發順序

```
1. 修改 models/job.py
   - 新增 TrackPaths 類別
   - Job 新增 track_paths 欄位

2. 修改 services/separator.py
   - 分離時保存四軌（drums, bass, other, vocals）

3. 新增 services/mixer.py
   - 實作 AudioMixer 類別
   - FFmpeg 混音指令

4. 新增 api/v1/tracks.py
   - GET /jobs/{id}/tracks
   - GET /jobs/{id}/tracks/{name}

5. 修改 api/v1/jobs.py
   - POST /jobs/{id}/mix
   - GET /jobs/{id}/mix/{mix_id}
   - GET /jobs/{id}/mix/{mix_id}/download
```

### 2. 前端開發順序

```
1. 安裝 Tone.js
   npm install tone

2. 新增 composables/useWebAudio.ts
   - 音軌載入與播放
   - 音量控制
   - Pitch shift

3. 新增 composables/useAudioSync.ts
   - 影片與音頻同步

4. 新增 components/AudioMixer/
   - AudioMixer.vue（主容器）
   - TrackSlider.vue（音量滑桿）
   - PitchControl.vue（升降 Key）

5. 修改 components/ResultView.vue
   - 整合 AudioMixer
   - 下載格式選擇
```

## API 使用範例

### 取得音軌資訊
```bash
curl http://localhost:8000/api/v1/jobs/{job_id}/tracks
```
回應：
```json
{
  "tracks": ["drums", "bass", "other", "vocals"],
  "sample_rate": 44100,
  "duration": 180.5
}
```

### 串流音軌
```bash
curl -H "Range: bytes=0-1023" \
  http://localhost:8000/api/v1/jobs/{job_id}/tracks/drums \
  -o drums_partial.wav
```

### 產生混音
```bash
curl -X POST http://localhost:8000/api/v1/jobs/{job_id}/mix \
  -H "Content-Type: application/json" \
  -d '{
    "drums_volume": 1.0,
    "bass_volume": 1.0,
    "other_volume": 1.0,
    "vocals_volume": 0.0,
    "pitch_shift": 2,
    "output_format": "mp4"
  }'
```
回應：
```json
{
  "mix_id": "abc123",
  "status": "processing",
  "download_url": null,
  "cached": false
}
```

### 下載混音
```bash
curl http://localhost:8000/api/v1/jobs/{job_id}/mix/{mix_id}/download \
  -o output.mp4
```

## 前端 Tone.js 範例

```typescript
import * as Tone from 'tone';

// 初始化
await Tone.start();

// 建立 pitch shift
const pitchShift = new Tone.PitchShift({
  pitch: 0,
  windowSize: 0.1
}).toDestination();

// 載入音軌
const drumsPlayer = new Tone.Player('/api/v1/jobs/{id}/tracks/drums');
const drumsGain = new Tone.Gain(1.0);
drumsPlayer.connect(drumsGain).connect(pitchShift);

// 播放
drumsPlayer.start();

// 調整音量
drumsGain.gain.value = 0.5;

// 調整音高
pitchShift.pitch = 2;  // 升 2 個半音
```

## 測試

### 後端測試
```bash
cd backend
pytest tests/ -v
```

### 手動測試清單
- [ ] 上傳影片後可看到四軌
- [ ] 調整音量滑桿即時生效
- [ ] 升降 Key 即時生效
- [ ] 導唱開關正常運作
- [ ] 下載 MP4 格式正確
- [ ] 下載 MP3 格式正確
- [ ] 下載 M4A 格式正確
- [ ] 下載 WAV 格式正確
- [ ] 相同設定使用快取
