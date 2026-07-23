/**
 * SalesController — Emerald Suite Sales Data Page
 * Renders a sales history table from closed emerald memos that had sold carats.
 * Covers both complete-sale and partial-sale outcomes.
 */

const SalesController = {

  init() {
    const searchInp = document.getElementById('sales-search-input');
    if (searchInp) searchInp.addEventListener('input', UI.debounce(() => this.renderSalesList(), 200));

    const dateFrom = document.getElementById('sales-filter-date-from');
    if (dateFrom) dateFrom.addEventListener('change', () => this.renderSalesList());

    const dateTo = document.getElementById('sales-filter-date-to');
    if (dateTo) dateTo.addEventListener('change', () => this.renderSalesList());

    const clearBtn = document.getElementById('sales-filter-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearFilters());
  },

  clearFilters() {
    const s = document.getElementById('sales-search-input');
    if (s) s.value = '';
    const df = document.getElementById('sales-filter-date-from');
    if (df) df.value = '';
    const dt = document.getElementById('sales-filter-date-to');
    if (dt) dt.value = '';
    this.renderSalesList();
  },

  getSaleRecords() {
    const memos = DBManager.getMemos();
    const records = [];

    memos.forEach(memo => {
      const totalSoldCts = (memo.items || []).reduce((s, it) => s + (it.soldCarats || 0), 0);
      if (totalSoldCts <= 0.001) return;

      const totalSoldPcs = (memo.items || []).reduce((s, it) => s + (it.soldPieces || 0), 0);
      const totalRetCts  = (memo.items || []).reduce((s, it) => s + (it.returnedCarats || 0), 0);

      records.push({
        memoId:      memo.id,
        memoNumber:  memo.memoNumber,
        brokerName:  memo.brokerName,
        clientName:  memo.clientName || null,
        issueDate:   memo.date,
        closedAt:    memo.closedAt || memo.createdAt,
        outcomeType: memo.outcomeType || (memo.status === 'sold' ? 'complete-sale' : 'partial-sale'),
        status:      memo.status,
        soldCts:     Number(totalSoldCts.toFixed(3)),
        soldPcs:     totalSoldPcs,
        returnedCts: Number(totalRetCts.toFixed(3)),
        saleRate:    memo.saleRate || null,
        saleValue:   memo.saleRate ? Number((memo.saleRate * totalSoldCts).toFixed(0)) : null,
        saleDate:    memo.saleDate || null,
        notes:       memo.outcomeNotes || memo.notes || '',
        itemCount:   (memo.items || []).length,
        items:       memo.items || []
      });
    });

    records.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    return records;
  },

  renderSalesList() {
    const records = this.getSaleRecords();

    const totalSoldCts = records.reduce((s, r) => s + r.soldCts, 0);
    const totalValue   = records.filter(r => r.saleValue).reduce((s, r) => s + r.saleValue, 0);

    const elCts   = document.getElementById('sales-metric-total-sold');
    const elTxns  = document.getElementById('sales-metric-total-txns');
    const elValue = document.getElementById('sales-metric-total-value');
    if (elCts)   elCts.textContent   = totalSoldCts.toFixed(2) + ' cts';
    if (elTxns)  elTxns.textContent  = records.length;
    if (elValue) elValue.textContent = totalValue > 0 ? '\u20b9' + totalValue.toLocaleString('en-IN') : '\u2014';

    const query    = (document.getElementById('sales-search-input')?.value || '').toLowerCase().trim();
    const dateFrom = document.getElementById('sales-filter-date-from')?.value || '';
    const dateTo   = document.getElementById('sales-filter-date-to')?.value || '';

    const filtered = records.filter(r => {
      if (query) {
        const match =
          (r.memoNumber || '').toLowerCase().includes(query) ||
          (r.brokerName || '').toLowerCase().includes(query) ||
          (r.clientName || '').toLowerCase().includes(query);
        if (!match) return false;
      }
      const closeDate = r.closedAt ? r.closedAt.split('T')[0] : '';
      if (dateFrom && closeDate < dateFrom) return false;
      if (dateTo   && closeDate > dateTo)   return false;
      return true;
    });

    const tbody   = document.getElementById('sales-list-tbody');
    const emptyEl = document.getElementById('sales-empty-state');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      tbody.closest('table').classList.add('hidden');
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    tbody.closest('table').classList.remove('hidden');

    const outcomeStyle = {
      'complete-sale': { bg: 'rgba(48,209,88,0.12)', color: '#30D158', label: 'Complete Sale' },
      'partial-sale':  { bg: 'rgba(212,175,55,0.12)', color: 'var(--text-gold-dark)', label: 'Partial Sale' }
    };

    filtered.forEach(r => {
      const issueFmt = new Date(r.issueDate + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      const closeFmt = r.closedAt
        ? new Date(r.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '\u2014';

      const st = outcomeStyle[r.outcomeType] || outcomeStyle['complete-sale'];

      const valueStr = r.saleValue
        ? '\u20b9' + r.saleValue.toLocaleString('en-IN') + (r.saleRate ? '<br><span style="font-size:10px;color:var(--text-muted);">\u0040 \u20b9' + r.saleRate.toLocaleString('en-IN') + '/ct</span>' : '')
        : '\u2014';

      const pudiaList = r.items
        .filter(it => (it.soldCarats || 0) > 0)
        .map(it => '#' + ((it.emeraldSnapshot || {}).color || 'N/A') + ' (' + (it.soldCarats || 0).toFixed(2) + ' cts)')
        .join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="font-weight:700;font-family:var(--font-serif);">' + UI.escapeHtml(r.memoNumber) + '</td>' +
        '<td><div style="font-size:12px;">' + issueFmt + '</div><div style="font-size:10px;color:var(--text-muted);">Closed: ' + closeFmt + '</div></td>' +
        '<td><div style="font-weight:600;">' + UI.escapeHtml(r.brokerName) + '</div>' +
          (r.clientName ? '<div style="font-size:11px;color:var(--text-muted);">Client: ' + UI.escapeHtml(r.clientName) + '</div>' : '') +
        '</td>' +
        '<td style="text-align:right;">' +
          '<div style="font-weight:700;font-size:14px;color:#30D158;">' + r.soldCts.toFixed(2) + ' cts</div>' +
          '<div style="font-size:10px;color:var(--text-muted);">' + r.soldPcs + ' pcs</div>' +
          (r.returnedCts > 0 ? '<div style="font-size:10px;color:var(--text-muted);">\u21a9 ' + r.returnedCts.toFixed(2) + ' returned</div>' : '') +
        '</td>' +
        '<td style="text-align:right;">' + valueStr + '</td>' +
        '<td><span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span></td>' +
        '<td style="font-size:11px;color:var(--text-muted);max-width:160px;">' +
          '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + UI.escapeHtml(pudiaList) + '">' + UI.escapeHtml(pudiaList) + '</div>' +
          (r.notes ? '<div style="margin-top:3px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + UI.escapeHtml(r.notes) + '">&ldquo;' + UI.escapeHtml(r.notes) + '&rdquo;</div>' : '') +
        '</td>' +
        '<td>' +
          '<button type="button" class="btn btn-secondary btn-small btn-reverse-sale" style="font-size:11px;white-space:nowrap;color:var(--text-gold-dark);border-color:rgba(212,175,55,0.4);">Reverse Sale</button>' +
        '</td>';

      const revBtn = tr.querySelector('.btn-reverse-sale');
      if (revBtn) {
        revBtn.addEventListener('click', () => {
          if (window.MemoController) {
            MemoController.reverseSale(r.memoId);
          }
        });
      }

      tbody.appendChild(tr);
    });
  }
};

window.SalesController = SalesController;
