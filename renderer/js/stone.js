/**
 * Stone Controller Module
 * Manages loose stones catalog rendering, filtering, sorting, and form interactions.
 * Supports Diamond, Ruby, Sapphire, Polki, Emerald, Semi-Precious, Other.
 * Supports dynamic size breakdown rows (Shape + MM + Pcs + cts) per Packet.
 */

const StoneController = {
  activeStoneState: null,
  activePdfDocument: null,

  init() {
    // Convert clarity/grade, packet number, group, and type inputs to comboboxes
    this._replaceWithComboWidget('stone-grade', 'form-grade', () => this._getKnownGrades(), 'Select or type Clarity/Grade...');
    this._replaceWithComboWidget('stone-packet-no', 'form-packet-no', () => this._getKnownPacketNumbers(), 'e.g. D-12');
    this._replaceWithComboWidget('stone-group', 'form-group', () => this._getKnownGroups(), 'e.g. Lot-Diamonds');
    this._replaceWithComboWidget('stone-type', 'form-type', () => this._getKnownTypes(), 'Select or type Category...', (option, refresh) => this.handleDeleteTypeOption(option, refresh));

    // Event listeners for filters and search
    const searchInput = document.getElementById('stone-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(() => this.renderStoneGrid(), 200));
    }
    const filterType = document.getElementById('stone-filter-type');
    if (filterType) {
      filterType.addEventListener('change', () => this.renderStoneGrid());
    }
    const filterShape = document.getElementById('stone-filter-shape');
    if (filterShape) {
      filterShape.addEventListener('change', () => this.renderStoneGrid());
    }
    const filterGroup = document.getElementById('stone-filter-group');
    if (filterGroup) {
      filterGroup.addEventListener('change', () => this.renderStoneGrid());
    }
    const filterGrade = document.getElementById('stone-filter-grade');
    if (filterGrade) {
      filterGrade.addEventListener('change', () => this.renderStoneGrid());
    }
    const sortItems = document.getElementById('stone-sort-items');
    if (sortItems) {
      sortItems.addEventListener('change', () => this.renderStoneGrid());
    }

    // Modal triggers
    const btnNavAddStone = document.getElementById('btn-nav-add-stone');
    if (btnNavAddStone) {
      btnNavAddStone.addEventListener('click', () => this.openAddModal());
    }
    const btnEmptyAddStone = document.getElementById('btn-empty-add-stone');
    if (btnEmptyAddStone) {
      btnEmptyAddStone.addEventListener('click', () => this.openAddModal());
    }

    const btnCreateStoneMain = document.getElementById('btn-create-stone-main');
    if (btnCreateStoneMain) {
      btnCreateStoneMain.addEventListener('click', () => this.openAddModal());
    }

    const btnSaveStone = document.getElementById('btn-save-stone');
    if (btnSaveStone) {
      btnSaveStone.addEventListener('click', () => this.handleSaveStone());
    }

    // Close buttons inside stone modal
    const closeTriggers = document.querySelectorAll('.modal-close-trigger-stone');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-stone-item');
      });
    });

    // Add Size Row button
    const btnAddSize = document.getElementById('btn-add-stone-size');
    if (btnAddSize) {
      btnAddSize.addEventListener('click', () => this.createSizeRow());
    }

    // Print button
    const btnPrintStone = document.getElementById('btn-print-stone');
    if (btnPrintStone) {
      btnPrintStone.addEventListener('click', () => this.openPrintModal());
    }

    // Print Selection Modal listeners
    const printCloseTriggers = document.querySelectorAll('.modal-close-trigger-print-stone');
    printCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-print-stone'));
    });

    const printTypeSel = document.getElementById('print-stone-select-type');
    if (printTypeSel) {
      printTypeSel.addEventListener('change', () => this.handlePrintTypeChange());
    }

    const printGroupSel = document.getElementById('print-stone-select-group');
    if (printGroupSel) {
      printGroupSel.addEventListener('change', () => this.handlePrintGroupChange());
    }

    const btnSelectAll = document.getElementById('btn-print-select-all-stones');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => this.toggleAllPrintStones(true));
    }

    const btnSelectNone = document.getElementById('btn-print-select-none-stones');
    if (btnSelectNone) {
      btnSelectNone.addEventListener('click', () => this.toggleAllPrintStones(false));
    }

    const btnSubmitPrint = document.getElementById('btn-submit-print-stone');
    if (btnSubmitPrint) {
      btnSubmitPrint.addEventListener('click', () => this.printFromSelection());
    }
  },

  openAddModal() {
    this.resetForm();
    this.createSizeRow(); // Seed with one default row
    document.getElementById('stone-modal-title').textContent = "Add New Stone Stock";
    UI.openModal('modal-stone-item');
  },

  resetForm() {
    this.activeStoneState = null;
    document.getElementById('stone-form').reset();
    document.getElementById('stone-item-id').value = '';
    
    // Clear checked origins
    const checkBoxes = document.querySelectorAll('input[name="stone-origin"]');
    checkBoxes.forEach(cb => cb.checked = false);
    document.getElementById('stone-price').value = '';

    // Clear sizes
    const sizesContainer = document.getElementById('stone-sizes-container');
    if (sizesContainer) {
      sizesContainer.innerHTML = '';
    }
    this.updateSizeTotals();

    this.populateGroupAutocomplete();
    this.populateShapeAutocomplete();
    this.populateMmAutocomplete();
    this.populateGradeAutocomplete();
  },

  /** Build a combobox widget (mirrors emerald.js pattern) */
  _buildComboWidget(fieldClass, getOptions, currentVal, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'size-combo-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = fieldClass + ' size-combo-input';
    input.placeholder = placeholder;
    input.value = currentVal;
    input.autocomplete = 'off';
    input.spellcheck = false;

    const dropdown = document.createElement('div');
    dropdown.className = 'combo-dropdown';
    let isOpen = false;

    const openDropdown = (filter) => {
      const opts = getOptions();
      const q = (filter || '').toLowerCase().trim();
      const matches = q ? opts.filter(o => o.toLowerCase().includes(q)) : opts;
      dropdown.innerHTML = '';
      if (matches.length === 0) { closeDropdown(); return; }
      matches.forEach(o => {
        const item = document.createElement('div');
        item.className = 'combo-option';
        if (q) {
          const idx = o.toLowerCase().indexOf(q);
          item.innerHTML =
            UI.escapeHtml(o.slice(0, idx)) +
            '<mark>' + UI.escapeHtml(o.slice(idx, idx + q.length)) + '</mark>' +
            UI.escapeHtml(o.slice(idx + q.length));
        } else {
          item.textContent = o;
        }
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = o;
          closeDropdown();
        });
        dropdown.appendChild(item);
      });
      if (!isOpen) { wrap.appendChild(dropdown); isOpen = true; }
    };

    const closeDropdown = () => {
      if (isOpen) { dropdown.remove(); isOpen = false; }
    };

    input.addEventListener('focus', () => openDropdown(input.value));
    input.addEventListener('input', () => openDropdown(input.value));
    input.addEventListener('blur',  () => setTimeout(closeDropdown, 120));

    input.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      const items = dropdown.querySelectorAll('.combo-option');
      const active = dropdown.querySelector('.combo-option.active');
      let idx = active ? Array.from(items).indexOf(active) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = Math.min(idx + 1, items.length - 1);
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = Math.max(idx - 1, 0);
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        input.value = active.textContent;
        closeDropdown();
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    wrap.appendChild(input);
    return wrap;
  },

  /**
   * Replaces an existing static input field in the main form with an editable
   * combobox dropdown widget, retaining the original HTML ID so form loading
   * and saving logic works seamlessly.
   */
  _replaceWithComboWidget(inputId, fieldClass, getOptions, placeholder, onDeleteOption) {
    const originalInput = document.getElementById(inputId);
    if (!originalInput) return;

    const wrap = document.createElement('div');
    wrap.className = 'form-combo-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.className = fieldClass + ' size-combo-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.required = originalInput.required;

    const dropdown = document.createElement('div');
    dropdown.className = 'combo-dropdown';

    let isOpen = false;

    const openDropdown = (filter) => {
      const opts = getOptions();
      const q = (filter || '').toLowerCase().trim();
      const matches = q ? opts.filter(o => String(o).toLowerCase().includes(q)) : opts;

      dropdown.innerHTML = '';
      if (matches.length === 0) { closeDropdown(); return; }

      matches.forEach(o => {
        const item = document.createElement('div');
        item.className = 'combo-option';
        
        if (onDeleteOption) {
          item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';
          const textSpan = document.createElement('span');
          if (q) {
            const idx = String(o).toLowerCase().indexOf(q);
            textSpan.innerHTML =
              UI.escapeHtml(String(o).slice(0, idx)) +
              '<mark>' + UI.escapeHtml(String(o).slice(idx, idx + q.length)) + '</mark>' +
              UI.escapeHtml(String(o).slice(idx + q.length));
          } else {
            textSpan.textContent = String(o);
          }
          item.appendChild(textSpan);

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'btn-delete-option';
          deleteBtn.innerHTML = '&times;';
          deleteBtn.style.cssText = 'background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; padding: 2px 6px; line-height: 1;';
          deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onDeleteOption(o, () => {
              openDropdown(input.value);
            });
          });
          item.appendChild(deleteBtn);
        } else {
          if (q) {
            const idx = String(o).toLowerCase().indexOf(q);
            item.innerHTML =
              UI.escapeHtml(String(o).slice(0, idx)) +
              '<mark>' + UI.escapeHtml(String(o).slice(idx, idx + q.length)) + '</mark>' +
              UI.escapeHtml(String(o).slice(idx + q.length));
          } else {
            item.textContent = String(o);
          }
        }

        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = String(o);
          closeDropdown();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        dropdown.appendChild(item);
      });

      if (!isOpen) {
        wrap.appendChild(dropdown);
        isOpen = true;
      }
    };

    const closeDropdown = () => {
      if (isOpen) {
        dropdown.remove();
        isOpen = false;
      }
    };

    input.addEventListener('focus', () => openDropdown(input.value));
    input.addEventListener('input', () => openDropdown(input.value));
    input.addEventListener('blur',  () => setTimeout(closeDropdown, 120));

    input.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      const items = dropdown.querySelectorAll('.combo-option');
      const active = dropdown.querySelector('.combo-option.active');
      let idx = active ? Array.from(items).indexOf(active) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = Math.min(idx + 1, items.length - 1);
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (active) active.classList.remove('active');
        idx = Math.max(idx - 1, 0);
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        input.value = active.querySelector('span') ? active.querySelector('span').textContent : active.textContent;
        closeDropdown();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    wrap.appendChild(input);
    originalInput.parentNode.replaceChild(wrap, originalInput);
  },

  createSizeRow(data = { shape: '', mm: '', pieces: '', weight: '' }) {
    const container = document.getElementById('stone-sizes-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'stone-size-row';

    const shapeWidget = this._buildComboWidget(
      'size-shape',
      () => this._getKnownShapes(),
      data.shape || '',
      'e.g. Round Brilliant'
    );
    const mmWidget = this._buildComboWidget(
      'size-mm',
      () => this._getKnownMMs(),
      data.mm || '',
      'e.g. 2.1mm'
    );

    const piecesInput = document.createElement('input');
    piecesInput.type = 'number'; piecesInput.className = 'size-pieces';
    piecesInput.min = '0'; piecesInput.step = '1'; piecesInput.placeholder = '0';
    piecesInput.value = data.pieces || '';

    const weightInput = document.createElement('input');
    weightInput.type = 'number'; weightInput.className = 'size-weight';
    weightInput.min = '0'; weightInput.step = '0.001'; weightInput.placeholder = '0.000';
    weightInput.value = data.weight || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'btn-remove-size';
    removeBtn.title = 'Remove row'; removeBtn.innerHTML = '&times;';

    piecesInput.addEventListener('input', () => this.updateSizeTotals());
    weightInput.addEventListener('input', () => this.updateSizeTotals());
    removeBtn.addEventListener('click', () => {
      row.remove();
      this.updateSizeTotals();
    });

    row.appendChild(shapeWidget);
    row.appendChild(mmWidget);
    row.appendChild(piecesInput);
    row.appendChild(weightInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
    this.updateSizeTotals();
  },

  updateSizeTotals() {
    const rows = document.querySelectorAll('.stone-size-row');
    let totalPcs = 0;
    let totalCts = 0;

    rows.forEach(row => {
      totalPcs += Number(row.querySelector('.size-pieces').value || 0);
      totalCts += Number(row.querySelector('.size-weight').value || 0);
    });

    const pcsEl = document.getElementById('stone-total-pcs');
    const ctsEl = document.getElementById('stone-total-cts');
    if (pcsEl) pcsEl.textContent = totalPcs;
    if (ctsEl) ctsEl.textContent = totalCts.toFixed(3);
  },

  gatherSizes() {
    const rows = document.querySelectorAll('.stone-size-row');
    const sizes = [];
    rows.forEach(row => {
      const shapeInput = row.querySelector('.size-shape.size-combo-input');
      const mmInput    = row.querySelector('.size-mm.size-combo-input');
      const shape  = shapeInput ? shapeInput.value.trim() : '';
      const mm     = mmInput    ? mmInput.value.trim()    : '';
      const pieces = Number(row.querySelector('.size-pieces').value || 0);
      const weight = Number(row.querySelector('.size-weight').value || 0);
      if (shape || mm || pieces > 0 || weight > 0) {
        sizes.push({ shape, mm, pieces, weight });
      }
    });
    return sizes;
  },

  getShapesFromSizes(sizes) {
    const shapes = new Set();
    (sizes || []).forEach(s => {
      if (s.shape && s.shape.trim()) {
        shapes.add(s.shape.trim());
      }
    });
    return Array.from(shapes);
  },

  loadItemIntoForm(stone) {
    this.resetForm();
    this.activeStoneState = JSON.parse(JSON.stringify(stone));

    document.getElementById('stone-item-id').value = stone.id || '';
    document.getElementById('stone-type').value = stone.type || 'Diamond';
    document.getElementById('stone-packet-no').value = stone.color || ''; // color acts as Packet #
    document.getElementById('stone-grade').value = stone.lustreGrade || ''; // lustreGrade acts as Clarity/Grade
    document.getElementById('stone-pair').value = stone.pair || 'No';
    document.getElementById('stone-group').value = stone.group || '';
    document.getElementById('stone-price').value = stone.pricePerCarat || '';

    if (stone.sizes && stone.sizes.length > 0) {
      stone.sizes.forEach(s => this.createSizeRow(s));
    } else {
      this.createSizeRow({
        shape: stone.shape || '',
        mm: '',
        pieces: '',
        weight: stone.weight || 0
      });
    }

    // Re-populate autocomplete datalists now that this entry's rows are in the DOM,
    // so its own shape/mm values appear as suggestions in the dropdowns.
    this.populateShapeAutocomplete();
    this.populateMmAutocomplete();

    const origins = stone.origins || [];
    const checkBoxes = document.querySelectorAll('input[name="stone-origin"]');
    checkBoxes.forEach(cb => {
      if (origins.includes(cb.value)) {
        cb.checked = true;
      }
    });

    document.getElementById('stone-modal-title').textContent = "Edit Stone Stock";
  },

  _getKnownTypes() {
    const SEEDS = ['Diamond', 'Ruby', 'Sapphire', 'Polki', 'Emerald', 'Other Semi-Precious', 'Other'];
    const removed = (DBManager.database && DBManager.database.settings && DBManager.database.settings.removedStoneTypes) || [];
    
    const all = new Set();
    SEEDS.forEach(s => {
      if (!removed.includes(s)) {
        all.add(s);
      }
    });

    if (DBManager.database && DBManager.database.settings && DBManager.database.settings.stoneTypes) {
      DBManager.database.settings.stoneTypes.forEach(t => {
        if (!removed.includes(t)) {
          all.add(t);
        }
      });
    }

    DBManager.getStones().forEach(st => {
      if (st.type && st.type.trim() && !removed.includes(st.type.trim())) {
        all.add(st.type.trim());
      }
    });

    return Array.from(all).sort();
  },

  async handleDeleteTypeOption(option, refreshDropdown) {
    UI.confirm(`Are you sure you want to remove "${option}" from the dropdown category options?`, async () => {
      try {
        if (!DBManager.database.settings.removedStoneTypes) {
          DBManager.database.settings.removedStoneTypes = [];
        }
        if (!DBManager.database.settings.removedStoneTypes.includes(option)) {
          DBManager.database.settings.removedStoneTypes.push(option);
        }
        if (DBManager.database.settings.stoneTypes) {
          DBManager.database.settings.stoneTypes = DBManager.database.settings.stoneTypes.filter(t => t !== option);
        }
        await DBManager.saveVault();
        UI.showToast(`Removed category option: ${option}`);
        if (refreshDropdown) refreshDropdown();
        this.renderStoneGrid();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  /** Collect all known unique shapes from DB */
  _getKnownShapes() {
    const SEEDS = ['Round Brilliant', 'Emerald Cut', 'Oval Cut', 'Pear Shape', 'Marquise', 'Cushion Cut', 'Princess Cut', 'Rose Cut', 'Fancy Cut'];
    const all = new Set(SEEDS);
    DBManager.getStones().forEach(st => {
      (st.sizes || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      if (st.shape) st.shape.split(',').forEach(sh => { const t = sh.trim(); if (t) all.add(t); });
    });
    DBManager.getEmeralds().forEach(e => {
      (e.sizes || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      if (e.shape) e.shape.split(',').forEach(sh => { const t = sh.trim(); if (t) all.add(t); });
    });
    DBManager.getItems().forEach(item => {
      (item.stones || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      (item.diamondsPolki || []).forEach(d => { if (d.shape) all.add(d.shape.trim()); });
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique MM values from DB */
  _getKnownMMs() {
    const all = new Set();
    DBManager.getStones().forEach(st => {
      (st.sizes || []).forEach(s => { if (s.mm) all.add(s.mm.trim()); });
    });
    DBManager.getEmeralds().forEach(e => {
      (e.sizes || []).forEach(s => { if (s.mm) all.add(s.mm.trim()); });
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique clarity/grades from DB */
  _getKnownGrades() {
    const SEEDS = ['FL/IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'Lustre', 'Commercial'];
    const all = new Set(SEEDS);
    DBManager.getStones().forEach(st => {
      if (st.lustreGrade && st.lustreGrade.trim()) all.add(st.lustreGrade.trim());
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique packet numbers from DB */
  _getKnownPacketNumbers() {
    const all = new Set();
    DBManager.getStones().forEach(st => {
      if (st.color !== undefined && st.color !== null && String(st.color).trim() !== '') {
        all.add(String(st.color).trim());
      }
    });
    return Array.from(all).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (isNaN(na) || isNaN(nb)) return a.localeCompare(b);
      return na - nb;
    });
  },

  /** Collect all known unique groups from DB */
  _getKnownGroups() {
    const all = new Set();
    DBManager.getStones().forEach(st => {
      if (st.group && st.group.trim()) all.add(st.group.trim());
    });
    return Array.from(all).sort();
  },

  /** No-op — combobox widgets fetch fresh options on every open. */
  populateShapeAutocomplete() {},

  /** No-op — combobox widgets fetch fresh options on every open. */
  populateMmAutocomplete() {},

  populateGroupAutocomplete() {},

  populateGradeAutocomplete() {},

  populateTypeFilterOptions() {
    const filterSelect = document.getElementById('stone-filter-type');
    if (!filterSelect) return;
    const current = filterSelect.value;
    const types = this._getKnownTypes();

    let optionsHtml = `<option value="">All Types</option>`;
    types.forEach(t => {
      optionsHtml += `<option value="${t}">${UI.escapeHtml(t)}</option>`;
    });

    const curOpts = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOpts = ["", ...types].join(',');

    if (curOpts !== newOpts) {
      filterSelect.innerHTML = optionsHtml;
      filterSelect.value = types.includes(current) ? current : "";
    }
  },

  populateGroupFilterOptions() {
    const filterSelect = document.getElementById('stone-filter-group');
    if (!filterSelect) return;
    const current = filterSelect.value;
    const uniqueGroups = new Set();
    DBManager.getStones().forEach(st => {
      if (st.group) uniqueGroups.add(st.group.trim());
    });
    const sorted = Array.from(uniqueGroups).sort();
    let optionsHtml = `<option value="">All Groups</option>`;
    sorted.forEach(g => {
      optionsHtml += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    const curOpts = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOpts = ["", ...sorted].join(',');

    if (curOpts !== newOpts) {
      filterSelect.innerHTML = optionsHtml;
      filterSelect.value = uniqueGroups.has(current) ? current : "";
    }
  },

  populateGradeFilterOptions() {
    const filterSelect = document.getElementById('stone-filter-grade');
    if (!filterSelect) return;
    const current = filterSelect.value;
    const uniqueGrades = new Set();
    DBManager.getStones().forEach(st => {
      if (st.lustreGrade) uniqueGrades.add(st.lustreGrade.trim());
    });
    const sorted = Array.from(uniqueGrades).sort();
    let optionsHtml = `<option value="">All Grades</option>`;
    sorted.forEach(gr => {
      optionsHtml += `<option value="${gr}">${UI.escapeHtml(gr)}</option>`;
    });

    const curOpts = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOpts = ["", ...sorted].join(',');

    if (curOpts !== newOpts) {
      filterSelect.innerHTML = optionsHtml;
      filterSelect.value = uniqueGrades.has(current) ? current : "";
    }
  },

  getStoneShapes(st) {
    if (st.sizes && st.sizes.length > 0) {
      return this.getShapesFromSizes(st.sizes);
    }
    return st.shape ? [st.shape] : [];
  },

  getStoneWeight(st) {
    if (st.sizes && st.sizes.length > 0) {
      return st.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0);
    }
    return Number(st.weight || 0);
  },

  getStonePieces(st) {
    if (st.sizes && st.sizes.length > 0) {
      return st.sizes.reduce((sum, s) => sum + Number(s.pieces || 0), 0);
    }
    return 0;
  },

  getFilteredStones() {
    const query = document.getElementById('stone-search-input').value.toLowerCase().trim();
    const filterType = document.getElementById('stone-filter-type').value;
    const filterGroup = document.getElementById('stone-filter-group').value;
    const filterShape = document.getElementById('stone-filter-shape').value;
    const filterGrade = document.getElementById('stone-filter-grade').value;

    const all = DBManager.getStones();

    return all.filter(st => {
      const shapes = this.getStoneShapes(st);
      const shapesStr = shapes.join(' ').toLowerCase();
      const sizesStr = (st.sizes || []).map(s => `${s.shape} ${s.mm}`).join(' ').toLowerCase();

      const matchesSearch = !query ||
        shapesStr.includes(query) ||
        sizesStr.includes(query) ||
        (st.type || '').toLowerCase().includes(query) ||
        (st.lustreGrade || '').toLowerCase().includes(query) ||
        (st.group || '').toLowerCase().includes(query) ||
        this.getStoneWeight(st).toString().includes(query) ||
        (st.color || '').toString().toLowerCase().includes(query) ||
        (st.origins || []).some(o => o.toLowerCase().includes(query));

      const matchesType = !filterType || st.type === filterType;
      const matchesGroup = !filterGroup || st.group === filterGroup;
      const matchesShape = !filterShape || shapes.includes(filterShape);
      const matchesGrade = !filterGrade || st.lustreGrade === filterGrade;

      return matchesSearch && matchesType && matchesGroup && matchesShape && matchesGrade;
    });
  },

  renderStoneGrid() {
    const gridContainer = document.getElementById('stone-catalog-grid');
    const emptyState = document.getElementById('stone-empty-state');
    if (!gridContainer || !emptyState) return;

    this.populateGroupFilterOptions();
    this.populateGradeFilterOptions();
    this.populateTypeFilterOptions();

    const filtered = this.getFilteredStones();
    const sortVal = document.getElementById('stone-sort-items').value;

    gridContainer.innerHTML = '';

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gridContainer.classList.remove('hidden');

    // Grouping: Group name -> Stone Type -> Grade/Clarity
    const groups = {};
    filtered.forEach(st => {
      const groupName = (st.group && st.group.trim()) ? st.group.trim() : "Unassigned Group";
      if (!groups[groupName]) {
        groups[groupName] = {
          name: groupName,
          types: {},
          totalWeight: 0,
          totalValue: 0,
          itemCount: 0
        };
      }

      const w = this.getStoneWeight(st);
      const val = w * (st.pricePerCarat || 0);

      groups[groupName].totalWeight += w;
      groups[groupName].totalValue += val;
      groups[groupName].itemCount++;

      const typeName = st.type || 'Other';
      if (!groups[groupName].types[typeName]) {
        groups[groupName].types[typeName] = {
          name: typeName,
          grades: {},
          totalWeight: 0,
          totalValue: 0
        };
      }
      groups[groupName].types[typeName].totalWeight += w;
      groups[groupName].types[typeName].totalValue += val;

      const gradeName = (st.lustreGrade && st.lustreGrade.trim()) ? st.lustreGrade.trim() : "Unassigned Grade";
      if (!groups[groupName].types[typeName].grades[gradeName]) {
        groups[groupName].types[typeName].grades[gradeName] = {
          name: gradeName,
          items: [],
          totalWeight: 0,
          totalValue: 0
        };
      }
      groups[groupName].types[typeName].grades[gradeName].items.push(st);
      groups[groupName].types[typeName].grades[gradeName].totalWeight += w;
      groups[groupName].types[typeName].grades[gradeName].totalValue += val;
    });

    // Sort items inside grade categories
    Object.values(groups).forEach(g => {
      Object.values(g.types).forEach(t => {
        Object.values(t.grades).forEach(gr => {
          gr.items.sort((a, b) => {
            const packA = Number(a.color) || 0;
            const packB = Number(b.color) || 0;
            return packA - packB;
          });
        });
      });
    });

    // Sort Groups
    const groupsArray = Object.values(groups);
    if (sortVal === 'weight-high') {
      groupsArray.sort((a, b) => b.totalWeight - a.totalWeight);
    } else if (sortVal === 'weight-low') {
      groupsArray.sort((a, b) => a.totalWeight - b.totalWeight);
    } else if (sortVal === 'price-high') {
      groupsArray.sort((a, b) => b.totalValue - a.totalValue);
    } else if (sortVal === 'price-low') {
      groupsArray.sort((a, b) => a.totalValue - b.totalValue);
    } else {
      groupsArray.sort((a, b) => a.name.localeCompare(b.name));
    }

    groupsArray.forEach(group => {
      const groupCard = document.createElement('div');
      groupCard.className = 'stone-group-card';
      groupCard.style.cssText = 'background-color: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; overflow: hidden; margin-bottom: 15px;';

      const groupHeader = document.createElement('div');
      groupHeader.style.cssText = 'cursor: pointer; padding: 12px 16px; background-color: var(--bg-card);';
      
      groupHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span class="group-expand-icon" style="font-family: monospace; font-size: 12px; width: 12px; color: var(--text-muted); flex-shrink: 0;">▶</span>
          <span style="font-weight: 700; font-size: 15px; color: var(--text-main); font-family: var(--font-serif);">${UI.escapeHtml(group.name)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-left: 22px;">
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text-muted);">Weight: <strong style="color: var(--text-main);">${group.totalWeight.toFixed(3)} cts</strong></span>
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text-muted);">Value: <strong style="color: var(--text-gold-dark);">₹${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--text-main);">${group.itemCount} Packets</span>
        </div>
      `;
      groupCard.appendChild(groupHeader);

      const groupBody = document.createElement('div');
      groupBody.className = 'stone-group-body hidden';
      groupBody.style.cssText = 'padding: 10px 16px; border-top: 1px solid var(--border-light); background-color: var(--bg-base); display: flex; flex-direction: column; gap: 10px;';

      // Render Types
      Object.values(group.types).sort((a,b) => a.name.localeCompare(b.name)).forEach(type => {
        const typeBlock = document.createElement('div');
        typeBlock.style.cssText = 'border-radius: 4px; border: 1px solid var(--border-light); background-color: var(--bg-card); overflow: hidden;';

        const typeHeader = document.createElement('div');
        typeHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 8px 12px; background-color: var(--bg-card);';
        typeHeader.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="type-expand-icon" style="font-family: monospace; font-size: 11px; width: 11px; color: var(--text-muted);">▶</span>
            <span style="font-weight: 600; font-size: 13px; color: var(--text-main); text-transform: uppercase;">${type.name}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 10px;">
            <span>Wt: <strong>${type.totalWeight.toFixed(3)} cts</strong></span>
            <span>Value: <strong>₹${type.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
          </div>
        `;
        typeBlock.appendChild(typeHeader);

        const typeBody = document.createElement('div');
        typeBody.className = 'type-body hidden';
        typeBody.style.cssText = 'padding: 8px; border-top: 1px solid var(--border-light); background-color: var(--bg-base); display: flex; flex-direction: column; gap: 8px;';

        // Render Grades
        Object.values(type.grades).sort((a,b) => a.name.localeCompare(b.name)).forEach(grade => {
          const gradeBlock = document.createElement('div');
          gradeBlock.style.cssText = 'border-radius: 4px; border: 1px solid var(--border-light); background-color: var(--bg-card); overflow: hidden;';

          const gradeHeader = document.createElement('div');
          gradeHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 6px 10px; background-color: var(--bg-card);';
          gradeHeader.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="grade-expand-icon" style="font-family: monospace; font-size: 10px; width: 10px; color: var(--text-muted);">▶</span>
              <span style="font-weight: 600; font-size: 12px; color: var(--text-main);">Clarity/Grade: <strong>${grade.name}</strong></span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 10px;">
              <span>Wt: <strong>${grade.totalWeight.toFixed(3)} cts</strong></span>
              <span>Value: <strong>₹${grade.totalValue.toLocaleString()}</strong></span>
            </div>
          `;
          gradeBlock.appendChild(gradeHeader);

          const gradeBody = document.createElement('div');
          gradeBody.className = 'grade-body hidden';
          gradeBody.style.cssText = 'padding: 8px; border-top: 1px solid var(--border-light); background-color: var(--bg-base); display: flex; flex-direction: column; gap: 8px;';

          // Packets
          grade.items.forEach(item => {
            const packBlock = document.createElement('div');
            packBlock.style.cssText = 'border-radius: 4px; border: 1px solid var(--border-light); background-color: var(--bg-card); overflow: hidden;';

            const packHeader = document.createElement('div');
            packHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 6px 8px; background-color: var(--bg-card);';
            
            const totalW = this.getStoneWeight(item);
            const totalP = this.getStonePieces(item);
            const value = totalW * (item.pricePerCarat || 0);

            packHeader.innerHTML = `
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="pack-expand-icon" style="font-family: monospace; font-size: 9px; width: 9px; color: var(--text-muted);">▶</span>
                <span style="font-weight: 600; font-size: 12px; color: var(--text-main);">Packet No: <strong style="color: var(--text-gold-dark);">#${item.color || 'N/A'}</strong></span>
              </div>
              <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap;">
                <span>Wt: <strong>${totalW.toFixed(3)} cts</strong></span>
                <span>Pcs: <strong>${totalP}</strong></span>
                <span>Rate: <strong>₹${(item.pricePerCarat || 0).toLocaleString()}/ct</strong></span>
                <span>Value: <strong style="color: var(--text-gold-dark);">₹${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
              </div>
            `;
            packBlock.appendChild(packHeader);

            const packBody = document.createElement('div');
            packBody.className = 'pack-body hidden';
            packBody.style.cssText = 'padding: 10px; border-top: 1px dashed var(--border-light); background-color: var(--bg-base);';

            let sizesTableHtml = '';
            if (item.sizes && item.sizes.length > 0) {
              sizesTableHtml = `<table class="stone-sizes-table">
                <tr><th>Shape</th><th>MM</th><th style="text-align:right;">Pcs</th><th style="text-align:right;">Weight</th></tr>`;
              item.sizes.forEach(s => {
                sizesTableHtml += `<tr><td>${UI.escapeHtml(s.shape)}</td><td>${UI.escapeHtml(s.mm || '—')}</td><td style="text-align:right;">${s.pieces || 0}</td><td style="text-align:right;">${Number(s.weight || 0).toFixed(3)} cts</td></tr>`;
              });
              sizesTableHtml += `<tr class="total-row"><td colspan="2" style="text-align:right;">Total</td><td style="text-align:right;">${totalP}</td><td style="text-align:right;">${totalW.toFixed(3)} cts</td></tr>`;
              sizesTableHtml += `</table>`;
            }

            packBody.innerHTML = `
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <div>
                  <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px;">Specifications</div>
                  <div style="font-size: 12px; line-height: 1.5;">
                    <div><strong>Type:</strong> ${item.type || 'Diamond'}</div>
                    <div><strong>Clarity/Grade:</strong> ${UI.escapeHtml(item.lustreGrade || '—')}</div>
                    <div><strong>Pair:</strong> ${item.pair || 'No'}</div>
                    <div><strong>Origin:</strong> ${(item.origins || []).join(', ') || '—'}</div>
                  </div>
                </div>
                <div>
                  <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px;">Sizes Breakdown</div>
                  ${sizesTableHtml || `<div style="font-size:12px;"><strong>Weight:</strong> ${totalW.toFixed(3)} cts</div>`}
                </div>
              </div>
              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; border-top: 1px solid var(--border-light); padding-top: 8px;">
                <button type="button" class="btn btn-secondary btn-small btn-edit" style="font-size:11px; padding:3px 8px;">Edit</button>
                <button type="button" class="btn btn-danger btn-small btn-delete" style="font-size:11px; padding:3px 8px;">Delete</button>
              </div>
            `;

            // Actions
            packBody.querySelector('.btn-edit').addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.loadItemIntoForm(item);
              UI.openModal('modal-stone-item');
            });
            packBody.querySelector('.btn-delete').addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.handleDeleteStone(item);
            });

            packBlock.appendChild(packBody);

            packHeader.addEventListener('click', () => {
              const collapsed = packBody.classList.toggle('hidden');
              packHeader.querySelector('.pack-expand-icon').textContent = collapsed ? '▶' : '▼';
            });

            gradeBody.appendChild(packBlock);
          });

          gradeBlock.appendChild(gradeBody);
          gradeHeader.addEventListener('click', () => {
            const collapsed = gradeBody.classList.toggle('hidden');
            gradeHeader.querySelector('.grade-expand-icon').textContent = collapsed ? '▶' : '▼';
          });
          typeBody.appendChild(gradeBlock);
        });

        typeBlock.appendChild(typeBody);
        typeHeader.addEventListener('click', () => {
          const collapsed = typeBody.classList.toggle('hidden');
          typeHeader.querySelector('.type-expand-icon').textContent = collapsed ? '▶' : '▼';
        });
        groupBody.appendChild(typeBlock);
      });

      groupCard.appendChild(groupBody);
      groupHeader.addEventListener('click', () => {
        const collapsed = groupBody.classList.toggle('hidden');
        groupHeader.querySelector('.group-expand-icon').textContent = collapsed ? '▶' : '▼';
      });

      gridContainer.appendChild(groupCard);
    });
  },

  async handleSaveStone() {
    const type = document.getElementById('stone-type').value;
    const color = document.getElementById('stone-packet-no').value.trim(); // color acts as Packet #
    const lustreGrade = document.getElementById('stone-grade').value.trim(); // lustreGrade acts as Clarity/Grade
    const pricePerCarat = Number(document.getElementById('stone-price').value || 0);
    const pair = document.getElementById('stone-pair').value;
    const group = document.getElementById('stone-group').value.trim();

    const sizes = this.gatherSizes();
    const totalWeight = sizes.reduce((sum, s) => sum + s.weight, 0);

    const checkBoxes = document.querySelectorAll('input[name="stone-origin"]:checked');
    const origins = Array.from(checkBoxes).map(cb => cb.value);

    if (sizes.length === 0) {
      UI.showToast("Please add at least one size row with Shape, pieces, and weight.", true);
      return;
    }

    const hasInvalid = sizes.some(s => !s.shape || s.pieces <= 0 || s.weight <= 0);
    if (hasInvalid) {
      UI.showToast("Each size row must have a Shape, Pieces (>0), and Weight (>0).", true);
      return;
    }

    if (!color || !lustreGrade || pricePerCarat <= 0) {
      UI.showToast("Please fill all required fields (*) and enter a rate per carat.", true);
      return;
    }

    const id = document.getElementById('stone-item-id').value || 'stone_' + Date.now();
    const isEdit = !!document.getElementById('stone-item-id').value;
    const shapes = this.getShapesFromSizes(sizes);

    const savedStone = {
      id,
      type,
      sizes,
      weight: Number(totalWeight.toFixed(3)),
      shape: shapes.join(', '),
      lustreGrade,
      color,
      pricePerCarat,
      pair,
      group,
      origins,
      createdAt: isEdit ? this.activeStoneState.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (isEdit) {
        const changes = Logs.diffItem(this.activeStoneState, savedStone);
        const summary = Logs.buildSummary(changes, `Updated ${savedStone.type} #${savedStone.color}`);
        const index = DBManager.database.stones.findIndex(st => st.id === savedStone.id);
        if (index !== -1) {
          DBManager.database.stones[index] = savedStone;
        }
        DBManager.addLog("EDIT", savedStone.id, `${savedStone.type} #${savedStone.color}`, summary, changes);
        UI.showToast("Stone details updated successfully!");
      } else {
        DBManager.database.stones.push(savedStone);
        DBManager.addLog("ADD", savedStone.id, `${savedStone.type} #${savedStone.color}`, `Added new loose stone stock`, []);
        UI.showToast("New stone stock added successfully!");
      }

      // Persist custom types to settings
      const SEEDS = ['Diamond', 'Ruby', 'Sapphire', 'Polki', 'Emerald', 'Other Semi-Precious', 'Other'];
      if (type && !SEEDS.includes(type)) {
        if (!DBManager.database.settings.stoneTypes) {
          DBManager.database.settings.stoneTypes = [];
        }
        if (!DBManager.database.settings.stoneTypes.includes(type)) {
          DBManager.database.settings.stoneTypes.push(type);
        }
        if (DBManager.database.settings.removedStoneTypes) {
          DBManager.database.settings.removedStoneTypes = DBManager.database.settings.removedStoneTypes.filter(t => t !== type);
        }
      }

      await DBManager.saveVault();
      UI.closeModal('modal-stone-item');
      App.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  async handleDeleteStone(stone) {
    UI.confirm(`Are you sure you want to delete ${stone.type} Packet #${stone.color} from stock?`, async () => {
      try {
        const index = DBManager.database.stones.findIndex(st => st.id === stone.id);
        if (index !== -1) {
          DBManager.database.stones.splice(index, 1);
        }
        DBManager.addLog("DELETE", stone.id, `${stone.type} #${stone.color}`, `Deleted loose stone stock`, []);
        await DBManager.saveVault();
        UI.showToast("Stock item deleted.");
        App.refreshAllDisplays();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  // ── Print PDF Generation ───────────────────────────────────────────────────

  openPrintModal() {
    this.populatePrintFilters();
    this.filterPrintStones();
    UI.openModal('modal-print-stone');
  },

  populatePrintFilters() {
    const typeSel = document.getElementById('print-stone-select-type');
    const groupSel = document.getElementById('print-stone-select-group');
    if (!typeSel || !groupSel) return;

    // Type options
    typeSel.innerHTML = '<option value="">-- All Types --</option>';
    const types = new Set();
    DBManager.getStones().forEach(st => { if (st.type) types.add(st.type); });
    Array.from(types).sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t; typeSel.appendChild(opt);
    });

    // Group options
    groupSel.innerHTML = '<option value="">-- All Groups --</option>';
    const groups = new Set();
    DBManager.getStones().forEach(st => { if (st.group) groups.add(st.group); });
    Array.from(groups).sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g; groupSel.appendChild(opt);
    });
  },

  handlePrintTypeChange() { this.filterPrintStones(); },
  handlePrintGroupChange() { this.filterPrintStones(); },

  filterPrintStones() {
    const typeVal = document.getElementById('print-stone-select-type').value;
    const groupVal = document.getElementById('print-stone-select-group').value;
    const tbody = document.getElementById('print-stone-selection-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const stones = DBManager.getStones();

    const filtered = stones.filter(st => {
      if (typeVal && st.type !== typeVal) return false;
      if (groupVal && st.group !== groupVal) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:15px;color:var(--text-muted);">No packets match filters.</td></tr>';
      return;
    }

    filtered.forEach(st => {
      const w = this.getStoneWeight(st);
      const val = w * (st.pricePerCarat || 0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 12px;text-align:center;"><input type="checkbox" class="print-stone-check" value="${st.id}" checked></td>
        <td style="padding:6px 12px;"><strong>${st.type}</strong></td>
        <td style="padding:6px 12px;">#${st.color || 'N/A'}</td>
        <td style="padding:6px 12px;">${st.group || '—'} / ${st.lustreGrade || '—'}</td>
        <td style="padding:6px 12px;text-align:right;">${w.toFixed(3)} cts</td>
        <td style="padding:6px 12px;text-align:right;">₹${val.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  toggleAllPrintStones(check) {
    document.querySelectorAll('.print-stone-check').forEach(cb => cb.checked = check);
  },

  printFromSelection() {
    const checked = Array.from(document.querySelectorAll('.print-stone-check:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      UI.showToast("Please select at least one stone packet to print.", true);
      return;
    }

    const all = DBManager.getStones();
    const filtered = all.filter(st => checked.includes(st.id));

    const doc = this.generatePDF(filtered);
    this.activePdfDocument = doc;

    const iframe = document.getElementById('print-preview-iframe');
    if (iframe) {
      iframe.src = doc.output('datauristring');
    }
    UI.closeModal('modal-print-stone');
    UI.openModal('modal-print-preview');
  },

  generatePDF(filtered) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const drawHeader = () => {
      doc.setFont("georgia", "bold");
      doc.setFontSize(16);
      doc.text("MAVA GEMS - LOOSE STONES STOCK REPORT", 14, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
      doc.text(`Total Packets: ${filtered.length}`, 14, 32);

      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(14, 35, 196, 35);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("Packet No", 14, 41);
      doc.text("Type", 32, 41);
      doc.text("Grade / Clarity", 60, 41);
      doc.text("Origin", 95, 41);
      doc.text("Pcs", 130, 41);
      doc.text("Weight", 145, 41);
      doc.text("Rate/ct", 160, 41);
      doc.text("Value (INR)", 178, 41);

      doc.line(14, 44, 196, 44);
    };

    drawHeader();

    // Grouping by Group
    const groups = {};
    filtered.forEach(st => {
      const g = st.group || 'Unassigned';
      if (!groups[g]) groups[g] = [];
      groups[g].push(st);
    });

    let y = 50;
    let grandWeight = 0;
    let grandValue = 0;
    let grandPieces = 0;

    const checkPageBreak = (needed) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 50;
        drawHeader();
        doc.setFont("helvetica", "normal");
      }
    };

    Object.keys(groups).forEach(gName => {
      const items = groups[gName];
      let gPieces = 0;
      let gWeight = 0;
      let gValue = 0;

      checkPageBreak(12);

      // Group Header Banner
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(245, 245, 245);
      doc.rect(14, y - 4, 182, 6, "F");
      doc.text(`GROUP: ${gName.toUpperCase()}`, 16, y);
      y += 8;

      items.forEach(st => {
        checkPageBreak(8);

        const w = this.getStoneWeight(st);
        const pcs = this.getStonePieces(st);
        const val = w * (st.pricePerCarat || 0);

        gPieces += pcs;
        gWeight += w;
        gValue += val;

        grandPieces += pcs;
        grandWeight += w;
        grandValue += val;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`#${st.color || 'N/A'}`, 14, y);
        doc.setFont("helvetica", "normal");
        doc.text(st.type, 32, y);
        doc.text(st.lustreGrade || '—', 60, y);
        doc.text((st.origins || []).join(', ').substring(0, 18), 95, y);
        doc.text(pcs.toString(), 130, y);
        doc.text(`${w.toFixed(3)}ct`, 145, y);
        doc.text(`Rs ${(st.pricePerCarat || 0).toLocaleString()}`, 160, y);
        doc.text(`Rs ${val.toLocaleString()}`, 178, y);

        y += 7;
      });

      // Group Subtotal Row
      checkPageBreak(10);
      doc.line(32, y - 4, 196, y - 4);
      doc.setFont("helvetica", "bold");
      doc.text(`Subtotal (${gName})`, 32, y);
      doc.text(gPieces.toString(), 130, y);
      doc.text(`${gWeight.toFixed(3)}ct`, 145, y);
      doc.text(`Rs ${gValue.toLocaleString()}`, 178, y);
      y += 12;
    });

    // Grand Total Row
    checkPageBreak(12);
    doc.line(14, y - 4, 196, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Grand Total", 14, y);
    doc.text(grandPieces.toString(), 130, y);
    doc.text(`${grandWeight.toFixed(3)}ct`, 145, y);
    doc.text(`Rs ${grandValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 178, y);

    return doc;
  }
};

window.StoneController = StoneController;
