@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 人聲去除服務 - Windows 本地執行腳本
::
:: 用法:
::   run.bat          啟動服務 (CPU 模式)
::   run.bat --gpu    啟動服務 (GPU 模式)
::   run.bat stop     停止服務
::   run.bat logs     查看日誌
::   run.bat clean    清理所有資料

set REGISTRY=ghcr.io/timcsy/vocal-remover
set TAG=latest
set GPU_MODE=false
set COMPOSE_FILE=docker-compose.local.yaml
set COMMAND=start

:: 解析參數
:parse_args
if "%~1"=="" goto run_command
if /i "%~1"=="--gpu" (
    set GPU_MODE=true
    shift
    goto parse_args
)
if /i "%~1"=="--cpu" (
    set GPU_MODE=false
    shift
    goto parse_args
)
if /i "%~1"=="start" (
    set COMMAND=start
    shift
    goto parse_args
)
if /i "%~1"=="stop" (
    set COMMAND=stop
    shift
    goto parse_args
)
if /i "%~1"=="logs" (
    set COMMAND=logs
    shift
    goto parse_args
)
if /i "%~1"=="status" (
    set COMMAND=status
    shift
    goto parse_args
)
if /i "%~1"=="clean" (
    set COMMAND=clean
    shift
    goto parse_args
)
if /i "%~1"=="-h" goto show_help
if /i "%~1"=="--help" goto show_help
echo 未知參數: %~1
goto show_help

:show_help
echo.
echo 人聲去除服務 - 本地執行腳本
echo.
echo 用法: run.bat [選項] [命令]
echo.
echo 命令:
echo   start    啟動服務 (預設)
echo   stop     停止服務
echo   logs     查看日誌
echo   status   查看狀態
echo   clean    清理所有資料
echo.
echo 選項:
echo   --gpu    使用 GPU 模式
echo   --cpu    使用 CPU 模式 (預設)
echo   -h       顯示此幫助
echo.
goto end

:run_command
echo.
echo ══════════════════════════════════════════
echo        人聲去除服務 Vocal Remover
echo ══════════════════════════════════════════
echo.

:: 檢查 Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [錯誤] Docker 未運行，請啟動 Docker Desktop
    goto end
)

if "%COMMAND%"=="start" goto start_service
if "%COMMAND%"=="stop" goto stop_service
if "%COMMAND%"=="logs" goto show_logs
if "%COMMAND%"=="status" goto show_status
if "%COMMAND%"=="clean" goto clean_all
goto end

:start_service
echo 正在啟動服務...

:: 設定裝置
set DEVICE=cpu
if "%GPU_MODE%"=="true" (
    nvidia-smi >nul 2>&1
    if errorlevel 1 (
        echo [警告] 未偵測到 NVIDIA GPU，將使用 CPU 模式
        set GPU_MODE=false
    ) else (
        set DEVICE=cuda
        echo [資訊] 偵測到 NVIDIA GPU
    )
)

:: 生成 docker-compose 檔案
call :generate_compose

echo 拉取最新映像檔...
docker compose -f %COMPOSE_FILE% pull

echo 啟動容器...
docker compose -f %COMPOSE_FILE% up -d

echo.
echo [成功] 服務啟動成功！
echo.
echo   網頁介面: http://localhost:8080
echo   API 端點: http://localhost:8000
echo.
if "%GPU_MODE%"=="true" (
    echo   模式: GPU ^(CUDA^)
) else (
    echo   模式: CPU ^(處理速度較慢^)
)
echo.
echo   查看日誌: run.bat logs
echo   停止服務: run.bat stop
goto end

:stop_service
echo 正在停止服務...
if exist %COMPOSE_FILE% (
    docker compose -f %COMPOSE_FILE% down
)
echo [成功] 服務已停止
goto end

:show_logs
if exist %COMPOSE_FILE% (
    docker compose -f %COMPOSE_FILE% logs -f
) else (
    echo [提示] 服務尚未啟動
)
goto end

:show_status
if exist %COMPOSE_FILE% (
    docker compose -f %COMPOSE_FILE% ps
) else (
    echo [提示] 服務尚未啟動
)
goto end

:clean_all
echo [警告] 這將刪除所有資料和映像檔
set /p CONFIRM=確定要繼續嗎？ (y/N):
if /i not "%CONFIRM%"=="y" (
    echo 取消操作
    goto end
)
if exist %COMPOSE_FILE% (
    docker compose -f %COMPOSE_FILE% down -v --rmi all
    del %COMPOSE_FILE%
)
echo [成功] 清理完成
goto end

:generate_compose
:: 建立 docker-compose 檔案
(
echo version: '3.8'
echo.
echo services:
echo   redis:
echo     image: redis:7-alpine
echo     restart: unless-stopped
echo     volumes:
echo       - redis-data:/data
echo.
echo   minio:
echo     image: minio/minio:latest
echo     restart: unless-stopped
echo     command: server /data --console-address ":9001"
echo     environment:
echo       MINIO_ROOT_USER: minioadmin
echo       MINIO_ROOT_PASSWORD: minioadmin
echo     volumes:
echo       - minio-data:/data
echo.
echo   api:
echo     image: %REGISTRY%-api:%TAG%
echo     restart: unless-stopped
echo     ports:
echo       - "8000:8000"
echo     environment:
echo       - REDIS_URL=redis://redis:6379/0
echo       - MINIO_ENDPOINT=minio:9000
echo       - MINIO_ACCESS_KEY=minioadmin
echo       - MINIO_SECRET_KEY=minioadmin
echo       - MINIO_BUCKET=vocal-remover
echo       - MINIO_SECURE=false
echo       - DEVICE=%DEVICE%
echo     depends_on:
echo       - redis
echo       - minio
echo.
echo   worker:
echo     image: %REGISTRY%-api:%TAG%
echo     restart: unless-stopped
echo     command: rq worker --url redis://redis:6379/0 default
echo     environment:
echo       - REDIS_URL=redis://redis:6379/0
echo       - MINIO_ENDPOINT=minio:9000
echo       - MINIO_ACCESS_KEY=minioadmin
echo       - MINIO_SECRET_KEY=minioadmin
echo       - MINIO_BUCKET=vocal-remover
echo       - MINIO_SECURE=false
echo       - DEVICE=%DEVICE%
echo     volumes:
echo       - worker-tmp:/tmp
echo     depends_on:
echo       - redis
echo       - minio
echo.
echo   frontend:
echo     image: %REGISTRY%-frontend:%TAG%
echo     restart: unless-stopped
echo     ports:
echo       - "8080:80"
echo     depends_on:
echo       - api
echo.
echo volumes:
echo   redis-data:
echo   minio-data:
echo   worker-tmp:
) > %COMPOSE_FILE%
goto :eof

:end
endlocal
