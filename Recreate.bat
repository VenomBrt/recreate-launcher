@echo off
cd /d "%~dp0"

if not exist "package.json" (
  echo Erro: package.json nao encontrado nesta pasta.
  pause
  exit /b 1
)

node scripts\prepare-recreate-exe.js

set "EXE=node_modules\electron\dist\Recreate.exe"
if not exist "%EXE%" set "EXE=node_modules\electron\dist\electron.exe"

if not exist "%EXE%" (
  echo Executavel nao encontrado. Rode: npm install
  pause
  exit /b 1
)

start "" "%EXE%" .
