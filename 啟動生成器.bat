@echo off
chcp 65001 >nul
title Songli AI Diecut Engine - biz_thick
cd /d "%~dp0backend"

echo ==========================================================
echo  Songli AI Configurator - Diecut Engine v1.0
echo ==========================================================
echo  [AI Status]  songli_diecut_v1.model Loaded
echo  [Target]     biz_thick - Thick Acrylic Card Only
echo  [Algorithm]  Bezier Tension Smoothing + 2.7mm Hole
echo ==========================================================
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
echo [SYSTEM] Starting AI Server at http://127.0.0.1:8000 ...
echo [SYSTEM] Listening for realtime preview and render requests...
echo [SYSTEM] Press Ctrl+C to stop the server.
echo.
"venv\Scripts\python.exe" main.py
pause
