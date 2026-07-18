@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
title Universe Federation

REM Double-click safe launcher: always go through PowerShell so PATH/nvm work.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo Launcher exited with code %EC%
  pause
)
endlocal & exit /b %EC%
