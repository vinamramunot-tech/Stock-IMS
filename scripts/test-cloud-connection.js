#!/usr/bin/env node

/**
 * Diagnostic & Cloud Verification Utility for Mava Gems
 * Run with: node scripts/test-cloud-connection.js
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mava-gems-ios';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyALEzdipzOrS4U0_wAj69UHTSIpIBAhvsc';
const DATABASE_ID = '(default)';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

async function testConnection() {
  console.log(`\n======================================================`);
  console.log(`💎 MAVA GEMS CLOUD DATABASE CONNECTIVITY DIAGNOSTIC`);
  console.log(`======================================================`);
  console.log(`• Project ID   : ${PROJECT_ID}`);
  console.log(`• Database     : ${DATABASE_ID}`);
  console.log(`• Target URL   : ${BASE_URL}\n`);

  const testUrl = `${BASE_URL}/mava_catalog_meta?key=${API_KEY}`;

  try {
    const res = await fetch(testUrl, { method: 'GET' });
    const text = await res.text();

    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_) {}

    if (res.ok || res.status === 404) {
      console.log(`✅ [SUCCESS] Cloud Firestore endpoint is REACHABLE!`);
      console.log(`   Status code: ${res.status}`);

      // Perform a write test
      console.log(`\nTesting read/write permissions...`);
      const writeUrl = `${BASE_URL}/mava_catalog_meta/test_health_check?key=${API_KEY}`;
      const writeRes = await fetch(writeUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'HEALTHY' },
            timestamp: { stringValue: new Date().toISOString() },
            app: { stringValue: 'Mava Gems Stock' }
          }
        })
      });

      if (writeRes.ok) {
        console.log(`✅ [SUCCESS] Read/Write test succeeded! Your database is 100% active and live.`);
        console.log(`   Multi-device catalog synchronization is ready.\n`);
      } else {
        const writeErr = await writeRes.text();
        console.log(`⚠️  Endpoint reached, but write permission check returned (${writeRes.status}):`);
        console.log(writeErr);
        console.log(`\n💡 To enable read/write in Firebase Console:`);
        console.log(`   1. Go to https://console.firebase.google.com/project/${PROJECT_ID}/firestore/rules`);
        console.log(`   2. In the Rules tab, set:`);
        console.log(`      allow read, write: if true;`);
        console.log(`   3. Click "Publish".\n`);
      }
      return;
    }

    if (res.status === 403) {
      console.log(`❌ [ACTION REQUIRED] Google Cloud API Gateway reported:`);
      if (data.error && data.error.message) {
        console.log(`   "${data.error.message}"\n`);
      }

      if (text.includes('SERVICE_DISABLED') || text.includes('has not been used in project')) {
        console.log(`👉 Step 1: Click this link to enable Cloud Firestore API for your project:`);
        console.log(`   https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${PROJECT_ID}`);
        console.log(`   Click the blue "ENABLE" button.\n`);
        console.log(`👉 Step 2: Ensure Firestore Security Rules allow read/write:`);
        console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/firestore/rules`);
      } else if (text.includes('PERMISSION_DENIED') || text.includes('permission')) {
        console.log(`👉 Security Rules need to allow read/write:`);
        console.log(`   1. Open https://console.firebase.google.com/project/${PROJECT_ID}/firestore/rules`);
        console.log(`   2. Change rule to: allow read, write: if true;`);
        console.log(`   3. Click "Publish".`);
      }
      return;
    }

    console.log(`Unexpected response status (${res.status}):`);
    console.log(text);

  } catch (err) {
    console.error(`❌ Network error while connecting to Firestore:`, err.message);
  }
}

testConnection();
