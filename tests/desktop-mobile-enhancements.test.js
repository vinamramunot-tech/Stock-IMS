const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const appJsPath = path.resolve(__dirname, '../renderer/js/app.js');
const catalogJsPath = path.resolve(__dirname, '../renderer/js/catalog.js');
const uiJsPath = path.resolve(__dirname, '../renderer/js/ui.js');

test('Desktop & Mobile Platform Enhancements', async (t) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(customCssPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const catalogJs = fs.readFileSync(catalogJsPath, 'utf8');
  const uiJs = fs.readFileSync(uiJsPath, 'utf8');

  await t.test('1. Search input sanitization and mobile keypad optimization', () => {
    // Catalog search input
    assert.match(
      html,
      /id="search-input"[^>]*autocapitalize="none"[^>]*autocorrect="off"[^>]*inputmode="search"/,
      'Main jewelry catalog search must disable autocorrect and enforce search inputmode'
    );

    // Emerald and Stone search inputs
    assert.match(
      html,
      /id="emerald-search-input"[^>]*autocapitalize="none"[^>]*autocorrect="off"[^>]*inputmode="search"/,
      'Emerald search input must disable autocorrect and enforce search inputmode'
    );
    assert.match(
      html,
      /id="stone-search-input"[^>]*autocapitalize="none"[^>]*autocorrect="off"[^>]*inputmode="search"/,
      'Stone search input must disable autocorrect and enforce search inputmode'
    );

    // SKU code input
    assert.match(
      html,
      /id="item-sku"[^>]*autocapitalize="characters"[^>]*autocorrect="off"/,
      'SKU input must enforce uppercase capitalization and disable autocorrect'
    );

    // Numeric inputs
    assert.match(
      html,
      /id="item-gross-weight"[^>]*inputmode="decimal"/,
      'Gross weight input must specify inputmode="decimal"'
    );
    assert.match(
      html,
      /id="memo-create-carats"[^>]*inputmode="decimal"/,
      'Memo create carats input must specify inputmode="decimal"'
    );
    assert.match(
      html,
      /id="memo-create-pieces"[^>]*inputmode="numeric"/,
      'Memo create pieces input must specify inputmode="numeric"'
    );
  });

  await t.test('2. Catalog chunked lazy rendering and virtualization', () => {
    assert.match(
      catalogJs,
      /renderNextCatalogBatch\s*\(/,
      'catalog.js must define renderNextCatalogBatch for progressive rendering'
    );
    assert.match(
      catalogJs,
      /initCatalogLazyObserver\s*\(/,
      'catalog.js must define initCatalogLazyObserver for intersection-based progressive scroll'
    );
    assert.match(
      catalogJs,
      /catalog-scroll-sentinel/,
      'catalog.js must manage a scroll sentinel for progressive batch loading'
    );
    assert.match(
      catalogJs,
      /createProductCard\s*\(/,
      'catalog.js must extract createProductCard modularly'
    );
  });

  await t.test('3. Desktop Global Command Palette (Cmd+K)', () => {
    assert.match(
      html,
      /id="modal-command-palette"/,
      'index.html must contain #modal-command-palette element'
    );
    assert.match(
      html,
      /id="command-palette-input"/,
      'index.html must contain #command-palette-input element'
    );
    assert.match(
      html,
      /id="command-palette-results"/,
      'index.html must contain #command-palette-results element'
    );

    // CSS Styling
    assert.match(
      css,
      /\.command-palette-card\b/,
      'custom.css must style .command-palette-card'
    );

    // app.js controller
    assert.match(
      appJs,
      /initCommandPalette\s*\(/,
      'app.js must implement initCommandPalette()'
    );
    assert.match(
      appJs,
      /toggleCommandPalette\s*\(/,
      'app.js must implement toggleCommandPalette()'
    );
    assert.match(
      appJs,
      /getCommandPaletteActions\s*\(/,
      'app.js must define getCommandPaletteActions() for quick suite jump and actions'
    );
  });

  await t.test('4. Fullscreen Client Lightbox and Showroom Privacy', () => {
    assert.match(
      html,
      /id="modal-image-lightbox"/,
      'index.html must contain #modal-image-lightbox'
    );
    assert.match(
      html,
      /id="lightbox-specs-pill"/,
      'index.html must contain client-facing #lightbox-specs-pill'
    );

    // Privacy Verification: Lightbox specs pill must NOT have cost price or margin containers
    const lightboxSectionMatch = html.match(/id="lightbox-specs-pill"[\s\S]*?<\/div>/);
    assert.ok(lightboxSectionMatch, 'Must find lightbox specs pill in HTML');
    const lightboxHtml = lightboxSectionMatch[0];
    assert.strictEqual(
      lightboxHtml.includes('cost-price-data'),
      false,
      'Lightbox specs pill must never contain cost-price-data class'
    );
    assert.strictEqual(
      lightboxHtml.includes('margin-data'),
      false,
      'Lightbox specs pill must never contain margin-data class'
    );

    // Lightbox JS Controller
    assert.match(
      appJs,
      /openFullscreenLightbox\s*\(/,
      'app.js must implement openFullscreenLightbox(item)'
    );
    assert.match(
      appJs,
      /initFullscreenLightbox\s*\(/,
      'app.js must implement initFullscreenLightbox() with zoom and pan controls'
    );
  });

  await t.test('5. Native Camera and Direct Clipboard Image Upload', () => {
    assert.match(
      html,
      /id="btn-camera-capture"/,
      'index.html must contain Take Photo with Camera button (#btn-camera-capture)'
    );
    assert.match(
      uiJs,
      /btn-camera-capture/,
      'ui.js must wire up #btn-camera-capture'
    );
    assert.match(
      uiJs,
      /window\.addEventListener\('paste'/,
      'ui.js must listen for clipboard paste events to attach images instantly'
    );
  });

  await t.test('6. Native iOS Sheet Swipe-Down to Dismiss', () => {
    assert.match(
      uiJs,
      /initBottomSheetSwipeGestures\s*\(/,
      'ui.js must implement initBottomSheetSwipeGestures'
    );
    assert.match(
      uiJs,
      /touchstart/,
      'ui.js swipe gesture must track touchstart'
    );
    assert.match(
      uiJs,
      /touchmove/,
      'ui.js swipe gesture must track touchmove'
    );
  });
});
