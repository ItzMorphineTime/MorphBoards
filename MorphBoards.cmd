@echo off
title MorphBoards
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found in PATH.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run^)...
  call npm install
)

if not exist client\dist\index.html (
  echo Building client ^(first run^)...
  call npm run build
)

echo Starting MorphBoards at http://127.0.0.1:3001 ...
start "" /b cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:3001"
call npm run start -w server
