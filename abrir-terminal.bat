@echo off
cd /d "%~dp0"
title Terminal - OctoSearch
echo ====================================================================
echo      TERMINAL DE APOIO - OCTOSEARCH
echo ====================================================================
echo.
echo Esta janela nunca fecha automaticamente.
echo.
echo Voce pode rodar os seguintes comandos diretamente aqui:
echo.
echo   1. Para gerar o executavel:
echo      gerar-exe.bat
echo.
echo   2. Para testar o aplicativo como janela nativa agora:
echo      npx electron .
echo.
echo   3. Para compilar manualmente:
echo      npm run build:exe
echo.
echo ====================================================================
echo.
cmd /k
