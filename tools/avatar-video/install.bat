@echo off
rem Double-click to install the avatar video maker. Safe to run again: it only redoes what is missing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 (
  echo.
  echo A instalacao parou com um erro. Le a mensagem acima.
)
pause
