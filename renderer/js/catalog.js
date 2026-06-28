/**
 * Catalog Module
 * Manages rendering the dashboard, catalog grid, and item saving/deleting.
 */

const Catalog = {
  init() {
    // Search & Filter event listeners
    document.getElementById('search-input').addEventListener('input', () => this.renderCatalogGrid());
    document.getElementById('filter-category').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('filter-karat').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('sort-items').addEventListener('change', () => this.renderCatalogGrid());
    
    const openAddModal = () => {
      const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
      if (!goldRate || goldRate <= 0) {
        UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before adding jewelry pieces to ensure correct metal valuations.", true);
        return;
      }
      UI.resetForm();
      UI.openModal('modal-jewelry-item');
    };

    const btnEmptyAdd = document.getElementById('btn-empty-add');
    if (btnEmptyAdd) {
      btnEmptyAdd.addEventListener('click', openAddModal);
    }

    const btnNavAddItem = document.getElementById('btn-nav-add-item');
    if (btnNavAddItem) {
      btnNavAddItem.addEventListener('click', openAddModal);
    }

    const btnAddJewelryPieceMain = document.getElementById('btn-add-jewelry-piece-main');
    if (btnAddJewelryPieceMain) {
      btnAddJewelryPieceMain.addEventListener('click', openAddModal);
    }

    // View toggle listeners
    this.viewType = localStorage.getItem('catalogViewType') || 'grid';
    this.updateViewToggleUI();

    document.getElementById('btn-view-grid').addEventListener('click', () => {
      this.setViewType('grid');
    });
    document.getElementById('btn-view-list').addEventListener('click', () => {
      this.setViewType('list');
    });

    document.getElementById('btn-save-jewelry-piece').addEventListener('click', () => this.handleSaveJewelryPiece());

    // Initialize print functionality
    this.initPrint();
  },

  setViewType(type) {
    this.viewType = type;
    localStorage.setItem('catalogViewType', type);
    this.updateViewToggleUI();
    this.renderCatalogGrid();
  },

  updateViewToggleUI() {
    const gridBtn = document.getElementById('btn-view-grid');
    const listBtn = document.getElementById('btn-view-list');
    if (!gridBtn || !listBtn) return;

    if (this.viewType === 'list') {
      gridBtn.classList.remove('active');
      listBtn.classList.add('active');
    } else {
      listBtn.classList.remove('active');
      gridBtn.classList.add('active');
    }
  },

  populateKaratFilterOptions() {
    const filterSelect = document.getElementById('filter-karat');
    if (!filterSelect) return;

    // Remember currently selected karat
    const currentSelected = filterSelect.value;

    // Gather all unique karats from the items
    const allItems = DBManager.getItems();
    const uniqueKarats = new Set();
    
    allItems.forEach(item => {
      (item.metals || []).forEach(m => {
        if (m.karat !== undefined && m.karat !== null && !isNaN(m.karat)) {
          uniqueKarats.add(Number(m.karat));
        }
      });
    });

    // Sort karats descending
    const sortedKarats = Array.from(uniqueKarats).sort((a, b) => b - a);

    // Build options HTML
    let optionsHtml = `<option value="">All Karats</option>`;
    sortedKarats.forEach(kt => {
      optionsHtml += `<option value="${kt}">${kt}KT Gold</option>`;
    });

    // To prevent infinite loops or cursor loss during keyup, only update DOM if options actually changed
    const currentOptionsString = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOptionsString = ["", ...sortedKarats].join(',');
    
    if (currentOptionsString !== newOptionsString) {
      filterSelect.innerHTML = optionsHtml;
      // Restore selected value if still valid
      if (uniqueKarats.has(Number(currentSelected))) {
        filterSelect.value = currentSelected;
      } else {
        filterSelect.value = "";
      }
    }
  },

  renderDashboard() {
    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const items = DBManager.getItems();

    // Rates header rendering
    const dateStr = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate : '';
    document.getElementById('header-gold-rate').textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    document.getElementById('header-gold-date').textContent = dateStr ? `Effective: ${new Date(dateStr).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}` : 'No date set';

    // USD/INR rate header rendering
    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    const usdDateStr = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.effectiveDate : '';
    document.getElementById('header-usd-rate').textContent = usdRate > 0 ? `₹${usdRate.toLocaleString()}` : '₹0.00';
    document.getElementById('header-usd-date').textContent = usdDateStr ? `Effective: ${new Date(usdDateStr).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}` : 'No date set';

    let totalPortfolioValuation = 0;
    let totalGoldWeight = 0;
    let totalJewelryGemWeight = 0;
    let totalLooseEmeraldWeight = 0;

    const gemTypeWeights = {};

    items.forEach(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      totalPortfolioValuation += evaluation.marketCostPrice;

      // Sum metals weight (net)
      const netMetals = Calc.getNetMetals(item);
      netMetals.forEach(m => totalGoldWeight += m.netWeight);

      // Sum stones weight (cts)
      const stones = item.stones || [];
      stones.forEach(s => {
        const w = Number(s.weight || 0);
        totalJewelryGemWeight += w;
        if (w > 0) {
          const type = s.type || 'Other';
          gemTypeWeights[type] = (gemTypeWeights[type] || 0) + w;
        }
      });

      // Sum diamonds weight (cts)
      const dp = item.diamondsPolki || [];
      dp.forEach(d => {
        const w = Number(d.weight || 0);
        totalJewelryGemWeight += w;
        if (w > 0) {
          const type = d.type || 'Other';
          gemTypeWeights[type] = (gemTypeWeights[type] || 0) + w;
        }
      });
    });

    let totalLooseEmeraldValuationINR = 0;

    // Sum loose emeralds weight & valuation
    const emeralds = DBManager.getEmeralds();
    emeralds.forEach(e => {
      let w = 0;
      if (e.sizes && e.sizes.length > 0) {
        w = e.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0);
      } else {
        w = Number(e.weight || e.size || 0);
      }
      totalLooseEmeraldWeight += w;
      totalLooseEmeraldValuationINR += Number(w * (e.pricePerCarat || 0));
    });

    const totalLooseEmeraldValuationUSD = usdRate > 0 ? (totalLooseEmeraldValuationINR / usdRate) : 0;

    // Render Metrics Box
    document.getElementById('metric-total-valuation').textContent = `₹${totalPortfolioValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('metric-total-pieces').textContent = items.length;
    document.getElementById('metric-gold-weight').textContent = `${totalGoldWeight.toFixed(3)} g`;
    document.getElementById('metric-gem-weight').textContent = `${totalJewelryGemWeight.toFixed(2)} cts`;
    document.getElementById('metric-emerald-weight').textContent = `${totalLooseEmeraldWeight.toFixed(2)} cts`;

    // Sum loose stones weight & valuation
    let totalLooseStoneWeight = 0;
    let totalLooseStoneValuationINR = 0;
    const looseStones = DBManager.getStones();
    looseStones.forEach(st => {
      const w = st.sizes && st.sizes.length > 0
        ? st.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0)
        : Number(st.weight || 0);
      totalLooseStoneWeight += w;
      totalLooseStoneValuationINR += w * Number(st.pricePerCarat || 0);
    });

    const looseWtEl = document.getElementById('metric-loose-stone-weight');
    const looseValEl = document.getElementById('metric-loose-stone-valuation');
    if (looseWtEl) {
      looseWtEl.textContent = `${totalLooseStoneWeight.toFixed(3)} cts`;
    }
    if (looseValEl) {
      looseValEl.textContent = `₹${totalLooseStoneValuationINR.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    const valInrEl = document.getElementById('metric-emerald-valuation-inr');
    const valUsdEl = document.getElementById('metric-emerald-valuation-usd');
    if (valInrEl) {
      valInrEl.textContent = `₹${totalLooseEmeraldValuationINR.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    if (valUsdEl) {
      valUsdEl.textContent = `$${totalLooseEmeraldValuationUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Render bifurcation breakdown
    const breakdownEl = document.getElementById('metric-gem-breakdown');
    if (breakdownEl) {
      let breakdownHtml = '';
      if (totalJewelryGemWeight > 0) {
        const sortedTypes = Object.keys(gemTypeWeights).sort((a, b) => gemTypeWeights[b] - gemTypeWeights[a]);
        breakdownHtml = sortedTypes.map(type => {
          const weight = gemTypeWeights[type];
          const pct = ((weight / totalJewelryGemWeight) * 100).toFixed(1);
          return `<div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background-color: var(--bg-base); border: 1px solid var(--border-light); border-radius: 4px; white-space: nowrap;">
            <span style="font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--text-muted);">${type}</span>
            <span style="color: var(--text-main); font-weight: 700; font-size: 12px;">${weight.toFixed(2)} cts (${pct}%)</span>
          </div>`;
        }).join('');
      } else {
        breakdownHtml = `<div style="color: var(--text-muted); font-style: italic; font-size: 11px;">No gemstones added</div>`;
      }
      breakdownEl.innerHTML = breakdownHtml;
    }
  },

  renderCatalogGrid() {
    const gridContainer = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    
    if (this.viewType === 'list') {
      gridContainer.classList.add('list-view');
    } else {
      gridContainer.classList.remove('list-view');
    }
    
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const filterCat = document.getElementById('filter-category').value;
    
    // Dynamically populate the karat dropdown filter based on actual catalog items
    this.populateKaratFilterOptions();
    
    const filterKarat = document.getElementById('filter-karat').value;
    const sortVal = document.getElementById('sort-items').value;

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();

    // Clear grid
    gridContainer.innerHTML = '';

    // Filter Items
    let filtered = allItems.filter(item => {
      // 1. Text Search
      const matchesSearch = !query || 
        (item.name || '').toLowerCase().includes(query) || 
        (item.sku || '').toLowerCase().includes(query) || 
        (item.description || '').toLowerCase().includes(query) ||
        (item.metals || []).some(m => (m.name || '').toLowerCase().includes(query));

      // 2. Category Filter
      const matchesCat = !filterCat || item.category === filterCat;

      // 3. Karat Filter
      const matchesKarat = !filterKarat || (item.metals || []).some(m => m.karat == filterKarat);

      return matchesSearch && matchesCat && matchesKarat;
    });

    // Evaluate valuation before sorting so we can sort dynamically by calculated values!
    filtered = filtered.map(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      return {
        ...item,
        calculatedTotal: evaluation.marketCostPrice,
        evaluation: evaluation
      };
    });

    // Sort Items
    if (sortVal === 'newest') {
      filtered.sort((a, b) => Number(b.id.split('_')[1] || 0) - Number(a.id.split('_')[1] || 0));
    } else if (sortVal === 'val-high') {
      filtered.sort((a, b) => b.calculatedTotal - a.calculatedTotal);
    } else if (sortVal === 'val-low') {
      filtered.sort((a, b) => a.calculatedTotal - b.calculatedTotal);
    } else if (sortVal === 'name-az') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gridContainer.classList.remove('hidden');

    filtered.forEach(item => {
      const card = document.createElement('div');
      
      const status = item.status || 'In Stock';
      let statusClass = 'stock';
      let statusLabel = 'In Stock';
      let cardStatusClass = '';
      if (status === 'On Memo') {
        statusClass = 'memo';
        statusLabel = 'On Memo';
        cardStatusClass = 'on-memo';
      } else if (status === 'Sold') {
        statusClass = 'sold';
        statusLabel = 'Sold';
        cardStatusClass = 'sold';
      }
      
      card.className = 'product-card' + (cardStatusClass ? ' ' + cardStatusClass : '');

      // Build specs preview string
      const netMetals = Calc.getNetMetals(item);
      const metalsStr = netMetals.map(m => `${m.karat}KT (Net: ${m.netWeight.toFixed(2)}g)`).join(', ');
      
      let totalMetalWeight = 0;
      (item.metals || []).forEach(m => totalMetalWeight += Number(m.weight || 0));

      let stonesSum = 0;
      (item.stones || []).forEach(s => stonesSum += Number(s.weight || 0));
      (item.diamondsPolki || []).forEach(d => stonesSum += Number(d.weight || 0));

      const grossWeight = totalMetalWeight;
      const netMetalWeight = Math.max(0, totalMetalWeight - (stonesSum * 0.2));

      const homeCostHtml = item.evaluation.hasEmerald
        ? `<div class="price-lbl">HOME COST PRICE</div>
           <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 8px;">₹${item.evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>`
        : '';

      const badgeStatusHtml = `<span class="badge-status product-card-badge-status ${statusClass}">${statusLabel}</span>`;

      card.innerHTML = `
        ${badgeStatusHtml}
        <div class="product-body">
          <div class="product-meta">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <div class="product-sku">${item.sku || 'SKU-NONE'}</div>
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; background-color: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 6px; border-radius: 4px; letter-spacing: 0.05em; color: var(--text-muted);">${item.category || 'Jewelry'}</span>
            </div>
            <h3 class="product-title" style="margin-top: 4px;">${item.name || 'Unnamed Piece'}</h3>
          </div>
          
          <div class="product-specs">
            <div class="specs-line" title="${metalsStr}"><strong>Metal:</strong> ${metalsStr || 'None added'}</div>
            <div class="specs-line"><strong>Gemstones:</strong> ${stonesSum > 0 ? stonesSum.toFixed(2) + ' cts total' : 'None added'}</div>
            <div class="specs-line"><strong>Gross Weight:</strong> ${grossWeight.toFixed(3)} g</div>
            <div class="specs-line"><strong>Net Metal Wt:</strong> ${netMetalWeight.toFixed(3)} g</div>
            <div class="specs-line" style="margin-bottom:0;" title="${item.description || ''}"><strong>Notes:</strong> ${item.description || 'No description'}</div>
          </div>
          
          <div class="product-price-row">
            <div>
              <div class="price-lbl">MARKET COST PRICE</div>
              <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 8px;">₹${item.evaluation.marketCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              ${homeCostHtml}
              <div class="price-lbl">SELLING PRICE</div>
              <div class="price-val">₹${item.evaluation.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="product-actions">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit</button>
              <button type="button" class="btn btn-danger btn-small btn-delete" title="Delete piece">Delete</button>
            </div>
          </div>
        </div>
      `;

      // Event Wire up
      card.querySelector('.btn-edit').addEventListener('click', () => {
        document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece";
        UI.loadItemIntoForm(item);
        UI.openModal('modal-jewelry-item');
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        this.handleDeleteItem(item);
      });

      gridContainer.appendChild(card);
    });
  },

  async handleSaveJewelryPiece() {
    const name = document.getElementById('item-name').value.trim();
    const sku = document.getElementById('item-sku').value.trim();
    const category = document.getElementById('item-category').value;
    const description = document.getElementById('item-description').value.trim();
    const labourCost = Number(document.getElementById('item-labour').value || 0);

    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    if (!goldRate || goldRate <= 0) {
      UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before saving jewelry pieces.", true);
      return;
    }

    if (!name || !sku || !category) {
      UI.showToast("Please fill all required fields (*) in the General tab.", true);
      return;
    }

    // Check duplicate SKUs (only if new, or modified on existing)
    const isEdit = UI.activeItemState && UI.activeItemState.id;
    const allItems = DBManager.getItems();
    const isSkuDuplicate = allItems.some(i => i.sku === sku && (!isEdit || i.id !== UI.activeItemState.id));
    if (isSkuDuplicate) {
      UI.showToast(`The SKU code "${sku}" is already in use by another piece.`, true);
      return;
    }

    // Reconstruct updated / new item
    const savedItem = {
      id: isEdit ? UI.activeItemState.id : 'item_' + Date.now(),
      name,
      sku,
      category,
      description,
      image: UI.activeItemState.image || null,
      metals: [],
      stones: [],
      diamondsPolki: [],
      labourCost,
      wastage: Number(document.getElementById('item-wastage').value || 0),
      profitPercentage: Number(document.getElementById('item-profit-pct').value || 40),
      commission: {
        value: Number(document.getElementById('item-commission').value || 0),
        isManual: UI.activeItemState.commission ? UI.activeItemState.commission.isManual : false
      },
      createdAt: isEdit ? UI.activeItemState.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Gather components
    // Metals
    const metalRows = document.querySelectorAll('.metal-part-entry-card');
    metalRows.forEach(row => {
      const partName = row.querySelector('.metal-part-name').value.trim() || 'Body Component';
      const karat = Number(row.querySelector('.metal-part-karat').value);
      const weight = Number(row.querySelector('.metal-part-weight').value || 0);
      savedItem.metals.push({ name: partName, karat, weight });
    });

    // Stones & Diamonds
    const stoneRows = document.querySelectorAll('.stone-entry-card');
    stoneRows.forEach(row => {
      const type = row.getAttribute('data-stone-type') || 'Emerald';
      const shape = row.querySelector('.stone-shape').value.trim() || 'Mixed';
      const pieces = Number(row.querySelector('.stone-pieces').value || 0);
      const weight = Number(row.querySelector('.stone-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.stone-rate').value || 0);
      const totalValue = Number(row.querySelector('.stone-total-val').value || 0);
      
      const component = { type, shape, pieces, weight, ratePerCarat, totalValue };
      if (type === 'Diamond' || type === 'Polki') {
        savedItem.diamondsPolki.push(component);
      } else {
        savedItem.stones.push(component);
      }
    });

    // Recalculate dynamic subtotals for logging
    const evaluation = Calc.evaluateItem(savedItem, goldRate);
    savedItem.commission.value = evaluation.commissionValue; // Cache calculated commission in JSON

    try {
      if (isEdit) {
        // Deep Diff
        const changes = Logs.diffItem(UI.activeItemState, savedItem);
        const summary = Logs.buildSummary(changes, `Updated ${savedItem.name}`);
        
        DBManager.addLog("EDIT", savedItem.id, savedItem.name, summary, changes);

        // Replace item in array
        const index = DBManager.database.items.findIndex(i => i.id === savedItem.id);
        if (index !== -1) {
          DBManager.database.items[index] = savedItem;
        }
        UI.showToast("Jewelry details updated successfully!");
      } else {
        // Add
        DBManager.addLog("ADD", savedItem.id, savedItem.name, `Added new jewelry item: ${savedItem.name}`, []);
        DBManager.database.items.push(savedItem);
        UI.showToast("New jewelry piece added successfully!");
      }

      await DBManager.saveVault();
      UI.closeModal('modal-jewelry-item');
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  async handleDeleteItem(item) {
    UI.confirm(`Are you absolutely sure you want to delete "${item.name}" (SKU: ${item.sku}) from stock? This cannot be undone.`, async () => {
      try {
        DBManager.addLog("DELETE", item.id, item.name, `Deleted jewelry item: ${item.name}`, []);
        
        const index = DBManager.database.items.findIndex(i => i.id === item.id);
        if (index !== -1) {
          DBManager.database.items.splice(index, 1);
        }

        await DBManager.saveVault();
        UI.showToast("Item deleted from stock.");
        App.refreshAllDisplays();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  // ==================== PRINT FUNCTIONALITY ====================

  activePdfDocument: null,

  initPrint() {
    const btnPrint = document.getElementById('btn-print-jewelry-catalog');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => this.openPrintModal());
    }

    const closeTriggers = document.querySelectorAll('.modal-close-trigger-print-jewelry-catalog');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-print-jewelry-catalog'));
    });

    const catSel = document.getElementById('jewelry-print-select-category');
    if (catSel) {
      catSel.addEventListener('change', () => this.populatePrintItemsChecklist());
    }

    const karatSel = document.getElementById('jewelry-print-select-karat');
    if (karatSel) {
      karatSel.addEventListener('change', () => this.populatePrintItemsChecklist());
    }

    const btnAll = document.getElementById('btn-jewelry-print-select-all');
    if (btnAll) {
      btnAll.addEventListener('click', () => this.toggleAllPrintItems(true));
    }

    const btnNone = document.getElementById('btn-jewelry-print-select-none');
    if (btnNone) {
      btnNone.addEventListener('click', () => this.toggleAllPrintItems(false));
    }

    const btnExcelMain = document.getElementById('btn-export-excel-jewelry-catalog');
    if (btnExcelMain) {
      btnExcelMain.addEventListener('click', () => this.openPrintModal());
    }

    const btnSubmit = document.getElementById('btn-submit-print-jewelry-catalog');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.printFromSelection());
    }

    const btnExcelSubmit = document.getElementById('btn-submit-export-excel-jewelry-catalog');
    if (btnExcelSubmit) {
      btnExcelSubmit.addEventListener('click', () => this.exportFromSelection());
    }
  },

  openPrintModal() {
    this.populatePrintKaratFilter();
    this.populatePrintItemsChecklist();
    UI.openModal('modal-print-jewelry-catalog');
  },

  populatePrintKaratFilter() {
    const karatSel = document.getElementById('jewelry-print-select-karat');
    if (!karatSel) return;

    const allItems = DBManager.getItems();
    const karats = new Set();
    allItems.forEach(item => {
      (item.metals || []).forEach(m => {
        if (m.karat !== undefined && m.karat !== null && !isNaN(m.karat)) {
          karats.add(Number(m.karat));
        }
      });
    });

    const sorted = Array.from(karats).sort((a, b) => b - a);
    let html = '<option value="">All Karats</option>';
    sorted.forEach(kt => {
      html += `<option value="${kt}">${kt}KT Gold</option>`;
    });
    karatSel.innerHTML = html;
  },

  populatePrintItemsChecklist() {
    const container = document.getElementById('jewelry-print-items-container');
    if (!container) return;
    container.innerHTML = '';

    const selectedCategory = (document.getElementById('jewelry-print-select-category') || {}).value || '';
    const selectedKarat = (document.getElementById('jewelry-print-select-karat') || {}).value || '';

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();

    const filtered = allItems.filter(item => {
      const matchesCat = !selectedCategory || item.category === selectedCategory;
      const matchesKarat = !selectedKarat || (item.metals || []).some(m => Number(m.karat) === Number(selectedKarat));
      return matchesCat && matchesKarat;
    });

    // Sort by name for readability
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (filtered.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); grid-column: 1/-1;">No items found for these criteria.</div>';
      return;
    }

    filtered.forEach(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      const label = document.createElement('label');
      label.className = 'print-pudia-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" class="jewelry-print-item-checkbox" value="${item.id}" checked>
        ${UI.escapeHtml(item.sku)} — ${UI.escapeHtml(item.name || 'Unnamed')} (${item.category || '—'}) · ₹${evaluation.marketCostPrice.toLocaleString()}
      `;
      container.appendChild(label);
    });
  },

  toggleAllPrintItems(checked) {
    const checkBoxes = document.querySelectorAll('.jewelry-print-item-checkbox');
    checkBoxes.forEach(cb => cb.checked = checked);
  },

  printFromSelection() {
    const checkedBoxes = document.querySelectorAll('.jewelry-print-item-checkbox:checked');
    if (checkedBoxes.length === 0) {
      UI.showToast("Please select at least one jewelry piece to print.", true);
      return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();
    const filtered = allItems
      .filter(item => selectedIds.includes(item.id))
      .map(item => ({
        ...item,
        evaluation: Calc.evaluateItem(item, goldRate)
      }));

    const doc = this.generatePDF(filtered, goldRate);
    this.activePdfDocument = doc;
    // Clear emerald's active PDF so the shared save button picks this one
    if (window.EmeraldController) window.EmeraldController.activePdfDocument = null;

    const iframe = document.getElementById('print-preview-iframe');
    if (iframe) {
      iframe.src = doc.output('datauristring');
    }
    UI.closeModal('modal-print-jewelry-catalog');
    UI.openModal('modal-print-preview');
  },

  generatePDF(filtered, goldRate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const drawHeader = () => {
      doc.setFont("georgia", "bold");
      doc.setFontSize(16);
      doc.text("MAVA GEMS - JEWELRY CATALOG REPORT", 14, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);
      doc.text(`Total Pieces: ${filtered.length}`, 14, 30);

      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(14, 33, 196, 33);

      // Column headers
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("SKU", 14, 39);
      doc.text("Name / Category", 34, 39);
      doc.text("Metal", 92, 39);
      doc.text("Gross Wt", 130, 39);
      doc.text("Gemstones", 148, 39);
      doc.text("Market Cost", 168, 39);

      doc.setLineWidth(0.2);
      doc.line(14, 41, 196, 41);
    };

    drawHeader();

    // Group by category
    const groups = {};
    let grandTotalValue = 0;
    let grandTotalSellingPrice = 0;
    let grandTotalGrossWt = 0;

    filtered.forEach(item => {
      const catName = item.category || 'Other';
      if (!groups[catName]) groups[catName] = { items: [], totalValue: 0, totalSelling: 0 };
      groups[catName].items.push(item);
      groups[catName].totalValue += item.evaluation.marketCostPrice;
      groups[catName].totalSelling += item.evaluation.sellingPrice;
      grandTotalValue += item.evaluation.marketCostPrice;
      grandTotalSellingPrice += item.evaluation.sellingPrice;
      grandTotalGrossWt += item.evaluation.totalGrossWeight || 0;
    });

    let y = 48;

    const checkPageBreak = (needed) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 48;
        drawHeader();
        doc.setFont("helvetica", "normal");
      }
    };

    const categoryOrder = ['Ring', 'Necklace', 'Earrings', 'Bracelet', 'Pendant', 'Other'];
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      const ai = categoryOrder.indexOf(a);
      const bi = categoryOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    sortedGroupNames.forEach(catName => {
      const group = groups[catName];

      checkPageBreak(14);

      // Category header banner
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setFillColor(240, 240, 240);
      doc.rect(14, y - 4, 182, 6.5, "F");
      doc.text(`CATEGORY: ${catName.toUpperCase()} (${group.items.length} pieces)`, 16, y);
      y += 9;

      group.items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      group.items.forEach(item => {
        // Measure lines needed
        const metalsStr = (item.metals || [])
          .map(m => `${m.karat}KT (${Number(m.weight || 0).toFixed(2)}g)`)
          .join(', ') || 'None';

        const stonesArr = [];
        (item.stones || []).forEach(s => {
          if (Number(s.weight || 0) > 0) stonesArr.push(`${s.type} ${Number(s.weight).toFixed(2)}ct`);
        });
        (item.diamondsPolki || []).forEach(d => {
          if (Number(d.weight || 0) > 0) stonesArr.push(`${d.type} ${Number(d.weight).toFixed(2)}ct`);
        });
        const stonesStr = stonesArr.join(', ') || 'None';

        const grossWt = item.evaluation.totalGrossWeight || 0;
        const marketCost = item.evaluation.marketCostPrice;

        checkPageBreak(8);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text((item.sku || '').substring(0, 14), 14, y);

        doc.setFont("helvetica", "normal");
        const nameStr = (item.name || 'Unnamed').substring(0, 30);
        doc.text(nameStr, 34, y);

        const metalsShort = metalsStr.substring(0, 22);
        doc.text(metalsShort, 92, y);

        doc.text(`${grossWt.toFixed(2)}g`, 130, y);

        const stonesShort = stonesStr.substring(0, 18);
        doc.text(stonesShort, 148, y);

        doc.setFont("helvetica", "bold");
        doc.text(`Rs ${marketCost.toLocaleString()}`, 168, y);

        y += 7;
      });

      // Category subtotal
      checkPageBreak(9);
      doc.setLineWidth(0.15);
      doc.line(34, y - 3, 196, y - 3);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(`Subtotal (${catName})`, 34, y);
      doc.text(`Rs ${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 168, y);
      y += 11;
    });

    // Grand total
    checkPageBreak(12);
    doc.setLineWidth(0.3);
    doc.line(14, y - 4, 196, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("GRAND TOTAL", 14, y);
    doc.text(`${filtered.length} pieces`, 92, y);
    doc.text(`Rs ${grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 168, y);

    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Total Selling Price: Rs ${grandTotalSellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 14, y);

    return doc;
  },

  async handleSavePdfClick() {
    if (!this.activePdfDocument) return;

    try {
      const defaultName = `jewelry_catalog_report_${new Date().toISOString().split('T')[0]}.pdf`;
      const savePath = await window.electronAPI.saveFileDialog(defaultName);

      if (!savePath) return;

      const pdfBase64 = this.activePdfDocument.output('datauristring').split(',')[1];
      await window.electronAPI.savePdfFile(pdfBase64, savePath);
      UI.showToast("PDF saved successfully!");
      UI.closeModal('modal-print-preview');
    } catch (err) {
      UI.showToast("Failed to save PDF: " + err.message, true);
    }
  },

  // ==================== EXCEL EXPORT ====================

  async exportFromSelection() {
    const checkedBoxes = document.querySelectorAll('.jewelry-print-item-checkbox:checked');
    if (checkedBoxes.length === 0) {
      UI.showToast("Please select at least one jewelry piece to export.", true);
      return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();
    const filtered = allItems
      .filter(item => selectedIds.includes(item.id))
      .map(item => ({
        ...item,
        evaluation: Calc.evaluateItem(item, goldRate)
      }));

    UI.closeModal('modal-print-jewelry-catalog');
    UI.showToast("Generating Excel file…");

    try {
      const xlsxBase64 = this.generateExcel(filtered, goldRate);
      const defaultName = `jewelry_latest_price_${new Date().toISOString().split('T')[0]}.xlsx`;
      const savePath = await window.electronAPI.saveFileDialog(defaultName);
      if (!savePath) return;
      await window.electronAPI.saveXlsxFile(xlsxBase64, savePath);
      UI.showToast("Excel file saved successfully!");
    } catch (err) {
      console.error('Excel export error:', err);
      UI.showToast("Failed to generate Excel: " + err.message, true);
    }
  },

  /**
   * Generate a "Latest Price" format Excel workbook matching the user's Jewelry 23.04.26.xlsx structure.
   * Returns a base64 string of the .xlsx binary.
   *
   * Sheet layout:
   *   Row 1  : date label + today's date
   *   Row 2  : MTL 24K rate (per 10g = goldRate * 10), formula anchor $B$2
   *   Row 3  : wastage multiplier (1 + wastage/100), anchor $B$3
   *   Row 8  : column headers
   *   Row 9+ : per-item multi-row blocks
   *
   * Column mapping (0-indexed -> A=0, B=1, …):
   *   A=S.No  B=Description  C=Date of MFG  D=Grading(karat)  E=Type
   *   F=Gross WT  G=Net WT  H=CTS  I=@rate  J=Total
   *   K=Subtotal  L=Market CP  M=Home CP  N=SP for Market
   */
  generateExcel(filteredItems, goldRate) {
    const XLSX = window.XLSX;
    if (!XLSX) throw new Error("SheetJS library not loaded.");

    // ---------- Helper: column letter from 0-based index ----------
    const col = (n) => {
      let s = '';
      n += 1;
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };
    // Column letters (0-indexed)
    const C = { A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13 };
    const $ = r => r + 1; // 1-based row for cell refs

    // Pick a representative wastage from first item (or 15 default)
    // Each item's wastage is embedded directly in formulas so B3 is just a display reference.
    const GLOBAL_WASTAGE = (filteredItems[0] ? Number(filteredItems[0].wastage || 15) : 15);
    const WASTAGE_FACTOR = 1 + GLOBAL_WASTAGE / 100;
    const GOLD_RATE_PER_10G = goldRate * 10;
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const goldDate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate : today;
    const goldDateFmt = goldDate ? new Date(goldDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : today;

    // ========== Build aoa (array of arrays) ==========
    // We'll use a sheet_aoa approach and manually set formulas after.
    // Actually, we build a worksheet cell-by-cell for maximum control.

    const ws = {}; // worksheet cells dictionary
    const setCellText   = (r, c, v, s) => { ws[XLSX.utils.encode_cell({r, c})] = { v, t: 's', s }; };
    const setCellNum    = (r, c, v, s) => { ws[XLSX.utils.encode_cell({r, c})] = { v: Number(v) || 0, t: 'n', s }; };
    const setCellFormula = (r, c, formula, cached, s) => {
      ws[XLSX.utils.encode_cell({r, c})] = { f: formula, v: cached !== undefined ? cached : 0, t: 'n', s };
    };

    // Style shortcuts
    const BOLD  = { font: { bold: true } };
    const HEADER = { font: { bold: true }, fill: { fgColor: { rgb: 'D9D9D9' } }, alignment: { horizontal: 'center' } };
    const MONEY  = { numFmt: '₹#,##0.00', font: { bold: false } };
    const MONEYBOLD = { numFmt: '₹#,##0.00', font: { bold: true } };
    const CENTER = { alignment: { horizontal: 'center' } };

    // ---- Row 0 (1 in Excel): Title / Date ----
    setCellText(0, C.A, 'MAVA GEMS — JEWELRY LATEST PRICE', BOLD);
    setCellText(0, C.C, `date: ${today}`);

    // ---- Row 1 (2 in Excel): Gold rate anchor ----
    setCellText(1, C.A, 'MTL 24K (10g)', BOLD);
    setCellNum (1, C.B, GOLD_RATE_PER_10G, BOLD);
    setCellText(1, C.C, goldDateFmt);

    // ---- Row 2 (3 in Excel): Wastage anchor ----
    setCellText(2, C.A, 'wastage', BOLD);
    setCellNum (2, C.B, WASTAGE_FACTOR, BOLD);

    // ---- Row 4 (5 in Excel): Legend ----
    setCellText(4, C.A, 'To fill compulsory', { font: { color: { rgb: 'FF0000' } } });
    setCellText(5, C.A, 'If required', { font: { color: { rgb: '0000FF' } } });

    // ---- Row 7 (8 in Excel): Column headers ----
    const headers = ['S No.', 'Description by 5', 'Date of MFG', 'Grading', '', 'Gross WT', 'Net WT', 'CTS', '@', 'Total', 'K (subtotal)', 'market C.P', 'home C.P', 'SP for market'];
    headers.forEach((h, ci) => setCellText(7, ci, h, HEADER));

    // ---- Per-item blocks starting at row 8 (Excel row 9) ----
    let rowIdx = 8; // 0-based
    let sNo = 1;

    filteredItems.forEach(item => {
      const metals = item.metals || [];
      const stones = item.stones || [];
      const diamonds = item.diamondsPolki || [];
      const labour = Number(item.labourCost || 0);
      const wastage = Number(item.wastage !== undefined ? item.wastage : 15);
      const wastageMultiplier = 1 + wastage / 100;
      const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

      // Combine all metals into one MTL row (sum gross weights, compute net proportionally)
      // Per the excel format each item starts with a single MTL row
      const totalGrossWt = metals.reduce((s, m) => s + Number(m.weight || 0), 0);

      // Determine karat: use first metal's karat (most common case), or mixed if multiple
      const mainKarat = metals.length > 0 ? Number(metals[0].karat) : 18;

      // Stone weight for net-wt formula
      const totalStoneCts = [...stones, ...diamonds].reduce((s, x) => s + Number(x.weight || 0), 0);

      // Row references (1-based Excel row numbers)
      const mtlRow = $(rowIdx);     // Excel row of MTL line

      // Collect rows for component lines (built below)
      const stoneComponentRows = [];  // { rowExcel, type, cts, rate, isEmerald }
      let labourRowExcel = null;
      let commRowExcel = null;

      // ---- MTL row (E=MTL) ----
      const mtlR = rowIdx;
      setCellNum(mtlR,  C.A, sNo++, BOLD);
      setCellText(mtlR, C.B, item.name || 'Unnamed Piece', BOLD);
      setCellText(mtlR, C.C, createdDate);
      setCellNum(mtlR,  C.D, mainKarat);
      setCellText(mtlR, C.E, 'MTL');
      setCellNum(mtlR,  C.F, totalGrossWt);
      // Net WT formula is set after we know stone rows
      // I (rate per gram) = ($B$2/(10*24))*D<row>
      setCellFormula(mtlR, C.I,
        `($B$2/(10*24))*${col(C.D)}${mtlRow}`,
        (GOLD_RATE_PER_10G / 240) * mainKarat
      );
      rowIdx++;

      // ---- Component rows: all stone types ----
      const allComponents = [
        ...stones.map(s => ({ ...s, isDiamond: false })),
        ...diamonds.map(d => ({ ...d, isDiamond: true }))
      ];

      allComponents.forEach(comp => {
        const compR = rowIdx;
        const compExcelRow = $(rowIdx);
        const compType = (comp.type || 'stone').toLowerCase();
        const isEmerald = compType === 'emerald';
        const cts = Number(comp.weight || 0);
        const rate = Number(comp.ratePerCarat || 0);
        const totalVal = Number(comp.totalValue || cts * rate || 0);

        setCellText(compR, C.B, `${comp.pieces || 0} pcs ${comp.shape || ''} ${comp.type || 'stone'}`.trim().replace(/\s+/g, ' '));
        setCellText(compR, C.E, comp.type || 'stone');
        setCellText(compR, C.F, '-');
        setCellText(compR, C.G, '-');
        setCellNum(compR,  C.H, cts);
        setCellNum(compR,  C.I, rate);
        // J = H*I
        setCellFormula(compR, C.J,
          `${col(C.H)}${compExcelRow}*${col(C.I)}${compExcelRow}`,
          totalVal
        );
        stoneComponentRows.push({ rowExcel: compExcelRow, rowIdx: compR, cts, rate, totalVal, isEmerald });
        rowIdx++;
      });

      // ---- Labour row ----
      const labourR = rowIdx;
      labourRowExcel = $(rowIdx);
      setCellText(labourR, C.E, 'labour');
      setCellNum(labourR,  C.F, labour);
      rowIdx++;

      // ---- TK Commission row ----
      const commR = rowIdx;
      commRowExcel = $(rowIdx);
      setCellText(commR, C.E, 'tk commission');
      // commission = K_mtl * VLOOKUP(K_mtl, 'rates tk'!$B$5:$C$10, 2, TRUE)
      // K column is col(C.K), mtl row is mtlRow
      const kRef = `${col(C.K)}${mtlRow}`;
      const commResult = Calc.calculateCommission(item.evaluation.subtotal);
      const commCachedVal = (commResult && typeof commResult === 'object') ? commResult.value : (commResult || 0);
      setCellFormula(commR, C.F,
        `${kRef}*VLOOKUP(${kRef},'rates tk'!$B$5:$C$10,2,TRUE)`,
        commCachedVal
      );
      rowIdx++;

      // ---- Now fill in the deferred formulas on the MTL row ----
      // Net WT = Gross WT - (sum of all stone CTS / 5)
      const stoneHCells = stoneComponentRows.map(s => `${col(C.H)}${s.rowExcel}`).join('+');
      const netWtFormula = stoneHCells.length > 0
        ? `${col(C.F)}${mtlRow}-((${stoneHCells})/5)`
        : `${col(C.F)}${mtlRow}`;
      const stoneWtGrams = totalStoneCts * 0.2;
      const netWt = Math.max(0, totalGrossWt - stoneWtGrams);
      setCellFormula(mtlR, C.G, netWtFormula, netWt);

      // Metal total J = G * wastage_factor * I  (we embed wastage directly)
      const metalTotal = netWt * wastageMultiplier * ((GOLD_RATE_PER_10G / 240) * mainKarat);
      setCellFormula(mtlR, C.J,
        `${col(C.G)}${mtlRow}*${wastageMultiplier.toFixed(4)}*${col(C.I)}${mtlRow}`,
        metalTotal
      );

      // K: Subtotal = SUM(J_mtl, J_stones…, F_labour)
      const jRefs = [`${col(C.J)}${mtlRow}`, ...stoneComponentRows.map(s => `${col(C.J)}${s.rowExcel}`)];
      setCellFormula(mtlR, C.K,
        `SUM(${jRefs.join(',')},${col(C.F)}${labourRowExcel})`,
        item.evaluation.subtotal
      );

      // Split stone refs by emerald for M / N
      const emeraldJRefs    = stoneComponentRows.filter(s => s.isEmerald).map(s => `${col(C.J)}${s.rowExcel}`);
      const nonEmeraldJRefs = [`${col(C.J)}${mtlRow}`,
                               ...stoneComponentRows.filter(s => !s.isEmerald).map(s => `${col(C.J)}${s.rowExcel}`)];
      const labFRef  = `${col(C.F)}${labourRowExcel}`;
      const commFRef = `${col(C.F)}${commRowExcel}`;

      // L: Market CP = SUM(all J's + labour + commission) / 5
      setCellFormula(mtlR, C.L,
        `SUM(${jRefs.join(',')},${labFRef},${commFRef})/5`,
        item.evaluation.marketCostPrice
      );

      // M: Home CP — emerald counted at 50%
      if (emeraldJRefs.length > 0) {
        const mParts = [
          ...nonEmeraldJRefs,
          ...emeraldJRefs.map(r => `(${r}*0.5)`),
          labFRef, commFRef
        ];
        setCellFormula(mtlR, C.M,
          `SUM(${mParts.join(',')})/5`,
          item.evaluation.homeCostPrice
        );
      } else {
        setCellFormula(mtlR, C.M,
          `SUM(${jRefs.join(',')},${labFRef},${commFRef})/5`,
          item.evaluation.homeCostPrice
        );
      }

      // N: SP for Market
      if (emeraldJRefs.length > 0) {
        setCellFormula(mtlR, C.N,
          `((SUM(${[...nonEmeraldJRefs, labFRef, commFRef].join(',')})*1.4)+(${emeraldJRefs.join('+')}))/5`,
          item.evaluation.sellingPrice
        );
      } else {
        setCellFormula(mtlR, C.N,
          `(SUM(${[...nonEmeraldJRefs, labFRef, commFRef].join(',')})*1.4)/5`,
          item.evaluation.sellingPrice
        );
      }

      // Gap row between items
      rowIdx++;
    });

    // ── Grand total row ──
    const totalMarketCP     = filteredItems.reduce((acc, i) => acc + i.evaluation.marketCostPrice, 0);
    const totalSellingPrice = filteredItems.reduce((acc, i) => acc + i.evaluation.sellingPrice,    0);
    setCellText(rowIdx, C.A, 'GRAND TOTAL',             BOLD);
    setCellNum(rowIdx, C.B, filteredItems.length,       BOLD);
    setCellText(rowIdx, C.C, 'pieces',                   BOLD);
    setCellNum(rowIdx, C.L, totalMarketCP,              MONEYBOLD);
    setCellNum(rowIdx, C.N, totalSellingPrice,          MONEYBOLD);

    // ── Worksheet metadata ──
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: C.N } });
    ws['!cols'] = [
      { wch: 6  }, // A: S.No
      { wch: 35 }, // B: Description
      { wch: 12 }, // C: Date
      { wch: 8  }, // D: Grading
      { wch: 12 }, // E: Type
      { wch: 10 }, // F: Gross WT / amounts
      { wch: 10 }, // G: Net WT
      { wch: 8  }, // H: CTS
      { wch: 12 }, // I: @ Rate
      { wch: 14 }, // J: Total
      { wch: 14 }, // K: Subtotal
      { wch: 14 }, // L: Market CP
      { wch: 14 }, // M: Home CP
      { wch: 14 }, // N: SP for Market
    ];

    // ── rates tk sheet ──
    const wsTk = {};
    [
      [null, 'rates TK'],
      [null, 'range',  'percentage'],
      [null, 0,        0.10],
      [null, 25000,    0.08],
      [null, 50000,    0.06],
      [null, 150000,   0.04],
      [null, 300000,   0.03],
      [null, 500000,   0.02],
    ].forEach((rowArr, ri) => {
      rowArr.forEach((val, ci) => {
        if (val !== null) {
          const ref = XLSX.utils.encode_cell({ r: ri + 2, c: ci });
          wsTk[ref] = { v: val, t: typeof val === 'string' ? 's' : 'n' };
        }
      });
    });
    wsTk['!ref'] = XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 9, c: 2 } });
    wsTk['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 12 }];

    // ── Assemble workbook ──
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'latest price');
    XLSX.utils.book_append_sheet(wb, wsTk, 'rates tk');

    // cellStyles: true is required for SheetJS CE to write the s property
    return XLSX.write(wb, { bookType: 'xlsx', type: 'base64', cellStyles: true });
  }
};

window.Catalog = Catalog;
