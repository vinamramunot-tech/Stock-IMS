const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const appJsPath = path.resolve(__dirname, '../renderer/js/app.js');
const jewelryMemoJsPath = path.resolve(__dirname, '../renderer/js/jewelry-memo.js');
const memoJsPath = path.resolve(__dirname, '../renderer/js/memo.js');
const jewelStoneMemoJsPath = path.resolve(__dirname, '../renderer/js/jewel-stone-memo.js');

test('Memo Workflow & Navbar Overlay Fixes', async (t) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(customCssPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const jewelryMemoJs = fs.readFileSync(jewelryMemoJsPath, 'utf8');
  const memoJs = fs.readFileSync(memoJsPath, 'utf8');
  const jewelStoneMemoJs = fs.readFileSync(jewelStoneMemoJsPath, 'utf8');

  await t.test('Scroll-to-top button floats above mobile bottom navbar and below modals', () => {
    // Desktop z-index <= 800 (below modal overlay 1000+)
    assert.match(
      css,
      /\.scroll-to-top-btn[\s\S]*?z-index:\s*800/,
      'Scroll-to-top button z-index must be 800 to prevent covering modals'
    );

    // Mobile bottom spacing: at least 75px + safe area to clear 60px bottom nav
    assert.match(
      css,
      /\.scroll-to-top-btn[\s\S]*?bottom:\s*calc\(75px\s*\+\s*env\(safe-area-inset-bottom/i,
      'Scroll-to-top button must be positioned above the 60px bottom navbar on mobile'
    );
  });

  await t.test('Jewelry Memos tab has prominent create button outside collapsed filters', () => {
    assert.match(html, /id="btn-create-jewelry-memo"/, 'Must have #btn-create-jewelry-memo in DOM');
    // Button must NOT be inside <div class="filters-group">
    assert.doesNotMatch(
      html,
      /<div class="filters-group">(?:(?!<\/div>)[\s\S])*?id="btn-create-jewelry-memo"/,
      '#btn-create-jewelry-memo must be outside .filters-group so mobile filter collapsing never hides it'
    );
    assert.match(html, /id="btn-empty-create-jewelry-memo"/, 'Empty state must have #btn-empty-create-jewelry-memo');
  });

  await t.test('Jewel Stone Memos tab has prominent create button outside collapsed filters', () => {
    assert.match(html, /id="btn-create-jewel-stone-memo"/, 'Must have #btn-create-jewel-stone-memo in DOM');
    assert.doesNotMatch(
      html,
      /<div class="filters-group">(?:(?!<\/div>)[\s\S])*?id="btn-create-jewel-stone-memo"/,
      '#btn-create-jewel-stone-memo must be outside .filters-group'
    );
    assert.match(html, /id="btn-empty-create-jewel-stone-memo"/, 'Empty state must have #btn-empty-create-jewel-stone-memo');
  });

  await t.test('Emerald Memos tab has create buttons in toolbar and empty state', () => {
    assert.match(html, /id="btn-create-memo"/, 'Must have #btn-create-memo in toolbar');
    assert.match(html, /id="btn-empty-create-memo"/, 'Must have #btn-empty-create-memo in empty state');
  });

  await t.test('Mobile bottom nav center Add button intelligently opens New Memo when in memo tabs', () => {
    assert.ok(
      appJs.includes("currentTab === 'tab-jewelry-memos'") &&
      appJs.includes("JewelryMemoController.openCreateMemoModal()"),
      'Mobile bottom nav add button must open Jewelry Memo modal when on tab-jewelry-memos'
    );
    assert.ok(
      appJs.includes("currentTab === 'tab-memos'") &&
      appJs.includes("MemoController.openCreateMemoModal()"),
      'Mobile bottom nav add button must open Emerald Memo modal when on tab-memos'
    );
    assert.ok(
      appJs.includes("currentTab === 'tab-jewel-stone-memos'") &&
      appJs.includes("JewelStoneMemoController.openCreateMemoModal()"),
      'Mobile bottom nav add button must open Jewel Stone Memo modal when on tab-jewel-stone-memos'
    );
  });

  await t.test('Mobile bottom nav dynamically updates Add button label to "New Memo" on memo tabs', () => {
    assert.ok(
      appJs.includes("addLabel.textContent = 'New Memo'"),
      'Bottom nav label must dynamically switch to "New Memo" on memo tabs'
    );
  });

  await t.test('Memo controllers auto-add staged item if user submits without manual secondary tap', () => {
    assert.ok(
      jewelryMemoJs.includes('handleAddItemToSelected'),
      'JewelryMemoController must auto-add staged jewelry piece if selectedItems is empty'
    );
    assert.ok(
      memoJs.includes('handleAddItemToSelected'),
      'MemoController must auto-add staged pudia if selectedItems is empty'
    );
    assert.ok(
      jewelStoneMemoJs.includes('handleAddItemToSelected'),
      'JewelStoneMemoController must auto-add staged stone if selectedItems is empty'
    );
  });

  await t.test('Operational memo and sales filters remain accessible on mobile', () => {
    assert.match(
      css,
      /#tab-jewelry-memos\s+\.filter-bar\s+\.filters-group[\s\S]*?display:\s*flex\s*!important/,
      'Jewelry memo filters must stay accessible on mobile'
    );
    assert.match(
      css,
      /#tab-memos\s+\.filter-bar\s+\.filters-group[\s\S]*?display:\s*flex\s*!important/,
      'Emerald memo filters must stay accessible on mobile'
    );
  });
});
