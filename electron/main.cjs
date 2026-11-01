const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { AllowedFolders, isSupportedLogFileName } = require('./folderAccess.cjs');

let mainWindow = null;
let allowedFolders = null;

// Limites de segurança para pastas enormes ou de rede (evita varreduras intermináveis).
const MAX_SCAN_DEPTH = 12;
const MAX_LOG_FILES = 5000;

// Arquivos maiores que isto são abertos só pelo final (os registros mais recentes), para não esgotar a memória.
const MAX_INITIAL_READ_BYTES = 200 * 1024 * 1024;
// Um acréscimo maior que isto entre duas leituras do tempo real é tratado como releitura completa.
const MAX_APPEND_READ_BYTES = 64 * 1024 * 1024;

// DevTools e recarregar só no desenvolvimento (ou com OCTOSEARCH_DEVTOOLS=1 para diagnosticar a versão instalada).
const allowDevTools = !app.isPackaged || process.env.OCTOSEARCH_DEVTOOLS === '1';

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

// ---------------------------------------------------------------------------------------------
// Controle de acesso: a tela só lê arquivos de log dentro de pastas que o usuário liberou.
// Assim, mesmo que um conteúdo malicioso conseguisse executar script na tela, ele não leria
// arquivos arbitrários do computador.
// ---------------------------------------------------------------------------------------------

function assertTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  if (!url.startsWith('file://') || event.sender !== mainWindow?.webContents) {
    throw new Error('Origem não autorizada.');
  }
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 4096) {
    throw new Error(`Parâmetro inválido: ${name}`);
  }
}

async function realPathOrSelf(target) {
  try {
    return await fs.promises.realpath(target);
  } catch {
    return path.resolve(target);
  }
}

