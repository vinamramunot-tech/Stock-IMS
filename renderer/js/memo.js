/**
 * Memo Controller Module
 * Manages emerald memo issuance to brokers: create, view, return, and sell memos.
 * Tracks "in company" vs "on memo" carats for each Pudia without modifying stock records
 * until a memo is explicitly marked as Sold.
 */

const MemoController = {

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
            total += Number(item.carats || 0);
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
        map[item.emeraldId] += Number(item.carats || 0);
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
    this.populateBrokerDatalist();
    this.renderEmeraldPickerRows();
    this.updateMemoTotals();
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

  /**
   * Build the emerald picker table inside the create-memo modal.
   * Each row = one Pudia, with an input for carats to issue.
   */
  renderEmeraldPickerRows() {
    const tbody = document.getElementById('memo-picker-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const emeralds = DBManager.getEmeralds();
    if (emeralds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No emerald stock in the vault.</td></tr>';
      return;
    }

    const memoCaratsMap = this.buildMemoCaratsMap();

    // Sort: group → grade → pudia number
    const sorted = [...emeralds].sort((a, b) => {
      const gDiff = (a.group || '').localeCompare(b.group || '');
      if (gDiff !== 0) return gDiff;
      const lDiff = (a.lustreGrade || '').localeCompare(b.lustreGrade || '');
      if (lDiff !== 0) return lDiff;
      return Number(a.color || 0) - Number(b.color || 0);
    });

    sorted.forEach(e => {
      const totalCts = EmeraldController.getEmeraldWeight(e);
      const memoCts  = Number((memoCaratsMap[e.id] || 0).toFixed(3));
      const availCts = Math.max(0, Number((totalCts - memoCts).toFixed(3)));

      const tr = document.createElement('tr');
      tr.dataset.emeraldId = e.id;
      tr.innerHTML = `
        <td style="font-weight:600;">${UI.escapeHtml(e.group || '—')}</td>
        <td style="text-align:center;font-weight:700;color:var(--text-gold-dark);">#${e.color || 'N/A'}</td>
        <td>${UI.escapeHtml(e.lustreGrade || '—')}</td>
        <td style="text-align:right;">
          <span style="font-weight:600;color:var(--text-main);">${availCts.toFixed(2)}</span>
          ${memoCts > 0 ? `<br><span style="font-size:10px;color:var(--text-muted);">${memoCts.toFixed(2)} on memo</span>` : ''}
        </td>
        <td style="text-align:center;">
          <input type="number"
            class="memo-carat-input"
            data-emerald-id="${e.id}"
            data-max="${availCts}"
            min="0" step="0.01" max="${availCts}"
            placeholder="0.00"
            ${availCts <= 0 ? 'disabled' : ''}
            style="width:80px;padding:4px 8px;font-size:13px;text-align:right;border:1px solid var(--border-light);border-radius:3px;background:var(--bg-base);color:var(--text-main);">
        </td>
        <td style="text-align:center;">
          <input type="number"
            class="memo-pieces-input"
            data-emerald-id="${e.id}"
            min="0" step="1"
            placeholder="0"
            ${availCts <= 0 ? 'disabled' : ''}
            style="width:60px;padding:4px 8px;font-size:13px;text-align:right;border:1px solid var(--border-light);border-radius:3px;background:var(--bg-base);color:var(--text-main);">
        </td>
      `;

      tr.querySelector('.memo-carat-input').addEventListener('input', () => this.updateMemoTotals());
      tbody.appendChild(tr);
    });
  },

  updateMemoTotals() {
    let totalCts = 0;
    let itemCount = 0;
    document.querySelectorAll('.memo-carat-input').forEach(inp => {
      const val = Number(inp.value || 0);
      if (val > 0) {
        totalCts += val;
        itemCount++;
      }
    });
    const totalEl = document.getElementById('memo-total-carats');
    const countEl = document.getElementById('memo-item-count');
    if (totalEl) totalEl.textContent = totalCts.toFixed(2);
    if (countEl) countEl.textContent = itemCount;
  },

  async handleSaveMemo() {
    const brokerName = (document.getElementById('memo-broker-name').value || '').trim();
    const date       = document.getElementById('memo-date').value;
    const notes      = (document.getElementById('memo-notes').value || '').trim();

    if (!brokerName) { UI.showToast('Please enter a broker name.', true); return; }
    if (!date)       { UI.showToast('Please select a memo date.', true); return; }

    // Collect selected emerald rows
    const items  = [];
    let hasError = false;

    document.querySelectorAll('.memo-carat-input').forEach(inp => {
      const carats     = Number(inp.value || 0);
      if (carats <= 0) return;                              // skip empty rows

      const emeraldId  = inp.getAttribute('data-emerald-id');
      const maxCts     = Number(inp.getAttribute('data-max'));

      if (carats > maxCts + 0.001) {                       // small float tolerance
        UI.showToast(`Cannot issue more carats than available for a Pudia.`, true);
        hasError = true;
        return;
      }

      const piecesInp  = inp.closest('tr').querySelector('.memo-pieces-input');
      const pieces     = Number(piecesInp ? piecesInp.value || 0 : 0);
      const emerald    = DBManager.getEmeralds().find(e => e.id === emeraldId);
      if (!emerald) return;

      items.push({
        emeraldId,
        emeraldSnapshot: {
          group: emerald.group || '',
          lustreGrade: emerald.lustreGrade || '',
          color: emerald.color || '',
          shape: emerald.shape || ''
        },
        carats: Number(carats.toFixed(3)),
        pieces
      });
    });

    if (hasError) return;
    if (items.length === 0) {
      UI.showToast('Please enter carats for at least one Pudia.', true);
      return;
    }

    const totalCarats = Number(items.reduce((s, i) => s + i.carats, 0).toFixed(3));
    const memoNumber  = this.getNextMemoNumber();

    const memo = {
      id: 'memo_' + Date.now(),
      memoNumber,
      brokerName,
      date,
      status: 'open',          // "open" | "returned" | "sold"
      createdAt: new Date().toISOString(),
      closedAt: null,
      notes,
      items,
      totalCarats
    };

    if (!DBManager.database.memos) DBManager.database.memos = [];
    DBManager.database.memos.push(memo);

    DBManager.addLog(
      'ADD', memo.id, `Memo ${memoNumber}`,
      `Issued memo ${memoNumber} to ${brokerName}: ${totalCarats.toFixed(2)} cts (${items.length} Pudia${items.length !== 1 ? 's' : ''})`,
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
      sold:     { bg: 'rgba(212,175,55,0.15)',  color: 'var(--text-gold-dark)' }
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
      if (retBtn)  retBtn.addEventListener('click',  () => this.handleCloseMemo(memo.id, 'returned'));
      if (sellBtn) sellBtn.addEventListener('click',  () => this.handleCloseMemo(memo.id, 'sold'));

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
    (memo.items || []).forEach(item => {
      const snap = item.emeraldSnapshot || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${UI.escapeHtml(snap.group || '—')}</td>
        <td style="text-align:center;font-weight:700;color:var(--text-gold-dark);">#${snap.color || 'N/A'}</td>
        <td>${UI.escapeHtml(snap.lustreGrade || '—')}</td>
        <td style="text-align:right;font-weight:700;">${Number(item.carats || 0).toFixed(2)} cts</td>
        <td style="text-align:right;">${item.pieces || '—'}</td>
      `;
      tbody.appendChild(tr);
    });

    // Action buttons
    const actionsEl = document.getElementById('memo-detail-actions');
    if (actionsEl) {
      if (memo.status === 'open') {
        actionsEl.innerHTML = `
          <button type="button" class="btn btn-secondary" id="btn-detail-return">Mark as Returned</button>
          <button type="button" class="btn btn-primary" id="btn-detail-sell">Mark as Sold</button>
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

  // ── Close Memo (Return / Sell) ────────────────────────────────────────────────

  handleCloseMemo(memoId, action) {
    const memos = DBManager.getMemos();
    const memo  = memos.find(m => m.id === memoId);
    if (!memo || memo.status !== 'open') return;

    const actionLabel = action === 'sold'
      ? 'mark as Sold — this will permanently deduct the issued carats from stock'
      : 'mark as Returned — the goods come back into company stock';

    UI.confirm(
      `Are you sure you want to ${actionLabel}?\n\nMemo: ${memo.memoNumber} | Broker: ${memo.brokerName} | ${memo.totalCarats.toFixed(2)} cts`,
      async () => {
        memo.status   = action;
        memo.closedAt = new Date().toISOString();

        if (action === 'sold') {
          // Permanently deduct issued carats from each affected Pudia
          (memo.items || []).forEach(item => {
            const emerald = DBManager.database.emeralds.find(e => e.id === item.emeraldId);
            if (!emerald) return;

            const currentWeight = EmeraldController.getEmeraldWeight(emerald);
            const deduct        = Number(item.carats || 0);
            const newWeight     = Math.max(0, Number((currentWeight - deduct).toFixed(3)));

            if (emerald.sizes && emerald.sizes.length > 0 && currentWeight > 0) {
              // Proportionally reduce each size row weight
              const ratio = newWeight / currentWeight;
              emerald.sizes.forEach(s => {
                s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
              });
            }
            emerald.weight     = newWeight;
            emerald.updatedAt  = new Date().toISOString();
          });
        }

        DBManager.addLog(
          action === 'sold' ? 'DELETE' : 'EDIT',
          memo.id,
          `Memo ${memo.memoNumber}`,
          `Memo ${memo.memoNumber} (${memo.brokerName}) marked as ${action}. ${memo.totalCarats.toFixed(2)} cts.`,
          []
        );

        try {
          await DBManager.saveVault();
          UI.showToast(`Memo ${memo.memoNumber} marked as ${action}.`);
          App.refreshAllDisplays();
        } catch (err) {
          UI.showToast(err.message, true);
        }
      }
    );
  }
};

window.MemoController = MemoController;
