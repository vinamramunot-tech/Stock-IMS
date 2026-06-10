/**
 * Finished Jewelry Memos Controller Module
 * Manages issuing finished jewelry pieces to brokers.
 * Updates jewelry item statuses to "On Memo", "Sold", or reverts to "In Stock".
 */

const JewelryMemoController = {
  selectedItems: [], // Array of jewelry item objects
  activeActionContext: null,
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
    document.querySelectorAll('.modal-close-trigger-jewelry-memo-action').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewelry-memo-action-input'));
    });

    const btnSaveAction = document.getElementById('btn-save-jewelry-memo-action');
    if (btnSaveAction) {
      btnSaveAction.addEventListener('click', () => this.handleSaveMemoAction());
    }

    // Create Modal Search/Filters
    const searchInp = document.getElementById('jewelry-memo-create-search');
    if (searchInp) {
      searchInp.addEventListener('input', () => this.filterCreateJewelry());
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
      searchInput.addEventListener('input', () => this.renderMemoList());
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
      opt.textContent = '-- No available jewelry pieces --';
      selectEl.appendChild(opt);
      return;
    }

    filtered.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      // Get selling price
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
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:15px;color:var(--text-muted);">No pieces added to memo. Select a piece above and click "Add Piece".</td></tr>';
      this.updateSelectedTotals();
      return;
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;

    this.selectedItems.forEach((item, index) => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px 12px;font-weight:700;">${item.sku}</td>
        <td style="padding:8px 12px;">${item.name}</td>
        <td style="padding:8px 12px;">${item.category}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${evalItem.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;text-align:center;">
          <button type="button" class="btn btn-danger btn-small" style="font-size:10px;padding:3px 6px;" data-index="${index}">Remove</button>
        </td>
      `;

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
    const brokerName = (document.getElementById('jewelry-memo-broker-name').value || '').trim();
    const date = document.getElementById('jewelry-memo-date').value;
    const notes = (document.getElementById('jewelry-memo-notes').value || '').trim();

    if (!brokerName) { UI.showToast('Please enter a broker name.', true); return; }
    if (!date) { UI.showToast('Please select a memo date.', true); return; }
    if (this.selectedItems.length === 0) {
      UI.showToast('Please add at least one jewelry piece to the memo.', true);
      return;
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const memoNumber = this.getNextMemoNumber();

    const memoItems = this.selectedItems.map(item => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        sellingPrice: evalItem.sellingPrice,
        status: 'open' // open | returned | sold
      };
    });

    const totalValue = memoItems.reduce((sum, item) => sum + item.sellingPrice, 0);

    const memo = {
      id: 'jewelry_memo_' + Date.now(),
      memoNumber,
      brokerName,
      date,
      status: 'open', // open | closed
      createdAt: new Date().toISOString(),
      closedAt: null,
      notes,
      items: memoItems,
      totalValue
    };

    // Update statuses of jewelry pieces in main items array
    this.selectedItems.forEach(sel => {
      const item = DBManager.database.items.find(i => i.id === sel.id);
      if (item) {
        item.status = 'On Memo';
        item.updatedAt = new Date().toISOString();
      }
    });

    if (!DBManager.database.jewelryMemos) DBManager.database.jewelryMemos = [];
    DBManager.database.jewelryMemos.push(memo);

    DBManager.addLog(
      'ADD', memo.id, `Jewelry Memo ${memoNumber}`,
      `Issued jewelry memo ${memoNumber} to broker ${brokerName}: ₹${totalValue.toLocaleString()} (${memoItems.length} pieces)`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-create-jewelry-memo');
      UI.showToast(`Jewelry Memo ${memoNumber} issued to ${brokerName}`);
      App.refreshAllDisplays();
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
      open: { bg: 'rgba(74, 144, 226, 0.15)', color: 'var(--info-color)' },
      closed: { bg: 'rgba(140,140,160,0.15)', color: 'var(--text-muted)' }
    };

    filtered.forEach(memo => {
      const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      const st = statusStyle[memo.status] || statusStyle.closed;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700;font-family:var(--font-serif);">${UI.escapeHtml(memo.memoNumber)}</td>
        <td>${dateFmt}</td>
        <td style="font-weight:600;">${UI.escapeHtml(memo.brokerName)}</td>
        <td style="text-align:right;font-weight:700;">₹${(memo.totalValue || 0).toLocaleString()}</td>
        <td style="text-align:center;">${(memo.items || []).length}</td>
        <td>
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;
            font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
            background:${st.bg};color:${st.color};">
            ${memo.status}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-small btn-view-memo">View</button>
            ${memo.status === 'open' ? `
              <button type="button" class="btn btn-secondary btn-small btn-return-memo" style="font-size:11px;">Return All</button>
              <button type="button" class="btn btn-primary btn-small btn-sell-memo" style="font-size:11px;">Sell All</button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const retBtn = tr.querySelector('.btn-return-memo');
      const sellBtn = tr.querySelector('.btn-sell-memo');
      if (retBtn) retBtn.addEventListener('click', () => this.handleCloseMemo(memo.id, 'returned'));
      if (sellBtn) sellBtn.addEventListener('click', () => this.handleCloseMemo(memo.id, 'sold'));

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
    document.getElementById('jewelry-memo-detail-broker').textContent = memo.brokerName;
    document.getElementById('jewelry-memo-detail-date').textContent = dateFmt;
    document.getElementById('jewelry-memo-detail-status').textContent = memo.status.toUpperCase();
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
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px 10px;font-weight:700;">${item.sku}</td>
        <td style="padding:8px 10px;">${item.name}</td>
        <td style="padding:8px 10px;">${item.category}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;">₹${item.sellingPrice.toLocaleString()}</td>
        <td style="padding:8px 10px;text-align:center;">
          <span style="font-size:11px;font-weight:bold;text-transform:uppercase;color:${item.status === 'open' ? 'var(--info-color)' : item.status === 'returned' ? 'var(--text-muted)' : 'var(--text-gold-dark)'};">
            ${item.status}
          </span>
        </td>
        <td style="padding:8px 10px;text-align:center;">
          ${memo.status === 'open' && item.status === 'open' ? `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button type="button" class="btn btn-secondary btn-small btn-row-return" style="font-size:10px;padding:3px 6px;" data-index="${index}">Return</button>
              <button type="button" class="btn btn-primary btn-small btn-row-sell" style="font-size:10px;padding:3px 6px;" data-index="${index}">Sold</button>
            </div>
          ` : '—'}
        </td>
      `;

      if (memo.status === 'open' && item.status === 'open') {
        tr.querySelector('.btn-row-return').addEventListener('click', () => this.handleSaveMemoAction(memo.id, index, 'returned'));
        tr.querySelector('.btn-row-sell').addEventListener('click', () => this.handleSaveMemoAction(memo.id, index, 'sold'));
      }

      tbody.appendChild(tr);
    });

    // Print Receipt button wire up
    const btnPrintReceipt = document.getElementById('btn-jewelry-memo-print-receipt');
    if (btnPrintReceipt) {
      btnPrintReceipt.onclick = () => this.printReceipt(memo);
    }

    UI.openModal('modal-jewelry-memo-detail');
  },

  async handleSaveMemoAction(memoId, index, action) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    const item = memo.items[index];
    if (!item || item.status !== 'open') return;

    // Confirm action
    UI.confirm(`Are you sure you want to mark SKU: ${item.sku} as ${action}?`, async () => {
      item.status = action;

      // Update in main database
      const mainItem = DBManager.database.items.find(i => i.id === item.itemId);
      if (mainItem) {
        mainItem.status = action === 'returned' ? 'In Stock' : 'Sold';
        mainItem.updatedAt = new Date().toISOString();
      }

      // Check if all items in memo are processed
      const allDone = memo.items.every(it => it.status !== 'open');
      if (allDone) {
        memo.status = 'closed';
        memo.closedAt = new Date().toISOString();
      }

      DBManager.addLog(
        action === 'sold' ? 'EDIT' : 'EDIT',
        memo.id,
        `Jewelry Memo ${memo.memoNumber}`,
        `Marked SKU: ${item.sku} as ${action} on Memo ${memo.memoNumber}`,
        []
      );

      try {
        await DBManager.saveVault();
        UI.showToast(`Marked ${item.sku} as ${action}.`);
        App.refreshAllDisplays();
        this.openMemoDetail(memo.id);
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  handleCloseMemo(memoId, action) {
    const memos = DBManager.getJewelryMemos();
    const memo = memos.find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const actionLabel = action === 'sold'
      ? 'mark ALL remaining pieces as Sold'
      : 'mark ALL remaining pieces as Returned to Stock';

    UI.confirm(
      `Are you sure you want to ${actionLabel} for Memo ${memo.memoNumber}?`,
      async () => {
        memo.status = 'closed';
        memo.closedAt = new Date().toISOString();

        (memo.items || []).forEach(item => {
          if (item.status === 'open') {
            item.status = action === 'sold' ? 'sold' : 'returned';

            const mainItem = DBManager.database.items.find(i => i.id === item.itemId);
            if (mainItem) {
              mainItem.status = action === 'sold' ? 'Sold' : 'In Stock';
              mainItem.updatedAt = new Date().toISOString();
            }
          }
        });

        DBManager.addLog(
          'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
          `Fully closed Memo ${memo.memoNumber} (All remaining marked as ${action})`,
          []
        );

        try {
          await DBManager.saveVault();
          UI.closeModal('modal-jewelry-memo-detail');
          UI.showToast(`Memo ${memo.memoNumber} fully closed.`);
          App.refreshAllDisplays();
        } catch (err) {
          UI.showToast(err.message, true);
        }
      }
    );
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
    doc.text(`Broker / Party: ${memo.brokerName}`, 14, 38);
    doc.text(`Memo Date: ${new Date(memo.date).toLocaleDateString('en-IN')}`, 14, 43);
    doc.text(`Status: ${memo.status.toUpperCase()}`, 14, 48);

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(14, 52, 196, 52);

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SKU", 14, 58);
    doc.text("Description", 45, 58);
    doc.text("Category", 110, 58);
    doc.text("Item Status", 140, 58);
    doc.text("Selling Price", 170, 58);

    doc.line(14, 61, 196, 61);

    let y = 67;
    doc.setFont("helvetica", "normal");

    (memo.items || []).forEach(item => {
      if (y + 10 > 280) {
        doc.addPage();
        y = 25;
      }
      doc.setFont("helvetica", "bold");
      doc.text(item.sku, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(item.name.substring(0, 32), 45, y);
      doc.text(item.category, 110, y);
      doc.text(item.status.toUpperCase(), 140, y);
      doc.text(`Rs ${item.sellingPrice.toLocaleString()}`, 170, y);
      y += 8;
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
