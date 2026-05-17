const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let dbWatcher = null;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (dbWatcher) {
    dbWatcher.close();
  }
  if (process.platform !== 'darwin') app.quit();
});

// Ensure directory helper
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// File Watcher Helper to hot-reload database changes instantly
const startWatchingDbFile = (filePath) => {
  if (dbWatcher) {
    dbWatcher.close();
    dbWatcher = null;
  }

  if (!filePath || !fs.existsSync(filePath)) return;

  try {
    // Watch database file for modifications
    dbWatcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        if (mainWindow) {
          mainWindow.webContents.send('database-file-changed', filePath);
        }
      }
    });
  } catch (err) {
    console.error('Failed to start file watcher:', err);
  }
};

// IPC Handlers
ipcMain.handle('get-last-db-path', () => {
  try {
    const configPath = path.join(app.getAppPath(), 'app_config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.lastActiveDbPath && fs.existsSync(config.lastActiveDbPath)) {
        // Start watching the file on launch
        startWatchingDbFile(config.lastActiveDbPath);
        return config.lastActiveDbPath;
      }
    }
  } catch (err) {
    console.error('Error reading app_config:', err);
  }
  return null;
});

ipcMain.handle('set-last-db-path', (event, dbPath) => {
  try {
    const configPath = path.join(app.getAppPath(), 'app_config.json');
    const config = { lastActiveDbPath: dbPath };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    if (dbPath) {
      startWatchingDbFile(dbPath);
    } else if (dbWatcher) {
      dbWatcher.close();
      dbWatcher = null;
    }
    
    return true;
  } catch (err) {
    console.error('Error writing app_config:', err);
    return false;
  }
});

ipcMain.handle('create-db-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Create New Mava Gems Database',
    defaultPath: path.join(app.getPath('documents'), 'mava_gems_stock.db'),
    filters: [
      { name: 'Mava Gems Database', extensions: ['db', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('open-db-dialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Existing Mava Gems Database',
    properties: ['openFile'],
    filters: [
      { name: 'Mava Gems Database', extensions: ['db', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-vault', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, data: null };
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    
    // Ensure we are actively watching this file
    if (!dbWatcher) {
      startWatchingDbFile(filePath);
    }
    
    return { exists: true, data: rawData, path: filePath };
  } catch (error) {
    console.error('Error reading vault:', error);
    throw new Error('Failed to read database file: ' + error.message);
  }
});

ipcMain.handle('write-vault', async (event, payload, filePath) => {
  try {
    // 1. Temporarily pause the watcher to avoid self-triggering on write
    if (dbWatcher) {
      dbWatcher.close();
      dbWatcher = null;
    }

    const dirPath = path.dirname(filePath);
    ensureDirectoryExists(dirPath);
    
    // Atomic write to prevent file corruption
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, payload, 'utf8');
    
    if (fs.existsSync(filePath)) {
      const backupPath = filePath + '.bak';
      fs.copyFileSync(filePath, backupPath);
    }
    
    fs.renameSync(tempPath, filePath);
    
    // 2. Restart watching after successful write completes
    startWatchingDbFile(filePath);

    return { success: true, path: filePath };
  } catch (error) {
    // Make sure we resume watching even on errors
    startWatchingDbFile(filePath);
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
