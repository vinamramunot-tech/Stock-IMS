/**
 * Emerald Controller Module
 * Manages emerald catalog rendering, filtering, sorting, and form interactions.
 * Supports dynamic size breakdown rows (Shape + MM + Pcs + cts) per Pudia.
 */

const EmeraldController = {
  activeEmeraldState: null,

  init() {
    // Event listeners for filters and search
    const searchInput = document.getElementById('emerald-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderEmeraldGrid());
    }
    const filterShape = document.getElementById('emerald-filter-shape');
    if (filterShape) {
      filterShape.addEventListener('change', () => this.renderEmeraldGrid());
    }
    const filterGroup = document.getElementById('emerald-filter-group');
    if (filterGroup) {
      filterGroup.addEventListener('change', () => this.renderEmeraldGrid());
    }
    const filterLustre = document.getElementById('emerald-filter-lustre');
    if (filterLustre) {
      filterLustre.addEventListener('change', () => this.renderEmeraldGrid());
    }
    const filterOrigin = document.getElementById('emerald-filter-origin');
    if (filterOrigin) {
      filterOrigin.addEventListener('change', () => this.renderEmeraldGrid());
    }
    const sortItems = document.getElementById('emerald-sort-items');
    if (sortItems) {
      sortItems.addEventListener('change', () => this.renderEmeraldGrid());
    }

    // Modal triggers
    const btnNavAddEmerald = document.getElementById('btn-nav-add-emerald');
    if (btnNavAddEmerald) {
      btnNavAddEmerald.addEventListener('click', () => this.openAddModal());
    }
    const btnEmptyAddEmerald = document.getElementById('btn-empty-add-emerald');
    if (btnEmptyAddEmerald) {
      btnEmptyAddEmerald.addEventListener('click', () => this.openAddModal());
    }

    const btnSaveEmerald = document.getElementById('btn-save-emerald');
    if (btnSaveEmerald) {
      btnSaveEmerald.addEventListener('click', () => this.handleSaveEmerald());
    }

    // Close buttons inside emerald modal
    const closeTriggers = document.querySelectorAll('.modal-close-trigger-emerald');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-emerald-item');
      });
    });

    // Add Size Row button
    const btnAddSize = document.getElementById('btn-add-emerald-size');
    if (btnAddSize) {
      btnAddSize.addEventListener('click', () => this.createSizeRow());
    }
  },

  openAddModal() {
    this.resetForm();
    document.getElementById('emerald-modal-title').textContent = "Add New Emerald Stock";
    UI.openModal('modal-emerald-item');
  },

  resetForm() {
    this.activeEmeraldState = null;
    document.getElementById('emerald-form').reset();
    document.getElementById('emerald-item-id').value = '';
    
    // Clear all checked origins & price
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]');
    checkBoxes.forEach(cb => cb.checked = false);
    document.getElementById('emerald-price').value = '';

    // Clear size breakdown rows
    const sizesContainer = document.getElementById('emerald-sizes-container');
    if (sizesContainer) {
      sizesContainer.innerHTML = '';
    }
    this.updateSizeTotals();

    this.populateGroupAutocomplete();
  },

  /**
   * Create a dynamic size row (Shape + MM + Pcs + cts + remove button)
   */
  createSizeRow(data = { shape: '', mm: '', pieces: '', weight: '' }) {
    const container = document.getElementById('emerald-sizes-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'emerald-size-row';

    const safeShape = UI.escapeHtml(data.shape || '');
    const safeMM = UI.escapeHtml(data.mm || '');
    const safePieces = data.pieces || '';
    const safeWeight = data.weight || '';

    row.innerHTML = `
      <input type="text" class="size-shape" list="emerald-shapes-list" placeholder="e.g. Oval" value="${safeShape}">
      <input type="text" class="size-mm" placeholder="e.g. 7x5" value="${safeMM}">
      <input type="number" class="size-pieces" min="0" step="1" placeholder="0" value="${safePieces}">
      <input type="number" class="size-weight" min="0" step="0.01" placeholder="0.00" value="${safeWeight}">
      <button type="button" class="btn-remove-size" title="Remove this size row">&times;</button>
    `;

    // Wire up recalculation on input changes
    const piecesInput = row.querySelector('.size-pieces');
    const weightInput = row.querySelector('.size-weight');
    piecesInput.addEventListener('input', () => this.updateSizeTotals());
    weightInput.addEventListener('input', () => this.updateSizeTotals());

    // Wire up remove
    row.querySelector('.btn-remove-size').addEventListener('click', () => {
      row.remove();
      this.updateSizeTotals();
    });

    container.appendChild(row);
    this.updateSizeTotals();
  },

  /**
   * Recalculate and display total Pcs and total cts from all size rows
   */
  updateSizeTotals() {
    const rows = document.querySelectorAll('.emerald-size-row');
    let totalPcs = 0;
    let totalCts = 0;

    rows.forEach(row => {
      totalPcs += Number(row.querySelector('.size-pieces').value || 0);
      totalCts += Number(row.querySelector('.size-weight').value || 0);
    });

    const pcsEl = document.getElementById('emerald-total-pcs');
    const ctsEl = document.getElementById('emerald-total-cts');
    if (pcsEl) pcsEl.textContent = totalPcs;
    if (ctsEl) ctsEl.textContent = totalCts.toFixed(2);
  },

  /**
   * Gather all size rows into an array of objects
   */
  gatherSizes() {
    const rows = document.querySelectorAll('.emerald-size-row');
    const sizes = [];
    rows.forEach(row => {
      const shape = row.querySelector('.size-shape').value.trim();
      const mm = row.querySelector('.size-mm').value.trim();
      const pieces = Number(row.querySelector('.size-pieces').value || 0);
      const weight = Number(row.querySelector('.size-weight').value || 0);
      if (shape || mm || pieces > 0 || weight > 0) {
        sizes.push({ shape, mm, pieces, weight });
      }
    });
    return sizes;
  },

  /**
   * Get total weight from all size rows
   */
  getTotalWeight() {
    const rows = document.querySelectorAll('.emerald-size-row');
    let total = 0;
    rows.forEach(row => {
      total += Number(row.querySelector('.size-weight').value || 0);
    });
    return Number(total.toFixed(3));
  },

  /**
   * Get all unique shapes from size rows (for backward compat display)
   */
  getShapesFromSizes(sizes) {
    const shapes = new Set();
    (sizes || []).forEach(s => {
      if (s.shape && s.shape.trim()) {
        shapes.add(s.shape.trim());
      }
    });
    return Array.from(shapes);
  },

  loadItemIntoForm(emerald) {
    this.resetForm();
    this.activeEmeraldState = JSON.parse(JSON.stringify(emerald));

    document.getElementById('emerald-item-id').value = emerald.id || '';
    document.getElementById('emerald-lustre').value = emerald.lustreGrade || '';
    document.getElementById('emerald-color').value = emerald.color || '';
    document.getElementById('emerald-pair').value = emerald.pair || 'No';
    document.getElementById('emerald-group').value = emerald.group || '';
    document.getElementById('emerald-price').value = emerald.pricePerCarat || '';

    // Load size breakdown rows
    if (emerald.sizes && emerald.sizes.length > 0) {
      emerald.sizes.forEach(s => this.createSizeRow(s));
    } else {
      // Backward compatibility: old emeralds with single shape + weight
      this.createSizeRow({
        shape: emerald.shape || '',
        mm: '',
        pieces: '',
        weight: emerald.weight || emerald.size || ''
      });
    }

    // Check origins
    const origins = emerald.origins || [];
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]');
    checkBoxes.forEach(cb => {
      if (origins.includes(cb.value)) {
        cb.checked = true;
      }
    });

    document.getElementById('emerald-modal-title').textContent = "Edit Emerald Stock";
  },

  populateGroupAutocomplete() {
    const list = document.getElementById('emerald-groups-list');
    if (!list) return;

    const emeralds = DBManager.getEmeralds();
    const groups = new Set();
    emeralds.forEach(e => {
      if (e.group && e.group.trim()) {
        groups.add(e.group.trim());
      }
    });

    list.innerHTML = '';
    groups.forEach(g => {
      const option = document.createElement('option');
      option.value = g;
      list.appendChild(option);
    });
  },

  populateGroupFilterOptions() {
    const filterSelect = document.getElementById('emerald-filter-group');
    if (!filterSelect) return;

    const currentSelected = filterSelect.value;
    const allEmeralds = DBManager.getEmeralds();
    const uniqueGroups = new Set();

    allEmeralds.forEach(e => {
      if (e.group && e.group.trim()) {
        uniqueGroups.add(e.group.trim());
      }
    });

    const sortedGroups = Array.from(uniqueGroups).sort();

    let optionsHtml = `<option value="">All Groups</option>`;
    sortedGroups.forEach(g => {
      optionsHtml += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    const currentOptionsString = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOptionsString = ["", ...sortedGroups].join(',');

    if (currentOptionsString !== newOptionsString) {
      filterSelect.innerHTML = optionsHtml;
      if (uniqueGroups.has(currentSelected)) {
        filterSelect.value = currentSelected;
      } else {
        filterSelect.value = "";
      }
    }
  },

  /**
   * Helper: get all shapes from an emerald (handles both old and new format)
   */
  getEmeraldShapes(e) {
    if (e.sizes && e.sizes.length > 0) {
      return this.getShapesFromSizes(e.sizes);
    }
    return e.shape ? [e.shape] : [];
  },

  /**
   * Helper: get total weight from an emerald (handles both old and new format)
   */
  getEmeraldWeight(e) {
    if (e.sizes && e.sizes.length > 0) {
      return e.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0);
    }
    return Number(e.weight || e.size || 0);
  },

  /**
   * Helper: get total pieces from an emerald
   */
  getEmeraldPieces(e) {
    if (e.sizes && e.sizes.length > 0) {
      return e.sizes.reduce((sum, s) => sum + Number(s.pieces || 0), 0);
    }
    return 0;
  },

  renderEmeraldGrid() {
    const gridContainer = document.getElementById('emerald-catalog-grid');
    const emptyState = document.getElementById('emerald-empty-state');
    if (!gridContainer || !emptyState) return;

    const query = document.getElementById('emerald-search-input').value.toLowerCase().trim();
    
    // Dynamically populate group filter options
    this.populateGroupFilterOptions();
    
    const filterGroup = document.getElementById('emerald-filter-group').value;
    const filterShape = document.getElementById('emerald-filter-shape').value;
    const filterLustre = document.getElementById('emerald-filter-lustre').value;
    const filterOrigin = document.getElementById('emerald-filter-origin').value;
    const sortVal = document.getElementById('emerald-sort-items').value;

    const allEmeralds = DBManager.getEmeralds();

    // Clear grid
    gridContainer.innerHTML = '';

    // Filter
    let filtered = allEmeralds.filter(e => {
      const shapes = this.getEmeraldShapes(e);
      const shapesStr = shapes.join(' ').toLowerCase();
      const sizesStr = (e.sizes || []).map(s => `${s.shape} ${s.mm}`).join(' ').toLowerCase();

      const matchesSearch = !query || 
        shapesStr.includes(query) ||
        sizesStr.includes(query) ||
        (e.lustreGrade || '').toLowerCase().includes(query) ||
        (e.group || '').toLowerCase().includes(query) ||
        this.getEmeraldWeight(e).toString().includes(query) ||
        (e.pricePerCarat || '').toString().includes(query) ||
        (e.origins || []).some(o => o.toLowerCase().includes(query));

      const matchesGroup = !filterGroup || e.group === filterGroup;
      const matchesShape = !filterShape || shapes.includes(filterShape);
      const matchesLustre = !filterLustre || e.lustreGrade === filterLustre;
      const matchesOrigin = !filterOrigin || (e.origins || []).includes(filterOrigin);

      return matchesSearch && matchesGroup && matchesShape && matchesLustre && matchesOrigin;
    });

    // Sort
    if (sortVal === 'newest') {
      filtered.sort((a, b) => Number(b.id.split('_')[1] || 0) - Number(a.id.split('_')[1] || 0));
    } else if (sortVal === 'weight-high' || sortVal === 'size-high') {
      filtered.sort((a, b) => this.getEmeraldWeight(b) - this.getEmeraldWeight(a));
    } else if (sortVal === 'weight-low' || sortVal === 'size-low') {
      filtered.sort((a, b) => this.getEmeraldWeight(a) - this.getEmeraldWeight(b));
    } else if (sortVal === 'price-high') {
      filtered.sort((a, b) => Number(b.pricePerCarat || 0) - Number(a.pricePerCarat || 0));
    } else if (sortVal === 'price-low') {
      filtered.sort((a, b) => Number(a.pricePerCarat || 0) - Number(b.pricePerCarat || 0));
    } else if (sortVal === 'color-high') {
      filtered.sort((a, b) => Number(b.color || 0) - Number(a.color || 0));
    } else if (sortVal === 'color-low') {
      filtered.sort((a, b) => Number(a.color || 0) - Number(b.color || 0));
    }

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gridContainer.classList.remove('hidden');

    filtered.forEach(e => {
      const card = document.createElement('div');
      card.className = 'product-card';

      const originsStr = (e.origins || []).join(', ');
      const totalWeight = this.getEmeraldWeight(e);
      const totalPieces = this.getEmeraldPieces(e);
      const shapes = this.getEmeraldShapes(e);
      const shapesDisplay = shapes.length > 0 ? shapes.join(', ') : 'Unknown Shape';

      // Build sizes breakdown HTML for the card
      let sizesHtml = '';
      if (e.sizes && e.sizes.length > 0) {
        sizesHtml = '<div class="specs-line" style="margin-top:4px;">';
        sizesHtml += '<table style="width:100%; font-size:12px; border-collapse:collapse; margin-top:4px;">';
        sizesHtml += '<tr style="color:var(--text-muted); font-size:10px; text-transform:uppercase; letter-spacing:0.05em;"><td>Shape</td><td>MM</td><td style="text-align:right;">Pcs</td><td style="text-align:right;">cts</td></tr>';
        e.sizes.forEach(s => {
          sizesHtml += `<tr><td>${UI.escapeHtml(s.shape || '')}</td><td>${UI.escapeHtml(s.mm || '')}</td><td style="text-align:right;">${s.pieces || 0}</td><td style="text-align:right;">${Number(s.weight || 0).toFixed(2)}</td></tr>`;
        });
        sizesHtml += `<tr style="font-weight:700; border-top:1px solid var(--border-light);"><td colspan="2" style="text-align:right;">Total</td><td style="text-align:right;">${totalPieces}</td><td style="text-align:right;">${totalWeight.toFixed(2)}</td></tr>`;
        sizesHtml += '</table></div>';
      }

      // Calculate dollar prices
      const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
      const pricePerCaratInr = e.pricePerCarat || 0;
      const totalValueInr = totalWeight * pricePerCaratInr;
      const pricePerCaratUsd = usdRate > 0 ? pricePerCaratInr / usdRate : 0;
      const totalValueUsd = usdRate > 0 ? totalValueInr / usdRate : 0;

      const dollarPriceHtml = usdRate > 0 ? `
              <div class="price-lbl" style="margin-top: 8px;">PRICE PER CARAT (USD)</div>
              <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 6px;">$${pricePerCaratUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div class="price-lbl">TOTAL VALUE (USD)</div>
              <div class="price-val" style="color: var(--success-green);">$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      ` : '';

      card.innerHTML = `
        <div class="product-img-box">
          <svg viewBox="0 0 24 24" width="60" height="60" class="product-fallback-svg" style="color: #000000;">
            <path fill="currentColor" d="M16 2H8L2 8l10 14 10-14-6-6zM12 4.12L15.38 8H8.62L12 4.12z" />
          </svg>
          <div class="product-cat-badge">Emerald</div>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <div class="product-sku">${e.group ? 'Group: ' + UI.escapeHtml(e.group) : 'No Group'}</div>
            <h3 class="product-title">${UI.escapeHtml(shapesDisplay)}</h3>
          </div>
          
          <div class="product-specs">
            ${sizesHtml || `<div class="specs-line"><strong>Weight:</strong> ${totalWeight} carats</div>`}
            <div class="specs-line"><strong>Lustre:</strong> ${UI.escapeHtml(e.lustreGrade || 'N/A')}</div>
            <div class="specs-line"><strong>Pudia Number:</strong> ${e.color || 'N/A'}</div>
            <div class="specs-line"><strong>Pair:</strong> ${e.pair || 'No'}</div>
            <div class="specs-line" style="margin-bottom:0;"><strong>Origin:</strong> ${originsStr || 'None'}</div>
          </div>
          
          <div class="product-price-row" style="border-top: 1px dashed var(--border-light); padding-top: 12px; margin-top: 10px;">
            <div>
              <div class="price-lbl">PRICE PER CARAT</div>
              <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 6px;">₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div class="price-lbl">TOTAL VALUE</div>
              <div class="price-val">₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              ${dollarPriceHtml}
            </div>
            <div class="product-actions" style="margin-top: 12px;">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit</button>
              <button type="button" class="btn btn-danger btn-small btn-delete" title="Delete emerald">Delete</button>
            </div>
          </div>
        </div>
      `;

      // Events
      card.querySelector('.btn-edit').addEventListener('click', () => {
        this.loadItemIntoForm(e);
        UI.openModal('modal-emerald-item');
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        this.handleDeleteEmerald(e);
      });

      gridContainer.appendChild(card);
    });
  },

  async handleSaveEmerald() {
    const lustreGrade = document.getElementById('emerald-lustre').value.trim();
    const color = Number(document.getElementById('emerald-color').value || 0);
    const pricePerCarat = Number(document.getElementById('emerald-price').value || 0);
    const pair = document.getElementById('emerald-pair').value;
    const group = document.getElementById('emerald-group').value.trim();
    
    // Gather sizes
    const sizes = this.gatherSizes();
    const totalWeight = sizes.reduce((sum, s) => sum + s.weight, 0);

    // Gather checked origins
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]:checked');
    const origins = Array.from(checkBoxes).map(cb => cb.value);

    // Validation
    if (sizes.length === 0) {
      UI.showToast("Please add at least one size row with Shape, MM, Pcs, and Weight.", true);
      return;
    }

    const hasInvalidRow = sizes.some(s => !s.shape || !s.mm || s.pieces <= 0 || s.weight <= 0);
    if (hasInvalidRow) {
      UI.showToast("Each size row must have a Shape, MM, Pcs (>0), and Weight (>0).", true);
      return;
    }

    if (!lustreGrade || isNaN(color) || pricePerCarat < 0 || origins.length === 0) {
      UI.showToast("Please fill all required fields and select at least one Origin.", true);
      return;
    }

    const id = document.getElementById('emerald-item-id').value || 'emerald_' + Date.now();
    const isEdit = !!document.getElementById('emerald-item-id').value;

    // Derive shapes list from sizes for backward-compat searches
    const shapes = this.getShapesFromSizes(sizes);

    const savedEmerald = {
      id,
      sizes,
      weight: Number(totalWeight.toFixed(3)),
      shape: shapes.join(', '),  // backward compat: store joined shapes string
      lustreGrade,
      color,
      pricePerCarat,
      pair,
      group,
      origins,
      createdAt: isEdit ? this.activeEmeraldState.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (isEdit) {
        // Deep Diff
        const changes = Logs.diffItem(this.activeEmeraldState, savedEmerald);
        const summary = Logs.buildSummary(changes, `Updated Emerald: ${shapes.join(', ')} (${savedEmerald.weight}ct)`);
        
        DBManager.addLog("EDIT", savedEmerald.id, `Emerald (${shapes.join(', ')})`, summary, changes);

        // Replace item in array
        const index = DBManager.database.emeralds.findIndex(e => e.id === savedEmerald.id);
        if (index !== -1) {
          DBManager.database.emeralds[index] = savedEmerald;
        }
        UI.showToast("Emerald stock updated successfully!");
      } else {
        DBManager.addLog("ADD", savedEmerald.id, `Emerald (${shapes.join(', ')})`, `Added new emerald stock: ${shapes.join(', ')} (${savedEmerald.weight}ct)`, []);
        DBManager.database.emeralds.push(savedEmerald);
        UI.showToast("New emerald stock added successfully!");
      }

      await DBManager.saveVault();
      UI.closeModal('modal-emerald-item');
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  async handleDeleteEmerald(emerald) {
    const weight = this.getEmeraldWeight(emerald);
    const shapes = this.getEmeraldShapes(emerald).join(', ') || 'Emerald';
    const check = confirm(`Are you absolutely sure you want to delete this ${shapes} (${weight}ct) from emerald stock? This cannot be undone.`);
    if (!check) return;

    try {
      DBManager.addLog("DELETE", emerald.id, `Emerald (${shapes})`, `Deleted emerald stock: ${shapes} (${weight}ct)`, []);
      
      const index = DBManager.database.emeralds.findIndex(e => e.id === emerald.id);
      if (index !== -1) {
        DBManager.database.emeralds.splice(index, 1);
      }

      await DBManager.saveVault();
      UI.showToast("Emerald item deleted from stock.");
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  }
};

window.EmeraldController = EmeraldController;
