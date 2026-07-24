@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22.12 or newer is required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 goto :error

echo Starting AI Outfit Studio...
call npm run dev
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo [ERROR] Setup or startup failed. Review the messages above.
pause
exit /b 1
