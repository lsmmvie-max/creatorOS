@echo off
title CreatorOS
echo.
echo  ==========================================
echo   CreatorOS - Lee Animations Studio
echo  ==========================================
echo.
echo  Clearing ports...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3737 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":20128 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
echo  Starting all services...
echo   - OmniRoute AI Gateway  (localhost:20128)
echo   - Automation Server     (localhost:3737)
echo   - FreeCut Editor        (localhost:5173)
echo.
echo  Open http://localhost:5173 in Chrome/Edge
echo  Press Ctrl+C to stop all services
echo.
rem OmniRoute requires manual setup — use start:no-omni until it's configured
npm run start:no-omni
pause
