const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const styleCssPath = path.resolve(__dirname, '../renderer/css/style.css');
const appJsPath = path.resolve(__dirname, '../renderer/js/app.js');
const uiJsPath = path.resolve(__dirname, '../renderer/js/ui.js');
const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');

test('Overlay & Stacking Context Integrity Tests', async (t) => {
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const uiJs = fs.readFileSync(uiJsPath, 'utf8');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  await t.test('1. 10-Tier Modal Stacking & Z-Index Hierarchy in CSS', () => {
    // Level 1: Base modal overlays (1000)
    assert.match(
      customCss,
      /\.modal-overlay\s*\{[^}]*z-index:\s*1000/s,
      'Base modal overlays must start at z-index: 1000'
    );

    // Level 2: Primary Detail Modals (1050)
    assert.match(
      customCss,
      /#modal-jewelry-detail,\s*#modal-memo-detail,\s*#modal-jewel-stone-memo-detail,\s*#modal-jewelry-memo-detail\s*\{[^}]*z-index:\s*1050/s,
      'Primary detail modals must sit at z-index: 1050'
    );

    // Level 3: Action Sub-Modals (1150)
    assert.match(
      customCss,
      /#modal-complete-jewelry-sale,\s*#modal-batch-jewelry-sale,\s*#modal-memo-action-input,\s*#modal-memo-outcome,\s*#modal-jewel-stone-memo-action-input,\s*#modal-share-emerald,\s*#modal-bulk-share-emerald,\s*#modal-import-excel-preview\s*\{[^}]*z-index:\s*1150\s*!important;/s,
      'Action sub-modals must sit at z-index: 1150 !important to overlay detail modals'
    );

    // Level 4: Image Editor & Report Print Preview (1250)
    assert.match(
      customCss,
      /#modal-image-editor,\s*#modal-print-preview\s*\{[^}]*z-index:\s*1250\s*!important;/s,
      'Image editor & report print preview must sit at z-index: 1250 !important'
    );

    // Level 5: Confirmation Dialogs & Prompts (1400)
    assert.match(
      customCss,
      /#modal-generic-confirm,\s*#modal-generic-prompt,\s*#modal-erase-confirm,\s*#modal-clear-logs-confirm\s*\{[^}]*z-index:\s*1400\s*!important;/s,
      'Confirmation dialogs and prompts must sit at z-index: 1400 !important'
    );

    // Level 6: Mobile Menu Drawer (2000)
    assert.match(
      customCss,
      /\.mobile-menu-overlay\s*\{[^}]*z-index:\s*2000\s*!important;/s,
      'Mobile menu drawer overlay must sit at z-index: 2000 !important'
    );

    // Level 7: Fullscreen Presentation & Lightbox (2400)
    assert.match(
      customCss,
      /#modal-jewelry-slideshow,\s*#modal-image-lightbox\s*\{[^}]*z-index:\s*2400\s*!important;/s,
      'Fullscreen presentation and image lightbox must sit at z-index: 2400 !important'
    );

    // Level 8: Global Command Palette (2500)
    assert.match(
      customCss,
      /#modal-command-palette\s*\{[^}]*z-index:\s*2500\s*!important;/s,
      'Global command palette must sit at z-index: 2500 !important'
    );

    // Level 9: Startup Overlay & Lock Screen (9999)
    assert.match(
      customCss,
      /\.startup-overlay-container,\s*\.full-screen-container\s*\{[^}]*z-index:\s*9999\s*!important;/s,
      'Startup overlay and lock screens must sit at z-index: 9999 !important'
    );

    // Level 10: System Toast Alerts (10000)
    assert.match(
      customCss,
      /\.toast\s*\{[^}]*z-index:\s*10000\s*!important;/s,
      'System toast alerts must sit at peak z-index: 10000 !important'
    );
  });

  await t.test('2. Stacking Context Integrity Between Controls, Navbars, and Overlays', () => {
    // Scroll-to-top button stays below mobile bottom navbar and modals
    assert.match(
      customCss,
      /\.scroll-to-top-btn\s*\{[^}]*z-index:\s*800;/s,
      'Scroll-to-top button must be at z-index: 800 (below navbar and modals)'
    );

    // Mobile bottom navigation sits at z-index: 990 (above scroll-to-top, below modals)
    assert.match(
      customCss,
      /\.mobile-bottom-nav\s*\{[^}]*z-index:\s*990;/s,
      'Mobile bottom nav must sit at z-index: 990 (above scroll-to-top, below all modals)'
    );

    // Style.css mobile media query for modal overlay must align to 1000 (not 2000)
    assert.doesNotMatch(
      styleCss,
      /\.modal-overlay\s*\{[^}]*z-index:\s*2000;/s,
      'style.css must not assign z-index: 2000 to .modal-overlay, which would break stacking'
    );
  });

  await t.test('3. Background Scroll Bleed-Through & Scroll-to-Top Suppression', () => {
    // body.modal-open rule
    assert.match(
      customCss,
      /body\.modal-open\s*\{[^}]*overflow:\s*hidden\s*!important;[^}]*touch-action:\s*none;/s,
      'body.modal-open must lock background overflow and touch gestures'
    );

    // Suppression of scroll-to-top button behind active modal
    assert.match(
      customCss,
      /body\.modal-open\s+\.scroll-to-top-btn\s*\{[^}]*opacity:\s*0\s*!important;[^}]*visibility:\s*hidden\s*!important;[^}]*pointer-events:\s*none\s*!important;/s,
      'Scroll-to-top button must be completely suppressed when any modal is open'
    );

    // UI.openModal adds body.modal-open
    assert.match(
      uiJs,
      /openModal\s*\([^)]*\)\s*\{[^}]*document\.body\.classList\.add\(['"]modal-open['"]\);/s,
      'UI.openModal must add modal-open class to document.body'
    );

    // UI.closeModal removes body.modal-open only when all overlays are closed
    assert.match(
      uiJs,
      /closeModal\s*\([^)]*\)\s*\{[^}]*document\.querySelector\(['"]\.modal-overlay:not\(\.hidden\),\s*\.mobile-menu-overlay:not\(\.hidden\)['"]\)/s,
      'UI.closeModal must check for any remaining active overlays before removing modal-open'
    );

    // Mobile menu drawer manages modal-open
    assert.match(
      appJs,
      /mobileMenuOverlay\.classList\.remove\(['"]hidden['"]\);\s*document\.body\.classList\.add\(['"]modal-open['"]\);/s,
      'Opening mobile menu must lock background scrolling'
    );
    assert.match(
      appJs,
      /mobileMenuOverlay\.classList\.add\(['"]hidden['"]\);\s*document\.body\.classList\.remove\(['"]modal-open['"]\);/s,
      'Closing mobile menu must release background scrolling'
    );
  });

  await t.test('4. Toast Stacking, Positioning, and Obstruction Avoidance', () => {
    // Desktop positioning clears scroll-to-top button
    assert.match(
      customCss,
      /\.toast\s*\{[^}]*bottom:\s*32px;[^}]*right:\s*88px;/s,
      'Desktop toast must be positioned with right: 88px to avoid covering scroll-to-top button'
    );

    // Mobile positioning floats above 60px bottom navbar + iOS home indicator
    assert.match(
      customCss,
      /\.toast\s*\{[^}]*bottom:\s*calc\(80px\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)\s*!important;/s,
      'Mobile toast must float comfortably above the mobile bottom nav and home indicator'
    );

    // Mobile toast is centered horizontally
    assert.match(
      customCss,
      /\.toast\s*\{[^}]*left:\s*50%\s*!important;\s*right:\s*auto\s*!important;\s*transform:\s*translateX\(-50%\)/s,
      'Mobile toast must be horizontally centered on mobile viewports'
    );
  });

  await t.test('5. Mobile Viewport, Modal Body Overflow, & Home Indicator Insets', () => {
    // Modal body min-height: 0
    assert.match(
      customCss,
      /\.modal-body\s*\{[^}]*min-height:\s*0;/s,
      '.modal-body must declare min-height: 0 to guarantee proper WebKit flex child scrolling'
    );

    // Modal footer safe-area padding on mobile
    assert.match(
      customCss,
      /\.modal-footer\s*\{[^}]*padding:[^}]*env\(safe-area-inset-bottom/s,
      'Mobile modal-footer must include env(safe-area-inset-bottom) to prevent overlapping iOS home bar'
    );
  });

  await t.test('6. Backdrop Dismissal & Escape Key Architecture', () => {
    // Backdrop click dismisses non-dangerous modal
    assert.match(
      appJs,
      /overlay\.addEventListener\(['"]click['"],\s*\(e\)\s*=>\s*\{[^}]*e\.target\s*===\s*overlay[^}]*isDangerous/s,
      'App.js must attach backdrop click listener that safely checks for dangerous modals before closing'
    );

    // Modal close trigger dynamically finds closest modal overlay
    assert.match(
      appJs,
      /btn\.closest\(['"]\.modal-overlay['"]\)/,
      'Modal close triggers must dynamically find and close their parent .modal-overlay'
    );

    // Escape key closes open modals in top-down priority
    assert.match(
      appJs,
      /if\s*\(e\.key\s*===\s*['"]Escape['"]\)/,
      'App.js must register global Escape key listener'
    );
    assert.match(
      appJs,
      /document\.querySelectorAll\(['"]\.modal-overlay:not\(\.hidden\)['"]\)/,
      'Escape key must query active modal overlays to dismiss the top-most modal'
    );
    assert.match(
      appJs,
      /UI\.closeModal\(['"]modal-image-lightbox['"]\)/,
      'Escape key must dismiss lightbox if open'
    );
  });

  await t.test('7. Verification of Clean Inline Styles in Index HTML', () => {
    // Ensure no modal has inline z-index: 10000 or colliding z-indexes
    assert.doesNotMatch(
      indexHtml,
      /id="modal-generic-prompt"[^>]*style="[^"]*z-index:\s*10000/s,
      'modal-generic-prompt must not have inline z-index: 10000'
    );
    assert.doesNotMatch(
      indexHtml,
      /id="modal-import-excel-preview"[^>]*style="[^"]*z-index/s,
      'modal-import-excel-preview must not have inline z-index'
    );
    assert.doesNotMatch(
      indexHtml,
      /id="modal-image-editor"[^>]*style="[^"]*z-index/s,
      'modal-image-editor must not have inline z-index'
    );
  });
});
