@echo off
rem Runs make_video.py with the avatar Python environment. Example: avatar.bat video --script roteiros\supermercados.json
setlocal
set "PY=%LOCALAPPDATA%\AvatarAnselmo\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=C:\AvatarAnselmo\venv\Scripts\python.exe"
if not exist "%PY%" (
  echo O gerador ainda nao esta instalado. Faz duplo clique no install.bat primeiro.
  exit /b 1
)
rem winget puts ffmpeg here; terminals opened before the install do not have it on PATH yet
set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
"%PY%" "%~dp0make_video.py" %*
