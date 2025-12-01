# 精簡版 Docker image - 僅 YouTube 下載代理
# 所有媒體處理（FFmpeg、Demucs）皆在前端執行

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --production=false

COPY frontend/ .
RUN npm run build

# Stage 2: Final image (Alpine - 最小化)
FROM python:3.11-alpine

# 安裝最小依賴
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl

WORKDIR /app

# 安裝 Python 依賴
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製後端（僅 YouTube 代理）
COPY backend/app/ ./app/

# 複製前端建置結果
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# 複製設定檔
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# 建立暫存目錄（下載後立即刪除）
RUN mkdir -p /tmp/youtube-downloads

# 環境變數
ENV PYTHONUNBUFFERED=1

EXPOSE 80

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/api/v1/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
