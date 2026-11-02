const { app, BrowserWindow, Menu, Notification, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { AllowedFolders, isSupportedLogFileName } = require('./folderAccess.cjs');
const { isZipFileName, joinZipPath, splitZipPath, listZipEntries, readZipEntry } = require('./zipReader.cjs');

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
    throw codedError('NOT_FOUND', `Pasta não encontrada: ${folderPath}`);
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
    const zipFiles = [];
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) subdirectories.push(fullPath);
      else if (entry.isFile() && isSupportedLogFileName(entry.name)) logFiles.push({ name: entry.name, fullPath });
      else if (entry.isFile() && isZipFileName(entry.name)) zipFiles.push(fullPath);
    }

    // Logs inside .zip files are listed as if the archive were a subfolder.
    for (const zipPath of zipFiles) {
      try {
        const zipStat = await fs.promises.stat(zipPath);
        for (const item of await listZipEntries(zipPath)) {
          const name = path.posix.basename(item.name);
          if (!isSupportedLogFileName(name) || results.length >= MAX_LOG_FILES) continue;
          results.push({
            name,
            path: joinZipPath(zipPath, item.name),
            relativePath: `${path.relative(folderPath, zipPath)}/${item.name}`,
            size: item.uncompressedSize,
            createdAt: item.lastModified,
            lastModified: item.lastModified || zipStat.mtimeMs,
          });
        }
      } catch (zipError) {
        console.warn('Erro ao ler o .zip:', zipPath, zipError?.message || zipError);
      }
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

/**
 * Errors the window reacts to carry a code at the start of the message ("[CODE] text"): only the message
 * crosses the IPC boundary. Keep in sync with `DesktopErrorCode` in src/services/platform.ts.
 */
const ErrorCode = Object.freeze({
  FOLDER_DENIED: 'FOLDER_DENIED',
  OUTSIDE_ALLOWED_FOLDERS: 'OUTSIDE_ALLOWED_FOLDERS',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  NOT_FOUND: 'NOT_FOUND',
});

function codedError(code, message, cause) {
  return new Error(`[${ErrorCode[code]}] ${message}`, cause ? { cause } : undefined);
}

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
  if (response !== 0) throw codedError('FOLDER_DENIED', `Acesso à pasta não autorizado: ${folderPath}`);
  allowedFolders.add(realFolder);
  return realFolder;
}

/**
 * Resolves a log file path and makes sure it is a supported log inside an allowed folder.
 * For a log inside a zip ("<zip>::<name>") `realFile` is the zip and `innerName` the log inside it.
 */
