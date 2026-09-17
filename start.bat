@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title CodeCollector
echo ========================================
echo   CodeCollector Start
echo ========================================
echo.
echo Dir: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server.js" (
  echo [ERROR] server.js not found. Put this bat in project root.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/3] npm install ...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
) else (
  echo [1/3] node_modules OK
)

if not exist "client\node_modules\" (
  echo [2/3] client npm install ...
  call npm --prefix client install
  if errorlevel 1 (
    echo [ERROR] client npm install failed
    pause
    exit /b 1
  )
) else (
  echo [2/3] client node_modules OK
)

if not exist "client\dist\index.html" (
  echo [3/3] build web ...
  call npm run build:web
  if errorlevel 1 (
    echo [ERROR] build failed
    pause
    exit /b 1
  )
) else (
  echo [3/3] client\dist OK
)

set "USEPORT=3000"
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 set "USEPORT=3001"
netstat -ano | findstr ":!USEPORT!" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  if "!USEPORT!"=="3001" set "USEPORT=5000"
)

echo.
echo Starting http://127.0.0.1:!USEPORT!
echo Admin: admin
echo Close this window to stop.
echo.

set "PORT=!USEPORT!"
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://127.0.0.1:!USEPORT!"
node server.js
echo.
echo Server exited. Code=!ERRORLEVEL!
pause
