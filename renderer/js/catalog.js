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

      const imageHtml = item.image 
        ? `<img src="${item.image}" alt="${item.name}" class="product-img">`
        : `<svg viewBox="0 0 24 24" width="60" height="60" class="product-fallback-svg"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>`;

      const homeCostHtml = item.evaluation.hasEmerald
        ? `<div class="price-lbl">HOME COST PRICE</div>
           <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 8px;">₹${item.evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>`
        : '';

      const badgeStatusHtml = `<span class="badge-status product-card-badge-status ${statusClass}">${statusLabel}</span>`;

      card.innerHTML = `
        ${badgeStatusHtml}
        <div class="product-img-box">
          ${imageHtml}
          <div class="product-cat-badge">${item.category || 'Jewelry'}</div>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <div class="product-sku">${item.sku || 'SKU-NONE'}</div>
            <h3 class="product-title">${item.name || 'Unnamed Piece'}</h3>
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

    const btnSubmit = document.getElementById('btn-submit-print-jewelry-catalog');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => this.printFromSelection());
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
  }
};

window.Catalog = Catalog;

