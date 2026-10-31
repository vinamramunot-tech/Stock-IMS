const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');

// Mock localStorage for Node environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const Calc = require(path.join(__dirname, '../renderer/js/calc.js'));

/**
 * Creates an isolated VM harness loading real Calc, Catalog, and App scripts
 * with interactive DOM element stubs and ExcelJS support.
 */
function createCatalogAppHarness(initialItems = [], goldRatePerGram = 8000) {
  const elements = new Map();
  const toasts = [];
  const openedModals = [];
  const closedModals = [];
  let loadedFormItem = null;

  function makeElement(id = '') {
    const listeners = new Map();
    const children = [];
    const el = {
      id,
      tagName: 'DIV',
      value: '',
      textContent: '',
      innerHTML: '',
      disabled: false,
      checked: false,
      isConnected: true,
      scrollTop: 0,
      offsetHeight: 400,
      dataset: {},
      style: {},
      className: '',
      parentNode: null,
      parentElement: null,
      children,
      options: [],
      classList: {
        _set: new Set(),
        add(...cls) { cls.forEach(c => this._set.add(c)); },
        remove(...cls) { cls.forEach(c => this._set.delete(c)); },
        toggle(c, force) {
          const shouldAdd = force !== undefined ? Boolean(force) : !this._set.has(c);
          if (shouldAdd) this._set.add(c); else this._set.delete(c);
          return shouldAdd;
        },
        contains(c) { return this._set.has(c); }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        if (!listeners.has(type)) return;
        listeners.set(type, listeners.get(type).filter(f => f !== fn));
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const payload = typeof evt === 'string' ? { type, target: el } : { target: el, ...evt };
        (listeners.get(type) || []).forEach(fn => fn(payload));
      },
      cloneNode() {
        const cloned = makeElement(el.id);
        cloned.value = el.value;
        cloned.textContent = el.textContent;
        cloned.innerHTML = el.innerHTML;
        cloned.disabled = el.disabled;
        cloned.checked = el.checked;
        cloned.style = { ...el.style };
        cloned.className = el.className;
        el.classList._set.forEach(c => cloned.classList.add(c));
        return cloned;
      },
      replaceChild(newChild, oldChild) {
        newChild.parentNode = el;
        newChild.parentElement = el;
        if (newChild.id) {
          elements.set(newChild.id, newChild);
        }
        const idx = children.indexOf(oldChild);
        if (idx !== -1) children[idx] = newChild;
        else children.push(newChild);
        return oldChild;
      },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] ?? null; },
      querySelector() { return makeElement('queried'); },
      querySelectorAll() { return []; },
      closest() { return null; },
      appendChild(child) {
        if (child && child.id === 'fragment' && Array.isArray(child.children)) {
          child.children.forEach(c => el.appendChild(c));
          child.children.length = 0;
          return child;
        }
        if (child && typeof child === 'object') {
          child.parentNode = el;
          child.parentElement = el;
        }
        children.push(child);
        return child;
      },
      insertBefore(child) {
        return el.appendChild(child);
      },
      replaceChildren(...newKids) {
        children.length = 0;
        newKids.forEach(k => el.appendChild(k));
      },
      remove() {},
      focus() {},
      select() {},
      click() { el.dispatchEvent('click'); }
    };

    // Ensure every element has a parentNode supporting replaceChild & appendChild
    const defaultParent = {
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      replaceChild(newChild, oldChild) {
        newChild.parentNode = defaultParent;
        newChild.parentElement = defaultParent;
        if (newChild.id) {
          elements.set(newChild.id, newChild);
        }
        return oldChild;
      }
    };
    el.parentNode = defaultParent;
    el.parentElement = defaultParent;
    return el;
  }

  function getEl(id) {
    if (!elements.has(id)) {
      elements.set(id, makeElement(id));
    }
    return elements.get(id);
  }

  // Initialize key default form element values matching renderer/index.html
  getEl('catalog-apply-custom-profit').checked = false;
  getEl('catalog-custom-profit-input').value = '40.0';
  getEl('filter-status').value = 'active';
  getEl('filter-category').value = 'ALL';
  getEl('filter-karat').value = 'ALL';
  getEl('sort-items').value = 'sno-asc';

  getEl('jewelry-export-apply-custom-profit').checked = false;
  getEl('jewelry-export-custom-profit-pct').value = '40.0';
  getEl('jewelry-export-custom-profit-pct').disabled = true;
  getEl('jewelry-export-price-multiplier').value = '1.0';
  getEl('jewelry-export-price-multiplier-custom').value = '1.0';
  getEl('jewelry-export-price-divisor').value = '1';
  getEl('jewelry-print-category').value = 'ALL';
  getEl('jewelry-print-status').value = 'active';
  getEl('jewelry-print-sort').value = 'category';

  getEl('presentation-title').value = 'Jewelry Collection Showcase';
  getEl('presentation-price-mode').value = 'selling';
  getEl('presentation-custom-profit-pct').value = '40.0';
  getEl('presentation-price-multiplier').value = '1.25';
  getEl('presentation-theme').value = 'gold';
  getEl('modal-jewelry-slideshow').classList.add('hidden');

  const dbItems = JSON.parse(JSON.stringify(initialItems));
  const settings = {
    goldRate24kt: {
      ratePerGram: goldRatePerGram,
      effectiveDate: '2026-10-31'
    }
  };

  const DBManagerStub = {
    database: {
      items: dbItems,
      jewelryMemos: [],
      jewelrySales: [],
      settings
    },
    getItems: () => DBManagerStub.database.items,
    getJewelryMemos: () => DBManagerStub.database.jewelryMemos,
    getJewelrySales: () => DBManagerStub.database.jewelrySales,
    getSettings: () => DBManagerStub.database.settings,
    saveVault: async () => true,
    saveItem: async () => true,
    addLog: () => {}
  };

  const UIStub = {
    activeItemState: {},
    debounce: (fn) => fn,
    escapeHtml: (str) => String(str ?? ''),
    sanitizeSearchQuery: (q) => String(q ?? '').trim(),
    initModalTabs: () => {},
    initScrollToTop: () => {},
    showToast(msg, isError = false) {
      toasts.push({ msg: String(msg), isError: Boolean(isError) });
    },
    openModal(id) {
      getEl(id).classList.remove('hidden');
      openedModals.push(id);
    },
    closeModal(id) {
      getEl(id).classList.add('hidden');
      closedModals.push(id);
    },
    loadItemIntoForm(item) {
      loadedFormItem = item;
    }
  };

  const documentStub = {
    readyState: 'loading',
    getElementById: (id) => getEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => {
      const e = makeElement('');
      e.tagName = String(tag).toUpperCase();
      return e;
    },
    createDocumentFragment: () => makeElement('fragment'),
    addEventListener: () => {},
    visibilityState: 'visible',
    documentElement: { scrollTop: 0, setAttribute: () => {}, classList: makeElement('html').classList },
    body: makeElement('body')
  };

  const savedExcelFiles = [];
  const electronAPIStub = {
    saveFileDialog: async (defaultName) => `/tmp/${defaultName}`,
    saveXlsxFile: async (base64Data, targetPath) => {
      savedExcelFiles.push({ base64Data, targetPath });
      return true;
    },
    saveExcelDialog: async (defaultName) => `/tmp/${defaultName}`,
    saveExcelFile: async (base64Data, targetPath) => {
      savedExcelFiles.push({ base64Data, targetPath });
      return true;
    }
  };

  const context = {
    console,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    JSON,
    RegExp,
    Error,
    Uint8Array,
    Buffer,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { fn(); return 1; },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    navigator: { userAgent: 'node' },
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    localStorage: global.localStorage,
    document: documentStub,
    ExcelJS,
    DBManager: DBManagerStub,
    UI: UIStub,
    electronAPI: electronAPIStub
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);

  const calcSrc = fs.readFileSync(path.join(__dirname, '../renderer/js/calc.js'), 'utf8');
  const catalogSrc = fs.readFileSync(path.join(__dirname, '../renderer/js/catalog.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  vm.runInContext(calcSrc, context, { filename: 'calc.js' });
  vm.runInContext(catalogSrc, context, { filename: 'catalog.js' });
  vm.runInContext(appSrc, context, { filename: 'app.js' });
  context.Catalog.init();

  return {
    context,
    Catalog: context.Catalog,
    App: context.App,
    DBManager: DBManagerStub,
    getEl,
    toasts,
    openedModals,
    closedModals,
    savedExcelFiles,
    getLoadedFormItem: () => loadedFormItem
  };
}

// Sample fixture items: one with Emeralds + Diamonds, one with Ruby + Diamonds (no Emerald)
function buildSampleItems() {
  return [
    {
      id: 'item_em_1',
      sno: 1,
      sku: 'NL-101',
      name: 'Zambian Emerald & Polki Necklace',
      category: 'Necklace',
      status: 'In Stock',
      karat: 18,
      grossWeight: 25.0,
      wastage: 15,
      profitPercentage: 40, // Saved 40%
      emeraldDiscountPercentage: 50,
      labourCost: 12000,
      goldRateAtAddition: 7500,
      mfgDate: '2026-09-15',
      commission: { value: 5000, isManual: true },
      metals: [],
      stones: [
        { type: 'Emerald', shape: 'Octagon', pieces: 4, weight: 10.0, ratePerCarat: 15000 }, // ₹1,50,000 Emerald
        { type: 'Emerald', shape: 'Drops', pieces: 2, weight: 5.0, ratePerCarat: 10000 } // ₹50,000 Emerald -> Total Emerald = ₹2,00,000
      ],
      diamondsPolki: [
        { type: 'Uncut Polki', pieces: 22, weight: 5.0, ratePerCarat: 20000 } // ₹1,00,000 Polki
      ]
    },
    {
      id: 'item_no_em_2',
      sno: 2,
      sku: 'RG-202',
      name: 'Burmese Ruby Diamond Ring',
      category: 'Rings',
      status: 'In Stock',
      karat: 18,
      grossWeight: 10.0,
      wastage: 15,
      profitPercentage: 45, // Saved 45%
      labourCost: 5000,
      goldRateAtAddition: 7500,
      mfgDate: '2026-10-01',
      commission: { value: 2000, isManual: true },
      metals: [],
      stones: [
        { type: 'Ruby', pieces: 1, weight: 3.0, ratePerCarat: 20000 } // ₹60,000 Ruby (non-emerald: receives profit markup)
      ],
      diamondsPolki: [
        { type: 'Diamond', pieces: 16, weight: 2.0, ratePerCarat: 35000 } // ₹70,000 Diamond
      ]
    }
  ];
}

test('Custom Profit Margin (Excluding Emeralds) & Excel Price Divisor Coding Suite', async (t) => {
  await t.test('1. Calc.evaluateItem applies custom profit % strictly on non-emerald cost without mutating itemData', () => {
    const [emeraldItem, rubyItem] = buildSampleItems();
    const goldRate = 8000;

    // Default evaluation uses saved item.profitPercentage (40%)
    const baseEm = Calc.evaluateItem(emeraldItem, goldRate);
    assert.equal(baseEm.emeraldTotal, 200000);
    assert.equal(baseEm.profitPercentage, 40);
    const nonEmeraldCost = baseEm.marketCostPrice - baseEm.emeraldTotal;
    assert.ok(nonEmeraldCost > 0);
    assert.equal(
      baseEm.sellingPrice,
      Number(((nonEmeraldCost * 1.40) + 200000).toFixed(2))
    );

    // Override with 25% custom profit: Emeralds remain at 1.0x (₹2,00,000 with 0% markup)
    const custom25 = Calc.evaluateItem(emeraldItem, goldRate, undefined, { profitPercentage: 25 });
    assert.equal(custom25.profitPercentage, 25);
    assert.equal(custom25.marketCostPrice, baseEm.marketCostPrice, 'Market cost price must remain identical');
    assert.equal(custom25.homeCostPrice, baseEm.homeCostPrice, 'Home cost price must remain identical');
    assert.equal(custom25.mfgGrandTotal, baseEm.mfgGrandTotal, 'Mfg cost must remain identical');
    assert.equal(
      custom25.sellingPrice,
      Number(((nonEmeraldCost * 1.25) + 200000).toFixed(2)),
      'Custom 25% profit must apply strictly to (marketCostPrice - emeraldTotal) and add emeraldTotal at 1.0x'
    );

    // Override with 0% custom profit: Selling Price equals exact Market Cost Price (guards against 0 || 40 bug)
    const customZero = Calc.evaluateItem(emeraldItem, goldRate, undefined, { profitPercentage: 0 });
    assert.equal(customZero.profitPercentage, 0);
    assert.equal(customZero.sellingPrice, baseEm.marketCostPrice);

    // Override on non-emerald item (Ruby + Diamond): entire marketCostPrice receives custom profit %
    const baseRuby = Calc.evaluateItem(rubyItem, goldRate);
    const customRuby20 = Calc.evaluateItem(rubyItem, goldRate, undefined, { profitPercentage: 20 });
    assert.equal(customRuby20.emeraldTotal, 0);
    assert.equal(customRuby20.sellingPrice, Number((baseRuby.marketCostPrice * 1.20).toFixed(2)));

    // Saved profitPercentage on source objects must never be mutated
    assert.equal(emeraldItem.profitPercentage, 40);
    assert.equal(rubyItem.profitPercentage, 45);
  });

  await t.test('2. Catalog screen custom profit toolbar dynamically updates view prices without mutating DB items', () => {
    const harness = createCatalogAppHarness(buildSampleItems(), 8000);
    const { Catalog, DBManager, getEl } = harness;

    // Initially off
    assert.equal(Catalog.getActiveCustomProfitMargin(), null);

    // Enable 25% custom profit on Catalog screen
    const cb = getEl('catalog-apply-custom-profit');
    const inp = getEl('catalog-custom-profit-input');
    cb.checked = true;
    inp.value = '25';
    Catalog.updateCatalogCustomProfitUI();

    assert.equal(Catalog.getActiveCustomProfitMargin(), 25);
    assert.equal(getEl('catalog-custom-profit-input-wrap').style.display, 'inline-flex');
    assert.match(getEl('catalog-custom-profit-pill').textContent, /25%.*Emeralds 0% markup/);

    // Render grid and verify card displays custom 25% selling price (excluding emeralds)
    Catalog.renderCatalogGrid(true);
    const dbEmItem = DBManager.getItems()[0];
    const expectedEm25 = Calc.evaluateItem(dbEmItem, 8000, undefined, { profitPercentage: 25 }).sellingPrice;
    const gridChildren = getEl('catalog-grid').children.filter(c => c.id !== 'catalog-scroll-sentinel');
    assert.equal(gridChildren.length, 2);
    const digitsOnlyCard = gridChildren[0].innerHTML.replace(/,/g, '');
    assert.ok(
      digitsOnlyCard.includes(String(Math.round(expectedEm25))) ||
      digitsOnlyCard.includes(expectedEm25.toFixed(2)),
      'Catalog card must render the custom profit selling price'
    );
    assert.match(gridChildren[0].innerHTML, /25% excl\. Em/, 'Trade badge indicates active custom profit %');

    // Database items must remain untouched
    assert.equal(DBManager.getItems()[0].profitPercentage, 40);
    assert.equal(DBManager.getItems()[1].profitPercentage, 45);

    // Zero profit (0%) must be honored as 0, not null or 40
    inp.value = '0';
    assert.equal(Catalog.getActiveCustomProfitMargin(), 0);

    // clearFilters() resets custom profit toolbar back to off / 40.0
    Catalog.clearFilters();
    assert.equal(cb.checked, false);
    assert.equal(inp.value, '40.0');
    assert.equal(Catalog.getActiveCustomProfitMargin(), null);
  });

  await t.test('3. View Item Modal (App.openJewelryDetailModal) supports live custom profit % preview, inheritance & reset', () => {
    const harness = createCatalogAppHarness(buildSampleItems(), 8000);
    const { App, Catalog, DBManager, getEl, getLoadedFormItem } = harness;
    const emeraldItem = DBManager.getItems()[0];

    const baseEval = Calc.evaluateItem(emeraldItem, 8000);
    const eval30 = Calc.evaluateItem(emeraldItem, 8000, undefined, { profitPercentage: 30 });
    const eval55 = Calc.evaluateItem(emeraldItem, 8000, undefined, { profitPercentage: 55 });

    // Turn on 30% custom profit on Catalog toolbar, then open Detail Modal -> should inherit 30%
    getEl('catalog-apply-custom-profit').checked = true;
    getEl('catalog-custom-profit-input').value = '30';
    assert.equal(Catalog.getActiveCustomProfitMargin(), 30);

    App.openJewelryDetailModal(emeraldItem);

    const parseRupees = (txt) => Number(String(txt || '').replace(/[^0-9.-]/g, ''));

    assert.equal(getEl('detail-jewelry-saved-profit-badge').textContent, 'Saved: 40.0%');
    assert.equal(getEl('detail-jewelry-custom-profit-pct').value, '30.0');
    assert.equal(
      parseRupees(getEl('detail-jewelry-selling-price').textContent),
      eval30.sellingPrice
    );
    assert.equal(getEl('btn-detail-reset-profit-pct').style.display, 'inline-flex');

    // Change live input inside View Item Modal to 55%
    const detailInput = getEl('detail-jewelry-custom-profit-pct');
    detailInput.value = '55';
    detailInput.dispatchEvent('input');

    assert.equal(
      parseRupees(getEl('detail-jewelry-selling-price').textContent),
      eval55.sellingPrice
    );
    // Cost prices must never change when previewing custom profit
    assert.equal(
      parseRupees(getEl('detail-jewelry-market-price').textContent),
      baseEval.marketCostPrice
    );
    assert.equal(
      parseRupees(getEl('detail-jewelry-home-price').textContent),
      baseEval.homeCostPrice
    );

    // Click Reset -> restores saved 40.0% selling price
    getEl('btn-detail-reset-profit-pct').click();
    assert.equal(getEl('detail-jewelry-custom-profit-pct').value, '40.0');
    assert.equal(
      parseRupees(getEl('detail-jewelry-selling-price').textContent),
      baseEval.sellingPrice
    );
    assert.equal(getEl('btn-detail-reset-profit-pct').style.display, 'none');

    // Stored item profitPercentage in DB remains untouched, and Edit loads canonical 40% item
    assert.equal(DBManager.getItems()[0].profitPercentage, 40);
    getEl('btn-detail-edit-item').click();
    assert.equal(getLoadedFormItem().profitPercentage, 40);
  });

  await t.test('4. Print/Export & Presentation Modals inherit Catalog custom profit % and compute exact emerald-excluded prices', () => {
    const harness = createCatalogAppHarness(buildSampleItems(), 8000);
    const { Catalog, DBManager, getEl } = harness;

    // Activate 28% custom profit on Catalog screen
    getEl('catalog-apply-custom-profit').checked = true;
    getEl('catalog-custom-profit-input').value = '28';
    getEl('jewelry-export-price-divisor').value = '10'; // dirty value should reset to 1 on openPrintModal

    Catalog.openPrintModal();

    assert.equal(getEl('jewelry-export-apply-custom-profit').checked, true);
    assert.equal(getEl('jewelry-export-custom-profit-pct').disabled, false);
    assert.equal(getEl('jewelry-export-custom-profit-pct').value, '28.0');
    assert.equal(Catalog.getPrintCustomProfitMargin(), 28);
    assert.equal(getEl('jewelry-export-price-divisor').value, '1');
    assert.equal(Catalog.getPrintPriceDivisor(), 1);

    // Presentation modal inheritance & custom_profit calculation
    Catalog.selectedItemIds = new Set(['item_em_1', 'item_no_em_2']);
    Catalog.openPresentationModal();
    assert.equal(getEl('presentation-price-mode').value, 'custom_profit');
    assert.equal(getEl('presentation-custom-profit-pct').value, '28.0');
    assert.equal(getEl('group-presentation-custom-profit').style.display, 'block');

    const emItem = DBManager.getItems()[0];
    const expectedPresPrice = Math.round(
      Calc.evaluateItem(emItem, 8000, undefined, { profitPercentage: 28 }).sellingPrice
    );
    assert.equal(
      Catalog.getPresentationItemPrice(emItem, 8000, 'custom_profit', 1.0, 28),
      expectedPresPrice
    );
    // 0% custom profit in presentation mode
    const expectedZeroPresPrice = Math.round(Calc.evaluateItem(emItem, 8000).marketCostPrice);
    assert.equal(
      Catalog.getPresentationItemPrice(emItem, 8000, 'custom_profit', 1.0, 0),
      expectedZeroPresPrice
    );
  });

  await t.test('5. Excel Export (Catalog.generateExcel) applies Custom Profit % (Excl. Emeralds) accurately across both sheets', async () => {
    const harness = createCatalogAppHarness(buildSampleItems(), 8000);
    const { Catalog, DBManager } = harness;
    const items = DBManager.getItems();

    const base64 = await Catalog.generateExcel(items, 8000, 1.0, {
      customProfitPct: 25,
      priceDivisor: 1
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(base64, 'base64'));

    const stockSheet = wb.getWorksheet('Stock Sheet');
    const latestPriceSheet = wb.getWorksheet('latest price');
    assert.ok(stockSheet, 'Workbook must contain Stock Sheet');
    assert.ok(latestPriceSheet, 'Workbook must contain latest price sheet');

    // Preserve 'Description by 5' header required by importExcel
    assert.equal(stockSheet.getCell(8, 2).value, 'Description by 5');

    const expectedEm = Calc.evaluateItem(items[0], 8000, undefined, { profitPercentage: 25 });
    const expectedRuby = Calc.evaluateItem(items[1], 8000, undefined, { profitPercentage: 25 });

    // Stock Sheet Col I (col 9) selling prices & TOTAL row
    const item1SpStock = Number(expectedEm.sellingPrice.toFixed(0));
    const item2SpStock = Number(expectedRuby.sellingPrice.toFixed(0));
    assert.equal(stockSheet.getCell(9, 9).value, item1SpStock);
    // Item 1 has 1 metal row + 3 stone rows = 4 rows (rows 9..12), plus 1 gap row (13), so Item 2 starts at row 14
    assert.equal(stockSheet.getCell(14, 9).value, item2SpStock);

    // Find TOTAL row on Stock Sheet
    let stockTotalRow = null;
    stockSheet.eachRow((row, rNum) => {
      if (row.getCell(1).value === 'TOTAL') stockTotalRow = rNum;
    });
    assert.ok(stockTotalRow, 'Stock Sheet must have TOTAL row');
    assert.equal(
      stockSheet.getCell(stockTotalRow, 9).value,
      Number((expectedEm.sellingPrice + expectedRuby.sellingPrice).toFixed(0))
    );

    // Latest Price Sheet: Row 8 is Item 1 metal row, Col P (16) is SP for market
    const item1CellP = latestPriceSheet.getCell(8, 16).value;
    assert.equal(typeof item1CellP, 'object');
    assert.equal(
      item1CellP.formula,
      'ROUND((((M8-(L9+L10))*1.25)+(L9+L10)), 2)',
      'Item 1 formula must subtract both emerald rows (L9+L10), apply 1.25x (25% custom profit), and add emeralds back at 1.0x'
    );
    assert.equal(item1CellP.result, Number(expectedEm.sellingPrice.toFixed(2)));

    // Item 2 has no emeralds -> Col P formula applies *1.25 on M
    // Item 1 spans rows 8(mtl),9(em1),10(em2),11(polki),12(labour),13(comm),14(gap) -> Item 2 starts at row 15
    const item2CellP = latestPriceSheet.getCell(15, 16).value;
    assert.match(item2CellP.formula, /ROUND\(M15\*1\.25, 2\)/);
    assert.equal(item2CellP.result, Number(expectedRuby.sellingPrice.toFixed(2)));

    // Source DB items remain completely unmodified
    assert.equal(items[0].profitPercentage, 40);
    assert.equal(items[1].profitPercentage, 45);
  });

  await t.test('6. Excel Price Coding divides all visible prices & formulas by any custom number while keeping weights/specs untouched and divisor hidden', async () => {
    const harness = createCatalogAppHarness(buildSampleItems(), 8000);
    const { Catalog, DBManager, getEl, toasts, savedExcelFiles } = harness;
    const items = DBManager.getItems();

    // Generate uncoded baseline workbook (divisor = 1) with 30% custom profit
    const uncodedB64 = await Catalog.generateExcel(items, 8000, 1.0, {
      customProfitPct: 30,
      priceDivisor: 1
    });
    const wbUncoded = new ExcelJS.Workbook();
    await wbUncoded.xlsx.load(Buffer.from(uncodedB64, 'base64'));
    const uncodedStock = wbUncoded.getWorksheet('Stock Sheet');
    const uncodedLatest = wbUncoded.getWorksheet('latest price');

    // Test multiple arbitrary divisors including integer, power-of-10, and decimal
    for (const divisor of [5, 100, 2.5, 10000]) {
      const codedB64 = await Catalog.generateExcel(items, 8000, 1.0, {
        customProfitPct: 30,
        priceDivisor: divisor
      });
      const wbCoded = new ExcelJS.Workbook();
      await wbCoded.xlsx.load(Buffer.from(codedB64, 'base64'));
      const codedStock = wbCoded.getWorksheet('Stock Sheet');
      const codedLatest = wbCoded.getWorksheet('latest price');

      const cellNum = (cellVal) => {
        if (cellVal && typeof cellVal === 'object' && 'result' in cellVal) return Number(cellVal.result);
        return Number(cellVal);
      };

      // A. 'latest price' sheet: 24K rate per 10g (B2) is divided, while Wastage factor (B3) is NOT divided
      assert.ok(
        Math.abs(cellNum(codedLatest.getCell('B2').value) - (80000 / divisor)) < 1e-5,
        `B2 24K rate must be divided by ${divisor}`
      );
      assert.equal(
        codedLatest.getCell('B3').value,
        uncodedLatest.getCell('B3').value,
        'Wastage factor B3 must never be divided'
      );

      // B. Item 1 rows on 'latest price':
      // Row 8 (MTL): Gross WT (F8), Net WT (G8), Grading (D8) unchanged; @ Rate (K8), Total (L8), M8, N8, O8, P8 divided!
      assert.equal(codedLatest.getCell(8, 4).value, uncodedLatest.getCell(8, 4).value, 'Karat grading unchanged');
      assert.equal(codedLatest.getCell(8, 6).value, uncodedLatest.getCell(8, 6).value, 'Gross weight unchanged');
      assert.equal(cellNum(codedLatest.getCell(8, 7).value), cellNum(uncodedLatest.getCell(8, 7).value), 'Net weight unchanged');

      // Stone rows (9, 10, 11): Pieces (I) and CTS (J) unchanged; @ Rate (K) and Total (L) divided!
      for (const r of [9, 10, 11]) {
        assert.equal(codedLatest.getCell(r, 9).value, uncodedLatest.getCell(r, 9).value, `Row ${r} pieces unchanged`);
        assert.equal(codedLatest.getCell(r, 10).value, uncodedLatest.getCell(r, 10).value, `Row ${r} carats unchanged`);
        assert.ok(
          Math.abs(cellNum(codedLatest.getCell(r, 11).value) - (cellNum(uncodedLatest.getCell(r, 11).value) / divisor)) < 0.01,
          `Row ${r} stone @ rate divided by ${divisor}`
        );
        assert.ok(
          Math.abs(cellNum(codedLatest.getCell(r, 12).value) - (cellNum(uncodedLatest.getCell(r, 12).value) / divisor)) <= 0.02,
          `Row ${r} stone total divided by ${divisor}`
        );
      }

      // Labour (row 12 Col F) & Commission (row 13 Col F) divided!
      for (const r of [12, 13]) {
        assert.ok(
          Math.abs(cellNum(codedLatest.getCell(r, 6).value) - (cellNum(uncodedLatest.getCell(r, 6).value) / divisor)) <= 0.02,
          `Row ${r} labour/commission divided by ${divisor}`
        );
      }

      // Valuation columns M (13), N (14), O (15), P (16) on Item 1 (row 8), Item 2 (row 15), and GRAND TOTAL (row 21)
      let grandRow = null;
      codedLatest.eachRow((row, rNum) => {
        if (row.getCell(1).value === 'GRAND TOTAL') grandRow = rNum;
      });
      assert.ok(grandRow, 'GRAND TOTAL row exists');
      assert.equal(codedLatest.getCell(grandRow, 2).value, items.length, 'Piece count in GRAND TOTAL must not be divided');

      for (const r of [8, 15, grandRow]) {
        for (const colIdx of [13, 14, 15, 16]) {
          const expectedCoded = Number((cellNum(uncodedLatest.getCell(r, colIdx).value) / divisor).toFixed(2));
          const actualCoded = cellNum(codedLatest.getCell(r, colIdx).value);
          assert.ok(
            Math.abs(actualCoded - expectedCoded) <= 0.02,
            `Row ${r} Col ${colIdx} expected ${expectedCoded}, got ${actualCoded} for divisor ${divisor}`
          );
        }
      }

      // Verify live Excel formula consistency on coded 'latest price' sheet:
      // Evaluating M8 = L8 + L9 + L10 + L11 + F12 + F13 using coded cell values must match coded M8 result!
      const b2Val = cellNum(codedLatest.getCell('B2').value);
      const b3Val = cellNum(codedLatest.getCell('B3').value);
      const k8FormulaRate = (b2Val / 10) * (18 / 24) * b3Val;
      const g8NetWt = cellNum(codedLatest.getCell(8, 7).value);
      const l8FormulaTotal = Number((g8NetWt * k8FormulaRate).toFixed(2));
      const l9FormulaTotal = Number((cellNum(codedLatest.getCell(9, 10).value) * cellNum(codedLatest.getCell(9, 11).value)).toFixed(2));
      const l10FormulaTotal = Number((cellNum(codedLatest.getCell(10, 10).value) * cellNum(codedLatest.getCell(10, 11).value)).toFixed(2));
      const l11FormulaTotal = Number((cellNum(codedLatest.getCell(11, 10).value) * cellNum(codedLatest.getCell(11, 11).value)).toFixed(2));
      const f12Val = cellNum(codedLatest.getCell(12, 6).value);
      const f13Val = cellNum(codedLatest.getCell(13, 6).value);
      const liveM8 = Number((l8FormulaTotal + l9FormulaTotal + l10FormulaTotal + l11FormulaTotal + f12Val + f13Val).toFixed(2));
      assert.ok(
        Math.abs(liveM8 - cellNum(codedLatest.getCell(8, 13).value)) <= 0.02,
        `Live Excel formula evaluation for M8 (${liveM8}) must match cached result (${cellNum(codedLatest.getCell(8, 13).value)}) at divisor ${divisor}`
      );

      // C. 'Stock Sheet' visible Selling Prices (Col I = 9) and TOTAL row divided; weights/carats untouched!
      const rawEmSp = Calc.evaluateItem(items[0], 8000, undefined, { profitPercentage: 30 }).sellingPrice;
      const rawRubySp = Calc.evaluateItem(items[1], 8000, undefined, { profitPercentage: 30 }).sellingPrice;
      const expectedS2Item1 = Number((rawEmSp / divisor).toFixed(2));
      const expectedS2Item2 = Number((rawRubySp / divisor).toFixed(2));

      assert.equal(codedStock.getCell(9, 9).value, expectedS2Item1);
      assert.equal(codedStock.getCell(14, 9).value, expectedS2Item2);
      assert.equal(codedStock.getCell(9, 6).value, uncodedStock.getCell(9, 6).value, 'Stock Sheet Gross WT unchanged');
      assert.equal(codedStock.getCell(10, 8).value, uncodedStock.getCell(10, 8).value, 'Stock Sheet Stone CTS unchanged');

      let s2TotalRow = null;
      codedStock.eachRow((row, rNum) => {
        if (row.getCell(1).value === 'TOTAL') s2TotalRow = rNum;
      });
      assert.equal(
        codedStock.getCell(s2TotalRow, 9).value,
        Number((expectedS2Item1 + expectedS2Item2).toFixed(2))
      );
      assert.equal(codedStock.getCell(s2TotalRow, 2).value, items.length, 'Stock Sheet piece count unchanged');

      // D. Confidentiality check: titles/headers never expose the coding divisor
      assert.equal(codedLatest.getCell('A1').value, 'MAVA GEMS — JEWELRY LATEST PRICE');
      for (let r = 1; r <= 8; r++) {
        for (let c = 1; c <= 10; c++) {
          assert.equal(
            codedStock.getCell(r, c).value,
            uncodedStock.getCell(r, c).value,
            `Stock Sheet header cell (${r},${c}) must remain identical and never leak divisor`
          );
        }
      }
    }

    // E. Validation guard: divisor <= 0 is rejected in both generateExcel and exportFromSelection
    await assert.rejects(
      () => Catalog.generateExcel(items, 8000, 1.0, { priceDivisor: 0 }),
      /Price coding divisor must be greater than 0/
    );
    await assert.rejects(
      () => Catalog.generateExcel(items, 8000, 1.0, { priceDivisor: -4 }),
      /Price coding divisor must be greater than 0/
    );

    Catalog.openPrintModal();
    getEl('jewelry-export-price-divisor').value = '0';
    toasts.length = 0;
    await Catalog.exportFromSelection();
    assert.equal(savedExcelFiles.length, 0, 'Export must abort when divisor <= 0');
    assert.ok(toasts.some(t => t.isError && /divisor.*greater than 0/i.test(t.msg)));

    // Full end-to-end exportFromSelection with custom profit 20% + divisor 10
    getEl('jewelry-export-apply-custom-profit').checked = true;
    getEl('jewelry-export-custom-profit-pct').disabled = false;
    getEl('jewelry-export-custom-profit-pct').value = '20';
    getEl('jewelry-export-price-divisor').value = '10';
    await Catalog.exportFromSelection();
    assert.equal(savedExcelFiles.length, 1);
    assert.doesNotMatch(savedExcelFiles[0].targetPath, /10.*divisor|coded/i, 'Export filename must not leak divisor');
  });

  await t.test('7. Showroom Client Privacy: Custom profit margin controls carry client-hide attributes in index.html', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
    assert.match(
      indexHtml,
      /<div id="catalog-custom-profit-toolbar"[^>]*data-client-hide/,
      'Catalog custom profit toolbar must carry data-client-hide'
    );
    assert.match(
      indexHtml,
      /<div id="detail-jewelry-custom-profit-bar"[^>]*cost-price-data[^>]*data-client-hide/,
      'Detail modal custom profit bar must carry cost-price-data and data-client-hide'
    );
  });
});
