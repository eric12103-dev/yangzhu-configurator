@echo off
title REMBG Server
echo ========================================
echo   REMBG Server Starting...
echo   Close this window to stop server
echo ========================================
echo.
cd /d "%~dp0"
"C:\Users\admin\AppData\Local\Programs\Python\Python312\python.exe" rembg_server.py
echo.
echo Server stopped. Press any key to close...
pause >nul
