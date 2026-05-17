const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getLastDbPath: () => ipcRenderer.invoke('get-last-db-path'),
  setLastDbPath: (dbPath) => ipcRenderer.invoke('set-last-db-path', dbPath),
  createDbDialog: () => ipcRenderer.invoke('create-db-dialog'),
  openDbDialog: () => ipcRenderer.invoke('open-db-dialog'),
  readVault: (customPath) => ipcRenderer.invoke('read-vault', customPath),
  writeVault: (payload, customPath) => ipcRenderer.invoke('write-vault', payload, customPath),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  exportBackupDialog: (defaultName) => ipcRenderer.invoke('export-backup-dialog', defaultName),
  importBackupDialog: () => ipcRenderer.invoke('import-backup-dialog'),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath)
});
