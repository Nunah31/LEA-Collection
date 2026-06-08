@echo off
echo Starting Collection App...
start "Collection - Server" cmd /k "cd /d %~dp0server && npm start"
timeout /t 3 >nul
start "Collection - Client" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 4 >nul
start http://localhost:5173
