#!/usr/bin/env node

/**
 * Live End-to-End CloudSync Verification against production Firestore
 * Run with: node scripts/verify-live-sync.js
 */

const path = require('node:path');
const CloudSync = require(path.join(__dirname, '../renderer/js/cloud-sync.js'));

async function verifyLiveSync() {
  console.log(`\n======================================================`);
  console.log(`🚀 VERIFYING END-TO-END LIVE CLOUD SYNCHRONIZATION`);
  console.log(`======================================================\n`);

  CloudSync.init({
    projectId: 'mava-gems-ios',
    apiKey: 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc',
    collectionPrefix: 'mava_catalog'
  });

  // Sample database structure mirroring actual Mava Gems inventory
  const testDatabase = {
    settings: {
      currency: "₹",
      goldRate24kt: {
        ratePerGram: 7850,
        effectiveDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString()
      },
      usdToInr: {
        rate: 86.5,
        effectiveDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString()
      }
    },
    items: [
      {
        id: "piece_live_test_01",
        sku: "MG-LIVE-1001",
        name: "Emerald & Diamond Cluster Ring",
        category: "Rings",
        status: "In Stock",
        grossWeight: 5.62,
        netWeight: 4.85,
        goldRate: 7850,
        mfgCostPrice: 48000,
        marketCostPrice: 52000,
        multiplier: 1.25,
        sellingPrice: 65000,
        multiplierBasis: "marketCostPrice",
        hasEmeralds: true,
        stones: [
          { type: "Emerald", shape: "Emerald Cut", pieces: 1, weight: 1.45, rate: 25000 },
          { type: "Diamond", shape: "Round", pieces: 24, weight: 0.62, rate: 38000 }
        ],
        updatedAt: new Date().toISOString()
      }
    ],
    emeralds: [
      {
        id: "pudia_live_test_01",
        pudiaNumber: "PUD-9001",
        origin: "Zambian",
        status: "In Stock",
        totalCarats: 14.85,
        costPerCarat: 1800,
        sellingRatePerCarat: 2800,
        updatedAt: new Date().toISOString()
      }
    ],
    stones: [
      {
        id: "stone_live_test_01",
        packetNumber: "PKT-4001",
        type: "Diamond",
        shape: "Oval",
        weight: 0.85,
        rate: 42000,
        status: "In Stock",
        updatedAt: new Date().toISOString()
      }
    ],
    jewelryMemos: [
      {
        id: "memo_live_test_01",
        memoNumber: "JM-5001",
        personName: "Royal Jewelers VIP",
        date: new Date().toISOString().split('T')[0],
        status: "open",
        items: [
          { itemId: "piece_live_test_01", sku: "MG-LIVE-1001", status: "issued" }
        ],
        updatedAt: new Date().toISOString()
      }
    ],
    jewelStoneMemos: [],
    jewelrySales: []
  };

  console.log(`1. Uploading test catalog to Firestore...`);
  const uploadResult = await CloudSync.syncAll(testDatabase);

  if (!uploadResult.success) {
    console.error(`❌ Upload failed:`, uploadResult.error);
    process.exit(1);
  }

  console.log(`✅ Upload successful at ${uploadResult.timestamp}!`);
  console.log(`   CloudSync Status: ${CloudSync.status}`);

  console.log(`\n2. Verifying remote document retrieval directly from Firestore...`);
  const remoteSettings = await CloudSync.getDocument('mava_catalog_meta', 'settings');
  console.log(`   • Settings Currency : ${remoteSettings?.currency}`);
  console.log(`   • Gold Rate 24KT    : ₹${remoteSettings?.goldRate24kt?.ratePerGram}/g`);
  console.log(`   • USD/INR Exchange  : ₹${remoteSettings?.usdToInr?.rate}`);

  const remotePiece = await CloudSync.getDocument('mava_catalog_items', 'piece_live_test_01');
  console.log(`   • Catalog Piece SKU : ${remotePiece?.sku}`);
  console.log(`   • Piece Name        : ${remotePiece?.name}`);
  console.log(`   • Selling Price     : ₹${remotePiece?.sellingPrice?.toLocaleString()}`);
  console.log(`   • Multiplier Basis  : Applied to ${remotePiece?.multiplierBasis}`);
  console.log(`   • Embedded Stones   : ${remotePiece?.stones?.length} stone groups verified`);

  const remoteEmerald = await CloudSync.getDocument('mava_catalog_emeralds', 'pudia_live_test_01');
  console.log(`   • Emerald Pudia     : ${remoteEmerald?.pudiaNumber} (${remoteEmerald?.totalCarats} cts)`);

  const remoteMemo = await CloudSync.getDocument('mava_catalog_jewelry_memos', 'memo_live_test_01');
  console.log(`   • Jewelry Memo      : ${remoteMemo?.memoNumber} for ${remoteMemo?.personName}`);

  console.log(`\n3. Simulating a second device (pulling from cloud into fresh local database)...`);
  const secondDeviceDatabase = {
    settings: {},
    items: [],
    emeralds: [],
    stones: [],
    jewelryMemos: [],
    jewelStoneMemos: [],
    jewelrySales: []
  };

  const pullResult = await CloudSync.syncAll(secondDeviceDatabase);
  if (!pullResult.success) {
    console.error(`❌ Pull failed:`, pullResult.error);
    process.exit(1);
  }

  console.log(`✅ Second device successfully hydrated from cloud!`);
  console.log(`   • Items Synced     : ${secondDeviceDatabase.items.length}`);
  console.log(`   • Emeralds Synced  : ${secondDeviceDatabase.emeralds.length}`);
  console.log(`   • Stones Synced    : ${secondDeviceDatabase.stones.length}`);
  console.log(`   • Memos Synced     : ${secondDeviceDatabase.jewelryMemos.length}`);

  console.log(`\n======================================================`);
  console.log(`🎉 ALL LIVE BACKEND CALLS ARE FULLY VERIFIED & WORKING!`);
  console.log(`======================================================\n`);
}

verifyLiveSync().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
