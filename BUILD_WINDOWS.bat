@echo off
setlocal
cd /d "%~dp0"

call npm install
if errorlevel 1 goto :error

call npm run package:win
if errorlevel 1 goto :error

echo.
echo Build completed. Check apps\desktop\release\
pause
exit /b 0

:error
echo.
echo [ERROR] Windows build failed. Review the messages above.
pause
exit /b 1
