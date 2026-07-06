@echo off
chcp 65001 >nul
title 頌禮美編級 AI 智能刀模地端引擎 (Songli AI Configurator Engine)
cd /d "%~dp0backend"

echo ===============================================================================
echo   SONGLI AI CONFIGURATOR - 頌禮美編級 AI 智能刀模地端引擎
echo ===============================================================================
echo   [AI 大腦狀態] 成功掛載 songli_diecut_v1.model (v1.0-alpha)
echo   [專屬授權商品] biz_thick (厚切電子票證專屬 - 嚴守商品隔離)
echo   [演算法核心] 3次貝茲自適應張力平滑 (Tension=0.65+)
echo   [黃金耳孔] 實戰優化半徑 2.7 mm (防斷裂穿扣金屬圈專用)
echo ===============================================================================
echo.

if exist "venv\Scripts\python.exe" (
    "venv\Scripts\python.exe" --version >nul 2>&1
    if errorlevel 1 (
        echo Rebuilding virtual environment...
        rmdir /s /q venv
        goto :create_venv
    )
    goto :start_server
) else (
    goto :create_venv
)

:create_venv
echo Creating Python virtual environment...
python -m venv venv
if errorlevel 1 (
    echo Error: Failed to create venv. Please ensure Python 3.10+ is installed.
    pause
    exit /b 1
)

echo Installing required packages (this may take 1-3 minutes)...
call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
    echo Error: Failed to install packages.
    pause
    exit /b 1
)
echo Environment setup completed!

:start_server
echo.
echo [SYSTEM] 正在啟動 AI GPU 算力 API 伺服器於 http://127.0.0.1:8000 ...
echo [SYSTEM] 隨時監聽前端網頁之即時刀模與渲染請求...
echo [SYSTEM] 按下 Ctrl+C 可隨時停止伺服器。
echo.
"venv\Scripts\python.exe" main.py
pause
