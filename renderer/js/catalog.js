/**
 * Catalog Module
 * Manages rendering the dashboard, catalog grid, and item saving/deleting.
 */

const Catalog = {
  init() {
    this.selectedItemIds = new Set();

    // Search & Filter event listeners
    document.getElementById('search-input').addEventListener('input', UI.debounce(() => this.renderCatalogGrid(), 200));
    document.getElementById('filter-category').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('filter-karat').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('sort-items').addEventListener('change', () => this.renderCatalogGrid());

    // Bulk Select All Listener
    const selectAllCheckbox = document.getElementById('bulk-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const query = document.getElementById('search-input').value.toLowerCase().trim();
        const filterCat = document.getElementById('filter-category').value;
        const filterKarat = document.getElementById('filter-karat').value;
        const allItems = DBManager.getItems();

        const visibleItems = allItems.filter(item => {
          const matchesSearch = !query || 
            (item.name || '').toLowerCase().includes(query) || 
            (item.sku || '').toLowerCase().includes(query) || 
            (item.description || '').toLowerCase().includes(query) ||
            (item.metals || []).some(m => (m.name || '').toLowerCase().includes(query));
          const matchesCat = !filterCat || item.category === filterCat;
          const matchesKarat = !filterKarat || (item.metals || []).some(m => m.karat == filterKarat);
          return matchesSearch && matchesCat && matchesKarat;
        });

        if (e.target.checked) {
          visibleItems.forEach(item => this.selectedItemIds.add(item.id));
        } else {
          visibleItems.forEach(item => this.selectedItemIds.delete(item.id));
        }
        
        this.renderCatalogGrid();
      });
    }

    // Bulk Delete Button Listener
    const bulkDeleteBtn = document.getElementById('btn-bulk-delete');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', () => this.handleBulkDelete());
    }

    // Bulk Unselect Button Listener
    const bulkUnselectBtn = document.getElementById('btn-bulk-unselect');
    if (bulkUnselectBtn) {
      bulkUnselectBtn.addEventListener('click', () => {
        this.selectedItemIds.clear();
        this.renderCatalogGrid();
      });
    }
    
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

    // Initialize Excel import functionality
    this.initExcelImport();

    // Initialize Presentation & Share functionality
    this.initPresentation();
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
    const goldSettings = DBManager.getSettings().goldRate24kt;
    const goldRate = goldSettings ? goldSettings.ratePerGram : 0;
    const items = DBManager.getItems();

    // Rates header rendering
    const dateStr = goldSettings ? goldSettings.effectiveDate : '';
    const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}) : '';

    document.getElementById('header-gold-rate').textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    document.getElementById('header-gold-date').textContent = formattedDate ? `Effective: ${formattedDate}` : 'No date set';

    // Update Banners on Jewelry Analyzer and Catalog pages
    const jLiveRate = document.getElementById('jewelry-page-live-gold-rate');
    if (jLiveRate) jLiveRate.textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    const jLiveTime = document.getElementById('jewelry-page-live-gold-time');
    if (jLiveTime) jLiveTime.textContent = formattedDate ? `(Effective: ${formattedDate})` : '';

    const cLiveRate = document.getElementById('catalog-page-live-gold-rate');
    if (cLiveRate) cLiveRate.textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    const cLiveTime = document.getElementById('catalog-page-live-gold-time');
    if (cLiveTime) cLiveTime.textContent = formattedDate ? `(Effective: ${formattedDate})` : '';

    // USD/INR rate header rendering
    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    const usdDateStr = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.effectiveDate : '';
    document.getElementById('header-usd-rate').textContent = usdRate > 0 ? `₹${usdRate.toLocaleString()}` : '₹0.00';
    document.getElementById('header-usd-date').textContent = usdDateStr ? `Effective: ${new Date(usdDateStr).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}` : 'No date set';

    let totalPortfolioValuation = 0;
    let totalPortfolioMfgCost = 0;
    let totalPortfolioSellingValue = 0;
    let totalGoldWeight = 0;
    let totalJewelryGemWeight = 0;
    let totalLooseEmeraldWeight = 0;

    const gemTypeWeights = {};

    items.forEach(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      totalPortfolioValuation += evaluation.marketCostPrice;
      totalPortfolioMfgCost += (evaluation.mfgGrandTotal || evaluation.marketCostPrice);
      totalPortfolioSellingValue += evaluation.sellingPrice;

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

    const totalPLDiff = totalPortfolioValuation - totalPortfolioMfgCost;
    const totalPLPct = totalPortfolioMfgCost > 0 ? (totalPLDiff / totalPortfolioMfgCost) * 100 : 0;
    const totalPLSign = totalPLPct > 0 ? '+' : (totalPLPct < 0 ? '-' : '');
    const totalPLFormatted = `${totalPLSign}${Math.abs(totalPLPct).toFixed(2)}% (${totalPLDiff >= 0 ? '+' : ''}₹${totalPLDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })})`;

    // Render Metrics Box
    const totalSellingValEl = document.getElementById('metric-total-selling-value');
    if (totalSellingValEl) {
      totalSellingValEl.textContent = `₹${totalPortfolioSellingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    const totalMfgCostEl = document.getElementById('metric-total-mfg-cost');
    if (totalMfgCostEl) {
      totalMfgCostEl.textContent = `₹${totalPortfolioMfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    const totalValEl = document.getElementById('metric-total-valuation');
    if (totalValEl) {
      totalValEl.textContent = `₹${totalPortfolioValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    const totalPLEl = document.getElementById('metric-total-inventory-pl');
    if (totalPLEl) {
      totalPLEl.textContent = totalPLFormatted;
      if (totalPLPct > 0) {
        totalPLEl.style.color = '#22c55e';
      } else if (totalPLPct < 0) {
        totalPLEl.style.color = '#ef4444';
      } else {
        totalPLEl.style.color = 'var(--text-muted)';
      }
    }
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

    // Render Price Range & Valuation Distribution Analysis
    const priceDistContainer = document.getElementById('price-range-distribution-container');
    const priceDistCountEl = document.getElementById('price-distribution-active-count');
    
    if (priceDistContainer) {
      const priceBands = [
        { min: 0, max: 49999.99, label: '₹0 – ₹49,999 (0 - 50K)' },
        { min: 50000, max: 99999.99, label: '₹50,000 – ₹99,999 (50K - 1L)' }
      ];

      // 1L to 10L in 1 Lakh steps
      for (let l = 1; l < 10; l++) {
        const min = l * 100000;
        const max = (l + 1) * 100000 - 0.01;
        priceBands.push({ min, max, label: `₹${l} Lakh – ₹${l + 1} Lakh (${l}L - ${l + 1}L)` });
      }

      // 10L to 25L in 5 Lakh steps
      for (let l = 10; l < 25; l += 5) {
        const min = l * 100000;
        const max = (l + 5) * 100000 - 0.01;
        priceBands.push({ min, max, label: `₹${l} Lakh – ₹${l + 5} Lakh (${l}L - ${l + 5}L)` });
      }

      // 25L to 1 Crore in 25 Lakh steps
      for (let l = 25; l < 100; l += 25) {
        const min = l * 100000;
        const max = (l + 25) * 100000 - 0.01;
        const minLabel = l < 100 ? `${l} Lakh` : `${l / 100} Cr`;
        const nextL = l + 25;
        const maxLabel = nextL < 100 ? `${nextL} Lakh` : `${nextL / 100} Cr`;
        priceBands.push({ min, max, label: `₹${minLabel} – ₹${maxLabel}` });
      }

      // 1 Cr to 10 Cr in 1 Crore steps
      for (let cr = 1; cr < 10; cr++) {
        const min = cr * 10000000;
        const max = (cr + 1) * 10000000 - 0.01;
        priceBands.push({ min, max, label: `₹${cr} Crore – ₹${cr + 1} Crore (${cr} Cr - ${cr + 1} Cr)` });
      }

      // 10 Cr to 25 Cr in 5 Crore steps
      for (let cr = 10; cr < 25; cr += 5) {
        const min = cr * 10000000;
        const max = (cr + 5) * 10000000 - 0.01;
        priceBands.push({ min, max, label: `₹${cr} Crore – ₹${cr + 5} Crore (${cr} Cr - ${cr + 5} Cr)` });
      }

      // 25 Cr to 50 Cr in 25 Crore step
      priceBands.push({ min: 250000000, max: 500000000, label: '₹25 Crore – ₹50 Crore (25 Cr - 50 Cr)' });
      priceBands.push({ min: 500000000.01, max: Infinity, label: '₹50 Crore+ (Above 50 Cr)' });

      const bandStats = priceBands.map(b => ({
        ...b,
        count: 0,
        totalSellingPrice: 0,
        totalMarketCost: 0,
        items: []
      }));

      items.forEach(item => {
        const evaluation = item.evaluation || Calc.evaluateItem(item, goldRate);
        const price = Number(evaluation.sellingPrice || 0);
        const matchedBand = bandStats.find(b => price >= b.min && price <= b.max);
        if (matchedBand) {
          matchedBand.count++;
          matchedBand.totalSellingPrice += price;
          matchedBand.totalMarketCost += Number(evaluation.marketCostPrice || 0);
          matchedBand.items.push(item);
        }
      });

      // Filter out empty bands (Hide ranges with 0 items)
      const activeBands = bandStats.filter(b => b.count > 0);

      if (priceDistCountEl) {
        priceDistCountEl.textContent = `${activeBands.length} Active ${activeBands.length === 1 ? 'Bracket' : 'Brackets'}`;
      }

      if (activeBands.length === 0) {
        priceDistContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 12px; padding: 8px 0;">No active stock items to analyze.</div>`;
      } else {
        const maxCount = Math.max(...activeBands.map(b => b.count), 1);
        const totalItemsCount = items.length || 1;

        priceDistContainer.innerHTML = activeBands.map(band => {
          const countPct = ((band.count / totalItemsCount) * 100).toFixed(1);
          const barFillWidth = Math.max(8, ((band.count / maxCount) * 100));

          return `
            <div style="background: var(--bg-card); border: 1px solid var(--border-light); padding: 12px 16px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <strong style="color: var(--text-main); font-size: 13px;">${band.label}</strong>
                  <span style="font-size: 11px; font-weight: 700; background: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 8px; border-radius: 4px; color: var(--text-gold-dark, #d4af37);">
                    ${band.count} ${band.count === 1 ? 'piece' : 'pieces'} (${countPct}% of stock)
                  </span>
                </div>
                <div style="text-align: right; font-size: 13px;">
                  <span style="color: var(--text-muted); font-size: 11px; margin-right: 6px;">Total Retail:</span>
                  <strong style="color: var(--text-gold, #d4af37);">₹${band.totalSellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
              <div style="width: 100%; height: 7px; background: var(--bg-base, #1c1a17); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-light);">
                <div style="width: ${barFillWidth}%; height: 100%; background: linear-gradient(90deg, var(--text-gold-dark, #b8860b), var(--text-gold, #d4af37)); border-radius: 3px; transition: width 0.4s ease;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Also update Realized Sales, Holding Time & Profit Velocity on Analyzer
    if (window.JewelrySalesController && typeof window.JewelrySalesController.renderSalesList === 'function') {
      window.JewelrySalesController.renderSalesList();
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

    filtered.forEach((item, index) => {
      const serialNumber = index + 1;
      const card = document.createElement('div');
      
      const status = item.status || 'In Stock';
      let statusClass = 'stock';
      let statusLabel = 'In Stock';
      let cardStatusClass = '';
      if (status === 'On Memo' || status === 'Issued') {
        statusClass = 'issued';
        statusLabel = 'Issued';
        cardStatusClass = 'issued';
      } else if (status === 'Sold') {
        statusClass = 'sold';
        statusLabel = 'Sold';
        cardStatusClass = 'sold';
      }
      
      card.className = 'product-card' + (cardStatusClass ? ' ' + cardStatusClass : '');

      // Build specs preview string
      const netMetals = Calc.getNetMetals(item);
      const uniqueKarats = [...new Set(netMetals.map(m => `${m.karat}KT`))];
      const metalsStr = uniqueKarats.length > 0 ? `${uniqueKarats.join(', ')} Gold` : (item.karat ? `${item.karat}KT Gold` : 'None added');
      
      let stonesSum = 0;
      (item.stones || []).forEach(s => stonesSum += Number(s.weight || 0));
      (item.diamondsPolki || []).forEach(d => stonesSum += Number(d.weight || 0));

      const grossWeight = (item.evaluation && item.evaluation.totalGrossWeight !== undefined)
        ? item.evaluation.totalGrossWeight
        : (Number(item.grossWeight || 0) || netMetals.reduce((sum, m) => sum + Number(m.grossWeight || 0), 0));
      const netMetalWeight = (item.evaluation && item.evaluation.totalNetMetalWeight !== undefined)
        ? item.evaluation.totalNetMetalWeight
        : netMetals.reduce((sum, m) => sum + Number(m.netWeight || 0), 0);

      const mfgCost = item.evaluation.mfgGrandTotal || item.evaluation.marketCostPrice;
      const marketCost = item.evaluation.marketCostPrice;
      let plPct = 0;
      if (mfgCost > 0) {
        plPct = ((marketCost - mfgCost) / mfgCost) * 100;
      }
      const plSign = plPct > 0 ? '+' : (plPct < 0 ? '-' : '');
      const plFormatted = plPct !== 0 ? `${plSign}${Math.abs(plPct).toFixed(2)}%` : '0.00%';

      const homeCostHtml = item.evaluation.hasEmerald
        ? `<div class="price-lbl">HOME COST PRICE</div>
           <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 8px;">₹${item.evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>`
        : '';

      const badgeStatusHtml = `<span class="badge-status product-card-badge-status ${statusClass}">${statusLabel}</span>`;

      const imgHtml = item.image
        ? `<div class="product-img-box" style="cursor: pointer;" title="Click to view photo & details">
             <img src="${item.image}" alt="${UI.escapeHtml(item.name || 'Jewelry Photo')}" class="product-img">
           </div>`
        : `<div class="product-img-box product-img-box-placeholder" style="cursor: pointer;" title="Click to view details or add photo">
             <div class="product-img-placeholder-content">
               <svg class="product-img-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
                 <circle cx="8.5" cy="8.5" r="1.5"/>
                 <path d="M21 15l-5-5L5 21"/>
               </svg>
               <span class="product-img-placeholder-text">NO PHOTO</span>
             </div>
           </div>`;

      const isSelected = this.selectedItemIds && this.selectedItemIds.has(item.id);
      if (isSelected) card.classList.add('is-selected');

      const checkboxHtml = `<label class="catalog-select-label" title="Select piece">
        <input type="checkbox" class="catalog-item-select" data-item-id="${item.id}" ${isSelected ? 'checked' : ''}>
        <span class="catalog-custom-checkbox"></span>
      </label>`;

      card.innerHTML = `
        ${checkboxHtml}
        ${badgeStatusHtml}
        ${imgHtml}
        <div class="product-body">
          <div class="product-meta">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
              <span class="product-sno-badge" style="font-family: var(--font-mono); font-weight: 800; font-size: 11px; background: var(--bg-gold-subtle, rgba(212, 175, 55, 0.15)); color: var(--text-gold-dark, #b8860b); border: 1px solid var(--border-gold-subtle, rgba(212, 175, 55, 0.3)); padding: 2px 7px; border-radius: 4px;" title="Serial Number #${serialNumber}">S.No: ${serialNumber}</span>
              <div class="product-sku">${UI.escapeHtml(item.sku || 'SKU-NONE')}</div>
              <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; background-color: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 6px; border-radius: 4px; letter-spacing: 0.05em; color: var(--text-muted);">${UI.escapeHtml(item.category || 'Jewelry')}</span>
            </div>
            <h3 class="product-title" style="margin-top: 4px;">${UI.escapeHtml(item.name || 'Unnamed Piece')}</h3>
          </div>
          
          <div class="product-specs">
            <div class="specs-line" title="${UI.escapeHtml(metalsStr)}"><strong>Metal:</strong> ${UI.escapeHtml(metalsStr) || 'None added'}</div>
            <div class="specs-line"><strong>Gemstones:</strong> ${stonesSum > 0 ? stonesSum.toFixed(2) + ' cts total' : 'None added'}</div>
            <div class="specs-line"><strong>Gross Weight:</strong> ${grossWeight.toFixed(3)} g</div>
            <div class="specs-line"><strong>Net Metal Wt:</strong> ${netMetalWeight.toFixed(3)} g</div>
            <div class="specs-line" title="${UI.escapeHtml(item.description || '')}"><strong>Notes:</strong> ${UI.escapeHtml(item.description || 'No description')}</div>
            <div class="specs-line" style="margin-bottom:0;"><strong>Mfg Cost:</strong> ₹${(item.evaluation.mfgGrandTotal || item.evaluation.marketCostPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          
          <div class="product-price-row">
            <div class="product-price-specs">
              <div class="specs-line"><strong>Market Cost:</strong> ₹${item.evaluation.marketCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              ${item.evaluation.hasEmerald ? `<div class="specs-line"><strong>Home Cost:</strong> ₹${item.evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>` : ''}
              <div class="specs-line"><strong>Selling Price:</strong> ₹${item.evaluation.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div class="specs-line" style="margin-bottom:0;"><strong>P/L:</strong> ${plFormatted}</div>
            </div>
            <div class="product-actions">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit</button>
              <button type="button" class="btn btn-danger btn-small btn-delete" title="Delete piece">Delete</button>
            </div>
          </div>
        </div>
      `;

      // Event Wire up
      const imgBox = card.querySelector('.product-img-box');
      if (imgBox) {
        imgBox.addEventListener('click', () => {
          App.openJewelryDetailModal(item);
        });
      }

      card.querySelector('.btn-edit').addEventListener('click', () => {
        document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece";
        UI.loadItemIntoForm(item);
        UI.openModal('modal-jewelry-item');
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        this.handleDeleteItem(item);
      });

      const checkbox = card.querySelector('.catalog-item-select');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.selectedItemIds.add(item.id);
            card.classList.add('is-selected');
          } else {
            this.selectedItemIds.delete(item.id);
            card.classList.remove('is-selected');
          }
          this.updateBulkSelectionUI(filtered);
        });
      }

      gridContainer.appendChild(card);
    });

    // Update Bulk action bar visibility and status
    this.updateBulkSelectionUI(filtered);
  },

  async handleSaveJewelryPiece() {
    const name = document.getElementById('item-name').value.trim();
    const sku = document.getElementById('item-sku').value.trim();
    const category = document.getElementById('item-category').value;
    const description = document.getElementById('item-description').value.trim();
    const labourCost = Number(document.getElementById('item-labour').value || 0);
    const mfgDate = document.getElementById('item-mfg-date')?.value || new Date().toISOString().split('T')[0];

    // Read global gold rate and per-item mfg gold rate from the form field
    const globalGoldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const itemRateEl = document.getElementById('item-gold-rate-24kt');
    const mfgGoldRate24kt = (itemRateEl && Number(itemRateEl.value) > 0) ? Number(itemRateEl.value) : globalGoldRate;
    const goldRateAtAddition = mfgGoldRate24kt;

    if (!globalGoldRate && (!mfgGoldRate24kt || mfgGoldRate24kt <= 0)) {
      UI.showToast("Please set the 24KT Gold Rate in the Summary tab (or the global rate) before saving.", true);
      return;
    }

    const grossWeight = Number(document.getElementById('item-gross-weight')?.value || 0);
    const karat = Number(document.getElementById('item-karat')?.value || 18);
    const wastage = Number(document.getElementById('item-wastage')?.value || 0);

    if (!name || !sku || !category) {
      UI.showToast("Please fill all required fields (*) in the General tab.", true);
      return;
    }

    if (grossWeight <= 0) {
      UI.showToast("Please enter a valid Gross Weight for the jewelry piece in the General tab.", true);
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
      mfgDate,
      mfgGoldRate24kt,
      goldRateAtAddition,
      grossWeight,
      karat,
      wastage,
      image: UI.activeItemState.image || null,
      metals: [],
      stones: [],
      diamondsPolki: [],
      labourCost,
      profitPercentage: Number(document.getElementById('item-profit-pct').value || 40),
      commission: {
        value: Number(document.getElementById('item-commission').value || 0),
        isManual: UI.activeItemState.commission ? UI.activeItemState.commission.isManual : false
      },
      createdAt: isEdit ? UI.activeItemState.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Gather components
    // Additional Metals
    const metalRows = document.querySelectorAll('.metal-part-entry-card');
    metalRows.forEach(row => {
      const partName = row.querySelector('.metal-part-name').value.trim() || 'Additional Part';
      const partKarat = Number(row.querySelector('.metal-part-karat').value);
      const weight = Number(row.querySelector('.metal-part-weight').value || 0);
      const wastageVal = row.querySelector('.metal-part-wastage')?.value;
      const partWastage = (wastageVal !== undefined && wastageVal !== null && wastageVal.trim() !== '') ? Number(wastageVal) : null;
      savedItem.metals.push({ name: partName, karat: partKarat, weight, wastage: partWastage });
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
    const evaluation = Calc.evaluateItem(savedItem, globalGoldRate, mfgGoldRate24kt);
    savedItem.commission.value = evaluation.commissionValue; // Cache calculated commission in JSON

    try {
      // Ensure image is compressed before pushing to DB & saving vault
      if (savedItem.image) {
        savedItem.image = await UI.compressBase64Image(savedItem.image);
      }

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

      UI.closeModal('modal-jewelry-item');
      UI.resetForm();
      App.refreshAllDisplays();
      await DBManager.saveVault();
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

        App.refreshAllDisplays();
        UI.showToast("Item deleted from stock.");
        await DBManager.saveVault();
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

    filtered.forEach((item, index) => {
      const serialNumber = index + 1;
      const evaluation = Calc.evaluateItem(item, goldRate);
      const label = document.createElement('label');
      label.className = 'print-pudia-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" class="jewelry-print-item-checkbox" value="${item.id}" checked>
        <strong style="color: var(--text-gold-dark); margin-right: 4px;">S.No: ${serialNumber}</strong> · ${UI.escapeHtml(item.sku)} — ${UI.escapeHtml(item.name || 'Unnamed')} (${item.category || '—'}) · ₹${evaluation.marketCostPrice.toLocaleString()}
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
      const evaluation = Calc.evaluateItem(item, goldRate);
      const metals   = item.metals || [];
      const stones   = item.stones || [];
      const diamonds = item.diamondsPolki || [];
      const labour   = Number(item.labourCost || 0);
      const wastage  = Number(item.wastage !== undefined ? item.wastage : 15);

      const totalGrossWt  = evaluation.totalGrossWeight !== undefined ? evaluation.totalGrossWeight : (Number(item.grossWeight || 0) + metals.reduce((s, m) => s + Number(m.weight || 0), 0));
      const mainKarat     = Number(item.karat || (metals.length > 0 ? Number(metals[0].karat) : 18));
      const totalStoneCts = [...stones, ...diamonds].reduce((s, x) => s + Number(x.weight || 0), 0);

      // Compute effective wastage factor for Excel formulas
      const stoneWeightGrams = totalStoneCts * 0.2;
      const netWt = evaluation.totalNetMetalWeight !== undefined ? evaluation.totalNetMetalWeight : Math.max(0, totalGrossWt - stoneWeightGrams);
      const baseMetalVal = netWt * (goldRate * (mainKarat / 24));
      
      let wFactor = 1 + wastage / 100;
      if (baseMetalVal > 0 && evaluation && evaluation.metalSubtotal) {
        wFactor = evaluation.metalSubtotal / baseMetalVal;
      }
      const createdDate = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '';

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
  },

  updateBulkSelectionUI(filteredItems) {
    const selectCountEl = document.getElementById('bulk-select-count');
    const selectAllCheckbox = document.getElementById('bulk-select-all');
    const bulkDeleteBtn = document.getElementById('btn-bulk-delete');
    const bulkUnselectBtn = document.getElementById('btn-bulk-unselect');

    // Clean up selectedItemIds to only include visible/filtered ones
    const filteredIds = new Set(filteredItems.map(i => i.id));
    for (let id of this.selectedItemIds) {
      if (!filteredIds.has(id)) {
        this.selectedItemIds.delete(id);
      }
    }

    const selectedCount = this.selectedItemIds.size;

    if (selectCountEl) {
      selectCountEl.textContent = `${selectedCount} Selected`;
    }

    const allSelected = filteredItems.length > 0 && filteredItems.every(i => this.selectedItemIds.has(i.id));
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = allSelected;
    }

    if (bulkDeleteBtn) {
      bulkDeleteBtn.disabled = (selectedCount === 0);
    }

    if (bulkUnselectBtn) {
      bulkUnselectBtn.disabled = (selectedCount === 0);
    }

    const shareBtn = document.getElementById('btn-share-presentation');
    if (shareBtn) {
      shareBtn.disabled = (selectedCount === 0);
    }
  },

  async handleBulkDelete() {
    const count = this.selectedItemIds.size;
    if (count === 0) return;

    UI.confirm(`Are you sure you want to delete all ${count} selected jewelry piece(s) from stock?`, async () => {
      try {
        const initialCount = DBManager.database.items.length;
        DBManager.database.items = DBManager.database.items.filter(item => !this.selectedItemIds.has(item.id));
        const deletedCount = initialCount - DBManager.database.items.length;

        // Log deletion
        DBManager.addLog("DELETE", "bulk_delete", "Multiple Pieces", `Bulk deleted ${deletedCount} jewelry piece(s) from stock`, []);
        UI.showToast(`Successfully deleted ${deletedCount} stock item(s).`);

        this.selectedItemIds.clear();
        App.refreshAllDisplays();
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast("Failed to complete bulk deletion: " + err.message, true);
      }
    });
  },

  // ==================== EXCEL IMPORT & DUPLICATE VERIFICATION ====================

  importState: {
    parsedItems: [],
    activeTab: 'all',
    selectedIds: new Set()
  },

  initExcelImport() {
    const btnImport = document.getElementById('btn-import-excel-jewelry-catalog');
    const fileInput = document.getElementById('input-import-excel-file');

    if (btnImport && fileInput) {
      btnImport.addEventListener('click', () => {
        const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
        if (!goldRate || goldRate <= 0) {
          UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before importing jewelry pieces.", true);
          return;
        }
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleExcelFileSelect(e.target.files[0]);
          fileInput.value = ''; // Reset input
        }
      });
    }

    // Modal Controls
    const closeModal = () => UI.closeModal('modal-import-excel-preview');
    const btnClose = document.getElementById('btn-close-excel-import-modal');
    const btnCancel = document.getElementById('btn-excel-import-cancel');
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // Filter Tabs
    const tabAll = document.getElementById('tab-excel-import-all');
    const tabNew = document.getElementById('tab-excel-import-new');
    const tabDupes = document.getElementById('tab-excel-import-duplicates');

    if (tabAll && tabNew && tabDupes) {
      tabAll.addEventListener('click', () => {
        this.importState.activeTab = 'all';
        [tabAll, tabNew, tabDupes].forEach(t => t.classList.remove('active'));
        tabAll.classList.add('active');
        this.renderImportPreviewList();
      });

      tabNew.addEventListener('click', () => {
        this.importState.activeTab = 'new';
        [tabAll, tabNew, tabDupes].forEach(t => t.classList.remove('active'));
        tabNew.classList.add('active');
        this.renderImportPreviewList();
      });

      tabDupes.addEventListener('click', () => {
        this.importState.activeTab = 'duplicates';
        [tabAll, tabNew, tabDupes].forEach(t => t.classList.remove('active'));
        tabDupes.classList.add('active');
        this.renderImportPreviewList();
      });
    }

    // Bulk selection buttons inside import modal
    const btnSelectAllNew = document.getElementById('btn-excel-import-select-all-new');
    const btnDeselectAll = document.getElementById('btn-excel-import-deselect-all');
    if (btnSelectAllNew) {
      btnSelectAllNew.addEventListener('click', () => {
        this.importState.parsedItems.forEach(item => {
          if (!item.isDuplicate) this.importState.selectedIds.add(item.tempId);
        });
        this.renderImportPreviewList();
      });
    }
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        this.importState.selectedIds.clear();
        this.renderImportPreviewList();
      });
    }

    // Confirm button
    const btnConfirm = document.getElementById('btn-excel-import-confirm');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.executeExcelImport());
    }
  },

  async handleExcelFileSelect(file) {
    const XLSX = window.XLSX;
    if (!XLSX) {
      UI.showToast("SheetJS Excel library is not available.", true);
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("The selected Excel file contains no worksheets.");
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rows || rows.length === 0) {
        throw new Error("The worksheet appears to be empty.");
      }

      const parsedItems = this.parseExcelRows(rows);
      if (parsedItems.length === 0) {
        UI.showToast("No valid jewelry items could be identified in the uploaded Excel file.", true);
        return;
      }

      this.detectDuplicates(parsedItems);

      // Initialize state
      this.importState.parsedItems = parsedItems;
      this.importState.activeTab = 'all';
      this.importState.selectedIds = new Set(
        parsedItems.filter(i => !i.isDuplicate).map(i => i.tempId)
      );

      // Reset tab button states
      const tabAll = document.getElementById('tab-excel-import-all');
      const tabNew = document.getElementById('tab-excel-import-new');
      const tabDupes = document.getElementById('tab-excel-import-duplicates');
      if (tabAll && tabNew && tabDupes) {
        [tabAll, tabNew, tabDupes].forEach(t => t.classList.remove('active'));
        tabAll.classList.add('active');
      }

      UI.openModal('modal-import-excel-preview');
      this.renderImportPreviewList();

    } catch (err) {
      console.error("Excel import error:", err);
      UI.showToast("Failed to parse Excel file: " + err.message, true);
    }
  },

  /**
   * Parse rows from Excel, supporting both multi-row block layouts (like Jewelry 23.04.26.xlsx)
   * and simple tabular layouts.
   *
   * Rules applied:
   *  - Gold / metal weights are rounded to 3 decimal places.
   *  - Stone weights (carats) are rounded to 2 decimal places.
   *  - Wastage is extracted from sheet header if present (B3 = wastage factor e.g. 1.15 → 15%).
   *  - Gold rate at addition is extracted from sheet header if present (B2 = rate per 10g).
   *  - Shape is inferred from the stone description column.
   *  - S.No > 0 check prevents spurious block starts on row 0 or blank sNo cells.
   */
  parseExcelRows(rows) {
    const settingsGoldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const parsed = [];

    // ── Precision helpers ──────────────────────────────────────────────────────
    /** Round to 3 decimal places — for gold / metal weights (grams) */
    const goldWt = (v) => {
      const n = parseRaw(v);
      return parseFloat(n.toFixed(3));
    };

    /** Round to 2 decimal places — for stone weights (carats) */
    const stoneWt = (v) => {
      const n = parseRaw(v);
      return parseFloat(n.toFixed(2));
    };

    /** Parse a raw cell value to a plain float */
    const parseRaw = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = Number(String(v).replace(/[^0-9.-]+/g, ''));
      return isNaN(n) ? 0 : n;
    };

    /** Generic numeric parse (for karats, rates, counts etc.) */
    const num = parseRaw;

    // ── Stone-type helper ──────────────────────────────────────────────────────
    const getStoneType = (str) => {
      const s = String(str).toLowerCase();
      if (s.includes('polki'))                                    return 'Polki';
      if (s.includes('dia') || s.includes('diamond'))            return 'Diamond';
      if (s.includes('emd') || s.includes('emerald'))            return 'Emerald';
      if (s.includes('ruby') || s.includes('rub'))               return 'Ruby';
      if (s.includes('sapphire') || s.includes('sapp'))          return 'Sapphire';
      if (s.includes('pearl'))                                    return 'Pearl';
      if (s.includes('tsav') || s.includes('tsavorite'))         return 'Tsavorite';
      if (s.includes('spessartite') || s.includes('garnet'))     return 'Garnet';
      if (s.includes('amethyst') || s.includes('ame'))           return 'Amethyst';
      if (s.includes('tanzanite') || s.includes('tanz'))         return 'Tanzanite';
      if (s.includes('citrine'))                                  return 'Citrine';
      if (s.includes('topaz'))                                    return 'Topaz';
      if (s.includes('aqua') || s.includes('aquamarine'))        return 'Aquamarine';
      if (s.includes('tourmaline') || s.includes('tour'))        return 'Tourmaline';
      return 'Other Stone';
    };

    // ── Stone-shape helper ─────────────────────────────────────────────────────
    const getStoneShape = (str) => {
      const s = String(str).toLowerCase();
      if (s.includes('round') || s.includes('rd') || s.includes(' r ')) return 'Round';
      if (s.includes('oval') || s.includes('ov'))                        return 'Oval';
      if (s.includes('pear') || s.includes('drop'))                      return 'Pear';
      if (s.includes('cushion') || s.includes('cush'))                   return 'Cushion';
      if (s.includes('princess') || s.includes('sq'))                    return 'Princess';
      if (s.includes('emerald cut') || s.includes('emcut'))              return 'Emerald Cut';
      if (s.includes('marquise') || s.includes('mq') || s.includes('nav')) return 'Marquise';
      if (s.includes('heart'))                                            return 'Heart';
      if (s.includes('trillion') || s.includes('tri'))                   return 'Trillion';
      if (s.includes('baguette') || s.includes('bag'))                   return 'Baguette';
      if (s.includes('asscher'))                                          return 'Asscher';
      if (s.includes('radiant'))                                          return 'Radiant';
      if (s.includes('half moon') || s.includes('halfmoon'))             return 'Half Moon';
      if (s.includes('cab') || s.includes('cabochon'))                   return 'Cabochon';
      return 'Mixed';
    };

    // ── Category helper ────────────────────────────────────────────────────────
    const guessCategory = (name) => {
      const s = String(name).toLowerCase();
      if (s.includes('earring') || s.includes('ear ring') || s.includes('jhumka') || s.includes('stud') || s.includes('huggies') || s.includes('hoop')) return 'Earrings';
      if (s.includes('ring') || s.includes('band') || s.includes('solitaire'))  return 'Rings';
      if (s.includes('pendant') || s.includes('locket'))                         return 'Pendants';
      if (s.includes('necklace') || s.includes('haar') || s.includes('har'))     return 'Necklaces';
      if (s.includes('bracelet') || s.includes('bangle') || s.includes('kada'))  return 'Bracelets';
      if (s.includes('set'))                                                       return 'Necklaces'; // bridal sets
      return 'Earrings'; // Default fallback
    };

    // ── Detect layout type and extract sheet-level metadata ───────────────────
    //
    // VERIFIED COLUMN LAYOUT (from Jewelry 23.04.26.xlsx, openpyxl inspection):
    //
    //  Pre-header rows (before the "S No." header):
    //    Row idx 1: col0='MTL 24K (10g)', col1=rate_per_10g (e.g. 160000)
    //    Row idx 2: col0='wastage',        col1=factor (e.g. 1.15)
    //
    //  Header row (col indices):
    //    0=S No. | 1=Description by 5 | 2=Date of MFG | 3=Grading(karat) |
    //    4=RowType | 5=Gross WT | 6=Net WT | 7=CTS | 8=@ | 9=Total
    //
    //  Item "MTL" row (S.No > 0):
    //    col0=SNo, col1=Name, col2=Date, col3=Karat, col4='MTL',
    //    col5=GrossWt, col6=NetWt
    //
    //  Stone sub-rows (no S.No, E col = stone name):
    //    col4=StoneName, col7=Carats, col8=@Rate, col9=TotalValue
    //
    //  Labour sub-rows:
    //    col4='labour', col5=LabourAmount
    //
    //  Commission sub-rows:
    //    col4='tk commission', col5=CommissionAmount
    let isBlockLayout = false;
    let headerRowIdx  = -1;
    let sheetGoldRate = settingsGoldRate;   // per gram — extracted from row 1
    let sheetWastage  = 15;                 // % — extracted from row 2

    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row    = rows[r];
      const col0   = String(row[0] || '').toLowerCase().trim();
      const col1   = String(row[1] || '').toLowerCase().trim();
      const rowStr = row.map(c => String(c).toLowerCase().trim()).join(' ');

      // Extract gold rate per gram from "MTL 24K (10g)" header row
      if (col0.includes('mtl 24k') || col0.includes('mtl 24kt')) {
        const rateVal = num(row[1]);
        if (rateVal > 0) {
          // The stored value is rate per 10g, convert to per gram
          sheetGoldRate = parseFloat((rateVal / 10).toFixed(2));
        }
      }

      // Extract wastage factor from "wastage" header row
      if (col0 === 'wastage') {
        const wFactor = num(row[1]);
        if (wFactor > 1 && wFactor < 2) {
          // Factor like 1.15 → 15%
          sheetWastage = parseFloat(((wFactor - 1) * 100).toFixed(1));
        } else if (wFactor > 0 && wFactor <= 1) {
          // Plain percentage like 0.15 → 15%
          sheetWastage = parseFloat((wFactor * 100).toFixed(1));
        }
      }

      // Detect the header row: must contain 'S No.' or 'Description by 5'
      if (rowStr.includes('s no') || rowStr.includes('description by 5')) {
        isBlockLayout = true;
        headerRowIdx  = r;
        break;
      }
    }

    const goldRateToUse = sheetGoldRate || settingsGoldRate;

    // ── Helper: extract karat from item name string ───────────────────────────
    // e.g. "Emd Cab & Dia Earrings (14.5 KT)" → 14.5
    const karatFromName = (name) => {
      const m = String(name).match(/(\d+\.?\d*)\s*[kK][tT]/);
      return m ? parseFloat(m[1]) : 18;
    };

    if (isBlockLayout && headerRowIdx !== -1) {
      // ===== PARSE BLOCK LAYOUT =====
      let currentItem = null;

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        // Read each column (with safe fallback to '')
        const col0 = row[0];                                   // A: S.No (number) or ''
        const col1 = String(row[1] || '').trim();              // B: Item name
        const col2 = String(row[2] || '').trim();              // C: Date of manufacture
        const col3 = num(row[3]);                              // D: Karat (grading)
        const col4 = String(row[4] || '').trim().toLowerCase();// E: Row type (MTL / dia / ruby / labour / tk commission …)
        const col5 = goldWt(row[5]);                           // F: Gross WT (grams, 3dp) OR labour amount
        const col6 = goldWt(row[6]);                           // G: Net WT (grams, 3dp)
        const col7 = stoneWt(row[7]);                          // H: Stone carats (2dp)
        const col8 = parseFloat(num(row[8]).toFixed(2));       // I: @ rate per carat
        const col9 = parseFloat(num(row[9]).toFixed(2));       // J: Stone / line total

        const sNoNum = Number(col0);
        // A new item starts when A has a positive number AND E = 'MTL' (item header row)
        const isNewItem =
          col0 !== '' && col0 !== null && col0 !== undefined &&
          !isNaN(sNoNum) && sNoNum > 0 && col4 === 'mtl';

        if (isNewItem) {
          if (currentItem) parsed.push(currentItem);

          const karat = col3 > 0 ? col3 : karatFromName(col1);

          currentItem = {
            tempId:             'imp_' + parsed.length + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name:               col1 || `Jewelry Piece #${sNoNum}`,
            sku:                String(sNoNum),   // sequence from Excel — will be replaced by category SKU on import
            category:           guessCategory(col1),
            description:        col1 + (col2 ? ` (MFG: ${col2})` : ''),
            metals: [{
              name:   'Body Component',
              karat:  karat,
              weight: col5  // col5 = Gross WT on the MTL row
            }],
            stones:             [],
            diamondsPolki:      [],
            labourCost:         0,
            wastage:            sheetWastage,
            profitPercentage:   40,
            goldRateAtAddition: goldRateToUse,
            commission:         { value: 0, isManual: false },
            grossWt:            col5,
            netWt:              col6
          };

        } else if (currentItem) {
          // ── Sub-rows for the current item ──────────────────────────────────

          if (col4 === 'mtl') {
            // Another MTL sub-row (shouldn't normally happen, but update weights)
            if (col5 > 0) {
              currentItem.grossWt = col5;
              currentItem.metals[0].weight = col5;
            }
            if (col6 > 0) currentItem.netWt = col6;

          } else if (col4 === 'labour') {
            // Labour row — amount is in F (col5)
            if (col5 > 0) currentItem.labourCost = parseFloat(col5.toFixed(2));

          } else if (col4.includes('commission')) {
            // Commission row — amount is in F (col5); treat as manual commission
            if (col5 > 0) {
              currentItem.commission.value    = parseFloat(col5.toFixed(2));
              currentItem.commission.isManual = true;
            }

          } else if (col4 === 'wastage') {
            // Wastage override row
            const wasteVal = col5 || 0;
            if (wasteVal > 0) {
              currentItem.wastage = wasteVal > 1
                ? parseFloat(((wasteVal - 1) * 100).toFixed(1))
                : parseFloat((wasteVal * 100).toFixed(1));
            }

          } else if (col4 !== '') {
            // Stone row — E = stone name/type, H = carats, I = @ rate, J = total
            const stoneType  = getStoneType(col4);
            const stoneShape = getStoneShape(col4);
            const wt   = col7;    // carats (2dp)
            const rate = col8;    // @ per carat
            // Use stored total if available; otherwise compute from wt × rate
            const val  = col9 > 0
              ? col9
              : (wt > 0 && rate > 0 ? parseFloat((wt * rate).toFixed(2)) : 0);

            if (wt > 0) {
              const comp = {
                type:         stoneType,
                shape:        stoneShape,
                pieces:       1,
                weight:       wt,
                ratePerCarat: rate,
                totalValue:   val
              };
              if (stoneType === 'Diamond' || stoneType === 'Polki') {
                currentItem.diamondsPolki.push(comp);
              } else {
                currentItem.stones.push(comp);
              }
            }
          }
        }
      }

      // Push last item
      if (currentItem) parsed.push(currentItem);

    } else {
      // ===== PARSE STANDARD TABULAR LAYOUT =====
      let headerIdx = 0;
      let colMap = {
        name: -1, sku: -1, category: -1, karat: -1,
        gross: -1, net: -1, stoneCts: -1, stonePcs: -1,
        stoneRate: -1, stoneDesc: -1, labour: -1, wastage: -1, rate: -1
      };

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r].map(c => String(c).toLowerCase().trim());
        row.forEach((cell, ci) => {
          if (cell.includes('name') || cell.includes('desc') || cell.includes('title'))          colMap.name = ci;
          if ((cell.includes('sku') || cell.includes('s.no') || cell.includes('code')) && colMap.sku === -1) colMap.sku = ci;
          if (cell.includes('cat'))                                                               colMap.category = ci;
          if ((cell.includes('karat') || (cell.includes('kt') && !cell.includes('stock'))) && colMap.karat === -1) colMap.karat = ci;
          if ((cell.includes('gross') || cell === 'gr wt') && colMap.gross === -1)               colMap.gross = ci;
          if ((cell.includes('net wt') || cell === 'net') && colMap.net === -1)                  colMap.net = ci;
          if ((cell.includes('cts') || cell.includes('carat') || cell.includes('stone wt')) && colMap.stoneCts === -1) colMap.stoneCts = ci;
          if ((cell.includes('pcs') || cell.includes('pieces')) && colMap.stonePcs === -1)       colMap.stonePcs = ci;
          if ((cell === '@' || cell.includes('rate') || cell.includes('@ rate')) && colMap.stoneRate === -1) colMap.stoneRate = ci;
          if ((cell.includes('stone desc') || cell.includes('stone type')) && colMap.stoneDesc === -1) colMap.stoneDesc = ci;
          if ((cell.includes('labour') || cell.includes('making')) && colMap.labour === -1)      colMap.labour = ci;
          if (cell.includes('wastage') && colMap.wastage === -1)                                 colMap.wastage = ci;
        });

        if (colMap.name !== -1 || colMap.gross !== -1 || colMap.sku !== -1) {
          headerIdx = r;
          break;
        }
      }

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const nameVal  = colMap.name  !== -1 ? String(row[colMap.name]  || '').trim() : '';
        const grossVal = colMap.gross !== -1 ? goldWt(row[colMap.gross])               : 0;
        const netVal   = colMap.net   !== -1 ? goldWt(row[colMap.net])                 : 0;

        if (!nameVal && grossVal === 0 && netVal === 0) continue;

        const skuVal     = colMap.sku      !== -1 ? String(row[colMap.sku]   || '').trim()    : '';
        const karatVal   = colMap.karat    !== -1 ? num(row[colMap.karat])                     : 18;
        const catVal     = colMap.category !== -1 ? String(row[colMap.category] || '').trim() : '';
        const labourVal  = colMap.labour   !== -1 ? parseFloat(num(row[colMap.labour]).toFixed(2)) : 0;
        const wastageVal = colMap.wastage  !== -1 ? num(row[colMap.wastage])                   : sheetWastage;
        const stoneCts   = colMap.stoneCts  !== -1 ? stoneWt(row[colMap.stoneCts])             : 0;
        const stonePcs   = colMap.stonePcs  !== -1 ? Math.round(num(row[colMap.stonePcs]))      : 0;
        const stoneRate  = colMap.stoneRate !== -1 ? parseFloat(num(row[colMap.stoneRate]).toFixed(2)) : 0;
        const stoneDescVal = colMap.stoneDesc !== -1 ? String(row[colMap.stoneDesc] || '').trim() : '';

        const effWastage = wastageVal > 1 ? parseFloat(((wastageVal - 1) * 100).toFixed(1)) : wastageVal;

        const item = {
          tempId: 'imp_' + parsed.length + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          name:   nameVal || `Jewelry Item #${parsed.length + 1}`,
          sku:    skuVal,
          category: catVal || guessCategory(nameVal),
          description: nameVal,
          metals: [{
            name:   'Body Component',
            karat:  karatVal || 18,
            weight: grossVal || netVal || 0
          }],
          stones:        [],
          diamondsPolki: [],
          labourCost:    labourVal,
          wastage:       effWastage || sheetWastage,
          profitPercentage: 40,
          goldRateAtAddition: goldRateToUse,
          commission:    { value: 0, isManual: false },
          grossWt: grossVal,
          netWt:   netVal
        };

        if (stoneCts > 0) {
          const stoneSource = stoneDescVal || nameVal;
          const stoneType   = getStoneType(stoneSource);
          const stoneShape  = getStoneShape(stoneSource);
          const effRate     = stoneRate > 0 ? stoneRate : 0;
          const stoneComp = {
            type:         stoneType,
            shape:        stoneShape,
            pieces:       stonePcs || 1,
            weight:       stoneCts,
            ratePerCarat: effRate,
            totalValue:   parseFloat((stoneCts * effRate).toFixed(2))
          };
          if (stoneType === 'Diamond' || stoneType === 'Polki') {
            item.diamondsPolki.push(stoneComp);
          } else {
            item.stones.push(stoneComp);
          }
        }

        parsed.push(item);
      }
    }

    return parsed;
  },

  /**
   * Check for duplicate items in database based on SKU or exact weights & details.
   */
  detectDuplicates(parsedItems) {
    const existingItems = DBManager.getItems();

    parsedItems.forEach(parsed => {
      let isDup = false;
      let reason = '';

      const pGross = parsed.grossWt || (parsed.metals[0] ? parsed.metals[0].weight : 0);
      const pNet = parsed.netWt || (parsed.metals[0] ? parsed.metals[0].weight : 0);
      const pKarat = parsed.metals[0] ? Number(parsed.metals[0].karat) : 18;
      const pName = (parsed.name || '').toLowerCase().trim();

      for (const exist of existingItems) {
        // 1. Check SKU match
        if (parsed.sku && exist.sku && parsed.sku.toLowerCase().trim() === exist.sku.toLowerCase().trim()) {
          isDup = true;
          reason = `Existing item found with matching SKU "${exist.sku}" (${exist.name})`;
          break;
        }

        // 2. Check exact weights & details match
        const eNetMetals = Calc.getNetMetals(exist);
        const eGross = (exist.metals || []).reduce((s, m) => s + Number(m.weight || 0), 0);
        const eNet = eNetMetals.reduce((s, m) => s + Number(m.netWeight || 0), 0);
        const eKarat = exist.metals && exist.metals[0] ? Number(exist.metals[0].karat) : 18;
        const eName = (exist.name || '').toLowerCase().trim();

        const grossMatch = Math.abs(pGross - eGross) < 0.01;
        const netMatch = Math.abs(pNet - eNet) < 0.01;
        const karatMatch = pKarat === eKarat;
        const nameMatch = pName === eName || (pName && eName && (pName.includes(eName) || eName.includes(pName)));

        if (grossMatch && netMatch && karatMatch && nameMatch) {
          isDup = true;
          reason = `Exact details match existing piece "${exist.name}" (Gross: ${eGross}g, Net: ${eNet}g, Karat: ${eKarat}KT)`;
          break;
        }
      }

      parsed.isDuplicate = isDup;
      parsed.duplicateReason = reason;
    });
  },

  /**
   * Render the list of items in the Excel Import Preview modal.
   */
  renderImportPreviewList() {
    const container = document.getElementById('excel-import-items-container');
    const banner = document.getElementById('excel-import-stats-banner');
    if (!container) return;

    const items = this.importState.parsedItems;
    const tab = this.importState.activeTab;

    // Filter items according to active tab
    let visibleItems = items;
    if (tab === 'new') {
      visibleItems = items.filter(i => !i.isDuplicate);
    } else if (tab === 'duplicates') {
      visibleItems = items.filter(i => i.isDuplicate);
    }

    // Counts
    const totalCount = items.length;
    const newCount = items.filter(i => !i.isDuplicate).length;
    const dupeCount = items.filter(i => i.isDuplicate).length;

    document.getElementById('count-import-all').textContent = totalCount;
    document.getElementById('count-import-new').textContent = newCount;
    document.getElementById('count-import-duplicates').textContent = dupeCount;

    // Stats Banner HTML
    if (banner) {
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="font-size: 20px;">📊</div>
          <div>
            <div style="font-weight: 700; font-size: 14px;">Parsed ${totalCount} Item(s) from Excel</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              <span style="color: var(--success-green); font-weight: 600;">${newCount} New Item(s) ready</span> &bull; 
              <span style="color: #e65100; font-weight: 600;">${dupeCount} Duplicate(s) auto-skipped</span>
            </div>
          </div>
        </div>
        ${dupeCount > 0 ? `
          <div style="font-size: 11px; background: rgba(230, 81, 0, 0.1); color: #e65100; padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(230, 81, 0, 0.2); font-weight: 600;">
            ⚠️ Exact duplicate items detected in database are unchecked to prevent stock duplication.
          </div>
        ` : ''}
      `;
    }

    if (visibleItems.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
          No items found in this category tab.
        </div>
      `;
      this.updateImportSelectionFooter();
      return;
    }

    let html = '';
    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);

    visibleItems.forEach((item) => {
      const isSelected = this.importState.selectedIds.has(item.tempId);
      const evalRes = Calc.evaluateItem(item, goldRate);
      const totalStoneCts = [...(item.stones || []), ...(item.diamondsPolki || [])].reduce((s, x) => s + Number(x.weight || 0), 0);
      const karat = item.metals && item.metals[0] ? item.metals[0].karat : 18;

      html += `
        <div class="import-item-card ${item.isDuplicate ? 'is-duplicate' : ''} ${isSelected ? 'is-selected' : ''}" id="card-imp-${item.tempId}">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 250px;">
              <input type="checkbox" id="chk-imp-${item.tempId}" 
                style="width: 18px; height: 18px; margin-top: 3px; accent-color: var(--text-gold-dark); cursor: pointer;"
                ${isSelected ? 'checked' : ''}
                onchange="Catalog.toggleImportItemSelection('${item.tempId}', this.checked)" />
              
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <strong style="font-size: 14px; color: var(--text-main);">${UI.escapeHtml(item.name)}</strong>
                  ${item.isDuplicate 
                    ? `<span class="badge-import-status badge-import-duplicate">Duplicate - Skipped</span>` 
                    : `<span class="badge-import-status badge-import-new">Ready to Import</span>`}
                  <span style="font-size: 11px; background: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 8px; border-radius: 4px; font-weight: 600; color: var(--text-muted);">${UI.escapeHtml(item.category)}</span>
                </div>

                ${item.isDuplicate ? `
                  <div style="font-size: 11px; color: #e65100; margin-top: 4px; font-weight: 600;">
                    ⚠️ ${UI.escapeHtml(item.duplicateReason)}
                  </div>
                ` : ''}

                <div style="display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); margin-top: 6px; flex-wrap: wrap;">
                  <span>Karat: <strong style="color: var(--text-main);">${karat}KT</strong></span>
                  <span>Gross Wt: <strong style="color: var(--text-main);">${(item.grossWt || 0).toFixed(3)}g</strong></span>
                  <span>Net Wt: <strong style="color: var(--text-main);">${(item.netWt || 0).toFixed(3)}g</strong></span>
                  <span>Stones: <strong style="color: var(--text-main);">${totalStoneCts.toFixed(2)} cts</strong></span>
                  <span>Calc. Valuation: <strong style="color: var(--text-gold-dark);">₹${Math.round(evalRes.marketCostPrice).toLocaleString('en-IN')}</strong></span>
                  ${item.commission && item.commission.isManual && item.commission.value > 0
                    ? `<span>Sheet Total: <strong style="color: #4caf7d;">₹${Math.round(item.commission.value).toLocaleString('en-IN')}</strong></span>`
                    : ''}
                </div>
              </div>
            </div>

            <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; height: 32px;"
              onclick="Catalog.toggleImportEditDrawer('${item.tempId}')">
              ✏️ Verify / Edit
            </button>
          </div>

          <!-- INLINE EDIT DRAWER -->
          <div id="drawer-imp-${item.tempId}" style="display: none; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border-light); background: var(--bg-base); padding: 12px; border-radius: 6px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; color: var(--text-muted);">Verify Item Details</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Item Name</label>
                <input type="text" value="${UI.escapeHtml(item.name)}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'name', this.value)" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">SKU Code</label>
                <input type="text" value="${UI.escapeHtml(item.sku || '')}" placeholder="Auto-generated if empty" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'sku', this.value)" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Category</label>
                <select style="width: 100%; padding: 4px 8px; font-size: 12px;" onchange="Catalog.updateImportItemField('${item.tempId}', 'category', this.value)">
                  <option value="Earrings" ${item.category === 'Earrings' ? 'selected' : ''}>Earrings</option>
                  <option value="Rings" ${item.category === 'Rings' ? 'selected' : ''}>Rings</option>
                  <option value="Pendants" ${item.category === 'Pendants' ? 'selected' : ''}>Pendants</option>
                  <option value="Necklaces" ${item.category === 'Necklaces' ? 'selected' : ''}>Necklaces</option>
                  <option value="Bracelets" ${item.category === 'Bracelets' ? 'selected' : ''}>Bracelets</option>
                  <option value="Other" ${item.category === 'Other' ? 'selected' : ''}>Other</option>
                </select>
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Karat</label>
                <input type="number" step="0.1" value="${karat}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'karat', Number(this.value))" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Gross Weight (g) <span style="color:var(--text-muted); font-weight:400;">3dp</span></label>
                <input type="number" step="0.001" value="${Number(item.grossWt || 0).toFixed(3)}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'grossWt', Number(this.value))" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Net Weight (g) <span style="color:var(--text-muted); font-weight:400;">3dp</span></label>
                <input type="number" step="0.001" value="${Number(item.netWt || 0).toFixed(3)}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'netWt', Number(this.value))" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Wastage (%)</label>
                <input type="number" step="0.1" value="${Number(item.wastage || 15).toFixed(1)}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'wastage', Number(this.value))" />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; display: block; margin-bottom: 2px;">Labour Cost (₹)</label>
                <input type="number" value="${Number(item.labourCost || 0).toFixed(2)}" style="width: 100%; padding: 4px 8px; font-size: 12px;"
                  onchange="Catalog.updateImportItemField('${item.tempId}', 'labourCost', Number(this.value))" />
              </div>
            </div>
            ${(item.stones.length > 0 || item.diamondsPolki.length > 0) ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-light);">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Parsed Stones</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${[...item.stones, ...item.diamondsPolki].map(s => `
                    <span style="font-size: 11px; background: var(--bg-base); border: 1px solid var(--border-light); border-radius: 4px; padding: 3px 8px;">
                      <strong>${UI.escapeHtml(s.type)}</strong> ${UI.escapeHtml(s.shape)} · ${Number(s.weight).toFixed(2)} cts × ${s.pieces} pcs · ₹${s.ratePerCarat}/ct
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.updateImportSelectionFooter();
  },

  toggleImportItemSelection(tempId, isChecked) {
    if (isChecked) {
      this.importState.selectedIds.add(tempId);
    } else {
      this.importState.selectedIds.delete(tempId);
    }
    const card = document.getElementById(`card-imp-${tempId}`);
    if (card) {
      if (isChecked) card.classList.add('is-selected');
      else card.classList.remove('is-selected');
    }
    this.updateImportSelectionFooter();
  },

  toggleImportEditDrawer(tempId) {
    const drawer = document.getElementById(`drawer-imp-${tempId}`);
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }
  },

  updateImportItemField(tempId, field, value) {
    const item = this.importState.parsedItems.find(i => i.tempId === tempId);
    if (!item) return;

    if (field === 'name') {
      item.name = value.trim() || item.name;
    } else if (field === 'sku') {
      item.sku = value.trim();
    } else if (field === 'category') {
      item.category = value;
    } else if (field === 'karat') {
      if (item.metals && item.metals[0]) item.metals[0].karat = Number(value);
    } else if (field === 'grossWt') {
      // Gold weight: always 3 decimal places
      const wt = parseFloat(Number(value).toFixed(3));
      item.grossWt = wt;
      if (item.metals && item.metals[0]) item.metals[0].weight = wt;
    } else if (field === 'netWt') {
      // Net weight: always 3 decimal places
      item.netWt = parseFloat(Number(value).toFixed(3));
    } else if (field === 'labourCost') {
      item.labourCost = parseFloat(Number(value).toFixed(2));
    } else if (field === 'wastage') {
      item.wastage = parseFloat(Number(value).toFixed(1));
    }

    // Re-check duplicates after manual detail change
    this.detectDuplicates([item]);
    this.renderImportPreviewList();
  },

  updateImportSelectionFooter() {
    const count = this.importState.selectedIds.size;
    const countEl = document.getElementById('excel-import-selection-count');
    const btnConfirm = document.getElementById('btn-excel-import-confirm');

    if (countEl) {
      countEl.textContent = `${count} item(s) selected for import`;
    }
    if (btnConfirm) {
      btnConfirm.disabled = (count === 0);
      btnConfirm.textContent = `Confirm & Import (${count}) Items`;
    }
  },

  async executeExcelImport() {
    const selectedIds = this.importState.selectedIds;
    if (selectedIds.size === 0) {
      UI.showToast("Please select at least one item to import.", true);
      return;
    }

    const selectedItems = this.importState.parsedItems.filter(i => selectedIds.has(i.tempId));
    const allExistingItems = DBManager.getItems();
    const allExistingSkus = new Set(allExistingItems.map(i => i.sku));

    // Category → prefix map (same as manual SKU generator in ui.js)
    const CAT_PREFIXES = {
      'Earrings':  'EAR-',
      'Rings':     'RNG-',
      'Necklaces': 'NCK-',
      'Bracelets': 'BRC-',
      'Pendants':  'PND-',
      'Other':     'JWL-'
    };

    // Track max SKU number per category across both existing DB AND already-assigned in this batch
    const catMaxNum = {};
    allExistingItems.forEach(item => {
      const cat = item.category || 'Other';
      const prefix = CAT_PREFIXES[cat] || 'JWL-';
      if (item.sku && item.sku.startsWith(prefix)) {
        const m = item.sku.match(/(\d+)$/);
        if (m) {
          catMaxNum[cat] = Math.max(catMaxNum[cat] || 0, parseInt(m[1], 10));
        }
      }
    });

    const nextSkuForCategory = (cat) => {
      const prefix = CAT_PREFIXES[cat] || 'JWL-';
      catMaxNum[cat] = (catMaxNum[cat] || 0) + 1;
      let num = catMaxNum[cat];
      let sku = `${prefix}${String(num).padStart(2, '0')}`;
      // Ensure no collision with existing SKUs (very unlikely but safe)
      while (allExistingSkus.has(sku)) {
        num++;
        catMaxNum[cat] = num;
        sku = `${prefix}${String(num).padStart(2, '0')}`;
      }
      allExistingSkus.add(sku);
      return sku;
    };

    let importedCount = 0;
    const now = new Date().toISOString();

    selectedItems.forEach((item, index) => {
      // Generate ID
      const newItemId = 'item_' + Date.now() + '_' + index + '_' + Math.floor(Math.random() * 1000);

      // Always generate a fresh category-based SKU for imported items
      const finalSku = nextSkuForCategory(item.category || 'Other');

      const finalItem = {
        id: newItemId,
        name: item.name,
        sku: finalSku,
        category: item.category || 'Earrings',
        description: item.description || item.name,
        image: null,
        metals: item.metals || [{ name: 'Body Component', karat: 18, weight: item.grossWt || 0 }],
        stones: item.stones || [],
        diamondsPolki: item.diamondsPolki || [],
        labourCost: Number(item.labourCost || 0),
        wastage: Number(item.wastage !== undefined ? item.wastage : 15),
        profitPercentage: Number(item.profitPercentage || 40),
        goldRateAtAddition: Number(item.goldRateAtAddition || 0),
        commission: {
          value: Number(item.commission ? item.commission.value : 0),
          isManual: false
        },
        createdAt: now,
        updatedAt: now
      };

      // Recalculate commission cache
      const evaluation = Calc.evaluateItem(finalItem, finalItem.goldRateAtAddition);
      finalItem.commission.value = evaluation.commissionValue;

      // Add log & push to db
      DBManager.addLog("ADD", finalItem.id, finalItem.name, `Imported piece from Excel: ${finalItem.name} (SKU: ${finalItem.sku})`, []);
      DBManager.database.items.push(finalItem);
      importedCount++;
    });

    try {
      UI.closeModal('modal-import-excel-preview');
      App.refreshAllDisplays();
      await DBManager.saveVault();
      UI.showToast(`Successfully imported ${importedCount} jewelry item(s) into stock!`);
    } catch (err) {
      UI.showToast("Import error: " + err.message, true);
    }
  },

  // ── Presentation & Client Showcase Module ────────────────────────────────────

  slideshowState: {
    items: [],
    currentIndex: 0,
    title: '',
    priceMode: 'selling',
    multiplier: 1.0,
    theme: 'gold'
  },

  initPresentation() {
    const btnShare = document.getElementById('btn-share-presentation');
    const closeTriggers = document.querySelectorAll('.modal-close-trigger-jewelry-presentation');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewelry-presentation'));
    });

    if (btnShare) {
      btnShare.addEventListener('click', () => this.openPresentationModal());
    }

    const priceModeSel = document.getElementById('presentation-price-mode');
    if (priceModeSel) {
      priceModeSel.addEventListener('change', (e) => {
        const multGroup = document.getElementById('group-presentation-multiplier');
        if (multGroup) {
          multGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        }
      });
    }

    const btnStartSlideshow = document.getElementById('btn-start-slideshow');
    if (btnStartSlideshow) {
      btnStartSlideshow.addEventListener('click', () => this.launchSlideshow());
    }

    const btnExportPdf = document.getElementById('btn-export-presentation-pdf');
    if (btnExportPdf) {
      btnExportPdf.addEventListener('click', () => this.exportPresentationPdf());
    }

    // Slideshow control listeners
    const btnPrev = document.getElementById('btn-slideshow-prev');
    const btnNext = document.getElementById('btn-slideshow-next');
    const btnClose = document.getElementById('btn-slideshow-close');

    if (btnPrev) btnPrev.addEventListener('click', () => this.navigateSlide(-1));
    if (btnNext) btnNext.addEventListener('click', () => this.navigateSlide(1));
    if (btnClose) btnClose.addEventListener('click', () => this.closeSlideshow());

    window.addEventListener('keydown', (e) => {
      const slideshowModal = document.getElementById('modal-jewelry-slideshow');
      if (slideshowModal && !slideshowModal.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') this.navigateSlide(-1);
        if (e.key === 'ArrowRight') this.navigateSlide(1);
        if (e.key === 'Escape') this.closeSlideshow();
      }
    });
  },

  openPresentationModal() {
    const selectedCount = this.selectedItemIds.size;
    if (selectedCount === 0) {
      UI.showToast("Please select at least one jewelry item to present.", true);
      return;
    }

    const allItems = DBManager.getItems();
    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const selectedItems = allItems.filter(item => this.selectedItemIds.has(item.id));

    // Calculate evaluations for each item
    selectedItems.forEach(item => {
      item.evaluation = Calc.evaluateItem(item, goldRate);
    });

    const countInput = document.getElementById('presentation-item-count');
    if (countInput) countInput.value = `${selectedItems.length} item(s) selected`;

    const summaryCount = document.getElementById('presentation-items-summary-count');
    if (summaryCount) summaryCount.textContent = `${selectedItems.length} item(s)`;

    // Populate item list container
    const container = document.getElementById('presentation-items-list-container');
    if (container) {
      container.replaceChildren();
      selectedItems.forEach((item, index) => {
        const serialNumber = index + 1;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; font-size: 12px;';
        
        const thumbHtml = item.image
          ? `<img src="${item.image}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-light);">`
          : `<div style="width: 32px; height: 32px; background: var(--bg-base); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--text-muted);">No Pic</div>`;

        const sp = Math.round(item.evaluation ? item.evaluation.sellingPrice : 0);

        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <span style="font-weight: 800; font-size: 11px; color: var(--text-gold-dark); background: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 6px; border-radius: 4px; flex-shrink: 0;">S.No: ${serialNumber}</span>
            ${thumbHtml}
            <div style="min-width: 0; flex: 1;">
              <div style="font-weight: 700; color: var(--text-gold-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UI.escapeHtml(item.sku || '')} — <span style="color: var(--text-main); font-weight: 600;">${UI.escapeHtml(item.name || '')}</span></div>
              <div style="font-size: 10px; color: var(--text-muted);">${item.category || ''} | Gross: ${(item.grossWt || item.metals?.[0]?.weight || 0).toFixed(3)}g</div>
            </div>
          </div>
          <div style="font-weight: 700; color: var(--text-gold-dark); flex-shrink: 0; margin-left: 10px;">₹${sp.toLocaleString('en-IN')}</div>
        `;
        container.appendChild(row);
      });
    }

    UI.openModal('modal-jewelry-presentation');
  },

  launchSlideshow() {
    const allItems = DBManager.getItems();
    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const selectedItems = allItems.filter(item => this.selectedItemIds.has(item.id));

    if (selectedItems.length === 0) {
      UI.showToast("No items selected for presentation.", true);
      return;
    }

    const title = document.getElementById('presentation-title').value.trim() || 'Jewelry Showcase';
    const priceMode = document.getElementById('presentation-price-mode').value;
    const multiplier = parseFloat(document.getElementById('presentation-price-multiplier').value || 1.0);
    const theme = document.getElementById('presentation-theme').value;

    selectedItems.forEach(item => {
      item.evaluation = Calc.evaluateItem(item, goldRate);
    });

    this.slideshowState = {
      items: selectedItems,
      currentIndex: 0,
      title,
      priceMode,
      multiplier,
      theme
    };

    UI.closeModal('modal-jewelry-presentation');
    UI.openModal('modal-jewelry-slideshow');
    this.renderCurrentSlide();
  },

  renderCurrentSlide() {
    const { items, currentIndex, title, priceMode, multiplier, theme } = this.slideshowState;
    if (!items || items.length === 0) return;

    const item = items[currentIndex];
    const headerTitle = document.getElementById('slideshow-header-title');
    const counter = document.getElementById('slideshow-counter');
    if (headerTitle) headerTitle.textContent = title;
    if (counter) counter.textContent = `${currentIndex + 1} / ${items.length}`;

    const stage = document.getElementById('slideshow-stage');
    if (!stage) return;

    // Apply theme styling
    let bgGradient = 'linear-gradient(135deg, #0f0c07 0%, #030303 100%)';
    let textMainColor = '#ffffff';
    let textMutedColor = '#aaaaaa';
    let accentColor = '#d4af37';
    let borderAccent = 'rgba(212, 175, 55, 0.4)';

    if (theme === 'emerald') {
      bgGradient = 'linear-gradient(135deg, #032411 0%, #011208 100%)';
      accentColor = '#2ecc71';
      borderAccent = 'rgba(46, 204, 113, 0.4)';
    } else if (theme === 'ivory') {
      bgGradient = 'linear-gradient(135deg, #fbf9f5 0%, #eee9e0 100%)';
      textMainColor = '#111111';
      textMutedColor = '#555555';
      accentColor = '#b8860b';
      borderAccent = 'rgba(184, 134, 11, 0.4)';
    }

    const container = document.getElementById('slideshow-container');
    if (container) container.style.background = bgGradient;

    // Calculate display price
    let displayPriceHtml = '';
    if (priceMode === 'selling') {
      const sp = Math.round(item.evaluation ? item.evaluation.sellingPrice : 0);
      displayPriceHtml = `<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${textMutedColor}; letter-spacing: 0.1em; margin-bottom: 4px;">Selling Price</div>
                          <div style="font-size: 32px; font-weight: 700; font-family: var(--font-serif); color: ${accentColor};">₹${sp.toLocaleString('en-IN')}</div>`;
    } else if (priceMode === 'custom') {
      const sp = Math.round((item.evaluation ? item.evaluation.sellingPrice : 0) * (multiplier || 1.0));
      displayPriceHtml = `<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${textMutedColor}; letter-spacing: 0.1em; margin-bottom: 4px;">Price</div>
                          <div style="font-size: 32px; font-weight: 700; font-family: var(--font-serif); color: ${accentColor};">₹${sp.toLocaleString('en-IN')}</div>`;
    }

    // Metal details string
    const netMetalsSlide = Calc.getNetMetals(item);
    const uniqueKaratsSlide = [...new Set(netMetalsSlide.map(m => `${m.karat}KT`))];
    const metalsStr = uniqueKaratsSlide.length > 0 ? `${uniqueKaratsSlide.join(', ')} Gold` : (item.karat ? `${item.karat}KT Gold` : '18KT Gold');
    
    // Stone details string
    const allStones = [...(item.stones || []), ...(item.diamondsPolki || [])];
    const totalStoneCts = allStones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    const stoneStr = allStones.map(s => `${s.type || 'Stone'} (${(s.weight || 0).toFixed(2)}ct)`).join(', ');

    const imgSlideHtml = item.image
      ? `<img src="${item.image}" alt="${UI.escapeHtml(item.name)}" style="max-width: 100%; max-height: 55vh; object-fit: contain; border-radius: 8px; border: 2px solid ${borderAccent}; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">`
      : `<div style="width: 320px; height: 320px; border-radius: 8px; border: 2px dashed ${borderAccent}; display: flex; flex-direction: column; align-items: center; justify-content: center; color: ${textMutedColor}; gap: 12px; background: rgba(0,0,0,0.2);">
          <svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">No Photo</span>
         </div>`;

    stage.innerHTML = `
      <div style="display: flex; gap: 40px; align-items: center; justify-content: center; max-width: 1100px; width: 100%; flex-wrap: wrap;">
        <div style="flex: 1 1 380px; display: flex; justify-content: center;">
          ${imgSlideHtml}
        </div>
        <div style="flex: 1 1 360px; display: flex; flex-direction: column; gap: 16px; text-align: left;">
          <div>
            <div style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${accentColor}; border: 1px solid ${borderAccent}; padding: 3px 10px; border-radius: 4px; margin-bottom: 10px;">
              ${UI.escapeHtml(item.sku || 'SKU')} • ${UI.escapeHtml(item.category || 'Jewelry')}
            </div>
            <h1 style="font-size: 28px; font-weight: 700; font-family: var(--font-serif); color: ${textMainColor}; line-height: 1.2; margin: 0;">
              ${UI.escapeHtml(item.name || 'Jewelry Piece')}
            </h1>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid ${borderAccent}; padding: 16px; border-radius: 8px; font-size: 13px; color: ${textMutedColor};">
            <div><strong style="color: ${textMainColor};">Metal:</strong> ${UI.escapeHtml(metalsStr)}</div>
            <div><strong style="color: ${textMainColor};">Gross Weight:</strong> ${(item.evaluation?.totalGrossWeight || item.grossWeight || (item.metals || []).reduce((s, m) => s + Number(m.weight || 0), 0)).toFixed(3)} grams</div>
            <div><strong style="color: ${textMainColor};">Net Weight:</strong> ${(item.evaluation?.totalNetMetalWeight || item.grossWeight || 0).toFixed(3)} grams</div>
            ${totalStoneCts > 0 ? `<div><strong style="color: ${textMainColor};">Stones:</strong> ${totalStoneCts.toFixed(2)} cts total (${UI.escapeHtml(stoneStr)})</div>` : ''}
            ${item.description ? `<div><strong style="color: ${textMainColor};">Notes:</strong> ${UI.escapeHtml(item.description)}</div>` : ''}
          </div>

          ${displayPriceHtml}
        </div>
      </div>
    `;

    // Render Bottom Thumbnails Bar
    const thumbsBar = document.getElementById('slideshow-thumbs-bar');
    if (thumbsBar) {
      thumbsBar.replaceChildren();
      items.forEach((it, idx) => {
        const thumb = document.createElement('div');
        const isActive = idx === currentIndex;
        thumb.style.cssText = `width: 50px; height: 50px; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid ${isActive ? accentColor : 'rgba(255,255,255,0.2)'}; opacity: ${isActive ? 1 : 0.6}; transition: all 0.2s; flex-shrink: 0;`;
        
        const thumbImg = it.image
          ? `<img src="${it.image}" style="width: 100%; height: 100%; object-fit: cover;">`
          : `<div style="width: 100%; height: 100%; background: #222; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #888;">${UI.escapeHtml(it.sku || '')}</div>`;

        thumb.innerHTML = thumbImg;
        thumb.addEventListener('click', () => {
          this.slideshowState.currentIndex = idx;
          this.renderCurrentSlide();
        });
        thumbsBar.appendChild(thumb);
      });
    }
  },

  navigateSlide(dir) {
    const { items, currentIndex } = this.slideshowState;
    if (!items || items.length === 0) return;
    let nextIdx = currentIndex + dir;
    if (nextIdx < 0) nextIdx = items.length - 1;
    if (nextIdx >= items.length) nextIdx = 0;
    this.slideshowState.currentIndex = nextIdx;
    this.renderCurrentSlide();
  },

  closeSlideshow() {
    UI.closeModal('modal-jewelry-slideshow');
  },

  async exportPresentationPdf() {
    const { items, title, priceMode, multiplier } = this.slideshowState;
    const selectedItems = (items && items.length > 0) ? items : DBManager.getItems().filter(item => this.selectedItemIds.has(item.id));
    
    if (!selectedItems || selectedItems.length === 0) {
      UI.showToast("No items selected for PDF presentation.", true);
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);

      // Cover / Header
      doc.setFillColor(15, 12, 7);
      doc.rect(0, 0, 210, 35, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(212, 175, 55);
      doc.text(title || "Jewelry Collection Showcase", 14, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(180, 180, 180);
      doc.text(`Date: ${new Date().toLocaleDateString('en-IN')} | Total Pieces: ${selectedItems.length}`, 14, 26);

      let y = 45;
      const pageHeight = 297;

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const evalRes = item.evaluation || Calc.evaluateItem(item, goldRate);

        if (y + 65 > pageHeight - 15) {
          doc.addPage();
          y = 20;
        }

        // Draw card background box
        doc.setDrawColor(220, 220, 220);
        doc.setFillColor(250, 250, 250);
        doc.roundedRect(14, y, 182, 58, 3, 3, 'FD');

        // Draw image if available
        if (item.image && item.image.startsWith('data:image/')) {
          try {
            const format = item.image.includes('png') ? 'PNG' : 'JPEG';
            doc.addImage(item.image, format, 18, y + 4, 50, 50);
          } catch (e) {}
        } else {
          doc.setDrawColor(200, 200, 200);
          doc.setFillColor(240, 240, 240);
          doc.rect(18, y + 4, 50, 50, 'FD');
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text("No Photo", 43, y + 30, { align: 'center' });
        }

        // Item details
        const textX = 74;
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(184, 134, 11);
        doc.text(`${item.sku || ''} — ${item.name || 'Jewelry Piece'}`, textX, y + 12);

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        
        const grossVal = (evalRes?.totalGrossWeight || item.grossWeight || (item.metals || []).reduce((s, m) => s + Number(m.weight || 0), 0)).toFixed(3);
        const netVal = (evalRes?.totalNetMetalWeight || 0).toFixed(3);
        doc.text(`Gross Weight: ${grossVal}g  |  Net Weight: ${netVal}g`, textX, y + 26);

        const allStones = [...(item.stones || []), ...(item.diamondsPolki || [])];
        const totalStoneCts = allStones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
        if (totalStoneCts > 0) {
          const stoneStr = allStones.map(s => `${s.type || 'Stone'} (${(s.weight || 0).toFixed(2)}ct)`).join(', ');
          doc.text(`Gemstones: ${totalStoneCts.toFixed(2)} cts total (${stoneStr})`, textX, y + 32);
        }

        if (item.description) {
          doc.text(`Notes: ${item.description.substring(0, 70)}`, textX, y + 38);
        }

        // Price
        if (priceMode === 'selling' || priceMode === 'custom') {
          const mult = priceMode === 'custom' ? (multiplier || 1.0) : 1.0;
          const finalPrice = Math.round(evalRes.sellingPrice * mult);
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(184, 134, 11);
          doc.text(`Price: ₹${finalPrice.toLocaleString('en-IN')}`, textX, y + 48);
        }

        y += 64;
      }

      // Save PDF via saveFileDialog or direct blob
      const safeTitle = (title || 'Jewelry_Presentation').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeTitle}_${Date.now()}.pdf`;

      if (window.electronAPI && window.electronAPI.saveFileDialog && window.electronAPI.savePdfFile) {
        const targetPath = await window.electronAPI.saveFileDialog(filename);
        if (targetPath) {
          const pdfOutput = doc.output('datauristring').split(',')[1];
          await window.electronAPI.savePdfFile(pdfOutput, targetPath);
          UI.showToast("Presentation PDF saved successfully!");
        }
      } else {
        doc.save(filename);
        UI.showToast("Presentation PDF downloaded successfully!");
      }

    } catch (err) {
      console.error("PDF presentation export failed:", err);
      UI.showToast("Failed to generate PDF presentation: " + err.message, true);
    }
  }
};

window.Catalog = Catalog;
