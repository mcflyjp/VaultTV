@echo off
title VaultTV Companion
echo DEBUG: bat file started
echo Node path check:
"C:\Program Files\nodejs\node.exe" --version
if errorlevel 1 (
  echo ERROR: node.exe not found or failed
  pause
  exit /b 1
)
echo Node OK. Checking server.js exists:
if not exist "%~dp0server.js" (
  echo ERROR: server.js not found at %~dp0server.js
  pause
  exit /b 1
)
echo server.js found. Checking node_modules:
if not exist "%~dp0node_modules" (
  echo ERROR: node_modules missing - run: npm install in companion folder
  pause
  exit /b 1
)
echo All checks passed. Starting server...
echo.

:: Kill any leftover node process on port 7842
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":7842"') do taskkill /PID %%a /F >nul 2>&1

"C:\Program Files\nodejs\node.exe" "%~dp0server.js"
echo.
echo Server exited with code %errorlevel%
pause
