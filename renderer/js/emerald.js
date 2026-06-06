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

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gridContainer.classList.remove('hidden');

    // Grouping
    const groups = {};
    filtered.forEach(e => {
      const groupName = (e.group && e.group.trim()) ? e.group.trim() : "Unassigned Group";
      if (!groups[groupName]) {
        groups[groupName] = {
          name: groupName,
          items: [],
          totalWeight: 0,
          totalValue: 0
        };
      }
      
      const w = this.getEmeraldWeight(e);
      const val = w * (e.pricePerCarat || 0);
      
      groups[groupName].items.push(e);
      groups[groupName].totalWeight += w;
      groups[groupName].totalValue += val;
    });

    // Group into grades within each group
    Object.values(groups).forEach(g => {
      const grades = {};
      g.items.forEach(item => {
        const gradeName = (item.lustreGrade && item.lustreGrade.trim()) ? item.lustreGrade.trim() : "Unassigned Grade";
        if (!grades[gradeName]) {
          grades[gradeName] = {
            name: gradeName,
            items: [],
            totalWeight: 0,
            totalValue: 0
          };
        }
        
        const w = this.getEmeraldWeight(item);
        const val = w * (item.pricePerCarat || 0);
        
        grades[gradeName].items.push(item);
        grades[gradeName].totalWeight += w;
        grades[gradeName].totalValue += val;
      });
      
      // Sort items by Pudia number (color field)
      Object.values(grades).forEach(grade => {
        grade.items.sort((a, b) => Number(a.color || 0) - Number(b.color || 0));
      });
      
      g.grades = grades;
    });

    // Sort Groups Array based on search sorting preference
    const groupsArray = Object.values(groups);
    if (sortVal === 'weight-high' || sortVal === 'size-high') {
      groupsArray.sort((a, b) => b.totalWeight - a.totalWeight);
    } else if (sortVal === 'weight-low' || sortVal === 'size-low') {
      groupsArray.sort((a, b) => a.totalWeight - b.totalWeight);
    } else if (sortVal === 'price-high') {
      groupsArray.sort((a, b) => b.totalValue - a.totalValue);
    } else if (sortVal === 'price-low') {
      groupsArray.sort((a, b) => a.totalValue - b.totalValue);
    } else {
      // Default / newest: sort by group name
      groupsArray.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Render Group Cards Accordion
    groupsArray.forEach(group => {
      const groupCard = document.createElement('div');
      groupCard.className = 'emerald-group-card';
      groupCard.style.cssText = 'background-color: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; overflow: hidden; transition: border-color var(--transition-fast);';
      
      const groupHeader = document.createElement('div');
      groupHeader.className = 'emerald-group-header';
      groupHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 15px 20px; user-select: none; background-color: var(--bg-card);';
      
      const groupTitleCol = `<div style="display: flex; align-items: center; gap: 15px;">
        <span class="group-expand-icon" style="font-family: monospace; font-size: 14px; width: 15px; color: var(--text-muted);">▶</span>
        <span style="font-weight: 700; font-size: 16px; color: var(--text-main); font-family: var(--font-serif);">${UI.escapeHtml(group.name)}</span>
      </div>`;
      
      const groupStatsCol = `<div style="display: flex; align-items: center; gap: 20px; font-size: 13px; color: var(--text-muted); flex-wrap: wrap;">
        <span>Weight: <strong style="color: var(--text-main);">${group.totalWeight.toFixed(2)} cts</strong></span>
        <span>Value: <strong style="color: var(--text-gold-dark);">₹${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
        <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; color: var(--text-main);">${group.items.length} Pudias</span>
        <button type="button" class="btn btn-danger btn-small btn-delete-group" style="padding: 2px 6px; font-size: 11px;" title="Delete Entire Group">Delete</button>
      </div>`;
      
      groupHeader.innerHTML = groupTitleCol + groupStatsCol;
      groupCard.appendChild(groupHeader);
      
      const groupBody = document.createElement('div');
      groupBody.className = 'emerald-group-body hidden';
      groupBody.style.cssText = 'padding: 10px 20px 20px 20px; border-top: 1px solid var(--border-light); background-color: var(--bg-base); display: flex; flex-direction: column; gap: 12px;';
      
      // Render Grades
      const sortedGrades = Object.values(group.grades).sort((a, b) => a.name.localeCompare(b.name));
      sortedGrades.forEach(grade => {
        const gradeBlock = document.createElement('div');
        gradeBlock.className = 'emerald-grade-block';
        gradeBlock.style.cssText = 'border-radius: 4px; overflow: hidden; border: 1px solid var(--border-light); background-color: var(--bg-card);';
        
        const gradeHeader = document.createElement('div');
        gradeHeader.className = 'emerald-grade-header';
        gradeHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 10px 15px; user-select: none; background-color: var(--bg-card);';
        
        const gradeTitleCol = `<div style="display: flex; align-items: center; gap: 12px;">
          <span class="grade-expand-icon" style="font-family: monospace; font-size: 12px; width: 12px; color: var(--text-muted);">▶</span>
          <span style="font-weight: 600; font-size: 14px; color: var(--text-main);">Grade: <strong style="color: var(--text-gold-dark); font-family: var(--font-serif);">${UI.escapeHtml(grade.name)}</strong></span>
        </div>`;
        
        const gradeStatsCol = `<div style="display: flex; align-items: center; gap: 15px; font-size: 12px; color: var(--text-muted);">
          <span>Weight: <strong style="color: var(--text-main);">${grade.totalWeight.toFixed(2)} cts</strong></span>
          <span>Value: <strong style="color: var(--text-gold-dark);">₹${grade.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
          <span style="background-color: var(--bg-base); padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; color: var(--text-main);">${grade.items.length} items</span>
          <button type="button" class="btn btn-danger btn-small btn-delete-grade" style="padding: 2px 6px; font-size: 10px;" title="Delete Entire Grade">Delete</button>
        </div>`;
        
        gradeHeader.innerHTML = gradeTitleCol + gradeStatsCol;
        gradeBlock.appendChild(gradeHeader);
        
        const gradeBody = document.createElement('div');
        gradeBody.className = 'emerald-grade-body hidden';
        gradeBody.style.cssText = 'padding: 10px 15px; border-top: 1px solid var(--border-light); background-color: var(--bg-base); display: flex; flex-direction: column; gap: 10px;';
        
        // Render Pudias
        grade.items.forEach(item => {
          const pudiaBlock = document.createElement('div');
          pudiaBlock.className = 'emerald-pudia-block';
          pudiaBlock.style.cssText = 'border-radius: 4px; overflow: hidden; border: 1px solid var(--border-light); background-color: var(--bg-card);';
          
          const pudiaHeader = document.createElement('div');
          pudiaHeader.className = 'emerald-pudia-header';
          pudiaHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 8px 12px; user-select: none; background-color: var(--bg-card);';
          
          const totalWeight = this.getEmeraldWeight(item);
          const totalPieces = this.getEmeraldPieces(item);
          const shapes = this.getEmeraldShapes(item);
          const shapesDisplay = shapes.length > 0 ? shapes.join(', ') : 'Unknown Shape';
          const originsStr = (item.origins || []).join(', ');
          
          const pudiaTitleCol = `<div style="display: flex; align-items: center; gap: 10px;">
            <span class="pudia-expand-icon" style="font-family: monospace; font-size: 10px; width: 10px; color: var(--text-muted);">▶</span>
            <span style="font-weight: 600; font-size: 13px; color: var(--text-main);">Pudia Number: <strong style="color: var(--text-gold-dark);">#${item.color || 'N/A'}</strong></span>
          </div>`;
          
          const pricePerCaratInr = item.pricePerCarat || 0;
          const totalValueInr = totalWeight * pricePerCaratInr;
          
          const pudiaStatsCol = `<div style="display: flex; align-items: center; gap: 15px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap;">
            <span>Weight: <strong style="color: var(--text-main);">${totalWeight.toFixed(2)} cts</strong></span>
            <span>Pcs: <strong style="color: var(--text-main);">${totalPieces}</strong></span>
            <span>Rate: <strong style="color: var(--text-main);">₹${pricePerCaratInr.toLocaleString()}/ct</strong></span>
            <span>Value: <strong style="color: var(--text-gold-dark);">₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
          </div>`;
          
          pudiaHeader.innerHTML = pudiaTitleCol + pudiaStatsCol;
          pudiaBlock.appendChild(pudiaHeader);
          
          const pudiaBody = document.createElement('div');
          pudiaBody.className = 'emerald-pudia-body hidden';
          pudiaBody.style.cssText = 'padding: 15px; border-top: 1px dashed var(--border-light); background-color: var(--bg-base);';
          
          // Build sizes table HTML
          let sizesHtml = '';
          if (item.sizes && item.sizes.length > 0) {
            sizesHtml = '<table style="width:100%; font-size:12px; border-collapse:collapse; margin-top:4px;">';
            sizesHtml += '<tr style="color:var(--text-muted); font-size:10px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-light);"><td>Shape</td><td>MM</td><td style="text-align:right;">Pcs</td><td style="text-align:right;">cts</td></tr>';
            item.sizes.forEach(s => {
              sizesHtml += `<tr style="border-bottom: 1px solid rgba(0,0,0,0.03);"><td>${UI.escapeHtml(s.shape || '')}</td><td>${UI.escapeHtml(s.mm || '')}</td><td style="text-align:right;">${s.pieces || 0}</td><td style="text-align:right;">${Number(s.weight || 0).toFixed(2)}</td></tr>`;
            });
            sizesHtml += `<tr style="font-weight:700; border-top:1px solid var(--border-light);"><td colspan="2" style="text-align:right;">Total</td><td style="text-align:right;">${totalPieces}</td><td style="text-align:right;">${totalWeight.toFixed(2)}</td></tr>`;
            sizesHtml += '</table>';
          }
          
          const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
          const pricePerCaratUsd = usdRate > 0 ? pricePerCaratInr / usdRate : 0;
          const totalValueUsd = usdRate > 0 ? totalValueInr / usdRate : 0;
          
          const dollarPriceHtml = usdRate > 0 ? `
            <div style="display: flex; gap: 15px; margin-top: 10px; padding: 8px; border: 1px dashed var(--border-light); background-color: var(--bg-card); font-size: 11px;">
              <div><strong>Price/ct (USD):</strong> $${pricePerCaratUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div><strong>Value (USD):</strong> $${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          ` : '';
          
          pudiaBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;">
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Specifications</div>
                <div style="font-size: 13px; line-height: 1.6;">
                  <div><strong>Pair:</strong> ${item.pair || 'No'}</div>
                  <div><strong>Origin:</strong> ${originsStr || 'None'}</div>
                  <div><strong>Shape:</strong> ${shapesDisplay}</div>
                  <div><strong>Lustre Grade:</strong> ${UI.escapeHtml(item.lustreGrade || 'N/A')}</div>
                </div>
                ${dollarPriceHtml}
              </div>
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Sizes Breakdown</div>
                ${sizesHtml || `<div style="font-size: 13px;"><strong>Weight:</strong> ${totalWeight} carats</div>`}
              </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px; border-top: 1px solid var(--border-light); padding-top: 12px;">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit</button>
              <button type="button" class="btn btn-danger btn-small btn-delete" title="Delete emerald">Delete</button>
            </div>
          `;
          
          // Wire up pudia actions
          pudiaBody.querySelector('.btn-edit').addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.loadItemIntoForm(item);
            UI.openModal('modal-emerald-item');
          });
          
          pudiaBody.querySelector('.btn-delete').addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.handleDeleteEmerald(item);
          });
          
          pudiaBlock.appendChild(pudiaBody);
          
          // Wire up pudia header click toggle
          pudiaHeader.addEventListener('click', () => {
            const isCollapsed = pudiaBody.classList.toggle('hidden');
            pudiaHeader.querySelector('.pudia-expand-icon').textContent = isCollapsed ? '▶' : '▼';
          });
          
          gradeBody.appendChild(pudiaBlock);
        });
        
        gradeBlock.appendChild(gradeBody);
        
        // Wire up grade header click toggle
        gradeHeader.addEventListener('click', (ev) => {
          if (ev.target.closest('.btn-delete-grade')) {
            ev.stopPropagation();
            this.handleDeleteEmeraldGrade(group.name, grade.name);
            return;
          }
          const isCollapsed = gradeBody.classList.toggle('hidden');
          gradeHeader.querySelector('.grade-expand-icon').textContent = isCollapsed ? '▶' : '▼';
        });
        
        groupBody.appendChild(gradeBlock);
      });
      
      groupCard.appendChild(groupBody);
      
      // Wire up group header click toggle
      groupHeader.addEventListener('click', (ev) => {
        if (ev.target.closest('.btn-delete-group')) {
          ev.stopPropagation();
          this.handleDeleteEmeraldGroup(group.name);
          return;
        }
        const isCollapsed = groupBody.classList.toggle('hidden');
        groupHeader.querySelector('.group-expand-icon').textContent = isCollapsed ? '▶' : '▼';
      });
      
      gridContainer.appendChild(groupCard);
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
    
    UI.confirm(`Are you absolutely sure you want to delete this ${shapes} (${weight}ct) from emerald stock? This cannot be undone.`, async () => {
      try {
        DBManager.addLog("DELETE", emerald.id, "Emerald", `Deleted emerald stock entry (${shapes}, ${weight}ct)`, []);
        
        const index = DBManager.database.emeralds.findIndex(e => e.id === emerald.id);
        if (index !== -1) {
          DBManager.database.emeralds.splice(index, 1);
        }

        await DBManager.saveVault();
        UI.showToast("Emerald deleted from stock.");
        App.refreshAllDisplays();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  async handleDeleteEmeraldGroup(groupName) {
    UI.confirm(`Are you absolutely sure you want to delete ALL emeralds in the group "${groupName}"? This cannot be undone.`, async () => {
      try {
        const initialCount = DBManager.database.emeralds.length;
        DBManager.database.emeralds = DBManager.database.emeralds.filter(e => (e.group || 'Default') !== groupName);
        const deletedCount = initialCount - DBManager.database.emeralds.length;
        
        DBManager.addLog("DELETE", `group_${groupName}`, "Emerald Group", `Deleted emerald group "${groupName}" (${deletedCount} items)`, []);
        await DBManager.saveVault();
        UI.showToast(`Deleted ${deletedCount} items from group "${groupName}".`);
        App.refreshAllDisplays();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  },

  async handleDeleteEmeraldGrade(groupName, gradeName) {
    UI.confirm(`Are you absolutely sure you want to delete ALL emeralds in the grade "${gradeName}" (Group: "${groupName}")? This cannot be undone.`, async () => {
      try {
        const initialCount = DBManager.database.emeralds.length;
        DBManager.database.emeralds = DBManager.database.emeralds.filter(e => {
          const eGroup = e.group || 'Default';
          const eGrade = e.grade || 'Default';
          return !(eGroup === groupName && eGrade === gradeName);
        });
        const deletedCount = initialCount - DBManager.database.emeralds.length;
        
        DBManager.addLog("DELETE", `grade_${groupName}_${gradeName}`, "Emerald Grade", `Deleted emerald grade "${gradeName}" from group "${groupName}" (${deletedCount} items)`, []);
        await DBManager.saveVault();
        UI.showToast(`Deleted ${deletedCount} items from grade "${gradeName}".`);
        App.refreshAllDisplays();
      } catch (err) {
        UI.showToast(err.message, true);
      }
    });
  }
};

window.EmeraldController = EmeraldController;
