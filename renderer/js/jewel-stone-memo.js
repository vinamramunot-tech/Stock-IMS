/**
 * Manufacturer Jewel Stone Memos Controller Module
 * Manages loose stone memo issuance to manufacturers: create, view, return, and mount.
 * Tracks "with manufacturer" vs "in stock" carats for each stone packet.
 */

const JewelStoneMemoController = {
  selectedItems: [],
  activeCreateSelectedId: null,
  activeActionContext: null,

  init() {
    // Nav triggers
    const btnNavCreate = document.getElementById('btn-nav-create-jewel-stone-memo');
    if (btnNavCreate) {
      btnNavCreate.addEventListener('click', () => this.openCreateMemoModal());
    }
    const btnCreate = document.getElementById('btn-create-jewel-stone-memo');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => this.openCreateMemoModal());
    }

    const btnSave = document.getElementById('btn-save-jewel-stone-memo');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.handleSaveMemo());
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close-trigger-jewel-stone-memo').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-create-jewel-stone-memo'));
    });
    document.querySelectorAll('.modal-close-trigger-jewel-stone-memo-detail').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewel-stone-memo-detail'));
    });
    document.querySelectorAll('.modal-close-trigger-jewel-stone-memo-action').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-jewel-stone-memo-action-input'));
    });

    const btnSaveAction = document.getElementById('btn-save-jewel-stone-memo-action');
    if (btnSaveAction) {
      btnSaveAction.addEventListener('click', () => this.handleSaveMemoAction());
    }

    // Selection changes
    const typeSelect = document.getElementById('jewel-stone-memo-create-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', () => this.handleCreateTypeChange());
    }
    const groupSelect = document.getElementById('jewel-stone-memo-create-group');
    if (groupSelect) {
      groupSelect.addEventListener('change', () => this.handleCreateGroupChange());
    }
    const searchInp = document.getElementById('jewel-stone-memo-create-search');
    if (searchInp) {
      searchInp.addEventListener('input', UI.debounce(() => this.handleCreateSearchInput(), 200));
    }

    const btnAddItem = document.getElementById('btn-jewel-stone-memo-add-item');
    if (btnAddItem) {
      btnAddItem.addEventListener('click', () => this.handleAddItemToSelected());
    }

    // Filters on Memos list tab
    const statusFilter = document.getElementById('jewel-stone-memo-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => this.renderMemoList());
    }
    const searchInput = document.getElementById('jewel-stone-memo-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(() => this.renderMemoList(), 200));
    }
  },

  getNextMemoNumber() {
    const memos = DBManager.getJewelStoneMemos();
    if (memos.length === 0) return 'JSM-001';
    const nums = memos.map(m => {
      const match = (m.memoNumber || '').match(/(?:SM|JSM)-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const next = Math.max(...nums) + 1;
    return `JSM-${String(next).padStart(3, '0')}`;
  },

  getOpenMemoCaratsForStone(stoneId) {
    const memos = DBManager.getJewelStoneMemos();
    let total = 0;
    memos.forEach(memo => {
      if (memo.status === 'open') {
        (memo.items || []).forEach(item => {
          if (item.stoneId === stoneId) {
            const rem = (item.carats || 0) - (item.returnedCarats || 0) - (item.mountedCarats || 0);
            if (rem > 0) total += rem;
          }
        });
      }
    });
    return Number(total.toFixed(3));
  },

  buildMemoCaratsMap() {
    const map = {};
    DBManager.getJewelStoneMemos().filter(m => m.status === 'open').forEach(memo => {
      (memo.items || []).forEach(item => {
        if (!map[item.stoneId]) map[item.stoneId] = 0;
        const rem = (item.carats || 0) - (item.returnedCarats || 0) - (item.mountedCarats || 0);
        if (rem > 0) map[item.stoneId] += rem;
      });
    });
    return map;
  },

  getAllPastManufacturers() {
    const manufacturers = new Set();
    DBManager.getJewelStoneMemos().forEach(m => {
      if (m.manufacturerName) manufacturers.add(m.manufacturerName);
    });
    return Array.from(manufacturers).sort();
  },

  openCreateMemoModal() {
    this.selectedItems = [];
    this.activeCreateSelectedId = null;
    this.resetCreateMemoForm();
    UI.openModal('modal-create-jewel-stone-memo');
  },

  resetCreateMemoForm() {
    const manufInput = document.getElementById('jewel-stone-memo-manufacturer-name');
    if (manufInput) manufInput.value = '';
    const dateInput = document.getElementById('jewel-stone-memo-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const notesInput = document.getElementById('jewel-stone-memo-notes');
    if (notesInput) notesInput.value = '';

    const searchInp = document.getElementById('jewel-stone-memo-create-search');
    if (searchInp) searchInp.value = '';
    const caratsInp = document.getElementById('jewel-stone-memo-create-carats');
    if (caratsInp) caratsInp.value = '';
    const piecesInp = document.getElementById('jewel-stone-memo-create-pieces');
    if (piecesInp) piecesInp.value = '';

    const availLabel = document.getElementById('jewel-stone-memo-create-avail-carats-lbl');
    if (availLabel) availLabel.textContent = '(Available: —)';

    this.activeCreateSelectedId = null;

    this.populateManufacturerDatalist();
    this.populateTypeSelect();
    this.populateGroupSelect();
    this.filterCreatePackets();
    this.renderSelectedItemsTable();
  },

  populateManufacturerDatalist() {
    const list = document.getElementById('jewel-stone-memo-manufacturers-list');
    if (!list) return;
    list.innerHTML = '';
    this.getAllPastManufacturers().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      list.appendChild(opt);
    });
  },

  populateTypeSelect() {
    const select = document.getElementById('jewel-stone-memo-create-type');
    if (!select) return;
    select.innerHTML = '<option value="">-- All Types --</option>';
    const types = new Set();
    DBManager.getStones().forEach(st => { if (st.type) types.add(st.type); });
    Array.from(types).sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t; select.appendChild(opt);
    });
  },

  populateGroupSelect() {
    const select = document.getElementById('jewel-stone-memo-create-group');
    if (!select) return;
    select.innerHTML = '<option value="">-- All Groups --</option>';
    const groups = new Set();
    DBManager.getStones().forEach(st => { if (st.group) groups.add(st.group); });
    Array.from(groups).sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g; select.appendChild(opt);
    });
  },

  handleCreateTypeChange() {
    const searchInp = document.getElementById('jewel-stone-memo-create-search');
    if (searchInp) searchInp.value = '';
    this.filterCreatePackets();
  },

  handleCreateGroupChange() {
    const searchInp = document.getElementById('jewel-stone-memo-create-search');
    if (searchInp) searchInp.value = '';
    this.filterCreatePackets();
  },

  handleCreateSearchInput() {
    const typeSelect = document.getElementById('jewel-stone-memo-create-type');
    if (typeSelect) typeSelect.value = '';
    const groupSelect = document.getElementById('jewel-stone-memo-create-group');
    if (groupSelect) groupSelect.value = '';
    this.filterCreatePackets();
  },

  filterCreatePackets() {
    const listContainer = document.getElementById('jewel-stone-memo-create-packet-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const query = (document.getElementById('jewel-stone-memo-create-search').value || '').toLowerCase().trim();
    const typeVal = document.getElementById('jewel-stone-memo-create-type').value;
    const groupVal = document.getElementById('jewel-stone-memo-create-group').value;

    if (!query && !typeVal && !groupVal) {
      listContainer.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;font-style:italic;">Type search or choose filters to view Packets</div>';
      return;
    }

    const stones = DBManager.getStones();
    const memoCaratsMap = this.buildMemoCaratsMap();

    const filtered = stones.filter(st => {
      if (this.selectedItems.some(item => item.stoneId === st.id)) return false;

      const totalCts = StoneController.getStoneWeight(st);
      const memoCts = Number((memoCaratsMap[st.id] || 0).toFixed(3));
      const availCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));
      if (availCts <= 0) return false;

      if (typeVal && st.type !== typeVal) return false;
      if (groupVal && st.group !== groupVal) return false;

      if (query) {
        const matchType = (st.type || '').toLowerCase().includes(query);
        const matchGroup = (st.group || '').toLowerCase().includes(query);
        const matchGrade = (st.lustreGrade || '').toLowerCase().includes(query);
        const matchPacket = String(st.color || '').toLowerCase().includes(query);
        const matchShape = (st.shape || '').toLowerCase().includes(query);
        return matchType || matchGroup || matchGrade || matchPacket || matchShape;
      }
      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:12px;">No matching Packets found</div>';
      return;
    }

    filtered.forEach(st => {
      const totalCts = StoneController.getStoneWeight(st);
      const memoCts = Number((memoCaratsMap[st.id] || 0).toFixed(3));
      const availCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));

      const div = document.createElement('div');
      div.className = 'pudia-picker-row';
      div.dataset.id = st.id;
      div.style = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-main);transition:background var(--transition-fast);';
      div.innerHTML = `
        <span><strong>${st.type} #${st.color || 'N/A'}</strong> - ${UI.escapeHtml(st.group || '—')} (${UI.escapeHtml(st.shape || '—')}, ${UI.escapeHtml(st.lustreGrade || '—')})</span>
        <span style="font-weight:700;color:var(--text-gold-dark);">${availCts.toFixed(3)} cts</span>
      `;

      if (this.activeCreateSelectedId === st.id) {
        div.style.backgroundColor = 'var(--border-light)';
        div.style.fontWeight = '700';
      }

      div.addEventListener('click', () => {
        listContainer.querySelectorAll('.pudia-picker-row').forEach(row => {
          row.style.backgroundColor = '';
          row.style.fontWeight = '';
        });
        div.style.backgroundColor = 'var(--border-light)';
        div.style.fontWeight = '700';

        this.activeCreateSelectedId = st.id;

        const lbl = document.getElementById('jewel-stone-memo-create-avail-carats-lbl');
        const caratsInp = document.getElementById('jewel-stone-memo-create-carats');
        const piecesInp = document.getElementById('jewel-stone-memo-create-pieces');

        if (lbl) lbl.textContent = `(Available: ${availCts.toFixed(3)} cts)`;
        caratsInp.max = availCts;
        caratsInp.value = availCts;
        piecesInp.value = StoneController.getStonePieces(st) || '';
      });

      listContainer.appendChild(div);
    });
  },

  handleAddItemToSelected() {
    const caratsInp = document.getElementById('jewel-stone-memo-create-carats');
    const piecesInp = document.getElementById('jewel-stone-memo-create-pieces');
    if (!caratsInp) return;

    const stoneId = this.activeCreateSelectedId;
    if (!stoneId) {
      UI.showToast('Please click on a stone packet from the list to select it.', true);
      return;
    }

    const inputCarats = Number(caratsInp.value || 0);
    const inputPieces = Number(piecesInp.value || 0);

    const stone = DBManager.getStones().find(st => st.id === stoneId);
    if (!stone) return;

    const memoCaratsMap = this.buildMemoCaratsMap();
    const totalCts = StoneController.getStoneWeight(stone);
    const memoCts = Number((memoCaratsMap[stone.id] || 0).toFixed(3));
    const maxCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));

    if (inputCarats <= 0) {
      UI.showToast('Please enter a valid weight in carats.', true);
      return;
    }

    if (inputCarats > maxCts + 0.001) {
      UI.showToast(`Cannot issue more than available carats (${maxCts.toFixed(3)} cts).`, true);
      return;
    }

    this.selectedItems.push({
      stoneId,
      stoneSnapshot: {
        type: stone.type || 'Diamond',
        group: stone.group || '',
        lustreGrade: stone.lustreGrade || '',
        color: stone.color || '',
        shape: stone.shape || ''
      },
      carats: Number(inputCarats.toFixed(3)),
      pieces: inputPieces,
      returnedCarats: 0,
      mountedCarats: 0,
      returnedPieces: 0,
      mountedPieces: 0
    });

    this.activeCreateSelectedId = null;
    caratsInp.value = '';
    piecesInp.value = '';
    const lbl = document.getElementById('jewel-stone-memo-create-avail-carats-lbl');
    if (lbl) lbl.textContent = '(Available: —)';

    this.filterCreatePackets();
    this.renderSelectedItemsTable();
  },

  renderSelectedItemsTable() {
    const tbody = document.getElementById('jewel-stone-memo-selected-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (this.selectedItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No items selected. Select a packet above and click "Add Item".</td></tr>';
      this.updateSelectedTotals();
      return;
    }

    this.selectedItems.forEach((item, index) => {
      const snap = item.stoneSnapshot;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px 12px;font-weight:600;">${snap.type}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:700;color:var(--text-gold-dark);">#${snap.color || 'N/A'}</td>
        <td style="padding:8px 12px;">${UI.escapeHtml(snap.group || '—')} / ${UI.escapeHtml(snap.shape || '—')}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;">${item.carats.toFixed(3)} cts</td>
        <td style="padding:8px 12px;text-align:right;">${item.pieces || '—'}</td>
        <td style="padding:8px 12px;text-align:center;">
          <button type="button" class="btn btn-danger btn-small" style="font-size:10px;padding:3px 6px;" data-index="${index}">Remove</button>
        </td>
      `;

      tr.querySelector('.btn-danger').addEventListener('click', () => {
        this.selectedItems.splice(index, 1);
        this.filterCreatePackets();
        this.renderSelectedItemsTable();
      });

      tbody.appendChild(tr);
    });

    this.updateSelectedTotals();
  },

  updateSelectedTotals() {
    const totalCts = this.selectedItems.reduce((sum, item) => sum + item.carats, 0);
    const totalEl = document.getElementById('jewel-stone-memo-total-carats');
    const countEl = document.getElementById('jewel-stone-memo-item-count');
    if (totalEl) totalEl.textContent = totalCts.toFixed(3);
    if (countEl) countEl.textContent = this.selectedItems.length;
  },

  async handleSaveMemo() {
    const manufacturerName = (document.getElementById('jewel-stone-memo-manufacturer-name').value || '').trim();
    const date = document.getElementById('jewel-stone-memo-date').value;
    const notes = (document.getElementById('jewel-stone-memo-notes').value || '').trim();

    if (!manufacturerName) { UI.showToast('Please enter a manufacturer name.', true); return; }
    if (!date) { UI.showToast('Please select a memo date.', true); return; }
    if (this.selectedItems.length === 0) {
      UI.showToast('Please add at least one Stone Packet to the memo.', true);
      return;
    }

    const totalCarats = Number(this.selectedItems.reduce((s, i) => s + i.carats, 0).toFixed(3));
    const memoNumber = this.getNextMemoNumber();

    const memo = {
      id: 'jewel_stone_memo_' + Date.now(),
      memoNumber,
      manufacturerName,
      date,
      status: 'open', // open | closed
      createdAt: new Date().toISOString(),
      closedAt: null,
      notes,
      items: this.selectedItems,
      totalCarats
    };

    if (!DBManager.database.jewelStoneMemos) DBManager.database.jewelStoneMemos = [];
    DBManager.database.jewelStoneMemos.push(memo);

    DBManager.addLog(
      'ADD', memo.id, `Jewel Stone Memo ${memoNumber}`,
      `Issued jewel stone memo ${memoNumber} to manufacturer ${manufacturerName}: ${totalCarats.toFixed(3)} cts (${this.selectedItems.length} items)`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-create-jewel-stone-memo');
      UI.showToast(`Jewel Stone Memo ${memoNumber} issued to ${manufacturerName}`);
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  renderMemoList() {
    const memos = DBManager.getJewelStoneMemos();
    const openMemos = memos.filter(m => m.status === 'open');
    const totalOnMemo = openMemos.reduce((s, m) => s + (m.totalCarats || 0), 0);

    const elCount = document.getElementById('metric-jewel-stone-open-count');
    const elCts = document.getElementById('metric-jewel-stone-carats');
    // Also update index.html metrics if names changed
    const legacyElCount = document.getElementById('metric-stone-memo-open-count');
    const legacyElCts = document.getElementById('metric-stone-memo-carats');

    if (elCount) elCount.textContent = openMemos.length;
    if (elCts) elCts.textContent = totalOnMemo.toFixed(3) + ' cts';
    if (legacyElCount) legacyElCount.textContent = openMemos.length;
    if (legacyElCts) legacyElCts.textContent = totalOnMemo.toFixed(3) + ' cts';

    const statusFilter = document.getElementById('jewel-stone-memo-filter-status');
    const searchInput = document.getElementById('jewel-stone-memo-search-input');
    const filterVal = statusFilter ? statusFilter.value : '';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = memos.filter(m => {
      const matchStatus = !filterVal || m.status === filterVal;
      const matchSearch = !query ||
        (m.manufacturerName || '').toLowerCase().includes(query) ||
        (m.memoNumber || '').toLowerCase().includes(query);
      return matchStatus && matchSearch;
    });

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const tbody = document.getElementById('jewel-stone-memo-list-tbody');
    const emptyEl = document.getElementById('jewel-stone-memo-empty-state');
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
        <td style="font-weight:600;">${UI.escapeHtml(memo.manufacturerName)}</td>
        <td style="text-align:right;font-weight:700;">${(memo.totalCarats || 0).toFixed(3)} cts</td>
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
              <button type="button" class="btn btn-primary btn-small btn-mount-memo" style="font-size:11px;">Mounted</button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-memo').addEventListener('click', () => this.openMemoDetail(memo.id));
      const retBtn = tr.querySelector('.btn-return-memo');
      const mntBtn = tr.querySelector('.btn-mount-memo');
      if (retBtn) retBtn.addEventListener('click', () => this.openMemoActionInputModal(memo.id, null, 'returned'));
      if (mntBtn) mntBtn.addEventListener('click', () => this.openMemoActionInputModal(memo.id, null, 'mounted'));

      tbody.appendChild(tr);
    });
  },

  openMemoDetail(memoId) {
    const memo = DBManager.getJewelStoneMemos().find(m => m.id === memoId);
    if (!memo) return;

    const dateFmt = new Date(memo.date + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    document.getElementById('jewel-stone-memo-detail-number').textContent = memo.memoNumber;
    document.getElementById('jewel-stone-memo-detail-manufacturer').textContent = memo.manufacturerName;
    document.getElementById('jewel-stone-memo-detail-date').textContent = dateFmt;
    document.getElementById('jewel-stone-memo-detail-status').textContent = memo.status.toUpperCase();
    document.getElementById('jewel-stone-memo-detail-notes').textContent = memo.notes || '—';
    document.getElementById('jewel-stone-memo-detail-total-carats').textContent = (memo.totalCarats || 0).toFixed(3) + ' cts';

    const closedRow = document.getElementById('jewel-stone-memo-detail-closed-row');
    if (memo.closedAt && closedRow) {
      document.getElementById('jewel-stone-memo-detail-closed-at').textContent =
        new Date(memo.closedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      closedRow.classList.remove('hidden');
    } else if (closedRow) {
      closedRow.classList.add('hidden');
    }

    const tbody = document.getElementById('jewel-stone-memo-detail-items-tbody');
    tbody.innerHTML = '';

    (memo.items || []).forEach((item, index) => {
      const snap = item.stoneSnapshot || {};
      const rCts = item.returnedCarats || 0;
      const mCts = item.mountedCarats || 0;
      const remCts = Math.max(0, Number((item.carats - rCts - mCts).toFixed(3)));

      const rPcs = item.returnedPieces || 0;
      const mPcs = item.mountedPieces || 0;
      const remPcs = Math.max(0, (item.pieces || 0) - rPcs - mPcs);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px 10px;">${snap.type}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:var(--text-gold-dark);">#${snap.color || 'N/A'}</td>
        <td style="padding:8px 10px;">${UI.escapeHtml(snap.group || '—')} / ${UI.escapeHtml(snap.shape || '—')}</td>
        <td style="padding:8px 10px;text-align:right;">${(item.carats || 0).toFixed(3)} cts<br><span style="font-size:10px;color:var(--text-muted);">${item.pieces || '—'} pcs</span></td>
        <td style="padding:8px 10px;text-align:right;color:var(--text-muted);">${rCts > 0 ? `${rCts.toFixed(3)} cts<br><span style="font-size:10px;">${rPcs} pcs</span>` : '—'}</td>
        <td style="padding:8px 10px;text-align:right;color:var(--text-gold-dark);">${mCts > 0 ? `${mCts.toFixed(3)} cts<br><span style="font-size:10px;">${mPcs} pcs</span>` : '—'}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--text-main);">${remCts > 0 ? `${remCts.toFixed(3)} cts<br><span style="font-size:10px;font-weight:normal;color:var(--text-muted);">${remPcs} pcs</span>` : '<span style="color:var(--success-green);font-size:11px;">CLOSED</span>'}</td>
        <td style="padding:8px 10px;text-align:center;">
          ${memo.status === 'open' && remCts > 0 ? `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button type="button" class="btn btn-secondary btn-small btn-row-return" style="font-size:10px;padding:3px 6px;" data-index="${index}">Return</button>
              <button type="button" class="btn btn-primary btn-small btn-row-mount" style="font-size:10px;padding:3px 6px;" data-index="${index}">Mount</button>
            </div>
          ` : '—'}
        </td>
      `;

      if (memo.status === 'open' && remCts > 0) {
        tr.querySelector('.btn-row-return').addEventListener('click', () => this.openMemoActionInputModal(memo.id, index, 'returned'));
        tr.querySelector('.btn-row-mount').addEventListener('click', () => this.openMemoActionInputModal(memo.id, index, 'mounted'));
      }

      tbody.appendChild(tr);
    });

    const actionsEl = document.getElementById('jewel-stone-memo-detail-actions');
    if (actionsEl) {
      if (memo.status === 'open') {
        actionsEl.innerHTML = `
          <button type="button" class="btn btn-secondary" id="btn-jewel-stone-detail-return">Return All Remaining</button>
          <button type="button" class="btn btn-primary" id="btn-jewel-stone-detail-mount">Mount All Remaining</button>
        `;
        document.getElementById('btn-jewel-stone-detail-return').addEventListener('click', () => {
          UI.closeModal('modal-jewel-stone-memo-detail');
          this.handleCloseMemo(memo.id, 'returned');
        });
        document.getElementById('btn-jewel-stone-detail-mount').addEventListener('click', () => {
          UI.closeModal('modal-jewel-stone-memo-detail');
          this.handleCloseMemo(memo.id, 'mounted');
        });
      } else {
        actionsEl.innerHTML = '';
      }
    }

    UI.openModal('modal-jewel-stone-memo-detail');
  },

  openMemoActionInputModal(memoId, itemIndex, actionType) {
    const memo = DBManager.getJewelStoneMemos().find(m => m.id === memoId);
    if (!memo) return;

    this.activeActionContext = { memoId, itemIndex, actionType };

    const titleEl = document.getElementById('jewel-stone-memo-action-title');
    const subtitleEl = document.getElementById('jewel-stone-memo-action-subtitle');
    const selectorGroup = document.getElementById('jewel-stone-memo-action-item-selector-group');
    const itemSelect = document.getElementById('jewel-stone-memo-action-item-select');
    const caratsInp = document.getElementById('jewel-stone-memo-action-carats');
    const piecesInp = document.getElementById('jewel-stone-memo-action-pieces');

    titleEl.textContent = actionType === 'mounted' ? 'Mark Stones as Mounted' : 'Return Stones to Stock';

    itemSelect.onchange = null;

    if (itemIndex !== null && itemIndex !== undefined) {
      selectorGroup.classList.add('hidden');
      const item = memo.items[itemIndex];
      subtitleEl.innerHTML = `<strong>Packet:</strong> ${item.stoneSnapshot.type} #${item.stoneSnapshot.color || 'N/A'}<br><strong>Grade:</strong> ${item.stoneSnapshot.lustreGrade || '—'}`;
      this.setupActionInputRanges(item);
    } else {
      selectorGroup.classList.remove('hidden');
      subtitleEl.innerHTML = `<strong>Memo:</strong> ${memo.memoNumber} | <strong>Manufacturer:</strong> ${memo.manufacturerName}`;

      itemSelect.innerHTML = '<option value="all">-- Entire Memo (All Remaining Items) --</option>';
      memo.items.forEach((item, idx) => {
        const remCts = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.mountedCarats || 0)).toFixed(3)));
        if (remCts > 0) {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `${item.stoneSnapshot.type} #${item.stoneSnapshot.color || 'N/A'} - (${remCts.toFixed(3)} cts left)`;
          itemSelect.appendChild(opt);
        }
      });

      const updateSelection = () => {
        const selectedVal = itemSelect.value;
        if (selectedVal === 'all') {
          const totalRemCarats = memo.items.reduce((sum, it) => sum + Math.max(0, Number((it.carats - (it.returnedCarats || 0) - (it.mountedCarats || 0)).toFixed(3))), 0);
          const totalRemPieces = memo.items.reduce((sum, it) => sum + Math.max(0, (it.pieces || 0) - (it.returnedPieces || 0) - (it.mountedPieces || 0)), 0);

          caratsInp.value = totalRemCarats.toFixed(3);
          caratsInp.max = totalRemCarats;
          caratsInp.disabled = true;
          piecesInp.value = totalRemPieces;
          piecesInp.max = totalRemPieces;
          piecesInp.disabled = true;
          document.getElementById('jewel-stone-memo-action-carats-max-label').textContent = `Total remaining: ${totalRemCarats.toFixed(3)} cts`;
          document.getElementById('jewel-stone-memo-action-pieces-max-label').textContent = `Total remaining: ${totalRemPieces} pcs`;
        } else {
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

    UI.openModal('modal-jewel-stone-memo-action-input');
  },

  setupActionInputRanges(item) {
    const caratsInp = document.getElementById('jewel-stone-memo-action-carats');
    const piecesInp = document.getElementById('jewel-stone-memo-action-pieces');
    const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.mountedCarats || 0)).toFixed(3)));
    const remPieces = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.mountedPieces || 0));

    caratsInp.value = remCarats;
    caratsInp.max = remCarats;
    document.getElementById('jewel-stone-memo-action-carats-max-label').textContent = `Max: ${remCarats.toFixed(3)} cts`;

    piecesInp.value = remPieces;
    piecesInp.max = remPieces;
    document.getElementById('jewel-stone-memo-action-pieces-max-label').textContent = `Max: ${remPieces} pcs`;
  },

  async handleSaveMemoAction() {
    if (!this.activeActionContext) return;
    const { memoId, itemIndex, actionType } = this.activeActionContext;

    const memo = DBManager.getJewelStoneMemos().find(m => m.id === memoId);
    if (!memo) return;

    const itemSelect = document.getElementById('jewel-stone-memo-action-item-select');
    const selectedVal = (itemIndex !== null && itemIndex !== undefined) ? String(itemIndex) : itemSelect.value;

    if (selectedVal === 'all') {
      UI.closeModal('modal-jewel-stone-memo-action-input');
      document.getElementById('jewel-stone-memo-action-carats').disabled = false;
      document.getElementById('jewel-stone-memo-action-pieces').disabled = false;
      this.handleCloseMemo(memoId, actionType);
      return;
    }

    const idx = parseInt(selectedVal, 10);
    const item = memo.items[idx];
    if (!item) return;

    const inputCarats = Number(document.getElementById('jewel-stone-memo-action-carats').value || 0);
    const inputPieces = Number(document.getElementById('jewel-stone-memo-action-pieces').value || 0);

    const remCarats = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.mountedCarats || 0)).toFixed(3)));
    const remPieces = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.mountedPieces || 0));

    if (inputCarats <= 0) { UI.showToast('Please enter valid carats.', true); return; }
    if (inputCarats > remCarats + 0.001) { UI.showToast(`Cannot exceed remaining carats (${remCarats.toFixed(3)} cts).`, true); return; }
    if (inputPieces > remPieces) { UI.showToast(`Cannot exceed remaining pieces (${remPieces} pcs).`, true); return; }

    document.getElementById('jewel-stone-memo-action-carats').disabled = false;
    document.getElementById('jewel-stone-memo-action-pieces').disabled = false;

    // Apply change
    if (actionType === 'returned') {
      item.returnedCarats = Number(((item.returnedCarats || 0) + inputCarats).toFixed(3));
      item.returnedPieces = (item.returnedPieces || 0) + inputPieces;
    } else {
      item.mountedCarats = Number(((item.mountedCarats || 0) + inputCarats).toFixed(3));
      item.mountedPieces = (item.mountedPieces || 0) + inputPieces;

      // Permanently deduct from loose stone stock
      const stone = DBManager.database.stones.find(st => st.id === item.stoneId);
      if (stone) {
        const curW = StoneController.getStoneWeight(stone);
        const newW = Math.max(0, Number((curW - inputCarats).toFixed(3)));

        if (stone.sizes && stone.sizes.length > 0 && curW > 0) {
          const ratio = newW / curW;
          stone.sizes.forEach(s => {
            s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
            if (s.pieces > 0 && item.pieces > 0) {
              const pRatio = Math.max(0, (StoneController.getStonePieces(stone) - inputPieces) / StoneController.getStonePieces(stone));
              s.pieces = Math.round(s.pieces * pRatio);
            }
          });
        }
        stone.weight = newW;
        stone.updatedAt = new Date().toISOString();
      }
    }

    const totalRemaining = memo.items.reduce((sum, it) => {
      const rem = it.carats - (it.returnedCarats || 0) - (it.mountedCarats || 0);
      return sum + Math.max(0, rem);
    }, 0);

    let isDeleted = false;
    if (totalRemaining <= 0.001) {
      const totalMounted = memo.items.reduce((sum, it) => sum + (it.mountedCarats || 0), 0);
      if (totalMounted <= 0.001) {
        DBManager.database.jewelStoneMemos = DBManager.database.jewelStoneMemos.filter(m => m.id !== memo.id);
        isDeleted = true;
      } else {
        memo.status = 'closed';
        memo.closedAt = new Date().toISOString();
      }
    }

    DBManager.addLog(
      actionType === 'mounted' ? 'DELETE' : 'EDIT',
      memo.id,
      `Jewel Stone Memo ${memo.memoNumber}`,
      `Processed partial ${actionType} on Jewel Stone Memo ${memo.memoNumber}: ${inputCarats.toFixed(3)} cts of ${item.stoneSnapshot.type} #${item.stoneSnapshot.color || 'N/A'}.`,
      []
    );

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-jewel-stone-memo-action-input');

      if (isDeleted) {
        UI.closeModal('modal-jewel-stone-memo-detail');
        UI.showToast(`Jewel Stone Memo ${memo.memoNumber} has been fully returned and deleted.`);
      } else {
        UI.showToast(`Processed partial ${actionType} — ${inputCarats.toFixed(3)} cts`);
      }

      App.refreshAllDisplays();

      if (!isDeleted && itemIndex !== null && itemIndex !== undefined) {
        this.openMemoDetail(memo.id);
      }
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  handleCloseMemo(memoId, action) {
    const memos = DBManager.getJewelStoneMemos();
    const memo = memos.find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const actionLabel = action === 'mounted'
      ? 'mark ALL remaining stones as Mounted — this permanently deducts them from stock'
      : 'mark ALL remaining stones as Returned — they will return to stock';

    UI.confirm(
      `Are you sure you want to ${actionLabel}?\n\nMemo: ${memo.memoNumber} | Manufacturer: ${memo.manufacturerName}`,
      async () => {
        memo.status = 'closed';
        memo.closedAt = new Date().toISOString();

        (memo.items || []).forEach(item => {
          const rem = Math.max(0, Number((item.carats - (item.returnedCarats || 0) - (item.mountedCarats || 0)).toFixed(3)));
          const remPcs = Math.max(0, (item.pieces || 0) - (item.returnedPieces || 0) - (item.mountedPieces || 0));
          if (rem <= 0) return;

          if (action === 'mounted') {
            item.mountedCarats = Number(((item.mountedCarats || 0) + rem).toFixed(3));
            item.mountedPieces = (item.mountedPieces || 0) + remPcs;

            const stone = DBManager.database.stones.find(st => st.id === item.stoneId);
            if (stone) {
              const curW = StoneController.getStoneWeight(stone);
              const newW = Math.max(0, Number((curW - rem).toFixed(3)));

              if (stone.sizes && stone.sizes.length > 0 && curW > 0) {
                const ratio = newW / curW;
                stone.sizes.forEach(s => {
                  s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
                  if (s.pieces > 0 && remPcs > 0) {
                    const pRatio = Math.max(0, (StoneController.getStonePieces(stone) - remPcs) / StoneController.getStonePieces(stone));
                    s.pieces = Math.round(s.pieces * pRatio);
                  }
                });
              }
              stone.weight = newW;
              stone.updatedAt = new Date().toISOString();
            }
          } else {
            item.returnedCarats = Number(((item.returnedCarats || 0) + rem).toFixed(3));
            item.returnedPieces = (item.returnedPieces || 0) + remPcs;
          }
        });

        const totalMounted = memo.items.reduce((sum, it) => sum + (it.mountedCarats || 0), 0);
        let isDeleted = false;

        if (totalMounted <= 0.001) {
          DBManager.database.jewelStoneMemos = DBManager.database.jewelStoneMemos.filter(m => m.id !== memo.id);
          isDeleted = true;
        } else {
          memo.status = 'closed';
        }

        DBManager.addLog(
          isDeleted || action === 'mounted' ? 'DELETE' : 'EDIT',
          memo.id,
          `Jewel Stone Memo ${memo.memoNumber}`,
          isDeleted
            ? `Jewel Stone Memo ${memo.memoNumber} fully returned & deleted.`
            : `Jewel Stone Memo ${memo.memoNumber} fully closed (marked ${action}).`,
          []
        );

        try {
          await DBManager.saveVault();
          if (isDeleted) {
            UI.closeModal('modal-jewel-stone-memo-detail');
            UI.showToast(`Jewel Stone Memo ${memo.memoNumber} fully returned and deleted.`);
          } else {
            UI.showToast(`Jewel Stone Memo ${memo.memoNumber} closed successfully.`);
          }
          App.refreshAllDisplays();
        } catch (err) {
          UI.showToast(err.message, true);
        }
      }
    );
  }
};

window.JewelStoneMemoController = JewelStoneMemoController;
