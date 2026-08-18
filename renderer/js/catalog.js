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
          if (item.status === 'Sold') return false;

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

    // Gather all unique karats from the active items
    const allItems = DBManager.getItems().filter(i => i.status !== 'Sold');
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
    const items = DBManager.getItems().filter(i => i.status !== 'Sold');

    // Rates header rendering
    const dateStr = goldSettings ? goldSettings.effectiveDate : '';
    const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    document.getElementById('header-gold-rate').textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    document.getElementById('header-gold-date').textContent = formattedDate ? `Effective: ${formattedDate}` : 'No date set';

    // USD/INR rate header rendering
    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    const usdDateStr = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.effectiveDate : '';
    document.getElementById('header-usd-rate').textContent = usdRate > 0 ? `₹${usdRate.toLocaleString()}` : '₹0.00';
    document.getElementById('header-usd-date').textContent = usdDateStr ? `Effective: ${new Date(usdDateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'No date set';

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
        priceDistContainer.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 12px; padding: 16px; text-align: center;">No active stock items to analyze.</div>`;
      } else {
        const maxCount = Math.max(...activeBands.map(b => b.count), 1);
        const totalItemsCount = items.length || 1;

        // Render Vertical Bar Columns
        const barColumnsHtml = activeBands.map(band => {
          const countPct = ((band.count / totalItemsCount) * 100).toFixed(1);
          // Scale bar height proportionally between 40px and 160px
          const barHeightPx = Math.max(38, Math.round((band.count / maxCount) * 155));
          const shortLabel = band.label.includes('(') ? band.label.split('(')[1].replace(')', '').trim() : band.label;
          const pieceNames = band.items.map(it => `${it.name || 'Piece'} (${it.sku || ''})`).join(', ');

          return `
            <div class="analyzer-bar-col" title="${UI.escapeHtml(band.label)}: ${band.count} item(s) (${UI.escapeHtml(pieceNames)}) — Total Retail: ₹${band.totalSellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}">
              <div class="analyzer-bar-metric-top">
                <div class="analyzer-bar-count-badge">${band.count} ${band.count === 1 ? 'Pc' : 'Pcs'}</div>
                <div class="analyzer-bar-pct">${countPct}%</div>
              </div>
              <div class="analyzer-bar-pillar" style="height: ${barHeightPx}px;"></div>
              <div class="analyzer-bar-axis-label">
                <span class="analyzer-bar-range-text">${UI.escapeHtml(shortLabel)}</span>
                <span class="analyzer-bar-retail-val">₹${band.totalSellingPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          `;
        }).join('');

        // Grid lines calculation
        const gridStep = maxCount <= 3 ? 1 : Math.ceil(maxCount / 3);
        const gridCount = Math.min(3, maxCount);
        let gridLinesHtml = '';
        for (let i = 0; i <= gridCount; i++) {
          const val = i * gridStep;
          gridLinesHtml += `<div class="analyzer-chart-gridline"><span>${val}</span></div>`;
        }

        priceDistContainer.innerHTML = `
          <div class="analyzer-chart-wrapper">
            <div class="analyzer-chart-stage">
              <div class="analyzer-chart-gridlines">
                ${gridLinesHtml}
              </div>
              ${barColumnsHtml}
            </div>
          </div>
        `;
      }
    }

    // Strategic Business Intelligence calculations on Analyzer Page
    this.renderAgingVelocityIntelligence(items, goldRate);
    this.renderLiveMarginShield(items, goldRate);
    this.renderVIPTargetMatcher(items);
    this.renderGemstoneDepletionMonitor();

    // Also update Realized Sales, Holding Time & Profit Velocity on Analyzer
    if (window.JewelrySalesController && typeof window.JewelrySalesController.renderSalesList === 'function') {
      window.JewelrySalesController.renderSalesList();
    }
  },

  renderAgingVelocityIntelligence(activeItems, goldRate) {
    const alertBadge = document.getElementById('analyzer-aging-alert-badge');
    const tbody = document.getElementById('analyzer-aging-tbody');
    const emptyState = document.getElementById('analyzer-aging-empty-state');
    if (!alertBadge || !tbody) return;

    tbody.innerHTML = '';
    const now = Date.now();

    let tier1 = { count: 0, val: 0 }; // 0-90
    let tier2 = { count: 0, val: 0 }; // 91-180
    let tier3 = { count: 0, val: 0 }; // 181-365
    let tier4 = { count: 0, val: 0 }; // 365+
    const agingList = [];

    activeItems.forEach(item => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const val = evalItem.sellingPrice || evalItem.marketCostPrice || 0;
      const mfgCost = evalItem.mfgGrandTotal || evalItem.marketCostPrice || 0;

      const mDate = item.mfgDate ? item.mfgDate : (item.createdAt ? item.createdAt.split('T')[0] : '');
      const itemTime = mDate ? new Date(mDate + 'T00:00:00').getTime() : (item.createdAt ? new Date(item.createdAt).getTime() : now);
      const days = Math.max(0, Math.round((now - itemTime) / (1000 * 60 * 60 * 24)));

      if (days <= 90) {
        tier1.count++;
        tier1.val += val;
      } else if (days <= 180) {
        tier2.count++;
        tier2.val += val;
      } else if (days <= 365) {
        tier3.count++;
        tier3.val += val;
        agingList.push({ item, days, val, mfgCost, mDate, status: 'Aging (181-365d)' });
      } else {
        tier4.count++;
        tier4.val += val;
        agingList.push({ item, days, val, mfgCost, mDate, status: 'Stagnant (365d+)' });
      }
    });

    const totalCount = activeItems.length;
    const t1Pct = totalCount > 0 ? ((tier1.count / totalCount) * 100).toFixed(0) : 0;
    const t2Pct = totalCount > 0 ? ((tier2.count / totalCount) * 100).toFixed(0) : 0;
    const t3Pct = totalCount > 0 ? ((tier3.count / totalCount) * 100).toFixed(0) : 0;
    const t4Pct = totalCount > 0 ? ((tier4.count / totalCount) * 100).toFixed(0) : 0;

    const count1El = document.getElementById('analyzer-aging-tier1-count');
    const val1El = document.getElementById('analyzer-aging-tier1-val');
    const pct1El = document.getElementById('analyzer-aging-tier1-pct');
    if (count1El) count1El.textContent = `${tier1.count} Pieces`;
    if (val1El) val1El.textContent = `₹${tier1.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (pct1El) pct1El.textContent = `${t1Pct}%`;

    const count2El = document.getElementById('analyzer-aging-tier2-count');
    const val2El = document.getElementById('analyzer-aging-tier2-val');
    const pct2El = document.getElementById('analyzer-aging-tier2-pct');
    if (count2El) count2El.textContent = `${tier2.count} Pieces`;
    if (val2El) val2El.textContent = `₹${tier2.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (pct2El) pct2El.textContent = `${t2Pct}%`;

    const count3El = document.getElementById('analyzer-aging-tier3-count');
    const val3El = document.getElementById('analyzer-aging-tier3-val');
    const pct3El = document.getElementById('analyzer-aging-tier3-pct');
    if (count3El) count3El.textContent = `${tier3.count} Pieces`;
    if (val3El) val3El.textContent = `₹${tier3.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (pct3El) pct3El.textContent = `${t3Pct}%`;

    const count4El = document.getElementById('analyzer-aging-tier4-count');
    const val4El = document.getElementById('analyzer-aging-tier4-val');
    const pct4El = document.getElementById('analyzer-aging-tier4-pct');
    if (count4El) count4El.textContent = `${tier4.count} Pieces`;
    if (val4El) val4El.textContent = `₹${tier4.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (pct4El) pct4El.textContent = `${t4Pct}%`;

    const bar1 = document.getElementById('analyzer-aging-bar-1');
    const bar2 = document.getElementById('analyzer-aging-bar-2');
    const bar3 = document.getElementById('analyzer-aging-bar-3');
    const bar4 = document.getElementById('analyzer-aging-bar-4');
    if (bar1) bar1.style.width = `${t1Pct}%`;
    if (bar2) bar2.style.width = `${t2Pct}%`;
    if (bar3) bar3.style.width = `${t3Pct}%`;
    if (bar4) bar4.style.width = `${t4Pct}%`;

    alertBadge.textContent = `${tier4.count} Stagnant Pieces (>365d)`;
    alertBadge.style.color = tier4.count > 0 ? '#ef4444' : '#22c55e';
    alertBadge.style.borderColor = tier4.count > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)';
    alertBadge.style.background = tier4.count > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)';

    agingList.sort((a, b) => b.days - a.days);

    if (agingList.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (tbody.closest('table')) tbody.closest('table').classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (tbody.closest('table')) tbody.closest('table').classList.remove('hidden');

    const fragment = document.createDocumentFragment();

    agingList.forEach(entry => {
      const isCritical = entry.days > 365;
      const statusColor = isCritical ? '#ef4444' : '#f59e0b';
      const statusBg = isCritical ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)';
      const dateFmt = entry.mDate ? new Date(entry.mDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong style="color:var(--text-main);font-size:13px;cursor:pointer;" class="aging-row-link">${UI.escapeHtml(entry.item.name || 'Jewelry Piece')}</strong>
          <div style="font-size:11px;color:var(--text-muted);">${UI.escapeHtml(entry.item.sku || 'N/A')}</div>
        </td>
        <td style="font-size:12px;color:var(--text-muted);">${dateFmt}</td>
        <td style="text-align:center;font-weight:700;color:${statusColor};font-size:13px;">${entry.days} days</td>
        <td style="text-align:right;font-size:12px;color:var(--text-muted);">₹${entry.mfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-weight:700;color:var(--text-gold-dark);font-size:13px;">₹${entry.val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:${statusColor};background:${statusBg};">
            ${isCritical ? 'CRITICAL AGING' : 'ATTENTION'}
          </span>
        </td>
      `;

      tr.querySelector('.aging-row-link')?.addEventListener('click', () => {
        App.openJewelryDetailModal(entry.item);
      });

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  },

  renderLiveMarginShield(activeItems, liveGoldRate) {
    const goldGainEl = document.getElementById('analyzer-shield-gold-gain');
    const craftMarginEl = document.getElementById('analyzer-shield-craft-margin');
    const salesGoldGainEl = document.getElementById('analyzer-shield-sales-gold-gain');
    if (!goldGainEl || !craftMarginEl) return;

    let totalStockGoldGain = 0;
    let totalStockSellingValue = 0;
    let totalStockMfgCost = 0;

    activeItems.forEach(item => {
      const evalItem = Calc.evaluateItem(item, liveGoldRate);
      totalStockSellingValue += evalItem.sellingPrice;
      totalStockMfgCost += (evalItem.mfgGrandTotal || evalItem.marketCostPrice);

      const netMetals = Calc.getNetMetals(item);
      netMetals.forEach(m => {
        const karat = Number(m.karat || 22);
        const netW = Number(m.netWeight || 0);
        const mfgRate = item.goldRateMfg ? Number(item.goldRateMfg) : (liveGoldRate * 0.88);
        const delta = Math.max(0, liveGoldRate - mfgRate);
        const gain = (netW * (karat / 24)) * delta;
        totalStockGoldGain += gain;
      });
    });

    const totalStockCraftMargin = Math.max(0, totalStockSellingValue - totalStockMfgCost - totalStockGoldGain);

    goldGainEl.textContent = `+₹${totalStockGoldGain.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    craftMarginEl.textContent = `₹${totalStockCraftMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // Realized Sales Gold Gain & Replacement Profit
    const sales = DBManager.database?.jewelrySales || [];
    let salesCommodityGain = 0;
    sales.forEach(sale => {
      if (sale.goldCommodityGain !== undefined && sale.goldCommodityGain !== null) {
        salesCommodityGain += Number(sale.goldCommodityGain);
      } else {
        const soldPrice = Number(sale.soldPrice || 0);
        const mfgCost = Number(sale.mfgCost || 0);
        const repCost = Number(sale.replacementCost || mfgCost);
        const gain = Math.max(0, repCost - mfgCost);
        salesCommodityGain += gain;
      }
    });

    if (salesGoldGainEl) {
      salesGoldGainEl.textContent = `+₹${salesCommodityGain.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
  },

  renderVIPTargetMatcher(activeItems) {
    const container = document.getElementById('analyzer-vip-matches-container');
    const emptyState = document.getElementById('analyzer-vip-empty-state');
    if (!container) return;

    container.innerHTML = '';

    const sales = DBManager.database?.jewelrySales || [];
    if (sales.length === 0 || activeItems.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    const clientMap = new Map();
    sales.forEach(s => {
      const name = (s.customerName || '').trim();
      if (!name || name === 'Direct / Anonymous') return;
      if (!clientMap.has(name)) {
        clientMap.set(name, { name, totalSpend: 0, categories: {}, itemsCount: 0, prices: [] });
      }
      const c = clientMap.get(name);
      c.totalSpend += Number(s.soldPrice || 0);
      c.itemsCount++;
      const cat = s.category || 'Jewelry';
      c.categories[cat] = (c.categories[cat] || 0) + 1;
      c.prices.push(Number(s.soldPrice || 0));
    });

    const topClients = Array.from(clientMap.values()).sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 4);

    if (topClients.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    const fragment = document.createDocumentFragment();

    topClients.forEach(client => {
      let topCat = 'Jewelry';
      let maxC = 0;
      Object.entries(client.categories).forEach(([cat, count]) => {
        if (count > maxC) { maxC = count; topCat = cat; }
      });

      const avgPrice = client.prices.reduce((sum, p) => sum + p, 0) / (client.prices.length || 1);

      const matches = activeItems.filter(item => {
        const matchesCat = !topCat || item.category === topCat;
        return matchesCat;
      });

      const matchedItem = matches.length > 0 ? matches[0] : activeItems[0];
      if (!matchedItem) return;

      const card = document.createElement('div');
      card.style.cssText = 'background: var(--bg-base); border: 1px solid var(--border-light); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 10px;';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-gold-dark);">VIP Client Target</div>
            <strong style="font-size: 14px; color: var(--text-main);">${UI.escapeHtml(client.name)}</strong>
          </div>
          <span style="font-size: 10px; font-weight: 700; color: var(--text-muted); background: var(--bg-card); border: 1px solid var(--border-light); padding: 2px 8px; border-radius: 10px;">
            Prefers ${UI.escapeHtml(topCat)}
          </span>
        </div>

        <div style="font-size: 11px; color: var(--text-muted);">
          Avg Price Point: <strong style="color: var(--text-main);">₹${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; padding: 8px; display: flex; align-items: center; gap: 10px;">
          ${matchedItem.image ? `<img src="${matchedItem.image}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);">` : '<div style="width:40px;height:40px;background:var(--bg-base);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;">💍</div>'}
          <div style="flex-grow:1; min-width:0;">
            <div style="font-size: 10px; font-weight: 700; color: #22c55e;">RECOMMENDED MATCH</div>
            <strong style="font-size: 12px; color: var(--text-main); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${UI.escapeHtml(matchedItem.name)}</strong>
            <span style="font-size: 11px; color: var(--text-muted);">${UI.escapeHtml(matchedItem.sku)}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-small btn-view-vip-match" style="font-size: 10px; padding: 3px 8px; white-space:nowrap;">View</button>
        </div>
      `;

      card.querySelector('.btn-view-vip-match')?.addEventListener('click', () => {
        App.openJewelryDetailModal(matchedItem);
      });

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  },

  renderGemstoneDepletionMonitor() {
    const container = document.getElementById('analyzer-gem-depletion-container');
    const badgeEl = document.getElementById('analyzer-gem-depletion-badge');
    const emptyState = document.getElementById('analyzer-gem-empty-state');
    if (!container) return;

    container.innerHTML = '';

    const emeralds = DBManager.getEmeralds();
    const stones = DBManager.getStones ? DBManager.getStones() : [];
    const totalLots = emeralds.length + stones.length;

    if (badgeEl) badgeEl.textContent = `${totalLots} Lots Tracked`;

    if (totalLots === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    const fragment = document.createDocumentFragment();

    emeralds.slice(0, 6).forEach(e => {
      let weight = 0;
      if (e.sizes && e.sizes.length > 0) {
        weight = e.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0);
      } else {
        weight = Number(e.weight || e.size || 0);
      }

      const memoCts = window.MemoController ? MemoController.getOpenMemoCaratsForEmerald(e.id) : 0;
      const inCompany = Math.max(0, weight - memoCts);
      const isLowStock = inCompany < 5;

      const card = document.createElement('div');
      card.style.cssText = `background: var(--bg-base); border: 1px solid var(--border-light); border-left: 3px solid ${isLowStock ? '#ef4444' : '#22c55e'}; border-radius: 6px; padding: 12px;`;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="font-size: 13px; color: var(--text-main);">${UI.escapeHtml(e.group || 'Emerald')} #${UI.escapeHtml(e.color || 'Pudia')}</strong>
          <span style="font-size: 10px; font-weight: 700; color: ${isLowStock ? '#ef4444' : '#22c55e'}; background: ${isLowStock ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)'}; padding: 2px 6px; border-radius: 4px;">
            ${isLowStock ? 'LOW STOCK' : 'AVAILABLE'}
          </span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); display:flex; justify-content:space-between;">
          <span>In Stock: <strong style="color:var(--text-main);">${inCompany.toFixed(2)} cts</strong></span>
          ${memoCts > 0 ? `<span>On Memo: <strong style="color:var(--text-gold-dark);">${memoCts.toFixed(2)} cts</strong></span>` : ''}
          <span>Rate: ₹${(e.pricePerCarat || 0).toLocaleString()}/ct</span>
        </div>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  },

  getItemSno(item, allItems = null) {
    if (item && item.sno) return item.sno;
    const items = allItems || DBManager.getItems();
    const chronological = [...items].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id?.split('_')[1] || 0);
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id?.split('_')[1] || 0);
      return tA - tB;
    });
    const index = chronological.findIndex(i => i.id === item?.id);
    return index !== -1 ? index + 1 : 1;
  },

  renderCatalogGrid() {
    const gridContainer = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    if (!gridContainer || !emptyState) return;

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

    // Canonical chronological S.No map for all items in the database
    const chronological = [...allItems].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id?.split('_')[1] || 0);
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id?.split('_')[1] || 0);
      return tA - tB;
    });
    const itemSnoMap = new Map();
    chronological.forEach((it, idx) => {
      itemSnoMap.set(it.id, it.sno || (idx + 1));
    });

    // Clear grid
    gridContainer.innerHTML = '';

    // Filter Items
    let filtered = allItems.filter(item => {
      // Exclude sold pieces from active catalog inventory
      if (item.status === 'Sold') return false;

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
    if (sortVal === 'sno-asc' || !sortVal) {
      filtered.sort((a, b) => (itemSnoMap.get(a.id) || a.sno || 0) - (itemSnoMap.get(b.id) || b.sno || 0));
    } else if (sortVal === 'sno-desc') {
      filtered.sort((a, b) => (itemSnoMap.get(b.id) || b.sno || 0) - (itemSnoMap.get(a.id) || a.sno || 0));
    } else if (sortVal === 'newest') {
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

    const fragment = document.createDocumentFragment();

    filtered.forEach((item, index) => {
      const serialNumber = item.sno || itemSnoMap.get(item.id) || (index + 1);
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
             <img src="${item.image}" alt="${UI.escapeHtml(item.name || 'Jewelry Photo')}" class="product-img" loading="lazy" decoding="async">
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

      fragment.appendChild(card);
    });

    gridContainer.appendChild(fragment);

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

    // Assign permanent S.No (or read custom user-specified S.No)
    const customSnoInput = document.getElementById('item-sno')?.value;
    let sno = (customSnoInput !== undefined && customSnoInput !== null && customSnoInput.trim() !== '') ? Number(customSnoInput) : null;
    if (!sno || isNaN(sno) || sno <= 0) {
      if (isEdit) {
        sno = UI.activeItemState.sno || this.getItemSno(UI.activeItemState, allItems);
      } else {
        const maxSno = allItems.reduce((max, it) => Math.max(max, it.sno || 0), 0);
        sno = (maxSno > 0) ? maxSno + 1 : (allItems.length + 1);
      }
    }

    // Check duplicate S.No across other existing items (prevent saving if S.No already exists)
    const isSnoDuplicate = allItems.some(i => {
      const existingSno = i.sno || this.getItemSno(i, allItems);
      return Number(existingSno) === Number(sno) && (!isEdit || i.id !== UI.activeItemState.id);
    });

    if (isSnoDuplicate) {
      UI.showToast(`S.No "${sno}" already exists for another piece. Please choose a unique S.No.`, true);
      return;
    }

    // Reconstruct updated / new item
    const savedItem = {
      id: isEdit ? UI.activeItemState.id : 'item_' + Date.now(),
      sno,
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
      const directValStr = row.querySelector('.metal-part-direct-value')?.value;
      const directValue = (directValStr !== undefined && directValStr !== null && directValStr.trim() !== '') ? Number(directValStr) : null;

      savedItem.metals.push({
        name: partName,
        karat: partKarat || savedItem.karat || 18,
        weight,
        wastage: partWastage,
        directValue,
        totalValue: directValue
      });
    });

    // Stones & Diamonds
    const stoneRows = document.querySelectorAll('.stone-entry-card');
    stoneRows.forEach(row => {
      const customTypeInput = row.querySelector('.stone-custom-type');
      const type = customTypeInput ? (customTypeInput.value.trim() || 'Other Stone') : (row.getAttribute('data-stone-type') || 'Emerald');
      const shape = row.querySelector('.stone-shape').value.trim() || 'Mixed';
      const pieces = Number(row.querySelector('.stone-pieces').value || 0);
      const weight = Number(row.querySelector('.stone-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.stone-rate').value || 0);
      const totalValue = Number(row.querySelector('.stone-total-val').value || 0);

      const component = { type, shape, pieces, weight, ratePerCarat, totalValue };
      if (type.toLowerCase().includes('diamond') || type.toLowerCase().includes('polki')) {
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

    const searchInput = document.getElementById('jewelry-print-search-text');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.populatePrintItemsChecklist());
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
    const searchInput = document.getElementById('jewelry-print-search-text');
    if (searchInput) searchInput.value = '';
    const catSel = document.getElementById('jewelry-print-select-category');
    if (catSel) catSel.value = '';
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
    const searchText = (document.getElementById('jewelry-print-search-text')?.value || '').toLowerCase().trim();

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();

    const filtered = allItems.filter(item => {
      const matchesCat = !selectedCategory || item.category === selectedCategory;
      const matchesKarat = !selectedKarat || (item.metals || []).some(m => Number(m.karat) === Number(selectedKarat));
      const matchesSearch = !searchText || (
        (item.name || '').toLowerCase().includes(searchText) ||
        (item.sku || '').toLowerCase().includes(searchText) ||
        (item.category || '').toLowerCase().includes(searchText) ||
        String(item.sno || this.getItemSno(item, allItems)).includes(searchText)
      );
      return matchesCat && matchesKarat && matchesSearch;
    });

    // Sort by S.No ascending
    filtered.sort((a, b) => {
      const snoA = a.sno || this.getItemSno(a, allItems);
      const snoB = b.sno || this.getItemSno(b, allItems);
      return snoA - snoB;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding: 12px; text-align: center;">No items found for these criteria.</div>';
      return;
    }

    filtered.forEach((item) => {
      const serialNumber = item.sno || this.getItemSno(item, allItems);
      const evaluation = Calc.evaluateItem(item, goldRate);
      const row = document.createElement('label');
      row.className = 'jewelry-print-item-row';
      row.innerHTML = `
        <div class="jewelry-print-item-left">
          <input type="checkbox" class="jewelry-print-item-checkbox" value="${item.id}" checked>
          <span class="jewelry-print-sno-badge">S.No: ${serialNumber}</span>
          <span class="jewelry-print-sku-tag">${UI.escapeHtml(item.sku || '')}</span>
          <span class="jewelry-print-item-name" title="${UI.escapeHtml(item.name || 'Unnamed Piece')}">${UI.escapeHtml(item.name || 'Unnamed Piece')}</span>
          <span class="jewelry-print-cat-badge">${UI.escapeHtml(item.category || '—')}</span>
        </div>
        <div class="jewelry-print-item-right">
          <span class="jewelry-print-val-tag">₹${evaluation.marketCostPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      `;
      container.appendChild(row);
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const allDbItems = DBManager.getItems();

    const totalItems = filtered.length;
    const marginL = 12;
    const marginR = 198;
    const contentWidth = marginR - marginL; // 186mm

    // Draw header on a page
    const drawPageHeader = (pageNum) => {
      if (pageNum === 1) {
        // Page 1 Luxury Header (Height = 28mm)
        doc.setFillColor(24, 28, 36);
        doc.rect(0, 0, 210, 28, 'F');

        // Gold top & bottom accent lines
        doc.setFillColor(212, 175, 55);
        doc.rect(0, 0, 210, 1.2, 'F');
        doc.rect(0, 27.2, 210, 0.8, 'F');

        // Brand title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(212, 175, 55);
        doc.text("MAVA GEMS", marginL, 11);

        // Document subtitle
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text("JEWELRY INVENTORY & CATALOG REPORT", marginL, 17.5);

        // Metadata line
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(190, 195, 205);
        const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
          ' ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const goldStr = goldRate > 0 ? `  |  Gold Ref (24KT): INR ${Number(goldRate).toLocaleString('en-IN')}/g` : '';
        doc.text(`Generated: ${dateStr}${goldStr}`, marginL, 23.5);

        // Right-side total pieces badge
        doc.setFillColor(255, 255, 255, 0.1);
        doc.setDrawColor(212, 175, 55);
        doc.setLineWidth(0.3);
        doc.roundedRect(154, 7, 44, 14, 1.5, 1.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(212, 175, 55);
        doc.text("TOTAL PIECES", 176, 12, { align: 'center' });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(`${totalItems} ${totalItems === 1 ? 'Piece' : 'Pieces'}`, 176, 18, { align: 'center' });

        return 34;
      } else {
        // Page 2+ Compact Header (Height = 15mm)
        doc.setFillColor(24, 28, 36);
        doc.rect(0, 0, 210, 15, 'F');

        doc.setFillColor(212, 175, 55);
        doc.rect(0, 0, 210, 1, 'F');
        doc.rect(0, 14.4, 210, 0.6, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(212, 175, 55);
        doc.text("MAVA GEMS  \u2022  JEWELRY STOCK REPORT", marginL, 10);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(190, 195, 205);
        doc.text(`Total: ${totalItems} Pieces`, marginR, 10, { align: 'right' });

        return 20;
      }
    };

    // Draw table column headers
    const drawTableHeader = (startY) => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(marginL, startY, contentWidth, 7, 'FD');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      doc.text("#", 17, startY + 4.8, { align: 'center' });
      doc.text("SKU", 24, startY + 4.8);
      doc.text("ITEM & CATEGORY", 48, startY + 4.8);
      doc.text("METAL SPECS", 96, startY + 4.8);
      doc.text("STONES / DIAMONDS", 128, startY + 4.8);
      doc.text("GROSS WT", 175, startY + 4.8, { align: 'right' });
      doc.text("VALUATION (INR)", 197, startY + 4.8, { align: 'right' });

      return startY + 7;
    };

    // Group items by category
    const groups = {};
    let grandTotalValue = 0;
    let grandTotalSellingPrice = 0;
    let grandTotalGrossWt = 0;
    let grandTotalNetMetalWt = 0;

    filtered.forEach(item => {
      const catName = item.category || 'Other';
      if (!groups[catName]) groups[catName] = { items: [], totalValue: 0, totalSelling: 0, totalGrossWt: 0 };
      groups[catName].items.push(item);
      const evalData = item.evaluation || Calc.evaluateItem(item, goldRate);
      groups[catName].totalValue += (evalData.marketCostPrice || 0);
      groups[catName].totalSelling += (evalData.sellingPrice || 0);
      groups[catName].totalGrossWt += (evalData.totalGrossWeight || item.grossWeight || 0);
      grandTotalValue += (evalData.marketCostPrice || 0);
      grandTotalSellingPrice += (evalData.sellingPrice || 0);
      grandTotalGrossWt += (evalData.totalGrossWeight || item.grossWeight || 0);
      grandTotalNetMetalWt += (evalData.totalNetMetalWeight || 0);
    });

    let currentPage = 1;
    let y = drawPageHeader(currentPage);
    y = drawTableHeader(y);

    const checkPageBreak = (neededHeight) => {
      if (y + neededHeight > 278) {
        doc.addPage();
        currentPage++;
        y = drawPageHeader(currentPage);
        y = drawTableHeader(y);
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

    let rowIndex = 0;

    sortedGroupNames.forEach(catName => {
      const group = groups[catName];

      checkPageBreak(14);

      // Category Section Banner
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(marginL, y, contentWidth, 6.5, 'FD');

      // Left Gold Accent Bar
      doc.setFillColor(212, 175, 55);
      doc.rect(marginL, y, 2.5, 6.5, 'F');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(30, 41, 59);
      doc.text(`${catName.toUpperCase()}  \u2022  ${group.items.length} ${group.items.length === 1 ? 'Piece' : 'Pieces'}`, marginL + 5, y + 4.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(`Subtotal: INR ${Math.round(group.totalValue).toLocaleString('en-IN')}`, marginR - 3, y + 4.5, { align: 'right' });

      y += 7.5;

      group.items.sort((a, b) => {
        const snoA = a.sno || (this.getItemSno ? this.getItemSno(a, allDbItems) : 0);
        const snoB = b.sno || (this.getItemSno ? this.getItemSno(b, allDbItems) : 0);
        return snoA - snoB;
      });

      group.items.forEach(item => {
        rowIndex++;
        const serialNumber = item.sno || (this.getItemSno ? this.getItemSno(item, allDbItems) : rowIndex);
        const evalData = item.evaluation || Calc.evaluateItem(item, goldRate);

        // Format metals string
        const netMetals = Calc.getNetMetals ? Calc.getNetMetals(item) : (item.metals || []);
        const metalsStr = netMetals
          .map(m => `${m.karat}KT (${Number(m.weight || 0).toFixed(2)}g)`)
          .join(', ') || (item.karat ? `${item.karat}KT` : 'None');

        // Format stones string
        const allStonesArr = [];
        (item.stones || []).forEach(s => {
          if (Number(s.weight || 0) > 0) {
            allStonesArr.push(`${s.type || 'Stone'} ${Number(s.weight).toFixed(2)}ct`);
          }
        });
        (item.diamondsPolki || []).forEach(d => {
          if (Number(d.weight || 0) > 0) {
            allStonesArr.push(`${d.type || 'Diamond'} ${Number(d.weight).toFixed(2)}ct`);
          }
        });
        const stonesStr = allStonesArr.join(', ') || 'Plain Gold';

        const grossWt = evalData.totalGrossWeight || item.grossWeight || 0;
        const marketCost = evalData.marketCostPrice || 0;

        // Split text to fit columns cleanly
        const nameLines = doc.splitTextToSize(item.name || 'Unnamed Piece', 46);
        const metalLines = doc.splitTextToSize(metalsStr, 30);
        const stoneLines = doc.splitTextToSize(stonesStr, 30);

        const textLinesCount = Math.max(nameLines.length + 1, metalLines.length, stoneLines.length, 1);
        const rowH = Math.max(8.5, textLinesCount * 3.6 + 2);

        checkPageBreak(rowH);

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(250, 251, 253);
          doc.rect(marginL, y, contentWidth, rowH, 'F');
        }

        // Column 1: S.No (#)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(String(serialNumber), 17, y + 4.8, { align: 'center' });

        // Column 2: SKU
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text((item.sku || '—').substring(0, 16), 24, y + 4.8);

        // Column 3: Item Name & Category Tag
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(nameLines[0] || 'Jewelry Piece', 48, y + 4.5);

        if (nameLines.length > 1) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          for (let i = 1; i < nameLines.length; i++) {
            doc.text(nameLines[i], 48, y + 4.5 + i * 3.5);
          }
        }

        const catY = y + 4.5 + nameLines.length * 3.4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.3);
        doc.setTextColor(140, 120, 80);
        doc.text((item.category || 'Jewelry').toUpperCase(), 48, catY);

        // Column 4: Metal Specs
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        doc.text(metalLines, 96, y + 4.5);

        // Column 5: Stones & Diamonds
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(stoneLines, 128, y + 4.5);

        // Column 6: Gross Weight
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`${grossWt.toFixed(2)} g`, 175, y + 4.8, { align: 'right' });

        // Column 7: Valuation
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`INR ${Math.round(marketCost).toLocaleString('en-IN')}`, 197, y + 4.8, { align: 'right' });

        // Subtle row bottom divider line
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.15);
        doc.line(marginL, y + rowH, marginR, y + rowH);

        y += rowH;
      });

      // Category Subtotal row
      checkPageBreak(8);
      doc.setFillColor(248, 250, 252);
      doc.rect(marginL, y, contentWidth, 5.5, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(marginL, y, marginR, y);
      doc.line(marginL, y + 5.5, marginR, y + 5.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text(`Subtotal (${catName}) \u2014 ${group.items.length} ${group.items.length === 1 ? 'pc' : 'pcs'}`, 48, y + 3.8);

      doc.text(`${group.totalGrossWt.toFixed(2)} g`, 175, y + 3.8, { align: 'right' });
      doc.text(`INR ${Math.round(group.totalValue).toLocaleString('en-IN')}`, 197, y + 3.8, { align: 'right' });

      y += 8;
    });

    // Executive Grand Total Summary Card
    checkPageBreak(32);
    const boxY = y + 2;
    const boxH = 26;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginL, boxY, contentWidth, boxH, 2, 2, 'FD');

    // Top gold accent bar on summary card
    doc.setFillColor(212, 175, 55);
    doc.rect(marginL, boxY, contentWidth, 1.2, 'F');

    const colW = contentWidth / 4;

    // Metric 1: Total Pieces
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL PIECES", marginL + 6, boxY + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalItems} ${totalItems === 1 ? 'Piece' : 'Pieces'}`, marginL + 6, boxY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${sortedGroupNames.length} Category Groups`, marginL + 6, boxY + 22);

    // Metric 2: Total Gross Weight
    const m2X = marginL + colW + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL GROSS WEIGHT", m2X, boxY + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${grandTotalGrossWt.toFixed(2)} g`, m2X, boxY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Net Metal: ${grandTotalNetMetalWt.toFixed(2)} g`, m2X, boxY + 22);

    // Metric 3: Total Market Cost
    const m3X = marginL + colW * 2 + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("MARKET VALUATION", m3X, boxY + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`INR ${Math.round(grandTotalValue).toLocaleString('en-IN')}`, m3X, boxY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Live metal & gemstone cost", m3X, boxY + 22);

    // Metric 4: Total Selling Price
    const m4X = marginL + colW * 3 + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("ESTIMATED SELLING VALUE", m4X, boxY + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(184, 134, 11);
    doc.text(`INR ${Math.round(grandTotalSellingPrice).toLocaleString('en-IN')}`, m4X, boxY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Target catalog retail", m4X, boxY + 22);

    // Two-pass running footers on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginL, 287, marginR, 287);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text("MAVA GEMS \u2022 HIGH JEWELLERY & GEMSTONES", marginL, 291.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("CONFIDENTIAL \u2022 INTERNAL STOCK & VALUATION REPORT", 105, 291.5, { align: 'center' });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(`Page ${p} of ${totalPages}`, marginR, 291.5, { align: 'right' });
    }

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
    UI.showToast("Generating Excel file with photos…");

    try {
      const xlsxBase64 = await this.generateExcel(filtered, goldRate);
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
   * Generate a "Latest Price" format Excel workbook matching the user's Jewelry structure,
   * including embedded jewelry photos in Column Q merged across the item rows.
   * Returns a base64 string of the .xlsx binary.
   */
  async generateExcel(filteredItems, goldRate) {
    const ExcelJS = window.ExcelJS || (typeof require !== 'undefined' ? require('./exceljs.min.js') : null);
    if (!ExcelJS) {
      throw new Error("ExcelJS library not loaded. Please restart the app.");
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MAVA GEMS';
    wb.created = new Date();

    const ws = wb.addWorksheet('latest price', {
      views: [{ showGridLines: true }]
    });

    // Helper: column letter from 1-based index
    const colLetter = (n) => {
      let s = '';
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };

    // Column indices (1-based for ExcelJS)
    const C = {
      A: 1,  // S.No
      B: 2,  // Description
      C: 3,  // Date of MFG
      D: 4,  // Grading (karat)
      E: 5,  // Type
      F: 6,  // Gross WT / amounts
      G: 7,  // Net WT
      H: 8,  // Stone Description
      I: 9,  // Pieces
      J: 10, // CTS
      K: 11, // @ Rate
      L: 12, // Total
      M: 13, // Market CP
      N: 14, // Home CP
      O: 15, // SP for Market
      P: 16, // Spacer
      P: 16, // SP for market
      Q: 17, // Spacer
      R: 18  // Photo
    };

    ws.columns = [
      { key: 'A', width: 22 }, // S.No
      { key: 'B', width: 34 }, // Description
      { key: 'C', width: 15 }, // Date of MFG
      { key: 'D', width: 11 }, // Grading (karat)
      { key: 'E', width: 16 }, // Type
      { key: 'F', width: 14 }, // Gross WT
      { key: 'G', width: 14 }, // Net WT
      { key: 'H', width: 22 }, // Stone Description
      { key: 'I', width: 10 }, // Pieces
      { key: 'J', width: 10 }, // CTS
      { key: 'K', width: 14 }, // @ Rate
      { key: 'L', width: 15 }, // Total
      { key: 'M', width: 15 }, // market C.P
      { key: 'N', width: 15 }, // mfg cost
      { key: 'O', width: 15 }, // home C.P
      { key: 'P', width: 15 }, // SP for market
      { key: 'Q', width: 4 },  // Spacer
      { key: 'R', width: 24 }  // Photo
    ];

    const GLOBAL_WASTAGE = (filteredItems[0] ? Number(filteredItems[0].wastage || 15) : 15);
    const WASTAGE_FACTOR = 1 + GLOBAL_WASTAGE / 100;
    const GOLD_RATE_PER_10G = goldRate * 10;
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const goldDate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate : today;
    const goldDateFmt = goldDate ? new Date(goldDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : today;

    // Fills & Borders
    const FILL_GREY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    const FILL_ORANGE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
    const FILL_BLUE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };
    const BORDER_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
    const ALIGN_CENTER = { horizontal: 'center', vertical: 'middle' };
    const ALIGN_CENTER_WRAP = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // =========================================================
    //  Pre-header rows (Rows 1-5)
    // =========================================================
    // Row 1: Title
    ws.getCell('A1').value = 'MAVA GEMS — JEWELRY LATEST PRICE';
    ws.getCell('A1').font = { bold: true, size: 12, name: 'Calibri' };
    ws.getCell('A1').alignment = ALIGN_CENTER;
    ws.mergeCells('A1:C1');

    // Row 2: 24K anchor
    ws.getCell('A2').value = 'MTL 24K (10g)';
    ws.getCell('A2').font = { bold: true, size: 10, name: 'Calibri' };
    ws.getCell('A2').border = BORDER_ALL;
    ws.getCell('B2').value = GOLD_RATE_PER_10G;
    ws.getCell('B2').font = { size: 10, name: 'Calibri' };
    ws.getCell('B2').numFmt = '#,##0.00';
    ws.getCell('B2').alignment = ALIGN_CENTER;
    ws.getCell('B2').border = BORDER_ALL;
    ws.getCell('C2').value = goldDateFmt;
    ws.getCell('C2').font = { size: 10, name: 'Calibri' };
    ws.getCell('C2').alignment = ALIGN_CENTER;
    ws.getCell('C2').border = BORDER_ALL;

    // Row 3: Wastage multiplier
    ws.getCell('A3').value = 'wastage';
    ws.getCell('A3').font = { bold: true, size: 10, name: 'Calibri' };
    ws.getCell('A3').border = BORDER_ALL;
    ws.getCell('B3').value = WASTAGE_FACTOR;
    ws.getCell('B3').font = { size: 10, name: 'Calibri' };
    ws.getCell('B3').numFmt = '0.00';
    ws.getCell('B3').alignment = ALIGN_CENTER;
    ws.getCell('B3').border = BORDER_ALL;

    // Row 4-5: Legend
    ws.getCell('A4').value = 'To fill compulsory';
    ws.getCell('A4').font = { bold: true, size: 10, color: { argb: 'FFFF0000' }, name: 'Calibri' };
    ws.getCell('A4').border = BORDER_ALL;
    ws.getCell('B4').value = '';
    ws.getCell('B4').fill = FILL_ORANGE;
    ws.getCell('B4').border = BORDER_ALL;

    ws.getCell('A5').value = 'If required';
    ws.getCell('A5').font = { bold: true, size: 10, color: { argb: 'FF0000FF' }, name: 'Calibri' };
    ws.getCell('A5').border = BORDER_ALL;
    ws.getCell('B5').value = '';
    ws.getCell('B5').fill = FILL_BLUE;
    ws.getCell('B5').border = BORDER_ALL;

    // =========================================================
    //  Header Row (Row 7)
    // =========================================================
    const headers = [
      'S No.', 'Description', 'Date of MFG', 'Grading', 'Type',
      'Gross WT', 'Net WT', 'Stone Description', 'Pieces', 'CTS', '@', 'Total',
      'market C.P', 'mfg cost', 'home C.P', 'SP for market', '', 'Photo'
    ];
    const headerRow = ws.getRow(7);
    headerRow.height = 24;
    headers.forEach((h, idx) => {
      if (idx + 1 === C.Q) return; // leave spacer blank
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, name: 'Calibri' };
      cell.alignment = ALIGN_CENTER_WRAP;
      cell.fill = FILL_GREY;
      cell.border = BORDER_ALL;
    });

    // =========================================================
    //  Data Rows (Row 8+)
    // =========================================================
    let rowIdx = 8;
    let sNo = 1;

    filteredItems.forEach((item) => {
      const mainKarat = Number(item.karat || (item.metals && item.metals[0] ? item.metals[0].karat : 18));
      const totalGrossWt = Number(item.grossWeight || (item.metals && item.metals[0] ? item.metals[0].weight : 0));
      const labour = Number(item.labourCost || 0);
      const stones = item.stones || [];
      const diamonds = item.diamondsPolki || [];
      const wFactor = 1 + Number(item.wastage || GLOBAL_WASTAGE) / 100;

      // Format mfgDate
      let mfgDateStr = '';
      if (item.mfgDate) {
        const rawDate = String(item.mfgDate).trim();
        const parts = rawDate.split(/[-/.]/);
        if (parts.length === 3) {
          let d, m, y;
          if (parts[0].length === 4) {
            y = parts[0]; m = parts[1]; d = parts[2];
          } else {
            d = parts[0]; m = parts[1]; y = parts[2];
          }
          d = parseInt(d, 10);
          m = parseInt(m, 10);
          if (y.length === 4) y = y.slice(-2);
          mfgDateStr = `${d}.${m}.${y}`;
        } else {
          try {
            const dt = new Date(rawDate);
            mfgDateStr = `${dt.getDate()}.${dt.getMonth() + 1}.${String(dt.getFullYear()).slice(-2)}`;
          } catch (e) {
            mfgDateStr = String(rawDate);
          }
        }
      }

      const mtlR = rowIdx;
      ws.getRow(mtlR).height = 22;

      // MTL Row
      const cellA = ws.getCell(mtlR, C.A);
      cellA.value = sNo++;
      cellA.font = { bold: true, name: 'Calibri' };
      cellA.alignment = ALIGN_CENTER;
      cellA.border = BORDER_ALL;

      const cellB = ws.getCell(mtlR, C.B);
      cellB.value = item.name || 'Unnamed Piece';
      cellB.alignment = ALIGN_CENTER_WRAP;
      cellB.border = BORDER_ALL;

      const cellC = ws.getCell(mtlR, C.C);
      cellC.value = mfgDateStr;
      cellC.alignment = ALIGN_CENTER;
      cellC.border = BORDER_ALL;

      const cellD = ws.getCell(mtlR, C.D);
      cellD.value = mainKarat;
      cellD.numFmt = '0.00';
      cellD.fill = FILL_ORANGE;
      cellD.alignment = ALIGN_CENTER;
      cellD.border = BORDER_ALL;

      const cellE = ws.getCell(mtlR, C.E);
      cellE.value = 'MTL';
      cellE.alignment = ALIGN_CENTER;
      cellE.border = BORDER_ALL;

      const cellF = ws.getCell(mtlR, C.F);
      cellF.value = Number(totalGrossWt.toFixed(3));
      cellF.numFmt = '0.000';
      cellF.fill = FILL_ORANGE;
      cellF.alignment = ALIGN_CENTER;
      cellF.border = BORDER_ALL;

      const cellH = ws.getCell(mtlR, C.H);
      cellH.value = '';
      cellH.border = BORDER_ALL;

      const cellI = ws.getCell(mtlR, C.I);
      cellI.value = '';
      cellI.border = BORDER_ALL;

      const cellJ = ws.getCell(mtlR, C.J);
      cellJ.value = '-';
      cellJ.alignment = ALIGN_CENTER;
      cellJ.border = BORDER_ALL;

      const itemMfgRate24kt = Number(item.mfgGoldRate24kt || item.goldRateAtAddition || (goldRate ? goldRate * 10 / 10 : 0) || (GOLD_RATE_PER_10G / 10));
      const mfgKaratRate = Number(((itemMfgRate24kt / 24) * mainKarat).toFixed(2));

      const cellK = ws.getCell(mtlR, C.K);
      cellK.value = mfgKaratRate;
      cellK.numFmt = '#,##0.00';
      cellK.alignment = ALIGN_CENTER;
      cellK.border = BORDER_ALL;

      rowIdx++;

      // ===================== ADDITIONAL METAL ROWS =====================
      const addMtlRows = [];
      const additionalMetals = item.metals || [];

      additionalMetals.forEach((m) => {
        const aR = rowIdx;
        ws.getRow(aR).height = 22;
        const mKarat = Number(m.karat || mainKarat);
        const mWt = Number(Number(m.weight || 0).toFixed(3));
        const mName = m.name || 'Additional Metal';
        const hasDirectVal = (m.directValue !== undefined && m.directValue !== null && m.directValue !== '') ||
          (m.totalValue !== undefined && m.totalValue !== null && m.totalValue !== '');
        const directValNum = hasDirectVal ? Number(m.directValue || m.totalValue || 0) : 0;
        const mWastage = 1 + Number(m.wastage !== undefined && m.wastage !== null && m.wastage !== '' ? m.wastage : GLOBAL_WASTAGE) / 100;
        const mfgPartKaratRate = Number(((itemMfgRate24kt / 24) * mKarat).toFixed(2));

        ['A', 'B', 'C', 'M', 'N', 'O', 'P', 'R'].forEach(k => {
          const c = ws.getCell(aR, C[k]);
          c.border = { left: BORDER_THIN, right: BORDER_THIN };
        });

        const cD = ws.getCell(aR, C.D);
        cD.value = mKarat;
        cD.numFmt = '0.00';
        cD.fill = FILL_ORANGE;
        cD.alignment = ALIGN_CENTER;
        cD.border = BORDER_ALL;

        const cE = ws.getCell(aR, C.E);
        cE.value = mName;
        cE.alignment = ALIGN_CENTER_WRAP;
        cE.border = BORDER_ALL;

        const cF = ws.getCell(aR, C.F);
        cF.value = '-';
        cF.alignment = ALIGN_CENTER;
        cF.border = BORDER_ALL;

        const cG = ws.getCell(aR, C.G);
        cG.value = mWt;
        cG.numFmt = '0.000';
        cG.alignment = ALIGN_CENTER;
        cG.border = BORDER_ALL;

        const cH = ws.getCell(aR, C.H);
        cH.value = '';
        cH.border = BORDER_ALL;

        const cI = ws.getCell(aR, C.I);
        cI.value = '';
        cI.border = BORDER_ALL;

        const cJ = ws.getCell(aR, C.J);
        cJ.value = '-';
        cJ.alignment = ALIGN_CENTER;
        cJ.border = BORDER_ALL;

        const cK = ws.getCell(aR, C.K);
        if (hasDirectVal) {
          cK.value = '-';
          cK.alignment = ALIGN_CENTER;
          cK.border = BORDER_ALL;
        } else {
          cK.value = mfgPartKaratRate;
          cK.numFmt = '#,##0.00';
          cK.alignment = ALIGN_CENTER;
          cK.border = BORDER_ALL;
        }

        const cL = ws.getCell(aR, C.L);
        if (hasDirectVal) {
          cL.value = Number(directValNum.toFixed(2));
          cL.numFmt = '#,##0.00';
          cL.alignment = ALIGN_CENTER;
          cL.border = BORDER_ALL;
        } else {
          const calcVal = mWt * mWastage * mfgPartKaratRate;
          cL.value = {
            formula: `ROUND(${colLetter(C.G)}${aR}*${mWastage.toFixed(4)}*${colLetter(C.K)}${aR}, 2)`,
            result: Number(calcVal.toFixed(2))
          };
          cL.numFmt = '#,##0.00';
          cL.alignment = ALIGN_CENTER;
          cL.border = BORDER_ALL;
        }

        addMtlRows.push({
          rowExcel: aR,
          weight: mWt,
          karat: mKarat,
          hasDirectVal,
          wastageFactor: mWastage,
          totalRef: `${colLetter(C.L)}${aR}`,
          weightRef: `${colLetter(C.G)}${aR}`
        });

        rowIdx++;
      });

      // Stone/Diamond Rows
      const stoneRows = [];
      const allComps = [
        ...stones.map(s => ({ ...s, isDiamond: false })),
        ...diamonds.map(d => ({ ...d, isDiamond: true }))
      ];

      allComps.forEach(comp => {
        const cR = rowIdx;
        ws.getRow(cR).height = 22;
        const isEm = (comp.type || '').toLowerCase() === 'emerald';
        const cts = Number(Number(comp.weight || 0).toFixed(2));
        const rate = Number(Number(comp.ratePerCarat || 0).toFixed(2));
        const tv = Number(Number(comp.totalValue || cts * rate || 0).toFixed(2));

        ['A', 'B', 'C', 'M', 'N', 'O', 'P', 'R'].forEach(k => {
          const c = ws.getCell(cR, C[k]);
          c.border = { left: BORDER_THIN, right: BORDER_THIN };
        });

        const cE = ws.getCell(cR, C.E);
        cE.value = comp.type || 'stone';
        cE.alignment = ALIGN_CENTER_WRAP;
        cE.border = BORDER_ALL;

        const cF = ws.getCell(cR, C.F);
        cF.value = '-';
        cF.alignment = ALIGN_CENTER;
        cF.border = BORDER_ALL;

        const cG = ws.getCell(cR, C.G);
        cG.value = '-';
        cG.alignment = ALIGN_CENTER;
        cG.border = BORDER_ALL;

        const cH = ws.getCell(cR, C.H);
        cH.value = `${comp.shape || ''}`.trim();
        cH.alignment = ALIGN_CENTER;
        cH.border = BORDER_ALL;

        const cI = ws.getCell(cR, C.I);
        cI.value = comp.pieces || 0;
        cI.alignment = ALIGN_CENTER;
        cI.border = BORDER_ALL;

        const cJ = ws.getCell(cR, C.J);
        cJ.value = cts;
        cJ.numFmt = '0.00';
        cJ.fill = FILL_BLUE;
        cJ.alignment = ALIGN_CENTER;
        cJ.border = BORDER_ALL;

        const cK = ws.getCell(cR, C.K);
        cK.value = rate;
        cK.numFmt = '#,##0.00';
        cK.fill = FILL_BLUE;
        cK.alignment = ALIGN_CENTER;
        cK.border = BORDER_ALL;

        const cL = ws.getCell(cR, C.L);
        cL.value = {
          formula: `ROUND(${colLetter(C.J)}${cR}*${colLetter(C.K)}${cR}, 2)`,
          result: tv
        };
        cL.numFmt = '#,##0.00';
        cL.alignment = ALIGN_CENTER;
        cL.border = BORDER_ALL;

        stoneRows.push({ rowExcel: cR, cts, rate, totalVal: tv, isEmerald: isEm });
        rowIdx++;
      });

      // Labour Row
      const labR = rowIdx;
      ws.getRow(labR).height = 22;

      ['A', 'B', 'C', 'M', 'N', 'O', 'P', 'R'].forEach(k => {
        const c = ws.getCell(labR, C[k]);
        c.border = { left: BORDER_THIN, right: BORDER_THIN };
      });

      const labE = ws.getCell(labR, C.E);
      labE.value = 'labour';
      labE.alignment = ALIGN_CENTER_WRAP;
      labE.border = BORDER_ALL;

      const labF = ws.getCell(labR, C.F);
      labF.value = Number(labour.toFixed(2));
      labF.numFmt = '#,##0.00';
      labF.alignment = ALIGN_CENTER;
      labF.border = BORDER_ALL;

      for (let ci = C.G; ci <= C.L; ci++) {
        ws.getCell(labR, ci).border = { top: BORDER_THIN, bottom: BORDER_THIN };
      }
      ws.getCell(labR, C.L).border = { top: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

      rowIdx++;

      // TK Commission Row
      const commR = rowIdx;
      ws.getRow(commR).height = 22;

      ['A', 'B', 'C', 'M', 'N', 'O', 'P', 'R'].forEach(k => {
        const c = ws.getCell(commR, C[k]);
        c.border = { bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
      });

      const commE = ws.getCell(commR, C.E);
      commE.value = 'tk commission';
      commE.alignment = ALIGN_CENTER_WRAP;
      commE.border = BORDER_ALL;

      // TK Commission value directly as a number (no formula / no rates tk sheet)
      const commResult = Calc.calculateCommission(item.evaluation.subtotal, item.commission);
      let commVal = 0;
      if (item.commission && item.commission.value !== undefined && item.commission.value !== null) {
        commVal = Number(item.commission.value);
      } else if (commResult && typeof commResult === 'object') {
        commVal = Number(commResult.value || 0);
      } else {
        commVal = Number(commResult || 0);
      }

      const commF = ws.getCell(commR, C.F);
      commF.value = Number(Number(commVal || 0).toFixed(2));
      commF.numFmt = '#,##0.00';
      commF.alignment = ALIGN_CENTER;
      commF.border = BORDER_ALL;

      for (let ci = C.G; ci <= C.L; ci++) {
        ws.getCell(commR, ci).border = { top: BORDER_THIN, bottom: BORDER_THIN };
      }
      ws.getCell(commR, C.L).border = { top: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

      rowIdx++;

      // Deferred MTL Calculations
      const totalStoneCTS = stoneRows.reduce((acc, s) => acc + s.cts, 0);
      const netMetalsResult = Calc.getNetMetals(item);
      const mainNetPiece = Array.isArray(netMetalsResult) ? netMetalsResult.find(m => m.isMain) : null;
      const netWt = mainNetPiece ? mainNetPiece.netWeight : Math.max(0, totalGrossWt - (totalStoneCTS * 0.2) - addMtlRows.reduce((s, m) => s + m.weight, 0));

      const stoneJCells = stoneRows.map(s => `${colLetter(C.J)}${s.rowExcel}`).join('+');
      const addMtlGCells = addMtlRows.map(m => m.weightRef).join('+');

      let netWtFormula = `${colLetter(C.F)}${mtlR}`;
      if (stoneJCells.length > 0 && addMtlGCells.length > 0) {
        netWtFormula = `ROUND(${colLetter(C.F)}${mtlR}-((${stoneJCells})/5)-(${addMtlGCells}), 3)`;
      } else if (stoneJCells.length > 0) {
        netWtFormula = `ROUND(${colLetter(C.F)}${mtlR}-((${stoneJCells})/5), 3)`;
      } else if (addMtlGCells.length > 0) {
        netWtFormula = `ROUND(${colLetter(C.F)}${mtlR}-(${addMtlGCells}), 3)`;
      } else {
        netWtFormula = `ROUND(${colLetter(C.F)}${mtlR}, 3)`;
      }

      const cellG = ws.getCell(mtlR, C.G);
      cellG.value = {
        formula: netWtFormula,
        result: Number(netWt.toFixed(3))
      };
      cellG.numFmt = '0.000';
      cellG.alignment = ALIGN_CENTER;
      cellG.border = BORDER_ALL;

      const mfgMetalTotal = netWt * wFactor * mfgKaratRate;
      const cellL = ws.getCell(mtlR, C.L);
      cellL.value = {
        formula: `ROUND(${colLetter(C.G)}${mtlR}*${wFactor.toFixed(4)}*${colLetter(C.K)}${mtlR}, 2)`,
        result: Number(mfgMetalTotal.toFixed(2))
      };
      cellL.numFmt = '#,##0.00';
      cellL.alignment = ALIGN_CENTER;
      cellL.border = BORDER_ALL;

      const lRefs = [
        `${colLetter(C.L)}${mtlR}`,
        ...addMtlRows.map(m => m.totalRef),
        ...stoneRows.map(s => `${colLetter(C.L)}${s.rowExcel}`)
      ];
      const labFRef = `${colLetter(C.F)}${labR}`;
      const commFRef = `${colLetter(C.F)}${commR}`;
      const emeraldLRefs = stoneRows.filter(s => s.isEmerald).map(s => `${colLetter(C.L)}${s.rowExcel}`);
      const nonEmeraldLRefs = [
        `${colLetter(C.L)}${mtlR}`,
        ...addMtlRows.map(m => m.totalRef),
        ...stoneRows.filter(s => !s.isEmerald).map(s => `${colLetter(C.L)}${s.rowExcel}`)
      ];

      // =========================================================
      //  Column M: Market Cost Price (Uses Global 24K Rate in $B$2)
      // =========================================================
      const stoneAndDirectRefs = [
        ...addMtlRows.filter(m => m.hasDirectVal).map(m => m.totalRef),
        ...stoneRows.map(s => `${colLetter(C.L)}${s.rowExcel}`),
        labFRef,
        commFRef
      ];
      const dynamicMetalMarketFormulas = [
        `(${colLetter(C.G)}${mtlR}*${wFactor.toFixed(4)}*($B$2/240)*${colLetter(C.D)}${mtlR})`,
        ...addMtlRows.filter(m => !m.hasDirectVal).map(m => `(${m.weightRef}*${m.wastageFactor.toFixed(4)}*($B$2/240)*${colLetter(C.D)}${m.rowExcel})`)
      ];

      const marketCPFormula = stoneAndDirectRefs.length > 0
        ? `ROUND(SUM(${stoneAndDirectRefs.join(',')})+${dynamicMetalMarketFormulas.join('+')}, 2)`
        : `ROUND(${dynamicMetalMarketFormulas.join('+')}, 2)`;

      const cellM = ws.getCell(mtlR, C.M);
      cellM.value = {
        formula: marketCPFormula,
        result: Number(item.evaluation.marketCostPrice.toFixed(2))
      };
      cellM.numFmt = '#,##0.00';
      cellM.alignment = ALIGN_CENTER;
      cellM.border = BORDER_ALL;

      // =========================================================
      //  Column N: Manufacturing Cost (mfg cost = sum of Col L + Labour + Commission)
      // =========================================================
      const cellN = ws.getCell(mtlR, C.N);
      const mfgCostFormula = `ROUND(SUM(${lRefs.join(',')},${labFRef},${commFRef}), 2)`;
      const mfgCostVal = (item.evaluation.mfgGrandTotal || (item.evaluation.mfgSubtotal + (item.evaluation.commissionValue || 0)) || item.evaluation.homeCostPrice);
      cellN.value = {
        formula: mfgCostFormula,
        result: Number(mfgCostVal.toFixed(2))
      };
      cellN.numFmt = '#,##0.00';
      cellN.alignment = ALIGN_CENTER;
      cellN.border = BORDER_ALL;

      // =========================================================
      //  Column O: Home Cost Price (Uses Global Gold Rate via Market CP + 50% Emerald discount)
      // =========================================================
      const cellO = ws.getCell(mtlR, C.O);
      if (emeraldLRefs.length > 0) {
        const emSum = emeraldLRefs.join('+');
        cellO.value = {
          formula: `ROUND(${colLetter(C.M)}${mtlR}-(${emSum})*0.5, 2)`,
          result: Number(item.evaluation.homeCostPrice.toFixed(2))
        };
      } else {
        cellO.value = {
          formula: `ROUND(${colLetter(C.M)}${mtlR}, 2)`,
          result: Number(item.evaluation.homeCostPrice.toFixed(2))
        };
      }
      cellO.numFmt = '#,##0.00';
      cellO.alignment = ALIGN_CENTER;
      cellO.border = BORDER_ALL;

      // =========================================================
      //  Column P: SP for Market (1.4x markup on Market CP non-emeralds + Emeralds)
      // =========================================================
      const cellP = ws.getCell(mtlR, C.P);
      if (emeraldLRefs.length > 0) {
        const emSum = emeraldLRefs.join('+');
        cellP.value = {
          formula: `ROUND(((${colLetter(C.M)}${mtlR}-(${emSum}))*1.4)+(${emSum}), 2)`,
          result: Number(item.evaluation.sellingPrice.toFixed(2))
        };
      } else {
        cellP.value = {
          formula: `ROUND(${colLetter(C.M)}${mtlR}*1.4, 2)`,
          result: Number(item.evaluation.sellingPrice.toFixed(2))
        };
      }
      cellP.numFmt = '#,##0.00';
      cellP.alignment = ALIGN_CENTER;
      cellP.border = BORDER_ALL;

      // =========================================================
      //  Merges for Item Block
      // =========================================================
      // Merge Labour across Columns F to L
      ws.mergeCells(labR, C.F, labR, C.L);

      // Merge Commission across Columns F to L
      ws.mergeCells(commR, C.F, commR, C.L);

      // Vertical item block merges
      if (commR > mtlR) {
        ws.mergeCells(mtlR, C.A, commR, C.A); // S No.
        ws.mergeCells(mtlR, C.B, commR, C.B); // Description
        ws.mergeCells(mtlR, C.C, commR, C.C); // Date of MFG
        ws.mergeCells(mtlR, C.M, commR, C.M); // market C.P
        ws.mergeCells(mtlR, C.N, commR, C.N); // mfg cost
        ws.mergeCells(mtlR, C.O, commR, C.O); // home C.P
        ws.mergeCells(mtlR, C.P, commR, C.P); // SP for market
        ws.mergeCells(mtlR, C.R, commR, C.R); // Column R: Photo across item rows
      }

      // Column R Photo Embedding
      for (let r = mtlR; r <= commR; r++) {
        const rCell = ws.getCell(r, C.R);
        rCell.border = BORDER_ALL;
        rCell.alignment = ALIGN_CENTER;
      }

      if (item.image && typeof item.image === 'string' && item.image.length > 50) {
        try {
          const base64Data = item.image.includes(',') ? item.image.split(',')[1] : item.image;
          const isPng = item.image.includes('png') || item.image.includes('PNG');
          const imgId = wb.addImage({
            base64: base64Data,
            extension: isPng ? 'png' : 'jpeg'
          });
          ws.addImage(imgId, {
            tl: { col: 17, row: mtlR - 1 },
            br: { col: 18, row: commR },
            editAs: 'twoCell'
          });
        } catch (imgErr) {
          console.warn('Could not embed image in Excel for item:', item.sku, imgErr);
          ws.getCell(mtlR, C.R).value = 'No Photo';
          ws.getCell(mtlR, C.R).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
        }
      } else {
        ws.getCell(mtlR, C.R).value = 'No Photo';
        ws.getCell(mtlR, C.R).font = { italic: true, size: 9, color: { argb: 'FF888888' } };
      }

      // Blank gap row between items
      rowIdx++;
    });

    // Grand Total Row
    const grandRow = rowIdx;
    ws.getRow(grandRow).height = 24;
    const firstItemRow = 8;
    const lastItemRow = Math.max(firstItemRow, grandRow - 1);

    const totalMarketCP = filteredItems.reduce((acc, i) => acc + (i.evaluation ? i.evaluation.marketCostPrice : 0), 0);
    const totalMfgCost = filteredItems.reduce((acc, i) => acc + (i.evaluation ? (i.evaluation.mfgGrandTotal || (i.evaluation.mfgSubtotal + (i.evaluation.commissionValue || 0)) || i.evaluation.homeCostPrice) : 0), 0);
    const totalHomeCP = filteredItems.reduce((acc, i) => acc + (i.evaluation ? i.evaluation.homeCostPrice : 0), 0);
    const totalSellingPrice = filteredItems.reduce((acc, i) => acc + (i.evaluation ? i.evaluation.sellingPrice : 0), 0);

    const gtA = ws.getCell(grandRow, C.A);
    gtA.value = 'GRAND TOTAL';
    gtA.font = { bold: true, name: 'Calibri' };
    gtA.border = BORDER_ALL;

    const gtB = ws.getCell(grandRow, C.B);
    gtB.value = filteredItems.length;
    gtB.font = { bold: true, name: 'Calibri' };
    gtB.border = BORDER_ALL;

    const gtC = ws.getCell(grandRow, C.C);
    gtC.value = 'pieces';
    gtC.font = { bold: true, name: 'Calibri' };
    gtC.border = BORDER_ALL;

    const gtM = ws.getCell(grandRow, C.M);
    gtM.value = {
      formula: `ROUND(SUM(${colLetter(C.M)}${firstItemRow}:${colLetter(C.M)}${lastItemRow}), 2)`,
      result: Number(totalMarketCP.toFixed(2))
    };
    gtM.font = { bold: true, name: 'Calibri' };
    gtM.numFmt = '#,##0.00';
    gtM.border = BORDER_ALL;

    const gtN = ws.getCell(grandRow, C.N);
    gtN.value = {
      formula: `ROUND(SUM(${colLetter(C.N)}${firstItemRow}:${colLetter(C.N)}${lastItemRow}), 2)`,
      result: Number(totalMfgCost.toFixed(2))
    };
    gtN.font = { bold: true, name: 'Calibri' };
    gtN.numFmt = '#,##0.00';
    gtN.border = BORDER_ALL;

    const gtO = ws.getCell(grandRow, C.O);
    gtO.value = {
      formula: `ROUND(SUM(${colLetter(C.O)}${firstItemRow}:${colLetter(C.O)}${lastItemRow}), 2)`,
      result: Number(totalHomeCP.toFixed(2))
    };
    gtO.font = { bold: true, name: 'Calibri' };
    gtO.numFmt = '#,##0.00';
    gtO.border = BORDER_ALL;

    const gtP = ws.getCell(grandRow, C.P);
    gtP.value = {
      formula: `ROUND(SUM(${colLetter(C.P)}${firstItemRow}:${colLetter(C.P)}${lastItemRow}), 2)`,
      result: Number(totalSellingPrice.toFixed(2))
    };
    gtP.font = { bold: true, name: 'Calibri' };
    gtP.numFmt = '#,##0.00';
    gtP.border = BORDER_ALL;

    const buffer = await wb.xlsx.writeBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
      if (s.includes('polki')) return 'Polki';
      if (s.includes('dia') || s.includes('diamond')) return 'Diamond';
      if (s.includes('emd') || s.includes('emerald')) return 'Emerald';
      if (s.includes('ruby') || s.includes('rub')) return 'Ruby';
      if (s.includes('sapphire') || s.includes('sapp')) return 'Sapphire';
      if (s.includes('pearl')) return 'Pearl';
      if (s.includes('tsav') || s.includes('tsavorite')) return 'Tsavorite';
      if (s.includes('spessartite') || s.includes('garnet')) return 'Garnet';
      if (s.includes('amethyst') || s.includes('ame')) return 'Amethyst';
      if (s.includes('tanzanite') || s.includes('tanz')) return 'Tanzanite';
      if (s.includes('citrine')) return 'Citrine';
      if (s.includes('topaz')) return 'Topaz';
      if (s.includes('aqua') || s.includes('aquamarine')) return 'Aquamarine';
      if (s.includes('tourmaline') || s.includes('tour')) return 'Tourmaline';
      return 'Other Stone';
    };

    // ── Stone-shape helper ─────────────────────────────────────────────────────
    const getStoneShape = (str) => {
      const s = String(str).toLowerCase();
      if (s.includes('round') || s.includes('rd') || s.includes(' r ')) return 'Round';
      if (s.includes('oval') || s.includes('ov')) return 'Oval';
      if (s.includes('pear') || s.includes('drop')) return 'Pear';
      if (s.includes('cushion') || s.includes('cush')) return 'Cushion';
      if (s.includes('princess') || s.includes('sq')) return 'Princess';
      if (s.includes('emerald cut') || s.includes('emcut')) return 'Emerald Cut';
      if (s.includes('marquise') || s.includes('mq') || s.includes('nav')) return 'Marquise';
      if (s.includes('heart')) return 'Heart';
      if (s.includes('trillion') || s.includes('tri')) return 'Trillion';
      if (s.includes('baguette') || s.includes('bag')) return 'Baguette';
      if (s.includes('asscher')) return 'Asscher';
      if (s.includes('radiant')) return 'Radiant';
      if (s.includes('half moon') || s.includes('halfmoon')) return 'Half Moon';
      if (s.includes('cab') || s.includes('cabochon')) return 'Cabochon';
      return 'Mixed';
    };

    // ── Category helper ────────────────────────────────────────────────────────
    const guessCategory = (name) => {
      const s = String(name).toLowerCase();
      if (s.includes('earring') || s.includes('ear ring') || s.includes('jhumka') || s.includes('stud') || s.includes('huggies') || s.includes('hoop')) return 'Earrings';
      if (s.includes('ring') || s.includes('band') || s.includes('solitaire')) return 'Rings';
      if (s.includes('pendant') || s.includes('locket')) return 'Pendants';
      if (s.includes('necklace') || s.includes('haar') || s.includes('har')) return 'Necklaces';
      if (s.includes('bracelet') || s.includes('bangle') || s.includes('kada')) return 'Bracelets';
      if (s.includes('set')) return 'Necklaces'; // bridal sets
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
    let headerRowIdx = -1;
    let sheetGoldRate = settingsGoldRate;   // per gram — extracted from row 1
    let sheetWastage = 15;                 // % — extracted from row 2

    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = rows[r];
      const col0 = String(row[0] || '').toLowerCase().trim();
      const col1 = String(row[1] || '').toLowerCase().trim();
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
        headerRowIdx = r;
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
            tempId: 'imp_' + parsed.length + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name: col1 || `Jewelry Piece #${sNoNum}`,
            sku: String(sNoNum),   // sequence from Excel — will be replaced by category SKU on import
            category: guessCategory(col1),
            description: col1 + (col2 ? ` (MFG: ${col2})` : ''),
            mfgDate: col2 || '',
            metals: [{
              name: 'Body Component',
              karat: karat,
              weight: col5  // col5 = Gross WT on the MTL row
            }],
            stones: [],
            diamondsPolki: [],
            labourCost: 0,
            wastage: sheetWastage,
            profitPercentage: 40,
            goldRateAtAddition: goldRateToUse,
            commission: { value: 0, isManual: false },
            grossWt: col5,
            netWt: col6
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
              currentItem.commission.value = parseFloat(col5.toFixed(2));
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
            const stoneType = getStoneType(col4);
            const stoneShape = getStoneShape(col4);
            const wt = col7;    // carats (2dp)
            const rate = col8;    // @ per carat
            // Use stored total if available; otherwise compute from wt × rate
            const val = col9 > 0
              ? col9
              : (wt > 0 && rate > 0 ? parseFloat((wt * rate).toFixed(2)) : 0);

            if (wt > 0) {
              const comp = {
                type: stoneType,
                shape: stoneShape,
                pieces: 1,
                weight: wt,
                ratePerCarat: rate,
                totalValue: val
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
          if (cell.includes('name') || cell.includes('desc') || cell.includes('title')) colMap.name = ci;
          if ((cell.includes('sku') || cell.includes('s.no') || cell.includes('code')) && colMap.sku === -1) colMap.sku = ci;
          if (cell.includes('cat')) colMap.category = ci;
          if ((cell.includes('karat') || (cell.includes('kt') && !cell.includes('stock'))) && colMap.karat === -1) colMap.karat = ci;
          if ((cell.includes('gross') || cell === 'gr wt') && colMap.gross === -1) colMap.gross = ci;
          if ((cell.includes('net wt') || cell === 'net') && colMap.net === -1) colMap.net = ci;
          if ((cell.includes('cts') || cell.includes('carat') || cell.includes('stone wt')) && colMap.stoneCts === -1) colMap.stoneCts = ci;
          if ((cell.includes('pcs') || cell.includes('pieces')) && colMap.stonePcs === -1) colMap.stonePcs = ci;
          if ((cell === '@' || cell.includes('rate') || cell.includes('@ rate')) && colMap.stoneRate === -1) colMap.stoneRate = ci;
          if ((cell.includes('stone desc') || cell.includes('stone type')) && colMap.stoneDesc === -1) colMap.stoneDesc = ci;
          if ((cell.includes('labour') || cell.includes('making')) && colMap.labour === -1) colMap.labour = ci;
          if (cell.includes('wastage') && colMap.wastage === -1) colMap.wastage = ci;
        });

        if (colMap.name !== -1 || colMap.gross !== -1 || colMap.sku !== -1) {
          headerIdx = r;
          break;
        }
      }

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const nameVal = colMap.name !== -1 ? String(row[colMap.name] || '').trim() : '';
        const grossVal = colMap.gross !== -1 ? goldWt(row[colMap.gross]) : 0;
        const netVal = colMap.net !== -1 ? goldWt(row[colMap.net]) : 0;

        if (!nameVal && grossVal === 0 && netVal === 0) continue;

        const skuVal = colMap.sku !== -1 ? String(row[colMap.sku] || '').trim() : '';
        const karatVal = colMap.karat !== -1 ? num(row[colMap.karat]) : 18;
        const catVal = colMap.category !== -1 ? String(row[colMap.category] || '').trim() : '';
        const labourVal = colMap.labour !== -1 ? parseFloat(num(row[colMap.labour]).toFixed(2)) : 0;
        const wastageVal = colMap.wastage !== -1 ? num(row[colMap.wastage]) : sheetWastage;
        const stoneCts = colMap.stoneCts !== -1 ? stoneWt(row[colMap.stoneCts]) : 0;
        const stonePcs = colMap.stonePcs !== -1 ? Math.round(num(row[colMap.stonePcs])) : 0;
        const stoneRate = colMap.stoneRate !== -1 ? parseFloat(num(row[colMap.stoneRate]).toFixed(2)) : 0;
        const stoneDescVal = colMap.stoneDesc !== -1 ? String(row[colMap.stoneDesc] || '').trim() : '';

        const effWastage = wastageVal > 1 ? parseFloat(((wastageVal - 1) * 100).toFixed(1)) : wastageVal;

        const item = {
          tempId: 'imp_' + parsed.length + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          name: nameVal || `Jewelry Item #${parsed.length + 1}`,
          sku: skuVal,
          category: catVal || guessCategory(nameVal),
          description: nameVal,
          metals: [{
            name: 'Body Component',
            karat: karatVal || 18,
            weight: grossVal || netVal || 0
          }],
          stones: [],
          diamondsPolki: [],
          labourCost: labourVal,
          wastage: effWastage || sheetWastage,
          profitPercentage: 40,
          goldRateAtAddition: goldRateToUse,
          commission: { value: 0, isManual: false },
          grossWt: grossVal,
          netWt: netVal
        };

        if (stoneCts > 0) {
          const stoneSource = stoneDescVal || nameVal;
          const stoneType = getStoneType(stoneSource);
          const stoneShape = getStoneShape(stoneSource);
          const effRate = stoneRate > 0 ? stoneRate : 0;
          const stoneComp = {
            type: stoneType,
            shape: stoneShape,
            pieces: stonePcs || 1,
            weight: stoneCts,
            ratePerCarat: effRate,
            totalValue: parseFloat((stoneCts * effRate).toFixed(2))
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
      'Earrings': 'EAR-',
      'Rings': 'RNG-',
      'Necklaces': 'NCK-',
      'Bracelets': 'BRC-',
      'Pendants': 'PND-',
      'Other': 'JWL-'
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

    const btnSlideshowExportPdf = document.getElementById('btn-slideshow-export-pdf');
    if (btnSlideshowExportPdf) {
      btnSlideshowExportPdf.addEventListener('click', () => this.exportPresentationPdf());
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
        const serialNumber = item.sno || this.getItemSno(item);
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

  async prepareImageForPdf(imgSrc) {
    if (!imgSrc || typeof imgSrc !== 'string') return null;

    // Direct clean PNG or JPEG data URI
    if (imgSrc.startsWith('data:image/jpeg') || imgSrc.startsWith('data:image/png')) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            data: imgSrc,
            format: imgSrc.startsWith('data:image/png') ? 'PNG' : 'JPEG',
            width: img.naturalWidth || img.width || 400,
            height: img.naturalHeight || img.height || 400,
            aspect: (img.naturalWidth || img.width || 400) / (img.naturalHeight || img.height || 400)
          });
        };
        img.onerror = () => resolve(null);
        img.src = imgSrc;
      });
    }

    // Convert other formats (e.g. WebP, Blob, local URL) via off-screen canvas
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width || 500;
            const h = img.naturalHeight || img.height || 500;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const jpegData = canvas.toDataURL('image/jpeg', 0.92);
            resolve({
              data: jpegData,
              format: 'JPEG',
              width: w,
              height: h,
              aspect: w / h
            });
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = imgSrc;
      } catch (e) {
        resolve(null);
      }
    });
  },

  async exportPresentationPdf() {
    // 1. Gather configuration parameters (prefer active modal inputs, fallback to slideshow state)
    const titleInput = document.getElementById('presentation-title');
    const priceModeInput = document.getElementById('presentation-price-mode');
    const multiplierInput = document.getElementById('presentation-price-multiplier');
    const themeInput = document.getElementById('presentation-theme');

    const title = (titleInput?.value || '').trim() || this.slideshowState?.title || 'Jewelry Collection Showcase';
    const priceMode = priceModeInput?.value || this.slideshowState?.priceMode || 'selling';
    const multiplier = parseFloat(multiplierInput?.value || this.slideshowState?.multiplier || 1.0) || 1.0;
    const theme = themeInput?.value || this.slideshowState?.theme || 'gold';

    // 2. Identify and prepare items
    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    let selectedItems = (this.slideshowState && this.slideshowState.items && this.slideshowState.items.length > 0)
      ? this.slideshowState.items
      : DBManager.getItems().filter(item => this.selectedItemIds.has(item.id));

    if (!selectedItems || selectedItems.length === 0) {
      UI.showToast("Please select at least one jewelry item to export presentation.", true);
      return;
    }

    // Ensure evaluations are computed for all items
    selectedItems.forEach(item => {
      item.evaluation = item.evaluation || Calc.evaluateItem(item, goldRate);
    });

    UI.showToast("Generating luxury presentation PDF...", false);

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Theme color palette definitions
      const themes = {
        gold: {
          headerBg: [18, 14, 9],
          headerGold: [212, 175, 55],
          accentColor: [184, 134, 11],
          cardBg: [253, 252, 250],
          cardBorder: [225, 218, 204],
          boxBg: [247, 244, 238],
          badgeBg: [242, 235, 220],
          badgeText: [140, 100, 20],
          priceBg: [254, 251, 242],
          priceBorder: [220, 185, 110],
          priceText: [150, 105, 10]
        },
        emerald: {
          headerBg: [6, 28, 18],
          headerGold: [46, 204, 113],
          accentColor: [27, 94, 32],
          cardBg: [250, 253, 251],
          cardBorder: [210, 232, 218],
          boxBg: [240, 248, 243],
          badgeBg: [224, 242, 230],
          badgeText: [20, 100, 45],
          priceBg: [242, 252, 245],
          priceBorder: [130, 200, 155],
          priceText: [20, 110, 48]
        },
        ivory: {
          headerBg: [36, 36, 36],
          headerGold: [205, 165, 90],
          accentColor: [50, 50, 50],
          cardBg: [255, 255, 255],
          cardBorder: [225, 225, 225],
          boxBg: [248, 248, 248],
          badgeBg: [240, 240, 240],
          badgeText: [60, 60, 60],
          priceBg: [250, 249, 246],
          priceBorder: [210, 195, 170],
          priceText: [140, 100, 30]
        }
      };

      const pal = themes[theme] || themes.gold;
      const totalItems = selectedItems.length;
      const itemsPerPage = 2;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      // Helper function to draw top header on a given page
      const drawHeader = (pageNum) => {
        if (pageNum === 1) {
          // Page 1 Luxury Ribbon Header (Height = 34mm)
          doc.setFillColor(...pal.headerBg);
          doc.rect(0, 0, 210, 34, 'F');

          // Top thin accent band
          doc.setFillColor(...pal.headerGold);
          doc.rect(0, 0, 210, 1.5, 'F');

          // Bottom gold accent line
          doc.setFillColor(...pal.headerGold);
          doc.rect(0, 33.3, 210, 0.7, 'F');

          // Brand Title
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.setTextColor(...pal.headerGold);
          doc.text("MAVA GEMS", 12, 13);

          // Presentation Title / Client Showcase
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(255, 255, 255);
          doc.text(title, 12, 21);

          // Subtitle Metadata Row
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(195, 195, 195);
          const goldRateStr = goldRate > 0 ? `  |  Gold Reference: ₹${goldRate.toLocaleString('en-IN')}/g (24KT)` : '';
          doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}  |  Collection: ${totalItems} Piece(s)${goldRateStr}`, 12, 28);

          // Right luxury pill badge
          doc.setFillColor(255, 255, 255, 0.12);
          doc.setDrawColor(...pal.headerGold);
          doc.setLineWidth(0.3);
          doc.roundedRect(154, 9, 44, 7, 1.5, 1.5, 'FD');
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(...pal.headerGold);
          doc.text("CURATED PORTFOLIO", 176, 13.8, { align: 'center' });

        } else {
          // Compact Header for Page 2+ (Height = 18mm)
          doc.setFillColor(...pal.headerBg);
          doc.rect(0, 0, 210, 18, 'F');

          doc.setFillColor(...pal.headerGold);
          doc.rect(0, 0, 210, 1, 'F');
          doc.rect(0, 17.4, 210, 0.6, 'F');

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(...pal.headerGold);
          doc.text(`MAVA GEMS \u2014 ${title}`, 12, 11);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(190, 190, 190);
          doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 198, 11, { align: 'right' });
        }
      };

      // Helper function to draw bottom footer on each page
      const drawFooter = (pageNum, totalPg) => {
        doc.setDrawColor(215, 208, 195);
        doc.setLineWidth(0.3);
        doc.line(12, 284, 198, 284);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 130);
        doc.text("MAVA GEMS \u2022 HIGH JEWELLERY & GEMSTONES", 12, 289);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(150, 150, 150);
        doc.text("CONFIDENTIAL \u2022 PREPARED FOR CLIENT PRESENTATION", 105, 289, { align: 'center' });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(110, 110, 110);
        doc.text(`Page ${pageNum} of ${totalPg}`, 198, 289, { align: 'right' });
      };

      // 3. Render Cards Page by Page (2 cards per page)
      for (let p = 0; p < totalPages; p++) {
        if (p > 0) {
          doc.addPage();
        }

        const pageNum = p + 1;
        drawHeader(pageNum);

        const card1Index = p * 2;
        const card2Index = card1Index + 1;
        const pageItemIndices = [card1Index];
        if (card2Index < totalItems) pageItemIndices.push(card2Index);

        for (let slot = 0; slot < pageItemIndices.length; slot++) {
          const itemIdx = pageItemIndices[slot];
          const item = selectedItems[itemIdx];
          const evalRes = item.evaluation || Calc.evaluateItem(item, goldRate);

          // Card vertical position
          const cardX = 12;
          const cardY = pageNum === 1
            ? (slot === 0 ? 38 : 160)
            : (slot === 0 ? 24 : 146);
          const cardW = 186;
          const cardH = 115;

          // Outer Card Frame
          doc.setFillColor(...pal.cardBg);
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.4);
          doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'FD');

          // Left Image Container
          const imgBoxX = cardX + 5;
          const imgBoxY = cardY + 5;
          const imgBoxW = 62;
          const imgBoxH = 83;

          doc.setFillColor(...pal.boxBg);
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.3);
          doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 2, 2, 'FD');

          // Render Image
          let imgRendered = false;
          if (item.image) {
            try {
              const prep = await this.prepareImageForPdf(item.image);
              if (prep && prep.data) {
                const maxW = imgBoxW - 4;
                const maxH = imgBoxH - 4;
                let targetW = maxW;
                let targetH = maxW / (prep.aspect || 1.0);

                if (targetH > maxH) {
                  targetH = maxH;
                  targetW = maxH * (prep.aspect || 1.0);
                }

                const posX = imgBoxX + (imgBoxW - targetW) / 2;
                const posY = imgBoxY + (imgBoxH - targetH) / 2;

                doc.addImage(prep.data, prep.format, posX, posY, targetW, targetH);
                imgRendered = true;
              }
            } catch (imgErr) {
              console.warn("PDF image render warning:", imgErr);
            }
          }

          if (!imgRendered) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(170, 170, 170);
            doc.text("EXQUISITE JEWELRY", imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 - 2, { align: 'center' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(190, 190, 190);
            doc.text("[ No Photograph ]", imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 + 4, { align: 'center' });
          }

          // Badges below photo
          const serialNumber = item.sno || this.getItemSno(item);
          const badgeY = cardY + 91;

          // S.No Badge
          doc.setFillColor(...pal.badgeBg);
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.2);
          doc.roundedRect(imgBoxX, badgeY, 27, 7.5, 1.5, 1.5, 'FD');
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...pal.badgeText);
          doc.text(`S.No: ${serialNumber}`, imgBoxX + 13.5, badgeY + 5.2, { align: 'center' });

          // Category Badge
          const catName = (item.category || 'Jewelry').toUpperCase();
          doc.setFillColor(...pal.badgeBg);
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.2);
          doc.roundedRect(imgBoxX + 29, badgeY, 33, 7.5, 1.5, 1.5, 'FD');
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...pal.badgeText);
          doc.text(catName.substring(0, 11), imgBoxX + 29 + 16.5, badgeY + 5.2, { align: 'center' });

          // Right Column: Details & Specs
          const infoX = cardX + 72;
          const infoW = 109;

          // SKU pill / subline
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(...pal.accentColor);
          doc.text(`SKU: ${item.sku || 'N/A'}`, infoX, cardY + 9);

          // Item Name
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(25, 25, 25);
          const titleLines = doc.splitTextToSize(item.name || 'Jewelry Piece', infoW);
          doc.text(titleLines[0], infoX, cardY + 16);

          // Divider Line
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.3);
          doc.line(infoX, cardY + 19.5, infoX + infoW, cardY + 19.5);

          // Specifications Box
          const specBoxY = cardY + 22.5;
          const specBoxH = 57;

          doc.setFillColor(...pal.boxBg);
          doc.setDrawColor(...pal.cardBorder);
          doc.setLineWidth(0.3);
          doc.roundedRect(infoX, specBoxY, infoW, specBoxH, 2, 2, 'FD');

          // Metal string
          const netMetals = Calc.getNetMetals(item);
          const uniqueKarats = [...new Set(netMetals.map(m => `${m.karat}KT`))];
          const metalsStr = uniqueKarats.length > 0 ? `${uniqueKarats.join(', ')} Gold` : (item.karat ? `${item.karat}KT Gold` : '18KT Gold');
          const grossVal = (evalRes?.totalGrossWeight || item.grossWeight || (item.metals || []).reduce((s, m) => s + Number(m.weight || 0), 0)).toFixed(3);
          const netVal = (evalRes?.totalNetMetalWeight || 0).toFixed(3);

          // Stones string
          const allStones = [...(item.stones || []), ...(item.diamondsPolki || [])];
          const totalStoneCts = allStones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
          const stoneDetailStr = allStones.length > 0
            ? allStones.map(s => `${s.type || 'Stone'} (${(s.weight || 0).toFixed(2)}ct)`).join(', ')
            : 'None';

          let specTextY = specBoxY + 7;

          // Metal Row
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(40, 40, 40);
          doc.text("Metal / Purity:", infoX + 3.5, specTextY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(70, 70, 70);
          doc.text(`${metalsStr}`, infoX + 24, specTextY);

          specTextY += 6.5;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 40, 40);
          doc.text("Weights:", infoX + 3.5, specTextY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(70, 70, 70);
          doc.text(`Gross: ${grossVal} g   |   Net Metal: ${netVal} g`, infoX + 24, specTextY);

          // Gemstones Row
          specTextY += 6.5;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 40, 40);
          doc.text("Gemstones:", infoX + 3.5, specTextY);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(70, 70, 70);
          if (totalStoneCts > 0) {
            const stoneLines = doc.splitTextToSize(`Total: ${totalStoneCts.toFixed(2)} cts (${stoneDetailStr})`, infoW - 27);
            doc.text(stoneLines.slice(0, 2), infoX + 24, specTextY);
            specTextY += (stoneLines.length > 1 ? 9 : 6.5);
          } else {
            doc.text("Plain Gold / No Precious Stones", infoX + 24, specTextY);
            specTextY += 6.5;
          }

          // Description / Notes Row
          if (item.description) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(40, 40, 40);
            doc.text("Notes:", infoX + 3.5, specTextY);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80, 80, 80);
            const noteLines = doc.splitTextToSize(item.description, infoW - 27);
            doc.text(noteLines.slice(0, 2), infoX + 24, specTextY);
          }

          // Pricing Box (or Specifications Hallmark Box if hidden)
          const priceBoxY = cardY + 82.5;
          const priceBoxH = 27;

          if (priceMode === 'selling' || priceMode === 'custom') {
            const mult = priceMode === 'custom' ? multiplier : 1.0;
            const finalPrice = Math.round((evalRes.sellingPrice || 0) * mult);

            doc.setFillColor(...pal.priceBg);
            doc.setDrawColor(...pal.priceBorder);
            doc.setLineWidth(0.4);
            doc.roundedRect(infoX, priceBoxY, infoW, priceBoxH, 2, 2, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...pal.priceText);
            const priceLabel = priceMode === 'custom'
              ? `CLIENT OFFER PRICE (INCL. MARGIN INDEX ${multiplier.toFixed(2)}x)`
              : "ESTIMATED SELLING PRICE";
            doc.text(priceLabel, infoX + 4, priceBoxY + 6.5);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14.5);
            doc.setTextColor(...pal.priceText);
            doc.text(`\u20B9 ${finalPrice.toLocaleString('en-IN')}`, infoX + 4, priceBoxY + 16.5);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(130, 115, 80);
            doc.text("All applicable taxes & certified hallmark specifications included.", infoX + 4, priceBoxY + 22.5);

          } else {
            // Price Hidden mode: Display authentic certification block
            doc.setFillColor(...pal.boxBg);
            doc.setDrawColor(...pal.cardBorder);
            doc.setLineWidth(0.4);
            doc.roundedRect(infoX, priceBoxY, infoW, priceBoxH, 2, 2, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...pal.accentColor);
            doc.text("AUTHENTIC FINE JEWELLERY \u2022 100% VERIFIED SPECIFICATIONS", infoX + 4, priceBoxY + 9);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.2);
            doc.setTextColor(110, 110, 110);
            doc.text("Complete gold purity, diamond grading & gemstone details certified by Mava Gems.", infoX + 4, priceBoxY + 16);
            doc.text("Price quotation available upon private consultation.", infoX + 4, priceBoxY + 22);
          }
        }
      }

      // 4. Two-pass footer rendering for accurate total page counts
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(p, totalPages);
      }

      // 5. Save the generated PDF
      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeTitle}_${Date.now()}.pdf`;

      if (window.electronAPI && window.electronAPI.saveFileDialog && window.electronAPI.savePdfFile) {
        const targetPath = await window.electronAPI.saveFileDialog(filename);
        if (targetPath) {
          const pdfOutput = doc.output('datauristring').split(',')[1];
          await window.electronAPI.savePdfFile(pdfOutput, targetPath);
          UI.showToast("Presentation PDF exported successfully!");
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
