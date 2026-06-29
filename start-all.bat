@echo off
REM ============================================================
REM  Anglish AI - inicia BACKEND (porta 4000) + FRONTEND (3000)
REM  em duas janelas separadas. DEIXA AS DUAS JANELAS ABERTAS.
REM  Faz duplo-clique neste ficheiro para arrancar tudo.
REM  (Fecha primeiro o preview do Claude para as portas ficarem livres.)
REM ============================================================
set "NODE=C:\Program Files\nodejs\node.exe"

start "Anglish AI Backend (porta 4000)"  /D "%~dp0backend"  cmd /k "%NODE%" node_modules\tsx\dist\cli.mjs watch src\index.ts
start "Anglish AI Frontend (porta 3000)" /D "%~dp0frontend" cmd /k "%NODE%" node_modules\vite\bin\vite.js --port 3000

echo.
echo  Abriram-se DUAS janelas (Backend + Frontend). NAO as feches.
echo  Backend  -^> http://localhost:4000/api/health  (deve dar {"ok":true})
echo  Frontend -^> http://localhost:3000
echo.
pause
