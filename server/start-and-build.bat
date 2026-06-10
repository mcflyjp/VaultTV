@echo off
title VaultTV Server — Setup
cd /d "%~dp0"

echo.
echo  VaultTV Server — First Time Setup
echo  ===================================
echo.

REM Install server dependencies
echo  [1/3] Installing server dependencies...
call npm install
if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )

REM Build the React web app
echo.
echo  [2/3] Building VaultTV web app...
cd /d "%~dp0.."
call npm install
if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )
call npm run build
if errorlevel 1 ( echo ERROR: Build failed — check that VITE_TMDB_KEY is set in .env & pause & exit /b 1 )

REM Start the server
echo.
echo  [3/3] Starting VaultTV Server...
cd /d "%~dp0"
node index.js

echo.
echo  VaultTV Server stopped. Press any key to close.
pause > nul
