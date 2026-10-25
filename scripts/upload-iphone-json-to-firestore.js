#!/usr/bin/env node

/**
 * Upload verified iPhone DB JSON directly to Firebase Firestore
 */

const fs = require('fs');
const path = require('path');
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));

async function upload() {
  console.log('\n======================================================');
  console.log('🚀 UPLOADING COMPLETE IPHONE DATA TO FIRESTORE CLOUD');
  console.log('======================================================\n');

  const jsonPath = '/tmp/iphone_db.json';
  if (!fs.existsSync(jsonPath)) {
    throw new Error('Parsed iPhone JSON not found at /tmp/iphone_db.json');
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const db = JSON.parse(raw);

  console.log('Database summary from iPhone:');
  console.log(` • Jewelry Items : ${db.items ? db.items.length : 0}`);
  console.log(` • Emeralds      : ${db.emeralds ? db.emeralds.length : 0}`);
  console.log(` • Loose Stones  : ${db.stones ? db.stones.length : 0}`);
  console.log(` • Jewelry Memos : ${db.jewelryMemos ? db.jewelryMemos.length : 0}`);
  console.log(` • Jewelry Sales : ${db.jewelrySales ? db.jewelrySales.length : 0}`);
  console.log(` • Emerald Memos : ${db.memos ? db.memos.length : 0}`);
  console.log(` • Stock Ledger  : ${db.stockLedger ? db.stockLedger.length : 0}`);

  CloudSync.init({
    projectId: 'mava-gems-ios',
    apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
    collectionPrefix: 'mava_catalog',
    timeoutMs: 25000
  });

  // 1. Upload Settings
  if (db.settings) {
    console.log('\n1. Uploading Settings...');
    await CloudSync.setDocument('mava_catalog_meta', 'settings', db.settings);
    console.log(' ✔ Settings uploaded successfully!');
  }

  // 2. Helper to upload collection
  async function uploadList(colName, list, idKey, label) {
    if (!Array.isArray(list) || list.length === 0) {
      console.log(` • ${label}: 0 records to upload`);
      return;
    }
    console.log(`\nUploading ${label} (${list.length} records) to ${colName}...`);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      const docId = String(item[idKey] || item.id || `rec_${i + 1}`);

      // Strip large image if present in memo items to avoid Firestore 1MB doc size limit
      let uploadPayload = item;
      if (colName === 'mava_catalog_jewelry_memos' && Array.isArray(item.items)) {
        uploadPayload = {
          ...item,
          items: item.items.map(it => {
            const copy = { ...it };
            if (copy.image && copy.image.length > 5000) {
              // Keep thumbnail or reference if needed, but remove giant raw base64 from memo copy
              delete copy.image;
            }
            return copy;
          })
        };
      }

      try {
        await CloudSync.setDocument(colName, docId, uploadPayload);
        success++;
        const identifier = item.memoNumber || item.sku || item.pudiaNumber || docId;
        process.stdout.write(`\r   ✔ [${i + 1}/${list.length}] ${identifier}   `);
      } catch (e) {
        failed++;
        console.error(`\n   ❌ Failed ${docId}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 20));
    }
    console.log(`\n ✔ Completed ${label}: ${success} uploaded, ${failed} failed.`);
  }

  // Upload in order of priority: memos first!
  await uploadList('mava_catalog_jewelry_memos', db.jewelryMemos, 'id', 'Jewelry Memos');
  await uploadList('mava_catalog_jewelry_sales', db.jewelrySales, 'id', 'Jewelry Sales');
  await uploadList('mava_catalog_emerald_memos', db.memos, 'id', 'Emerald Memos');
  await uploadList('mava_catalog_items', db.items, 'id', 'Jewelry Items');
  await uploadList('mava_catalog_emeralds', db.emeralds, 'id', 'Emeralds');
  await uploadList('mava_catalog_stones', db.stones, 'id', 'Loose Stones');
  await uploadList('mava_catalog_stock_ledger', db.stockLedger, 'id', 'Stock Ledger');

  console.log('\n======================================================');
  console.log('🎉 ALL IPHONE DATA HAS BEEN FORCE-WRITTEN TO FIRESTORE!');
  console.log('======================================================\n');
}

upload().catch(console.error);
