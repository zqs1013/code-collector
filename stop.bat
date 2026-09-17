@echo off
cd /d "%~dp0"
title CodeCollector Stop
echo ========================================
echo   CodeCollector Stop
echo ========================================
echo.
echo Dir: %CD%
echo.
echo Stopping service...
echo.

if exist "%~dp0scripts\stop-service.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-service.ps1"
) else (
  echo [ERROR] scripts\stop-service.ps1 missing
  pause
  exit /b 1
)

echo.
echo Service stopped.
pause
