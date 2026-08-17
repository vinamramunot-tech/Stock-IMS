/**
 * Finished Jewelry Memos Controller Module
 * Manages issuing finished jewelry pieces to people/clients with broker tracking.
 * Updates jewelry item statuses to "Issued", "Sold", or reverts to "In Stock".
 */

const JewelryMemoController = {
  selectedItems: [], // Array of jewelry item objects
  activePdfDocument: null,

  init() {
    // Nav triggers
    const btnNavCreate = document.getElementById('btn-nav-create-jewelry-memo');
    if (btnNavCreate) {
      btnNavCreate.addEventListener('click', () => this.openCreateMemoModal());
    }
    const btnCreate = document.getElementById('btn-create-jewelry-memo');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => this.openCreateMemoModal());
    }

    const btnSave = document.getElementById('btn-save-jewelry-memo');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.handleSaveMemo());
    }

    // Close buttons inside jewelry memo modals
    document.querySelectorAll('.modal-close-trigger-jewelry-memo').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-create-jewelry-memo'));
    });
    document.querySelectorAll('.modal-close-trigger-jewelry-memo-detail').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewelry-memo-detail'));
    });
    document.querySelectorAll('.modal-close-trigger-jewelry-sale').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-complete-jewelry-sale'));
    });

    // Create Modal Search/Filters
    const searchInp = document.getElementById('jewelry-memo-create-search');
    if (searchInp) {
      searchInp.addEventListener('input', UI.debounce(() => this.filterCreateJewelry(), 200));
    }
    const catSelect = document.getElementById('jewelry-memo-create-category');
    if (catSelect) {
      catSelect.addEventListener('change', () => this.filterCreateJewelry());
    }

    // Add selected item button
    const btnAddItem = document.getElementById('btn-jewelry-memo-add-item');
    if (btnAddItem) {
      btnAddItem.addEventListener('click', () => this.handleAddItemToSelected());
    }

    // Filter and search in main list
    const statusFilter = document.getElementById('jewelry-memo-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => this.renderMemoList());
    }
    const searchInput = document.getElementById('jewelry-memo-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(() => this.renderMemoList(), 200));
    }

    // Wire up Confirm Sale Modal inputs
    const finalPriceInp = document.getElementById('jewelry-sale-final-price');
    if (finalPriceInp) {
      finalPriceInp.addEventListener('input', () => this.updateSaleProfitCalculation());
    }

    const btnConfirmSale = document.getElementById('btn-confirm-jewelry-sale');
    if (btnConfirmSale) {
      btnConfirmSale.addEventListener('click', () => this.handleConfirmJewelrySale());
    }
  },

  getNextMemoNumber() {
    const memos = DBManager.getJewelryMemos();
    if (memos.length === 0) return 'JM-001';
    const nums = memos.map(m => {
      const match = (m.memoNumber || '').match(/JM-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const next = Math.max(...nums) + 1;
    return `JM-${String(next).padStart(3, '0')}`;
  },

  getAllPastBrokers() {
    const brokers = new Set();
    DBManager.getJewelryMemos().forEach(m => {
      if (m.brokerName) brokers.add(m.brokerName);
    });
    return Array.from(brokers).sort();
  },

  openCreateMemoModal() {
    this.selectedItems = [];
    this.resetCreateMemoForm();
    UI.openModal('modal-create-jewelry-memo');
  },

  resetCreateMemoForm() {
    const personInput = document.getElementById('jewelry-memo-person-name');
    if (personInput) personInput.value = '';
    const brokerInput = document.getElementById('jewelry-memo-broker-name');
    if (brokerInput) brokerInput.value = '';
    const dateInput = document.getElementById('jewelry-memo-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const notesInput = document.getElementById('jewelry-memo-notes');
    if (notesInput) notesInput.value = '';

    const searchInp = document.getElementById('jewelry-memo-create-search');
    if (searchInp) searchInp.value = '';
    const catSelect = document.getElementById('jewelry-memo-create-category');
    if (catSelect) catSelect.value = '';

    this.populateBrokerDatalist();
    this.filterCreateJewelry();
    this.renderSelectedItemsTable();
  },

  populateBrokerDatalist() {
    const list = document.getElementById('jewelry-memo-brokers-list');
    if (!list) return;
    list.innerHTML = '';
    this.getAllPastBrokers().forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      list.appendChild(opt);
    });
  },

  filterCreateJewelry() {
    const selectEl = document.getElementById('jewelry-memo-create-select');
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const query = (document.getElementById('jewelry-memo-create-search').value || '').toLowerCase().trim();
    const catVal = document.getElementById('jewelry-memo-create-category').value;

    const items = DBManager.getItems();
    const filtered = items.filter(item => {
      // Must be in stock
      const status = item.status || 'In Stock';
      if (status !== 'In Stock') return false;

      // Must not be already in our selections
      if (this.selectedItems.some(sel => sel.id === item.id)) return false;

      if (catVal && item.category !== catVal) return false;

      if (query) {
        const matchName = (item.name || '').toLowerCase().includes(query);
        const matchSku = (item.sku || '').toLowerCase().includes(query);
        return matchName || matchSku;
      }
      return true;
    });

    if (filtered.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- No available jewelry pieces in stock --';
      selectEl.appendChild(opt);
      return;
    }

    filtered.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
      const evaluation = Calc.evaluateItem(item, goldRate);
      opt.textContent = `${item.sku} - ${item.name} (Val: ₹${evaluation.sellingPrice.toLocaleString()})`;
      selectEl.appendChild(opt);
    });
  },

  handleAddItemToSelected() {
    const selectEl = document.getElementById('jewelry-memo-create-select');
    if (!selectEl || !selectEl.value) {
      UI.showToast('Please select a jewelry item to add.', true);
      return;
    }

    const itemId = selectEl.value;
    const item = DBManager.getItems().find(i => i.id === itemId);
    if (!item) return;

    this.selectedItems.push(item);
    this.filterCreateJewelry();
    this.renderSelectedItemsTable();
  },

  renderSelectedItemsTable() {
    const tbody = document.getElementById('jewelry-memo-selected-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (this.selectedItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:15px;color:var(--text-muted);">No pieces added to memo. Select a piece above and click "Add Piece".</td></tr>';
      this.updateSelectedTotals();
      return;
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;

    this.selectedItems.forEach((item, index) => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const tr = document.createElement('tr');
      const imgHtml = item.image
        ? `<img src="${item.image}" alt="${UI.escapeHtml(item.name)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);cursor:pointer;" class="memo-thumb-img">`
        : `<div style="width:36px;height:36px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

      tr.innerHTML = `
        <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
        <td style="padding:8px 12px;font-weight:700;">${UI.escapeHtml(item.sku)}</td>
        <td style="padding:8px 12px;">${UI.escapeHtml(item.name)}</td>
        <td style="padding:8px 12px;">${UI.escapeHtml(item.category)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${evalItem.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;text-align:center;">
          <button type="button" class="btn btn-danger btn-small" style="font-size:10px;padding:3px 6px;" data-index="${index}">Remove</button>
        </td>
      `;

      const thumbImg = tr.querySelector('.memo-thumb-img');
      if (thumbImg) {
        thumbImg.addEventListener('click', () => App.openJewelryDetailModal(item));
      }

      tr.querySelector('.btn-danger').addEventListener('click', () => {
        this.selectedItems.splice(index, 1);
        this.filterCreateJewelry();
        this.renderSelectedItemsTable();
      });

      tbody.appendChild(tr);
    });

    this.updateSelectedTotals();
  },

  updateSelectedTotals() {
    const countEl = document.getElementById('jewelry-memo-item-count');
    const valueEl = document.getElementById('jewelry-memo-total-value');
    if (!countEl || !valueEl) return;

    countEl.textContent = this.selectedItems.length;

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const totalVal = this.selectedItems.reduce((sum, item) => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      return sum + evaluation.sellingPrice;
    }, 0);

    valueEl.textContent = `₹${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  },

  async handleSaveMemo() {
    const personName = (document.getElementById('jewelry-memo-person-name').value || '').trim();
    const brokerName = (document.getElementById('jewelry-memo-broker-name').value || '').trim();
    const date = document.getElementById('jewelry-memo-date').value;
    const notes = (document.getElementById('jewelry-memo-notes').value || '').trim();

    if (!personName) { UI.showToast('Please enter the person / client name to whom the items are issued.', true); return; }
    if (!date) { UI.showToast('Please select an issue date.', true); return; }
    if (this.selectedItems.length === 0) {
      UI.showToast('Please add at least one jewelry piece to issue on memo.', true);
      return;
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const memoNumber = this.getNextMemoNumber();

    const memoItems = this.selectedItems.map(item => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const mfgCost = (evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (item.mfgCostPrice || evalItem.marketCostPrice || 0);

      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        image: item.image || null,
        mfgCost,
        sellingPrice: evalItem.sellingPrice,
        status: 'open' // open | returned | sold
      };
    });

    const totalValue = memoItems.reduce((sum, item) => sum + item.sellingPrice, 0);

    const memo = {
      id: 'jewelry_memo_' + Date.now(),
      memoNumber,
      personName,
      brokerName: brokerName || '—',
      date,
      status: 'open', // open | closed
      createdAt: new Date().toISOString(),
      closedAt: null,
      notes,
      items: memoItems,
      totalValue
    };

    // Update statuses of jewelry pieces to 'Issued'
    this.selectedItems.forEach(sel => {
      const item = DBManager.database.items.find(i => i.id === sel.id);
      if (item) {
        item.status = 'Issued';
        item.issuedTo = personName;
        item.issuedBroker = brokerName;
        item.issuedMemoNumber = memoNumber;
        item.updatedAt = new Date().toISOString();
      }
    });

    if (!DBManager.database.jewelryMemos) DBManager.database.jewelryMemos = [];
    DBManager.database.jewelryMemos.push(memo);

    DBManager.addLog(
      'ADD', memo.id, `Jewelry Memo ${memoNumber}`,
      `Issued ${memoItems.length} pieces on Memo ${memoNumber} to ${personName} (Broker: ${brokerName || 'None'}): ₹${totalValue.toLocaleString()}`,
      []
    );

    try {
      UI.closeModal('modal-create-jewelry-memo');
      UI.showToast(`Jewelry Memo ${memoNumber} successfully issued to ${personName}`);
      App.refreshAllDisplays();
      await DBManager.saveVault();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  renderMemoList() {
    const memos = DBManager.getJewelryMemos();
    const openMemos = memos.filter(m => m.status === 'open');
    const totalValOnMemo = openMemos.reduce((s, m) => s + (m.totalValue || 0), 0);

    const elCount = document.getElementById('metric-jewelry-memo-open-count');
    const elVal = document.getElementById('metric-jewelry-memo-value');
    if (elCount) elCount.textContent = openMemos.length;
    if (elVal) elVal.textContent = '₹' + totalValOnMemo.toLocaleString(undefined, { minimumFractionDigits: 2 });

    const statusFilter = document.getElementById('jewelry-memo-filter-status');
    const searchInput = document.getElementById('jewelry-memo-search-input');
    const filterVal = statusFilter ? statusFilter.value : '';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = memos.filter(m => {
      const matchStatus = !filterVal || m.status === filterVal;
      const matchSearch = !query ||
        (m.personName || '').toLowerCase().includes(query) ||
        (m.brokerName || '').toLowerCase().includes(query) ||
        (m.memoNumber || '').toLowerCase().includes(query);
      return matchStatus && matchSearch;
    });

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tbody = document.getElementById('jewelry-memo-list-tbody');
    const emptyEl = document.getElementById('jewelry-memo-empty-state');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
      tbody.closest('table').classList.add('hidden');
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    tbody.closest('table').classList.remove('hidden');

    const statusStyle = {
      open: { bg: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)' },
      closed: { bg: 'rgba(140,140,160,0.15)', color: 'var(--text-muted)', border: 'transparent' }
    };

    filtered.forEach(memo => {
      const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      const st = statusStyle[memo.status] || statusStyle.closed;

      const recipientDisplay = memo.personName
        ? `<div><strong style="color:var(--text-main);">${UI.escapeHtml(memo.personName)}</strong>${memo.brokerName && memo.brokerName !== '—' ? `<br><span style="font-size:11px;color:var(--text-muted);">Broker: ${UI.escapeHtml(memo.brokerName)}</span>` : ''}</div>`
        : UI.escapeHtml(memo.brokerName || '—');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700;font-family:var(--font-serif);">${UI.escapeHtml(memo.memoNumber)}</td>
        <td>${dateFmt}</td>
        <td>${recipientDisplay}</td>
        <td style="text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${(memo.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;">${(memo.items || []).length}</td>
        <td>
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;
            font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
            background:${st.bg};color:${st.color};border:1px solid ${st.border};">
            ${memo.status === 'open' ? 'ISSUED' : 'CLOSED'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-small btn-view-memo">View</button>
            ${memo.status === 'open' ? `
              <button type="button" class="btn btn-secondary btn-small btn-return-memo" style="font-size:11px;">Return All</button>
              <button type="button" class="btn btn-primary btn-small btn-sell-memo" style="font-size:11px;background:#22c55e;border-color:#22c55e;color:#fff;">Sell All</button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const retBtn = tr.querySelector('.btn-return-memo');
      const sellBtn = tr.querySelector('.btn-sell-memo');
      if (retBtn) retBtn.addEventListener('click', () => this.handleBatchMemoAction(memo.id, 'returned'));
      if (sellBtn) sellBtn.addEventListener('click', () => this.handleBatchMemoAction(memo.id, 'sold'));

      tbody.appendChild(tr);
    });
  },

  openMemoDetail(memoId) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    document.getElementById('jewelry-memo-detail-number').textContent = memo.memoNumber;
    const personEl = document.getElementById('jewelry-memo-detail-person');
    if (personEl) personEl.textContent = memo.personName || '—';
    document.getElementById('jewelry-memo-detail-broker').textContent = memo.brokerName || '—';
    document.getElementById('jewelry-memo-detail-date').textContent = dateFmt;
    document.getElementById('jewelry-memo-detail-status').textContent = memo.status === 'open' ? 'ISSUED' : 'CLOSED';
    document.getElementById('jewelry-memo-detail-notes').textContent = memo.notes || '—';
    document.getElementById('jewelry-memo-detail-total-value').textContent = '₹' + (memo.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

    const closedRow = document.getElementById('jewelry-memo-detail-closed-row');
    if (memo.closedAt && closedRow) {
      document.getElementById('jewelry-memo-detail-closed-at').textContent =
        new Date(memo.closedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      closedRow.classList.remove('hidden');
    } else if (closedRow) {
      closedRow.classList.add('hidden');
    }

    const tbody = document.getElementById('jewelry-memo-detail-items-tbody');
    tbody.innerHTML = '';

    (memo.items || []).forEach((item, index) => {
      const mainItem = DBManager.getItems().find(i => i.id === item.itemId || i.sku === item.sku);
      const imgSrc = item.image || (mainItem ? mainItem.image : null);

      const imgHtml = imgSrc
        ? `<img src="${imgSrc}" alt="${UI.escapeHtml(item.name)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);cursor:pointer;" class="memo-detail-thumb-img">`
        : `<div style="width:36px;height:36px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

      const statusBadge = item.status === 'open'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);">ISSUED</span>`
        : item.status === 'returned'
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(80,200,120,0.15);color:var(--success-color);">RETURNED</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(212,175,55,0.15);color:var(--text-gold-dark);">SOLD</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
        <td style="padding:8px 10px;font-weight:700;">${UI.escapeHtml(item.sku)}</td>
        <td style="padding:8px 10px;">${UI.escapeHtml(item.name)}</td>
        <td style="padding:8px 10px;">${UI.escapeHtml(item.category)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${item.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 10px;text-align:center;">
          ${statusBadge}
        </td>
        <td style="padding:8px 10px;text-align:center;">
          ${memo.status === 'open' && item.status === 'open' ? `
            <div style="display:flex;gap:6px;justify-content:center;">
              <button type="button" class="btn btn-secondary btn-small btn-row-return" style="font-size:11px;padding:3px 8px;" data-index="${index}">Return to Stock</button>
              <button type="button" class="btn btn-primary btn-small btn-row-sell" style="font-size:11px;padding:3px 8px;background:#22c55e;border-color:#22c55e;color:#fff;" data-index="${index}">Sell Item</button>
            </div>
          ` : '—'}
        </td>
      `;

      const thumbImg = tr.querySelector('.memo-detail-thumb-img');
      if (thumbImg) {
        thumbImg.addEventListener('click', () => {
          App.openJewelryDetailModal(mainItem || item);
        });
      }

      if (memo.status === 'open' && item.status === 'open') {
        tr.querySelector('.btn-row-return').addEventListener('click', () => this.handleReturnMemoItem(memo.id, index));
        tr.querySelector('.btn-row-sell').addEventListener('click', () => this.openCompleteSaleModal(memo.id, index));
      }

      tbody.appendChild(tr);
    });

    // Wire Batch Actions in footer
    const actionsFooter = document.getElementById('jewelry-memo-detail-actions');
    if (actionsFooter) {
      if (memo.status === 'open') {
        actionsFooter.innerHTML = `
          <button type="button" class="btn btn-secondary" id="btn-memo-detail-return-all">Return All to Stock</button>
          <button type="button" class="btn btn-primary" id="btn-memo-detail-sell-all" style="background:#22c55e;border-color:#22c55e;color:#fff;">Sell All Pieces</button>
        `;
        document.getElementById('btn-memo-detail-return-all').onclick = () => this.handleBatchMemoAction(memo.id, 'returned');
        document.getElementById('btn-memo-detail-sell-all').onclick = () => this.handleBatchMemoAction(memo.id, 'sold');
      } else {
        actionsFooter.innerHTML = '';
      }
    }

    // Print Receipt button wire up
    const btnPrintReceipt = document.getElementById('btn-jewelry-memo-print-receipt');
    if (btnPrintReceipt) {
      btnPrintReceipt.onclick = () => this.printReceipt(memo);
    }

    UI.openModal('modal-jewelry-memo-detail');
  },

  // ── Handle Return Item Back to Inventory ────────────────────────────────────

  async handleReturnMemoItem(memoId, index) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    const item = memo.items[index];
    if (!item || item.status !== 'open') return;

    UI.confirm(`Take SKU: ${item.sku} back to inventory stock?`, async () => {
      item.status = 'returned';

      // Revert piece in main inventory back to 'In Stock'
      const mainItem = DBManager.database.items.find(i => i.id === item.itemId);
      if (mainItem) {
        mainItem.status = 'In Stock';
        mainItem.issuedTo = null;
        mainItem.issuedBroker = null;
        mainItem.issuedMemoNumber = null;
        mainItem.updatedAt = new Date().toISOString();
      }

      // Check if all items in memo are resolved
      const allDone = memo.items.every(it => it.status !== 'open');
      if (allDone) {
        memo.status = 'closed';
        memo.closedAt = new Date().toISOString();
      }

      DBManager.addLog(
        'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
        `Returned SKU: ${item.sku} back to stock from Memo ${memo.memoNumber}`,
        []
      );

      try {
        UI.showToast(`Piece ${item.sku} returned to stock.`);
        App.refreshAllDisplays();
        this.openMemoDetail(memo.id);
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  // ── Complete Sale Modal & Execution ────────────────────────────────────────

  openCompleteSaleModal(memoId, index, directItem = null) {
    let memo = null;
    let memoItem = null;
    let mainItem = null;

    if (directItem) {
      mainItem = directItem;
      document.getElementById('jewelry-sale-memo-id').value = '';
      document.getElementById('jewelry-sale-item-index').value = '-1';
      document.getElementById('jewelry-sale-item-id').value = mainItem.id;

      document.getElementById('jewelry-sale-piece-name').textContent = mainItem.name || 'Unnamed Piece';
      document.getElementById('jewelry-sale-piece-sku').textContent = `SKU: ${mainItem.sku || 'N/A'} | Category: ${mainItem.category || 'Jewelry'}`;

      document.getElementById('jewelry-sale-customer-name').value = mainItem.issuedTo || '';
      document.getElementById('jewelry-sale-broker-name').value = (mainItem.issuedBroker && mainItem.issuedBroker !== '—') ? mainItem.issuedBroker : '';
    } else {
      memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
      if (!memo) return;

      memoItem = memo.items[index];
      if (!memoItem || memoItem.status !== 'open') return;

      mainItem = DBManager.getItems().find(i => i.id === memoItem.itemId || i.sku === memoItem.sku);

      document.getElementById('jewelry-sale-memo-id').value = memo.id;
      document.getElementById('jewelry-sale-item-index').value = index;
      document.getElementById('jewelry-sale-item-id').value = memoItem.itemId;

      document.getElementById('jewelry-sale-piece-name').textContent = memoItem.name;
      document.getElementById('jewelry-sale-piece-sku').textContent = `SKU: ${memoItem.sku} | Category: ${memoItem.category}`;

      document.getElementById('jewelry-sale-customer-name').value = memo.personName || '';
      document.getElementById('jewelry-sale-broker-name').value = (memo.brokerName && memo.brokerName !== '—') ? memo.brokerName : '';
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const evalItem = mainItem ? Calc.evaluateItem(mainItem, goldRate) : null;
    const mfgCost = (evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (memoItem ? memoItem.mfgCost : (mainItem?.mfgCostPrice || 0));

    document.getElementById('jewelry-sale-mfg-cost').value = `₹${mfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('jewelry-sale-mfg-cost').dataset.mfgCost = mfgCost;

    const initialPrice = memoItem ? memoItem.sellingPrice : (evalItem ? evalItem.sellingPrice : 0);
    document.getElementById('jewelry-sale-final-price').value = initialPrice;
    document.getElementById('jewelry-sale-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('jewelry-sale-notes').value = '';

    this.updateSaleProfitCalculation();
    UI.openModal('modal-complete-jewelry-sale');
  },

  updateSaleProfitCalculation() {
    const mfgCost = parseFloat(document.getElementById('jewelry-sale-mfg-cost')?.dataset.mfgCost || 0);
    const finalPrice = parseFloat(document.getElementById('jewelry-sale-final-price')?.value || 0);
    const displayEl = document.getElementById('jewelry-sale-profit-display');
    if (!displayEl) return;

    const profit = finalPrice - mfgCost;
    const marginPct = mfgCost > 0 ? ((profit / mfgCost) * 100).toFixed(2) : 0.00;
    const sign = profit >= 0 ? '+' : '';
    const color = profit >= 0 ? '#22c55e' : '#ef4444';

    displayEl.textContent = `₹${profit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${sign}${marginPct}%)`;
    displayEl.style.color = color;
  },

  async handleConfirmJewelrySale() {
    const memoId = document.getElementById('jewelry-sale-memo-id').value;
    const index = parseInt(document.getElementById('jewelry-sale-item-index').value, 10);
    const itemId = document.getElementById('jewelry-sale-item-id').value;
    const customerName = (document.getElementById('jewelry-sale-customer-name').value || '').trim();
    const brokerName = (document.getElementById('jewelry-sale-broker-name').value || '').trim();
    const finalSoldPrice = parseFloat(document.getElementById('jewelry-sale-final-price').value || 0);
    const saleDate = document.getElementById('jewelry-sale-date').value;
    const notes = (document.getElementById('jewelry-sale-notes').value || '').trim();

    if (!customerName) {
      UI.showToast('Please enter the customer / client name.', true);
      return;
    }
    if (isNaN(finalSoldPrice) || finalSoldPrice <= 0) {
      UI.showToast('Please enter a valid final sold price.', true);
      return;
    }
    if (!saleDate) {
      UI.showToast('Please select the sale date.', true);
      return;
    }

    const mfgCost = parseFloat(document.getElementById('jewelry-sale-mfg-cost')?.dataset.mfgCost || 0);
    const profit = finalSoldPrice - mfgCost;
    const marginPct = mfgCost > 0 ? (profit / mfgCost) * 100 : 0;

    let mainItem = DBManager.database.items.find(i => i.id === itemId);
    let pieceName = mainItem?.name || 'Jewelry Piece';
    let pieceSku = mainItem?.sku || 'N/A';
    let pieceCategory = mainItem?.category || 'Jewelry';

    const mfgDate = (mainItem && mainItem.mfgDate)
      ? mainItem.mfgDate
      : (mainItem && mainItem.createdAt ? mainItem.createdAt.split('T')[0] : saleDate);
    const mfgTime = new Date(mfgDate + 'T00:00:00').getTime();
    const saleTime = new Date(saleDate + 'T00:00:00').getTime();
    const diffMs = Math.max(0, saleTime - mfgTime);
    const daysElapsed = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const monthsElapsed = Math.max(0.1, Number((daysElapsed / 30.4375).toFixed(2)));
    const monthlyProfitPct = Number((marginPct / monthsElapsed).toFixed(2));

    if (!DBManager.database.jewelrySales) DBManager.database.jewelrySales = [];
    const saleRecord = {
      id: 'jsale_' + Date.now(),
      saleNumber: 'JS-' + String(DBManager.database.jewelrySales.length + 1).padStart(4, '0'),
      saleDate,
      mfgDate,
      daysElapsed,
      monthsElapsed,
      memoId: memoId || null,
      memoNumber: '—',
      itemId: mainItem ? mainItem.id : itemId,
      sku: pieceSku,
      name: pieceName,
      category: pieceCategory,
      customerName,
      brokerName: brokerName || '—',
      mfgCost,
      soldPrice: finalSoldPrice,
      profit,
      marginPct,
      monthlyProfitPct,
      notes,
      createdAt: new Date().toISOString()
    };

    if (memoId) {
      const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
      if (memo) {
        saleRecord.memoNumber = memo.memoNumber;
        const memoItem = memo.items[index];
        if (memoItem) {
          memoItem.status = 'sold';
          memoItem.soldPrice = finalSoldPrice;
          pieceName = memoItem.name;
          pieceSku = memoItem.sku;
          pieceCategory = memoItem.category;
          saleRecord.name = pieceName;
          saleRecord.sku = pieceSku;
          saleRecord.category = pieceCategory;
        }

        const allDone = memo.items.every(it => it.status !== 'open');
        if (allDone) {
          memo.status = 'closed';
          memo.closedAt = new Date().toISOString();
        }
      }
    }

    DBManager.database.jewelrySales.push(saleRecord);

    // Mark item as Sold in main catalog
    if (mainItem) {
      mainItem.status = 'Sold';
      mainItem.soldPrice = finalSoldPrice;
      mainItem.soldDate = saleDate;
      mainItem.soldTo = customerName;
      mainItem.soldBroker = brokerName;
      mainItem.updatedAt = new Date().toISOString();
    }

    DBManager.addLog(
      'EDIT',
      mainItem ? mainItem.id : itemId,
      `Jewelry Sale ${saleRecord.saleNumber}`,
      `Sold ${pieceSku} to ${customerName} (Broker: ${brokerName || 'None'}) for ₹${finalSoldPrice.toLocaleString()} (Profit: ₹${profit.toLocaleString()})`,
      []
    );

    try {
      UI.closeModal('modal-complete-jewelry-sale');
      UI.showToast(`Sale recorded for SKU: ${pieceSku} to ${customerName}!`);
      App.refreshAllDisplays();
      if (window.JewelrySalesController) window.JewelrySalesController.renderSalesList();
      if (memoId) this.openMemoDetail(memoId);
      await DBManager.saveVault();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  // ── Batch Process All Items on a Memo ──────────────────────────────────────

  async handleBatchMemoAction(memoId, action) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const actionLabel = action === 'sold'
      ? 'mark ALL remaining pieces as Sold'
      : 'return ALL remaining pieces back to In Stock inventory';

    UI.confirm(`Are you sure you want to ${actionLabel} for Memo ${memo.memoNumber}?`, async () => {
      const saleDate = new Date().toISOString().split('T')[0];
      if (!DBManager.database.jewelrySales) DBManager.database.jewelrySales = [];

      (memo.items || []).forEach(item => {
        if (item.status === 'open') {
          item.status = action === 'sold' ? 'sold' : 'returned';

          const mainItem = DBManager.database.items.find(i => i.id === item.itemId);
          if (mainItem) {
            mainItem.status = action === 'sold' ? 'Sold' : 'In Stock';
            if (action === 'sold') {
              mainItem.soldPrice = item.sellingPrice;
              mainItem.soldDate = saleDate;
              mainItem.soldTo = memo.personName;
              mainItem.soldBroker = memo.brokerName;

              // Record sale
              const mfgCost = item.mfgCost || 0;
              const profit = item.sellingPrice - mfgCost;
              const marginPct = mfgCost > 0 ? (profit / mfgCost) * 100 : 0;
              const mfgDate = (mainItem && mainItem.mfgDate)
                ? mainItem.mfgDate
                : (mainItem && mainItem.createdAt ? mainItem.createdAt.split('T')[0] : saleDate);
              const mfgTime = new Date(mfgDate + 'T00:00:00').getTime();
              const saleTime = new Date(saleDate + 'T00:00:00').getTime();
              const diffMs = Math.max(0, saleTime - mfgTime);
              const daysElapsed = Math.round(diffMs / (1000 * 60 * 60 * 24));
              const monthsElapsed = Math.max(0.1, Number((daysElapsed / 30.4375).toFixed(2)));
              const monthlyProfitPct = Number((marginPct / monthsElapsed).toFixed(2));

              DBManager.database.jewelrySales.push({
                id: 'jsale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                saleNumber: 'JS-' + String(DBManager.database.jewelrySales.length + 1).padStart(4, '0'),
                saleDate,
                mfgDate,
                daysElapsed,
                monthsElapsed,
                memoId: memo.id,
                memoNumber: memo.memoNumber,
                itemId: item.itemId,
                sku: item.sku,
                name: item.name,
                category: item.category,
                customerName: memo.personName,
                brokerName: memo.brokerName || '—',
                mfgCost,
                soldPrice: item.sellingPrice,
                profit,
                marginPct,
                monthlyProfitPct,
                notes: memo.notes || '',
                createdAt: new Date().toISOString()
              });
            } else {
              mainItem.issuedTo = null;
              mainItem.issuedBroker = null;
              mainItem.issuedMemoNumber = null;
            }
            mainItem.updatedAt = new Date().toISOString();
          }
        }
      });

      memo.status = 'closed';
      memo.closedAt = new Date().toISOString();

      DBManager.addLog(
        'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
        `Closed Memo ${memo.memoNumber} (${action === 'sold' ? 'Sold All' : 'Returned All to Stock'})`,
        []
      );

      try {
        UI.closeModal('modal-jewelry-memo-detail');
        UI.showToast(`Memo ${memo.memoNumber} marked as ${action === 'sold' ? 'Sold' : 'Returned to Stock'}.`);
        App.refreshAllDisplays();
        if (window.JewelrySalesController) window.JewelrySalesController.renderSalesList();
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  // ── Print PDF Receipt ──────────────────────────────────────────────────────

  printReceipt(memo) {
    const doc = this.generatePDF(memo);
    this.activePdfDocument = doc;

    const iframe = document.getElementById('print-preview-iframe');
    if (iframe) {
      iframe.src = doc.output('datauristring');
    }
    UI.closeModal('modal-jewelry-memo-detail');
    UI.openModal('modal-print-preview');
  },

  generatePDF(memo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Receipt header
    doc.setFont("georgia", "bold");
    doc.setFontSize(18);
    doc.text("MAVA GEMS - JEWELRY MEMO RECEIPT", 14, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Memo Number: ${memo.memoNumber}`, 14, 33);
    doc.text(`Issued To: ${memo.personName || '—'}`, 14, 38);
    doc.text(`Broker: ${memo.brokerName || '—'}`, 14, 43);
    doc.text(`Issue Date: ${new Date(memo.date).toLocaleDateString('en-IN')}`, 14, 48);
    doc.text(`Status: ${memo.status === 'open' ? 'ISSUED' : 'CLOSED'}`, 14, 53);

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(14, 57, 196, 57);

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SKU", 14, 63);
    doc.text("Description", 45, 63);
    doc.text("Category", 110, 63);
    doc.text("Status", 140, 63);
    doc.text("Selling Price", 170, 63);

    doc.line(14, 66, 196, 66);

    let y = 72;
    doc.setFont("helvetica", "normal");

    (memo.items || []).forEach(item => {
      const mainItem = DBManager.getItems().find(i => i.id === item.itemId || i.sku === item.sku);
      const imgSrc = item.image || (mainItem ? mainItem.image : null);
      const hasImg = imgSrc && imgSrc.startsWith('data:image/');
      const rowHeight = hasImg ? 16 : 8;

      if (y + rowHeight > 275) {
        doc.addPage();
        y = 25;
      }

      doc.setFont("helvetica", "bold");
      doc.text(item.sku, 14, y + (hasImg ? 4 : 0));
      doc.setFont("helvetica", "normal");
      doc.text(item.name.substring(0, hasImg ? 22 : 32), 45, y + (hasImg ? 2 : 0));

      if (hasImg) {
        try {
          const format = imgSrc.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(imgSrc, format, 45, y + 4, 12, 10);
        } catch (e) {
          // ignore PDF image rendering errors gracefully
        }
      }

      doc.text(item.category, 110, y + (hasImg ? 4 : 0));
      doc.text(item.status.toUpperCase(), 140, y + (hasImg ? 4 : 0));
      doc.text(`Rs ${item.sellingPrice.toLocaleString()}`, 170, y + (hasImg ? 4 : 0));
      y += rowHeight;
    });

    doc.line(14, y, 196, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Total Value", 140, y);
    doc.text(`Rs ${memo.totalValue.toLocaleString()}`, 170, y);

    if (memo.notes) {
      y += 12;
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(memo.notes, 14, y + 5, { maxWidth: 180 });
    }

    return doc;
  }
};

window.JewelryMemoController = JewelryMemoController;
