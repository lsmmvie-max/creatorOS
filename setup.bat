@echo off
title CreatorOS Setup
echo.
echo  ==========================================
echo   CreatorOS - First Time Setup
echo  ==========================================
echo.
echo [1/4] Checking Node.js...
node --version || (echo ERROR: Node.js not found. Install from nodejs.org && pause && exit)
echo [2/4] Checking Bun...
bun --version || (echo ERROR: Bun not found. Install from bun.sh && pause && exit)
echo [3/4] Installing OmniMediaRoute dependencies...
cd apps\image-router\server && bun install && cd ..\..\..
echo [4/4] Installing editor dependencies...
cd apps\editor && npm install && cd ..\..
echo.
echo  Setup complete! Run start.bat to launch CreatorOS.
pause
