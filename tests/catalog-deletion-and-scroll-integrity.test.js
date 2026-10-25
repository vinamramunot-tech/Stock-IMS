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
      /#modal-generic-confirm\s*\.modal-confirm-card\s*\{[^}]*background:\s*linear-gradient/s,
      'Confirmation card must have a rich, non-white gradient background'
    );
    assert.match(
      customCss,
      /#modal-generic-confirm\s*#generic-confirm-msg\s*\{[^}]*color:\s*#f1f1f5\s*!important;/s,
      'Confirmation message text must be crisp, high-contrast light text'
    );
    assert.match(
      customCss,
      /#modal-generic-confirm\s*\.btn-danger\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#ef4444/s,
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
});
