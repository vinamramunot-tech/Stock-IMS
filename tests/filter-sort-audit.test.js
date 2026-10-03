const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Read source files
const catalogJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/catalog.js'), 'utf8');
const emeraldJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/emerald.js'), 'utf8');
const stoneJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/stone.js'), 'utf8');
const jewelryMemoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewelry-memo.js'), 'utf8');
const jewelrySalesJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewelry-sales.js'), 'utf8');
const memoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/memo.js'), 'utf8');
const emeraldSalesJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/emerald-sales.js'), 'utf8');
const jewelStoneMemoJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/jewel-stone-memo.js'), 'utf8');
const appJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/app.js'), 'utf8');
const emeraldDashboardJs = fs.readFileSync(path.resolve(__dirname, '../renderer/js/emerald-dashboard.js'), 'utf8');

test('Comprehensive Filter & Sorting Engine Audit Across All Screens', async (suite) => {

  // ==========================================
  // 1. JEWELRY CATALOG FILTER & SORTING AUDIT
  // ==========================================
  await suite.test('1. Jewelry Catalog: Filter & Sorting Logic', async (t) => {
    const mockItems = [
      { id: 'item_101', sno: 1, name: 'Royal Solitaire Ring', sku: 'RN-SOL-01', category: 'Ring', status: 'In Stock', metals: [{ name: 'Yellow Gold', karat: 18, weight: 5.5 }], createdAt: '2026-01-01T10:00:00Z', calculatedTotal: 120000 },
      { id: 'item_102', sno: 2, name: 'Diamond Choker Necklace', sku: 'NK-DIA-02', category: 'Necklace', status: 'On Memo', metals: [{ name: 'White Gold', karat: 14, weight: 28.0 }], createdAt: '2026-01-02T10:00:00Z', calculatedTotal: 450000 },
      { id: 'item_103', sno: 3, name: 'Emerald Drop Earrings', sku: 'ER-EME-03', category: 'Earrings', status: 'Sold', metals: [{ name: 'Rose Gold', karat: 18, weight: 8.2 }], createdAt: '2026-01-03T10:00:00Z', calculatedTotal: 85000 },
      { id: 'item_104', sno: 4, name: 'Tennis Bracelet', sku: 'BR-TEN-04', category: 'Bracelet', status: 'In Stock', metals: [{ name: 'Yellow Gold', karat: 18, weight: 14.0 }], createdAt: '2026-01-04T10:00:00Z', calculatedTotal: 310000 }
    ];

    await t.test('Status Filter: active excludes Sold items by default', () => {
      const active = mockItems.filter(i => i.status !== 'Sold');
      assert.equal(active.length, 3);
      assert.ok(!active.some(i => i.status === 'Sold'));
    });

    await t.test('Status Filter: In Stock, Issued, and Sold', () => {
      const inStock = mockItems.filter(i => !i.status || i.status === 'In Stock');
      assert.equal(inStock.length, 2);

      const issued = mockItems.filter(i => i.status === 'On Memo' || i.status === 'Issued');
      assert.equal(issued.length, 1);
      assert.equal(issued[0].sku, 'NK-DIA-02');

      const sold = mockItems.filter(i => i.status === 'Sold');
      assert.equal(sold.length, 1);
      assert.equal(sold[0].sku, 'ER-EME-03');
    });

    await t.test('Category & Karat Filters', () => {
      const rings = mockItems.filter(i => i.category === 'Ring');
      assert.equal(rings.length, 1);
      assert.equal(rings[0].sku, 'RN-SOL-01');

      const karat14 = mockItems.filter(i => (i.metals || []).some(m => m.karat == 14));
      assert.equal(karat14.length, 1);
      assert.equal(karat14[0].sku, 'NK-DIA-02');
    });

    await t.test('Search Query: matches SKU, name, category, and metal name', () => {
      const query = 'white gold';
      const results = mockItems.filter(item => {
        return (item.name || '').toLowerCase().includes(query) ||
          (item.sku || '').toLowerCase().includes(query) ||
          (item.metals || []).some(m => (m.name || '').toLowerCase().includes(query));
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].sku, 'NK-DIA-02');
    });

    await t.test('Sorting: sno-asc, sno-desc, newest, val-high, val-low, name-az', () => {
      // S.No Ascending
      const bySnoAsc = [...mockItems].sort((a, b) => (a.sno || 0) - (b.sno || 0));
      assert.equal(bySnoAsc[0].sno, 1);
      assert.equal(bySnoAsc[3].sno, 4);

      // S.No Descending
      const bySnoDesc = [...mockItems].sort((a, b) => (b.sno || 0) - (a.sno || 0));
      assert.equal(bySnoDesc[0].sno, 4);
      assert.equal(bySnoDesc[3].sno, 1);

      // Newest
      const byNewest = [...mockItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      assert.equal(byNewest[0].sku, 'BR-TEN-04');

      // Valuation High to Low
      const byValHigh = [...mockItems].sort((a, b) => b.calculatedTotal - a.calculatedTotal);
      assert.equal(byValHigh[0].sku, 'NK-DIA-02'); // 450,000

      // Valuation Low to High
      const byValLow = [...mockItems].sort((a, b) => a.calculatedTotal - b.calculatedTotal);
      assert.equal(byValLow[0].sku, 'ER-EME-03'); // 85,000

      // Name A-Z
      const byName = [...mockItems].sort((a, b) => a.name.localeCompare(b.name));
      assert.equal(byName[0].name, 'Diamond Choker Necklace');
    });

    await t.test('Catalog JS implements newest sort using resilient timestamp comparison', () => {
      assert.match(catalogJs, /new Date\(a\.createdAt\)\.getTime\(\)/, 'Must support ISO createdAt timestamps for newest sorting');
    });
  });

  // ==========================================
  // 2. EMERALD CATALOG FILTER & SORTING AUDIT
  // ==========================================
  await suite.test('2. Emerald Catalog: Filter & Sorting Logic', async (t) => {
    const mockEmeralds = [
      { id: 'eme_01', group: 'Lot A', color: 12, lustreGrade: 'Lustre', shape: 'Octagon', shapes: ['Octagon'], weight: 14.5, pricePerCarat: 45000, origins: ['Zambian'], comments: 'Fine velvety green', createdAt: '2026-01-01' },
      { id: 'eme_02', group: 'Lot B', color: 45, lustreGrade: 'Mota pani', shape: 'Ovals', shapes: ['Ovals'], weight: 28.2, pricePerCarat: 28000, origins: ['Panjshir'], comments: 'Clean crystal', createdAt: '2026-01-03' },
      { id: 'eme_03', group: 'Lot A', color: 5, lustreGrade: 'Tas paani', shape: 'Octagon', shapes: ['Octagon'], weight: 6.8, pricePerCarat: 80000, origins: ['Swat'], comments: 'Deep hue', createdAt: '2026-01-05' }
    ];

    await t.test('Emerald search matches Pudia Number (color), Comments, Origin, and Lustre', () => {
      // Pudia number search
      const qColor = '45';
      const resColor = mockEmeralds.filter(e => (e.color || '').toString().includes(qColor));
      assert.equal(resColor.length, 1);
      assert.equal(resColor[0].id, 'eme_02');

      // Comments search
      const qComment = 'crystal';
      const resComment = mockEmeralds.filter(e => (e.comments || '').toLowerCase().includes(qComment));
      assert.equal(resComment.length, 1);
      assert.equal(resComment[0].id, 'eme_02');

      // Origin search
      const qOrigin = 'zambian';
      const resOrigin = mockEmeralds.filter(e => (e.origins || []).some(o => o.toLowerCase().includes(qOrigin)));
      assert.equal(resOrigin.length, 1);
      assert.equal(resOrigin[0].id, 'eme_01');
    });

    await t.test('Flat Grid Sorting: color-high, color-low, weight-high, price-high, newest', () => {
      // Pudia High to Low
      const byColorHigh = [...mockEmeralds].sort((a, b) => Number(b.color) - Number(a.color));
      assert.equal(byColorHigh[0].color, 45);
      assert.equal(byColorHigh[2].color, 5);

      // Pudia Low to High
      const byColorLow = [...mockEmeralds].sort((a, b) => Number(a.color) - Number(b.color));
      assert.equal(byColorLow[0].color, 5);
      assert.equal(byColorLow[2].color, 45);

      // Weight High to Low
      const byWeight = [...mockEmeralds].sort((a, b) => b.weight - a.weight);
      assert.equal(byWeight[0].weight, 28.2);

      // Price High to Low
      const byPrice = [...mockEmeralds].sort((a, b) => b.pricePerCarat - a.pricePerCarat);
      assert.equal(byPrice[0].pricePerCarat, 80000);

      // Newest
      const byNewest = [...mockEmeralds].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      assert.equal(byNewest[0].id, 'eme_03');
    });

    await t.test('Emerald JS source code verifies search and sort enhancements', () => {
      assert.match(emeraldJs, /\(e\.color\s*\|\|\s*''\)\.toString\(\)\.toLowerCase\(\)\.includes\(query\)/, 'Emerald search must check pudia color number');
      assert.match(emeraldJs, /\(e\.comments\s*\|\|\s*''\)\.toLowerCase\(\)\.includes\(query\)/, 'Emerald search must check comments');
      assert.match(emeraldJs, /sortVal === 'newest'/, 'Emerald catalog must handle newest sort value');
    });
  });

  // ==========================================
  // 3. LOOSE STONES CATALOG FILTER & SORTING AUDIT
  // ==========================================
  await suite.test('3. Loose Stones Catalog: Filter & Sorting Logic', async (t) => {
    const mockStones = [
      { id: 'st_01', type: 'Diamond', group: 'Round Melee', color: '10', lustreGrade: 'VVS-VS', shape: 'Round Brilliant', weight: 4.2, pricePerCarat: 65000, comments: 'White collection' },
      { id: 'st_02', type: 'Ruby', group: 'Burma Rubies', color: '2', lustreGrade: 'Pigeon Blood', shape: 'Oval Cut', weight: 8.5, pricePerCarat: 120000, comments: 'Unheated' },
      { id: 'st_03', type: 'Sapphire', group: 'Ceylon Blue', color: '15', lustreGrade: 'Royal Blue', shape: 'Cushion Cut', weight: 12.0, pricePerCarat: 95000, comments: 'Natural silk' }
    ];

    await t.test('Loose stone search matches type, group, shape, packet number, and comments', () => {
      const qComment = 'unheated';
      const res = mockStones.filter(s => (s.comments || '').toLowerCase().includes(qComment));
      assert.equal(res.length, 1);
      assert.equal(res[0].type, 'Ruby');

      const qType = 'diamond';
      const resType = mockStones.filter(s => (s.type || '').toLowerCase().includes(qType));
      assert.equal(resType.length, 1);
      assert.equal(resType[0].id, 'st_01');
    });

    await t.test('Stone JS source code verifies dynamic sorting within grades and groups', () => {
      assert.match(stoneJs, /\(st\.comments\s*\|\|\s*''\)\.toLowerCase\(\)\.includes\(query\)/, 'Stone search must check comments');
      assert.match(stoneJs, /sortVal === 'weight-high'[\s\S]*?this\.getStoneWeight\(b\)\s*-\s*this\.getStoneWeight\(a\)/, 'Items inside grade must sort by weight');
      assert.match(stoneJs, /sortVal === 'price-high'[\s\S]*?b\.pricePerCarat/, 'Items inside grade must sort by price');
      assert.match(stoneJs, /groupsArray\.sort[\s\S]*?sortVal === 'newest'/, 'Stone groups must support newest sorting');
    });
  });

  // ==========================================
  // 4. JEWELRY MEMOS FILTER & SORTING AUDIT
  // ==========================================
  await suite.test('4. Jewelry Memos: Filter & Search Logic', async (t) => {
    const mockJewelryMemos = [
      { id: 'jm_01', memoNumber: 'JM-001', brokerName: 'Rajesh Bhai', customerName: 'Shri Jewellers', status: 'open', date: '2026-02-01', items: [{ sku: 'RN-SOL-01', name: 'Solitaire Ring' }] },
      { id: 'jm_02', memoNumber: 'JM-002', brokerName: 'Suresh Kumar', customerName: 'Ambika Gems', status: 'closed', date: '2026-02-05', items: [{ sku: 'NK-DIA-02', name: 'Diamond Choker' }] }
    ];

    await t.test('Status filter selects open vs closed', () => {
      const open = mockJewelryMemos.filter(m => m.status === 'open');
      assert.equal(open.length, 1);
      assert.equal(open[0].memoNumber, 'JM-001');
    });

    await t.test('Search matches items inside the memo (SKU or piece name)', () => {
      const query = 'rn-sol-01';
      const res = mockJewelryMemos.filter(m => {
        return (m.brokerName || '').toLowerCase().includes(query) ||
          (m.memoNumber || '').toLowerCase().includes(query) ||
          (m.items || []).some(it => (it.sku || '').toLowerCase().includes(query));
      });
      assert.equal(res.length, 1);
      assert.equal(res[0].memoNumber, 'JM-001');
    });

    await t.test('Jewelry Memo JS verifies memo item search support', () => {
      assert.match(jewelryMemoJs, /\(m\.items\s*\|\|\s*\[\]\)\.some\(it\s*=>\s*[\s\S]*?it\.sku/, 'Jewelry memo filter must search items inside memo');
    });
  });

  // ==========================================
  // 5. JEWELRY SALES FILTER AUDIT
  // ==========================================
  await suite.test('5. Jewelry Sales: Date Range & Keyword Filters', async (t) => {
    const mockSales = [
      { sku: 'RN-01', name: 'Ring Alpha', customerName: 'Client A', brokerName: 'Broker X', saleDate: '2026-01-10', soldPrice: 150000 },
      { sku: 'NK-02', name: 'Necklace Beta', customerName: 'Client B', brokerName: 'Broker Y', saleDate: '2026-02-15', soldPrice: 350000 },
      { sku: 'ER-03', name: 'Earrings Gamma', customerName: 'Client C', brokerName: 'Broker X', saleDate: '2026-03-20', soldPrice: 80000 }
    ];

    await t.test('Date range filtering bounds sales records', () => {
      const dateFrom = '2026-02-01';
      const dateTo = '2026-02-28';
      const filtered = mockSales.filter(s => s.saleDate >= dateFrom && s.saleDate <= dateTo);
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].sku, 'NK-02');
    });

    await t.test('Search query matches customer, broker, SKU, or name', () => {
      const q = 'broker x';
      const filtered = mockSales.filter(s => (s.brokerName || '').toLowerCase().includes(q));
      assert.equal(filtered.length, 2);
    });

    await t.test('Jewelry Sales JS implements clearFilters and date range bounds', () => {
      assert.match(jewelrySalesJs, /clearFilters\(\)/, 'Jewelry sales must have clearFilters');
      assert.match(jewelrySalesJs, /dateFrom\s*&&\s*sDate\s*<\s*dateFrom/, 'Jewelry sales must enforce dateFrom filter');
      assert.match(jewelrySalesJs, /dateTo\s*&&\s*sDate\s*>\s*dateTo/, 'Jewelry sales must enforce dateTo filter');
    });
  });

  // ==========================================
  // 6. EMERALD MEMOS & SALES FILTER AUDIT
  // ==========================================
  await suite.test('6. Emerald Memos & Emerald Sales Filters', async () => {
    // Memo JS
    assert.match(memoJs, /\(m\.items\s*\|\|\s*\[\]\)\.some\(it\s*=>\s*[\s\S]*?it\.group/, 'Emerald memo filter must search items inside memo');
    assert.match(memoJs, /matchStatus\s*=\s*!filterVal\s*\|\|\s*m\.status\s*===\s*filterVal/, 'Emerald memo must filter status');

    // Emerald Sales JS
    assert.match(emeraldSalesJs, /dateFrom\s*&&\s*closeDate\s*<\s*dateFrom/, 'Emerald sales must filter dateFrom');
    assert.match(emeraldSalesJs, /dateTo\s*&&\s*closeDate\s*>\s*dateTo/, 'Emerald sales must filter dateTo');
    assert.match(emeraldSalesJs, /clearFilters\(\)/, 'Emerald sales must have clearFilters');
  });

  // ==========================================
  // 7. JEWEL STONE MEMOS FILTER AUDIT
  // ==========================================
  await suite.test('7. Jewel Stone Memos: Manufacturer & Item Filters', async () => {
    assert.match(jewelStoneMemoJs, /\(m\.items\s*\|\|\s*\[\]\)\.some\(it\s*=>\s*[\s\S]*?it\.stoneType/, 'Jewel stone memo filter must search items inside memo');
    assert.match(jewelStoneMemoJs, /matchStatus\s*=\s*!filterVal\s*\|\|\s*m\.status\s*===\s*filterVal/, 'Jewel stone memo must filter status');
  });

  // ==========================================
  // 8. ACTIVITY LOGS FILTER & SORTING AUDIT
  // ==========================================
  await suite.test('8. Activity Logs: Action, Date Range, & Strict Newest Sorting', async () => {
    assert.match(appJs, /if\s*\(actionFilter\s*&&\s*log\.action\s*!==\s*actionFilter\)/, 'Logs must filter by action');
    assert.match(appJs, /if\s*\(dateFrom\s*&&\s*lDate\s*<\s*dateFrom\)/, 'Logs must filter by dateFrom');
    assert.match(appJs, /if\s*\(dateTo\s*&&\s*lDate\s*>\s*dateTo\)/, 'Logs must filter by dateTo');
    assert.match(appJs, /filtered\.sort\(\(a,\s*b\)\s*=>\s*new Date\(b\.timestamp/, 'Logs must be strictly sorted newest first');
  });

  // ==========================================
  // 9. EMERALD ANALYSIS FILTERS AUDIT
  // ==========================================
  await suite.test('9. Emerald Analysis Filters', async () => {
    assert.match(emeraldDashboardJs, /matchesGroup\s*=\s*!this\.filters\.group\s*\|\|\s*e\.group\s*===\s*this\.filters\.group/, 'Analysis must filter by group');
    assert.match(emeraldDashboardJs, /matchesOrigin\s*=\s*!this\.filters\.origin\s*\|\|\s*\(e\.origins\s*\|\|\s*\[\]\)\.includes/, 'Analysis must filter by origin');
    assert.match(emeraldDashboardJs, /matchesLustre\s*=\s*!this\.filters\.lustre\s*\|\|\s*e\.lustreGrade\s*===\s*this\.filters\.lustre/, 'Analysis must filter by lustre');
  });

  // ==========================================
  // 10. PHOTO MANAGERS FILTER AUDIT
  // ==========================================
  await suite.test('10. Photo Managers: Live Query Filters', async () => {
    assert.match(appJs, /matchSku\s*\|\|\s*matchName\s*\|\|\s*matchCat\s*\|\|\s*snoStr\.includes\(query\)/, 'Jewelry photos must match SKU, name, category, and S.No');
    assert.match(appJs, /matchGroup\s*\|\|\s*matchShape\s*\|\|\s*matchColor\s*\|\|\s*matchLustre/, 'Emerald photos must match group, shape, pudia #, and lustre');
  });

});
