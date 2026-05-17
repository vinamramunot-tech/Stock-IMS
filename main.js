const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    title: "Mava Gems | Jewelry Stock Management",
    backgroundColor: '#FAF9F5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open DevTools during development if needed, can be enabled via standard shortcut.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Default database directory: under the application install directory
const getDefaultVaultDir = () => {
  return path.join(app.getAppPath(), 'DATA');
};

const getVaultFilePath = (customDir) => {
  const dir = customDir || getDefaultVaultDir();
  return path.join(dir, 'mava_gems_stock.db');
};

// Ensure database directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// IPC Handlers
ipcMain.handle('get-default-path', () => {
  return getVaultFilePath();
});

ipcMain.handle('read-vault', async (event, customPath) => {
  try {
    const filePath = customPath || getVaultFilePath();
    if (!fs.existsSync(filePath)) {
      return { exists: false, data: null };
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    return { exists: true, data: rawData, path: filePath };
  } catch (error) {
    console.error('Error reading vault:', error);
    throw new Error('Failed to read database file: ' + error.message);
  }
});

ipcMain.handle('write-vault', async (event, payload, customPath) => {
  try {
    const filePath = customPath || getVaultFilePath();
    const dirPath = path.dirname(filePath);
    
    // Ensure the folder exists
    ensureDirectoryExists(dirPath);
    
    // Atomic write: write to .tmp and rename to prevent corruption
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, payload, 'utf8');
    
    if (fs.existsSync(filePath)) {
      // Create a backup of the current database before renaming, just in case
      const backupPath = filePath + '.bak';
      fs.copyFileSync(filePath, backupPath);
    }
    
    fs.renameSync(tempPath, filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Error writing vault:', error);
    throw new Error('Failed to save database file securely: ' + error.message);
  }
});

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Folder for Mava Gems Database'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('export-backup-dialog', async (event, defaultName) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Database Backup',
    defaultPath: path.join(app.getPath('documents'), defaultName || 'mava_gems_stock_backup.db'),
    filters: [
      { name: 'Mava Gems Database', extensions: ['db', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('import-backup-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Database Backup',
    properties: ['openFile'],
    filters: [
      { name: 'Mava Gems Database', extensions: ['db', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('copy-file', async (event, sourcePath, destPath) => {
  try {
    fs.copyFileSync(sourcePath, destPath);
    return true;
  } catch (error) {
    console.error('Error copying file:', error);
    throw new Error('Failed to import file: ' + error.message);
  }
});
