@echo off
chcp 65001 >nul
cd /d "%~dp0backend"

echo ==========================================================
echo  Yangzhu Configurator - Backend AI Server
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
echo Starting API Server at http://127.0.0.1:8000
echo Press Ctrl+C to stop the server.
echo.
"venv\Scripts\python.exe" main.py
pause
