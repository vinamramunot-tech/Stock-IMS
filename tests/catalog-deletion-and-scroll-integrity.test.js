const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const catalogJsPath = path.resolve(__dirname, '../renderer/js/catalog.js');
const uiJsPath = path.resolve(__dirname, '../renderer/js/ui.js');
const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');

test('Catalog Deletion Experience & Scroll Integrity Suite', async (t) => {
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  const catalogJs = fs.readFileSync(catalogJsPath, 'utf8');
  const uiJs = fs.readFileSync(uiJsPath, 'utf8');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  await t.test('1. Confirmation Popup has high-contrast obsidian styling and dark background', () => {
    // Assert modal-confirm-card has high-contrast background and border in custom.css
    assert.match(
      customCss,
      /#modal-generic-confirm\s*\.modal-confirm-card[^{]*\{[^}]*background:\s*linear-gradient/s,
      'Confirmation card must have a rich, non-white gradient background'
    );
    assert.match(
      customCss,
      /#modal-generic-confirm\s*#generic-confirm-msg\s*\{[^}]*color:\s*#f1f1f5\s*!important;/s,
      'Confirmation message text must be crisp, high-contrast light text'
    );
    assert.match(
      customCss,
      /\.modal-confirm-card\s*\.btn-danger\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#ef4444/s,
      'Confirm delete action button must be distinct high-contrast red'
    );
  });

  await t.test('2. Confirmation dialog includes warning icon and title element in HTML', () => {
    assert.match(
      indexHtml,
      /<div\s+class="modal-confirm-icon-pulse\s+danger">/,
      'Confirmation modal must include a warning/trash icon badge'
    );
    assert.match(
      indexHtml,
      /<h3\s+id="generic-confirm-title">/,
      'Confirmation modal must have generic-confirm-title element for dynamic headers'
    );
  });

  await t.test('3. UI.confirm supports optional title, confirmText, and cancelText', () => {
    assert.match(
      uiJs,
      /confirm\(message,\s*callback,\s*options\s*=\s*\{\}\)/,
      'UI.confirm must accept options parameter'
    );
    assert.match(
      uiJs,
      /options\.title/,
      'UI.confirm must dynamically set modal title from options'
    );
    assert.match(
      uiJs,
      /options\.confirmText/,
      'UI.confirm must dynamically set confirm button text from options'
    );
  });

  await t.test('4. In-place card deletion exit animation exists and prevents screen refresh', () => {
    assert.match(
      customCss,
      /\.product-card\.item-deleting[^{]*\{[^}]*opacity:\s*0\s*!important;[^}]*transform:\s*scale\(0\.9\)/s,
      'CSS must provide smooth scaling and blur exit animation for deleted items'
    );
    assert.match(
      catalogJs,
      /card\.classList\.add\('item-deleting'\);/,
      'handleDeleteItem must apply item-deleting class to card for in-place exit animation'
    );
    assert.match(
      catalogJs,
      /card\.setAttribute\('data-id',\s*item\.id\);/,
      'createProductCard must set data-id attribute on cards for fast DOM retrieval'
    );
  });

  await t.test('5. renderCatalogGrid locks container minHeight and restores scroll position', () => {
    assert.match(
      catalogJs,
      /gridContainer\.style\.minHeight\s*=\s*`\$\{prevHeight\}px`;/,
      'renderCatalogGrid must lock minHeight before clearing to prevent scroll container collapse'
    );
    assert.match(
      catalogJs,
      /requestAnimationFrame\(\(\)\s*=>\s*\{/,
      'renderCatalogGrid must restore scroll position in requestAnimationFrame'
    );
  });

  await t.test('6. Emerald catalog preserves accordion states and animates deletions in-place', () => {
    const emeraldJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/emerald.js'), 'utf8');
    assert.match(
      emeraldJs,
      /this\._expandedGroups\s*=\s*this\._expandedGroups\s*\|\|\s*new\s*Set\(\);/,
      'EmeraldController must maintain _expandedGroups set across re-renders'
    );
    assert.match(
      emeraldJs,
      /pudiaBlock\.setAttribute\('data-id',\s*item\.id\);/,
      'Emerald pudiaBlock must have data-id set for in-place deletion targeting'
    );
    assert.match(
      emeraldJs,
      /targetEl\.classList\.add\('item-deleting'\);/,
      'handleDeleteEmerald must animate out target element without full screen refresh'
    );
  });

  await t.test('7. Loose stone catalog preserves accordion states and animates deletions in-place', () => {
    const stoneJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/stone.js'), 'utf8');
    assert.match(
      stoneJs,
      /this\._expandedGroups\s*=\s*this\._expandedGroups\s*\|\|\s*new\s*Set\(\);/,
      'StoneController must maintain _expandedGroups set across re-renders'
    );
    assert.match(
      stoneJs,
      /packBlock\.setAttribute\('data-id',\s*item\.id\);/,
      'Stone packBlock must have data-id set for in-place deletion targeting'
    );
    assert.match(
      stoneJs,
      /packEl\.classList\.add\('item-deleting'\);/,
      'handleDeleteStone must animate out packEl without full screen refresh'
    );
  });

  await t.test('8. Jewelry Sales table locks tbody height and animates return sale row in-place', () => {
    const salesJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewelry-sales.js'), 'utf8');
    assert.match(
      salesJs,
      /tr\.setAttribute\('data-sale-id',\s*sale\.id\);/,
      'Sales table row must have data-sale-id set'
    );
    assert.match(
      salesJs,
      /row\.classList\.add\('item-deleting'\);/,
      'handleReturnSale must smoothly animate out row with item-deleting class'
    );
    assert.match(
      salesJs,
      /tbody\.style\.minHeight\s*=\s*prevHeight\s*\+\s*'px';/,
      'renderSalesList must lock minHeight before clearing tbody'
    );
  });

  await t.test('9. Memos controllers lock tbody height to eliminate scroll snap', () => {
    const jewelMemoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewelry-memo.js'), 'utf8');
    const emeraldMemoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/memo.js'), 'utf8');
    const jewelStoneMemoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewel-stone-memo.js'), 'utf8');

    assert.match(jewelMemoJs, /tbody\.style\.minHeight\s*=\s*prevHeight\s*\+\s*'px';/, 'Jewelry memo list must lock tbody minHeight');
    assert.match(emeraldMemoJs, /tbody\.style\.minHeight\s*=\s*prevHeight\s*\+\s*'px';/, 'Emerald memo list must lock tbody minHeight');
    assert.match(jewelStoneMemoJs, /tbody\.style\.minHeight\s*=\s*prevHeight\s*\+\s*'px';/, 'Jewel stone memo list must lock tbody minHeight');
  });

  await t.test('10. Native Tauri OS dialog bridge (rfd + osascript) is wired up in lib.rs and ui.js', () => {
    const libRsPath = path.resolve(__dirname, '../src-tauri/src/lib.rs');
    const libRs = fs.readFileSync(libRsPath, 'utf8');

    // Verify Rust commands
    assert.match(libRs, /fn\s+native_confirm/, 'lib.rs must export native_confirm');
    assert.match(libRs, /fn\s+native_alert/, 'lib.rs must export native_alert');
    assert.match(libRs, /fn\s+native_prompt/, 'lib.rs must export native_prompt');
    assert.match(libRs, /generate_handler!\[[^\]]*native_confirm/, 'native_confirm must be registered in invoke_handler');
    assert.match(libRs, /generate_handler!\[[^\]]*native_alert/, 'native_alert must be registered in invoke_handler');
    assert.match(libRs, /generate_handler!\[[^\]]*native_prompt/, 'native_prompt must be registered in invoke_handler');

    // Verify UI.js calls Tauri IPC
    assert.match(uiJs, /invoke\('native_confirm'/, 'UI.confirm must invoke native_confirm via Tauri IPC');
    assert.match(uiJs, /invoke\('native_alert'/, 'UI.alert must invoke native_alert via Tauri IPC');
    assert.match(uiJs, /invoke\('native_prompt'/, 'UI.prompt must invoke native_prompt via Tauri IPC');
  });

  await t.test('11. Native iOS Capacitor bridge (UIAlertController) is wired up in AppDelegate.swift and ui.js', () => {
    const appDelegatePath = path.resolve(__dirname, '../ios/App/App/AppDelegate.swift');
    const appDelegate = fs.readFileSync(appDelegatePath, 'utf8');

    // Verify iOS NativeDialogPlugin
    assert.match(appDelegate, /class\s+NativeDialogPlugin:\s*CAPPlugin/, 'AppDelegate.swift must declare NativeDialogPlugin');
    assert.match(appDelegate, /@objc\s+(?:public\s+)?func\s+confirm\(_\s+call:\s*CAPPluginCall\)/, 'NativeDialogPlugin must implement confirm');
    assert.match(appDelegate, /@objc\s+(?:public\s+)?func\s+alert\(_\s+call:\s*CAPPluginCall\)/, 'NativeDialogPlugin must implement alert');
    assert.match(appDelegate, /@objc\s+(?:public\s+)?func\s+prompt\(_\s+call:\s*CAPPluginCall\)/, 'NativeDialogPlugin must implement prompt');
    assert.match(appDelegate, /UIAlertController\(title:/, 'NativeDialogPlugin must present UIAlertController');

    // Verify UI.js calls Capacitor NativeDialog
    assert.match(uiJs, /Plugins\.NativeDialog/, 'UI.js must check Capacitor Plugins.NativeDialog on iOS');
    assert.match(uiJs, /plugin\.confirm\(/, 'UI.confirm must call plugin.confirm on iOS');
    assert.match(uiJs, /plugin\.alert\(/, 'UI.alert must call plugin.alert on iOS');
    assert.match(uiJs, /plugin\.prompt\(/, 'UI.prompt must call plugin.prompt on iOS');
  });
});

