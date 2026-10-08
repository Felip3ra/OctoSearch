@echo off
setlocal
cd /d "%~dp0"
title Gerador do Instalador - OctoSearch

echo.
echo ================================================================
echo              GERADOR DO INSTALADOR OCTOSEARCH
echo ================================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado.
  echo Instale a versao LTS em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install --legacy-peer-deps
  if errorlevel 1 goto :erro
)

echo Compilando e criando o assistente de instalacao...
call npm run build:installer
if errorlevel 1 goto :erro

echo.
echo ================================================================
echo Instalador criado com sucesso:
echo   dist-exe\OctoSearch-Setup.exe
echo ================================================================
start "" "dist-exe"
pause
exit /b 0

:erro
echo.
echo [ERRO] Nao foi possivel gerar o instalador.
pause
exit /b 1
