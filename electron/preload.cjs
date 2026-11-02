const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  importKnownFolders: (folderPaths) => ipcRenderer.invoke('fs:importKnownFolders', folderPaths),
  readFolder: (folderPath) => ipcRenderer.invoke('fs:readFolder', folderPath),
  listAllowedFolders: () => ipcRenderer.invoke('fs:listAllowedFolders'),
  revokeFolder: (folderPath) => ipcRenderer.invoke('fs:revokeFolder', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileFrom: (filePath, offset) => ipcRenderer.invoke('fs:readFileFrom', filePath, offset),
  checkFileStats: (filePath) => ipcRenderer.invoke('fs:checkFileStats', filePath),
  watchFiles: (filePaths) => ipcRenderer.invoke('fs:watchFiles', filePaths),
  onFileChanged: (callback) => {
    const listener = (event, filePath) => callback(filePath);
    ipcRenderer.on('fs:fileChanged', listener);
    return () => ipcRenderer.removeListener('fs:fileChanged', listener);
  },
  saveTextFile: (options) => ipcRenderer.invoke('dialog:saveTextFile', options),
  notify: (options) => ipcRenderer.invoke('app:notify', options),
  takeLaunchPaths: () => ipcRenderer.invoke('app:takeLaunchPaths'),
  onOpenPaths: (callback) => {
    const listener = (event, paths) => callback(paths);
    ipcRenderer.on('app:openPaths', listener);
    return () => ipcRenderer.removeListener('app:openPaths', listener);
  },
  openInExplorer: (targetPath) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
});
