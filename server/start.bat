@echo off
title VaultTV Server
cd /d "%~dp0"

echo.
echo  VVVVV   VVVVV                   ltTTTTTTTl        VTV
echo   Starting VaultTV Server...
echo.

REM Check if something is already running on port 8080
netstat -ano | findstr ":8080 " | findstr "LISTENING" > nul 2>&1
if %errorlevel%==0 (
  echo  ERROR: Port 8080 is already in use.
  echo  If VaultTV Server started at login, check the system tray.
  echo.
  pause > nul
  exit /b 1
)

REM Install dependencies if node_modules is missing
if not exist "node_modules" (
  echo  Installing dependencies...
  call npm install
  echo.
)

REM Launch tray icon completely hidden via VBScript shim (no cmd flash)
start "" wscript.exe "%~dp0launch-tray.vbs"

REM Start the server in the foreground
node index.js

REM If the server exits unexpectedly, pause so the user can read the error
echo.
echo  VaultTV Server stopped. Press any key to close.
pause > nul
