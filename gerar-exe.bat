@echo off
cd /d "%~dp0"
title Gerador de Executavel .exe - Visualizador de Logs

echo.
echo ====================================================================
echo      GERADOR DE EXECUTAVEL WINDOWS .EXE - VISUALIZADOR DE LOGS
echo ====================================================================
echo.

REM 1. Fechar processos anteriores
echo [1/5] Encerrando eventuais processos anteriores...
taskkill /F /IM "Visualizador de Logs .NET.exe" >nul 2>&1
taskkill /F /IM "electron.exe" >nul 2>&1
echo   [OK] Processos verificados.

REM 2. Limpar pasta dist-exe anterior
if not exist dist-exe goto PULAR_LIMPEZA
echo.
echo [2/5] Limpando pasta de compilacao anterior...
rmdir /s /q dist-exe >nul 2>&1
echo   [OK] Pasta limpa.
:PULAR_LIMPEZA

REM 3. Verificar Node.js
echo.
echo [3/5] Verificando instalacao do Node.js...
where node >nul 2>&1
if %errorlevel% equ 0 goto NODE_OK
echo.
echo ====================================================================
echo   [ERRO] Node.js nao foi encontrado neste computador!
echo   Para compilar o .exe, e necessario ter o Node.js instalado.
echo   Baixe a versao LTS gratuitamente em: https://nodejs.org
echo ====================================================================
echo.
pause
exit /b 1
:NODE_OK
echo   [OK] Node.js detectado no sistema.

REM 4. Instalar dependencias
echo.
echo [4/5] Instalando dependencias do projeto...
call npm install --legacy-peer-deps
if %errorlevel% equ 0 goto NPM_OK
echo.
echo ====================================================================
echo   [ERRO] Falha ao executar npm install.
echo   Verifique sua conexao de rede e tente novamente.
echo ====================================================================
echo.
pause
exit /b 1
:NPM_OK

echo   Instalando ferramentas do Electron...
call npm install --save-dev --legacy-peer-deps electron electron-builder
if %errorlevel% equ 0 goto ELECTRON_OK
echo.
echo ====================================================================
echo   [ERRO] Falha ao instalar o Electron.
echo ====================================================================
echo.
pause
exit /b 1
:ELECTRON_OK
echo   [OK] Dependencias instaladas com sucesso.

REM 5. Compilar Vite e Empacotar Electron
echo.
echo [5/5] Compilando arquivos e gerando o executavel Windows...
echo   a) Compilando frontend Vite...
call npm run build
if %errorlevel% equ 0 goto VITE_OK
echo.
echo ====================================================================
echo   [ERRO] Falha na compilacao do Vite.
echo ====================================================================
echo.
pause
exit /b 1
:VITE_OK
echo   [OK] Frontend compilado.

echo   b) Gerando pacote executavel .exe...
call npx electron-builder --win --x64
if %errorlevel% equ 0 goto BUILDER_OK
echo.
echo ====================================================================
echo   [ERRO] O electron-builder encontrou uma falha no empacotamento.
echo   Verifique se o antivirus nao bloqueou a criacao do arquivo.
echo ====================================================================
echo.
pause
exit /b 1
:BUILDER_OK

echo.
echo ====================================================================
echo                   CONCLUIDO COM SUCESSO!
echo ====================================================================
if exist "dist-exe\Visualizador de Logs .NET.exe" (
    echo Executavel portatil criado com sucesso em:
    echo   dist-exe\Visualizador de Logs .NET.exe
)
if exist "dist-exe\win-unpacked\Visualizador de Logs .NET.exe" (
    echo Executavel descompactado pronto em:
    echo   dist-exe\win-unpacked\Visualizador de Logs .NET.exe
)
echo ====================================================================
echo.
echo Abrindo a pasta onde esta o seu .exe...
start "" "dist-exe"
echo.
echo Pressione qualquer tecla para finalizar.
pause
exit /b 0
