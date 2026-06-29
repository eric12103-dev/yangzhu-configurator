@echo off
chcp 65001 >nul
echo ==========================================================
echo    頌禮-客製化預覽 後端 AI 引擎啟動中...
echo    (biz_thick 厚切電子票證 GPU 去背與刀模服務)
echo ==========================================================
echo.
cd /d "%~dp0backend"

REM 檢查 venv 中的 python.exe 是否可正常執行（路徑是否正確）
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe --version >nul 2>&1
    if errorlevel 1 (
        echo 偵測到 venv 路徑不符，重建中（套件已快取，速度快）...
        rmdir /s /q venv
        goto :create_venv
    )
    echo ✅ 虛擬環境正常，直接啟動...
    goto :start_server
) else (
    goto :create_venv
)

:create_venv
echo 建立 Python 虛擬環境中...
python -m venv venv
if errorlevel 1 (
    echo ❌ 建立 venv 失敗！請確認 Python 3.10 以上已安裝。
    pause
    exit /b 1
)
echo 安裝所有必要套件中（套件已快取，約 1~3 分鐘）...
call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ 套件安裝失敗！請檢查網路連線後重試。
    pause
    exit /b 1
)
echo.
echo ✅ 環境建立完成！

:start_server
call venv\Scripts\activate.bat
echo.
echo ✅ 啟動 API 伺服器...
echo    服務網址：http://127.0.0.1:8000
echo    按 Ctrl+C 可停止伺服器
echo.
python main.py
pause
