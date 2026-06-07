@echo off
title VaultTV Companion

:: Kill any leftover node process on port 7842
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :7842 ^| findstr LISTENING') do (
  echo Stopping previous instance (PID %%a)...
  taskkill /PID %%a /F >nul 2>&1
)

echo Starting VaultTV Companion Server...
echo Watching folders from config.json
echo Press Ctrl+C to stop (VaultTV will still work without it)
echo.
node "%~dp0server.js"
pause
