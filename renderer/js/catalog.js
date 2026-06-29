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
   *   Row 1  : Title/date label
   *   Row 2  : MTL 24K rate anchor ($B$2)
   *   Row 3  : wastage multiplier ($B$3)
   *   Row 4-5: Legend
   *   Row 7  : Column headers
   *   Row 8+ : Per-item multi-row blocks
   *
   * Column mapping (matches reference 'Jewelry 23.04.26'):
   *   A=S.No  B=Description  C=Date  D=Grading  E=Type
   *   F=Gross WT  G=Net WT  H=Stone Desc  I=Pieces  J=CTS  K=@rate  L=Total
   *   M=Market CP  N=Home CP  O=SP for Market
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

    // Column indices (0-based)
    const C = {
      A: 0,  // S.No
      B: 1,  // Description
      C: 2,  // Date of MFG
      D: 3,  // Grading (karat)
      E: 4,  // Type
      F: 5,  // Gross WT / amounts
      G: 6,  // Net WT
      H: 7,  // Stone Description
      I: 8,  // Pieces
      J: 9,  // CTS
      K: 10, // @ Rate
      L: 11, // Total
      M: 12, // Market CP
      N: 13, // Home CP
      O: 14  // SP for Market
    };
    const $ = r => r + 1; // 0-based row -> 1-based Excel row number

    const GLOBAL_WASTAGE   = (filteredItems[0] ? Number(filteredItems[0].wastage || 15) : 15);
    const WASTAGE_FACTOR   = 1 + GLOBAL_WASTAGE / 100;
    const GOLD_RATE_PER_10G = goldRate * 10;
    const today      = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const goldDate   = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate : today;
    const goldDateFmt = goldDate ? new Date(goldDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : today;

    // =========================================================
    //  Build worksheet cell-by-cell
    // =========================================================
    const ws = {};

    // -- Thin border side object --
    const T = { style: 'thin' };

    // -- Reusable border presets (matching reference exactly) --
    const B = {
      all:    { top: T, bottom: T, left: T, right: T },
      lr:     { left: T, right: T },
      botLR:  { bottom: T, left: T, right: T },
      topLR:  { top: T, left: T, right: T },
      tbr:    { top: T, bottom: T, right: T },    // karat/D col on MTL
      tb:     { top: T, bottom: T },              // G-K on labour/comm rows
      tbR:    { top: T, bottom: T, right: T },    // last of G-K on labour/comm
      tbL:    { top: T, bottom: T, left: T },     // L col on MTL (left, no right)
    };

    // -- Fill colors --
    const FILL_ORANGE = { patternType: 'solid', fgColor: { rgb: 'FFFFC000' } }; // karat, gross wt
    const FILL_BLUE   = { patternType: 'solid', fgColor: { rgb: 'FFB4C6E7' } }; // stone CTS, @ rate
    const FILL_HEADER = { patternType: 'solid', fgColor: { rgb: 'FFD9D9D9' } };

    // -- Alignment --
    const AL  = { horizontal: 'center', vertical: 'center' };
    const ALW = { horizontal: 'center', vertical: 'center', wrapText: true };

    // -- setCell helpers --
    const setCell = (r, c, v, t, s) => { ws[XLSX.utils.encode_cell({r, c})] = { v, t, s }; };
    const S = (r, c, v, s)          => setCell(r, c, v, 's', s);
    const N = (r, c, v, s)          => setCell(r, c, Number(v) || 0, 'n', s);
    const F = (r, c, f, cached, s)  => { ws[XLSX.utils.encode_cell({r, c})] = { f, v: cached !== undefined ? cached : 0, t: 'n', s }; };

    const BOLD_STYLE   = { font: { bold: true } };
    const MONEY_BOLD   = { numFmt: '\u20b9#,##0.00', font: { bold: true } };
    const HDR          = { font: { bold: true }, fill: FILL_HEADER, alignment: AL, border: B.all };

    // ---- Row 0 (Excel 1): Title ----
    S(0, C.A, 'MAVA GEMS \u2014 JEWELRY LATEST PRICE', { font: { bold: true } });
    S(0, C.C, `date: ${today}`, {});

    // ---- Row 1 (Excel 2): Gold rate ----
    S(1, C.A, 'MTL 24K (10g)', { font: { bold: true }, border: B.all });
    N(1, C.B, GOLD_RATE_PER_10G, { font: { bold: true }, border: B.all });
    S(1, C.C, goldDateFmt, {});

    // ---- Row 2 (Excel 3): Wastage ----
    S(2, C.A, 'wastage', { font: { bold: true }, border: B.all });
    N(2, C.B, WASTAGE_FACTOR, { font: { bold: true }, border: B.all });

    // ---- Rows 3-4 (Excel 4-5): Legend ----
    S(3, C.A, 'To fill compulsory', { font: { color: { rgb: 'FFFF0000' } }, border: B.all });
    S(3, C.B, '', { border: B.all });
    S(4, C.A, 'If required',         { font: { color: { rgb: 'FF0000FF' } }, border: B.all });
    S(4, C.B, '', { border: B.all });

    // ---- Row 6 (Excel 7): Column headers ----
    [
      'S No.', 'Description by 5', 'Date of MFG', 'Grading', 'Type',
      'Gross WT', 'Net WT', 'Stone Description', 'Pieces', 'CTS', '@', 'Total',
      'market C.P', 'home C.P', 'SP for market'
    ].forEach((h, ci) => S(6, ci, h, HDR));

    // ---- Per-item blocks (start at row 7 = Excel row 8) ----
    let rowIdx = 7;
    let sNo = 1;

    filteredItems.forEach(item => {
      const metals   = item.metals || [];
      const stones   = item.stones || [];
      const diamonds = item.diamondsPolki || [];
      const labour   = Number(item.labourCost || 0);
      const wastage  = Number(item.wastage !== undefined ? item.wastage : 15);
      const wFactor  = 1 + wastage / 100;
      const createdDate = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '';

      const totalGrossWt  = metals.reduce((s, m) => s + Number(m.weight || 0), 0);
      const mainKarat     = metals.length > 0 ? Number(metals[0].karat) : 18;
      const totalStoneCts = [...stones, ...diamonds].reduce((s, x) => s + Number(x.weight || 0), 0);

      const mtlR   = rowIdx;
      const mtlRow = $(rowIdx); // 1-based Excel row

      const stoneRows = []; // { rowExcel, cts, rate, totalVal, isEmerald }
      let labRowXl   = null;
      let commRowXl  = null;

      // ===================== MTL ROW =====================
      N(mtlR, C.A, sNo++,           { font: { bold: true }, alignment: AL,  border: B.all });
      S(mtlR, C.B, item.name || 'Unnamed Piece', { alignment: ALW, border: B.all });
      S(mtlR, C.C, createdDate,     { alignment: AL,  border: B.all });
      N(mtlR, C.D, mainKarat,       { fill: FILL_ORANGE, alignment: AL, border: B.tbr });  // orange, no left
      S(mtlR, C.E, 'MTL',           { alignment: AL,  border: B.all });
      N(mtlR, C.F, totalGrossWt,    { fill: FILL_ORANGE, alignment: AL, border: B.all }); // orange
      // G: Net WT — deferred after we know stone rows
      S(mtlR, C.H, '',              { alignment: AL,  border: B.all }); // stone desc empty on MTL
      S(mtlR, C.I, '',              { alignment: AL,  border: B.all }); // pieces empty on MTL
      S(mtlR, C.J, '-',             { alignment: AL,  border: B.all }); // CTS dash on MTL
      F(mtlR, C.K, `($B$2/(10*24))*${col(C.D)}${mtlRow}`,
        (GOLD_RATE_PER_10G / 240) * mainKarat, { alignment: AL, border: B.all }); // @ rate formula
      // L: metal total — deferred
      // M, N, O: CP/SP — deferred
      rowIdx++;

      // ===================== STONE/DIAMOND ROWS =====================
      const allComps = [
        ...stones.map(s   => ({ ...s, isDiamond: false })),
        ...diamonds.map(d => ({ ...d, isDiamond: true }))
      ];

      allComps.forEach(comp => {
        const cR   = rowIdx;
        const cXl  = $(rowIdx);
        const isEm = (comp.type || '').toLowerCase() === 'emerald';
        const cts  = Number(comp.weight || 0);
        const rate = Number(comp.ratePerCarat || 0);
        const tv   = Number(comp.totalValue || cts * rate || 0);

        // A, B, C: side borders only (no top/bottom inside block)
        S(cR, C.A, '', { border: B.lr });
        S(cR, C.B, '', { border: B.lr });
        S(cR, C.C, '', { border: B.lr });
        S(cR, C.D, '', { alignment: AL });  // no border on D in stone rows
        S(cR, C.E, comp.type || 'stone', { alignment: ALW, border: B.all });
        S(cR, C.F, '-', { alignment: AL, border: B.all });
        S(cR, C.G, '-', { alignment: AL, border: B.all });
        S(cR, C.H, `${comp.shape || ''}`.trim(), { alignment: AL, border: B.all });
        N(cR, C.I, comp.pieces || 0,             { alignment: AL, border: B.all });
        N(cR, C.J, cts,  { fill: FILL_BLUE, alignment: AL, border: B.all }); // blue CTS
        N(cR, C.K, rate, { fill: FILL_BLUE, alignment: AL, border: B.all }); // blue rate
        F(cR, C.L, `${col(C.J)}${cXl}*${col(C.K)}${cXl}`, tv, { alignment: AL, border: B.all });
        S(cR, C.M, '', { border: B.lr });
        S(cR, C.N, '', { border: B.lr });
        S(cR, C.O, '', { border: B.lr });

        stoneRows.push({ rowExcel: cXl, cts, rate, totalVal: tv, isEmerald: isEm });
        rowIdx++;
      });

      // ===================== LABOUR ROW =====================
      const labR = rowIdx;
      labRowXl   = $(rowIdx);

      S(labR, C.A, '', { border: B.lr });
      S(labR, C.B, '', { border: B.lr });
      S(labR, C.C, '', { border: B.lr });
      S(labR, C.D, '', { alignment: AL });
      S(labR, C.E, 'labour',  { alignment: ALW, border: B.all });
      N(labR, C.F, labour,   { alignment: AL,  border: B.all });
      S(labR, C.G, '', { border: B.tb });   // top+bottom only
      S(labR, C.H, '', { border: B.tb });
      S(labR, C.I, '', { border: B.tb });
      S(labR, C.J, '', { border: B.tb });
      S(labR, C.K, '', { border: B.tbR }); // top+bottom+right
      S(labR, C.M, '', { border: B.lr });
      S(labR, C.N, '', { border: B.lr });
      S(labR, C.O, '', { border: B.lr });
      rowIdx++;

      // ===================== COMMISSION ROW =====================
      const commR = rowIdx;
      commRowXl   = $(rowIdx);

      const lRefs  = [`${col(C.L)}${mtlRow}`, ...stoneRows.map(s => `${col(C.L)}${s.rowExcel}`)];
      const subFml = `SUM(${lRefs.join(',')},${col(C.F)}${labRowXl})`;
      const commResult    = Calc.calculateCommission(item.evaluation.subtotal);
      const commCachedVal = (commResult && typeof commResult === 'object') ? commResult.value : (commResult || 0);

      S(commR, C.A, '', { border: B.botLR });
      S(commR, C.B, '', { border: B.botLR });
      S(commR, C.C, '', { border: B.botLR });
      S(commR, C.D, '', { alignment: AL });
      S(commR, C.E, 'tk commission', { alignment: ALW, border: B.all });
      F(commR, C.F,
        `${subFml}*VLOOKUP(${subFml},'rates tk'!$B$5:$C$10,2,TRUE)`,
        commCachedVal, { alignment: AL, border: B.all });
      S(commR, C.G, '', { border: B.tb });   // top+bottom
      S(commR, C.H, '', { border: B.tb });
      S(commR, C.I, '', { border: B.tb });
      S(commR, C.J, '', { border: B.tb });
      S(commR, C.K, '', { border: B.tbR }); // top+bottom+right
      S(commR, C.M, '', { border: B.botLR });
      S(commR, C.N, '', { border: B.botLR });
      S(commR, C.O, '', { border: B.botLR });
      rowIdx++;

      // ===================== DEFERRED MTL FORMULAS =====================

      // Net WT = Gross WT - (sum stone CTS / 5)
      const stoneJCells  = stoneRows.map(s => `${col(C.J)}${s.rowExcel}`).join('+');
      const netWtFormula = stoneJCells.length > 0
        ? `${col(C.F)}${mtlRow}-((${stoneJCells})/5)` : `${col(C.F)}${mtlRow}`;
      const stoneWtGrams = totalStoneCts * 0.2;
      const netWt = Math.max(0, totalGrossWt - stoneWtGrams);
      F(mtlR, C.G, netWtFormula, netWt, { alignment: AL, border: B.all });

      // Metal Total L = G * wastage_factor * K
      const metalTotal = netWt * wFactor * ((GOLD_RATE_PER_10G / 240) * mainKarat);
      F(mtlR, C.L,
        `${col(C.G)}${mtlRow}*${wFactor.toFixed(4)}*${col(C.K)}${mtlRow}`,
        metalTotal,
        { alignment: AL, border: B.tbL }); // top+bottom+left only (matches reference J/L col)

      // M, N, O: CP / SP formulas
      const labFRef  = `${col(C.F)}${labRowXl}`;
      const commFRef = `${col(C.F)}${commRowXl}`;
      const emeraldLRefs    = stoneRows.filter(s => s.isEmerald).map(s => `${col(C.L)}${s.rowExcel}`);
      const nonEmeraldLRefs = [`${col(C.L)}${mtlRow}`,
                               ...stoneRows.filter(s => !s.isEmerald).map(s => `${col(C.L)}${s.rowExcel}`)];

      F(mtlR, C.M,
        `SUM(${lRefs.join(',')},${labFRef},${commFRef})/5`,
        item.evaluation.marketCostPrice,
        { alignment: AL, border: B.all });

      if (emeraldLRefs.length > 0) {
        const mParts = [...nonEmeraldLRefs, ...emeraldLRefs.map(r => `(${r}*0.5)`), labFRef, commFRef];
        F(mtlR, C.N, `SUM(${mParts.join(',')})/5`, item.evaluation.homeCostPrice,
          { alignment: AL, border: B.all });
        F(mtlR, C.O,
          `((SUM(${[...nonEmeraldLRefs, labFRef, commFRef].join(',')})*1.4)+(${emeraldLRefs.join('+')}))/5`,
          item.evaluation.sellingPrice, { alignment: AL, border: B.all });
      } else {
        F(mtlR, C.N, `SUM(${lRefs.join(',')},${labFRef},${commFRef})/5`,
          item.evaluation.homeCostPrice, { alignment: AL, border: B.all });
        F(mtlR, C.O,
          `(SUM(${[...nonEmeraldLRefs, labFRef, commFRef].join(',')})*1.4)/5`,
          item.evaluation.sellingPrice, { alignment: AL, border: B.all });
      }

      // Blank gap row between items
      rowIdx++;
    });

    // ── Grand total row ──
    const totalMarketCP     = filteredItems.reduce((acc, i) => acc + i.evaluation.marketCostPrice, 0);
    const totalSellingPrice = filteredItems.reduce((acc, i) => acc + i.evaluation.sellingPrice,    0);
    S(rowIdx, C.A, 'GRAND TOTAL',       { font: { bold: true } });
    N(rowIdx, C.B, filteredItems.length, { font: { bold: true } });
    S(rowIdx, C.C, 'pieces',             { font: { bold: true } });
    N(rowIdx, C.M, totalMarketCP,        MONEY_BOLD);
    N(rowIdx, C.O, totalSellingPrice,    MONEY_BOLD);

    // ── Worksheet range & column widths ──
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx, c: C.O } });
    ws['!cols'] = [
      { wch: 6  }, // A
      { wch: 30 }, // B
      { wch: 12 }, // C
      { wch: 8  }, // D
      { wch: 14 }, // E
      { wch: 10 }, // F
      { wch: 10 }, // G
      { wch: 18 }, // H Stone Desc
      { wch: 7  }, // I Pieces
      { wch: 8  }, // J CTS
      { wch: 12 }, // K @ Rate
      { wch: 14 }, // L Total
      { wch: 14 }, // M Market CP
      { wch: 14 }, // N Home CP
      { wch: 14 }, // O SP
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

    return XLSX.write(wb, { bookType: 'xlsx', type: 'base64', cellStyles: true });
  }
};

window.Catalog = Catalog;
