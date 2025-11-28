#!/bin/bash
#
# 人聲去除服務 - 本地一鍵執行腳本
#
# 用法:
#   ./run.sh          # 啟動服務 (CPU 模式)
#   ./run.sh --gpu    # 啟動服務 (GPU 模式)
#   ./run.sh stop     # 停止服務
#   ./run.sh logs     # 查看日誌
#   ./run.sh clean    # 清理所有資料
#

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 預設值
REGISTRY="${REGISTRY:-ghcr.io/timcsy/vocal-remover}"
TAG="${TAG:-latest}"
GPU_MODE=false
COMPOSE_FILE="docker-compose.local.yaml"

# 顯示 banner
show_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════╗"
    echo "║       🎤 人聲去除服務 Vocal Remover      ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 顯示幫助
show_help() {
    echo "用法: $0 [選項] [命令]"
    echo ""
    echo "命令:"
    echo "  start, up     啟動服務 (預設)"
    echo "  stop, down    停止服務"
    echo "  restart       重啟服務"
    echo "  logs          查看日誌"
    echo "  status        查看狀態"
    echo "  clean         清理所有資料和映像檔"
    echo ""
    echo "選項:"
    echo "  --gpu         使用 GPU 模式 (需要 NVIDIA GPU)"
    echo "  --cpu         使用 CPU 模式 (預設)"
    echo "  --tag TAG     指定映像標籤 (預設: latest)"
    echo "  -h, --help    顯示此幫助訊息"
    echo ""
    echo "範例:"
    echo "  $0                # CPU 模式啟動"
    echo "  $0 --gpu          # GPU 模式啟動"
    echo "  $0 stop           # 停止服務"
    echo "  $0 logs           # 查看即時日誌"
}

# 檢查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}錯誤: 未安裝 Docker${NC}"
        echo "請先安裝 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}錯誤: Docker 未運行${NC}"
        echo "請啟動 Docker Desktop 或 Docker 服務"
        exit 1
    fi
}

# 檢查 GPU
check_gpu() {
    if [ "$GPU_MODE" = true ]; then
        if ! command -v nvidia-smi &> /dev/null; then
            echo -e "${YELLOW}警告: 未偵測到 NVIDIA GPU，將使用 CPU 模式${NC}"
            GPU_MODE=false
        else
            echo -e "${GREEN}偵測到 NVIDIA GPU${NC}"
            nvidia-smi --query-gpu=name --format=csv,noheader | head -1
        fi
    fi
}

# 生成 docker-compose 檔案
generate_compose() {
    local device="cpu"
    local gpu_config=""

    if [ "$GPU_MODE" = true ]; then
        device="cuda"
        gpu_config='
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]'
    fi

    cat > "$COMPOSE_FILE" << EOF
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: ${REGISTRY}-api:${TAG}
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - REDIS_URL=redis://redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - MINIO_BUCKET=vocal-remover
      - MINIO_SECURE=false
      - DEVICE=${device}
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  worker:
    image: ${REGISTRY}-api:${TAG}
    restart: unless-stopped
    command: rq worker --url redis://redis:6379/0 default
    environment:
      - REDIS_URL=redis://redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - MINIO_BUCKET=vocal-remover
      - MINIO_SECURE=false
      - DEVICE=${device}
    volumes:
      - worker-tmp:/tmp${gpu_config}
    depends_on:
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  frontend:
    image: ${REGISTRY}-frontend:${TAG}
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - api

volumes:
  redis-data:
  minio-data:
  worker-tmp:
EOF
}

# 啟動服務
start_service() {
    echo -e "${BLUE}正在啟動服務...${NC}"

    check_gpu
    generate_compose

    echo -e "${BLUE}拉取最新映像檔...${NC}"
    docker compose -f "$COMPOSE_FILE" pull

    echo -e "${BLUE}啟動容器...${NC}"
    docker compose -f "$COMPOSE_FILE" up -d

    echo ""
    echo -e "${GREEN}✓ 服務啟動成功！${NC}"
    echo ""
    echo -e "  網頁介面: ${BLUE}http://localhost:8080${NC}"
    echo -e "  API 端點: ${BLUE}http://localhost:8000${NC}"
    echo ""
    if [ "$GPU_MODE" = true ]; then
        echo -e "  模式: ${GREEN}GPU (CUDA)${NC}"
    else
        echo -e "  模式: ${YELLOW}CPU${NC} (處理速度較慢)"
    fi
    echo ""
    echo -e "  查看日誌: ${YELLOW}$0 logs${NC}"
    echo -e "  停止服務: ${YELLOW}$0 stop${NC}"
}

# 停止服務
stop_service() {
    echo -e "${BLUE}正在停止服務...${NC}"
    if [ -f "$COMPOSE_FILE" ]; then
        docker compose -f "$COMPOSE_FILE" down
    fi
    echo -e "${GREEN}✓ 服務已停止${NC}"
}

# 查看日誌
show_logs() {
    if [ -f "$COMPOSE_FILE" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f
    else
        echo -e "${YELLOW}服務尚未啟動${NC}"
    fi
}

# 查看狀態
show_status() {
    if [ -f "$COMPOSE_FILE" ]; then
        docker compose -f "$COMPOSE_FILE" ps
    else
        echo -e "${YELLOW}服務尚未啟動${NC}"
    fi
}

# 清理
clean_all() {
    echo -e "${YELLOW}警告: 這將刪除所有資料和映像檔${NC}"
    read -p "確定要繼續嗎？ (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}停止服務...${NC}"
        if [ -f "$COMPOSE_FILE" ]; then
            docker compose -f "$COMPOSE_FILE" down -v --rmi all
            rm -f "$COMPOSE_FILE"
        fi
        echo -e "${GREEN}✓ 清理完成${NC}"
    else
        echo "取消操作"
    fi
}

# 主程式
main() {
    local command="start"

    # 解析參數
    while [[ $# -gt 0 ]]; do
        case $1 in
            --gpu)
                GPU_MODE=true
                shift
                ;;
            --cpu)
                GPU_MODE=false
                shift
                ;;
            --tag)
                TAG="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            start|up)
                command="start"
                shift
                ;;
            stop|down)
                command="stop"
                shift
                ;;
            restart)
                command="restart"
                shift
                ;;
            logs)
                command="logs"
                shift
                ;;
            status|ps)
                command="status"
                shift
                ;;
            clean)
                command="clean"
                shift
                ;;
            *)
                echo -e "${RED}未知參數: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    show_banner
    check_docker

    case $command in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            stop_service
            start_service
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        clean)
            clean_all
            ;;
    esac
}

main "$@"
