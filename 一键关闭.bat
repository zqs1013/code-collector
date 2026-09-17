@echo off
cd /d "%~dp0"
if not exist "%~dp0stop.bat" (
  echo stop.bat missing
  pause
  exit /b 1
)
call "%~dp0stop.bat"