async function resolveAllowedLogFile(filePath) {
  assertString(filePath, 'filePath');
  const inZip = splitZipPath(filePath);
  const diskPath = inZip ? inZip.zipPath : filePath;
  const logName = inZip ? path.posix.basename(inZip.innerName) : path.basename(filePath);
  if (!isSupportedLogFileName(logName)) throw codedError('UNSUPPORTED_FILE', `Tipo de arquivo não permitido: ${filePath}`);
  let realFile;
  try {
    realFile = await fs.promises.realpath(diskPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw codedError('NOT_FOUND', `Arquivo não encontrado: ${filePath}`, error);
    throw error;
  }
  if (!allowedFolders.has(realFile)) throw codedError('OUTSIDE_ALLOWED_FOLDERS', `Arquivo fora das pastas liberadas: ${filePath}`);
  return { realFile, innerName: inZip ? inZip.innerName : null };
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

  // No macOS os atalhos de copiar/colar (Cmd+C/V) e de sair dependem do menu da aplicação.
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null
  );

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
    rendererReady = false;
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

// Pastas liberadas, para a tela de configurações (o usuário pode revogar cada uma).
ipcMain.handle('fs:listAllowedFolders', async (event) => {
  assertTrustedSender(event);
  return allowedFolders.list();
});

ipcMain.handle('fs:revokeFolder', async (event, folderPath) => {
  assertTrustedSender(event);
  assertString(folderPath, 'folderPath');
  return allowedFolders.remove(folderPath);
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
  const { realFile, innerName } = await resolveAllowedLogFile(filePath);
  const stat = await fs.promises.stat(realFile);
  if (innerName) {
    // Logs inside a zip are decompressed in memory; `size` is the zip's, so a changed zip is read again.
    const content = await readZipEntry(realFile, innerName);
    const start = !/\.gz$/i.test(innerName) && content.length > MAX_INITIAL_READ_BYTES ? content.length - MAX_INITIAL_READ_BYTES : 0;
    return { bytes: content.subarray(start), start, size: stat.size, mtimeMs: stat.mtimeMs };
  }
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
  const { realFile, innerName } = await resolveAllowedLogFile(filePath);
  if (innerName) return null;
  const stat = await fs.promises.stat(realFile);
  if (stat.size < offset || stat.size - offset > MAX_APPEND_READ_BYTES) return null;
  const bytes = await readRange(realFile, offset, stat.size);
  return { bytes, start: offset, size: offset + bytes.length, mtimeMs: stat.mtimeMs };
});

// Verificação rápida de tamanho e data de modificação para o tempo real.
ipcMain.handle('fs:checkFileStats', async (event, filePath) => {
  assertTrustedSender(event);
  try {
    const { realFile } = await resolveAllowedLogFile(filePath);
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
      const { realFile } = await resolveAllowedLogFile(filePath);
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
  // A log inside a zip is shown as the zip itself.
  const realTarget = await realPathOrSelf(splitZipPath(targetPath)?.zipPath ?? targetPath);
  if (!allowedFolders.has(realTarget)) return;
  if (fs.existsSync(realTarget)) {
    shell.showItemInFolder(realTarget);
  } else {
    await shell.openPath(path.dirname(realTarget));
  }
});

// Notificação do sistema (tempo real): a tela pede, o processo principal mostra.
// Clicar nela traz a janela para a frente.
ipcMain.handle('app:notify', async (event, options) => {
  assertTrustedSender(event);
  if (!Notification.isSupported()) return false;
  const title = typeof options?.title === 'string' ? options.title.slice(0, 120) : 'OctoSearch';
  const body = typeof options?.body === 'string' ? options.body.slice(0, 300) : '';
  const notification = new Notification({ title, body, icon: path.join(__dirname, 'icon.png') });
  notification.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
  return true;
});

// ---------------------------------------------------------------------------------------------
// Abrir pelo sistema: duplo clique num .log (associação de arquivos), "Abrir com", arrastar para o ícone
// ou a linha de comando (octosearch caminho/do/arquivo.log). A pasta do arquivo passa a ser liberada,
// porque foi o próprio usuário que pediu para abri-lo.
// ---------------------------------------------------------------------------------------------

let pendingLaunchPaths = [];
/** True once the window asked for the pending paths (before that they are queued). */
let rendererReady = false;

function launchPathsFrom(argv) {
  // argv[0] é o executável. No desenvolvimento a pasta do projeto também vem nos argumentos, e nem
  // sempre na mesma posição (o Chromium pode inserir opções antes dela): ela é descartada pelo caminho.
  const appPath = path.resolve(app.getAppPath());
  return argv
    .slice(1)
    .filter((arg) => typeof arg === 'string' && arg && !arg.startsWith('-'))
    .filter((arg) => app.isPackaged || path.resolve(arg) !== appPath)
    .slice(0, 20);
}

async function prepareLaunchPaths(paths) {
  const opened = [];
  for (const candidate of paths) {
    try {
      const resolved = path.resolve(candidate);
      const stat = await fs.promises.stat(resolved);
      const isDirectory = stat.isDirectory();
      if (!isDirectory && !isSupportedLogFileName(path.basename(resolved))) continue;
      const folder = isDirectory ? resolved : path.dirname(resolved);
      allowedFolders.add(await realPathOrSelf(folder));
      opened.push({ path: resolved, folder, isDirectory });
    } catch {
      // Caminho inexistente: ignorado.
    }
  }
  return opened;
}

async function openLaunchPaths(paths) {
  const prepared = await prepareLaunchPaths(paths);
  if (prepared.length === 0) return;
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send('app:openPaths', prepared);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingLaunchPaths.push(...prepared);
  }
}

// A tela pede os caminhos recebidos antes de ela terminar de carregar (abertura pelo duplo clique).
ipcMain.handle('app:takeLaunchPaths', async (event) => {
  assertTrustedSender(event);
  rendererReady = true;
  const paths = pendingLaunchPaths;
  pendingLaunchPaths = [];
  return paths;
});

// Uma segunda execução (duplo clique com o app aberto) entrega os caminhos à janela que já existe.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    void openLaunchPaths(launchPathsFrom(argv));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS entrega os arquivos por evento (inclusive antes de o app ficar pronto).
const macOpenFiles = [];
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (allowedFolders) void openLaunchPaths([filePath]);
  else macOpenFiles.push(filePath);
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
  if (!isPrimaryInstance) return;
  // Sem isso as notificações do Windows aparecem com o nome "electron.app.OctoSearch".
  if (process.platform === 'win32') app.setAppUserModelId('com.octosearch.desktop');
  allowedFolders = new AllowedFolders(path.join(app.getPath('userData'), 'allowed-folders.json'));
  // O app não usa câmera, microfone etc.: só a cópia para a área de transferência é permitida.
  // (As notificações são mostradas pelo processo principal, sem permissão da tela.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write')
  );
  createWindow();
  void openLaunchPaths([...launchPathsFrom(process.argv), ...macOpenFiles.splice(0)]);
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
