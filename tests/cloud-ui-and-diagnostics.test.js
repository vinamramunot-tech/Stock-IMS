const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const styleCssPath = path.resolve(__dirname, '../renderer/css/style.css');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const startupJsPath = path.resolve(__dirname, '../renderer/js/startup.js');

test('Cloud UI, Diagnostics & Showroom Privacy Integrity Suite', async (t) => {
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  const startupJs = fs.readFileSync(startupJsPath, 'utf8');

  await t.test('1. Header Cloud Status Popover & Diagnostics Markup', () => {
    assert.match(htmlContent, /class="cloud-header-status-wrapper"/, 'Header contains popover wrapper');
    assert.match(htmlContent, /id="vault-info-container"/, 'Header contains vault status badge');
    assert.match(htmlContent, /id="cloud-status-popover"/, 'Header contains diagnostics popover');
    assert.match(htmlContent, /id="cloud-header-pending-count"/, 'Header contains pending queue counter badge');
    assert.match(htmlContent, /id="cloud-popover-project"/, 'Popover displays project id');
    assert.match(htmlContent, /id="cloud-popover-latency"/, 'Popover displays network latency');
    assert.match(htmlContent, /id="cloud-popover-last-time"/, 'Popover displays last sync timestamp');
    assert.match(htmlContent, /id="cloud-popover-queue-count"/, 'Popover displays offline queue count');
    assert.match(htmlContent, /id="btn-popover-sync-now"/, 'Popover contains quick Sync Now action');
    assert.match(htmlContent, /id="btn-popover-settings"/, 'Popover contains Cloud Settings shortcut');
  });

  await t.test('2. Showroom Mode Client Privacy: Cloud Technical Diagnostics Are Hidden', () => {
    // Both header wrapper and popover must carry data-client-hide
    assert.match(htmlContent, /<div class="cloud-header-status-wrapper"\s+data-client-hide/, 'Header wrapper has data-client-hide');
    assert.match(htmlContent, /<div id="cloud-status-popover"[\s\S]*?data-client-hide/, 'Popover has data-client-hide');

    // custom.css must enforce display none !important on [data-client-hide] in showroom mode
    assert.match(
      customCss,
      /body\.showroom-client-mode\s+\[data-client-hide\][\s\S]*?display:\s*none\s*!important/,
      'Showroom mode suppresses all data-client-hide technical indicators'
    );
  });

  await t.test('3. Photo Loading Shimmer Skeleton CSS', () => {
    assert.match(styleCss, /\.product-img-box\.loading::after/, 'CSS defines shimmer pseudo-element on loading box');
    assert.match(styleCss, /animation:\s*imgBoxShimmer/, 'CSS binds imgBoxShimmer animation');
    assert.match(styleCss, /@keyframes\s+imgBoxShimmer/, 'Keyframes for photo shimmer are defined');
  });

  await t.test('4. Per-Item Cloud Sync Micro-Dot Indicator Styling', () => {
    assert.match(styleCss, /\.item-cloud-sync-dot/, 'Micro sync dot base style exists');
    assert.match(styleCss, /\.item-cloud-sync-dot\.synced/, 'Synced green indicator defined');
    assert.match(styleCss, /\.item-cloud-sync-dot\.pending/, 'Pending amber pulse indicator defined');
    assert.match(styleCss, /@keyframes\s+pulse-dot-amber/, 'Pulsing animation for queued items exists');
  });

  await t.test('5. Vault Settings Tab Diagnostics & Flush Button', () => {
    assert.match(htmlContent, /id="cloud-sync-latency-display"/, 'Settings displays network latency');
    assert.match(htmlContent, /id="cloud-sync-queue-display"/, 'Settings displays offline queue status');
    assert.match(htmlContent, /id="btn-flush-offline-queue"/, 'Settings provides Flush Offline Queue button');
  });

  await t.test('6. Startup JS Event Wiring for Popover & Queue Listeners', () => {
    assert.match(startupJs, /cloudStatusHeader\.addEventListener\('click'/, 'Wires popover toggle on badge click');
    assert.match(startupJs, /btnPopoverSync\.addEventListener\('click'/, 'Wires quick sync action in popover');
    assert.match(startupJs, /window\.addEventListener\('mava:queue-changed'/, 'Listens to queue changes in real-time');
  });
});
