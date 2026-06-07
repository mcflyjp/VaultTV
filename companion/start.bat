@echo off
title VaultTV Companion
echo Starting VaultTV Companion Server...
echo Watching folders from config.json
echo Press Ctrl+C to stop (VaultTV will still work without it)
echo.
node "%~dp0server.js"
pause
