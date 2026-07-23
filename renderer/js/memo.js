/**
 * Memo Controller Module
 * Manages emerald memo issuance to brokers: create, view, return, and sell memos.
 * Tracks "in company" vs "on memo" carats for each Pudia without modifying stock records
 * until a memo is explicitly marked as Sold.
 */

const MemoController = {
  selectedItems: [],
  activeCreateSelectedId: null,
  activeOutcomeContext: null,

  // ── Initialisation ──────────────────────────────────────────────────────────

  init() {
    // Sidebar "Create Memo" nav button
    const btnNavCreateMemo = document.getElementById('btn-nav-create-memo');
    if (btnNavCreateMemo) {
      btnNavCreateMemo.addEventListener('click', () => this.openCreateMemoModal());
    }

    // "New Memo" button inside the memos tab header
    const btnCreateMemo = document.getElementById('btn-create-memo');
    if (btnCreateMemo) {
      btnCreateMemo.addEventListener('click', () => this.openCreateMemoModal());
    }

    // Save memo button (inside create modal)
    const btnSaveMemo = document.getElementById('btn-save-memo');
    if (btnSaveMemo) {
      btnSaveMemo.addEventListener('click', () => this.handleSaveMemo());
    }

    // Close triggers for create modal
    document.querySelectorAll('.modal-close-trigger-memo').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-create-memo'));
    });

    // Close triggers for detail modal
    document.querySelectorAll('.modal-close-trigger-memo-detail').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-memo-detail'));
    });

    // Close triggers for partial action input modal
    document.querySelectorAll('.modal-close-trigger-memo-action').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-memo-action-input'));
    });

    // Save partial action button
    const btnSaveMemoAction = document.getElementById('btn-save-memo-action');
    if (btnSaveMemoAction) {
      btnSaveMemoAction.addEventListener('click', () => this.handleSaveMemoAction());
    }

    // ── Outcome Modal wiring ──────────────────────────────────────────────────
    document.querySelectorAll('.modal-close-trigger-memo-outcome').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-memo-outcome'));
    });

    // Outcome card clicks
    ['outcome-card-sale', 'outcome-card-partial', 'outcome-card-return'].forEach(cardId => {
      const card = document.getElementById(cardId);
      if (card) {
        card.addEventListener('click', () => {
          this.handleOutcomeSelect(card.getAttribute('data-outcome'));
        });
      }
    });

    // Save outcome button
    const btnSaveOutcome = document.getElementById('btn-save-memo-outcome');
    if (btnSaveOutcome) {
      btnSaveOutcome.addEventListener('click', () => this.handleSaveOutcome());
    }

    // Form control listeners for create modal
    const groupSelect = document.getElementById('memo-create-group');
    if (groupSelect) {
      groupSelect.addEventListener('change', () => this.handleCreateGroupChange());
    }

    const shapeSelect = document.getElementById('memo-create-shape');
    if (shapeSelect) {
      shapeSelect.addEventListener('change', () => this.handleCreateShapeChange());
    }

    const searchInp = document.getElementById('memo-create-search');
    if (searchInp) {
      searchInp.addEventListener('input', UI.debounce(() => this.handleCreateSearchInput(), 200));
    }

    const btnAddItem = document.getElementById('btn-memo-add-item');
    if (btnAddItem) {
      btnAddItem.addEventListener('click', () => this.handleAddItemToSelected());
    }

    // Filter and search in memo list tab
    const statusFilter = document.getElementById('memo-filter-status');
    if (statusFilter) statusFilter.addEventListener('change', () => this.renderMemoList());

    const searchInput = document.getElementById('memo-search-input');
    if (searchInput) searchInput.addEventListener('input', UI.debounce(() => this.renderMemoList(), 200));
  },

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Auto-generate the next memo number (M-001, M-002, …)
   */
  getNextMemoNumber() {
    const memos = DBManager.getMemos();
    if (memos.length === 0) return 'M-001';
    const nums = memos.map(m => {
      const match = (m.memoNumber || '').match(/M-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const next = Math.max(...nums) + 1;
    return `M-${String(next).padStart(3, '0')}`;
  },

  /**
   * Deducts carats and pieces from physical Emerald stock (emerald.weight & emerald.sizes)
   * when goods are issued on memo.
   */
  deductStockFromEmerald(emerald, caratsToDeduct, piecesToDeduct) {
    if (!emerald || caratsToDeduct <= 0) return;

    const currentWeight = EmeraldController.getEmeraldWeight(emerald);
    const newWeight = Math.max(0, Number((currentWeight - caratsToDeduct).toFixed(3)));

    if (emerald.sizes && emerald.sizes.length > 0 && currentWeight > 0) {
      const ratio = newWeight / currentWeight;
      emerald.sizes.forEach(s => {
        s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
        if (piecesToDeduct > 0) {
          s.pieces = Math.max(0, (s.pieces || 0) - Math.floor(piecesToDeduct / emerald.sizes.length));
        }
      });
    }

    emerald.weight = newWeight;
    if (piecesToDeduct > 0) {
      emerald.pieces = Math.max(0, (emerald.pieces || 0) - piecesToDeduct);
    }
    emerald.updatedAt = new Date().toISOString();
  },

  /**
   * Restores carats and pieces back to physical Emerald stock (emerald.weight & emerald.sizes)
   * when goods are returned from memo or a memo is deleted/cancelled.
   */
  restoreStockToEmerald(emerald, caratsToRestore, piecesToRestore) {
    if (!emerald || caratsToRestore <= 0) return;

    const currentWeight = EmeraldController.getEmeraldWeight(emerald);
    const restoredWeight = Number((currentWeight + caratsToRestore).toFixed(3));

    if (emerald.sizes && emerald.sizes.length > 0) {
      if (currentWeight > 0) {
        const ratio = restoredWeight / currentWeight;
        emerald.sizes.forEach(s => {
          s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
          if (piecesToRestore > 0) {
            s.pieces = (s.pieces || 0) + Math.max(1, Math.floor(piecesToRestore / emerald.sizes.length));
          }
        });
      } else {
        // Emerald was completely at 0 cts. Distribute restored weight across size rows.
        const count = emerald.sizes.length;
        const perSizeWeight = Number((caratsToRestore / count).toFixed(3));
        const perSizePieces = Math.max(1, Math.floor((piecesToRestore || 0) / count));
        emerald.sizes.forEach(s => {
          s.weight = perSizeWeight;
          s.pieces = (s.pieces || 0) + perSizePieces;
        });
      }
    }

    emerald.weight = restoredWeight;
    if (piecesToRestore > 0) {
      emerald.pieces = (emerald.pieces || 0) + piecesToRestore;
    }
    emerald.updatedAt = new Date().toISOString();
  },

  /**
   * Returns total carats currently OUT on open memos for a given emerald ID.
   */
  getOpenMemoCaratsForEmerald(emeraldId) {
    const memos = DBManager.getMemos();
    let total = 0;
    memos.forEach(memo => {
      if (memo.status === 'open') {
        (memo.items || []).forEach(item => {
          if (item.emeraldId === emeraldId) {
            const rem = (item.carats || 0) - (item.returnedCarats || 0) - (item.soldCarats || 0);
            if (rem > 0) total += rem;
          }
        });
      }
    });
    return Number(total.toFixed(3));
  },

  /**
   * Builds a pre-computed emeraldId → memoCarats map from all open memos.
   * More efficient than calling getOpenMemoCaratsForEmerald() per-emerald in loops.
   */
  buildMemoCaratsMap() {
    const map = {};
    DBManager.getMemos().filter(m => m.status === 'open').forEach(memo => {
      (memo.items || []).forEach(item => {
        if (!map[item.emeraldId]) map[item.emeraldId] = 0;
        const rem = (item.carats || 0) - (item.returnedCarats || 0) - (item.soldCarats || 0);
        if (rem > 0) map[item.emeraldId] += rem;
      });
    });
    return map;
  },

  /**
   * Collect all unique broker names from existing memos (for datalist autocomplete).
   */
  getAllPastBrokers() {
    const brokers = new Set();
    DBManager.getMemos().forEach(m => { if (m.brokerName) brokers.add(m.brokerName); });
    return Array.from(brokers).sort();
  },

  /**
   * Collect all unique client names from existing memos (for datalist autocomplete).
   */
  getAllPastClients() {
    const clients = new Set();
    DBManager.getMemos().forEach(m => { if (m.clientName) clients.add(m.clientName); });
    return Array.from(clients).sort();
  },

  // ── Create Memo ─────────────────────────────────────────────────────────────

  openCreateMemoModal() {
    this.selectedItems = [];
    this.activeCreateSelectedId = null;
    this.resetCreateMemoForm();
    UI.openModal('modal-create-memo');
  },

  resetCreateMemoForm() {
    const brokerInput = document.getElementById('memo-broker-name');
    if (brokerInput) brokerInput.value = '';
    const clientInput = document.getElementById('memo-client-name');
    if (clientInput) clientInput.value = '';
    const dateInput = document.getElementById('memo-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const notesInput = document.getElementById('memo-notes');
    if (notesInput) notesInput.value = '';
    
    // Reset inputs
    const searchInp = document.getElementById('memo-create-search');
    if (searchInp) searchInp.value = '';
    const caratsInp = document.getElementById('memo-create-carats');
    if (caratsInp) caratsInp.value = '';
    const piecesInp = document.getElementById('memo-create-pieces');
    if (piecesInp) piecesInp.value = '';
    
    const availLabel = document.getElementById('memo-create-avail-carats-lbl');
    if (availLabel) availLabel.textContent = '(Available: —)';

    this.activeCreateSelectedId = null;

    this.populateBrokerDatalist();
    this.populateGroupSelect();
    this.populateShapeSelect();
    this.filterCreatePudias();
    this.renderSelectedItemsTable();
  },

  populateBrokerDatalist() {
    const list = document.getElementById('memo-brokers-list');
    if (!list) return;
    list.innerHTML = '';
    this.getAllPastBrokers().forEach(broker => {
      const opt = document.createElement('option');
      opt.value = broker;
      list.appendChild(opt);
    });

    const clientList = document.getElementById('memo-clients-list');
    if (!clientList) return;
    clientList.innerHTML = '';
    this.getAllPastClients().forEach(client => {
      const opt = document.createElement('option');
      opt.value = client;
      clientList.appendChild(opt);
    });
  },

  populateGroupSelect() {
    const select = document.getElementById('memo-create-group');
    if (!select) return;
    select.innerHTML = '<option value="">-- All Groups --</option>';
    
    const groups = new Set();
    DBManager.getEmeralds().forEach(e => {
      if (e.group) groups.add(e.group);
    });
    
    Array.from(groups).sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      select.appendChild(opt);
    });
  },

  populateShapeSelect() {
    const select = document.getElementById('memo-create-shape');
    if (!select) return;
    select.innerHTML = '<option value="">-- All Shapes --</option>';
    
    const shapes = new Set();
    DBManager.getEmeralds().forEach(e => {
      if (e.shape) shapes.add(e.shape);
    });
    
    Array.from(shapes).sort().forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    });
  },

  handleCreateGroupChange() {
    const searchInp = document.getElementById('memo-create-search');
    if (searchInp) searchInp.value = '';
    this.filterCreatePudias();
  },

  handleCreateShapeChange() {
    const searchInp = document.getElementById('memo-create-search');
    if (searchInp) searchInp.value = '';
    this.filterCreatePudias();
  },

  handleCreateSearchInput() {
    const groupSelect = document.getElementById('memo-create-group');
    if (groupSelect) groupSelect.value = '';
    const shapeSelect = document.getElementById('memo-create-shape');
    if (shapeSelect) shapeSelect.value = '';
    this.filterCreatePudias();
  },

  filterCreatePudias() {
    const listContainer = document.getElementById('memo-create-pudia-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const query = (document.getElementById('memo-create-search').value || '').toLowerCase().trim();
    const groupVal = document.getElementById('memo-create-group').value;
    const shapeVal = document.getElementById('memo-create-shape').value;

    // Do not auto-populate list if no query or filters are active
    if (!query && !groupVal && !shapeVal) {
      listContainer.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;font-style:italic;">Type search term or select filters to view Pudias</div>';
      return;
    }

    const emeralds = DBManager.getEmeralds();
    const memoCaratsMap = this.buildMemoCaratsMap();

    const filtered = emeralds.filter(e => {
      if (this.selectedItems.some(item => item.emeraldId === e.id)) {
        return false;
      }

      const availCts = EmeraldController.getEmeraldWeight(e);
      if (availCts <= 0) return false;

      if (groupVal && e.group !== groupVal) {
        return false;
      }

      if (shapeVal && e.shape !== shapeVal) {
        return false;
      }

      if (query) {
        const matchGroup = (e.group || '').toLowerCase().includes(query);
        const matchGrade = (e.lustreGrade || '').toLowerCase().includes(query);
        const matchPudia = String(e.color || '').toLowerCase().includes(query);
        const matchShape = (e.shape || '').toLowerCase().includes(query);
        const matchCarats = String(availCts.toFixed(2)).includes(query) || String(availCts).includes(query);
        return matchGroup || matchGrade || matchPudia || matchShape || matchCarats;
      }

      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:12px;">No matching Pudias found</div>';
      return;
    }

    filtered.forEach(e => {
      const availCts = EmeraldController.getEmeraldWeight(e);

      const div = document.createElement('div');
      div.className = 'pudia-picker-row';
      div.dataset.id = e.id;
      div.style = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-main);transition:background var(--transition-fast);';
      const lustreDisplay = e.stockType === 'Single Pieces' ? 'Single Pieces' : (e.lustreGrade || '—');
      div.innerHTML = `
        <span><strong>#${e.color || 'N/A'}</strong> - ${UI.escapeHtml(e.group || '—')} (${UI.escapeHtml(e.shape || '—')}, ${UI.escapeHtml(lustreDisplay)})</span>
        <span style="font-weight:700;color:var(--text-gold-dark);">${availCts.toFixed(2)} cts</span>
      `;

      if (this.activeCreateSelectedId === e.id) {
        div.style.backgroundColor = 'var(--border-light)';
        div.style.fontWeight = '700';
      }

      div.addEventListener('click', () => {
        // Clear previous selection highlight
        listContainer.querySelectorAll('.pudia-picker-row').forEach(row => {
          row.style.backgroundColor = '';
          row.style.fontWeight = '';
        });

        // Highlight this item
        div.style.backgroundColor = 'var(--border-light)';
        div.style.fontWeight = '700';

        this.activeCreateSelectedId = e.id;
        
        // Fill inputs
        const lbl = document.getElementById('memo-create-avail-carats-lbl');
        const caratsInp = document.getElementById('memo-create-carats');
        const piecesInp = document.getElementById('memo-create-pieces');

        if (lbl) lbl.textContent = `(Available: ${availCts.toFixed(2)} cts)`;
        caratsInp.max = availCts;
        caratsInp.value = availCts;
        // Use getEmeraldPieces() which correctly sums across all size rows
        piecesInp.value = EmeraldController.getEmeraldPieces(e) || '';
      });

      listContainer.appendChild(div);
    });
  },

  handleAddItemToSelected() {
    const caratsInp = document.getElementById('memo-create-carats');
    const piecesInp = document.getElementById('memo-create-pieces');

    if (!caratsInp) return;

    const emeraldId = this.activeCreateSelectedId;
    if (!emeraldId) {
      UI.showToast('Please click on a Pudia from the list to select it.', true);
      return;
    }

    const inputCarats = Number(caratsInp.value || 0);
    const inputPieces = Number(piecesInp.value || 0);

    const emerald = DBManager.getEmeralds().find(e => e.id === emeraldId);
    if (!emerald) return;

    const maxCts = EmeraldController.getEmeraldWeight(emerald);

    if (inputCarats <= 0) {
      UI.showToast('Please enter a valid amount of carats.', true);
      return;
    }

    if (inputCarats > maxCts + 0.001) {
      UI.showToast(`Cannot issue more than available carats (${maxCts.toFixed(2)} cts).`, true);
      return;
    }

    this.selectedItems.push({
      emeraldId,
      emeraldSnapshot: {
        group: emerald.group || '',
        lustreGrade: emerald.lustreGrade || '',
        color: emerald.color || '',
        shape: emerald.shape || '',
        stockType: emerald.stockType || ''
      },
      carats: Number(inputCarats.toFixed(3)),
      pieces: inputPieces,
      returnedCarats: 0,
      soldCarats: 0,
      returnedPieces: 0,
      soldPieces: 0
    });

    this.activeCreateSelectedId = null;
    caratsInp.value = '';
    piecesInp.value = '';
    const lbl = document.getElementById('memo-create-avail-carats-lbl');
    if (lbl) lbl.textContent = '(Available: —)';

    this.filterCreatePudias();
    this.renderSelectedItemsTable();
  },

  renderSelectedItemsTable() {
    const tbody = document.getElementById('memo-selected-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (this.selectedItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No items selected yet. Select a Pudia above and click "Add Item".</td></tr>';
      this.updateSelectedTotals();
      return;
    }

    this.selectedItems.forEach((item, index) => {
      const snap = item.emeraldSnapshot;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px 12px;font-weight:600;">${UI.escapeHtml(snap.group || '—')}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--text-gold-dark);">#${snap.color || 'N/A'}</td>
        <td style="padding:10px 12px;">${UI.escapeHtml(snap.shape || '—')}${snap.stockType === 'Single Pieces' ? '' : ` / ${UI.escapeHtml(snap.lustreGrade || '—')}`}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;">${item.carats.toFixed(2)} cts</td>
        <td style="padding:10px 12px;text-align:right;">${item.pieces || '—'}</td>
        <td style="padding:10px 12px;text-align:center;">
          <button type="button" class="btn btn-danger btn-small" style="font-size:10px;padding:3px 6px;" data-index="${index}">Remove</button>
        </td>
      `;

      tr.querySelector('.btn-danger').addEventListener('click', () => {
        this.selectedItems.splice(index, 1);
        this.filterCreatePudias();
        this.renderSelectedItemsTable();
      });

      tbody.appendChild(tr);
    });

    this.updateSelectedTotals();
  },

  updateSelectedTotals() {
    const totalCts = this.selectedItems.reduce((sum, item) => sum + item.carats, 0);
    const totalEl = document.getElementById('memo-total-carats');
    const countEl = document.getElementById('memo-item-count');
    if (totalEl) totalEl.textContent = totalCts.toFixed(2);
    if (countEl) countEl.textContent = this.selectedItems.length;
  },

  async handleSaveMemo() {
    const brokerName = (document.getElementById('memo-broker-name').value || '').trim();
    const clientName = (document.getElementById('memo-client-name').value || '').trim();
    const date       = document.getElementById('memo-date').value;
    const notes      = (document.getElementById('memo-notes').value || '').trim();

    if (!brokerName) { UI.showToast('Please enter a broker name.', true); return; }
    if (!date)       { UI.showToast('Please select a memo date.', true); return; }
    if (this.selectedItems.length === 0) {
      UI.showToast('Please add at least one Pudia to the memo.', true);
      return;
    }

    const totalCarats = Number(this.selectedItems.reduce((s, i) => s + i.carats, 0).toFixed(3));
    const memoNumber  = this.getNextMemoNumber();

    const memo = {
      id: 'memo_' + Date.now(),
      memoNumber,
      brokerName,
      clientName: clientName || null,
      date,
      status: 'open',          // "open" | "returned" | "sold" | "closed"
      createdAt: new Date().toISOString(),
      closedAt: null,
      notes,
      items: this.selectedItems,
      totalCarats
    };

    if (!DBManager.database.memos) DBManager.database.memos = [];
    DBManager.database.memos.push(memo);

    // Immediately deduct physical stock from inventory when goods are issued on memo
    (this.selectedItems || []).forEach(item => {
      const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
      if (emerald) {
        this.deductStockFromEmerald(emerald, item.carats, item.pieces || 0);
      }
    });

    DBManager.addLog(
      'ADD', memo.id, `Memo ${memoNumber}`,
      `Issued memo ${memoNumber} to ${brokerName}${clientName ? ` (client: ${clientName})` : ''}: ${totalCarats.toFixed(2)} cts (${this.selectedItems.length} Pudia${this.selectedItems.length !== 1 ? 's' : ''})`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-create-memo');
      UI.showToast(`Memo ${memoNumber} issued to ${brokerName} — ${totalCarats.toFixed(2)} cts`);
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  // ── Memo List ────────────────────────────────────────────────────────────────

  renderMemoList() {
    const memos     = DBManager.getMemos();
    const openMemos = memos.filter(m => m.status === 'open');
    const totalOnMemo = openMemos.reduce((s, m) => s + (m.totalCarats || 0), 0);

    // Update summary metrics
    const elCount = document.getElementById('metric-memo-open-count');
    const elCts   = document.getElementById('metric-memo-carats');
    if (elCount) elCount.textContent = openMemos.length;
    if (elCts)   elCts.textContent   = totalOnMemo.toFixed(2) + ' cts';

    // Read filters
    const statusFilter = document.getElementById('memo-filter-status');
    const searchInput  = document.getElementById('memo-search-input');
    const filterVal    = statusFilter ? statusFilter.value : '';
    const query        = searchInput  ? searchInput.value.toLowerCase().trim() : '';

    let filtered = memos.filter(m => {
      const matchStatus = !filterVal || m.status === filterVal;
      const matchSearch = !query ||
        (m.brokerName  || '').toLowerCase().includes(query) ||
        (m.memoNumber  || '').toLowerCase().includes(query);
      return matchStatus && matchSearch;
    });

    // Newest first
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tbody     = document.getElementById('memo-list-tbody');
    const emptyEl   = document.getElementById('memo-empty-state');
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
      open:     { bg: 'rgba(80,200,120,0.15)', color: '#50c878' },
      returned: { bg: 'rgba(140,140,160,0.15)', color: 'var(--text-muted)' },
      sold:     { bg: 'rgba(212,175,55,0.15)',  color: 'var(--text-gold-dark)' },
      closed:   { bg: 'rgba(140,140,160,0.15)', color: 'var(--text-muted)' }
    };

    filtered.forEach(memo => {
      const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      const st = statusStyle[memo.status] || statusStyle.returned;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700;font-family:var(--font-serif);">${UI.escapeHtml(memo.memoNumber)}</td>
        <td>${dateFmt}</td>
        <td style="font-weight:600;">${UI.escapeHtml(memo.brokerName)}${memo.clientName ? `<br><span style="font-size:11px;font-weight:400;color:var(--text-muted);">Client: ${UI.escapeHtml(memo.clientName)}</span>` : ''}</td>
        <td style="text-align:right;font-weight:700;">${(memo.totalCarats || 0).toFixed(2)} cts</td>
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
              <button type="button" class="btn btn-primary btn-small btn-outcome-memo" style="font-size:11px; white-space:nowrap;">Record Outcome</button>
            ` : ''}
            <button type="button" class="btn btn-danger btn-small btn-delete-memo" style="font-size:11px;">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const outcomeBtn = tr.querySelector('.btn-outcome-memo');
      if (outcomeBtn) outcomeBtn.addEventListener('click', () => this.openMemoOutcomeModal(memo.id));
      const deleteBtn = tr.querySelector('.btn-delete-memo');
      if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteMemo(memo.id));

      tbody.appendChild(tr);
    });
  },

  // ── Memo Detail ──────────────────────────────────────────────────────────────

  openMemoDetail(memoId) {
    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    document.getElementById('memo-detail-number').textContent      = memo.memoNumber;
    document.getElementById('memo-detail-broker').textContent      = memo.brokerName;
    document.getElementById('memo-detail-date').textContent        = dateFmt;
    document.getElementById('memo-detail-status').textContent      = memo.status.toUpperCase();
    document.getElementById('memo-detail-notes').textContent       = memo.notes || '—';
    document.getElementById('memo-detail-total-carats').textContent = (memo.totalCarats || 0).toFixed(2) + ' cts';

    // Client name — show row if populated, hide if not
    const clientRowEl = document.getElementById('memo-detail-client-row');
    const clientEl    = document.getElementById('memo-detail-client');
    if (clientEl) clientEl.textContent = memo.clientName || '—';
    if (clientRowEl) clientRowEl.style.display = memo.clientName ? '' : 'none';

    if (memo.closedAt) {
      document.getElementById('memo-detail-closed-at').textContent =
        new Date(memo.closedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      document.getElementById('memo-detail-closed-row').classList.remove('hidden');
    } else {
      document.getElementById('memo-detail-closed-row').classList.add('hidden');
    }

    // Items table
    const tbody = document.getElementById('memo-detail-items-tbody');
    tbody.innerHTML = '';
    (memo.items || []).forEach((item, index) => {
      const snap = item.emeraldSnapshot || {};
      
      const rCarats = item.returnedCarats || 0;
      const sCarats = item.soldCarats || 0;
      const remCarats = Math.max(0, Number((item.carats - rCarats - sCarats).toFixed(3)));

      const rPieces = item.returnedPieces || 0;
      const sPieces = item.soldPieces || 0;
      const remPieces = Math.max(0, (item.pieces || 0) - rPieces - sPieces);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px 12px;">${UI.escapeHtml(snap.group || '—')}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--text-gold-dark);">#${snap.color || 'N/A'}</td>
        <td style="padding:10px 12px;">${UI.escapeHtml(snap.shape || '—')}${snap.stockType === 'Single Pieces' ? '' : ` / ${UI.escapeHtml(snap.lustreGrade || '—')}`}</td>
        <td style="padding:10px 12px;text-align:right;">${(item.carats || 0).toFixed(2)} cts<br><span style="font-size:10px;color:var(--text-muted);">${item.pieces || '—'} pcs</span></td>
        <td style="padding:10px 12px;text-align:right;color:var(--text-muted);">${rCarats > 0 ? `${rCarats.toFixed(2)} cts<br><span style="font-size:10px;">${rPieces} pcs</span>` : '—'}</td>
        <td style="padding:10px 12px;text-align:right;color:var(--text-gold-dark);">${sCarats > 0 ? `${sCarats.toFixed(2)} cts<br><span style="font-size:10px;">${sPieces} pcs</span>` : '—'}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--text-main);">${remCarats > 0 ? `${remCarats.toFixed(2)} cts<br><span style="font-size:10px;font-weight:normal;color:var(--text-muted);">${remPieces} pcs</span>` : '<span style="color:var(--success-green);font-size:11px;">CLOSED</span>'}</td>
        <td style="padding:10px 12px;text-align:center;">
          ${memo.status === 'open' && remCarats > 0 ? `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button type="button" class="btn btn-secondary btn-small btn-row-return" style="font-size:10px;padding:3px 6px;" data-index="${index}">Return</button>
              <button type="button" class="btn btn-primary btn-small btn-row-sell" style="font-size:10px;padding:3px 6px;" data-index="${index}">Sold</button>
            </div>
          ` : '—'}
        </td>
      `;

      if (memo.status === 'open' && remCarats > 0) {
        tr.querySelector('.btn-row-return').addEventListener('click', () => this.openMemoActionInputModal(memo.id, index, 'returned'));
        tr.querySelector('.btn-row-sell').addEventListener('click', () => this.openMemoActionInputModal(memo.id, index, 'sold'));
      }

      tbody.appendChild(tr);
    });

    // Action buttons
    const actionsEl = document.getElementById('memo-detail-actions');
    if (actionsEl) {
      actionsEl.innerHTML = `
        ${memo.status === 'open' ? `
          <button type="button" class="btn btn-primary" id="btn-detail-outcome" style="min-width:140px;">
            Record Outcome
          </button>
        ` : ''}
        <button type="button" class="btn btn-danger" id="btn-detail-delete">
          Delete Memo
        </button>
      `;
      const btnOutcome = document.getElementById('btn-detail-outcome');
      if (btnOutcome) {
        btnOutcome.addEventListener('click', () => {
          UI.closeModal('modal-memo-detail');
          this.openMemoOutcomeModal(memo.id);
        });
      }
      const btnDelete = document.getElementById('btn-detail-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          this.deleteMemo(memo.id);
        });
      }
    }

    UI.openModal('modal-memo-detail');
  },

  // ── Single Item Action Form (Partial Return / Sale) ──────────────────────────

  openMemoActionInputModal(memoId, itemIndex, actionType) {
    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    this.activeActionContext = { memoId, itemIndex, actionType };

    const titleEl    = document.getElementById('memo-action-title');
    const subtitleEl = document.getElementById('memo-action-subtitle');
    const selectorGroup = document.getElementById('memo-action-item-selector-group');
    const itemSelect = document.getElementById('memo-action-item-select');
    const caratsInp  = document.getElementById('memo-action-carats');
    const piecesInp  = document.getElementById('memo-action-pieces');

    titleEl.textContent = actionType === 'sold' ? 'Mark Goods as Sold' : 'Return Goods to Stock';

    // Reset dropdown change listener
    itemSelect.onchange = null;

    if (itemIndex !== null && itemIndex !== undefined) {
      // Direct item-level action (from details modal)
      selectorGroup.classList.add('hidden');
      const item = memo.items[itemIndex];
      const gradeHtml = item.emeraldSnapshot.stockType === 'Single Pieces' ? '' : `<br><strong>Grade:</strong> ${item.emeraldSnapshot.lustreGrade || '—'}`;
      subtitleEl.innerHTML = `<strong>Pudia:</strong> #${item.emeraldSnapshot.color || 'N/A'} (${item.emeraldSnapshot.group || '—'})${gradeHtml}`;
      this.setupActionInputRanges(item);
    } else {
      // Memo-level action (from main list view)
      selectorGroup.classList.remove('hidden');
      subtitleEl.innerHTML = `<strong>Memo:</strong> ${memo.memoNumber} | <strong>Broker:</strong> ${memo.brokerName}`;
      
      // Populate dropdown
      itemSelect.innerHTML = '<option value="all">-- Entire Memo (All Remaining Items) --</option>';
      memo.items.forEach((item, idx) => {
        const remCts = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
        if (remCts > 0) {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `#${item.emeraldSnapshot.color || 'N/A'} - ${item.emeraldSnapshot.group || '—'} (${remCts.toFixed(2)} cts left)`;
          itemSelect.appendChild(opt);
        }
      });

      // Update inputs based on dropdown selection
      const updateSelection = () => {
        const selectedVal = itemSelect.value;
        if (selectedVal === 'all') {
          // Bulk action totals
          const totalRemCarats = memo.items.reduce((sum, it) => sum + Math.max(0, Number((it.carats - (it.returnedCarats || 0) - (it.soldCarats || 0)).toFixed(3))), 0);
          const totalRemPieces = memo.items.reduce((sum, it) => sum + Math.max(0, (it.pieces || 0) - (it.returnedPieces || 0) - (it.soldPieces || 0)), 0);
          
          caratsInp.value = totalRemCarats.toFixed(3);
          caratsInp.max = totalRemCarats;
          caratsInp.disabled = true; // disable edits for bulk full memo action
          piecesInp.value = totalRemPieces;
          piecesInp.max = totalRemPieces;
          piecesInp.disabled = true;
          document.getElementById('memo-action-carats-max-label').textContent = `Total remaining: ${totalRemCarats.toFixed(2)} cts`;
          document.getElementById('memo-action-pieces-max-label').textContent = `Total remaining: ${totalRemPieces} pcs`;
        } else {
          // Specific item selected
          const idx = parseInt(selectedVal, 10);
          const item = memo.items[idx];
          caratsInp.disabled = false;
          piecesInp.disabled = false;
          this.setupActionInputRanges(item);
        }
      };

      itemSelect.onchange = updateSelection;
      updateSelection();
    }

    UI.openModal('modal-memo-action-input');
  },

  setupActionInputRanges(item) {
    const caratsInp = document.getElementById('memo-action-carats');
    const piecesInp = document.getElementById('memo-action-pieces');
    const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
    const remPieces = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));

    caratsInp.value = remCarats;
    caratsInp.max = remCarats;
    document.getElementById('memo-action-carats-max-label').textContent = `Max: ${remCarats.toFixed(2)} cts`;

    piecesInp.value = remPieces;
    piecesInp.max = remPieces;
    document.getElementById('memo-action-pieces-max-label').textContent = `Max: ${remPieces} pcs`;
  },

  async handleSaveMemoAction() {
    if (!this.activeActionContext) return;
    const { memoId, itemIndex, actionType } = this.activeActionContext;

    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    const itemSelect = document.getElementById('memo-action-item-select');
    const selectedVal = (itemIndex !== null && itemIndex !== undefined) ? String(itemIndex) : itemSelect.value;

    if (selectedVal === 'all') {
      // Bulk closure of entire remaining items
      UI.closeModal('modal-memo-action-input');
      
      // Re-enable inputs just in case they were disabled
      document.getElementById('memo-action-carats').disabled = false;
      document.getElementById('memo-action-pieces').disabled = false;
      
      this.handleCloseMemo(memoId, actionType);
      return;
    }

    const idx = parseInt(selectedVal, 10);
    const item = memo.items[idx];
    if (!item) return;

    const inputCarats = Number(document.getElementById('memo-action-carats').value || 0);
    const inputPieces = Number(document.getElementById('memo-action-pieces').value || 0);

    const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
    const remPieces = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));

    if (inputCarats <= 0) {
      UI.showToast('Please enter a valid weight in carats.', true);
      return;
    }
    if (inputCarats > remCarats + 0.001) {
      UI.showToast(`Cannot process more than remaining carats (${remCarats.toFixed(2)} cts).`, true);
      return;
    }
    if (inputPieces > remPieces) {
      UI.showToast(`Cannot process more than remaining pieces (${remPieces} pcs).`, true);
      return;
    }

    // Re-enable fields to prevent form reset bugs later
    document.getElementById('memo-action-carats').disabled = false;
    document.getElementById('memo-action-pieces').disabled = false;

    // Apply change
    if (actionType === 'returned') {
      item.returnedCarats = Number(((item.returnedCarats || 0) + inputCarats).toFixed(3));
      item.returnedPieces = (item.returnedPieces || 0) + inputPieces;

      // Restore returned goods back to inventory stock
      const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
      if (emerald) {
        this.restoreStockToEmerald(emerald, inputCarats, inputPieces);
      }
    } else {
      item.soldCarats = Number(((item.soldCarats || 0) + inputCarats).toFixed(3));
      item.soldPieces = (item.soldPieces || 0) + inputPieces;
      // Stock was ALREADY deducted from inventory when the memo was issued!
    }

    // Check if entire memo is fully completed
    const totalRemaining = memo.items.reduce((sum, it) => {
      const rem = it.carats - (it.returnedCarats || 0) - (it.soldCarats || 0);
      return sum + Math.max(0, rem);
    }, 0);

    let isDeleted = false;
    if (totalRemaining <= 0.001) {
      const totalSold = memo.items.reduce((sum, it) => sum + (it.soldCarats || 0), 0);
      if (totalSold <= 0.001) {
        // Delete memo completely since everything has been returned!
        DBManager.database.memos = DBManager.database.memos.filter(m => m.id !== memo.id);
        isDeleted = true;
      } else {
        const totalReturned = memo.items.reduce((sum, it) => sum + (it.returnedCarats || 0), 0);
        if (totalReturned > 0) {
          memo.status = 'closed';
        } else {
          memo.status = 'sold';
        }
        memo.closedAt = new Date().toISOString();
      }
    }

    DBManager.addLog(
      actionType === 'sold' ? 'DELETE' : 'EDIT',
      memo.id,
      `Memo ${memo.memoNumber}`,
      `Processed partial ${actionType} on Memo ${memo.memoNumber}: ${inputCarats.toFixed(2)} cts of Pudia #${item.emeraldSnapshot.color || 'N/A'}.`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-memo-action-input');
      
      if (isDeleted) {
        UI.closeModal('modal-memo-detail');
        UI.showToast(`Memo ${memo.memoNumber} has been fully returned and deleted.`);
      } else {
        UI.showToast(`Successfully processed partial ${actionType} — ${inputCarats.toFixed(2)} cts`);
      }
      
      // Update UI displays
      App.refreshAllDisplays();

      // Re-render detail modal to stay open with new data if not deleted and itemIndex was passed
      if (!isDeleted && itemIndex !== null && itemIndex !== undefined) {
        this.openMemoDetail(memo.id);
      }
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  // ── Close Memo (Return / Sell All Remaining) ──────────────────────────────────

  handleCloseMemo(memoId, action) {
    const memos = DBManager.getMemos();
    const memo  = memos.find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const actionLabel = action === 'sold'
      ? 'mark ALL remaining goods as Sold — this will permanently deduct them from stock'
      : 'mark ALL remaining goods as Returned — they will return into company stock';

    UI.confirm(
      `Are you sure you want to ${actionLabel}?\n\nMemo: ${memo.memoNumber} | Broker: ${memo.brokerName}`,
      async () => {
        memo.status   = action;
        memo.closedAt = new Date().toISOString();

        (memo.items || []).forEach(item => {
          const rem = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
          const remPcs = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
          if (rem <= 0) return;

          if (action === 'sold') {
            item.soldCarats = Number(((item.soldCarats || 0) + rem).toFixed(3));
            item.soldPieces = (item.soldPieces || 0) + remPcs;
            // Stock was ALREADY deducted from inventory when memo was issued!
          } else {
            item.returnedCarats = Number(((item.returnedCarats || 0) + rem).toFixed(3));
            item.returnedPieces = (item.returnedPieces || 0) + remPcs;

            // Restore returned goods back to inventory stock
            const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
            if (emerald) {
              this.restoreStockToEmerald(emerald, rem, remPcs);
            }
          }
        });

        // After processing remaining items, check if it was fully returned without any sales
        const totalSold = memo.items.reduce((sum, it) => sum + (it.soldCarats || 0), 0);
        let isDeleted = false;

        if (totalSold <= 0.001) {
          // Delete memo completely
          DBManager.database.memos = DBManager.database.memos.filter(m => m.id !== memo.id);
          isDeleted = true;
        } else {
          memo.status   = action === 'returned' ? 'closed' : action;
          memo.closedAt = new Date().toISOString();
        }

        DBManager.addLog(
          isDeleted || action === 'sold' ? 'DELETE' : 'EDIT',
          memo.id,
          `Memo ${memo.memoNumber}`,
          isDeleted 
            ? `Memo ${memo.memoNumber} (${memo.brokerName}) fully returned and deleted.`
            : `Memo ${memo.memoNumber} (${memo.brokerName}) fully closed as ${action}.`,
          []
        );

        try {
          await DBManager.saveVault();
          if (isDeleted) {
            UI.closeModal('modal-memo-detail');
            UI.showToast(`Memo ${memo.memoNumber} fully returned and deleted.`);
          } else {
            UI.showToast(`Memo ${memo.memoNumber} fully closed as ${action}.`);
          }
          App.refreshAllDisplays();
        } catch (err) {
          UI.showToast(err.message, true);
        }
      }
    );
  },

  // ── Outcome Modal ─────────────────────────────────────────────────────────

  openMemoOutcomeModal(memoId) {
    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    this.activeOutcomeContext = { memoId, selectedOutcome: null };

    // Subtitle
    const issuedDate = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('memo-outcome-subtitle').textContent =
      `${memo.memoNumber} · ${memo.brokerName} · ${(memo.totalCarats || 0).toFixed(2)} cts · Issued ${issuedDate}`;

    // Reset card states
    ['outcome-card-sale', 'outcome-card-partial', 'outcome-card-return'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active-sale', 'active-partial', 'active-return');
    });

    // Hide all sections
    document.querySelectorAll('.outcome-section').forEach(s => s.classList.remove('active'));

    // Reset all inputs
    ['outcome-sale-rate', 'outcome-sale-date', 'outcome-sale-notes',
     'outcome-partial-sale-rate', 'outcome-partial-sale-date', 'outcome-partial-notes',
     'outcome-return-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Disable confirm & clear errors
    const btnSave = document.getElementById('btn-save-memo-outcome');
    if (btnSave) btnSave.disabled = true;
    const msg = document.getElementById('memo-outcome-validation-msg');
    if (msg) msg.textContent = '';

    UI.openModal('modal-memo-outcome');
  },

  handleOutcomeSelect(outcome) {
    if (!this.activeOutcomeContext) return;
    const memo = DBManager.getMemos().find(m => m.id === this.activeOutcomeContext.memoId);
    if (!memo) return;

    this.activeOutcomeContext.selectedOutcome = outcome;

    // Clear card active states
    document.getElementById('outcome-card-sale').classList.remove('active-sale', 'active-partial', 'active-return');
    document.getElementById('outcome-card-partial').classList.remove('active-sale', 'active-partial', 'active-return');
    document.getElementById('outcome-card-return').classList.remove('active-sale', 'active-partial', 'active-return');

    // Apply active class
    if (outcome === 'complete-sale')  document.getElementById('outcome-card-sale').classList.add('active-sale');
    if (outcome === 'partial-sale')   document.getElementById('outcome-card-partial').classList.add('active-partial');
    if (outcome === 'full-return')    document.getElementById('outcome-card-return').classList.add('active-return');

    // Hide all input sections
    document.querySelectorAll('.outcome-section').forEach(s => s.classList.remove('active'));

    // Show & populate relevant section
    if (outcome === 'complete-sale') {
      this._renderCompleteSaleSummary(memo);
      document.getElementById('outcome-section-complete-sale').classList.add('active');
    } else if (outcome === 'partial-sale') {
      this._renderPartialSaleTable(memo);
      document.getElementById('outcome-section-partial-sale').classList.add('active');
    } else if (outcome === 'full-return') {
      this._renderFullReturnSummary(memo);
      document.getElementById('outcome-section-full-return').classList.add('active');
    }

    // Clear validation message and enable confirm
    const msg = document.getElementById('memo-outcome-validation-msg');
    if (msg) msg.textContent = '';
    const btnSave = document.getElementById('btn-save-memo-outcome');
    if (btnSave) btnSave.disabled = false;
  },

  _renderCompleteSaleSummary(memo) {
    let totalRem = 0, totalRemPcs = 0;
    const pudiaLines = [];

    (memo.items || []).forEach(item => {
      const rem = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
      const remPcs = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
      if (rem > 0) {
        totalRem += rem;
        totalRemPcs += remPcs;
        const snap = item.emeraldSnapshot || {};
        pudiaLines.push(`#${snap.color || 'N/A'} &mdash; ${UI.escapeHtml(snap.group || '—')} (${rem.toFixed(2)} cts)`);
      }
    });

    document.getElementById('outcome-sale-summary').innerHTML = `
      <div class="outcome-summary-row">
        <span style="color:var(--text-muted);">Carats to be marked as sold:</span>
        <span style="font-size:20px; font-weight:800; color:#30D158;">${totalRem.toFixed(2)} cts</span>
      </div>
      <div class="outcome-summary-row">
        <span style="color:var(--text-muted);">Pieces:</span>
        <span style="font-weight:600;">${totalRemPcs} pcs</span>
      </div>
      ${pudiaLines.length > 0 ? `
      <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-light); font-size:12px; color:var(--text-muted); display:flex; flex-direction:column; gap:3px;">
        ${pudiaLines.map(l => `<span>${l}</span>`).join('')}
      </div>` : ''}
      <div style="margin-top:10px; padding:8px 12px; background:rgba(48,209,88,0.08); border:1px solid rgba(48,209,88,0.3); border-radius:6px; font-size:12px; color:#30D158; font-weight:600;">
        ⚡ These carats will be permanently deducted from stock.
      </div>
    `;
  },

  _renderPartialSaleTable(memo) {
    const tbody = document.getElementById('outcome-partial-tbody');
    tbody.innerHTML = '';

    (memo.items || []).forEach((item, idx) => {
      const rem = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
      if (rem <= 0) return;

      const snap = item.emeraldSnapshot || {};
      const gradeText = snap.stockType === 'Single Pieces' ? '' : ` · ${UI.escapeHtml(snap.lustreGrade || '—')}`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span style="font-weight:700; color:var(--text-gold-dark);">#${snap.color || 'N/A'}</span><br>
          <span style="font-size:10px; color:var(--text-muted);">${UI.escapeHtml(snap.group || '—')} · ${UI.escapeHtml(snap.shape || '—')}${gradeText}</span>
        </td>
        <td style="text-align:right; color:var(--text-muted);">${(item.carats || 0).toFixed(2)}</td>
        <td style="text-align:right; font-weight:700;">${rem.toFixed(2)} cts</td>
        <td style="text-align:right;">
          <input type="number" class="outcome-partial-input outcome-sold-input"
            data-idx="${idx}" data-rem="${rem}"
            min="0" max="${rem}" step="0.001" value="0">
        </td>
        <td style="text-align:right;">
          <input type="number" class="outcome-partial-input outcome-returned-input"
            data-idx="${idx}" data-rem="${rem}"
            min="0" max="${rem}" step="0.001" value="0">
        </td>
        <td style="text-align:center;" id="outcome-partial-rem-${idx}">
          <span style="font-weight:700; font-size:13px;">${rem.toFixed(2)}</span>
        </td>
      `;

      const soldInput = tr.querySelector('.outcome-sold-input');
      const retInput  = tr.querySelector('.outcome-returned-input');

      const updateRow = () => {
        const sold = Number(soldInput.value || 0);
        const ret  = Number(retInput.value || 0);
        const after = Number((rem - sold - ret).toFixed(3));
        const remCell = document.getElementById(`outcome-partial-rem-${idx}`);
        if (!remCell) return;

        // Highlight error state if over-allocated
        const isOver = sold + ret > rem + 0.001;
        soldInput.classList.toggle('input-error', isOver);
        retInput.classList.toggle('input-error', isOver);

        if (isOver) {
          remCell.innerHTML = `<span style="color:var(--danger-red); font-weight:700; font-size:11px;">⚠ Exceeds</span>`;
        } else if (after <= 0) {
          remCell.innerHTML = `<span style="color:#30D158; font-weight:700; font-size:11px;">CLOSED ✓</span>`;
        } else {
          remCell.innerHTML = `<span style="font-weight:700; font-size:13px;">${after.toFixed(2)}</span>`;
        }
      };

      soldInput.addEventListener('input', updateRow);
      retInput.addEventListener('input', updateRow);

      tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">No remaining items on this memo.</td></tr>';
    }
  },

  _renderFullReturnSummary(memo) {
    let totalRem = 0, totalRemPcs = 0;
    (memo.items || []).forEach(item => {
      totalRem    += Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
      totalRemPcs += Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
    });

    document.getElementById('outcome-return-summary').innerHTML = `
      <div style="font-size:36px; margin-bottom:10px;">↩️</div>
      <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:6px;">
        ${totalRem.toFixed(2)} cts · ${totalRemPcs} pcs returned to stock
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
        All remaining goods will be returned. No stock changes. Memo will be deleted.
      </div>
      <div style="display:inline-block; padding:6px 16px; background:rgba(140,140,160,0.1); border:1px solid rgba(140,140,160,0.3); border-radius:20px; font-size:11px; color:var(--text-muted); font-weight:700;">
        Broker: ${UI.escapeHtml(memo.brokerName)}
      </div>
    `;
  },

  async handleSaveOutcome() {
    if (!this.activeOutcomeContext) return;
    const { memoId, selectedOutcome } = this.activeOutcomeContext;
    const validationMsg = document.getElementById('memo-outcome-validation-msg');
    if (validationMsg) validationMsg.textContent = '';

    if (!selectedOutcome) {
      if (validationMsg) validationMsg.textContent = 'Please select an outcome above.';
      return;
    }

    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    if (selectedOutcome === 'complete-sale') {
      await this._executeCompleteSale(memo);
    } else if (selectedOutcome === 'partial-sale') {
      await this._executePartialSale(memo, validationMsg);
    } else if (selectedOutcome === 'full-return') {
      await this._executeFullReturn(memo);
    }
  },

  async _executeCompleteSale(memo) {
    const saleRate = Number(document.getElementById('outcome-sale-rate').value || 0);
    const saleDate = document.getElementById('outcome-sale-date').value || '';
    const saleNotes = (document.getElementById('outcome-sale-notes').value || '').trim();

    let totalSoldCts = 0;

    (memo.items || []).forEach(item => {
      const rem    = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
      const remPcs = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
      if (rem <= 0) return;

      item.soldCarats = Number(((item.soldCarats || 0) + rem).toFixed(3));
      item.soldPieces = (item.soldPieces || 0) + remPcs;
      totalSoldCts   += rem;
      // Stock was ALREADY deducted from inventory when memo was issued!
    });

    memo.status      = 'sold';
    memo.closedAt    = new Date().toISOString();
    memo.outcomeType = 'complete-sale';
    if (saleRate > 0) memo.saleRate = saleRate;
    if (saleDate)     memo.saleDate = saleDate;
    if (saleNotes)    memo.outcomeNotes = saleNotes;

    const rateNote = saleRate > 0 ? ` · Rate: ₹${saleRate.toLocaleString('en-IN')}/ct · Total: ₹${(saleRate * totalSoldCts).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '';
    DBManager.addLog('DELETE', memo.id, `Memo ${memo.memoNumber}`,
      `Complete Sale: Memo ${memo.memoNumber} (${memo.brokerName}) — ${totalSoldCts.toFixed(2)} cts sold.${rateNote}`, []);

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-memo-outcome');
      UI.showToast(`💰 Memo ${memo.memoNumber} — Complete Sale recorded. ${totalSoldCts.toFixed(2)} cts sold.`);
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  async _executePartialSale(memo, validationMsg) {
    const soldInputs = document.querySelectorAll('#outcome-partial-tbody .outcome-sold-input');
    const retInputs  = document.querySelectorAll('#outcome-partial-tbody .outcome-returned-input');

    let hasAnyAction = false;
    let errorMsg     = null;
    const rowData    = [];

    soldInputs.forEach((soldInp, i) => {
      const retInp  = retInputs[i];
      const idx     = parseInt(soldInp.dataset.idx, 10);
      const rem     = parseFloat(soldInp.dataset.rem);
      const soldVal = Math.max(0, Number(soldInp.value || 0));
      const retVal  = Math.max(0, Number(retInp.value || 0));

      if (soldVal > 0 || retVal > 0) hasAnyAction = true;

      if (soldVal + retVal > rem + 0.001) {
        const snap = (memo.items[idx] || {}).emeraldSnapshot || {};
        errorMsg = `Pudia #${snap.color || idx + 1}: Sold + Returned (${(soldVal + retVal).toFixed(2)}) exceeds remaining (${rem.toFixed(2)}) cts.`;
      }

      rowData.push({ idx, soldVal, retVal, rem });
    });

    if (errorMsg) {
      if (validationMsg) validationMsg.textContent = errorMsg;
      return;
    }
    if (!hasAnyAction) {
      if (validationMsg) validationMsg.textContent = 'Please enter at least one sold or returned quantity.';
      return;
    }

    const saleRate  = Number(document.getElementById('outcome-partial-sale-rate').value || 0);
    const saleDate  = document.getElementById('outcome-partial-sale-date').value || '';
    const saleNotes = (document.getElementById('outcome-partial-notes').value || '').trim();

    let totalSoldCts = 0, totalRetCts = 0;

    rowData.forEach(({ idx, soldVal, retVal }) => {
      const item = memo.items[idx];
      if (!item) return;

      if (soldVal > 0) {
        // Compute proportional pieces to sell (round down to not overshoot)
        const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
        const remPcs    = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
        const soldPcs   = remCarats > 0 ? Math.floor((soldVal / remCarats) * remPcs) : 0;

        item.soldCarats  = Number(((item.soldCarats || 0) + soldVal).toFixed(3));
        item.soldPieces  = (item.soldPieces || 0) + soldPcs;
        totalSoldCts    += soldVal;
        // Stock was ALREADY deducted from inventory when memo was issued!
      }

      if (retVal > 0) {
        // Compute proportional pieces to return
        const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
        const remPcs    = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
        const retPcs    = remCarats > 0 ? Math.floor((retVal / remCarats) * remPcs) : 0;

        item.returnedCarats  = Number(((item.returnedCarats || 0) + retVal).toFixed(3));
        item.returnedPieces  = (item.returnedPieces || 0) + retPcs;
        totalRetCts         += retVal;

        // Restore returned stock to company inventory
        const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
        if (emerald) {
          this.restoreStockToEmerald(emerald, retVal, retPcs);
        }
      }
    });

    // Check if memo is now fully resolved
    const remaining = memo.items.reduce((sum, it) =>
      sum + Math.max(0, it.carats - (it.returnedCarats || 0) - (it.soldCarats || 0)), 0);

    if (remaining <= 0.001) {
      const totalSoldAll = memo.items.reduce((s, it) => s + (it.soldCarats || 0), 0);
      if (totalSoldAll <= 0.001) {
        DBManager.database.memos = DBManager.database.memos.filter(m => m.id !== memo.id);
      } else {
        const totalRetAll = memo.items.reduce((s, it) => s + (it.returnedCarats || 0), 0);
        memo.status   = totalRetAll > 0.001 ? 'closed' : 'sold';
        memo.closedAt = new Date().toISOString();
      }
    }

    memo.outcomeType = 'partial-sale';
    if (saleRate > 0) memo.saleRate = saleRate;
    if (saleDate)     memo.saleDate = saleDate;
    if (saleNotes)    memo.outcomeNotes = saleNotes;

    DBManager.addLog('EDIT', memo.id, `Memo ${memo.memoNumber}`,
      `Partial Sale: Memo ${memo.memoNumber} (${memo.brokerName}) — ${totalSoldCts.toFixed(2)} cts sold, ${totalRetCts.toFixed(2)} cts returned.`, []);

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-memo-outcome');
      UI.showToast(`⚖️ Memo ${memo.memoNumber} — Partial outcome recorded. ${totalSoldCts.toFixed(2)} cts sold, ${totalRetCts.toFixed(2)} cts returned.`);
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  async _executeFullReturn(memo) {
    const notes = (document.getElementById('outcome-return-notes').value || '').trim();

    (memo.items || []).forEach(item => {
      const rem    = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
      const remPcs = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));
      if (rem <= 0) return;
      item.returnedCarats  = Number(((item.returnedCarats || 0) + rem).toFixed(3));
      item.returnedPieces  = (item.returnedPieces || 0) + remPcs;

      // Restore returned stock to company inventory
      const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
      if (emerald) {
        this.restoreStockToEmerald(emerald, rem, remPcs);
      }
    });

    const totalSoldAll = memo.items.reduce((s, it) => s + (it.soldCarats || 0), 0);
    let isDeleted = false;

    if (totalSoldAll <= 0.001) {
      // No prior sales — delete memo entirely
      DBManager.database.memos = DBManager.database.memos.filter(m => m.id !== memo.id);
      isDeleted = true;
    } else {
      memo.status      = 'closed';
      memo.closedAt    = new Date().toISOString();
      memo.outcomeType = 'full-return';
      if (notes) memo.outcomeNotes = notes;
    }

    DBManager.addLog(
      'EDIT',
      memo.id,
      `Memo ${memo.memoNumber}`,
      isDeleted
        ? `Full Return: Memo ${memo.memoNumber} (${memo.brokerName}) fully returned and deleted.`
        : `Full Return: Memo ${memo.memoNumber} (${memo.brokerName}) — all remaining goods returned, memo closed.`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-memo-outcome');
      UI.showToast(isDeleted
        ? `↩️ Memo ${memo.memoNumber} fully returned and deleted.`
        : `↩️ Memo ${memo.memoNumber} — Full return recorded.`);
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  deleteMemo(memoId) {
    const memo = DBManager.getMemos().find(m => m.id === memoId);
    if (!memo) return;

    UI.confirm(
      `Are you sure you want to delete Memo ${memo.memoNumber}? This will cancel the memo and restore any unreturned goods back into company stock.`,
      async () => {
        let totalRestoredCarats = 0;

        (memo.items || []).forEach(item => {
          // Unreturned/unsold carats on this memo were deducted when memo was created
          const unreturnedCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.soldCarats || 0)).toFixed(3)));
          const unreturnedPieces = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.soldPieces || 0));

          if (unreturnedCarats > 0) {
            const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
            if (emerald) {
              this.restoreStockToEmerald(emerald, unreturnedCarats, unreturnedPieces);
              totalRestoredCarats += unreturnedCarats;
            }
          }
        });

        // Delete memo from storage
        DBManager.database.memos = (DBManager.database.memos || []).filter(m => m.id !== memoId);

        DBManager.addLog(
          'DELETE',
          memo.id,
          `Memo ${memo.memoNumber}`,
          `Deleted Memo ${memo.memoNumber} (${memo.brokerName}). Restored unreturned goods (${totalRestoredCarats.toFixed(2)} cts total) to company stock.`,
          []
        );

        try {
          await DBManager.saveVault();
          UI.closeModal('modal-memo-detail');
          UI.showToast(`Deleted Memo ${memo.memoNumber} — restored goods (${totalRestoredCarats.toFixed(2)} cts) to stock.`);
          App.refreshAllDisplays();
        } catch (err) {
          UI.showToast(err.message, true);
        }
      }
    );
  }
};

window.MemoController = MemoController;
