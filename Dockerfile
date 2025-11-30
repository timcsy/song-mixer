# 005-frontend-processing Architecture
# Docker image for YouTube proxy and FFmpeg processing only
# Vocal separation is handled by the frontend (demucs-web)

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Stage 2: Final image (lightweight - no Demucs/PyTorch)
FROM python:3.11-slim

# Install system dependencies (minimal - only FFmpeg for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    nginx \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend/app/ ./app/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Remove default nginx config
RUN rm -f /etc/nginx/sites-enabled/default

# Create data directories
RUN mkdir -p /data/uploads /data/results && \
    chmod -R 755 /data

# Environment variables
ENV DATA_DIR=/data
ENV UPLOADS_DIR=/data/uploads
ENV RESULTS_DIR=/data/results

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/api/v1/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
