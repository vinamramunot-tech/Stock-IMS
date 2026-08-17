/**
 * JewelrySalesController — Finished Jewelry Sales Ledger & Velocity Analytics Module
 * Analyzes sales performance, holding times (Mfg Date to Sale Date), monthly profit velocity (Profit % / Month),
 * and price range distribution intelligence across both Sales and Analyzer views.
 */

const JewelrySalesController = {

  init() {
    const searchInp = document.getElementById('jewelry-sales-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', UI.debounce(() => this.renderSalesList(), 200));
    }

    const dateFrom = document.getElementById('jewelry-sales-filter-date-from');
    if (dateFrom) {
      dateFrom.addEventListener('change', () => this.renderSalesList());
    }

    const dateTo = document.getElementById('jewelry-sales-filter-date-to');
    if (dateTo) {
      dateTo.addEventListener('change', () => this.renderSalesList());
    }

    const clearBtn = document.getElementById('jewelry-sales-filter-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearFilters());
    }

    const printBtn = document.getElementById('btn-print-jewelry-sales');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.printSalesReport());
    }

    const exportBtn = document.getElementById('btn-export-excel-jewelry-sales');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportSalesExcel());
    }
  },

  clearFilters() {
    const s = document.getElementById('jewelry-sales-search-input');
    if (s) s.value = '';
    const df = document.getElementById('jewelry-sales-filter-date-from');
    if (df) df.value = '';
    const dt = document.getElementById('jewelry-sales-filter-date-to');
    if (dt) dt.value = '';
    this.renderSalesList();
  },

  /**
   * Helper to normalize and compute all metrics for a sale record
   */
  enrichSaleRecord(sale) {
    const items = DBManager.getItems();
    const mainItem = items.find(i => i.id === sale.itemId || i.sku === sale.sku);

    const saleDate = sale.saleDate || (sale.createdAt ? sale.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    const mfgDate = sale.mfgDate || (mainItem && mainItem.mfgDate) || (mainItem && mainItem.createdAt ? mainItem.createdAt.split('T')[0] : saleDate);

    const mfgTime = new Date(mfgDate + 'T00:00:00').getTime();
    const saleTime = new Date(saleDate + 'T00:00:00').getTime();
    const diffMs = Math.max(0, saleTime - mfgTime);
    const daysElapsed = (sale.daysElapsed !== undefined && sale.daysElapsed !== null)
      ? Number(sale.daysElapsed)
      : Math.round(diffMs / (1000 * 60 * 60 * 24));

    const monthsElapsed = Math.max(0.1, Number((daysElapsed / 30.4375).toFixed(2)));

    const mfgCost = Number(sale.mfgCost) || 0;
    const soldPrice = Number(sale.soldPrice) || 0;
    const profit = Number(sale.profit !== undefined ? sale.profit : (soldPrice - mfgCost));
    const marginPct = mfgCost > 0 ? ((profit / mfgCost) * 100) : 0;
    const monthlyProfitPct = (sale.monthlyProfitPct !== undefined && sale.monthlyProfitPct !== null)
      ? Number(sale.monthlyProfitPct)
      : Number((marginPct / monthsElapsed).toFixed(2));

    return {
      ...sale,
      saleDate,
      mfgDate,
      daysElapsed,
      monthsElapsed,
      mfgCost,
      soldPrice,
      profit,
      marginPct,
      monthlyProfitPct
    };
  },

  getSalesRecords() {
    const rawSales = DBManager.getJewelrySales ? DBManager.getJewelrySales() : (DBManager.database?.jewelrySales || []);
    const records = rawSales.map(s => this.enrichSaleRecord(s));

    // Fallback: Check for any catalog items marked 'Sold' not yet recorded in array
    const items = DBManager.getItems();
    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;

    items.forEach(item => {
      if (item.status === 'Sold' && !records.some(r => r.itemId === item.id || r.sku === item.sku)) {
        const evalItem = Calc.evaluateItem(item, goldRate);
        const mfgCost = (evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (item.mfgCostPrice || evalItem.marketCostPrice || 0);
        const soldPrice = item.soldPrice || evalItem.sellingPrice || 0;
        const saleDate = item.soldDate || (item.updatedAt ? item.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
        const mfgDate = item.mfgDate || (item.createdAt ? item.createdAt.split('T')[0] : saleDate);

        const mfgTime = new Date(mfgDate + 'T00:00:00').getTime();
        const saleTime = new Date(saleDate + 'T00:00:00').getTime();
        const daysElapsed = Math.round(Math.max(0, saleTime - mfgTime) / (1000 * 60 * 60 * 24));
        const monthsElapsed = Math.max(0.1, Number((daysElapsed / 30.4375).toFixed(2)));
        const profit = soldPrice - mfgCost;
        const marginPct = mfgCost > 0 ? (profit / mfgCost) * 100 : 0;
        const monthlyProfitPct = Number((marginPct / monthsElapsed).toFixed(2));

        records.push({
          id: 'legacy_sale_' + item.id,
          saleNumber: 'JS-LEGACY',
          saleDate,
          mfgDate,
          daysElapsed,
          monthsElapsed,
          memoId: null,
          memoNumber: item.issuedMemoNumber || '—',
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          customerName: item.soldTo || item.issuedTo || 'Direct Sale',
          brokerName: item.soldBroker || item.issuedBroker || '—',
          mfgCost,
          soldPrice,
          profit,
          marginPct,
          monthlyProfitPct,
          notes: item.notes || '',
          createdAt: item.updatedAt || new Date().toISOString()
        });
      }
    });

    records.sort((a, b) => new Date(b.saleDate || b.createdAt) - new Date(a.saleDate || a.createdAt));
    return records;
  },

  /**
   * Generates standard price bands from 0 to 50 Cr+
   */
  getPriceBands() {
    const priceBands = [
      { min: 0, max: 49999.99, label: '₹0 – ₹49,999 (0 - 50K)' },
      { min: 50000, max: 99999.99, label: '₹50,000 – ₹99,999 (50K - 1L)' }
    ];

    // 1L to 10L in 1 Lakh steps
    for (let l = 1; l < 10; l++) {
      priceBands.push({
        min: l * 100000,
        max: (l + 1) * 100000 - 0.01,
        label: `₹${l} Lakh – ₹${l + 1} Lakh (${l}L - ${l + 1}L)`
      });
    }

    // 10L to 25L in 5 Lakh steps
    for (let l = 10; l < 25; l += 5) {
      priceBands.push({
        min: l * 100000,
        max: (l + 5) * 100000 - 0.01,
        label: `₹${l} Lakh – ₹${l + 5} Lakh (${l}L - ${l + 5}L)`
      });
    }

    // 25L to 1 Cr in 25 Lakh steps
    for (let l = 25; l < 100; l += 25) {
      const minLabel = `${l} Lakh`;
      const nextL = l + 25;
      const maxLabel = nextL < 100 ? `${nextL} Lakh` : `${nextL / 100} Cr`;
      priceBands.push({
        min: l * 100000,
        max: (l + 25) * 100000 - 0.01,
        label: `₹${minLabel} – ₹${maxLabel}`
      });
    }

    // 1 Cr to 10 Cr in 1 Crore steps
    for (let cr = 1; cr < 10; cr++) {
      priceBands.push({
        min: cr * 10000000,
        max: (cr + 1) * 10000000 - 0.01,
        label: `₹${cr} Crore – ₹${cr + 1} Crore (${cr} Cr - ${cr + 1} Cr)`
      });
    }

    // 10 Cr to 25 Cr in 5 Crore steps
    for (let cr = 10; cr < 25; cr += 5) {
      priceBands.push({
        min: cr * 10000000,
        max: (cr + 5) * 10000000 - 0.01,
        label: `₹${cr} Crore – ₹${cr + 5} Crore (${cr} Cr - ${cr + 5} Cr)`
      });
    }

    priceBands.push({
      min: 250000000,
      max: 500000000,
      label: '₹25 Crore – ₹50 Crore (25 Cr - 50 Cr)'
    });

    priceBands.push({
      min: 500000000.01,
      max: Infinity,
      label: '₹50 Crore+ (Above 50 Cr)'
    });

    return priceBands;
  },

  renderSalesList() {
    const records = this.getSalesRecords();

    // 1. Compute Top Summary Metrics
    const totalRevenue = records.reduce((sum, r) => sum + (Number(r.soldPrice) || 0), 0);
    const totalProfit = records.reduce((sum, r) => sum + (Number(r.profit) || 0), 0);
    const totalPieces = records.length;

    const totalDays = records.reduce((sum, r) => sum + (Number(r.daysElapsed) || 0), 0);
    const avgDays = totalPieces > 0 ? Math.round(totalDays / totalPieces) : 0;
    const avgMonths = (avgDays / 30.4375).toFixed(1);

    const totalMonthlyRoi = records.reduce((sum, r) => sum + (Number(r.monthlyProfitPct) || 0), 0);
    const avgMonthlyRoi = totalPieces > 0 ? (totalMonthlyRoi / totalPieces).toFixed(2) : '0.00';

    // Populate Analyzer Page Top Metrics & Intelligence
    this.updateMetricsElements('analyzer-sales', totalRevenue, totalProfit, totalPieces, avgDays, avgMonths, avgMonthlyRoi);
    this.renderPriceRangeIntelligence(records, 'analyzer');
    this.renderCustomerIntelligence(records);
    this.renderBrokerIntelligence(records);

    // 3. Filter Table on Sales Page
    const searchInp = document.getElementById('jewelry-sales-search-input');
    const dateFrom = document.getElementById('jewelry-sales-filter-date-from')?.value || '';
    const dateTo = document.getElementById('jewelry-sales-filter-date-to')?.value || '';
    const query = (searchInp?.value || '').toLowerCase().trim();

    const filtered = records.filter(r => {
      if (query) {
        const match =
          (r.sku || '').toLowerCase().includes(query) ||
          (r.name || '').toLowerCase().includes(query) ||
          (r.customerName || '').toLowerCase().includes(query) ||
          (r.brokerName || '').toLowerCase().includes(query) ||
          (r.memoNumber || '').toLowerCase().includes(query);
        if (!match) return false;
      }

      const sDate = r.saleDate ? r.saleDate.split('T')[0] : '';
      if (dateFrom && sDate < dateFrom) return false;
      if (dateTo && sDate > dateTo) return false;

      return true;
    });

    const tbody = document.getElementById('jewelry-sales-list-tbody');
    const emptyEl = document.getElementById('jewelry-sales-empty-state');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
      tbody.closest('table').classList.add('hidden');
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    tbody.closest('table').classList.remove('hidden');

    const fragment = document.createDocumentFragment();

    filtered.forEach(sale => {
      const dateFmt = sale.saleDate
        ? new Date(sale.saleDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

      const mfgFmt = sale.mfgDate
        ? new Date(sale.mfgDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

      const mainItem = DBManager.getItems().find(i => i.id === sale.itemId || i.sku === sale.sku);
      const imgSrc = mainItem ? mainItem.image : null;

      const imgHtml = imgSrc
        ? `<img src="${imgSrc}" alt="${UI.escapeHtml(sale.name)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);cursor:pointer;" class="sales-thumb-img" loading="lazy" decoding="async">`
        : `<div style="width:32px;height:32px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

      const profit = Number(sale.profit) || 0;
      const marginPct = Number(sale.marginPct) || 0;

      const profitSign = profit >= 0 ? '+' : '';
      const profitColor = profit >= 0 ? '#22c55e' : '#ef4444';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:12px;color:var(--text-main);font-weight:600;">${dateFmt}</td>
        <td style="font-weight:700;color:var(--text-main);">${UI.escapeHtml(sale.sku)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            ${imgHtml}
            <div>
              <strong style="color:var(--text-main);font-size:13px;">${UI.escapeHtml(sale.name)}</strong>
              <div style="font-size:11px;color:var(--text-muted);">${UI.escapeHtml(sale.category || 'Jewelry')}</div>
            </div>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-muted);">${mfgFmt}</td>
        <td style="font-size:12px;color:var(--info-color, #38bdf8);font-weight:600;">
          ${sale.daysElapsed} days
          <div style="font-size:10px;color:var(--text-muted);font-weight:normal;">(${sale.monthsElapsed} mos)</div>
        </td>
        <td>
          <strong style="color:var(--text-main);font-size:13px;">${UI.escapeHtml(sale.customerName || '—')}</strong>
          ${sale.brokerName && sale.brokerName !== '—' ? `<div style="font-size:11px;color:var(--text-muted);">Broker: ${UI.escapeHtml(sale.brokerName)}</div>` : ''}
        </td>
        <td style="text-align:right;font-size:12px;color:var(--text-muted);">₹${(Number(sale.mfgCost) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-weight:700;color:var(--text-gold-dark);font-size:13px;cursor:pointer;" class="btn-edit-sale-price-cell" title="Click to edit sale price">
          <div style="display:inline-flex;align-items:center;gap:4px;">
            <span>₹${(Number(sale.soldPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
        </td>
        <td style="text-align:right;font-weight:700;font-size:13px;color:${profitColor};">
          ${profitSign}₹${profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          <div style="font-size:10px;font-weight:600;opacity:0.85;">(${profitSign}${marginPct.toFixed(1)}%)</div>
        </td>
        <td style="text-align:center;">
          <div style="display:flex;gap:4px;justify-content:center;flex-wrap:nowrap;">
            <button type="button" class="btn btn-secondary btn-small btn-edit-sale-price" style="font-size:11px;padding:3px 8px;white-space:nowrap;" title="Change sale price">
              Edit Price
            </button>
            <button type="button" class="btn btn-secondary btn-small btn-return-sale" style="font-size:11px;padding:3px 8px;white-space:nowrap;color:var(--danger-red, #ef4444);border-color:rgba(239,68,68,0.3);" title="Return piece back to In Stock inventory">
              Return
            </button>
          </div>
        </td>
      `;

      const thumbImg = tr.querySelector('.sales-thumb-img');
      if (thumbImg && mainItem) {
        thumbImg.addEventListener('click', () => App.openJewelryDetailModal(mainItem));
      }

      const editBtn = tr.querySelector('.btn-edit-sale-price');
      if (editBtn) {
        editBtn.addEventListener('click', () => this.openEditSaleModal(sale));
      }

      const editCell = tr.querySelector('.btn-edit-sale-price-cell');
      if (editCell) {
        editCell.addEventListener('click', () => this.openEditSaleModal(sale));
      }

      const returnBtn = tr.querySelector('.btn-return-sale');
      if (returnBtn) {
        returnBtn.addEventListener('click', () => this.handleReturnSale(sale));
      }

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  },

  openEditSaleModal(saleRecord) {
    if (!saleRecord) return;

    const titleEl = document.getElementById('jewelry-sale-modal-title');
    if (titleEl) titleEl.textContent = "Edit Jewelry Sale Price";

    const btnConfirm = document.getElementById('btn-confirm-jewelry-sale');
    if (btnConfirm) btnConfirm.textContent = "Update Sale Price";

    const saleIdInp = document.getElementById('jewelry-sale-id');
    if (saleIdInp) saleIdInp.value = saleRecord.id || '';

    const memoIdInp = document.getElementById('jewelry-sale-memo-id');
    if (memoIdInp) memoIdInp.value = saleRecord.memoId || '';

    const itemIdxInp = document.getElementById('jewelry-sale-item-index');
    if (itemIdxInp) itemIdxInp.value = '-1';

    const itemIdInp = document.getElementById('jewelry-sale-item-id');
    if (itemIdInp) itemIdInp.value = saleRecord.itemId || '';

    const nameEl = document.getElementById('jewelry-sale-piece-name');
    if (nameEl) nameEl.textContent = saleRecord.name || 'Jewelry Piece';

    const skuEl = document.getElementById('jewelry-sale-piece-sku');
    if (skuEl) skuEl.textContent = `SKU: ${saleRecord.sku || 'N/A'} | Category: ${saleRecord.category || 'Jewelry'}`;

    const custInp = document.getElementById('jewelry-sale-customer-name');
    if (custInp) custInp.value = saleRecord.customerName || '';

    const brokerInp = document.getElementById('jewelry-sale-broker-name');
    if (brokerInp) brokerInp.value = (saleRecord.brokerName && saleRecord.brokerName !== '—') ? saleRecord.brokerName : '';

    const mfgCost = Number(saleRecord.mfgCost) || 0;
    const mfgCostInp = document.getElementById('jewelry-sale-mfg-cost');
    if (mfgCostInp) {
      mfgCostInp.value = `₹${mfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      mfgCostInp.dataset.mfgCost = mfgCost;
    }

    const finalPriceInp = document.getElementById('jewelry-sale-final-price');
    if (finalPriceInp) {
      finalPriceInp.value = Number(saleRecord.soldPrice) || 0;
    }

    const dateInp = document.getElementById('jewelry-sale-date');
    if (dateInp) {
      dateInp.value = saleRecord.saleDate ? saleRecord.saleDate.split('T')[0] : new Date().toISOString().split('T')[0];
    }

    const notesInp = document.getElementById('jewelry-sale-notes');
    if (notesInp) {
      notesInp.value = saleRecord.notes || '';
    }

    if (window.JewelryMemoController) {
      JewelryMemoController.updateSaleProfitCalculation();
    }

    UI.openModal('modal-complete-jewelry-sale');
  },

  async handleReturnSale(saleRecord) {
    if (!saleRecord) return;

    const sku = saleRecord.sku || 'N/A';
    const name = saleRecord.name || 'Jewelry Piece';

    UI.confirm(`Are you sure you want to return "${name}" (${sku}) back to In Stock inventory?\n\nThis will reverse the sale ledger entry and restore all original specifications and valuations back into active stock.`, async () => {
      if (!DBManager.database.items) DBManager.database.items = [];
      let mainItem = DBManager.database.items.find(i => i.id === saleRecord.itemId || i.sku === saleRecord.sku);

      if (mainItem) {
        mainItem.status = 'In Stock';
        delete mainItem.soldPrice;
        delete mainItem.soldDate;
        delete mainItem.soldTo;
        delete mainItem.soldBroker;
        mainItem.updatedAt = new Date().toISOString();
      } else if (saleRecord.itemSnapshot) {
        // Re-inflate item from preserved snapshot if missing
        mainItem = JSON.parse(JSON.stringify(saleRecord.itemSnapshot));
        mainItem.status = 'In Stock';
        delete mainItem.soldPrice;
        delete mainItem.soldDate;
        delete mainItem.soldTo;
        delete mainItem.soldBroker;
        mainItem.updatedAt = new Date().toISOString();
        DBManager.database.items.push(mainItem);
      }

      // If linked to a memo, update item status in memo
      if (saleRecord.memoId) {
        const memos = DBManager.database.jewelryMemos || [];
        const memo = memos.find(m => m.id === saleRecord.memoId);
        if (memo && memo.items) {
          const mItem = memo.items.find(it => it.itemId === saleRecord.itemId || it.sku === saleRecord.sku);
          if (mItem) {
            mItem.status = 'returned';
          }
          // If all items are returned/closed, ensure memo is updated
          const hasOpen = memo.items.some(it => it.status === 'open');
          if (!hasOpen) {
            memo.status = 'closed';
            memo.closedAt = memo.closedAt || new Date().toISOString();
          }
        }
      }

      // Remove the sale record from jewelrySales
      if (DBManager.database.jewelrySales) {
        DBManager.database.jewelrySales = DBManager.database.jewelrySales.filter(s => s.id !== saleRecord.id && s.itemId !== saleRecord.itemId);
      }

      DBManager.addLog(
        "RETURN",
        mainItem ? mainItem.id : (saleRecord.itemId || 'item_' + Date.now()),
        name,
        `Returned sold piece ${name} (${sku}) back to inventory. Sale reversed and piece restored to In Stock.`,
        []
      );

      try {
        await DBManager.saveVault();
        App.refreshAllDisplays();
        this.renderSalesList();
        UI.showToast(`Piece ${sku} successfully returned to stock with all specifications restored!`);
      } catch (err) {
        UI.showToast("Error returning sale: " + err.message, true);
      }
    });
  },

  updateMetricsElements(prefix, totalRevenue, totalProfit, totalPieces, avgDays, avgMonths, avgMonthlyRoi) {
    const revEl = document.getElementById(`${prefix}-metric-revenue`);
    const profEl = document.getElementById(`${prefix}-metric-profit`);
    const cntEl = document.getElementById(`${prefix}-metric-count`);
    const timeEl = document.getElementById(`${prefix}-metric-time-elapsed`);
    const roiEl = document.getElementById(`${prefix}-metric-monthly-roi`);

    if (revEl) revEl.textContent = '₹' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (profEl) {
      const sign = totalProfit >= 0 ? '+' : '';
      profEl.textContent = `${sign}₹${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      profEl.style.color = totalProfit >= 0 ? '#22c55e' : '#ef4444';
    }
    if (cntEl) cntEl.textContent = totalPieces;
    if (timeEl) timeEl.textContent = `${avgDays} Days (${avgMonths} mos)`;
    if (roiEl) {
      const sign = Number(avgMonthlyRoi) >= 0 ? '+' : '';
      roiEl.textContent = `${sign}${avgMonthlyRoi}%/mo`;
      roiEl.style.color = Number(avgMonthlyRoi) >= 0 ? '#22c55e' : '#ef4444';
    }
  },

  /**
   * Renders intelligence highlights & price range velocity breakdown
   * target: 'sales' | 'analyzer'
   */
  renderPriceRangeIntelligence(records, target = 'sales') {
    const isAnalyzer = target === 'analyzer';
    const container = document.getElementById(isAnalyzer ? 'analyzer-sales-price-range-container' : 'jewelry-sales-price-range-container');
    const badgeEl = document.getElementById(isAnalyzer ? 'analyzer-sales-active-ranges-badge' : 'jewelry-sales-active-ranges-badge');
    const mostSoldEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-most-sold' : 'sales-insight-most-sold');
    const mostSoldSubEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-most-sold-sub' : 'sales-insight-most-sold-sub');
    const bestMonthlyEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-highest-monthly-roi' : 'sales-insight-highest-monthly-roi');
    const bestMonthlySubEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-highest-monthly-roi-sub' : 'sales-insight-highest-monthly-roi-sub');
    const mostProfitEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-most-profitable' : 'sales-insight-most-profitable');
    const mostProfitSubEl = document.getElementById(isAnalyzer ? 'analyzer-sales-insight-most-profitable-sub' : 'sales-insight-most-profitable-sub');

    if (!container) return;

    if (records.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 12px; padding: 6px 0;">No sales transactions recorded yet.</div>`;
      if (badgeEl) badgeEl.textContent = '0 Sold Brackets';
      if (mostSoldEl) mostSoldEl.textContent = '—';
      if (bestMonthlyEl) bestMonthlyEl.textContent = '—';
      if (mostProfitEl) mostProfitEl.textContent = '—';
      return;
    }

    const priceBands = this.getPriceBands();
    const bandStats = priceBands.map(band => ({
      ...band,
      count: 0,
      totalRevenue: 0,
      totalProfit: 0,
      totalDays: 0,
      totalMonthlyRoi: 0,
      items: []
    }));

    records.forEach(sale => {
      const price = Number(sale.soldPrice) || 0;
      const targetBand = bandStats.find(b => price >= b.min && price <= b.max);
      if (targetBand) {
        targetBand.count += 1;
        targetBand.totalRevenue += price;
        targetBand.totalProfit += Number(sale.profit) || 0;
        targetBand.totalDays += Number(sale.daysElapsed) || 0;
        targetBand.totalMonthlyRoi += Number(sale.monthlyProfitPct) || 0;
        targetBand.items.push(sale);
      }
    });

    const activeBands = bandStats.filter(b => b.count > 0);
    if (badgeEl) badgeEl.textContent = `${activeBands.length} Sold ${activeBands.length === 1 ? 'Bracket' : 'Brackets'}`;

    if (activeBands.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; font-size: 12px; padding: 6px 0;">No sales recorded.</div>`;
      return;
    }

    // 1. Most Sold Price Range
    const mostSoldBand = [...activeBands].sort((a, b) => b.count - a.count)[0];
    if (mostSoldEl && mostSoldBand) {
      const pct = ((mostSoldBand.count / records.length) * 100).toFixed(1);
      mostSoldEl.textContent = mostSoldBand.label;
      if (mostSoldSubEl) mostSoldSubEl.textContent = `${mostSoldBand.count} pieces sold (${pct}% of all sales)`;
    }

    // 2. Highest Profit % / Month Range
    const bestMonthlyBand = [...activeBands].sort((a, b) => (b.totalMonthlyRoi / b.count) - (a.totalMonthlyRoi / a.count))[0];
    if (bestMonthlyEl && bestMonthlyBand) {
      const avgRoi = (bestMonthlyBand.totalMonthlyRoi / bestMonthlyBand.count).toFixed(2);
      const sign = Number(avgRoi) >= 0 ? '+' : '';
      bestMonthlyEl.textContent = `${sign}${avgRoi}% / mo`;
      if (bestMonthlySubEl) bestMonthlySubEl.textContent = `In range ${bestMonthlyBand.label}`;
    }

    // 3. Highest Total Profit Range
    const mostProfitBand = [...activeBands].sort((a, b) => b.totalProfit - a.totalProfit)[0];
    if (mostProfitEl && mostProfitBand) {
      const sign = mostProfitBand.totalProfit >= 0 ? '+' : '';
      mostProfitEl.textContent = `${sign}₹${mostProfitBand.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      if (mostProfitSubEl) mostProfitSubEl.textContent = `In range ${mostProfitBand.label}`;
    }

    // Render Price Range Progress Cards
    const maxCount = Math.max(...activeBands.map(b => b.count), 1);

    container.innerHTML = activeBands.map(band => {
      const countPct = ((band.count / records.length) * 100).toFixed(1);
      const barFillWidth = Math.max(8, ((band.count / maxCount) * 100));
      const avgBandDays = Math.round(band.totalDays / band.count);
      const avgBandRoi = (band.totalMonthlyRoi / band.count).toFixed(2);
      const roiSign = Number(avgBandRoi) >= 0 ? '+' : '';
      const profitSign = band.totalProfit >= 0 ? '+' : '';

      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border-light); padding: 10px 14px; border-radius: 6px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="color: var(--text-main); font-size: 13px;">${band.label}</strong>
              <span style="font-size: 11px; font-weight: 700; background: var(--bg-base); border: 1px solid var(--border-light); padding: 2px 8px; border-radius: 4px; color: var(--text-gold-dark);">
                ${band.count} sold (${countPct}%)
              </span>
              <span style="font-size: 11px; font-weight: 700; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); padding: 2px 8px; border-radius: 4px; color: #22c55e;">
                ${roiSign}${avgBandRoi}%/mo avg
              </span>
              <span style="font-size: 11px; color: var(--text-muted);">
                Avg holding: <strong style="color: var(--info-color, #38bdf8);">${avgBandDays} days</strong>
              </span>
            </div>
            <div style="text-align: right; font-size: 12px; display: flex; gap: 12px; align-items: center;">
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Revenue: </span>
                <strong style="color: var(--text-gold-dark);">₹${band.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Profit: </span>
                <strong style="color: ${band.totalProfit >= 0 ? '#22c55e' : '#ef4444'};">${profitSign}₹${band.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>
          <!-- Visual Status Bar -->
          <div style="width: 100%; height: 5px; background: var(--bg-base); border-radius: 3px; overflow: hidden;">
            <div style="width: ${barFillWidth}%; height: 100%; background: linear-gradient(90deg, #22c55e, #d4af37); border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ── Customer & Client Intelligence ──────────────────────────────────────────

  renderCustomerIntelligence(records) {
    const tbody = document.getElementById('analyzer-customer-tbody');
    const emptyEl = document.getElementById('analyzer-customer-empty-state');
    const badgeEl = document.getElementById('analyzer-customer-count-badge');
    const totalClientsEl = document.getElementById('analyzer-customer-metric-total');
    const topSpendEl = document.getElementById('analyzer-customer-metric-top-spend');
    const topSpendSubEl = document.getElementById('analyzer-customer-metric-top-spend-sub');
    const topProfitEl = document.getElementById('analyzer-customer-metric-top-profit');
    const topProfitSubEl = document.getElementById('analyzer-customer-metric-top-profit-sub');
    const avgLtvEl = document.getElementById('analyzer-customer-metric-avg-ltv');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (tbody.closest('table')) tbody.closest('table').classList.add('hidden');
      if (badgeEl) badgeEl.textContent = '0 Active Clients';
      if (totalClientsEl) totalClientsEl.textContent = '0';
      if (topSpendEl) topSpendEl.textContent = '—';
      if (topSpendSubEl) topSpendSubEl.textContent = 'No sales data';
      if (topProfitEl) topProfitEl.textContent = '—';
      if (topProfitSubEl) topProfitSubEl.textContent = 'No sales data';
      if (avgLtvEl) avgLtvEl.textContent = '₹0.00';
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (tbody.closest('table')) tbody.closest('table').classList.remove('hidden');

    // Aggregate by customer name
    const customerMap = new Map();
    let totalBusinessRevenue = 0;

    records.forEach(r => {
      const custName = (r.customerName || 'Direct / Anonymous').trim();
      const price = Number(r.soldPrice) || 0;
      const profit = Number(r.profit) || 0;
      const mfg = Number(r.mfgCost) || 0;
      const cat = r.category || 'Jewelry';
      const broker = (r.brokerName && r.brokerName !== '—') ? r.brokerName : null;
      const saleDate = r.saleDate ? r.saleDate.split('T')[0] : '';

      totalBusinessRevenue += price;

      if (!customerMap.has(custName)) {
        customerMap.set(custName, {
          name: custName,
          totalRevenue: 0,
          totalProfit: 0,
          totalMfgCost: 0,
          piecesCount: 0,
          categories: {},
          brokers: new Set(),
          lastDate: saleDate
        });
      }

      const entry = customerMap.get(custName);
      entry.totalRevenue += price;
      entry.totalProfit += profit;
      entry.totalMfgCost += mfg;
      entry.piecesCount += 1;
      entry.categories[cat] = (entry.categories[cat] || 0) + 1;
      if (broker) entry.brokers.add(broker);
      if (!entry.lastDate || (saleDate && saleDate > entry.lastDate)) {
        entry.lastDate = saleDate;
      }
    });

    const customers = Array.from(customerMap.values());
    // Sort by total spend descending
    customers.sort((a, b) => b.totalRevenue - a.totalRevenue);

    const uniqueCount = customers.length;
    if (badgeEl) badgeEl.textContent = `${uniqueCount} Active ${uniqueCount === 1 ? 'Client' : 'Clients'}`;
    if (totalClientsEl) totalClientsEl.textContent = uniqueCount;

    // Top Buyer by Spend
    const topBuyer = customers[0];
    if (topSpendEl && topBuyer) {
      topSpendEl.textContent = topBuyer.name;
      const pctOfTotal = totalBusinessRevenue > 0 ? ((topBuyer.totalRevenue / totalBusinessRevenue) * 100).toFixed(1) : 0;
      if (topSpendSubEl) topSpendSubEl.textContent = `₹${topBuyer.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${pctOfTotal}% of total revenue)`;
    }

    // Top Profit Contributor
    const mostProfitableBuyer = [...customers].sort((a, b) => b.totalProfit - a.totalProfit)[0];
    if (topProfitEl && mostProfitableBuyer) {
      topProfitEl.textContent = mostProfitableBuyer.name;
      const margin = mostProfitableBuyer.totalMfgCost > 0 ? ((mostProfitableBuyer.totalProfit / mostProfitableBuyer.totalMfgCost) * 100).toFixed(1) : 0;
      if (topProfitSubEl) topProfitSubEl.textContent = `+₹${mostProfitableBuyer.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${margin}% margin)`;
    }

    // Avg LTV
    if (avgLtvEl) {
      const avgLtv = uniqueCount > 0 ? totalBusinessRevenue / uniqueCount : 0;
      avgLtvEl.textContent = `₹${avgLtv.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    const fragment = document.createDocumentFragment();

    customers.forEach((c, idx) => {
      // Find top category
      let topCat = 'Jewelry';
      let maxCatCount = 0;
      Object.entries(c.categories).forEach(([cat, count]) => {
        if (count > maxCatCount) {
          maxCatCount = count;
          topCat = cat;
        }
      });

      const brokerList = Array.from(c.brokers).join(', ');
      const marginPct = c.totalMfgCost > 0 ? ((c.totalProfit / c.totalMfgCost) * 100).toFixed(1) : '0.0';
      const profitSign = c.totalProfit >= 0 ? '+' : '';
      const profitColor = c.totalProfit >= 0 ? '#22c55e' : '#ef4444';
      const dateFmt = c.lastDate ? new Date(c.lastDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      const revPct = totalBusinessRevenue > 0 ? ((c.totalRevenue / totalBusinessRevenue) * 100).toFixed(1) : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;font-weight:700;color:var(--text-muted);width:20px;">#${idx + 1}</span>
            <div>
              <strong style="color:var(--text-main);font-size:13px;">${UI.escapeHtml(c.name)}</strong>
              ${brokerList ? `<div style="font-size:11px;color:var(--text-muted);">Broker: ${UI.escapeHtml(brokerList)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="text-align:center;font-weight:700;color:var(--text-main);">${c.piecesCount} ${c.piecesCount === 1 ? 'pc' : 'pcs'}</td>
        <td style="text-align:right;font-weight:800;color:var(--text-gold-dark);">
          ₹${c.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          <div style="font-size:10px;color:var(--text-muted);font-weight:normal;">${revPct}% of sales</div>
        </td>
        <td style="text-align:right;font-weight:700;color:${profitColor};">
          ${profitSign}₹${c.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          <div style="font-size:10px;font-weight:600;opacity:0.85;">(${profitSign}${marginPct}%)</div>
        </td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:var(--bg-base);border:1px solid var(--border-light);color:var(--text-main);">
            ${UI.escapeHtml(topCat)}
          </span>
        </td>
        <td style="text-align:center;font-size:12px;color:var(--text-muted);">${dateFmt}</td>
      `;

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  },

  // ── Broker Intelligence & Memo Conversion ROI ───────────────────────────────

  renderBrokerIntelligence(records) {
    const tbody = document.getElementById('analyzer-broker-tbody');
    const emptyEl = document.getElementById('analyzer-broker-empty-state');
    const badgeEl = document.getElementById('analyzer-broker-count-badge');
    if (!tbody) return;

    tbody.innerHTML = '';

    const memos = DBManager.database?.jewelryMemos || [];
    const brokerMap = new Map();

    // Map memo data
    memos.forEach(m => {
      const broker = (m.brokerName || '').trim();
      if (!broker || broker === '—') return;
      if (!brokerMap.has(broker)) {
        brokerMap.set(broker, {
          name: broker,
          memosIssued: 0,
          memoItemsCount: 0,
          soldItemsCount: 0,
          returnedItemsCount: 0,
          salesGenerated: 0,
          profitRealized: 0,
          turnaroundDays: []
        });
      }
      const b = brokerMap.get(broker);
      b.memosIssued++;
      (m.items || []).forEach(it => {
        b.memoItemsCount++;
        if (it.status === 'sold') b.soldItemsCount++;
        if (it.status === 'returned') b.returnedItemsCount++;
      });
    });

    // Map sales data
    (records || []).forEach(r => {
      const broker = (r.brokerName || '').trim();
      if (!broker || broker === '—') return;
      if (!brokerMap.has(broker)) {
        brokerMap.set(broker, {
          name: broker,
          memosIssued: 0,
          memoItemsCount: 0,
          soldItemsCount: 0,
          returnedItemsCount: 0,
          salesGenerated: 0,
          profitRealized: 0,
          turnaroundDays: []
        });
      }
      const b = brokerMap.get(broker);
      b.salesGenerated += Number(r.soldPrice || 0);
      b.profitRealized += Number(r.profit || 0);
      if (r.daysElapsed) b.turnaroundDays.push(Number(r.daysElapsed));
    });

    const brokers = Array.from(brokerMap.values());
    brokers.sort((a, b) => b.salesGenerated - a.salesGenerated);

    if (badgeEl) badgeEl.textContent = `${brokers.length} Active ${brokers.length === 1 ? 'Broker' : 'Brokers'}`;

    if (brokers.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      if (tbody.closest('table')) tbody.closest('table').classList.add('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (tbody.closest('table')) tbody.closest('table').classList.remove('hidden');

    const fragment = document.createDocumentFragment();

    brokers.forEach((b, idx) => {
      const convRate = b.memoItemsCount > 0 ? ((b.soldItemsCount / b.memoItemsCount) * 100).toFixed(0) : (b.salesGenerated > 0 ? '100' : '0');
      const convNum = Number(convRate);

      let efficiencyBadge = '';
      if (convNum >= 60) {
        efficiencyBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#22c55e;background:rgba(34, 197, 94, 0.12);">HIGH VELOCITY 🚀</span>';
      } else if (convNum >= 30) {
        efficiencyBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245, 158, 11, 0.12);">BALANCED ⚖️</span>';
      } else {
        efficiencyBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:var(--text-muted);background:var(--bg-base);">PENDING ⏳</span>';
      }

      const profitSign = b.profitRealized >= 0 ? '+' : '';
      const profitColor = b.profitRealized >= 0 ? '#22c55e' : '#ef4444';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;font-weight:700;color:var(--text-muted);width:20px;">#${idx + 1}</span>
            <strong style="color:var(--text-main);font-size:13px;">${UI.escapeHtml(b.name)}</strong>
          </div>
        </td>
        <td style="text-align:center;font-size:12px;color:var(--text-main);font-weight:600;">${b.memosIssued} Memos</td>
        <td style="text-align:center;font-size:12px;font-weight:700;color:${convNum >= 50 ? '#22c55e' : 'var(--text-main)'};">
          ${convRate}%
          <div style="font-size:10px;color:var(--text-muted);font-weight:normal;">(${b.soldItemsCount}/${b.memoItemsCount || (b.salesGenerated > 0 ? 1 : 0)} pcs sold)</div>
        </td>
        <td style="text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${b.salesGenerated.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-weight:700;color:${profitColor};">
          ${profitSign}₹${b.profitRealized.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </td>
        <td style="text-align:center;">${efficiencyBadge}</td>
      `;

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  },

  // ── Excel Export ────────────────────────────────────────────────────────────

  exportSalesExcel() {
    const records = this.getSalesRecords();
    if (records.length === 0) {
      UI.showToast('No sales records available to export.', true);
      return;
    }

    if (typeof XLSX === 'undefined') {
      UI.showToast('Excel exporter library not loaded.', true);
      return;
    }

    const data = records.map(r => ({
      'Sale Date': r.saleDate || '',
      'SKU': r.sku || '',
      'Piece Name': r.name || '',
      'Category': r.category || '',
      'Mfg Date': r.mfgDate || '',
      'Holding Period (Days)': Number(r.daysElapsed || 0),
      'Holding Period (Months)': Number(r.monthsElapsed || 0),
      'Sold To (Customer)': r.customerName || '',
      'Broker': r.brokerName || '',
      'Memo Ref': r.memoNumber || '',
      'Mfg Cost (₹)': Number(r.mfgCost || 0),
      'Sold Price (₹)': Number(r.soldPrice || 0),
      'Total Profit (₹)': Number(r.profit || 0),
      'Total Margin %': Number(r.marginPct || 0).toFixed(2) + '%',
      'Profit % / Month': Number(r.monthlyProfitPct || 0).toFixed(2) + '%/mo',
      'Notes': r.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jewelry Sales & Velocity');
    XLSX.writeFile(wb, `Jewelry_Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showToast('Sales & Velocity report exported to Excel successfully.');
  },

  // ── Print Sales Report ──────────────────────────────────────────────────────

  printSalesReport() {
    const records = this.getSalesRecords();
    if (records.length === 0) {
      UI.showToast('No sales records to print.', true);
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    doc.setFont("georgia", "bold");
    doc.setFontSize(18);
    doc.text("MAVA GEMS - JEWELRY SALES & VELOCITY LEDGER", 14, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated Date: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);
    doc.text(`Total Records: ${records.length}`, 14, 34);

    const totalRev = records.reduce((s, r) => s + (Number(r.soldPrice) || 0), 0);
    const totalProf = records.reduce((s, r) => s + (Number(r.profit) || 0), 0);
    doc.text(`Total Revenue: Rs ${totalRev.toLocaleString()}`, 160, 28);
    doc.text(`Total Profit: Rs ${totalProf.toLocaleString()}`, 160, 34);

    doc.setDrawColor(200);
    doc.line(14, 38, 282, 38);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Sale Date", 14, 44);
    doc.text("SKU", 36, 44);
    doc.text("Piece Name", 62, 44);
    doc.text("Mfg Date", 112, 44);
    doc.text("Holding", 136, 44);
    doc.text("Sold To", 158, 44);
    doc.text("Mfg Cost", 198, 44);
    doc.text("Sold Price", 226, 44);
    doc.text("Profit", 252, 44);
    doc.text("Profit%/Mo", 270, 44);

    doc.line(14, 47, 282, 47);

    let y = 53;
    doc.setFont("helvetica", "normal");

    records.forEach(r => {
      if (y > 185) {
        doc.addPage();
        y = 20;
      }
      doc.text(r.saleDate || '—', 14, y);
      doc.setFont("helvetica", "bold");
      doc.text(r.sku || '', 36, y);
      doc.setFont("helvetica", "normal");
      doc.text((r.name || '').substring(0, 24), 62, y);
      doc.text(r.mfgDate || '—', 112, y);
      doc.text(`${r.daysElapsed}d (${r.monthsElapsed}m)`, 136, y);
      doc.text((r.customerName || '').substring(0, 18), 158, y);
      doc.text(`Rs ${(Number(r.mfgCost) || 0).toLocaleString()}`, 198, y);
      doc.text(`Rs ${(Number(r.soldPrice) || 0).toLocaleString()}`, 226, y);
      doc.text(`Rs ${(Number(r.profit) || 0).toLocaleString()}`, 252, y);
      doc.text(`${Number(r.monthlyProfitPct || 0).toFixed(1)}%`, 270, y);
      y += 7;
    });

    const iframe = document.getElementById('print-preview-iframe');
    if (iframe) {
      iframe.src = doc.output('datauristring');
    }
    UI.openModal('modal-print-preview');
  }
};

window.JewelrySalesController = JewelrySalesController;
