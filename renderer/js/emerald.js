/**
 * Emerald Controller Module
 * Manages emerald catalog rendering, filtering, sorting, and form interactions.
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

    this.populateGroupAutocomplete();
  },

  loadItemIntoForm(emerald) {
    this.resetForm();
    this.activeEmeraldState = JSON.parse(JSON.stringify(emerald));

    document.getElementById('emerald-item-id').value = emerald.id || '';
    document.getElementById('emerald-shape').value = emerald.shape || '';
    document.getElementById('emerald-weight').value = emerald.weight || emerald.size || '';
    document.getElementById('emerald-lustre').value = emerald.lustreGrade || '';
    document.getElementById('emerald-color').value = emerald.color || '';
    document.getElementById('emerald-pair').value = emerald.pair || 'No';
    document.getElementById('emerald-group').value = emerald.group || '';
    document.getElementById('emerald-price').value = emerald.pricePerCarat || '';

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
      const matchesSearch = !query || 
        (e.shape || '').toLowerCase().includes(query) ||
        (e.lustreGrade || '').toLowerCase().includes(query) ||
        (e.group || '').toLowerCase().includes(query) ||
        (e.weight || e.size || '').toString().includes(query) ||
        (e.pricePerCarat || '').toString().includes(query) ||
        (e.origins || []).some(o => o.toLowerCase().includes(query));

      const matchesGroup = !filterGroup || e.group === filterGroup;
      const matchesShape = !filterShape || e.shape === filterShape;
      const matchesLustre = !filterLustre || e.lustreGrade === filterLustre;
      const matchesOrigin = !filterOrigin || (e.origins || []).includes(filterOrigin);

      return matchesSearch && matchesGroup && matchesShape && matchesLustre && matchesOrigin;
    });

    // Sort
    if (sortVal === 'newest') {
      filtered.sort((a, b) => Number(b.id.split('_')[1] || 0) - Number(a.id.split('_')[1] || 0));
    } else if (sortVal === 'weight-high' || sortVal === 'size-high') {
      filtered.sort((a, b) => Number(b.weight || b.size || 0) - Number(a.weight || a.size || 0));
    } else if (sortVal === 'weight-low' || sortVal === 'size-low') {
      filtered.sort((a, b) => Number(a.weight || a.size || 0) - Number(b.weight || b.size || 0));
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
            <h3 class="product-title">${UI.escapeHtml(e.shape || 'Unknown Shape')}</h3>
          </div>
          
          <div class="product-specs">
            <div class="specs-line"><strong>Weight:</strong> ${e.weight || e.size || 0} carats</div>
            <div class="specs-line"><strong>Lustre:</strong> ${UI.escapeHtml(e.lustreGrade || 'N/A')}</div>
            <div class="specs-line"><strong>Pudia Number:</strong> ${e.color || 'N/A'}</div>
            <div class="specs-line"><strong>Pair:</strong> ${e.pair || 'No'}</div>
            <div class="specs-line" style="margin-bottom:0;"><strong>Origin:</strong> ${originsStr || 'None'}</div>
          </div>
          
          <div class="product-price-row" style="border-top: 1px dashed var(--border-light); padding-top: 12px; margin-top: 10px;">
            <div>
              <div class="price-lbl">PRICE PER CARAT</div>
              <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 6px;">₹${(e.pricePerCarat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div class="price-lbl">TOTAL VALUE</div>
              <div class="price-val">₹${((Number(e.weight || e.size || 0)) * (e.pricePerCarat || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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
    const shape = document.getElementById('emerald-shape').value.trim();
    const weight = Number(document.getElementById('emerald-weight').value || 0);
    const lustreGrade = document.getElementById('emerald-lustre').value.trim();
    const color = Number(document.getElementById('emerald-color').value || 0);
    const pricePerCarat = Number(document.getElementById('emerald-price').value || 0);
    const pair = document.getElementById('emerald-pair').value;
    const group = document.getElementById('emerald-group').value.trim();
    
    // Gather checked origins
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]:checked');
    const origins = Array.from(checkBoxes).map(cb => cb.value);

    if (!shape || weight <= 0 || !lustreGrade || isNaN(color) || pricePerCarat < 0 || origins.length === 0) {
      UI.showToast("Please fill all required fields and select at least one Origin.", true);
      return;
    }

    const id = document.getElementById('emerald-item-id').value || 'emerald_' + Date.now();
    const isEdit = !!document.getElementById('emerald-item-id').value;

    const savedEmerald = {
      id,
      shape,
      weight,
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
        const summary = Logs.buildSummary(changes, `Updated Emerald: ${savedEmerald.shape} (${savedEmerald.weight}ct)`);
        
        DBManager.addLog("EDIT", savedEmerald.id, `Emerald (${savedEmerald.shape})`, summary, changes);

        // Replace item in array
        const index = DBManager.database.emeralds.findIndex(e => e.id === savedEmerald.id);
        if (index !== -1) {
          DBManager.database.emeralds[index] = savedEmerald;
        }
        UI.showToast("Emerald stock updated successfully!");
      } else {
        DBManager.addLog("ADD", savedEmerald.id, `Emerald (${savedEmerald.shape})`, `Added new emerald stock: ${savedEmerald.shape} (${savedEmerald.weight}ct)`, []);
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
    const check = confirm(`Are you absolutely sure you want to delete this ${emerald.shape} (${emerald.weight || emerald.size}ct) from emerald stock? This cannot be undone.`);
    if (!check) return;

    try {
      DBManager.addLog("DELETE", emerald.id, `Emerald (${emerald.shape})`, `Deleted emerald stock: ${emerald.shape} (${emerald.weight || emerald.size}ct)`, []);
      
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
