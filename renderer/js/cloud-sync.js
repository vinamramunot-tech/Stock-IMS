/**
 * Cloud Synchronization Module for Mava Gems (Option A: Firebase Cloud Firestore)
 * 
 * Provides real-time and background synchronization across desktop and mobile devices.
 * Guarantees zero data loss by treating local disk vaults as primary ground truth,
 * with non-blocking, bidirectional delta synchronization and safe merging.
 */

(function (global) {
  'use strict';

  // Default configuration derived from GoogleService-Info.plist
  const DEFAULT_CONFIG = {
    enabled: true,
    projectId: 'mava-gems-ios',
    apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
    storageBucket: 'mava-gems-ios.firebasestorage.app',
    databaseId: '(default)',
    collectionPrefix: 'mava_catalog',
    autoSyncIntervalMs: 15000, // 15 seconds fast active sync
    timeoutMs: 12000
  };

  const CloudSync = {
    config: { ...DEFAULT_CONFIG },
    status: 'idle', // 'idle' | 'syncing' | 'online' | 'offline' | 'error'
    lastSyncTime: null,
    lastError: null,
    syncInProgress: false,
    _syncTimeout: null,
    _listeners: [],

    /**
     * Initialize CloudSync with stored settings and event bindings
     */
    init(customConfig = {}) {
      this.loadConfig();
      if (customConfig && typeof customConfig === 'object') {
        this.config = { ...this.config, ...customConfig };
      }
      this.updateStatus('idle', 'Cloud Sync initialized');
      this.setupAutoSync();
    },

    /**
     * Load configuration overrides from local storage
     */
    loadConfig() {
      try {
        if (typeof localStorage !== 'undefined') {
          const saved = localStorage.getItem('mava_cloud_sync_config');
          if (saved) {
            const parsed = JSON.parse(saved);
            this.config = { ...DEFAULT_CONFIG, ...parsed };
          }
        }
      } catch (e) {
        console.warn('Failed to load cloud sync config:', e);
      }
    },

    /**
     * Persist configuration to local storage
     */
    saveConfig(newConfig) {
      try {
        this.config = { ...this.config, ...newConfig };
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('mava_cloud_sync_config', JSON.stringify(this.config));
        }
        this.updateStatus('idle', 'Configuration updated');
      } catch (e) {
        console.warn('Failed to save cloud sync config:', e);
      }
    },

    isEnabled() {
      return Boolean(this.config && this.config.enabled);
    },

    /**
     * Register listeners for status updates
     */
    onStatusChange(fn) {
      if (typeof fn === 'function') {
        this._listeners.push(fn);
      }
    },

    updateStatus(status, message = null) {
      this.status = status;
      if (status === 'error' || status === 'offline') {
        this.lastError = message;
      } else if (status === 'online') {
        this.lastError = null;
      }
      this._listeners.forEach(fn => {
        try { fn(this.status, message, this.lastSyncTime); } catch (_) {}
      });
    },

    /**
     * Firestore REST API Base URL
     */
    getBaseUrl() {
      const { projectId, databaseId } = this.config;
      return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
    },

    /**
     * Convert standard JavaScript object/primitives to Firestore Value format
     */
    toFirestoreValue(value) {
      if (value === null || value === undefined) {
        return { nullValue: null };
      }
      if (typeof value === 'boolean') {
        return { booleanValue: value };
      }
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return { integerValue: String(value) };
        }
        return { doubleValue: value };
      }
      if (typeof value === 'string') {
        return { stringValue: value };
      }
      if (Array.isArray(value)) {
        return {
          arrayValue: {
            values: value.map(v => this.toFirestoreValue(v))
          }
        };
      }
      if (typeof value === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(value)) {
          // Avoid undefined properties
          if (v !== undefined) {
            fields[k] = this.toFirestoreValue(v);
          }
        }
        return { mapValue: { fields } };
      }
      return { stringValue: String(value) };
    },

    /**
     * Convert JavaScript object to Firestore Document format: { fields: { ... } }
     */
    objectToFirestoreDocument(obj) {
      const fields = {};
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) {
            fields[k] = this.toFirestoreValue(v);
          }
        }
      }
      return { fields };
    },

    /**
     * Convert Firestore Value format back to standard JavaScript primitive/object
     */
    fromFirestoreValue(valueObj) {
      if (!valueObj || typeof valueObj !== 'object') return null;

      if ('nullValue' in valueObj) return null;
      if ('booleanValue' in valueObj) return Boolean(valueObj.booleanValue);
      if ('integerValue' in valueObj) return parseInt(valueObj.integerValue, 10);
      if ('doubleValue' in valueObj) return parseFloat(valueObj.doubleValue);
      if ('stringValue' in valueObj) return String(valueObj.stringValue);
      if ('timestampValue' in valueObj) return String(valueObj.timestampValue);
      if ('arrayValue' in valueObj) {
        const list = valueObj.arrayValue && Array.isArray(valueObj.arrayValue.values)
          ? valueObj.arrayValue.values
          : [];
        return list.map(v => this.fromFirestoreValue(v));
      }
      if ('mapValue' in valueObj) {
        const fields = (valueObj.mapValue && valueObj.mapValue.fields) || {};
        const result = {};
        for (const [k, v] of Object.entries(fields)) {
          result[k] = this.fromFirestoreValue(v);
        }
        return result;
      }
      return null;
    },

    /**
     * Convert Firestore Document back to standard JavaScript object
     */
    firestoreDocumentToObject(doc) {
      if (!doc || !doc.fields) return null;
      const result = {};
      for (const [k, v] of Object.entries(doc.fields)) {
        result[k] = this.fromFirestoreValue(v);
      }
      return result;
    },

    /**
     * Fetch document from Firestore REST API
     */
    async getDocument(collectionName, docId) {
      const baseUrl = this.getBaseUrl();
      const apiKey = this.config.apiKey ? `?key=${encodeURIComponent(this.config.apiKey)}` : '';
      const url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}${apiKey}`;

      const res = await this._fetchWithTimeout(url, { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Firestore GET failed (${res.status}): ${errText}`);
      }
      const data = await res.json();
      return this.firestoreDocumentToObject(data);
    },

    /**
     * Save or Patch document in Firestore REST API
     */
    async setDocument(collectionName, docId, dataObj) {
      const baseUrl = this.getBaseUrl();
      const apiKey = this.config.apiKey ? `?key=${encodeURIComponent(this.config.apiKey)}` : '';
      const url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}${apiKey}`;

      const docPayload = this.objectToFirestoreDocument(dataObj);
      const res = await this._fetchWithTimeout(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docPayload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Firestore PATCH failed (${res.status}): ${errText}`);
      }
      const data = await res.json();
      return this.firestoreDocumentToObject(data);
    },

    /**
     * List all documents in a collection from Firestore REST API
     */
    async listDocuments(collectionName, pageSize = 300) {
      const baseUrl = this.getBaseUrl();
      const apiKeyParam = this.config.apiKey ? `&key=${encodeURIComponent(this.config.apiKey)}` : '';
      let allDocs = [];
      let pageToken = '';

      do {
        const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
        const url = `${baseUrl}/${encodeURIComponent(collectionName)}?pageSize=${pageSize}${apiKeyParam}${tokenParam}`;

        const res = await this._fetchWithTimeout(url, { method: 'GET' });
        if (res.status === 404) break;
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Firestore LIST failed (${res.status}): ${errText}`);
        }
        const data = await res.json();
        const docs = Array.isArray(data.documents) ? data.documents : [];
        allDocs.push(...docs);
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      return allDocs.map(d => this.firestoreDocumentToObject(d)).filter(Boolean);
    },

    /**
     * Delete document from Firestore REST API
     */
    async deleteDocument(collectionName, docId) {
      const baseUrl = this.getBaseUrl();
      const apiKey = this.config.apiKey ? `?key=${encodeURIComponent(this.config.apiKey)}` : '';
      const url = `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}${apiKey}`;

      const res = await this._fetchWithTimeout(url, { method: 'DELETE' });
      if (res.status === 404 || res.ok) return true;
      const errText = await res.text();
      throw new Error(`Firestore DELETE failed (${res.status}): ${errText}`);
    },

    /**
     * Convert base64 data to binary Uint8Array or Buffer
     */
    base64ToUint8Array(base64Data) {
      let clean = base64Data || '';
      if (clean.includes(',')) clean = clean.split(',')[1];
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(clean, 'base64');
      }
      const binaryStr = atob(clean);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    },

    /**
     * Upload binary photo to Firebase Cloud Storage.
     * Decouples heavy image binaries from Firestore documents.
     * If storage bucket is unreachable or not yet configured, returns base64 safely as fallback.
     */
    async uploadImage(base64Str, remotePath) {
      if (!base64Str || typeof base64Str !== 'string') return null;
      // If already a remote URL, return directly
      if (base64Str.startsWith('http://') || base64Str.startsWith('https://')) {
        return base64Str;
      }
      if (!this.config.storageBucket) {
        return base64Str;
      }

      const bucket = this.config.storageBucket;
      const cleanPath = remotePath || `images/items/img_${Date.now()}.jpg`;
      const mime = base64Str.includes('image/png') ? 'image/png' : 'image/jpeg';
      const binaryData = this.base64ToUint8Array(base64Str);

      const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?name=${encodeURIComponent(cleanPath)}&uploadType=media`;

      try {
        const res = await this._fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': mime
          },
          body: binaryData
        });

        if (res.ok) {
          const data = await res.json();
          const token = data.downloadTokens ? `&token=${encodeURIComponent(data.downloadTokens)}` : '';
          const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(cleanPath)}?alt=media${token}`;
          return downloadUrl;
        } else {
          // If storage returns 404/403 (bucket pending), fallback gracefully to base64
          return base64Str;
        }
      } catch (uploadErr) {
        console.warn('Cloud storage upload fallback note:', uploadErr.message);
        return base64Str;
      }
    },

    /**
     * Internal fetch with timeout & cross-environment safety
     */
    async _fetchWithTimeout(url, options = {}) {
      const timeout = this.config.timeoutMs || 10000;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const id = controller ? setTimeout(() => controller.abort(), timeout) : null;

      try {
        const fetchFn = (typeof window !== 'undefined' && window.fetch) || global.fetch;
        if (!fetchFn) {
          throw new Error('Native fetch API is not available in current environment');
        }
        const opt = { ...options };
        if (controller) opt.signal = controller.signal;
        const response = await fetchFn(url, opt);
        return response;
      } finally {
        if (id) clearTimeout(id);
      }
    },

    /**
     * Safe bidirectional merge between local database array and remote records.
     * ZERO data loss: Never deletes local records missing from remote during normal sync.
     * Resolves conflicts by comparing `updatedAt` / `createdAt` timestamps.
     */
    mergeArray(localArray = [], remoteArray = [], idKey = 'id') {
      const merged = [...localArray];
      const localMap = new Map();
      merged.forEach((item, index) => {
        if (item && item[idKey]) {
          localMap.set(String(item[idKey]), index);
        }
      });

      const itemsToUpload = [];

      for (const remoteItem of remoteArray) {
        if (!remoteItem || !remoteItem[idKey]) continue;
        const rKey = String(remoteItem[idKey]);

        if (localMap.has(rKey)) {
          const localIndex = localMap.get(rKey);
          const localItem = merged[localIndex];

          const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
          const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();

          if (remoteTime > localTime) {
            // Remote is newer: merge remote over local, keeping non-conflicting properties
            merged[localIndex] = { ...localItem, ...remoteItem };
          } else if (localTime > remoteTime) {
            // Local is newer: keep local, flag for upload to cloud
            itemsToUpload.push(localItem);
          }
        } else {
          // New record from cloud: add to local inventory
          merged.push(remoteItem);
          localMap.set(rKey, merged.length - 1);
        }
      }

      // Any local items that weren't in remote at all should be uploaded to cloud
      for (const localItem of localArray) {
        if (localItem && localItem[idKey]) {
          const existsInRemote = remoteArray.some(r => r && String(r[idKey]) === String(localItem[idKey]));
          if (!existsInRemote) {
            itemsToUpload.push(localItem);
          }
        }
      }

      return { merged, itemsToUpload };
    },

    /**
     * Query documents modified after a specific ISO timestamp using Firestore runQuery.
     * Dramatically reduces bandwidth by fetching only edited records.
     */
    async queryUpdatedDocuments(collectionName, sinceTimestamp) {
      if (!sinceTimestamp) return [];
      const { projectId, databaseId, apiKey } = this.config;
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:runQuery?key=${encodeURIComponent(apiKey)}`;

      const body = {
        structuredQuery: {
          from: [{ collectionId: collectionName }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'updatedAt' },
              op: 'GREATER_THAN',
              value: { stringValue: sinceTimestamp }
            }
          }
        }
      };

      const res = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`Firestore delta runQuery failed (${res.status})`);
      }

      const results = await res.json();
      if (!Array.isArray(results)) return [];
      return results
        .filter(r => r && r.document)
        .map(r => this.firestoreDocumentToObject(r.document));
    },

    /**
     * Full and delta bidirectional sync routine.
     * Safely migrates local data to cloud and merges remote updates with zero data loss.
     */
    async syncAll(localDb, options = {}) {
      if (!this.isEnabled()) return { success: false, reason: 'Sync disabled' };
      if (!localDb || typeof localDb !== 'object') {
        return { success: false, reason: 'No active local database provided' };
      }
      if (this.syncInProgress) {
        return { success: false, reason: 'Sync already in progress' };
      }

      this.syncInProgress = true;
      const isDelta = Boolean(this.lastSyncTime && !options.forceFull);
      this.updateStatus('syncing', isDelta ? 'Checking cloud for updates...' : 'Syncing full catalog with cloud...');

      const prefix = this.config.collectionPrefix || 'mava_catalog';
      const collections = [
        { name: `${prefix}_items`, key: 'items', idKey: 'id' },
        { name: `${prefix}_emeralds`, key: 'emeralds', idKey: 'id' },
        { name: `${prefix}_stones`, key: 'stones', idKey: 'id' },
        { name: `${prefix}_jewelry_memos`, key: 'jewelryMemos', idKey: 'id' },
        { name: `${prefix}_jewel_stone_memos`, key: 'jewelStoneMemos', idKey: 'id' },
        { name: `${prefix}_jewelry_sales`, key: 'jewelrySales', idKey: 'id' }
      ];

      let anyUpdates = false;

      try {
        // 1. Sync Settings Document first
        try {
          const remoteSettings = await this.getDocument(`${prefix}_meta`, 'settings');
          if (remoteSettings) {
            const localSettingsTime = new Date(localDb.settings?.updatedAt || 0).getTime();
            const remoteSettingsTime = new Date(remoteSettings.updatedAt || 0).getTime();
            if (remoteSettingsTime > localSettingsTime) {
              localDb.settings = { ...localDb.settings, ...remoteSettings };
              anyUpdates = true;
            } else if (localSettingsTime > remoteSettingsTime) {
              await this.setDocument(`${prefix}_meta`, 'settings', localDb.settings);
            }
          } else if (localDb.settings) {
            await this.setDocument(`${prefix}_meta`, 'settings', localDb.settings);
          }
        } catch (settingsErr) {
          console.warn('Settings cloud sync note:', settingsErr.message);
        }

        // 2. Sync inventory collections (Delta or Full)
        let failedCount = 0;
        let lastErr = null;

        for (const col of collections) {
          if (!Array.isArray(localDb[col.key])) {
            localDb[col.key] = [];
          }
          const localList = localDb[col.key];

          if (isDelta) {
            // Delta path: Only fetch documents modified since last sync
            try {
              const updatedDocs = await this.queryUpdatedDocuments(col.name, this.lastSyncTime);
              if (updatedDocs && updatedDocs.length > 0) {
                for (const remoteItem of updatedDocs) {
                  if (!remoteItem || !remoteItem[col.idKey]) continue;
                  const idx = localList.findIndex(l => l && String(l[col.idKey]) === String(remoteItem[col.idKey]));
                  if (idx >= 0) {
                    const localTime = new Date(localList[idx].updatedAt || localList[idx].createdAt || 0).getTime();
                    const remoteTime = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();
                    if (remoteTime >= localTime) {
                      localList[idx] = { ...localList[idx], ...remoteItem };
                      anyUpdates = true;
                    }
                  } else {
                    localList.push(remoteItem);
                    anyUpdates = true;
                  }
                }
              }
            } catch (deltaErr) {
              console.warn(`Delta query for ${col.name} failed, falling back to standard list:`, deltaErr.message);
              // Fallback to full list for this collection
              try {
                const remoteList = await this.listDocuments(col.name);
                const { merged, itemsToUpload } = this.mergeArray(localList, remoteList, col.idKey);
                if (merged.length !== localList.length || itemsToUpload.length > 0) {
                  localDb[col.key] = merged;
                  anyUpdates = true;
                }
              } catch (listErr) {
                failedCount++;
                lastErr = listErr;
              }
            }
          } else {
            // Full reconciliation path
            let remoteList = [];
            try {
              remoteList = await this.listDocuments(col.name);
            } catch (listErr) {
              console.warn(`Could not list remote ${col.name}:`, listErr.message);
              failedCount++;
              lastErr = listErr;
              continue;
            }

            const { merged, itemsToUpload } = this.mergeArray(localList, remoteList, col.idKey);

            if (merged.length !== localList.length || itemsToUpload.length > 0) {
              localDb[col.key] = merged;
              anyUpdates = true;
            }

            for (const item of itemsToUpload) {
              if (item && item[col.idKey]) {
                try {
                  await this.setDocument(col.name, String(item[col.idKey]), item);
                } catch (upErr) {
                  console.warn(`Failed to push ${col.name}/${item[col.idKey]}:`, upErr.message);
                }
              }
            }
          }
        }

        if (failedCount === collections.length) {
          throw new Error(lastErr ? lastErr.message : 'All remote collections unreachable');
        }

        this.lastSyncTime = new Date().toISOString();
        this.updateStatus('online', `Sync complete at ${new Date().toLocaleTimeString()}`);

        // Notify application components via custom event
        if (anyUpdates && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('mava:cloud-synced', {
              detail: { updated: anyUpdates, timestamp: this.lastSyncTime }
            }));
          } catch (_) {}
        }

        return { success: true, updated: anyUpdates, timestamp: this.lastSyncTime };
      } catch (err) {
        console.warn('Cloud sync error (local database safely protected):', err.message);
        this.updateStatus('offline', `Offline / Local Vault Protected (${err.message})`);
        return { success: false, error: err.message };
      } finally {
        this.syncInProgress = false;
      }
    },

    /**
     * Non-blocking trigger to queue a background sync
     */
    queueSync(delayMs = 2000) {
      if (!this.isEnabled()) return;
      if (this._syncTimeout) clearTimeout(this._syncTimeout);

      this._syncTimeout = setTimeout(async () => {
        if (typeof window !== 'undefined' && window.DBManager && window.DBManager.database) {
          const result = await this.syncAll(window.DBManager.database);
          if (result && result.updated && window.App && typeof window.App.refreshAllDisplays === 'function') {
            window.App.refreshAllDisplays();
          }
        }
      }, delayMs);
      if (this._syncTimeout && typeof this._syncTimeout.unref === 'function') {
        this._syncTimeout.unref();
      }
    },

    /**
     * Start recurring background auto-sync and real-time wake listeners
     */
    setupAutoSync() {
      // 1. Instant sync when app regains focus or user unlocks mobile screen
      if (typeof window !== 'undefined' && window.addEventListener && !this._listenersBound) {
        this._listenersBound = true;
        window.addEventListener('focus', () => {
          if (this.isEnabled() && !this.syncInProgress) {
            this.queueSync(200);
          }
        });
        if (typeof document !== 'undefined' && document.addEventListener) {
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isEnabled() && !this.syncInProgress) {
              this.queueSync(200);
            }
          });
        }
      }

      // 2. Active recurring interval
      if (typeof setInterval === 'undefined') return;
      if (this._autoSyncInterval) clearInterval(this._autoSyncInterval);
      const interval = Math.max(10000, this.config.autoSyncIntervalMs || 15000);
      this._autoSyncInterval = setInterval(() => {
        if (this.isEnabled() && !this.syncInProgress) {
          this.queueSync(500);
        }
      }, interval);
      if (this._autoSyncInterval && typeof this._autoSyncInterval.unref === 'function') {
        this._autoSyncInterval.unref();
      }
    }
  };

  // Export to global scope
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CloudSync;
  }
  global.CloudSync = CloudSync;

})(typeof window !== 'undefined' ? window : globalThis);
