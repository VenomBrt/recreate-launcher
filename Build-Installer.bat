@echo off
title Recreate — Gerar Instalador
cd /d "%~dp0"

echo.
echo  ========================================
echo   Recreate — Build do Instalador .exe
echo  ========================================
echo.
echo  Gera o instalador e copia para a Area de Trabalho
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "assets\icon.ico" (
  echo Gerando icones...
  call npm run icons
  if errorlevel 1 goto :fail
)

if not exist "assets\mods\recreate_essencial-1.0.9.jar" (
  echo AVISO: pacote essencial nao encontrado em assets\mods\
)

echo.
echo Compilando instalador... (pode demorar)
echo.

call npm run build
if errorlevel 1 goto :fail

set "SETUP=dist\Recreate-Setup-1.0.0.exe"
set "DESKTOP=%USERPROFILE%\Desktop"

if not exist "%SETUP%" (
  echo ERRO: instalador nao encontrado em %SETUP%
  goto :fail
)

echo.
echo Copiando para a Area de Trabalho...
copy /Y "%SETUP%" "%DESKTOP%\Recreate-Setup-1.0.0.exe" >nul
if errorlevel 1 (
  echo ERRO ao copiar para a Area de Trabalho.
  goto :fail
)

echo.
echo  ========================================
echo   Pronto!
echo   Area de Trabalho: Recreate-Setup-1.0.0.exe
echo   Pasta dist\:      %SETUP%
echo  ========================================
echo.
explorer /select,"%DESKTOP%\Recreate-Setup-1.0.0.exe"
goto :end

:fail
echo.
echo  ERRO ao gerar o instalador.
pause
exit /b 1

:end
pause
