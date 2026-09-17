@echo off
cd /d "%~dp0"
if not exist "%~dp0restart.bat" (
  echo restart.bat missing
  pause
  exit /b 1
)
call "%~dp0restart.bat"