async function requestFolderAccess(folderPath) {
  const realFolder = await realPathOrSelf(folderPath);
  if (allowedFolders.has(realFolder)) return realFolder;

  const options = {
    type: 'question',
    title: 'Permitir acesso à pasta',
    message: `Permitir que o OctoSearch leia os logs desta pasta?`,
    detail: `${folderPath}\n\nA permissão fica salva para as próximas vezes.`,
    buttons: ['Permitir', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  if (response !== 0) throw new Error(`Acesso à pasta não autorizado: ${folderPath}`);
  allowedFolders.add(realFolder);
  return realFolder;
}

/** Resolves a log file path and makes sure it is a supported log inside an allowed folder. */
async function resolveAllowedLogFile(filePath) {
  assertString(filePath, 'filePath');
  if (!isSupportedLogFileName(path.basename(filePath))) throw new Error(`Tipo de arquivo não permitido: ${filePath}`);
  let realFile;
  try {
    realFile = await fs.promises.realpath(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Arquivo não encontrado: ${filePath}`, { cause: error });
    throw error;
  }
  if (!allowedFolders.has(realFile)) throw new Error(`Arquivo fora das pastas liberadas: ${filePath}`);
  return realFile;
}

async function readRange(filePath, start, end) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(Math.max(0, end - start));
    let read = 0;
    while (read < buffer.length) {
      const { bytesRead } = await handle.read(buffer, read, buffer.length - read, start + read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return read === buffer.length ? buffer : buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Tempo real: avisa a tela quando um arquivo acompanhado muda (a tela também confere de tempos em tempos,
// porque o fs.watch não é confiável em pastas de rede).
// ---------------------------------------------------------------------------------------------

const fileWatchers = new Map();

function closeWatchers() {
  for (const { watcher, timer } of fileWatchers.values()) {
    clearTimeout(timer);
    watcher.close();
  }
  fileWatchers.clear();
}

function watchFile(requestedPath, realPath) {
  try {
    const record = { watcher: null, timer: null };
    record.watcher = fs.watch(realPath, { persistent: false }, () => {
      clearTimeout(record.timer);
      record.timer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('fs:fileChanged', requestedPath);
      }, 100);
    });
    record.watcher.on('error', () => {
      record.watcher.close();
      fileWatchers.delete(requestedPath);
    });
    fileWatchers.set(requestedPath, record);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------------------------

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
      sandbox: true,
      webviewTag: false,
      devTools: allowDevTools,
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

  mainWindow.on('closed', () => {
    closeWatchers();
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Falha ao carregar tela:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (allowDevTools && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
      event.preventDefault();
    }
  });
}

// Nenhuma tela pode abrir janelas novas, navegar para outro endereço ou embutir <webview>.
// Links http(s) são abertos no navegador padrão.
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (navigationEvent, url) => {
    if (url !== contents.getURL()) navigationEvent.preventDefault();
  });
  contents.on('will-attach-webview', (attachEvent) => attachEvent.preventDefault());
});

// ---------------------------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------------------------

// Seleção nativa de pasta: a pasta escolhida passa a ser liberada para leitura.
ipcMain.handle('dialog:selectFolder', async (event) => {
  assertTrustedSender(event);
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar pasta de logs',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  allowedFolders.add(await realPathOrSelf(selectedPath));
  const files = await scanDirectoryForLogs(selectedPath);
  return {
    folderPath: selectedPath,
    files,
  };
});

// Pastas salvas antes do controle de acesso existir: liberadas uma única vez, na primeira abertura.
ipcMain.handle('fs:importKnownFolders', async (event, folderPaths) => {
  assertTrustedSender(event);
  if (!Array.isArray(folderPaths)) return false;
  const valid = folderPaths.filter((item) => typeof item === 'string' && item.trim() && item.length <= 4096).slice(0, 500);
  return allowedFolders.importKnown(await Promise.all(valid.map(realPathOrSelf)));
});

// Leitura de uma pasta pelo caminho salvo: pede confirmação se ela ainda não foi liberada.
ipcMain.handle('fs:readFolder', async (event, folderPath) => {
  assertTrustedSender(event);
  assertString(folderPath, 'folderPath');
  await requestFolderAccess(folderPath);
  return scanDirectoryForLogs(folderPath);
});

// Leitura do arquivo em bytes (a tela detecta a codificação e descompacta .gz).
// Arquivos enormes são lidos só pelo final.
ipcMain.handle('fs:readFile', async (event, filePath) => {
  assertTrustedSender(event);
  const realFile = await resolveAllowedLogFile(filePath);
  const stat = await fs.promises.stat(realFile);
  const isGzip = /\.gz$/i.test(realFile);
  const start = !isGzip && stat.size > MAX_INITIAL_READ_BYTES ? stat.size - MAX_INITIAL_READ_BYTES : 0;
  const bytes = await readRange(realFile, start, stat.size);
  return { bytes, start, size: start + bytes.length, mtimeMs: stat.mtimeMs };
});

// Leitura incremental do tempo real: devolve só o que foi acrescentado a partir de `offset`.
// null indica que o arquivo diminuiu (rotação/truncamento) ou cresceu demais e deve ser relido por inteiro.
ipcMain.handle('fs:readFileFrom', async (event, filePath, offset) => {
  assertTrustedSender(event);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Parâmetro inválido: offset');
  const realFile = await resolveAllowedLogFile(filePath);
  const stat = await fs.promises.stat(realFile);
  if (stat.size < offset || stat.size - offset > MAX_APPEND_READ_BYTES) return null;
  const bytes = await readRange(realFile, offset, stat.size);
  return { bytes, start: offset, size: offset + bytes.length, mtimeMs: stat.mtimeMs };
});

// Verificação rápida de tamanho e data de modificação para o tempo real.
ipcMain.handle('fs:checkFileStats', async (event, filePath) => {
  assertTrustedSender(event);
  try {
    const realFile = await resolveAllowedLogFile(filePath);
    const stat = await fs.promises.stat(realFile);
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
});

// Passa a acompanhar exatamente estes arquivos; devolve os que estão sendo observados pelo sistema.
ipcMain.handle('fs:watchFiles', async (event, filePaths) => {
  assertTrustedSender(event);
  closeWatchers();
  if (!Array.isArray(filePaths)) return [];
  const watched = [];
  for (const filePath of filePaths.slice(0, 200)) {
    try {
      const realFile = await resolveAllowedLogFile(filePath);
      if (watchFile(filePath, realFile)) watched.push(filePath);
    } catch {
      // Arquivo removido ou fora das pastas liberadas: fica só com a verificação periódica.
    }
  }
  return watched;
});

// Exportação: o usuário escolhe onde salvar na caixa de diálogo do sistema.
ipcMain.handle('dialog:saveTextFile', async (event, options) => {
  assertTrustedSender(event);
  const defaultName = typeof options?.defaultName === 'string' ? path.basename(options.defaultName) : 'logs.log';
  const content = typeof options?.content === 'string' ? options.content : '';
  const extension = path.extname(defaultName).slice(1).toLowerCase() || 'log';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar registros',
    defaultPath: defaultName,
    filters: [
      extension === 'csv' ? { name: 'Planilha CSV', extensions: ['csv'] } : { name: 'Arquivo de log', extensions: ['log', 'txt'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, content, 'utf-8');
  return result.filePath;
});

// Abrir no gerenciador de arquivos (somente itens dentro das pastas liberadas).
ipcMain.handle('shell:showItemInFolder', async (event, targetPath) => {
  assertTrustedSender(event);
  assertString(targetPath, 'targetPath');
  const realTarget = await realPathOrSelf(targetPath);
  if (!allowedFolders.has(realTarget)) return;
  if (fs.existsSync(realTarget)) {
    shell.showItemInFolder(realTarget);
  } else {
    await shell.openPath(path.dirname(realTarget));
  }
});

// Atualização automática via GitHub Releases (configurado em "build.publish" no package.json).
// Só roda na versão instalada (Windows) e no AppImage (Linux): em desenvolvimento, no .exe portátil e no .deb
// não há como se auto-substituir.
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function canAutoUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return !process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
  return false;
}

function setupAutoUpdates() {
  if (!canAutoUpdate()) return;

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
  allowedFolders = new AllowedFolders(path.join(app.getPath('userData'), 'allowed-folders.json'));
  // O app não usa câmera, microfone, notificações etc.: só a cópia para a área de transferência é permitida.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write')
  );
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
