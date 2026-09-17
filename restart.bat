@echo off
cd /d "%~dp0"
title CodeCollector Restart
echo ========================================
echo   CodeCollector Restart
echo ========================================
echo.
echo Dir: %CD%
echo.

echo [1/2] Force stop old service...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-service.ps1"
if errorlevel 1 (
  echo [WARN] stop script reported issues, continue anyway
)
echo [1/2] Done.
echo.
echo [2/2] Starting...
echo.

if not exist "%~dp0start.bat" (
  echo [ERROR] start.bat missing
  pause
  exit /b 1
)

call "%~dp0start.bat"
