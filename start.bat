@echo off
title CreatorOS
echo.
echo  ==========================================
echo   CreatorOS - Lee Animations Studio
echo  ==========================================
echo.
echo  Starting all services...
echo   - OmniRoute AI Gateway  (localhost:20128)
echo   - Automation Server     (localhost:3737)
echo   - FreeCut Editor        (localhost:5173)
echo.
echo  Open http://localhost:5173 in Chrome/Edge
echo  Press Ctrl+C to stop all services
echo.
npm start
pause
