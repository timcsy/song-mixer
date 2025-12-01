# Quickstart: 單一 Docker 容器架構

## 快速開始

### 建置

```bash
docker build -t song-mixer .
```

### 執行

```bash
docker run -p 8080:80 song-mixer
```

### 使用

瀏覽器開啟 http://localhost:8080

## 使用 docker-compose

```bash
docker-compose up -d
```

## 停止

```bash
docker stop <container_id>
# 或
docker-compose down
```

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| DEVICE | cpu | 運算裝置 (cpu/cuda) |
| MAX_CONCURRENT_JOBS | 2 | 最大並發任務數 |

## 使用 GPU（選配）

```bash
docker run --gpus all -p 8080:80 -e DEVICE=cuda song-mixer
```

## 注意事項

- 處理結果為暫時性，容器停止後資料消失
- 建議單次處理一個任務以獲得最佳效能
- CPU 模式下處理時間較長，請耐心等待
