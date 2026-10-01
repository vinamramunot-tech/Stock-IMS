/**
 * Finished Jewelry Memos Controller Module
 * Manages issuing finished jewelry pieces to people/clients with broker tracking.
 * Updates jewelry item statuses to "Issued", "Sold", or reverts to "In Stock".
 */

const JewelryMemoController = {
  selectedItems: [], // Array of jewelry item objects (catalog items)
  activePdfDocument: null,
  editingMemoId: null,        // When set, we are editing an existing memo
  lockedMemoItems: [],        // Sold/returned memo items shown read-only during edit
  originalOpenItemIds: [],    // Item IDs that were open at the start of edit (for diffing)

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

    // Close buttons inside jewelry memo modals — reset editingMemoId on close/cancel
    document.querySelectorAll('.modal-close-trigger-jewelry-memo').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingMemoId = null;
        UI.closeModal('modal-create-jewelry-memo');
      });
    });
    document.querySelectorAll('.modal-close-trigger-jewelry-memo-detail').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewelry-memo-detail'));
    });
    document.querySelectorAll('.modal-close-trigger-jewelry-sale').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-complete-jewelry-sale'));
    });
    document.querySelectorAll('.modal-close-trigger-jewelry-batch-sale').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-batch-jewelry-sale'));
    });

    // Create Modal Search/Filters
    const searchInp = document.getElementById('jewelry-memo-create-search');
    if (searchInp) {
      searchInp.addEventListener('input', () => this.filterCreateJewelry());
      searchInp.addEventListener('keyup', () => this.filterCreateJewelry());
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

    const btnConfirmBatchSale = document.getElementById('btn-confirm-jewelry-batch-sale');
    if (btnConfirmBatchSale) {
      btnConfirmBatchSale.addEventListener('click', () => this.handleConfirmBatchSale());
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
    this.editingMemoId = null;
    this.selectedItems = [];
    this.resetCreateMemoForm();
    const titleEl = document.getElementById('jewelry-memo-modal-title');
    if (titleEl) titleEl.textContent = 'Issue Finished Jewelry Memo';
    const saveBtn = document.getElementById('btn-save-jewelry-memo');
    if (saveBtn) saveBtn.textContent = 'Issue Memo';
    const pickerEl = document.getElementById('jewelry-memo-create-item-picker');
    if (pickerEl) pickerEl.style.display = '';
    UI.openModal('modal-create-jewelry-memo');
  },

  openEditMemoModal(memoId) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    this.editingMemoId = memoId;

    // Separate open items (editable) from sold/returned (locked)
    const openMemoItems = (memo.items || []).filter(mi => mi.status === 'open');
    const lockedItems   = (memo.items || []).filter(mi => mi.status !== 'open');

    // Resolve catalog objects for the open items so selectedItems has full item data and attach existing custom price
    this.selectedItems = openMemoItems
      .map(mi => {
        const item = DBManager.getItems().find(i => i.id === mi.itemId || i.sku === mi.sku);
        if (item) {
          const itemCopy = JSON.parse(JSON.stringify(item));
          itemCopy._memoSellingPrice = Number(mi.sellingPrice !== undefined ? mi.sellingPrice : (item.sellingPrice || 0));
          return itemCopy;
        }
        return null;
      })
      .filter(Boolean);

    // Store locked items and the original open IDs for diffing on save
    this.lockedMemoItems    = lockedItems;
    this.originalOpenItemIds = openMemoItems.map(mi => mi.itemId);

    // Pre-fill header fields
    const personInput = document.getElementById('jewelry-memo-person-name');
    if (personInput) personInput.value = memo.personName || memo.customerName || memo.issuedTo || '';
    const brokerInput = document.getElementById('jewelry-memo-broker-name');
    if (brokerInput) brokerInput.value = (memo.brokerName && memo.brokerName !== '—') ? memo.brokerName : '';
    const dateInput = document.getElementById('jewelry-memo-date');
    if (dateInput) dateInput.value = memo.date || '';
    const notesInput = document.getElementById('jewelry-memo-notes');
    if (notesInput) notesInput.value = memo.notes || '';

    this.populateBrokerDatalist();

    // Clear search fields
    const searchInp = document.getElementById('jewelry-memo-create-search');
    if (searchInp) searchInp.value = '';
    const catSelect = document.getElementById('jewelry-memo-create-category');
    if (catSelect) catSelect.value = '';

    // Show item picker — items CAN be changed in edit mode
    const pickerEl = document.getElementById('jewelry-memo-create-item-picker');
    if (pickerEl) pickerEl.style.display = '';

    // Update modal title & save button label
    const titleEl = document.getElementById('jewelry-memo-modal-title');
    if (titleEl) titleEl.textContent = `Edit Jewelry Memo — ${memo.memoNumber || '—'}`;
    const saveBtn = document.getElementById('btn-save-jewelry-memo');
    if (saveBtn) saveBtn.textContent = 'Save Changes';

    // Render tables & refresh picker
    this.filterCreateJewelry();
    this.renderSelectedItemsTable();

    UI.closeModal('modal-jewelry-memo-detail');
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

    const query = (document.getElementById('jewelry-memo-create-search')?.value || '').toLowerCase().trim();
    const catSelect = document.getElementById('jewelry-memo-create-category');
    const catVal = catSelect ? catSelect.value : '';

    // In edit mode, items that are "Issued" to THIS memo but not yet in selectedItems are also eligible to re-add
    const editingMemo = this.editingMemoId
      ? DBManager.getJewelryMemos().find(m => m.id === this.editingMemoId)
      : null;

    const items = DBManager.getItems();
    const filtered = items.filter(item => {
      const status = item.status || 'In Stock';
      const isInStock = status === 'In Stock';
      const isIssuedToThisMemo = editingMemo && status === 'Issued'
        && item.issuedMemoNumber === editingMemo.memoNumber;

      if (!isInStock && !isIssuedToThisMemo) return false;

      // Must not be already in our selections
      if (this.selectedItems.some(sel => sel.id === item.id)) return false;

      // Category filter check (only if category is selected)
      if (catVal && (item.category || '').toLowerCase() !== catVal.toLowerCase()) return false;

      if (query) {
        const name = (item.name || '').toLowerCase();
        const sku = (item.sku || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const sno = String(item.sno || '');
        
        // Also match stones & metals inside the piece
        const stonesMatch = (item.stones || []).some(s => (s.type || '').toLowerCase().includes(query) || (s.name || '').toLowerCase().includes(query));
        const metalsMatch = (item.metals || []).some(m => (m.name || '').toLowerCase().includes(query) || String(m.karat || '').includes(query));

        return name.includes(query) || sku.includes(query) || desc.includes(query) || cat.includes(query) || sno.includes(query) || stonesMatch || metalsMatch;
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
      const commVal = typeof item.commission === 'object' ? Number(item.commission.value || 0) : Number(item.commission || 0);
      const commStr = commVal > 0 ? ` | Comm: ₹${commVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '';
      opt.textContent = `${item.sku || 'No SKU'} — ${item.name || 'Untitled'} (${item.category || 'Piece'} | Val: ₹${evaluation.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}${commStr})`;
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

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const evalItem = Calc.evaluateItem(item, goldRate);
    const itemCopy = JSON.parse(JSON.stringify(item));
    itemCopy._memoSellingPrice = evalItem.sellingPrice;

    this.selectedItems.push(itemCopy);
    this.filterCreateJewelry();
    this.renderSelectedItemsTable();
  },

  renderSelectedItemsTable() {
    const tbody = document.getElementById('jewelry-memo-selected-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const hasLocked = this.editingMemoId && this.lockedMemoItems.length > 0;

    if (this.selectedItems.length === 0 && !hasLocked) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:15px;color:var(--text-muted);">No pieces added to memo. Select a piece above and click "Add Piece".</td></tr>';
      this.updateSelectedTotals();
      return;
    }

    // Render active / open items with editable selling price and Remove button
    this.selectedItems.forEach((item, index) => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const commVal = typeof item.commission === 'object' ? Number(item.commission.value || 0) : Number(item.commission || 0);
      const commHtml = commVal > 0 ? `<div style="font-size:10px;color:var(--text-muted);font-weight:400;margin-top:2px;">Comm: ₹${commVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>` : '';
      const currentPrice = item._memoSellingPrice !== undefined ? item._memoSellingPrice : evalItem.sellingPrice;
      const tr = document.createElement('tr');
      const imgHtml = item.image
        ? `<img src="${item.image}" alt="${UI.escapeHtml(item.name)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);cursor:pointer;" class="memo-thumb-img">`
        : `<div style="width:36px;height:36px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

      tr.innerHTML = `
        <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
        <td style="padding:8px 12px;font-weight:700;">${UI.escapeHtml(item.sku)}</td>
        <td style="padding:8px 12px;">${UI.escapeHtml(item.name)}</td>
        <td style="padding:8px 12px;">${UI.escapeHtml(item.category)}</td>
        <td style="padding:6px 10px;text-align:right;">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;">
            <span style="font-size:12px;color:var(--text-muted);font-weight:600;">₹</span>
            <input type="number" step="0.01" min="0" class="memo-draft-item-price" data-index="${index}" value="${currentPrice}" style="width:115px;height:28px;text-align:right;padding:2px 6px;border:1px solid var(--border-light);border-radius:4px;background:var(--bg-base);color:var(--text-gold-dark);font-weight:700;font-size:12px;" title="Custom selling price for this client">
          </div>
          ${commHtml}
        </td>
        <td style="padding:8px 12px;text-align:center;">
          <button type="button" class="btn btn-danger btn-small" style="font-size:10px;padding:3px 6px;" data-index="${index}">Remove</button>
        </td>
      `;

      const thumbImg = tr.querySelector('.memo-thumb-img');
      if (thumbImg) thumbImg.addEventListener('click', () => App.openJewelryDetailModal(item));

      const priceInp = tr.querySelector('.memo-draft-item-price');
      if (priceInp) {
        priceInp.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val) && this.selectedItems[index]) {
            this.selectedItems[index]._memoSellingPrice = val;
            this.updateSelectedTotals();
          }
        });
      }

      tr.querySelector('.btn-danger').addEventListener('click', () => {
        this.selectedItems.splice(index, 1);
        this.filterCreateJewelry();
        this.renderSelectedItemsTable();
      });

      tbody.appendChild(tr);
    });

    // In edit mode, render locked (sold/returned) items as read-only rows at the bottom
    if (hasLocked) {
      const dividerTr = document.createElement('tr');
      dividerTr.innerHTML = `<td colspan="6" style="padding:6px 10px;background:var(--bg-base);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);border-top:2px solid var(--border-light);">Already Sold / Returned — Cannot Change</td>`;
      tbody.appendChild(dividerTr);

      this.lockedMemoItems.forEach(mi => {
        const mainItem = DBManager.getItems().find(i => i.id === mi.itemId || i.sku === mi.sku);
        const imgSrc = mi.image || (mainItem ? mainItem.image : null);
        const imgHtml = imgSrc
          ? `<img src="${imgSrc}" alt="${UI.escapeHtml(mi.name)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);opacity:0.5;">`
          : `<div style="width:36px;height:36px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);opacity:0.4;"></div>`;
        const badge = mi.status === 'sold'
          ? `<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:rgba(212,175,55,0.15);color:var(--text-gold-dark);">SOLD</span>`
          : `<span style="padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:rgba(80,200,120,0.12);color:var(--success-color);">RETURNED</span>`;
        const tr = document.createElement('tr');
        tr.style.opacity = '0.6';
        tr.innerHTML = `
          <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
          <td style="padding:8px 12px;font-weight:700;">${UI.escapeHtml(mi.sku)}</td>
          <td style="padding:8px 12px;">${UI.escapeHtml(mi.name)}</td>
          <td style="padding:8px 12px;">${UI.escapeHtml(mi.category)}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--text-muted);">₹${(mi.sellingPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px 12px;text-align:center;">${badge}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    this.updateSelectedTotals();
  },

  updateSelectedTotals() {
    const countEl = document.getElementById('jewelry-memo-item-count');
    const valueEl = document.getElementById('jewelry-memo-total-value');
    if (!countEl || !valueEl) return;

    countEl.textContent = this.selectedItems.length;

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const totalVal = this.selectedItems.reduce((sum, item) => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const price = item._memoSellingPrice !== undefined ? Number(item._memoSellingPrice) : evalItem.sellingPrice;
      return sum + (isNaN(price) ? 0 : price);
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

    // ── EDIT MODE ──────────────────────────────────────────────────────────────
    if (this.editingMemoId) {
      const memo = DBManager.getJewelryMemos().find(m => m.id === this.editingMemoId);
      if (!memo) { UI.showToast('Memo not found.', true); return; }

      const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;

      // Diff: what changed vs what was originally open
      const newOpenIds      = new Set(this.selectedItems.map(i => i.id));
      const originalIds     = new Set(this.originalOpenItemIds);
      const removedIds      = [...originalIds].filter(id => !newOpenIds.has(id));
      const addedItems      = this.selectedItems.filter(i => !originalIds.has(i.id));

      // Process removals: revert catalog item to In Stock, remove from memo.items
      removedIds.forEach(id => {
        const mainItem = DBManager.database.items.find(i => i.id === id);
        if (mainItem) {
          mainItem.status = 'In Stock';
          mainItem.issuedTo = null;
          mainItem.issuedBroker = null;
          mainItem.issuedMemoNumber = null;
          mainItem.updatedAt = new Date().toISOString();
        }
        memo.items = memo.items.filter(mi => mi.itemId !== id);
      });

      // Process additions: add to memo.items and mark catalog item as Issued
      addedItems.forEach(item => {
        const evalItem = Calc.evaluateItem(item, goldRate);
        const mfgCost = (evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (item.mfgCostPrice || evalItem.marketCostPrice || 0);
        const customPrice = item._memoSellingPrice !== undefined ? Number(item._memoSellingPrice) : evalItem.sellingPrice;
        memo.items.push({
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          image: item.image || null,
          mfgCost,
          sellingPrice: isNaN(customPrice) ? evalItem.sellingPrice : customPrice,
          status: 'open'
        });
        const mainItem = DBManager.database.items.find(i => i.id === item.id);
        if (mainItem) {
          mainItem.status = 'Issued';
          mainItem.issuedTo = personName;
          mainItem.issuedBroker = brokerName || '—';
          mainItem.issuedMemoNumber = memo.memoNumber;
          mainItem.updatedAt = new Date().toISOString();
        }
      });

      // Update selling prices and issuedTo / issuedBroker on existing open items
      memo.items.filter(mi => mi.status === 'open').forEach(mi => {
        const matchedSel = this.selectedItems.find(i => i.id === mi.itemId || i.sku === mi.sku);
        if (matchedSel && matchedSel._memoSellingPrice !== undefined) {
          mi.sellingPrice = Number(matchedSel._memoSellingPrice);
        }
        const mainItem = DBManager.database.items.find(i => i.id === mi.itemId || i.sku === mi.sku);
        if (mainItem) {
          mainItem.issuedTo = personName;
          mainItem.issuedBroker = brokerName || '—';
          mainItem.updatedAt = new Date().toISOString();
        }
      });

      // Recalculate total value from all open memo items
      memo.totalValue = memo.items
        .filter(mi => mi.status === 'open')
        .reduce((sum, mi) => sum + (mi.sellingPrice || 0), 0);

      // Update header fields
      memo.personName = personName;
      memo.brokerName = brokerName || '—';
      memo.date = date;
      memo.notes = notes;

      DBManager.addLog(
        'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
        `Edited Jewelry Memo ${memo.memoNumber} — ${removedIds.length} piece(s) removed, ${addedItems.length} piece(s) added. Person: "${personName}", Broker: "${brokerName || '—'}".`,
        []
      );

      try {
        this.editingMemoId = null;
        this.lockedMemoItems = [];
        this.originalOpenItemIds = [];
        UI.closeModal('modal-create-jewelry-memo');
        UI.showToast(`Jewelry Memo ${memo.memoNumber} updated successfully.`);
        App.refreshAllDisplays();
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast(err.message, true);
      }
      return;
    }

    // ── CREATE MODE ────────────────────────────────────────────────────────────
    if (this.selectedItems.length === 0) {
      UI.showToast('Please add at least one jewelry piece to issue on memo.', true);
      return;
    }

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const memoNumber = this.getNextMemoNumber();

    const memoItems = this.selectedItems.map(item => {
      const evalItem = Calc.evaluateItem(item, goldRate);
      const mfgCost = (evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (item.mfgCostPrice || evalItem.marketCostPrice || 0);
      const customPrice = item._memoSellingPrice !== undefined ? Number(item._memoSellingPrice) : evalItem.sellingPrice;

      return {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        image: item.image || null,
        mfgCost,
        sellingPrice: isNaN(customPrice) ? evalItem.sellingPrice : customPrice,
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
    const totalValOnMemo = openMemos.reduce((s, m) => s + (Number(m.totalValue) || 0), 0);

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
        (m.personName || m.customerName || m.issuedTo || '').toLowerCase().includes(query) ||
        (m.brokerName || '').toLowerCase().includes(query) ||
        (m.memoNumber || '').toLowerCase().includes(query);
      return matchStatus && matchSearch;
    });

    filtered.sort((a, b) => {
      const timeB = new Date(b.createdAt || b.date || 0).getTime() || 0;
      const timeA = new Date(a.createdAt || a.date || 0).getTime() || 0;
      return timeB - timeA;
    });

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

    const fragment = document.createDocumentFragment();

    filtered.forEach(memo => {
      let dateFmt = '—';
      if (memo.date) {
        const d = new Date(memo.date.includes('T') ? memo.date : memo.date + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          dateFmt = d.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
          });
        }
      }
      const st = statusStyle[memo.status] || statusStyle.closed;

      const person = memo.personName || memo.customerName || memo.issuedTo;
      const broker = memo.brokerName && memo.brokerName !== '—' ? memo.brokerName : '';
      const recipientDisplay = person
        ? `<div><strong style="color:var(--text-main);">${UI.escapeHtml(person)}</strong>${broker ? `<br><span style="font-size:11px;color:var(--text-muted);">Broker: ${UI.escapeHtml(broker)}</span>` : ''}</div>`
        : UI.escapeHtml(broker || '—');

      const memoNumberDisplay = memo.memoNumber || '—';
      const totalVal = Number(memo.totalValue) || 0;
      const itemCount = Array.isArray(memo.items) ? memo.items.length : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700;font-family:var(--font-serif);">${UI.escapeHtml(memoNumberDisplay)}</td>
        <td>${dateFmt}</td>
        <td>${recipientDisplay}</td>
        <td style="text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:center;">${itemCount}</td>
        <td>
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;
            font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
            background:${st.bg};color:${st.color};border:1px solid ${st.border};">
            ${memo.status === 'open' ? 'ISSUED' : 'CLOSED'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;">
            <button type="button" class="btn btn-secondary btn-small btn-view-memo">View</button>
            ${memo.status === 'open' ? `
              <button type="button" class="btn btn-secondary btn-small btn-return-memo" style="font-size:11px;">Return All</button>
              <button type="button" class="btn btn-primary btn-small btn-sell-memo" style="font-size:11px;background:#22c55e;border-color:#22c55e;color:#fff;">Sell All</button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-small btn-delete-memo" style="font-size:11px;color:var(--danger-red, #ef4444);border-color:rgba(239,68,68,0.3);" title="Delete Memo">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const retBtn = tr.querySelector('.btn-return-memo');
      const sellBtn = tr.querySelector('.btn-sell-memo');
      const delBtn = tr.querySelector('.btn-delete-memo');
      if (retBtn) retBtn.addEventListener('click', () => this.handleBatchMemoAction(memo.id, 'returned'));
      if (sellBtn) sellBtn.addEventListener('click', () => this.handleBatchMemoAction(memo.id, 'sold'));
      if (delBtn) delBtn.addEventListener('click', () => this.handleDeleteMemo(memo.id));

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
  },

  openMemoDetail(memoId) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    let dateFmt = '—';
    if (memo.date) {
      const d = new Date(memo.date.includes('T') ? memo.date : memo.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        dateFmt = d.toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric'
        });
      }
    }

    const memoNumEl = document.getElementById('jewelry-memo-detail-number');
    if (memoNumEl) memoNumEl.textContent = memo.memoNumber || '—';
    const personEl = document.getElementById('jewelry-memo-detail-person');
    if (personEl) personEl.textContent = memo.personName || memo.customerName || memo.issuedTo || '—';
    const brokerEl = document.getElementById('jewelry-memo-detail-broker');
    if (brokerEl) brokerEl.textContent = memo.brokerName || '—';
    const dateEl = document.getElementById('jewelry-memo-detail-date');
    if (dateEl) dateEl.textContent = dateFmt;
    const statusEl = document.getElementById('jewelry-memo-detail-status');
    if (statusEl) statusEl.textContent = memo.status === 'open' ? 'ISSUED' : 'CLOSED';
    const notesEl = document.getElementById('jewelry-memo-detail-notes');
    if (notesEl) notesEl.textContent = memo.notes || '—';
    const valEl = document.getElementById('jewelry-memo-detail-total-value');
    if (valEl) valEl.textContent = '₹' + (Number(memo.totalValue) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

    const closedRow = document.getElementById('jewelry-memo-detail-closed-row');
    if (memo.closedAt && closedRow) {
      const cd = new Date(memo.closedAt);
      const cdFmt = !isNaN(cd.getTime()) ? cd.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
      const closedAtEl = document.getElementById('jewelry-memo-detail-closed-at');
      if (closedAtEl) closedAtEl.textContent = cdFmt;
      closedRow.classList.remove('hidden');
    } else if (closedRow) {
      closedRow.classList.add('hidden');
    }

    const tbody = document.getElementById('jewelry-memo-detail-items-tbody');
    if (tbody) {
      tbody.innerHTML = '';

      (memo.items || []).forEach((item, index) => {
        const mainItem = DBManager.getItems().find(i => i.id === item.itemId || i.sku === item.sku);
        const imgSrc = item.image || (mainItem ? mainItem.image : null);
        const sku = item.sku || mainItem?.sku || '—';
        const name = item.name || mainItem?.name || 'Unnamed Piece';
        const category = item.category || mainItem?.category || '—';
        const price = Number(item.sellingPrice !== undefined ? item.sellingPrice : (mainItem?.sellingPrice || 0));

        const imgHtml = imgSrc
          ? `<img src="${imgSrc}" alt="${UI.escapeHtml(name)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);cursor:pointer;" class="memo-detail-thumb-img">`
          : `<div style="width:36px;height:36px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

        const statusBadge = item.status === 'open'
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);">ISSUED</span>`
          : item.status === 'returned'
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(80,200,120,0.15);color:var(--success-color);">RETURNED</span>`
          : `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:rgba(212,175,55,0.15);color:var(--text-gold-dark);">SOLD</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
          <td style="padding:8px 10px;font-weight:700;">${UI.escapeHtml(sku)}</td>
          <td style="padding:8px 10px;">${UI.escapeHtml(name)}</td>
          <td style="padding:8px 10px;">${UI.escapeHtml(category)}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-gold-dark);">₹${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
    }

    // Wire Batch Actions & Delete in footer
    const actionsFooter = document.getElementById('jewelry-memo-detail-actions');
    if (actionsFooter) {
      actionsFooter.innerHTML = `
        ${memo.status === 'open' ? `
          <button type="button" class="btn btn-secondary" id="btn-memo-detail-edit-memo" style="font-size:12px;">✏️ Edit Memo</button>
          <button type="button" class="btn btn-secondary" id="btn-memo-detail-return-all">Return All to Stock</button>
          <button type="button" class="btn btn-primary" id="btn-memo-detail-sell-all" style="background:#22c55e;border-color:#22c55e;color:#fff;">Sell All Pieces</button>
        ` : ''}
        <button type="button" class="btn btn-secondary" id="btn-memo-detail-delete-memo" style="color:var(--danger-red, #ef4444);border-color:rgba(239,68,68,0.3);">Delete Memo</button>
      `;
      const editBtn = document.getElementById('btn-memo-detail-edit-memo');
      if (editBtn) editBtn.onclick = () => this.openEditMemoModal(memo.id);
      const retAllBtn = document.getElementById('btn-memo-detail-return-all');
      if (retAllBtn) retAllBtn.onclick = () => this.handleBatchMemoAction(memo.id, 'returned');
      const sellAllBtn = document.getElementById('btn-memo-detail-sell-all');
      if (sellAllBtn) sellAllBtn.onclick = () => this.handleBatchMemoAction(memo.id, 'sold');
      const delMemoBtn = document.getElementById('btn-memo-detail-delete-memo');
      if (delMemoBtn) delMemoBtn.onclick = () => this.handleDeleteMemo(memo.id);
    }

    // Print Receipt button wire up
    const btnPrintReceipt = document.getElementById('btn-jewelry-memo-print-receipt');
    if (btnPrintReceipt) {
      btnPrintReceipt.onclick = () => this.printReceipt(memo);
    }

    UI.openModal('modal-jewelry-memo-detail');
  },

  async handleDeleteMemo(memoId) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo) return;

    UI.confirm(
      `Are you sure you want to permanently delete Memo ${memo.memoNumber}?\n\nThis will remove the memo record and restore any unsold pieces back to "In Stock" inventory.`,
      async () => {
        let restoredCount = 0;

        // Restore items attached to this memo back to In Stock if not sold
        (memo.items || []).forEach(memoItem => {
          const mainItem = DBManager.database.items.find(i => i.id === memoItem.itemId || i.sku === memoItem.sku);
          if (mainItem) {
            if (memoItem.status === 'open') {
              mainItem.status = 'In Stock';
              delete mainItem.issuedTo;
              delete mainItem.issuedBroker;
              delete mainItem.issuedMemoNumber;
              mainItem.updatedAt = new Date().toISOString();
              restoredCount++;
            }
          }
        });

        // Delete memo from storage
        DBManager.database.jewelryMemos = (DBManager.database.jewelryMemos || []).filter(m => m.id !== memoId);

        DBManager.addLog(
          'DELETE',
          memo.id,
          `Jewelry Memo ${memo.memoNumber}`,
          `Deleted Jewelry Memo ${memo.memoNumber} (${memo.personName || 'No recipient'}). ${restoredCount > 0 ? `Restored ${restoredCount} piece(s) back to In Stock.` : ''}`,
          []
        );

        try {
          await DBManager.saveVault();
          UI.closeModal('modal-jewelry-memo-detail');
          UI.showToast(`Jewelry Memo ${memo.memoNumber} deleted successfully.`);
          App.refreshAllDisplays();
          this.renderMemoList();
        } catch (err) {
          UI.showToast("Error deleting memo: " + err.message, true);
        }
      }
    );
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

    const titleEl = document.getElementById('jewelry-sale-modal-title');
    if (titleEl) titleEl.textContent = "Complete Jewelry Sale";
    const btnConfirm = document.getElementById('btn-confirm-jewelry-sale');
    if (btnConfirm) btnConfirm.textContent = "Confirm & Finalize Sale";
    const saleIdInput = document.getElementById('jewelry-sale-id');
    if (saleIdInput) saleIdInput.value = '';

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
    const mfgCost = (mainItem && mainItem.mfgCostPrice && Number(mainItem.mfgCostPrice) > 0)
      ? Number(mainItem.mfgCostPrice)
      : ((evalItem && evalItem.mfgGrandTotal) ? evalItem.mfgGrandTotal : (memoItem?.mfgCost || (mainItem?.mfgCostPrice || 0)));
    const replacementCost = (evalItem && evalItem.marketCostPrice) ? evalItem.marketCostPrice : mfgCost;

    const mfgCostEl = document.getElementById('jewelry-sale-mfg-cost');
    if (mfgCostEl) {
      mfgCostEl.value = `₹${mfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      mfgCostEl.dataset.mfgCost = mfgCost;
    }

    const repCostEl = document.getElementById('jewelry-sale-replacement-cost');
    if (repCostEl) {
      repCostEl.value = `₹${replacementCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      repCostEl.dataset.replacementCost = replacementCost;
    }

    const initialPrice = memoItem ? memoItem.sellingPrice : (evalItem ? evalItem.sellingPrice : 0);
    document.getElementById('jewelry-sale-final-price').value = initialPrice;
    document.getElementById('jewelry-sale-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('jewelry-sale-notes').value = '';

    this.updateSaleProfitCalculation();
    UI.openModal('modal-complete-jewelry-sale');
  },

  updateSaleProfitCalculation() {
    const mfgCost = parseFloat(document.getElementById('jewelry-sale-mfg-cost')?.dataset.mfgCost || 0);
    const repCost = parseFloat(document.getElementById('jewelry-sale-replacement-cost')?.dataset.replacementCost || mfgCost);
    const finalPrice = parseFloat(document.getElementById('jewelry-sale-final-price')?.value || 0);

    const mfgProfitEl = document.getElementById('jewelry-sale-mfg-profit-display');
    const repProfitEl = document.getElementById('jewelry-sale-rep-profit-display');

    const mfgProfit = finalPrice - mfgCost;
    const mfgMarginPct = mfgCost > 0 ? ((mfgProfit / mfgCost) * 100).toFixed(2) : '0.00';
    const mfgSign = mfgProfit >= 0 ? '+' : '';
    const mfgColor = mfgProfit >= 0 ? '#22c55e' : '#ef4444';

    if (mfgProfitEl) {
      mfgProfitEl.textContent = `₹${mfgProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${mfgSign}${mfgMarginPct}%)`;
      mfgProfitEl.style.color = mfgColor;
    }

    const repProfit = finalPrice - repCost;
    const repMarginPct = repCost > 0 ? ((repProfit / repCost) * 100).toFixed(2) : '0.00';
    const repSign = repProfit >= 0 ? '+' : '';
    const repColor = repProfit >= 0 ? 'var(--info-color, #38bdf8)' : '#ef4444';

    if (repProfitEl) {
      repProfitEl.textContent = `₹${repProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${repSign}${repMarginPct}%)`;
      repProfitEl.style.color = repColor;
    }
  },

  async handleConfirmJewelrySale() {
    const saleId = document.getElementById('jewelry-sale-id')?.value;
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
    const replacementCost = parseFloat(document.getElementById('jewelry-sale-replacement-cost')?.dataset.replacementCost || mfgCost);
    const profit = finalSoldPrice - mfgCost;
    const marginPct = mfgCost > 0 ? (profit / mfgCost) * 100 : 0;
    const replacementProfit = finalSoldPrice - replacementCost;
    const replacementMarginPct = replacementCost > 0 ? (replacementProfit / replacementCost) * 100 : 0;
    const goldCommodityGain = replacementCost - mfgCost;

    let mainItem = DBManager.database.items.find(i => i.id === itemId || i.sku === itemId);
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

    if (saleId) {
      // ── Updating an existing sale record ──────────────────────────────
      let existingSale = DBManager.database.jewelrySales.find(s => s.id === saleId || s.itemId === itemId);
      if (existingSale) {
        existingSale.soldPrice = finalSoldPrice;
        existingSale.mfgCost = mfgCost;
        existingSale.replacementCost = replacementCost;
        existingSale.profit = profit;
        existingSale.mfgProfit = profit;
        existingSale.marginPct = marginPct;
        existingSale.mfgMarginPct = marginPct;
        existingSale.replacementProfit = replacementProfit;
        existingSale.replacementMarginPct = replacementMarginPct;
        existingSale.goldCommodityGain = goldCommodityGain;
        existingSale.monthlyProfitPct = monthlyProfitPct;
        existingSale.customerName = customerName;
        existingSale.brokerName = brokerName || '—';
        existingSale.saleDate = saleDate;
        existingSale.notes = notes;
      } else {
        existingSale = {
          id: saleId.startsWith('legacy_') ? ('jsale_' + Date.now()) : saleId,
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
          replacementCost,
          soldPrice: finalSoldPrice,
          profit,
          mfgProfit: profit,
          marginPct,
          mfgMarginPct: marginPct,
          replacementProfit,
          replacementMarginPct,
          goldCommodityGain,
          monthlyProfitPct,
          notes,
          createdAt: new Date().toISOString()
        };
        DBManager.database.jewelrySales.push(existingSale);
      }

      if (mainItem) {
        mainItem.status = 'Sold';
        mainItem.soldPrice = finalSoldPrice;
        mainItem.soldDate = saleDate;
        mainItem.soldTo = customerName;
        mainItem.soldBroker = brokerName;
        mainItem.updatedAt = new Date().toISOString();
      }

      if (memoId) {
        const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
        if (memo && memo.items) {
          const mItem = memo.items.find(it => it.itemId === itemId || it.sku === pieceSku);
          if (mItem) {
            mItem.soldPrice = finalSoldPrice;
          }
        }
      }

      DBManager.addLog(
        'EDIT',
        mainItem ? mainItem.id : itemId,
        `Sale Price Updated`,
        `Updated sale price for ${pieceSku} (${pieceName}) to ₹${finalSoldPrice.toLocaleString()} (Profit: ₹${profit.toLocaleString()})`,
        []
      );

      try {
        UI.closeModal('modal-complete-jewelry-sale');
        UI.showToast(`Sale price updated for SKU: ${pieceSku} to ₹${finalSoldPrice.toLocaleString()}!`);
        App.refreshAllDisplays();
        if (window.JewelrySalesController) window.JewelrySalesController.renderSalesList();
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast(err.message, true);
      }
      return;
    }

    // ── Creating a new sale record ────────────────────────────────────
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
      itemSnapshot: mainItem ? JSON.parse(JSON.stringify(mainItem)) : null,
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
      mainItem.sno = null;
      mainItem.soldPrice = finalSoldPrice;
      mainItem.soldDate = saleDate;
      mainItem.soldTo = customerName;
      mainItem.soldBroker = brokerName;
      mainItem.updatedAt = new Date().toISOString();
    }

    // Resequence remaining active inventory serial numbers
    DBManager.resequenceJewelrySno();

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

    if (action === 'sold') {
      this.openBatchSaleModal(memoId);
      return;
    }

    // Action: Returned
    UI.confirm(`Are you sure you want to return ALL remaining pieces from Memo ${memo.memoNumber} back to In Stock inventory?`, async () => {
      (memo.items || []).forEach(item => {
        if (item.status === 'open') {
          item.status = 'returned';

          const mainItem = DBManager.database.items.find(i => i.id === item.itemId || i.sku === item.sku);
          if (mainItem) {
            mainItem.status = 'In Stock';
            mainItem.issuedTo = null;
            mainItem.issuedBroker = null;
            mainItem.issuedMemoNumber = null;
            mainItem.updatedAt = new Date().toISOString();
          }
        }
      });

      // Resequence remaining active inventory serial numbers
      DBManager.resequenceJewelrySno();

      memo.status = 'closed';
      memo.closedAt = new Date().toISOString();

      DBManager.addLog(
        'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
        `Closed Memo ${memo.memoNumber} (Returned All to Stock)`,
        []
      );

      try {
        UI.closeModal('modal-jewelry-memo-detail');
        UI.showToast(`Memo ${memo.memoNumber} marked as Returned to Stock.`);
        App.refreshAllDisplays();
        if (window.JewelrySalesController) window.JewelrySalesController.renderSalesList();
        await DBManager.saveVault();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  openBatchSaleModal(memoId) {
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const openItems = (memo.items || []).filter(mi => mi.status === 'open');
    if (openItems.length === 0) {
      UI.showToast('No open pieces on this memo to sell.', true);
      return;
    }

    const titleEl = document.getElementById('jewelry-batch-sale-modal-title');
    if (titleEl) titleEl.textContent = `Sell Memo Pieces — ${memo.memoNumber}`;

    const memoIdInp = document.getElementById('jewelry-batch-sale-memo-id');
    if (memoIdInp) memoIdInp.value = memo.id;

    const custInp = document.getElementById('jewelry-batch-sale-customer-name');
    if (custInp) custInp.value = memo.personName || memo.customerName || memo.issuedTo || '';

    const brokerInp = document.getElementById('jewelry-batch-sale-broker-name');
    if (brokerInp) brokerInp.value = (memo.brokerName && memo.brokerName !== '—') ? memo.brokerName : '';

    const dateInp = document.getElementById('jewelry-batch-sale-date');
    if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];

    const notesInp = document.getElementById('jewelry-batch-sale-notes');
    if (notesInp) notesInp.value = memo.notes || '';

    const tbody = document.getElementById('jewelry-batch-sale-tbody');
    if (tbody) {
      tbody.innerHTML = '';

      openItems.forEach((memoItem, idx) => {
        const mainItem = DBManager.getItems().find(i => i.id === memoItem.itemId || i.sku === memoItem.sku);
        const imgSrc = memoItem.image || (mainItem ? mainItem.image : null);
        const imgHtml = imgSrc
          ? `<img src="${imgSrc}" alt="${UI.escapeHtml(memoItem.name)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--border-light);">`
          : `<div style="width:32px;height:32px;border-radius:4px;border:1px solid var(--border-light);background:var(--bg-base);display:flex;align-items:center;justify-content:center;color:var(--text-muted);opacity:0.6;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

        const mfgCost = Number(memoItem.mfgCost || mainItem?.mfgCostPrice || 0);
        const initialSellingPrice = Number(memoItem.sellingPrice !== undefined ? memoItem.sellingPrice : (mainItem?.sellingPrice || 0));

        const tr = document.createElement('tr');
        tr.dataset.itemId = memoItem.itemId;
        tr.dataset.mfgCost = mfgCost;

        tr.innerHTML = `
          <td style="padding:6px 10px;text-align:center;">${imgHtml}</td>
          <td style="padding:6px 10px;">
            <div style="font-weight:700;color:var(--text-main);">${UI.escapeHtml(memoItem.sku || mainItem?.sku || '—')}</div>
            <div style="font-size:11px;color:var(--text-muted);">${UI.escapeHtml(memoItem.name || mainItem?.name || 'Unnamed')}</div>
          </td>
          <td style="padding:6px 10px;color:var(--text-muted);">${UI.escapeHtml(memoItem.category || mainItem?.category || '—')}</td>
          <td style="padding:6px 10px;text-align:right;font-weight:600;color:var(--text-main);">₹${mfgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style="padding:6px 10px;text-align:right;">
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;">
              <span style="font-size:11px;color:var(--text-muted);font-weight:600;">₹</span>
              <input type="number" step="0.01" min="0" class="batch-sale-item-price" value="${initialSellingPrice}" style="width:115px;height:28px;text-align:right;padding:2px 6px;border:1px solid var(--border-light);border-radius:4px;background:var(--bg-base);color:var(--text-gold-dark);font-weight:700;font-size:12px;" title="Custom selling price for this client">
            </div>
          </td>
          <td style="padding:6px 10px;text-align:right;font-weight:700;" class="batch-sale-item-profit">₹0.00</td>
        `;

        const priceInp = tr.querySelector('.batch-sale-item-price');
        if (priceInp) {
          priceInp.addEventListener('input', () => this.updateBatchSaleTotals());
        }

        tbody.appendChild(tr);
      });
    }

    this.updateBatchSaleTotals();
    UI.openModal('modal-batch-jewelry-sale');
  },

  updateBatchSaleTotals() {
    const tbody = document.getElementById('jewelry-batch-sale-tbody');
    if (!tbody) return;

    let totalMfg = 0;
    let totalPrice = 0;
    let totalProfit = 0;
    let count = 0;

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      count++;
      const mfgCost = parseFloat(tr.dataset.mfgCost || 0);
      const priceInp = tr.querySelector('.batch-sale-item-price');
      const price = parseFloat(priceInp?.value || 0);
      const profit = price - mfgCost;
      const marginPct = mfgCost > 0 ? ((profit / mfgCost) * 100).toFixed(1) : '0.0';
      const sign = profit >= 0 ? '+' : '';
      const color = profit >= 0 ? '#22c55e' : '#ef4444';

      const profitEl = tr.querySelector('.batch-sale-item-profit');
      if (profitEl) {
        profitEl.textContent = `₹${profit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${sign}${marginPct}%)`;
        profitEl.style.color = color;
      }

      totalMfg += mfgCost;
      totalPrice += price;
      totalProfit += profit;
    });

    const countEl = document.getElementById('jewelry-batch-sale-total-count');
    if (countEl) countEl.textContent = count;

    const totalMfgEl = document.getElementById('jewelry-batch-sale-total-mfg');
    if (totalMfgEl) totalMfgEl.textContent = `₹${totalMfg.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const totalPriceEl = document.getElementById('jewelry-batch-sale-total-price');
    if (totalPriceEl) totalPriceEl.textContent = `₹${totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const totalProfitEl = document.getElementById('jewelry-batch-sale-total-profit');
    if (totalProfitEl) {
      const overallMarginPct = totalMfg > 0 ? ((totalProfit / totalMfg) * 100).toFixed(1) : '0.0';
      const sign = totalProfit >= 0 ? '+' : '';
      totalProfitEl.textContent = `₹${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${sign}${overallMarginPct}%)`;
      totalProfitEl.style.color = totalProfit >= 0 ? '#22c55e' : '#ef4444';
    }
  },

  async handleConfirmBatchSale() {
    const memoId = document.getElementById('jewelry-batch-sale-memo-id')?.value;
    const memo = DBManager.getJewelryMemos().find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const customerName = (document.getElementById('jewelry-batch-sale-customer-name')?.value || '').trim();
    const brokerName = (document.getElementById('jewelry-batch-sale-broker-name')?.value || '').trim();
    const saleDate = document.getElementById('jewelry-batch-sale-date')?.value;
    const notes = (document.getElementById('jewelry-batch-sale-notes')?.value || '').trim();

    if (!customerName) {
      UI.showToast('Please enter the customer / client name.', true);
      return;
    }
    if (!saleDate) {
      UI.showToast('Please select the sale date.', true);
      return;
    }

    const tbody = document.getElementById('jewelry-batch-sale-tbody');
    const rows = tbody ? tbody.querySelectorAll('tr') : [];
    if (rows.length === 0) {
      UI.showToast('No pieces to sell.', true);
      return;
    }

    if (!DBManager.database.jewelrySales) DBManager.database.jewelrySales = [];

    let soldCount = 0;
    let totalSaleVal = 0;

    rows.forEach(tr => {
      const itemId = tr.dataset.itemId;
      const mfgCost = parseFloat(tr.dataset.mfgCost || 0);
      const priceInp = tr.querySelector('.batch-sale-item-price');
      const finalSoldPrice = parseFloat(priceInp?.value || 0);

      const memoItem = (memo.items || []).find(mi => mi.itemId === itemId && mi.status === 'open');
      if (!memoItem) return;

      memoItem.status = 'sold';
      memoItem.soldPrice = finalSoldPrice;

      const mainItem = DBManager.database.items.find(i => i.id === itemId || i.sku === memoItem.sku);
      if (mainItem) {
        mainItem.status = 'Sold';
        mainItem.sno = null;
        mainItem.soldPrice = finalSoldPrice;
        mainItem.soldDate = saleDate;
        mainItem.soldTo = customerName;
        mainItem.soldBroker = brokerName;
        mainItem.updatedAt = new Date().toISOString();
      }

      const profit = finalSoldPrice - mfgCost;
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
        itemId: memoItem.itemId,
        sku: memoItem.sku,
        name: memoItem.name,
        category: memoItem.category,
        customerName,
        brokerName: brokerName || '—',
        mfgCost,
        soldPrice: finalSoldPrice,
        profit,
        marginPct,
        monthlyProfitPct,
        notes: notes || memo.notes || '',
        createdAt: new Date().toISOString()
      });

      soldCount++;
      totalSaleVal += finalSoldPrice;
    });

    // Check if all items in memo are resolved
    const allDone = (memo.items || []).every(it => it.status !== 'open');
    if (allDone) {
      memo.status = 'closed';
      memo.closedAt = new Date().toISOString();
    }

    // Resequence remaining active inventory serial numbers
    DBManager.resequenceJewelrySno();

    DBManager.addLog(
      'EDIT', memo.id, `Jewelry Memo ${memo.memoNumber}`,
      `Batch sold ${soldCount} piece(s) from Memo ${memo.memoNumber} to ${customerName} (Broker: ${brokerName || 'None'}): ₹${totalSaleVal.toLocaleString()}`,
      []
    );

    try {
      UI.closeModal('modal-batch-jewelry-sale');
      UI.closeModal('modal-jewelry-memo-detail');
      UI.showToast(`Batch sale completed for ${soldCount} piece(s) (Total: ₹${totalSaleVal.toLocaleString()}).`);
      App.refreshAllDisplays();
      if (window.JewelrySalesController) window.JewelrySalesController.renderSalesList();
      await DBManager.saveVault();
    } catch (err) {
      UI.showToast(err.message, true);
    }
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

    let dateFmt = '—';
    if (memo.date) {
      const d = new Date(memo.date.includes('T') ? memo.date : memo.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        dateFmt = d.toLocaleDateString('en-IN');
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Memo Number: ${memo.memoNumber || '—'}`, 14, 33);
    doc.text(`Issued To: ${memo.personName || memo.customerName || memo.issuedTo || '—'}`, 14, 38);
    doc.text(`Broker: ${memo.brokerName || '—'}`, 14, 43);
    doc.text(`Issue Date: ${dateFmt}`, 14, 48);
    doc.text(`Status: ${memo.status === 'open' ? 'ISSUED' : 'CLOSED'}`, 14, 53);

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(14, 57, 196, 57);

    // Table Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("SKU", 14, 63);
    doc.text("Description", 40, 63);
    doc.text("Category", 115, 63);
    doc.text("Status", 148, 63);
    doc.text("Selling Price (INR)", 196, 63, { align: 'right' });

    doc.line(14, 66, 196, 66);

    let y = 72;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    (memo.items || []).forEach(item => {
      const mainItem = DBManager.getItems().find(i => i.id === item.itemId || i.sku === item.sku);
      const imgSrc = item.image || (mainItem ? mainItem.image : null);
      const hasImg = imgSrc && typeof imgSrc === 'string' && imgSrc.startsWith('data:image/');
      const rowHeight = hasImg ? 16 : 7.5;

      if (y + rowHeight > 275) {
        doc.addPage();
        y = 25;
      }

      const sku = item.sku || mainItem?.sku || '—';
      const name = item.name || mainItem?.name || 'Unnamed Piece';
      const category = item.category || mainItem?.category || 'Jewelry';
      const price = Number(item.sellingPrice !== undefined ? item.sellingPrice : (mainItem?.sellingPrice || 0));

      doc.setFont("helvetica", "bold");
      doc.text(sku, 14, y + (hasImg ? 4 : 0));
      doc.setFont("helvetica", "normal");
      doc.text(name.substring(0, hasImg ? 26 : 38), 40, y + (hasImg ? 2 : 0));

      if (hasImg) {
        try {
          const format = imgSrc.includes('png') ? 'PNG' : 'JPEG';
          doc.addImage(imgSrc, format, 40, y + 4, 12, 10);
        } catch (e) {
          // ignore PDF image rendering errors gracefully
        }
      }

      doc.text(category, 115, y + (hasImg ? 4 : 0));
      doc.text((item.status || 'OPEN').toUpperCase(), 148, y + (hasImg ? 4 : 0));
      doc.text(`Rs ${price.toLocaleString()}`, 196, y + (hasImg ? 4 : 0), { align: 'right' });
      y += rowHeight;
    });

    doc.line(14, y, 196, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Total Memo Value:", 148, y);
    doc.text(`Rs ${(Number(memo.totalValue) || 0).toLocaleString()}`, 196, y, { align: 'right' });

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
