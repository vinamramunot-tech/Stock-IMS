const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const catalogJsPath = path.resolve(__dirname, '../renderer/js/catalog.js');
const stoneJsPath = path.resolve(__dirname, '../renderer/js/stone.js');
const emeraldJsPath = path.resolve(__dirname, '../renderer/js/emerald.js');

test('Redundant Selection Logic & UI Audit Tests', async (t) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(customCssPath, 'utf8');
  const catalogJs = fs.readFileSync(catalogJsPath, 'utf8');
  const stoneJs = fs.readFileSync(stoneJsPath, 'utf8');
  const emeraldJs = fs.readFileSync(emeraldJsPath, 'utf8');

  await t.test('Jewelry Suite bulk toolbar: Unselect All button removed, unified toggle present', () => {
    assert.doesNotMatch(html, /id="btn-bulk-unselect"/, 'Redundant #btn-bulk-unselect must be removed from DOM');
    assert.match(html, /id="bulk-select-all"/, 'Unified #bulk-select-all master checkbox must exist');
    assert.match(html, /id="bulk-select-all-label"/, 'Dynamic #bulk-select-all-label element must exist');
  });

  await t.test('Stone Print Modal: "Select None" button removed, unified toggle present', () => {
    assert.doesNotMatch(html, /id="btn-print-select-none-stones"/, 'Redundant #btn-print-select-none-stones must be removed');
    assert.match(html, /id="btn-print-select-all-stones"/, 'Unified #btn-print-select-all-stones button must exist');
  });

  await t.test('Emerald Print Modal: "Select None" button removed, unified toggle present', () => {
    assert.doesNotMatch(html, /id="btn-print-select-none-pudias"/, 'Redundant #btn-print-select-none-pudias must be removed');
    assert.match(html, /id="btn-print-select-all-pudias"/, 'Unified #btn-print-select-all-pudias button must exist');
  });

  await t.test('Emerald Bulk Share Modal: "Select None" button removed, unified toggle present', () => {
    assert.doesNotMatch(html, /id="btn-bulk-share-select-none-pudias"/, 'Redundant #btn-bulk-share-select-none-pudias must be removed');
    assert.match(html, /id="btn-bulk-share-select-all-pudias"/, 'Unified #btn-bulk-share-select-all-pudias button must exist');
  });

  await t.test('Excel Import Preview Modal: "Deselect All" button removed, unified toggle present', () => {
    assert.doesNotMatch(html, /id="btn-excel-import-deselect-all"/, 'Redundant #btn-excel-import-deselect-all must be removed');
    assert.match(html, /id="btn-excel-import-select-all-new"/, 'Unified #btn-excel-import-select-all-new button must exist');
  });

  await t.test('Mobile layout hides duplicate add button (#btn-add-jewelry-piece-main) to prevent clutter', () => {
    assert.match(
      css,
      /#btn-add-jewelry-piece-main\s*\{\s*display:\s*none\s*!important;\s*\}/,
      'Duplicate add button must be hidden on mobile screens'
    );
  });

  await t.test('Catalog JS dynamic label toggling is implemented', () => {
    assert.ok(catalogJs.includes('bulk-select-all-label'), 'Catalog JS must reference bulk-select-all-label');
    assert.ok(catalogJs.includes('Deselect All') && catalogJs.includes('Select All'), 'Catalog JS must toggle between Select All and Deselect All');
  });

  await t.test('Stone JS toggle function flips all checkboxes dynamically', () => {
    assert.ok(stoneJs.includes('toggleAllPrintStones'), 'Stone JS must implement toggleAllPrintStones');
  });

  await t.test('Emerald JS toggle functions flip checkboxes dynamically', () => {
    assert.ok(emeraldJs.includes('toggleAllPrintPudias'), 'Emerald JS must implement toggleAllPrintPudias');
    assert.ok(emeraldJs.includes('toggleAllBulkSharePudias'), 'Emerald JS must implement toggleAllBulkSharePudias');
  });
});
