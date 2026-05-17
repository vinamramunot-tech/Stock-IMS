const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  readVault: (customPath) => ipcRenderer.invoke('read-vault', customPath),
  writeVault: (payload, customPath) => ipcRenderer.invoke('write-vault', payload, customPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  exportBackupDialog: (defaultName) => ipcRenderer.invoke('export-backup-dialog', defaultName),
  importBackupDialog: () => ipcRenderer.invoke('import-backup-dialog'),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath)
});
