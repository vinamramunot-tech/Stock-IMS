const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load BackupManager module
const BackupManager = require(path.join(__dirname, '../renderer/js/backup-manager.js'));

test('Daily OneDrive Backup Verification Suite', async (t) => {

  await t.test('1. Daily Backup Date Tracking & Schedule Due Check', () => {
    const today = new Date().toISOString().split('T')[0];

    // Case A: No previous backup -> Due
    BackupManager.config.lastBackupDate = null;
    assert.equal(BackupManager.isBackupDueToday(), true);

    // Case B: Previous backup was yesterday -> Due
    BackupManager.config.lastBackupDate = '2026-10-19';
    assert.equal(BackupManager.isBackupDueToday(), true);

    // Case C: Today's backup already performed -> Not due
    BackupManager.config.lastBackupDate = today;
    assert.equal(BackupManager.isBackupDueToday(), false);
  });

  await t.test('2. Daily Backup Filename Standard ISO Formatting', () => {
    const fileName = BackupManager.getDailyBackupFileName('2026-10-20');
    assert.equal(fileName, 'mava_gems_onedrive_daily_2026-10-20.db');
  });

  await t.test('3. Data Integrity & Lossless Backup Execution', async () => {
    const today = new Date().toISOString().split('T')[0];
    const writtenFiles = new Map();

    // Mock electronAPI and DBManager in global scope
    global.electronAPI = {
      writeVault: async (payload, destPath) => {
        writtenFiles.set(destPath, payload);
        return { success: true, path: destPath };
      }
    };

    global.DBManager = {
      database: {
        settings: { currency: '₹', goldRate24kt: { ratePerGram: 7500 } },
        items: [{ id: 'item_1', sku: 'SKU-001', name: 'Diamond Ring', grossWeight: 4.5 }],
        emeralds: [{ id: 'em_1', pudiaNumber: 'P-101', totalWeight: 12.4 }],
        stones: [{ id: 'st_1', shape: 'Round', weight: 0.5 }],
        jewelryMemos: [],
        jewelrySales: [],
        logs: []
      },
      addLog: (action, targetId, targetName, details) => {
        // Log recorded
      }
    };

    BackupManager.config.lastBackupDate = '2026-10-19'; // Previous day
    BackupManager.config.oneDrivePath = '/Users/ayushmunot/OneDrive/MavaGemsBackups';

    const result = await BackupManager.checkAndRunDailyBackup();

    assert.equal(result.success, true);
    assert.equal(result.date, today);
    assert.equal(result.fileName, `mava_gems_onedrive_daily_${today}.db`);

    // Verify written payload
    const expectedPath = `/Users/ayushmunot/OneDrive/MavaGemsBackups/mava_gems_onedrive_daily_${today}.db`;
    assert.ok(writtenFiles.has(expectedPath), 'Daily backup written to OneDrive path');

    const latestPath = `/Users/ayushmunot/OneDrive/MavaGemsBackups/mava_gems_onedrive_latest.db`;
    assert.ok(writtenFiles.has(latestPath), 'Latest pointer file also updated');

    const parsed = JSON.parse(writtenFiles.get(expectedPath));
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].sku, 'SKU-001');
    assert.equal(parsed.emeralds.length, 1);
    assert.equal(parsed.stones.length, 1);
    assert.equal(parsed.settings.goldRate24kt.ratePerGram, 7500);

    // Verify subsequent check skips because today is already verified
    const secondRun = await BackupManager.checkAndRunDailyBackup();
    assert.equal(secondRun.success, true);
    assert.equal(secondRun.skipped, true);
  });

  await t.test('4. Safeguard: Prevent Backing Up Corrupted / Empty Database', async () => {
    // Malformed DB in memory missing core arrays
    global.DBManager = {
      database: {}
    };

    BackupManager.config.lastBackupDate = '2026-10-19';
    const result = await BackupManager.createDailyBackup('2026-10-20');

    assert.equal(result.success, false);
    assert.ok(result.error.includes('verification failed'));
    assert.equal(BackupManager.status, 'error');
  });

  await t.test('5. Manual Backup Force Trigger', async () => {
    const today = new Date().toISOString().split('T')[0];
    let written = false;

    global.electronAPI = {
      writeVault: async () => {
        written = true;
        return { success: true };
      }
    };

    global.DBManager = {
      database: {
        items: [{ id: 'i1' }],
        emeralds: [],
        stones: []
      },
      addLog: () => {}
    };

    // Even though today's backup is marked done, manual trigger forces backup
    BackupManager.config.lastBackupDate = today;
    const result = await BackupManager.backupNow();

    assert.equal(result.success, true);
    assert.equal(written, true, 'Forced backup executed writeVault');
  });

});
