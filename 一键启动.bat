@echo off
cd /d "%~dp0"
if not exist "%~dp0start.bat" (
  echo start.bat missing
  pause
  exit /b 1
)
call "%~dp0start.bat"
