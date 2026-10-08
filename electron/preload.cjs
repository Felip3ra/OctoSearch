const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  readFolder: (folderPath) => ipcRenderer.invoke('fs:readFolder', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  checkFileStats: (filePath) => ipcRenderer.invoke('fs:checkFileStats', filePath),
  openInExplorer: (targetPath) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
});
