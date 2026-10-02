const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const emeraldJsPath = path.resolve(__dirname, '../renderer/js/emerald.js');

test('Mobile UI Simplification & Drawer Navigation Tests', async (t) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(customCssPath, 'utf8');
  const emeraldJs = fs.readFileSync(emeraldJsPath, 'utf8');

  await t.test('Emerald Suite has mobile filters toggle button', () => {
    assert.match(
      html,
      /id="btn-toggle-emerald-filters"/,
      'Emerald suite must have #btn-toggle-emerald-filters button'
    );
  });

  await t.test('Emerald JS wires up mobile filter drawer event', () => {
    assert.ok(
      emeraldJs.includes('btn-toggle-emerald-filters') && emeraldJs.includes('mobile-open'),
      'Emerald JS must wire up mobile drawer toggle'
    );
  });

  await t.test('CSS hides mobile filter buttons on desktop (min-width: 769px)', () => {
    assert.match(
      css,
      /@media\s*\(min-width:\s*769px\)[\s\S]*?\.mobile-filters-toggle-btn[\s\S]*?display:\s*none\s*!important/,
      'Mobile filter toggle buttons must be hidden on desktop viewports'
    );
  });

  await t.test('Emerald Pudia cards have compact mobile styling', () => {
    assert.match(
      css,
      /\.flat-pudia-card[\s\S]*?padding:\s*10px\s*12px\s*!important/,
      'Pudia cards must have compact padding on mobile'
    );
    assert.match(
      css,
      /\.flat-pudia-img-container[\s\S]*?width:\s*60px\s*!important/,
      'Pudia image containers must be compact on mobile'
    );
  });

  await t.test('Jewelry detail modal adapts to mobile screen size', () => {
    assert.match(
      css,
      /#modal-jewelry-detail\s+\.modal-body[\s\S]*?padding:\s*12px\s*14px\s*!important/,
      'Jewelry detail modal must use compact mobile padding'
    );
    assert.match(
      css,
      /#modal-jewelry-detail\s+#detail-jewelry-valuations-container[\s\S]*?grid-template-columns:\s*repeat\(2,\s*1fr\)\s*!important/,
      'Jewelry detail valuations must display as a 2-column mobile grid'
    );
  });

  await t.test('Memo creation form stacks multi-column inputs on mobile', () => {
    assert.match(
      css,
      /#modal-create-jewelry-memo[\s\S]*?grid-template-columns:\s*1fr\s*!important/,
      'Memo creation form must stack inputs vertically on mobile'
    );
  });
});
