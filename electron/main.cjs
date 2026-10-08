const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function isSupportedLogFileName(fileName) {
  return /\.(?:log|txt)(?:\.\d+)?$/i.test(fileName.trim());
}

let mainWindow = null;

// Limites de segurança para pastas enormes ou de rede (evita varreduras intermináveis).
const MAX_SCAN_DEPTH = 12;
const MAX_LOG_FILES = 5000;

/**
 * Varre a pasta de forma assíncrona para não congelar a janela em pastas grandes ou de rede.
 * Subpastas são lidas em paralelo; links simbólicos não são seguidos (evita ciclos).
 */
async function scanDirectoryForLogs(folderPath) {
  try {
    const rootStat = await fs.promises.stat(folderPath);
    if (!rootStat.isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`Pasta não encontrada: ${folderPath}`);
  }

  const results = [];

  async function walkDirectory(currentPath, depth) {
    if (depth > MAX_SCAN_DEPTH || results.length >= MAX_LOG_FILES) return;

    let entries;
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (directoryError) {
      console.warn('Erro ao acessar subpasta:', currentPath, directoryError);
      return;
    }

    const subdirectories = [];
    const logFiles = [];
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) subdirectories.push(fullPath);
      else if (entry.isFile() && isSupportedLogFileName(entry.name)) logFiles.push({ name: entry.name, fullPath });
    }

    const stats = await Promise.all(
      logFiles.map(async ({ name, fullPath }) => {
        try {
          const stat = await fs.promises.stat(fullPath);
          return {
            name,
            path: fullPath,
            relativePath: path.relative(folderPath, fullPath),
            size: stat.size,
            createdAt: stat.birthtimeMs,
            lastModified: stat.mtimeMs,
          };
        } catch (statErr) {
          console.warn('Erro ao ler dados do arquivo:', fullPath, statErr);
          return null;
        }
      })
    );
    for (const item of stats) {
      if (item && results.length < MAX_LOG_FILES) results.push(item);
    }

    await Promise.all(subdirectories.map((subdirectory) => walkDirectory(subdirectory, depth + 1)));
  }

  await walkDirectory(folderPath, 0);

  // Ordenar por data de modificação (mais recente primeiro)
  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 850,
    minHeight: 600,
    title: 'OctoSearch',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  Menu.setApplicationMenu(null);

  let indexPath = path.join(__dirname, '../dist/index.html');
  if (!fs.existsSync(indexPath)) {
    indexPath = path.join(app.getAppPath(), 'dist/index.html');
  }

  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('Erro ao carregar index.html:', err);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Falha ao carregar tela:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
      event.preventDefault();
    }
  });
}

// IPC: Seleção nativa de pasta via caixa de diálogo do Windows
ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar pasta de logs',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const files = await scanDirectoryForLogs(selectedPath);
  return {
    folderPath: selectedPath,
    files,
  };
});

// IPC: Leitura direta de uma pasta pelo caminho salvo no disco
ipcMain.handle('fs:readFolder', async (event, folderPath) => {
  return scanDirectoryForLogs(folderPath);
});

// IPC: Leitura direta de conteúdo de arquivo de log
ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Arquivo não encontrado: ${filePath}`);
    throw error;
  }
});

// IPC: Verificação rápida de tamanho e data de modificação para auto-atualização em tempo real (Tail/Live)
ipcMain.handle('fs:checkFileStats', async (event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
});

// IPC: Abrir no Windows Explorer
ipcMain.handle('shell:showItemInFolder', async (event, targetPath) => {
  if (fs.existsSync(targetPath)) {
    shell.showItemInFolder(targetPath);
  } else {
    shell.openPath(path.dirname(targetPath));
  }
});

// Atualização automática via GitHub Releases (configurado em "build.publish" no package.json).
// Só roda na versão instalada: em desenvolvimento e no .exe portátil não há como se auto-substituir.
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function setupAutoUpdates() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let promptShown = false;
  autoUpdater.on('update-downloaded', async (info) => {
    if (promptShown) return;
    promptShown = true;
    const options = {
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${info.version} do OctoSearch foi baixada.`,
      detail: 'Reinicie agora para atualizar, ou ela será instalada automaticamente quando você fechar o aplicativo.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (error) => {
    console.warn('Falha ao verificar atualizações:', error?.message || error);
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
