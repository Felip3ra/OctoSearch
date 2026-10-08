@echo off
setlocal
cd /d "%~dp0"
title Publicar atualizacao - OctoSearch

echo.
echo ================================================================
echo              PUBLICAR NOVA VERSAO DO OCTOSEARCH
echo ================================================================
echo.
echo Antes de continuar, aumente o campo "version" no package.json
echo (ex.: 1.0.0 para 1.0.1). Os usuarios so recebem a atualizacao
echo se a versao publicada for MAIOR que a instalada.
echo.

if "%GH_TOKEN%"=="" (
  set /p GH_TOKEN=Cole seu token do GitHub (permissao "repo"/Contents: write^): 
)
if "%GH_TOKEN%"=="" (
  echo [ERRO] Token do GitHub nao informado.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install --legacy-peer-deps
  if errorlevel 1 goto :erro
)

echo Gerando e publicando no GitHub Releases (leva alguns minutos)...
echo O andamento fica salvo em publicar-atualizacao.log
call npm run release > publicar-atualizacao.log 2>&1
if errorlevel 1 goto :erro

echo.
echo ================================================================
echo Versao publicada! Os usuarios com o instalador receberao a
echo atualizacao na proxima vez que abrirem o OctoSearch.
echo ================================================================
pause
exit /b 0

:erro
echo.
if exist publicar-atualizacao.log powershell -NoProfile -Command "Get-Content publicar-atualizacao.log -Tail 25"
echo.
echo [ERRO] Nao foi possivel publicar a atualizacao. Detalhes em publicar-atualizacao.log
pause
exit /b 1
