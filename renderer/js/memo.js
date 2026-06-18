/**
 * Memo Controller Module
 * Manages emerald memo issuance to brokers: create, view, return, and sell memos.
 * Tracks "in company" vs "on memo" carats for each Pudia without modifying stock records
 * until a memo is explicitly marked as Sold.
 */

const MemoController = {
  selectedItems: [],
  activeCreateSelectedId: null,

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
      searchInp.addEventListener('input', () => this.handleCreateSearchInput());
    }

    const btnAddItem = document.getElementById('btn-memo-add-item');
    if (btnAddItem) {
      btnAddItem.addEventListener('click', () => this.handleAddItemToSelected());
    }

    // Filter and search in memo list tab
    const statusFilter = document.getElementById('memo-filter-status');
    if (statusFilter) statusFilter.addEventListener('change', () => this.renderMemoList());

    const searchInput = document.getElementById('memo-search-input');
    if (searchInput) searchInput.addEventListener('input', () => this.renderMemoList());
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
   * Returns total carats currently OUT on open memos for a given emerald ID.
   * Used both here and by emerald.js for the stock split display.
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

      const totalCts = EmeraldController.getEmeraldWeight(e);
      const memoCts  = Number((memoCaratsMap[e.id] || 0).toFixed(3));
      const availCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));
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
      const totalCts = EmeraldController.getEmeraldWeight(e);
      const memoCts  = Number((memoCaratsMap[e.id] || 0).toFixed(3));
      const availCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));

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
        piecesInp.value = e.pieces || '';
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

    const memoCaratsMap = this.buildMemoCaratsMap();
    const totalCts = EmeraldController.getEmeraldWeight(emerald);
    const memoCts  = Number((memoCaratsMap[emerald.id] || 0).toFixed(3));
    const maxCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));

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

    DBManager.addLog(
      'ADD', memo.id, `Memo ${memoNumber}`,
      `Issued memo ${memoNumber} to ${brokerName}: ${totalCarats.toFixed(2)} cts (${this.selectedItems.length} Pudia${this.selectedItems.length !== 1 ? 's' : ''})`,
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
        <td style="font-weight:600;">${UI.escapeHtml(memo.brokerName)}</td>
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
              <button type="button" class="btn btn-secondary btn-small btn-return-memo" style="font-size:11px;">Return</button>
              <button type="button" class="btn btn-primary btn-small btn-sell-memo" style="font-size:11px;">Sold</button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const retBtn  = tr.querySelector('.btn-return-memo');
      const sellBtn = tr.querySelector('.btn-sell-memo');
      if (retBtn)  retBtn.addEventListener('click',  () => this.openMemoActionInputModal(memo.id, null, 'returned'));
      if (sellBtn) sellBtn.addEventListener('click',  () => this.openMemoActionInputModal(memo.id, null, 'sold'));

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
      if (memo.status === 'open') {
        actionsEl.innerHTML = `
          <button type="button" class="btn btn-secondary" id="btn-detail-return">Return All Remaining</button>
          <button type="button" class="btn btn-primary" id="btn-detail-sell">Sell All Remaining</button>
        `;
        document.getElementById('btn-detail-return').addEventListener('click', () => {
          UI.closeModal('modal-memo-detail');
          this.handleCloseMemo(memo.id, 'returned');
        });
        document.getElementById('btn-detail-sell').addEventListener('click', () => {
          UI.closeModal('modal-memo-detail');
          this.handleCloseMemo(memo.id, 'sold');
        });
      } else {
        actionsEl.innerHTML = '';
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
    } else {
      item.soldCarats = Number(((item.soldCarats || 0) + inputCarats).toFixed(3));
      item.soldPieces = (item.soldPieces || 0) + inputPieces;

      // Permanently deduct from stock
      const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
      if (emerald) {
        const currentWeight = EmeraldController.getEmeraldWeight(emerald);
        const newWeight     = Math.max(0, Number((currentWeight - inputCarats).toFixed(3)));

        if (emerald.sizes && emerald.sizes.length > 0 && currentWeight > 0) {
          const ratio = newWeight / currentWeight;
          emerald.sizes.forEach(s => {
            s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
          });
        }
        emerald.weight = newWeight;
        emerald.updatedAt = new Date().toISOString();
      }
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

            const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
            if (emerald) {
              const currentWeight = EmeraldController.getEmeraldWeight(emerald);
              const newWeight     = Math.max(0, Number((currentWeight - rem).toFixed(3)));

              if (emerald.sizes && emerald.sizes.length > 0 && currentWeight > 0) {
                const ratio = newWeight / currentWeight;
                emerald.sizes.forEach(s => {
                  s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
                });
              }
              emerald.weight = newWeight;
              emerald.updatedAt = new Date().toISOString();
            }
          } else {
            item.returnedCarats = Number(((item.returnedCarats || 0) + rem).toFixed(3));
            item.returnedPieces = (item.returnedPieces || 0) + remPcs;
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
  }
};

window.MemoController = MemoController;
