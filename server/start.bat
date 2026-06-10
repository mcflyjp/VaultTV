@echo off
title VaultTV Server
cd /d "%~dp0"

echo.
echo  VVVVV   VVVVV                   ltTTTTTTTl        VTV
echo   Starting VaultTV Server...
echo.

REM Install dependencies if node_modules is missing
if not exist "node_modules" (
  echo  Installing dependencies...
  call npm install
  echo.
)

REM Start the server
node index.js

REM If the server exits unexpectedly, pause so the user can read the error
echo.
echo  VaultTV Server stopped. Press any key to close.
pause > nul
