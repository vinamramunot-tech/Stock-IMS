/**
 * Emerald Controller Module
 * Manages emerald catalog rendering, filtering, sorting, and form interactions.
 * Supports dynamic size breakdown rows (Shape + MM + Pcs + cts) per Pudia.
 */

const EmeraldController = {
  activeEmeraldState: null,
  currentViewMode: 'accordion',

  init() {
    // Convert lustre, color (pudia number), and group inputs to comboboxes
    this._replaceWithComboWidget('emerald-lustre', 'form-lustre', () => this._getKnownLustres(), 'Select or type lustre grade...');
    this._replaceWithComboWidget('emerald-color', 'form-color', () => this._getKnownPudiaNumbers(), 'e.g. 9');
    this._replaceWithComboWidget('emerald-group', 'form-group', () => this._getKnownGroups(), 'e.g. A-1 Lot or Custom Group');

    // Event listeners for filters and search
    const searchInput = document.getElementById('emerald-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce(() => this.renderEmeraldGrid(), 200));
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

    // Global Catalog price multiplier listeners
    const catalogApplyMultiplier = document.getElementById('catalog-apply-multiplier');
    const catalogMultiplierSelect = document.getElementById('catalog-multiplier-select');
    const catalogMultiplierCustom = document.getElementById('catalog-multiplier-custom');

    if (catalogApplyMultiplier && catalogMultiplierSelect && catalogMultiplierCustom) {
      catalogApplyMultiplier.addEventListener('change', () => {
        if (catalogApplyMultiplier.checked) {
          catalogMultiplierSelect.style.display = 'inline-block';
          if (catalogMultiplierSelect.value === 'custom') {
            catalogMultiplierCustom.style.display = 'inline-block';
          }
        } else {
          catalogMultiplierSelect.style.display = 'none';
          catalogMultiplierCustom.style.display = 'none';
        }
        this.renderEmeraldGrid();
      });

      catalogMultiplierSelect.addEventListener('change', () => {
        if (catalogMultiplierSelect.value === 'custom') {
          catalogMultiplierCustom.style.display = 'inline-block';
          catalogMultiplierCustom.value = '1.0';
        } else {
          catalogMultiplierCustom.style.display = 'none';
        }
        this.renderEmeraldGrid();
      });

      catalogMultiplierCustom.addEventListener('input', () => {
        this.renderEmeraldGrid();
      });
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

    const btnCreateEmeraldMain = document.getElementById('btn-create-emerald-main');
    if (btnCreateEmeraldMain) {
      btnCreateEmeraldMain.addEventListener('click', () => this.openAddModal());
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

    const btnAddPudia = document.getElementById('btn-add-emerald-pudia');
    if (btnAddPudia) {
      btnAddPudia.addEventListener('click', () => this.addPudiaCard());
    }

    // Stock Type change listener
    const stockTypeSelect = document.getElementById('emerald-stock-type');
    if (stockTypeSelect) {
      stockTypeSelect.addEventListener('change', () => this.handleStockTypeChange());
    }

    // Print button
    const btnPrintEmerald = document.getElementById('btn-print-emerald');
    if (btnPrintEmerald) {
      btnPrintEmerald.addEventListener('click', () => this.openPrintModal());
    }

    // Print Selection Modal listeners
    const printCloseTriggers = document.querySelectorAll('.modal-close-trigger-print-emerald');
    printCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-print-emerald'));
    });

    const printGroupSel = document.getElementById('print-select-group');
    if (printGroupSel) {
      printGroupSel.addEventListener('change', () => this.handlePrintGroupChange());
    }

    const printGradeSel = document.getElementById('print-select-grade');
    if (printGradeSel) {
      printGradeSel.addEventListener('change', () => this.handlePrintGradeChange());
    }

    const btnSelectAllPudias = document.getElementById('btn-print-select-all-pudias');
    if (btnSelectAllPudias) {
      btnSelectAllPudias.addEventListener('click', () => this.toggleAllPrintPudias(true));
    }

    const btnSelectNonePudias = document.getElementById('btn-print-select-none-pudias');
    if (btnSelectNonePudias) {
      btnSelectNonePudias.addEventListener('click', () => this.toggleAllPrintPudias(false));
    }

    const btnSubmitPrint = document.getElementById('btn-submit-print-emerald');
    if (btnSubmitPrint) {
      btnSubmitPrint.addEventListener('click', () => this.printFromSelection());
    }

    // Bulk Share Selection Modal listeners
    const btnBulkShareEmerald = document.getElementById('btn-bulk-share-emerald');
    if (btnBulkShareEmerald) {
      btnBulkShareEmerald.addEventListener('click', () => this.openBulkShareModal());
    }

    const bulkShareCloseTriggers = document.querySelectorAll('.modal-close-trigger-bulk-share-emerald');
    bulkShareCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-bulk-share-emerald'));
    });

    const bulkShareGroupSel = document.getElementById('bulk-share-select-group');
    if (bulkShareGroupSel) {
      bulkShareGroupSel.addEventListener('change', () => this.handleBulkShareGroupChange());
    }

    const bulkShareGradeSel = document.getElementById('bulk-share-select-grade');
    if (bulkShareGradeSel) {
      bulkShareGradeSel.addEventListener('change', () => this.handleBulkShareGradeChange());
    }

    const btnSelectAllBulkPudias = document.getElementById('btn-bulk-share-select-all-pudias');
    if (btnSelectAllBulkPudias) {
      btnSelectAllBulkPudias.addEventListener('click', () => this.toggleAllBulkSharePudias(true));
    }

    const btnSelectNoneBulkPudias = document.getElementById('btn-bulk-share-select-none-pudias');
    if (btnSelectNoneBulkPudias) {
      btnSelectNoneBulkPudias.addEventListener('click', () => this.toggleAllBulkSharePudias(false));
    }

    const btnSubmitBulkShare = document.getElementById('btn-submit-bulk-share-emerald');
    if (btnSubmitBulkShare) {
      btnSubmitBulkShare.addEventListener('click', () => this.exportBulkShareCards());
    }

    // Print Preview Modal listeners
    const previewCloseTriggers = document.querySelectorAll('.modal-close-trigger-print-preview');
    previewCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal('modal-print-preview'));
    });

    const btnSavePdf = document.getElementById('btn-save-print-pdf');
    if (btnSavePdf) {
      btnSavePdf.addEventListener('click', () => this.handleSavePdfClick());
    }

    // Share Card Modal listeners
    const incPrice = document.getElementById('share-include-price');
    if (incPrice) {
      incPrice.addEventListener('change', () => {
        if (this.sharingEmerald) this.generateShareCard(this.sharingEmerald);
      });
    }
    const incBrand = document.getElementById('share-include-brand');
    if (incBrand) {
      incBrand.addEventListener('change', () => {
        if (this.sharingEmerald) this.generateShareCard(this.sharingEmerald);
      });
    }
    const bgTheme = document.getElementById('share-bg-theme');
    if (bgTheme) {
      bgTheme.addEventListener('change', () => {
        if (this.sharingEmerald) this.generateShareCard(this.sharingEmerald);
      });
    }
    const priceMultiplier = document.getElementById('share-price-multiplier');
    const priceMultiplierCustom = document.getElementById('share-price-multiplier-custom');
    if (priceMultiplier && priceMultiplierCustom) {
      const updateSingleSharePrice = () => {
        let mult = 1.0;
        if (priceMultiplier.value === 'custom') {
          mult = parseFloat(priceMultiplierCustom.value);
          if (isNaN(mult)) mult = 1.0;
        } else {
          mult = parseFloat(priceMultiplier.value) || 1.0;
        }
        const origPrice = this.sharingEmerald ? (this.sharingEmerald.pricePerCarat || 0) : 0;
        const newPrice = Number((origPrice * mult).toFixed(2));
        const newDisplay = document.getElementById('share-new-price-display');
        if (newDisplay) {
          newDisplay.textContent = `₹${newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
        }
        if (this.sharingEmerald) {
          this.generateShareCard(this.sharingEmerald);
        }
      };

      priceMultiplier.addEventListener('change', () => {
        if (priceMultiplier.value === 'custom') {
          priceMultiplierCustom.style.display = 'inline-block';
          priceMultiplierCustom.value = '1.0';
        } else {
          priceMultiplierCustom.style.display = 'none';
        }
        updateSingleSharePrice();
      });

      priceMultiplierCustom.addEventListener('input', updateSingleSharePrice);
    }

    const btnExport = document.getElementById('btn-export-share-card');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (this.sharingEmerald) this.exportShareCard(this.sharingEmerald);
      });
    }

    const btnViewAccordion = document.getElementById('btn-emerald-view-accordion');
    const btnViewGrid = document.getElementById('btn-emerald-view-grid');

    if (btnViewAccordion && btnViewGrid) {
      btnViewAccordion.addEventListener('click', () => {
        this.currentViewMode = 'accordion';
        btnViewAccordion.classList.add('active');
        btnViewGrid.classList.remove('active');
        this.renderEmeraldGrid();
      });

      btnViewGrid.addEventListener('click', () => {
        this.currentViewMode = 'grid';
        btnViewGrid.classList.add('active');
        btnViewAccordion.classList.remove('active');
        this.renderEmeraldGrid();
      });
    }

    this.initImageUploader();
  },

  initImageUploader() {
    const dropzone = document.getElementById('emerald-image-dropzone');
    const fileInput = document.getElementById('emerald-image-file');
    const previewContainer = document.getElementById('emerald-uploader-preview');
    const previewImg = document.getElementById('emerald-uploaded-img-el');
    const promptContainer = document.getElementById('emerald-uploader-prompt');
    const removeBtn = document.getElementById('btn-remove-emerald-image');

    if (!dropzone || !fileInput || !previewContainer || !previewImg || !promptContainer || !removeBtn) return;

    // Open file dialog when clicking dropzone, except when clicking remove button
    dropzone.addEventListener('click', (e) => {
      if (e.target !== removeBtn) {
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', async (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await handleImageFile(files[0]);
      }
    });

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        await handleImageFile(fileInput.files[0]);
      }
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      previewImg.src = '';
      previewContainer.classList.add('hidden');
      promptContainer.classList.remove('hidden');
      if (this.activeEmeraldState) {
        this.activeEmeraldState.image = null;
      }
    });

    const self = this;
    async function handleImageFile(file) {
      if (!file.type.startsWith('image/')) {
        UI.showToast("Only image files are supported.", true);
        return;
      }
      try {
        const compressedBase64 = await UI.processImageUpload(file);
        previewImg.src = compressedBase64;
        promptContainer.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        if (!self.activeEmeraldState) {
          self.activeEmeraldState = { image: null };
        }
        self.activeEmeraldState.image = compressedBase64;
      } catch (err) {
        UI.showToast(err.message, true);
      }
    }
  },

  handleStockTypeChange() {
    const stockType = document.getElementById('emerald-stock-type').value;
    const lustreGroup = document.getElementById('emerald-lustre-group');
    const lustreInput = document.getElementById('emerald-lustre');

    if (stockType === 'Single Pieces') {
      if (lustreGroup) lustreGroup.classList.add('hidden');
      if (lustreInput) {
        lustreInput.removeAttribute('required');
        lustreInput.value = '';
      }
      document.querySelectorAll('.pudia-entry-card .pudia-lustre-group').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.pudia-entry-card .pudia-lustre-input').forEach(el => {
        el.removeAttribute('required');
        el.value = '';
      });
    } else {
      if (lustreGroup) lustreGroup.classList.remove('hidden');
      if (lustreInput) {
        lustreInput.setAttribute('required', 'required');
      }
      document.querySelectorAll('.pudia-entry-card .pudia-lustre-group').forEach(el => el.classList.remove('hidden'));
      document.querySelectorAll('.pudia-entry-card .pudia-lustre-input').forEach(el => {
        el.setAttribute('required', 'required');
      });
    }
  },

  openAddModal() {
    this.resetForm();
    this.addPudiaCard();
    document.getElementById('emerald-modal-title').textContent = "Add New Emerald Stock";

    const addBtnContainer = document.getElementById('emerald-add-pudia-btn-container');
    if (addBtnContainer) addBtnContainer.classList.remove('hidden');

    UI.openModal('modal-emerald-item');
  },

  resetForm() {
    this.activeEmeraldState = { image: null };
    document.getElementById('emerald-form').reset();
    document.getElementById('emerald-item-id').value = '';

    const stockTypeSelect = document.getElementById('emerald-stock-type');
    if (stockTypeSelect) {
      stockTypeSelect.value = 'Calibrated Series';
    }

    // Clear checked origins
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]');
    checkBoxes.forEach(cb => cb.checked = false);

    // Clear dynamic cards container
    const container = document.getElementById('emerald-pudias-list-container');
    if (container) {
      container.innerHTML = '';
    }

    this.populateGroupAutocomplete();
    this.populateShapeAutocomplete();
    this.populateMmAutocomplete();
  },

  /**
   * Build a combobox widget: an editable text input that shows a filtered
   * dropdown of known options as the user types, while still accepting any
   * custom value.
   *
   * @param {string}   fieldClass  – CSS class for the input ('size-shape' | 'size-mm')
   * @param {Function} getOptions  – called fresh on each open; returns string[]
   * @param {string}   currentVal  – initial value
   * @param {string}   placeholder – input placeholder text
   */
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
        // Highlight matching segment
        if (q) {
          const idx = o.toLowerCase().indexOf(q);
          item.innerHTML =
            UI.escapeHtml(o.slice(0, idx)) +
            '<mark>' + UI.escapeHtml(o.slice(idx, idx + q.length)) + '</mark>' +
            UI.escapeHtml(o.slice(idx + q.length));
        } else {
          item.textContent = o;
        }
        // mousedown fires before blur so we can set the value before the dropdown closes
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = o;
          closeDropdown();
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
    input.addEventListener('blur', () => setTimeout(closeDropdown, 120));

    // Allow keyboard navigation
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
  _replaceWithComboWidget(inputId, fieldClass, getOptions, placeholder) {
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
        if (q) {
          const idx = String(o).toLowerCase().indexOf(q);
          item.innerHTML =
            UI.escapeHtml(String(o).slice(0, idx)) +
            '<mark>' + UI.escapeHtml(String(o).slice(idx, idx + q.length)) + '</mark>' +
            UI.escapeHtml(String(o).slice(idx + q.length));
        } else {
          item.textContent = String(o);
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
    input.addEventListener('blur', () => setTimeout(closeDropdown, 120));

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
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    wrap.appendChild(input);
    originalInput.parentNode.replaceChild(wrap, originalInput);
  },

  /**
   * Create a dynamic size row (Shape + MM + Pcs + cts + remove button)
   */
  createSizeRow(data = { shape: '', mm: '', pieces: '', weight: '' }, targetContainer = null) {
    const container = targetContainer || document.getElementById('emerald-sizes-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'emerald-size-row';

    const numSpan = document.createElement('span');
    numSpan.className = 'size-number';
    numSpan.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-muted); text-align: center;';
    row.appendChild(numSpan);

    const shapeWidget = this._buildComboWidget(
      'size-shape',
      () => this._getKnownShapes(),
      data.shape || '',
      'e.g. Oval'
    );
    const mmWidget = this._buildComboWidget(
      'size-mm',
      () => this._getKnownMMs(),
      data.mm || '',
      'e.g. 7x5'
    );

    const piecesInput = document.createElement('input');
    piecesInput.type = 'number';
    piecesInput.className = 'size-pieces';
    piecesInput.min = '0'; piecesInput.step = '1';
    piecesInput.placeholder = '0';
    piecesInput.value = data.pieces || '';

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.className = 'size-weight';
    weightInput.min = '0'; weightInput.step = '0.01';
    weightInput.placeholder = '0.00';
    weightInput.value = data.weight || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-size';
    removeBtn.title = 'Remove this size row';
    removeBtn.innerHTML = '&times;';

    piecesInput.addEventListener('input', () => this.updateSizeTotals(container));
    weightInput.addEventListener('input', () => this.updateSizeTotals(container));
    removeBtn.addEventListener('click', () => {
      row.remove();
      this.updateSizeTotals(container);
    });

    row.appendChild(shapeWidget);
    row.appendChild(mmWidget);
    row.appendChild(piecesInput);
    row.appendChild(weightInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
    this.updateSizeTotals(container);
  },

  /**
   * Recalculate and display total Pcs and total cts from all size rows
   */
  updateSizeTotals(targetContainer = null) {
    const container = targetContainer || document.getElementById('emerald-sizes-container');
    if (!container) return;

    const parentCard = container.closest('.pudia-entry-card') || document;
    const rows = container.querySelectorAll('.emerald-size-row');
    let totalPcs = 0;
    let totalCts = 0;

    rows.forEach((row, index) => {
      const numEl = row.querySelector('.size-number');
      if (numEl) {
        numEl.textContent = index + 1;
      }
      totalPcs += Number(row.querySelector('.size-pieces').value || 0);
      totalCts += Number(row.querySelector('.size-weight').value || 0);
    });

    const pcsEl = parentCard.querySelector('.pudia-total-pcs') || document.getElementById('emerald-total-pcs');
    const ctsEl = parentCard.querySelector('.pudia-total-cts') || document.getElementById('emerald-total-cts');
    if (pcsEl) pcsEl.textContent = totalPcs;
    if (ctsEl) ctsEl.textContent = totalCts.toFixed(2);
  },

  addPudiaCard(data = null) {
    const container = document.getElementById('emerald-pudias-list-container');
    if (!container) return;

    const index = container.querySelectorAll('.pudia-entry-card').length + 1;
    const card = document.createElement('div');
    card.className = 'pudia-entry-card';

    card.innerHTML = `
      <div class="pudia-card-header">
        <h4>Pudia #<span class="pudia-card-index">${index}</span></h4>
        <button type="button" class="btn-remove-pudia">&times; Remove Pudia</button>
      </div>

      <div class="form-grid-row" style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px;">
        <div class="form-col-6" style="flex: 1; min-width: 200px;">
          <div class="input-group">
            <label>Pudia Number <span class="required">*</span></label>
            <input type="number" class="pudia-color-input" placeholder="e.g. 7" required>
          </div>
        </div>
        <div class="form-col-6" style="flex: 1; min-width: 200px;">
          <div class="input-group">
            <label>Price per Carat (₹/ct) <span class="required">*</span></label>
            <input type="number" class="pudia-price-input" step="0.01" min="0" placeholder="e.g. 15000" required>
          </div>
        </div>
      </div>

      <div class="form-grid-row" style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px;">
        <div class="form-col-6" style="flex: 1; min-width: 200px;">
          <div class="input-group pudia-lustre-group">
            <label>Lustre Grade <span class="required">*</span></label>
            <input type="text" class="pudia-lustre-input" placeholder="Select or type lustre grade..." required>
          </div>
        </div>
        <div class="form-col-6" style="flex: 1; min-width: 200px;">
          <div class="input-group">
            <label>Is it a Pair? <span class="required">*</span></label>
            <select class="pudia-pair-select" required>
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Sizes Breakdown Section inside this Pudia Card -->
      <div class="emerald-sizes-section" style="margin-bottom: 15px;">
        <span class="section-label">SIZE BREAKDOWN <span class="required">*</span></span>

        <div class="emerald-sizes-header">
          <span>#</span>
          <span>Shape</span>
          <span>MM</span>
          <span>Pcs</span>
          <span>cts (Weight)</span>
          <span></span>
        </div>

        <div class="pudia-sizes-container">
          <!-- Dynamic size rows will be appended here -->
        </div>

        <div class="emerald-sizes-totals">
          <span class="totals-label" style="grid-column: span 3; text-align: right; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted);">Total</span>
          <span class="pudia-total-pcs">0</span>
          <span class="pudia-total-cts">0.00</span>
          <span></span>
        </div>

        <button type="button" class="btn-add-size-row btn-add-pudia-size" style="margin-top: 10px;">+ Add Size Row</button>
      </div>

      <div class="input-group">
        <label>Pudia Image</label>
        <div class="image-uploader-box pudia-image-dropzone">
          <input type="file" class="pudia-image-file hidden" accept="image/*">
          <div class="pudia-uploader-prompt">
            <svg viewBox="0 0 24 24" width="32" height="32" class="upload-icon">
              <path fill="currentColor"
                d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p>Drag emerald photo here or <span>browse</span></p>
            <span class="help-text">Image will be resized & compressed locally.</span>
          </div>
          <div class="pudia-uploader-preview hidden">
            <img src="" class="pudia-uploaded-img-el" alt="Emerald Preview">
            <button type="button" class="btn-edit-img btn-edit-pudia-image" title="Crop/Edit Image">
              <svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align: middle;"><path fill="currentColor" d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>
            </button>
            <button type="button" class="btn-remove btn-remove-pudia-image">&times;</button>
          </div>
        </div>
      </div>
    `;

    // Wire up events for this specific card
    const removeBtn = card.querySelector('.btn-remove-pudia');
    removeBtn.addEventListener('click', () => {
      card.remove();
      this.updatePudiaCardIndices();
    });

    const addSizeBtn = card.querySelector('.btn-add-pudia-size');
    const sizesContainer = card.querySelector('.pudia-sizes-container');
    addSizeBtn.addEventListener('click', () => {
      this.createSizeRow({ shape: '', mm: '', pieces: '', weight: '' }, sizesContainer);
    });

    // Setup lustre datalist
    const lustreInput = card.querySelector('.pudia-lustre-input');
    lustreInput.setAttribute('list', 'emerald-lustres-list');

    // Wire up image uploader
    this.setupImageUploaderForCard(card);

    // If adding a new card and cards exist, pre-fill from previous card:
    const cards = container.querySelectorAll('.pudia-entry-card');
    if (cards.length > 0 && !data) {
      const prevCard = cards[cards.length - 1];
      const prevPrice = prevCard.querySelector('.pudia-price-input').value;
      const prevLustre = prevCard.querySelector('.pudia-lustre-input').value;
      const prevPair = prevCard.querySelector('.pudia-pair-select').value;
      const prevPudiaNum = Number(prevCard.querySelector('.pudia-color-input').value || 0);

      card.querySelector('.pudia-price-input').value = prevPrice;
      card.querySelector('.pudia-lustre-input').value = prevLustre;
      card.querySelector('.pudia-pair-select').value = prevPair;
      if (prevPudiaNum > 0) {
        card.querySelector('.pudia-color-input').value = prevPudiaNum + 1;
      }
    }

    container.appendChild(card);

    // Load custom data if provided
    if (data) {
      card.querySelector('.pudia-color-input').value = data.color || '';
      card.querySelector('.pudia-price-input').value = data.pricePerCarat || '';
      card.querySelector('.pudia-lustre-input').value = data.lustreGrade || '';
      card.querySelector('.pudia-pair-select').value = data.pair || 'No';

      if (data.image) {
        card.querySelector('.pudia-uploaded-img-el').src = data.image;
        card.querySelector('.pudia-uploader-prompt').classList.add('hidden');
        card.querySelector('.pudia-uploader-preview').classList.remove('hidden');
        card.dataset.imageUrl = data.image;
      }

      if (data.sizes && data.sizes.length > 0) {
        data.sizes.forEach(s => this.createSizeRow(s, sizesContainer));
      }
    } else {
      // Seed with one default size row
      this.createSizeRow({ shape: '', mm: '', pieces: '', weight: '' }, sizesContainer);
    }

    // Refresh display of lustre field based on top level Stock Type
    const stockType = document.getElementById('emerald-stock-type').value;
    const lustreGroup = card.querySelector('.pudia-lustre-group');
    if (stockType === 'Single Pieces') {
      lustreGroup.classList.add('hidden');
      lustreInput.removeAttribute('required');
    }

    this.updatePudiaCardIndices();
  },

  updatePudiaCardIndices() {
    const cards = document.querySelectorAll('#emerald-pudias-list-container .pudia-entry-card');
    cards.forEach((card, index) => {
      const idxSpan = card.querySelector('.pudia-card-index');
      if (idxSpan) idxSpan.textContent = index + 1;

      // Only show remove button if there is more than 1 card and we are not in edit mode
      const isEdit = !!document.getElementById('emerald-item-id').value;
      const removeBtn = card.querySelector('.btn-remove-pudia');
      if (removeBtn) {
        if (cards.length > 1 && !isEdit) {
          removeBtn.style.display = 'inline-block';
        } else {
          removeBtn.style.display = 'none';
        }
      }
    });
  },

  setupImageUploaderForCard(card) {
    const dropzone = card.querySelector('.pudia-image-dropzone');
    const fileInput = card.querySelector('.pudia-image-file');
    const previewContainer = card.querySelector('.pudia-uploader-preview');
    const previewImg = card.querySelector('.pudia-uploaded-img-el');
    const promptContainer = card.querySelector('.pudia-uploader-prompt');
    const removeBtn = card.querySelector('.btn-remove-pudia-image');

    if (!dropzone || !fileInput || !previewContainer || !previewImg || !promptContainer || !removeBtn) return;

    // Open file dialog when clicking dropzone, except when clicking remove button
    dropzone.addEventListener('click', (e) => {
      if (e.target !== removeBtn && !removeBtn.contains(e.target)) {
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', async (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await handleImageFile(files[0]);
      }
    });

    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        await handleImageFile(fileInput.files[0]);
      }
    });

    const editBtn = card.querySelector('.btn-edit-pudia-image');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentBase64 = previewImg.src;
        if (currentBase64) {
          ImageEditor.open(currentBase64, (croppedBase64) => {
            previewImg.src = croppedBase64;
            card.dataset.imageUrl = croppedBase64;
          });
        }
      });
    }

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      previewImg.src = '';
      previewContainer.classList.add('hidden');
      promptContainer.classList.remove('hidden');
      card.dataset.imageUrl = '';
    });

    const self = this;
    async function handleImageFile(file) {
      if (!file.type.startsWith('image/')) {
        UI.showToast("Only image files are supported.", true);
        return;
      }
      try {
        const compressedBase64 = await UI.processImageUpload(file);
        previewImg.src = compressedBase64;
        promptContainer.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        card.dataset.imageUrl = compressedBase64;
      } catch (err) {
        UI.showToast(err.message, true);
      }
    }
  },

  /**
   * Gather all size rows into an array of objects
   */
  gatherSizes() {
    const rows = document.querySelectorAll('.emerald-size-row');
    const sizes = [];
    rows.forEach(row => {
      // Read directly from the combobox text inputs
      const shapeInput = row.querySelector('.size-shape.size-combo-input');
      const mmInput = row.querySelector('.size-mm.size-combo-input');
      const shape = shapeInput ? shapeInput.value.trim() : '';
      const mm = mmInput ? mmInput.value.trim() : '';
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
    document.getElementById('emerald-group').value = emerald.group || '';

    const stockTypeSelect = document.getElementById('emerald-stock-type');
    if (stockTypeSelect) {
      stockTypeSelect.value = emerald.stockType || (emerald.lustreGrade ? 'Calibrated Series' : 'Single Pieces');
    }

    // Check origins
    const origins = emerald.origins || [];
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]');
    checkBoxes.forEach(cb => {
      if (origins.includes(cb.value)) {
        cb.checked = true;
      }
    });

    // Add a single card populated with the emerald's specific details
    this.addPudiaCard(emerald);

    // Hide "+ Add Another Pudia" container during edit
    const addBtnContainer = document.getElementById('emerald-add-pudia-btn-container');
    if (addBtnContainer) addBtnContainer.classList.add('hidden');

    // Also hide the "Remove Pudia" button since we must have at least one
    const removePudiaBtn = document.querySelector('.pudia-entry-card .btn-remove-pudia');
    if (removePudiaBtn) removePudiaBtn.style.display = 'none';

    document.getElementById('emerald-modal-title').textContent = "Edit Emerald Stock";
  },

  /** Collect all known unique shapes from DB + current form */
  _getKnownShapes() {
    const SEEDS = ['Octagon', 'Ovals', 'Pears', 'Marquise', 'Rounds', 'Fancy', 'Maniya', 'Beads'];
    const all = new Set(SEEDS);
    DBManager.getEmeralds().forEach(e => {
      (e.sizes || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      if (e.shape) e.shape.split(',').forEach(sh => { const t = sh.trim(); if (t) all.add(t); });
    });
    DBManager.getStones().forEach(st => {
      (st.sizes || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      if (st.shape) st.shape.split(',').forEach(sh => { const t = sh.trim(); if (t) all.add(t); });
    });
    DBManager.getItems().forEach(item => {
      (item.stones || []).forEach(s => { if (s.shape) all.add(s.shape.trim()); });
      (item.diamondsPolki || []).forEach(d => { if (d.shape) all.add(d.shape.trim()); });
    });
    // include values currently in the form (custom-typed)
    document.querySelectorAll('.emerald-size-row .size-shape-value').forEach(h => {
      const v = h.value.trim(); if (v && v !== '__other__') all.add(v);
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique MM values from DB + current form */
  _getKnownMMs() {
    const all = new Set();
    DBManager.getEmeralds().forEach(e => {
      (e.sizes || []).forEach(s => { if (s.mm) all.add(s.mm.trim()); });
    });
    DBManager.getStones().forEach(st => {
      (st.sizes || []).forEach(s => { if (s.mm) all.add(s.mm.trim()); });
    });
    document.querySelectorAll('.emerald-size-row .size-mm-value').forEach(h => {
      const v = h.value.trim(); if (v && v !== '__other__') all.add(v);
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique lustre grades from DB */
  _getKnownLustres() {
    const SEEDS = ['Lustre', 'Mota pani', 'Tas paani', 'Tas tas pani', 'P.K', 'Bluish Green (BG)'];
    const all = new Set(SEEDS);
    DBManager.getEmeralds().forEach(e => {
      if (e.lustreGrade && e.lustreGrade.trim()) all.add(e.lustreGrade.trim());
    });
    return Array.from(all).sort();
  },

  /** Collect all known unique pudia numbers from DB */
  _getKnownPudiaNumbers() {
    const all = new Set();
    DBManager.getEmeralds().forEach(e => {
      if (e.color !== undefined && e.color !== null && String(e.color).trim() !== '') {
        all.add(String(e.color).trim());
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
    DBManager.getEmeralds().forEach(e => {
      if (e.group && e.group.trim()) all.add(e.group.trim());
    });
    return Array.from(all).sort();
  },

  /**
   * No-op kept for call-site compatibility.
   * The combobox widgets fetch fresh options on every open via _getKnownShapes().
   */
  populateShapeAutocomplete() { },

  /**
   * No-op kept for call-site compatibility.
   * The combobox widgets fetch fresh options on every open via _getKnownMMs().
   */
  populateMmAutocomplete() { },

  populateGroupAutocomplete() { },

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

  getFilteredEmeralds() {
    const query = document.getElementById('emerald-search-input').value.toLowerCase().trim();
    const filterGroup = document.getElementById('emerald-filter-group').value;
    const filterShape = document.getElementById('emerald-filter-shape').value;
    const filterLustre = document.getElementById('emerald-filter-lustre').value;
    const filterOrigin = document.getElementById('emerald-filter-origin').value;

    const allEmeralds = DBManager.getEmeralds();

    return allEmeralds.filter(e => {
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
  },

  renderEmeraldGrid() {
    const gridContainer = document.getElementById('emerald-catalog-grid');
    const flatContainer = document.getElementById('emerald-flat-grid');
    const emptyState = document.getElementById('emerald-empty-state');
    if (!gridContainer || !flatContainer || !emptyState) return;

    const catalogApplyMultiplier = document.getElementById('catalog-apply-multiplier');
    const catalogMultiplierSelect = document.getElementById('catalog-multiplier-select');
    const catalogMultiplierCustom = document.getElementById('catalog-multiplier-custom');

    let globalMultiplier = 1.0;
    let isMultiplierEnabled = false;

    if (catalogApplyMultiplier && catalogApplyMultiplier.checked) {
      isMultiplierEnabled = true;
      if (catalogMultiplierSelect.value === 'custom') {
        globalMultiplier = parseFloat(catalogMultiplierCustom.value);
        if (isNaN(globalMultiplier)) globalMultiplier = 1.0;
      } else {
        globalMultiplier = parseFloat(catalogMultiplierSelect.value) || 1.0;
      }
    }

    // Dynamically populate group filter options
    this.populateGroupFilterOptions();

    let filtered = this.getFilteredEmeralds();
    const sortVal = document.getElementById('emerald-sort-items').value;

    // Clear both containers
    gridContainer.innerHTML = '';
    flatContainer.innerHTML = '';

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      flatContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    if (this.currentViewMode === 'grid') {
      gridContainer.classList.add('hidden');
      flatContainer.classList.remove('hidden');

      // Sort flat array
      if (sortVal === 'weight-high' || sortVal === 'size-high') {
        filtered.sort((a, b) => this.getEmeraldWeight(b) - this.getEmeraldWeight(a));
      } else if (sortVal === 'weight-low' || sortVal === 'size-low') {
        filtered.sort((a, b) => this.getEmeraldWeight(a) - this.getEmeraldWeight(b));
      } else if (sortVal === 'price-high') {
        filtered.sort((a, b) => (b.pricePerCarat || 0) - (a.pricePerCarat || 0));
      } else if (sortVal === 'price-low') {
        filtered.sort((a, b) => (a.pricePerCarat || 0) - (b.pricePerCarat || 0));
      } else if (sortVal === 'color-high') {
        filtered.sort((a, b) => Number(b.color || 0) - Number(a.color || 0));
      } else if (sortVal === 'color-low') {
        filtered.sort((a, b) => Number(a.color || 0) - Number(b.color || 0));
      } else {
        filtered.sort((a, b) => (a.group || '').localeCompare(b.group || '') || Number(a.color || 0) - Number(b.color || 0));
      }

      // Render flat cards
      filtered.forEach(item => {
        const card = this.createFlatPudiaCard(item, isMultiplierEnabled, globalMultiplier);
        flatContainer.appendChild(card);
      });
      return;
    }

    gridContainer.classList.remove('hidden');
    flatContainer.classList.add('hidden');

    gridContainer.classList.remove('emerald-grouped-container'); // Clean up any layout overrides if present
    gridContainer.style.display = 'flex'; // Ensure standard vertical accordion layout

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
        const isSinglePieces = item.stockType === 'Single Pieces';
        const gradeName = isSinglePieces ? 'Single Pieces' : ((item.lustreGrade && item.lustreGrade.trim()) ? item.lustreGrade.trim() : "Unassigned Grade");
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
      groupHeader.style.cssText = 'cursor: pointer; padding: 12px 16px; user-select: none; background-color: var(--bg-card);';

      const groupHeaderHtml = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          <span class="group-expand-icon" style="font-family: monospace; font-size: 13px; width: 14px; color: var(--text-muted); flex-shrink: 0;">▶</span>
          <span style="font-weight: 700; font-size: 15px; color: var(--text-main); font-family: var(--font-serif);">${UI.escapeHtml(group.name)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-left: 24px;">
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text-muted);">Weight: <strong style="color: var(--text-main);">${group.totalWeight.toFixed(2)} cts</strong></span>
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text-muted);">Value: <strong style="color: var(--text-gold-dark);">₹${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
          <span style="background-color: var(--bg-base); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--text-main);">${group.items.length} Pudias</span>
          <button type="button" class="btn btn-danger btn-small btn-delete-group" style="padding: 2px 8px; font-size: 11px; margin-left: auto;" title="Delete Entire Group">Delete</button>
        </div>`;

      groupHeader.innerHTML = groupHeaderHtml;
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
          const totalValueInr = Number((totalWeight * pricePerCaratInr).toFixed(2));

          let rateHtml = `₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
          let valueHtml = `₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (isMultiplierEnabled) {
            const discountedRate = Number((pricePerCaratInr * globalMultiplier).toFixed(2));
            const discountedValue = Number((totalWeight * discountedRate).toFixed(2));
            rateHtml = `<span style="text-decoration: line-through; opacity: 0.6;">₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> → <strong style="color: var(--text-gold-dark); font-weight: 700;">₹${discountedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>/ct`;
            valueHtml = `<span style="text-decoration: line-through; opacity: 0.6;">₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> → <strong style="color: var(--text-gold-dark); font-weight: 700;">₹${discountedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
          }

          const pudiaStatsCol = `<div style="display: flex; align-items: center; gap: 15px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap;">
            <span>Weight: <strong style="color: var(--text-main);">${totalWeight.toFixed(2)} cts</strong></span>
            <span>Pcs: <strong style="color: var(--text-main);">${totalPieces}</strong></span>
            <span>Rate: <strong style="color: var(--text-main);">${rateHtml}</strong></span>
            <span>Value: <strong style="color: var(--text-gold-dark);">${valueHtml}</strong></span>
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
          const pricePerCaratUsd = Number((usdRate > 0 ? pricePerCaratInr / usdRate : 0).toFixed(2));
          const totalValueUsd = Number((usdRate > 0 ? totalValueInr / usdRate : 0).toFixed(2));

          let usdPriceDisplay = `$${pricePerCaratUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          let usdValueDisplay = `$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (isMultiplierEnabled) {
            const discountedRate = Number((pricePerCaratInr * globalMultiplier).toFixed(2));
            const discountedValue = Number((totalWeight * discountedRate).toFixed(2));
            const discountedPriceUsd = Number((usdRate > 0 ? discountedRate / usdRate : 0).toFixed(2));
            const discountedValueUsd = Number((usdRate > 0 ? discountedValue / usdRate : 0).toFixed(2));

            usdPriceDisplay = `<span style="text-decoration: line-through; opacity: 0.6;">$${pricePerCaratUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> → <strong style="color: var(--text-gold-dark); font-weight: 700;">$${discountedPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
            usdValueDisplay = `<span style="text-decoration: line-through; opacity: 0.6;">$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> → <strong style="color: var(--text-gold-dark); font-weight: 700;">$${discountedValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
          }

          const dollarPriceHtml = usdRate > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 8px 15px; margin-top: 10px; padding: 8px; border: 1px dashed var(--border-light); background-color: var(--bg-card); font-size: 11px;">
              <div><strong>Price/ct (USD):</strong> ${usdPriceDisplay}</div>
              <div><strong>Value (USD):</strong> ${usdValueDisplay}</div>
            </div>
          ` : '';

          let imageColHtml = '';
          if (item.image) {
            imageColHtml = `
              <div style="display: flex; flex-direction: column; gap: 8px; align-items: center; max-width: 150px; width: 100%;">
                <img src="${item.image}" alt="Pudia #${item.color}" style="max-width: 150px; max-height: 120px; border-radius: 4px; border: 1px solid var(--border-light); object-fit: cover; cursor: pointer;" class="pudia-image-preview">
                <button type="button" class="btn btn-secondary btn-small btn-share-image" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px; font-size: 11px;" title="Share Image with overlay details">
                  <svg viewBox="0 0 24 24" width="12" height="12">
                    <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                  </svg>
                  Share Card
                </button>
              </div>
            `;
          } else {
            imageColHtml = `
              <div style="display: flex; flex-direction: column; gap: 8px; align-items: center; max-width: 150px; width: 100%;">
                <div style="width: 150px; height: 100px; border-radius: 4px; border: 1px dashed var(--border-light); background-color: var(--bg-card); display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 11px; text-align: center; padding: 10px;">
                  No Photo
                </div>
                <button type="button" class="btn btn-secondary btn-small btn-share-image" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px; font-size: 11px;" title="Create share card with details">
                  <svg viewBox="0 0 24 24" width="12" height="12">
                    <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                  </svg>
                  Share Card
                </button>
              </div>
            `;
          }

          pudiaBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; align-items: center;">
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Specifications</div>
                <div style="font-size: 13px; line-height: 1.6;">
                  <div><strong>Stock Type:</strong> ${item.stockType || 'Calibrated Series'}</div>
                  <div><strong>Pair:</strong> ${item.pair || 'No'}</div>
                  <div><strong>Origin:</strong> ${originsStr || 'None'}</div>
                  <div><strong>Shape:</strong> ${shapesDisplay}</div>
                  ${item.stockType !== 'Single Pieces' ? `<div><strong>Lustre Grade:</strong> ${UI.escapeHtml(item.lustreGrade || 'N/A')}</div>` : ''}
                </div>
                ${dollarPriceHtml}
              </div>
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Sizes Breakdown</div>
                ${sizesHtml || `<div style="font-size: 13px;"><strong>Weight:</strong> ${totalWeight} carats</div>`}
              </div>
              <div style="display: flex; justify-content: center; align-items: center;">
                ${imageColHtml}
              </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px; border-top: 1px solid var(--border-light); padding-top: 12px;">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit Details</button>
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

          const btnShare = pudiaBody.querySelector('.btn-share-image');
          if (btnShare) {
            btnShare.addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.openShareModal(item);
            });
          }

          const imgPreview = pudiaBody.querySelector('.pudia-image-preview');
          if (imgPreview) {
            imgPreview.addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.openShareModal(item);
            });
          }

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
    const stockType = document.getElementById('emerald-stock-type').value;
    const group = document.getElementById('emerald-group').value.trim();

    // Gather checked origins
    const checkBoxes = document.querySelectorAll('input[name="emerald-origin"]:checked');
    const origins = Array.from(checkBoxes).map(cb => cb.value);

    // Validation for shared fields
    if (!group) {
      UI.showToast("Please specify a Group / Lot Name.", true);
      return;
    }
    if (origins.length === 0) {
      UI.showToast("Please select at least one Origin.", true);
      return;
    }

    const pudiaCards = document.querySelectorAll('.pudia-entry-card');
    if (pudiaCards.length === 0) {
      UI.showToast("Please add at least one Pudia to save.", true);
      return;
    }

    const isEdit = !!document.getElementById('emerald-item-id').value;

    const savedPudias = [];
    let validationError = null;

    pudiaCards.forEach((card, idx) => {
      if (validationError) return;

      const pudiaIndexStr = `Pudia #${idx + 1}`;
      const color = Number(card.querySelector('.pudia-color-input').value || 0);
      const pricePerCarat = Number(Number(card.querySelector('.pudia-price-input').value || 0).toFixed(2));
      const lustreGrade = stockType === 'Single Pieces' ? '' : card.querySelector('.pudia-lustre-input').value.trim();
      const pair = card.querySelector('.pudia-pair-select').value;
      const image = card.dataset.imageUrl || null;

      // Sizes for this card
      const sizesContainer = card.querySelector('.pudia-sizes-container');
      const sizes = [];
      const rows = sizesContainer.querySelectorAll('.emerald-size-row');
      rows.forEach(row => {
        const shapeInput = row.querySelector('.size-shape.size-combo-input');
        const mmInput = row.querySelector('.size-mm.size-combo-input');
        const shape = shapeInput ? shapeInput.value.trim() : '';
        const mm = mmInput ? mmInput.value.trim() : '';
        const pieces = Number(row.querySelector('.size-pieces').value || 0);
        const weight = Number(row.querySelector('.size-weight').value || 0);
        if (shape || mm || pieces > 0 || weight > 0) {
          sizes.push({ shape, mm, pieces, weight });
        }
      });

      const totalWeight = sizes.reduce((sum, s) => sum + s.weight, 0);

      // Validate
      if (sizes.length === 0) {
        validationError = `${pudiaIndexStr}: Please add at least one size row with Shape, MM, Pcs, and Weight.`;
        return;
      }
      const hasInvalidRow = sizes.some(s => !s.shape || !s.mm || s.pieces <= 0 || s.weight <= 0);
      if (hasInvalidRow) {
        validationError = `${pudiaIndexStr}: Each size row must have a Shape, MM, Pcs (>0), and Weight (>0).`;
        return;
      }
      if (isNaN(color) || color <= 0) {
        validationError = `${pudiaIndexStr}: Please specify a valid Pudia Number.`;
        return;
      }
      if (pricePerCarat <= 0) {
        validationError = `${pudiaIndexStr}: Price per carat must be greater than 0.`;
        return;
      }
      if (stockType === 'Calibrated Series' && !lustreGrade) {
        validationError = `${pudiaIndexStr}: Please specify a Lustre Grade.`;
        return;
      }

      const dbDuplicates = DBManager.getEmeralds().filter(e => 
        (e.group || 'Default').toLowerCase() === group.toLowerCase() && 
        e.color === color &&
        (!isEdit || String(e.id) !== String(document.getElementById('emerald-item-id').value))
      );
      if (dbDuplicates.length > 0) {
        validationError = `${pudiaIndexStr}: Pudia Number #${color} already exists in Group "${group}".`;
        return;
      }

      const batchDuplicates = savedPudias.filter(p => p.color === color);
      if (batchDuplicates.length > 0) {
        validationError = `${pudiaIndexStr}: Duplicate Pudia Number #${color} in the current batch.`;
        return;
      }

      const shapes = Array.from(new Set(sizes.map(s => s.shape).filter(Boolean)));

      const parsedPudia = {
        id: isEdit ? document.getElementById('emerald-item-id').value : 'emerald_' + (Date.now() + idx),
        stockType,
        sizes,
        weight: Number(totalWeight.toFixed(3)),
        shape: shapes.join(', '),
        lustreGrade,
        color,
        pricePerCarat,
        pair,
        group,
        origins,
        image,
        createdAt: isEdit ? this.activeEmeraldState.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      savedPudias.push(parsedPudia);
    });

    if (validationError) {
      UI.showToast(validationError, true);
      return;
    }

    try {
      if (isEdit) {
        // Edit flow
        const updatedPudia = savedPudias[0];
        const changes = Logs.diffItem(this.activeEmeraldState, updatedPudia);
        const shapes = updatedPudia.shape.split(', ').filter(Boolean);
        const summary = Logs.buildSummary(changes, `Updated Emerald: ${shapes.join(', ')} (${updatedPudia.weight}ct)`);

        DBManager.addLog("EDIT", updatedPudia.id, `Emerald (${shapes.join(', ')})`, summary, changes);

        const index = DBManager.database.emeralds.findIndex(e => String(e.id) === String(updatedPudia.id));
        if (index !== -1) {
          DBManager.database.emeralds[index] = updatedPudia;
        }
        UI.showToast("Emerald stock updated successfully!");
      } else {
        // Add flow (could be 1 or multiple!)
        savedPudias.forEach(p => {
          const shapes = p.shape.split(', ').filter(Boolean);
          DBManager.addLog("ADD", p.id, `Emerald (${shapes.join(', ')})`, `Added new emerald stock: ${shapes.join(', ')} (${p.weight}ct)`, []);
          DBManager.database.emeralds.push(p);
        });
        UI.showToast(`Successfully added ${savedPudias.length} Pudia(s) to Group "${group}"!`);
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

        const index = DBManager.database.emeralds.findIndex(e => String(e.id) === String(emerald.id));
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
  },

  openPrintModal() {
    this.populatePrintGroupsAndGrades();
    this.populatePrintPudiasChecklist();
    UI.openModal('modal-print-emerald');
  },

  populatePrintGroupsAndGrades() {
    const groupSelect = document.getElementById('print-select-group');
    const gradeSelect = document.getElementById('print-select-grade');
    if (!groupSelect || !gradeSelect) return;

    const allEmeralds = DBManager.getEmeralds();
    const groups = new Set();
    const grades = new Set();

    allEmeralds.forEach(e => {
      if (e.group && e.group.trim()) groups.add(e.group.trim());
      if (e.lustreGrade && e.lustreGrade.trim()) grades.add(e.lustreGrade.trim());
    });

    groupSelect.innerHTML = '<option value="">All Groups</option>';
    Array.from(groups).sort().forEach(g => {
      groupSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    gradeSelect.innerHTML = '<option value="">All Grades</option>';
    Array.from(grades).sort().forEach(g => {
      gradeSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });
  },

  populatePrintPudiasChecklist() {
    const container = document.getElementById('print-pudias-list-container');
    if (!container) return;
    container.innerHTML = '';

    const selectedGroup = document.getElementById('print-select-group').value;
    const selectedGrade = document.getElementById('print-select-grade').value;

    const allEmeralds = DBManager.getEmeralds();
    const filtered = allEmeralds.filter(e => {
      const groupName = e.group || '';
      const gradeName = e.lustreGrade || '';
      const matchesGroup = !selectedGroup || groupName === selectedGroup;
      const matchesGrade = !selectedGrade || gradeName === selectedGrade;
      return matchesGroup && matchesGrade;
    });

    // Sort by Pudia number
    filtered.sort((a, b) => Number(a.color || 0) - Number(b.color || 0));

    if (filtered.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); grid-column: 1/-1;">No Pudias found for these criteria.</div>';
      return;
    }

    filtered.forEach(e => {
      const weight = this.getEmeraldWeight(e);
      const label = document.createElement('label');
      label.className = 'print-pudia-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" class="print-pudia-checkbox" value="${e.id}" checked>
        #${e.color || 'N/A'} (${weight.toFixed(2)}ct)
      `;
      container.appendChild(label);
    });
  },

  handlePrintGroupChange() {
    const groupSelect = document.getElementById('print-select-group');
    const gradeSelect = document.getElementById('print-select-grade');
    if (!groupSelect || !gradeSelect) return;

    const selectedGroup = groupSelect.value;
    const allEmeralds = DBManager.getEmeralds();
    const grades = new Set();

    allEmeralds.forEach(e => {
      const groupName = e.group || '';
      if (!selectedGroup || groupName === selectedGroup) {
        if (e.lustreGrade && e.lustreGrade.trim()) {
          grades.add(e.lustreGrade.trim());
        }
      }
    });

    const currentGrade = gradeSelect.value;
    gradeSelect.innerHTML = '<option value="">All Grades</option>';
    Array.from(grades).sort().forEach(g => {
      gradeSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    if (grades.has(currentGrade)) {
      gradeSelect.value = currentGrade;
    }

    this.populatePrintPudiasChecklist();
  },

  handlePrintGradeChange() {
    this.populatePrintPudiasChecklist();
  },

  toggleAllPrintPudias(checked) {
    const checkBoxes = document.querySelectorAll('.print-pudia-checkbox');
    checkBoxes.forEach(cb => cb.checked = checked);
  },

  printFromSelection() {
    const checkedBoxes = document.querySelectorAll('.print-pudia-checkbox:checked');
    if (checkedBoxes.length === 0) {
      UI.showToast("Please select at least one Pudia to print.", true);
      return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const allEmeralds = DBManager.getEmeralds();
    const filtered = allEmeralds.filter(e => selectedIds.includes(e.id));

    // Sort and group for report printing
    const groups = {};
    let grandTotalWeight = 0;
    let grandTotalValue = 0;
    let grandTotalPieces = 0;

    filtered.forEach(e => {
      const groupName = (e.group && e.group.trim()) ? e.group.trim() : "Unassigned Group";
      if (!groups[groupName]) {
        groups[groupName] = {
          name: groupName,
          items: [],
          totalWeight: 0,
          totalValue: 0,
          totalPieces: 0
        };
      }

      const w = this.getEmeraldWeight(e);
      const pcs = this.getEmeraldPieces(e);
      const val = w * (e.pricePerCarat || 0);

      groups[groupName].items.push(e);
      groups[groupName].totalWeight += w;
      groups[groupName].totalValue += val;
      groups[groupName].totalPieces += pcs;

      grandTotalWeight += w;
      grandTotalValue += val;
      grandTotalPieces += pcs;
    });

    const sortedGroupNames = Object.keys(groups).sort();

    let html = `
      <div class="print-header">
        <h1>Mava Gems &mdash; Emerald Stock Report</h1>
        <div class="meta-row">
          <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
          <div><strong>Selection Details:</strong> Hand-selected ${filtered.length} stock item(s) to print.</div>
        </div>
      </div>

      <div class="print-summary-cards">
        <div class="print-summary-card">
          <span class="label">Total Weight</span>
          <span class="value">${grandTotalWeight.toFixed(2)} cts</span>
        </div>
        <div class="print-summary-card">
          <span class="label">Total Pieces</span>
          <span class="value">${grandTotalPieces} pcs</span>
        </div>
        <div class="print-summary-card">
          <span class="label">Total Valuation (INR)</span>
          <span class="value">₹${grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    `;

    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    if (usdRate > 0) {
      const grandTotalValueUsd = grandTotalValue / usdRate;
      html += `
        <div class="print-summary-card">
          <span class="label">Total Valuation (USD)</span>
          <span class="value">$${grandTotalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      `;
    }

    html += `
        <div class="print-summary-card">
          <span class="label">Pudias Count</span>
          <span class="value">${filtered.length}</span>
        </div>
      </div>
    `;

    sortedGroupNames.forEach(groupName => {
      const group = groups[groupName];
      group.items.sort((a, b) => {
        const gradeA = a.lustreGrade || '';
        const gradeB = b.lustreGrade || '';
        const gradeCompare = gradeA.localeCompare(gradeB);
        if (gradeCompare !== 0) return gradeCompare;
        return Number(a.color || 0) - Number(b.color || 0);
      });

      html += `
        <h3 style="font-family: Georgia, serif; margin-top: 25px; margin-bottom: 8px; border-bottom: 1px solid #000000; padding-bottom: 4px; display: flex; justify-content: space-between; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">
          <span>Group: <strong>${UI.escapeHtml(groupName)}</strong></span>
          <span style="font-size: 11px; font-weight: normal; color: #333333; text-transform: none; letter-spacing: normal;">
            Weight: <strong>${group.totalWeight.toFixed(2)} cts</strong> | 
            Value: <strong>₹${group.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </span>
        </h3>
        
        <table class="print-table">
          <thead>
            <tr>
              <th style="width: 10%;">Pudia #</th>
              <th style="width: 15%;">Grade</th>
              <th style="width: 8%;">Pair</th>
              <th style="width: 12%;">Origin</th>
              <th style="width: 25%;">Sizes & Shapes Breakdown</th>
              <th style="width: 8%; text-align: right;">Pcs</th>
              <th style="width: 10%; text-align: right;">Weight (cts)</th>
              <th style="width: 12%; text-align: right;">Rate / ct</th>
              <th style="width: 15%; text-align: right;">Total Value</th>
            </tr>
          </thead>
          <tbody>
      `;

      group.items.forEach(item => {
        const weight = this.getEmeraldWeight(item);
        const pieces = this.getEmeraldPieces(item);
        const val = weight * (item.pricePerCarat || 0);
        const origins = (item.origins || []).join(', ');

        let sizesList = '';
        if (item.sizes && item.sizes.length > 0) {
          sizesList = '<ul class="print-sizes-list">';
          item.sizes.forEach(s => {
            sizesList += `<li>${UI.escapeHtml(s.shape)} ${UI.escapeHtml(s.mm)} (${s.pieces} pcs / ${Number(s.weight).toFixed(2)} cts)</li>`;
          });
          sizesList += '</ul>';
        } else {
          sizesList = UI.escapeHtml(item.shape || 'N/A');
        }

        html += `
          <tr>
            <td><strong>#${item.color || 'N/A'}</strong></td>
            <td>${UI.escapeHtml(item.lustreGrade || 'N/A')}</td>
            <td>${item.pair || 'No'}</td>
            <td>${UI.escapeHtml(origins)}</td>
            <td>${sizesList}</td>
            <td style="text-align: right;">${pieces}</td>
            <td style="text-align: right;">${weight.toFixed(2)}</td>
            <td style="text-align: right;">₹${(item.pricePerCarat || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: right;"><strong>₹${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    });

    const doc = this.generatePDF(filtered);
    this.activePdfDocument = doc;
    // Clear jewelry catalog's active PDF so the shared save button picks this one
    if (window.Catalog) window.Catalog.activePdfDocument = null;

    const iframe = document.getElementById('print-preview-iframe');
    if (iframe) {
      iframe.src = doc.output('datauristring');
    }
    UI.closeModal('modal-print-emerald');
    UI.openModal('modal-print-preview');
  },
  activePdfDocument: null,

  generatePDF(filtered) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PAGE_W = 210;
    const MARGIN = 12;
    const TABLE_W = PAGE_W - MARGIN * 2;
    const PAGE_H = 297;
    const FOOTER_H = 18;
    const SAFE_BOTTOM = PAGE_H - FOOTER_H;

    // Column layout (matches screenshot: # | Shape | MM | Pcs | cts | @/Ct | Grade)
    const COL = {
      num: { x: MARGIN, w: 14 },
      shape: { x: MARGIN + 14, w: 30 },
      mm: { x: MARGIN + 44, w: 28 },
      pcs: { x: MARGIN + 72, w: 18 },
      cts: { x: MARGIN + 90, w: 22 },
      rate: { x: MARGIN + 112, w: 30 },
      grade: { x: MARGIN + 142, w: TABLE_W - 142 },
    };

    const ROW_H = 6.5;
    const HEAD_H = 6;

    let pageNum = 1;

    const drawPageHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.text('MAVA GEMS \u2014 EMERALD STOCK REPORT', MARGIN, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleString()}   |   Total Pudias: ${filtered.length}`, MARGIN, 19);
      doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, 19, { align: 'right' });
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, 21, PAGE_W - MARGIN, 21);
    };

    const drawColHeaders = (headerY) => {
      doc.setFillColor(235, 235, 235);
      doc.rect(MARGIN, headerY, TABLE_W, HEAD_H, 'F');

      // Draw header borders
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, headerY, PAGE_W - MARGIN, headerY);
      doc.line(MARGIN, headerY + HEAD_H, PAGE_W - MARGIN, headerY + HEAD_H);

      // Vertical borders inside header
      doc.line(COL.num.x, headerY, COL.num.x, headerY + HEAD_H);
      doc.line(COL.shape.x, headerY, COL.shape.x, headerY + HEAD_H);
      doc.line(COL.mm.x, headerY, COL.mm.x, headerY + HEAD_H);
      doc.line(COL.pcs.x, headerY, COL.pcs.x, headerY + HEAD_H);
      doc.line(COL.cts.x, headerY, COL.cts.x, headerY + HEAD_H);
      doc.line(COL.rate.x, headerY, COL.rate.x, headerY + HEAD_H);
      doc.line(COL.grade.x, headerY, COL.grade.x, headerY + HEAD_H);
      doc.line(PAGE_W - MARGIN, headerY, PAGE_W - MARGIN, headerY + HEAD_H);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      const textY = headerY + HEAD_H - 1.8;

      // Column texts
      doc.text('#', COL.num.x + COL.num.w / 2, textY, { align: 'center' });
      doc.text('Shape', COL.shape.x + 2, textY);
      doc.text('MM', COL.mm.x + 2, textY);
      doc.text('Pcs', COL.pcs.x + COL.pcs.w - 2, textY, { align: 'right' });
      doc.text('cts', COL.cts.x + COL.cts.w - 2, textY, { align: 'right' });
      doc.text('@/Ct', COL.rate.x + COL.rate.w / 2, textY, { align: 'center' });
      doc.text('Grade', COL.grade.x + COL.grade.w / 2, textY, { align: 'center' });
    };

    drawPageHeader();
    drawColHeaders(23);
    let y = 23 + HEAD_H; // 29

    const checkPageBreak = (neededHeight) => {
      if (y + neededHeight > SAFE_BOTTOM) {
        doc.addPage();
        pageNum++;
        drawPageHeader();
        drawColHeaders(23);
        y = 23 + HEAD_H;
        return true;
      }
      return false;
    };

    // Group the items by group name
    const groups = {};
    filtered.forEach(item => {
      const g = item.group || 'Other';
      if (!groups[g]) {
        groups[g] = [];
      }
      groups[g].push(item);
    });

    let grandTotalWeight = 0;
    let grandTotalValue = 0;
    let grandTotalPieces = 0;

    Object.keys(groups).forEach(groupName => {
      const items = groups[groupName];

      let groupPieces = 0;
      let groupWeight = 0;
      let groupValue = 0;

      // Group header banner
      checkPageBreak(15);
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, y, TABLE_W, 6, 'F');
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, y, TABLE_W, 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(50);
      doc.text(`GROUP: ${groupName.toUpperCase()}`, MARGIN + 2, y + 4.2);
      y += 8;

      items.forEach(item => {
        // Build flat sizes list for this pudia
        const sizes = [];
        if (item.sizes && item.sizes.length > 0) {
          const shapesOrder = [];
          const shapeGroups = {};
          item.sizes.forEach(s => {
            const sh = s.shape || 'N/A';
            if (!shapeGroups[sh]) {
              shapeGroups[sh] = [];
              shapesOrder.push(sh);
            }
            shapeGroups[sh].push(s);
          });

          shapesOrder.forEach(sh => {
            shapeGroups[sh].forEach(s => {
              sizes.push({
                shape: sh,
                mm: s.mm || 'N/A',
                pieces: Number(s.pieces || 0),
                weight: Number(s.weight || 0)
              });
            });
          });
        } else {
          sizes.push({
            shape: 'N/A',
            mm: 'N/A',
            pieces: this.getEmeraldPieces(item),
            weight: this.getEmeraldWeight(item)
          });
        }

        const numRows = sizes.length;
        const neededHeight = (numRows + 1) * ROW_H + 2; // Rows + Total Row + spacing

        checkPageBreak(neededHeight);

        if (y > 23 + HEAD_H + 0.1) {
          y += 2;
        }

        const startY = y;
        const totalRowY = startY + numRows * ROW_H;

        // Draw horizontal grid lines inside breakdown rows
        for (let i = 0; i < numRows; i++) {
          const s = sizes[i];
          const rowY = startY + i * ROW_H;

          // Inside lines
          if (i > 0) {
            doc.setDrawColor(200);
            doc.setLineWidth(0.2);
            const prevS = sizes[i - 1];
            if (s.shape !== prevS.shape) {
              // Line across Shape, MM, Pcs, cts
              doc.line(COL.shape.x, rowY, COL.cts.x + COL.cts.w, rowY);
            } else {
              // Line across MM, Pcs, cts only
              doc.line(COL.mm.x, rowY, COL.cts.x + COL.cts.w, rowY);
            }
          }

          // Draw text for MM, Pcs, cts
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(0);
          const textY = rowY + ROW_H - 2.2;

          doc.text(String(s.mm), COL.mm.x + 2, textY);
          doc.text(String(s.pieces), COL.pcs.x + COL.pcs.w - 2, textY, { align: 'right' });
          doc.text(Number(s.weight).toFixed(2), COL.cts.x + COL.cts.w - 2, textY, { align: 'right' });
        }

        // Draw spanned Pudia Number (Column 1)
        const pudiaLabel = `#${item.color || 'N/A'}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(pudiaLabel, COL.num.x + COL.num.w / 2, startY + (numRows * ROW_H) / 2 + 1, { align: 'center' });

        // Group shape segments for Column 2 spans
        const shapeSegments = [];
        let currentShape = null;
        let segmentStart = 0;
        for (let r = 0; r <= numRows; r++) {
          const sh = r < numRows ? sizes[r].shape : null;
          if (sh !== currentShape) {
            if (currentShape !== null) {
              shapeSegments.push({
                shape: currentShape,
                startRow: segmentStart,
                rowCount: r - segmentStart
              });
            }
            currentShape = sh;
            segmentStart = r;
          }
        }

        shapeSegments.forEach(seg => {
          const segStartY = startY + seg.startRow * ROW_H;
          const segHeight = seg.rowCount * ROW_H;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(seg.shape, COL.shape.x + COL.shape.w / 2, segStartY + segHeight / 2 + 1, { align: 'center' });
        });

        // Draw spanned Rate (Column 6)
        const rateVal = item.pricePerCarat || 0;
        const rateLabel = rateVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(rateLabel, COL.rate.x + COL.rate.w / 2, startY + (numRows * ROW_H) / 2 + 1, { align: 'center' });

        // Draw spanned Grade (Column 7)
        const gradeLabel = item.lustreGrade || 'N/A';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(gradeLabel, COL.grade.x + COL.grade.w / 2, startY + (numRows * ROW_H) / 2 + 1, { align: 'center' });

        // Calculate Totals for this pudia
        const totalPcs = sizes.reduce((sum, s) => sum + s.pieces, 0);
        const totalWeight = sizes.reduce((sum, s) => sum + s.weight, 0);
        const totalValue = totalWeight * rateVal;

        // Draw horizontal line above Total Row
        doc.setDrawColor(120);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, totalRowY, PAGE_W - MARGIN, totalRowY);

        // Draw Total row text
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0);
        const totalTextY = totalRowY + ROW_H - 2.2;

        doc.text('Total', COL.mm.x + COL.mm.w - 2, totalTextY, { align: 'right' });
        doc.text(String(totalPcs), COL.pcs.x + COL.pcs.w - 2, totalTextY, { align: 'right' });
        doc.text(totalWeight.toFixed(2), COL.cts.x + COL.cts.w - 2, totalTextY, { align: 'right' });

        const valLabel = totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        doc.text(valLabel, COL.rate.x + COL.rate.w - 2, totalTextY, { align: 'right' });

        // Draw the bottom border line of the pudia table
        doc.line(MARGIN, totalRowY + ROW_H, PAGE_W - MARGIN, totalRowY + ROW_H);

        // Draw grid vertical lines
        doc.line(MARGIN, startY, MARGIN, totalRowY + ROW_H);
        doc.line(PAGE_W - MARGIN, startY, PAGE_W - MARGIN, totalRowY + ROW_H);
        doc.line(COL.shape.x, startY, COL.shape.x, totalRowY);
        doc.line(COL.mm.x, startY, COL.mm.x, totalRowY);
        doc.line(COL.pcs.x, startY, COL.pcs.x, totalRowY + ROW_H);
        doc.line(COL.cts.x, startY, COL.cts.x, totalRowY + ROW_H);
        doc.line(COL.rate.x, startY, COL.rate.x, totalRowY + ROW_H);
        doc.line(COL.grade.x, startY, COL.grade.x, totalRowY + ROW_H);

        // Update group totals
        groupPieces += totalPcs;
        groupWeight += totalWeight;
        groupValue += totalValue;

        grandTotalPieces += totalPcs;
        grandTotalWeight += totalWeight;
        grandTotalValue += totalValue;

        // Draw top border line of the pudia table
        doc.line(MARGIN, startY, PAGE_W - MARGIN, startY);

        y = totalRowY + ROW_H;
      });

      // Group Subtotal Row
      checkPageBreak(ROW_H + 4);

      // Draw background
      doc.setFillColor(242, 245, 248);
      doc.rect(MARGIN, y, TABLE_W, ROW_H, 'F');

      // Draw borders
      doc.setDrawColor(120);
      doc.setLineWidth(0.35);
      doc.rect(MARGIN, y, TABLE_W, ROW_H);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      const subTextY = y + ROW_H - 2.2;

      doc.text(`Subtotal (${groupName})`, COL.shape.x, subTextY);
      doc.text(String(groupPieces), COL.pcs.x + COL.pcs.w - 2, subTextY, { align: 'right' });
      doc.text(groupWeight.toFixed(2), COL.cts.x + COL.cts.w - 2, subTextY, { align: 'right' });

      const subValLabel = groupValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(subValLabel, COL.rate.x + COL.rate.w - 2, subTextY, { align: 'right' });

      y += ROW_H + 4; // Advance y
    });

    // Grand Total Row
    checkPageBreak(ROW_H + 2);

    // Draw background
    doc.setFillColor(230, 235, 240);
    doc.rect(MARGIN, y, TABLE_W, ROW_H, 'F');

    // Draw borders
    doc.setDrawColor(100);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, TABLE_W, ROW_H);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    const grandTextY = y + ROW_H - 2.2;

    doc.text('Grand Total', COL.shape.x, grandTextY);
    doc.text(String(grandTotalPieces), COL.pcs.x + COL.pcs.w - 2, grandTextY, { align: 'right' });
    doc.text(grandTotalWeight.toFixed(2), COL.cts.x + COL.cts.w - 2, grandTextY, { align: 'right' });

    const grandValLabel = grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.text(grandValLabel, COL.rate.x + COL.rate.w - 2, grandTextY, { align: 'right' });

    return doc;
  },

  async handleSavePdfClick() {
    // Use the most recently generated PDF document — could be emerald's or jewelry catalog's
    const doc = this.activePdfDocument || (window.Catalog && window.Catalog.activePdfDocument ? window.Catalog.activePdfDocument : null);
    if (!doc) return;

    const isJewelry = !this.activePdfDocument && window.Catalog && window.Catalog.activePdfDocument;

    try {
      const defaultName = isJewelry
        ? `jewelry_catalog_report_${new Date().toISOString().split('T')[0]}.pdf`
        : `emerald_stock_report_${new Date().toISOString().split('T')[0]}.pdf`;
      const savePath = await window.electronAPI.saveFileDialog(defaultName);

      if (!savePath) return; // user cancelled/closed dialog

      // Get pdf raw string and convert to base64
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      await window.electronAPI.savePdfFile(pdfBase64, savePath);
      UI.showToast("PDF saved successfully!");
      UI.closeModal('modal-print-preview');
    } catch (err) {
      UI.showToast("Failed to save PDF: " + err.message, true);
    }
  },

  openBulkShareModal() {
    this.populateBulkShareGroupsAndGrades();
    this.populateBulkSharePudiasChecklist();
    UI.openModal('modal-bulk-share-emerald');
  },

  populateBulkShareGroupsAndGrades() {
    const groupSelect = document.getElementById('bulk-share-select-group');
    const gradeSelect = document.getElementById('bulk-share-select-grade');
    if (!groupSelect || !gradeSelect) return;

    const allEmeralds = DBManager.getEmeralds();
    const groups = new Set();
    const grades = new Set();

    allEmeralds.forEach(e => {
      if (e.group && e.group.trim()) groups.add(e.group.trim());
      if (e.lustreGrade && e.lustreGrade.trim()) grades.add(e.lustreGrade.trim());
    });

    groupSelect.innerHTML = '<option value="">All Groups</option>';
    Array.from(groups).sort().forEach(g => {
      groupSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    gradeSelect.innerHTML = '<option value="">All Grades</option>';
    Array.from(grades).sort().forEach(g => {
      gradeSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });
  },

  populateBulkSharePudiasChecklist() {
    const container = document.getElementById('bulk-share-pudias-list-container');
    if (!container) return;
    container.innerHTML = '';

    const selectedGroup = document.getElementById('bulk-share-select-group').value;
    const selectedGrade = document.getElementById('bulk-share-select-grade').value;

    const allEmeralds = DBManager.getEmeralds();
    const filtered = allEmeralds.filter(e => {
      const groupName = e.group || '';
      const gradeName = e.lustreGrade || '';
      const matchesGroup = !selectedGroup || groupName === selectedGroup;
      const matchesGrade = !selectedGrade || gradeName === selectedGrade;
      return matchesGroup && matchesGrade;
    });

    // Sort by Pudia number
    filtered.sort((a, b) => Number(a.color || 0) - Number(b.color || 0));

    if (filtered.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); grid-column: 1/-1;">No Pudias found for these criteria.</div>';
      return;
    }

    filtered.forEach(e => {
      const weight = this.getEmeraldWeight(e);
      const pricePerCaratInr = e.pricePerCarat || 0;

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-light); padding: 8px 0; gap: 10px;';
      row.innerHTML = `
        <label class="print-pudia-checkbox-label" style="flex: 1; display: flex; align-items: center; gap: 8px; margin-bottom: 0;">
          <input type="checkbox" class="bulk-share-pudia-checkbox" value="${e.id}" checked>
          #${e.color || 'N/A'} (${weight.toFixed(2)}ct)
        </label>
        <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted);">
          <span>Orig: <strong style="color: var(--text-main);">₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span style="display: flex; align-items: center;">
            <select class="bulk-share-multiplier-select" data-id="${e.id}" style="height: 26px; padding: 1px 4px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; color: var(--text-main); font-size: 11px;">
              <option value="1.0" selected>1.0x</option>
              <option value="0.9">0.9x</option>
              <option value="0.8">0.8x</option>
              <option value="0.7">0.7x</option>
              <option value="0.6">0.6x</option>
              <option value="custom">Custom...</option>
            </select>
            <input type="number" step="0.01" class="bulk-share-custom-multiplier-input" data-id="${e.id}" style="display: none; width: 55px; height: 26px; padding: 1px 4px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 4px; color: var(--text-main); font-size: 11px; margin-left: 4px;" placeholder="1.0">
          </span>
          <span style="min-width: 85px; text-align: right;">New: <strong class="bulk-share-new-price-val" data-id="${e.id}" style="color: var(--text-gold-dark);">₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
        </div>
      `;

      // Wire up multiplier change event for this row
      const select = row.querySelector('.bulk-share-multiplier-select');
      const customInput = row.querySelector('.bulk-share-custom-multiplier-input');
      const newValEl = row.querySelector('.bulk-share-new-price-val');

      const updateNewPrice = () => {
        let mult = 1.0;
        if (select.value === 'custom') {
          mult = parseFloat(customInput.value);
          if (isNaN(mult)) mult = 1.0;
        } else {
          mult = parseFloat(select.value) || 1.0;
        }
        const newPrice = Number((pricePerCaratInr * mult).toFixed(2));
        newValEl.textContent = `₹${newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      select.addEventListener('change', () => {
        if (select.value === 'custom') {
          customInput.style.display = 'inline-block';
          customInput.value = '1.0';
        } else {
          customInput.style.display = 'none';
        }
        updateNewPrice();
      });

      customInput.addEventListener('input', updateNewPrice);

      container.appendChild(row);
    });
  },

  handleBulkShareGroupChange() {
    const groupSelect = document.getElementById('bulk-share-select-group');
    const gradeSelect = document.getElementById('bulk-share-select-grade');
    if (!groupSelect || !gradeSelect) return;

    const selectedGroup = groupSelect.value;
    const allEmeralds = DBManager.getEmeralds();
    const grades = new Set();

    allEmeralds.forEach(e => {
      const groupName = e.group || '';
      if (!selectedGroup || groupName === selectedGroup) {
        if (e.lustreGrade && e.lustreGrade.trim()) {
          grades.add(e.lustreGrade.trim());
        }
      }
    });

    const currentGrade = gradeSelect.value;
    gradeSelect.innerHTML = '<option value="">All Grades</option>';
    Array.from(grades).sort().forEach(g => {
      gradeSelect.innerHTML += `<option value="${g}">${UI.escapeHtml(g)}</option>`;
    });

    if (grades.has(currentGrade)) {
      gradeSelect.value = currentGrade;
    }

    this.populateBulkSharePudiasChecklist();
  },

  handleBulkShareGradeChange() {
    this.populateBulkSharePudiasChecklist();
  },

  toggleAllBulkSharePudias(checked) {
    const checkBoxes = document.querySelectorAll('.bulk-share-pudia-checkbox');
    checkBoxes.forEach(cb => cb.checked = checked);
  },

  createShareCardCanvas(emerald, includePrice, includeBrand, theme, multiplier = 1.0) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;

      const renderCanvas = (imgObj) => {
        const scale = emerald.image ? canvas.width / 800 : 1;
        const boxWidth = 160 * scale;
        const boxHeight = (includePrice ? 80 : 55) * scale;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Background
        if (emerald.image && imgObj) {
          ctx.drawImage(imgObj, 0, 0);
        } else {
          // Draw solid premium background gradient
          let grad = ctx.createLinearGradient(0, 0, 800, 800);
          if (theme === 'emerald') {
            grad.addColorStop(0, '#042b14');
            grad.addColorStop(1, '#011208');
          } else if (theme === 'darkgold') {
            grad.addColorStop(0, '#2d1f0a');
            grad.addColorStop(1, '#0e0a03');
          } else if (theme === 'navy') {
            grad.addColorStop(0, '#0a1e36');
            grad.addColorStop(1, '#020b14');
          } else {
            grad.addColorStop(0, '#1f1f1f');
            grad.addColorStop(1, '#080808');
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 800);

          // Draw dual-border gold frame
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
          ctx.lineWidth = 2;
          ctx.strokeRect(30, 30, 740, 740);
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(40, 40, 720, 720);
        }

        // Draw Overlays using default positions
        const brandX = canvas.width - 40 * scale;
        const brandY = 48 * scale;
        const boxX = canvas.width - 30 * scale - boxWidth;
        const boxY = canvas.height - 30 * scale - boxHeight;

        // Collect detail fields
        const totalWeight = this.getEmeraldWeight(emerald);
        const totalPieces = this.getEmeraldPieces(emerald);
        const shapes = this.getEmeraldShapes(emerald);
        const shapesDisplay = shapes.length > 0 ? shapes.join(', ') : 'Unknown';
        const originsStr = (emerald.origins || []).join(', ');
        const pricePerCaratInr = Number(((emerald.pricePerCarat || 0) * multiplier).toFixed(2));
        const totalValueInr = Number((totalWeight * pricePerCaratInr).toFixed(2));

        if (emerald.image) {
          if (includeBrand) {
            ctx.fillStyle = '#000000';
            ctx.font = `bold ${Math.round(26 * scale)}px Georgia, serif`;
            ctx.textAlign = 'right';
            ctx.fillText('MAVA GEMS', brandX, brandY);
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(1, Math.round(1 * scale));
          ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

          ctx.fillStyle = '#000000';
          ctx.font = `bold ${Math.round(12 * scale)}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'left';

          ctx.fillText(`Weight: ${totalWeight.toFixed(2)} cts`, boxX + 10 * scale, boxY + 22 * scale);
          ctx.fillText(`Pcs: ${totalPieces}`, boxX + 10 * scale, boxY + 40 * scale);

          if (includePrice) {
            ctx.fillText(`Price: ₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`, boxX + 10 * scale, boxY + 58 * scale);
          }
        } else {
          // Gradient layout draw
          if (includeBrand) {
            ctx.fillStyle = '#D4AF37';
            ctx.font = 'bold 44px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillText('MAVA GEMS', 400, 130);
          } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 26px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillText('EMERALD STOCK CARD', 400, 130);
          }

          ctx.fillStyle = '#D4AF37';
          ctx.font = 'bold 28px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Pudia Number: #${emerald.color || 'N/A'}`, 400, 230);

          ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(150, 270);
          ctx.lineTo(650, 270);
          ctx.stroke();

          ctx.textAlign = 'left';
          const specs = [
            { label: 'Stock Type:', value: emerald.stockType || 'Calibrated Series' },
            { label: 'Shape / Cut:', value: shapesDisplay }
          ];
          if (emerald.stockType !== 'Single Pieces') {
            specs.push({ label: 'Lustre Grade:', value: emerald.lustreGrade || 'N/A' });
          }
          specs.push(
            { label: 'Origin Source:', value: originsStr || 'None' },
            { label: 'Group / Lot:', value: emerald.group || 'None' },
            { label: 'Total Weight:', value: `${totalWeight.toFixed(2)} carats` },
            { label: 'Total Pieces:', value: `${totalPieces} Pcs` }
          );

          const startY = specs.length > 6 ? 300 : 320;
          const spacingY = specs.length > 6 ? 45 : 50;

          specs.forEach((s, idx) => {
            const y = startY + idx * spacingY;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '16px sans-serif';
            ctx.fillText(s.label, 180, y);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(s.value, 330, y);
          });

          if (includePrice) {
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = 1;

            ctx.fillRect(150, 620, 500, 100);
            ctx.strokeRect(150, 620, 500, 100);

            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '12px sans-serif';
            ctx.fillText(`VALUED AT ₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/CT`, 400, 650);

            ctx.fillStyle = '#D4AF37';
            ctx.font = 'bold 32px Georgia, serif';
            ctx.fillText(`₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, 695);
          }
        }

        resolve(canvas);
      };

      if (emerald.image) {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          renderCanvas(img);
        };
        img.onerror = () => {
          renderCanvas(null);
        };
        img.src = emerald.image;
      } else {
        renderCanvas(null);
      }
    });
  },

  async exportBulkShareCards() {
    const checkedBoxes = document.querySelectorAll('.bulk-share-pudia-checkbox:checked');
    if (checkedBoxes.length === 0) {
      UI.showToast("Please select at least one Pudia to export.", true);
      return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const allEmeralds = DBManager.getEmeralds();
    const selectedEmeralds = allEmeralds.filter(e => selectedIds.includes(e.id));

    const includePrice = document.getElementById('bulk-share-include-price').checked;
    const includeBrand = document.getElementById('bulk-share-include-brand').checked;
    const theme = document.getElementById('bulk-share-bg-theme').value;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    try {
      let chosenDir = "";
      if (!isMobile) {
        // Desktop directory select dialog
        chosenDir = await window.electronAPI.selectDirectory();
        if (!chosenDir) return; // User cancelled
      }

      UI.showToast("Exporting bulk cards...", false);
      let successCount = 0;

      for (const e of selectedEmeralds) {
        const selectEl = document.querySelector(`.bulk-share-multiplier-select[data-id="${e.id}"]`);
        let multiplier = 1.0;
        if (selectEl) {
          if (selectEl.value === 'custom') {
            const customInputEl = document.querySelector(`.bulk-share-custom-multiplier-input[data-id="${e.id}"]`);
            multiplier = customInputEl ? parseFloat(customInputEl.value) : 1.0;
            if (isNaN(multiplier)) multiplier = 1.0;
          } else {
            multiplier = parseFloat(selectEl.value) || 1.0;
          }
        }
        const canvas = await this.createShareCardCanvas(e, includePrice, includeBrand, theme, multiplier);
        const dataUrl = canvas.toDataURL('image/png');
        const base64Data = dataUrl.split(',')[1];

        const gradePart = String(e.lustreGrade || 'Grade').trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
        const pudiaPart = String(e.color || 'Pudia').trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
        const filename = `${gradePart}_${pudiaPart}.png`;

        if (isMobile) {
          // Sequential mobile download triggers
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
          // Small delay between trigger events to allow sequential mobile downloads
          await new Promise(r => setTimeout(r, 300));
        } else {
          // Save using Native Electron/Tauri bridge
          const separator = chosenDir.includes('\\') ? '\\' : '/';
          const filePath = chosenDir.endsWith(separator) ? `${chosenDir}${filename}` : `${chosenDir}${separator}${filename}`;
          await window.electronAPI.savePdfFile(base64Data, filePath);
        }
        successCount++;
      }

      UI.showToast(`Successfully exported ${successCount} share cards!`);
      UI.closeModal('modal-bulk-share-emerald');
    } catch (err) {
      console.error(err);
      UI.showToast("Export failed: " + err.message, true);
    }
  },

  sharingEmerald: null,
  sharingImageObj: null,
  activeShareCanvas: null,

  openShareModal(emerald) {
    this.sharingEmerald = emerald;
    this.sharingImageObj = null;
    this.shareCoords = { brandX: null, brandY: null, boxX: null, boxY: null };
    this.dragState = { target: null, offsetX: 0, offsetY: 0 };

    // Clear / setup bg theme options based on whether image is available
    const bgThemeGroup = document.getElementById('share-bg-theme-group');
    if (bgThemeGroup) {
      if (emerald.image) {
        bgThemeGroup.classList.add('hidden');
      } else {
        bgThemeGroup.classList.remove('hidden');
      }
    }

    // Set default checkbox check states
    document.getElementById('share-include-price').checked = true;
    document.getElementById('share-include-brand').checked = true;

    const multiplierEl = document.getElementById('share-price-multiplier');
    const multiplierCustom = document.getElementById('share-price-multiplier-custom');
    if (multiplierEl) {
      multiplierEl.value = '1.0';
    }
    if (multiplierCustom) {
      multiplierCustom.style.display = 'none';
    }
    const origDisplay = document.getElementById('share-orig-price-display');
    const newDisplay = document.getElementById('share-new-price-display');
    if (origDisplay && newDisplay) {
      const origPrice = emerald.pricePerCarat || 0;
      origDisplay.textContent = `₹${origPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
      newDisplay.textContent = `₹${origPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
    }

    UI.openModal('modal-share-emerald');
    this.generateShareCard(emerald);
  },

  generateShareCard(emerald) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;

    const includePrice = document.getElementById('share-include-price').checked;
    const includeBrand = document.getElementById('share-include-brand').checked;
    const theme = document.getElementById('share-bg-theme').value;
    const multiplierEl = document.getElementById('share-price-multiplier');
    const multiplierCustom = document.getElementById('share-price-multiplier-custom');
    let multiplier = 1.0;
    if (multiplierEl) {
      if (multiplierEl.value === 'custom') {
        multiplier = parseFloat(multiplierCustom.value);
        if (isNaN(multiplier)) multiplier = 1.0;
      } else {
        multiplier = parseFloat(multiplierEl.value) || 1.0;
      }
    }

    const self = this;

    // Initialize coordinate states if null
    if (!this.shareCoords) {
      this.shareCoords = { brandX: null, brandY: null, boxX: null, boxY: null };
    }
    if (!this.dragState) {
      this.dragState = { target: null, offsetX: 0, offsetY: 0 };
    }

    // Load image if present
    const renderPromise = new Promise((resolve) => {
      if (emerald.image) {
        if (self.sharingImageObj) {
          canvas.width = self.sharingImageObj.width;
          canvas.height = self.sharingImageObj.height;
          resolve();
        } else {
          const img = new Image();
          img.onload = () => {
            self.sharingImageObj = img;
            canvas.width = img.width;
            canvas.height = img.height;
            resolve();
          };
          img.src = emerald.image;
        }
      } else {
        resolve();
      }
    });

    renderPromise.then(() => {
      const scale = emerald.image ? canvas.width / 800 : 1;
      const boxWidth = 160 * scale;
      const boxHeight = (includePrice ? 80 : 55) * scale;

      const drawAll = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Background
        if (emerald.image && self.sharingImageObj) {
          ctx.drawImage(self.sharingImageObj, 0, 0);
        } else {
          // Draw solid premium background gradient
          let grad = ctx.createLinearGradient(0, 0, 800, 800);
          if (theme === 'emerald') {
            grad.addColorStop(0, '#042b14');
            grad.addColorStop(1, '#011208');
          } else if (theme === 'darkgold') {
            grad.addColorStop(0, '#2d1f0a');
            grad.addColorStop(1, '#0e0a03');
          } else if (theme === 'navy') {
            grad.addColorStop(0, '#0a1e36');
            grad.addColorStop(1, '#020b14');
          } else {
            grad.addColorStop(0, '#1f1f1f');
            grad.addColorStop(1, '#080808');
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 800);

          // Draw dual-border gold frame
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
          ctx.lineWidth = 2;
          ctx.strokeRect(30, 30, 740, 740);
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(40, 40, 720, 720);
        }

        // 2. Initialize default coordinates if null
        if (self.shareCoords.brandX === null) {
          self.shareCoords.brandX = canvas.width - 40 * scale;
          self.shareCoords.brandY = 48 * scale;
        }
        if (self.shareCoords.boxX === null) {
          self.shareCoords.boxX = canvas.width - 30 * scale - boxWidth;
          self.shareCoords.boxY = canvas.height - 30 * scale - boxHeight;
        }

        // Collect detail fields
        const totalWeight = self.getEmeraldWeight(emerald);
        const totalPieces = self.getEmeraldPieces(emerald);
        const shapes = self.getEmeraldShapes(emerald);
        const shapesDisplay = shapes.length > 0 ? shapes.join(', ') : 'Unknown';
        const originsStr = (emerald.origins || []).join(', ');
        const pricePerCaratInr = Number(((emerald.pricePerCarat || 0) * multiplier).toFixed(2));
        const totalValueInr = Number((totalWeight * pricePerCaratInr).toFixed(2));

        // 3. Draw Overlays
        if (emerald.image) {
          // --- PHOTO OVERLAY RENDER ---
          // Brand Header
          if (includeBrand) {
            ctx.fillStyle = '#000000';
            ctx.font = `bold ${Math.round(26 * scale)}px Georgia, serif`;
            ctx.textAlign = 'right';
            ctx.fillText('MAVA GEMS', self.shareCoords.brandX, self.shareCoords.brandY);
          }

          // Draw white sharp box with a thin black border
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(self.shareCoords.boxX, self.shareCoords.boxY, boxWidth, boxHeight);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(1, Math.round(1 * scale));
          ctx.strokeRect(self.shareCoords.boxX, self.shareCoords.boxY, boxWidth, boxHeight);

          // Write labels and values in sharp black text
          ctx.fillStyle = '#000000';
          ctx.font = `bold ${Math.round(12 * scale)}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'left';

          ctx.fillText(`Weight: ${totalWeight.toFixed(2)} cts`, self.shareCoords.boxX + 10 * scale, self.shareCoords.boxY + 22 * scale);
          ctx.fillText(`Pcs: ${totalPieces}`, self.shareCoords.boxX + 10 * scale, self.shareCoords.boxY + 40 * scale);

          if (includePrice) {
            ctx.fillText(`Price: ₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`, self.shareCoords.boxX + 10 * scale, self.shareCoords.boxY + 58 * scale);
          }
        } else {
          // --- GRADIENT LAYOUT RENDER (NO PHOTO) ---
          // Header Branding
          if (includeBrand) {
            ctx.fillStyle = '#D4AF37';
            ctx.font = 'bold 44px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillText('MAVA GEMS', 400, 130);
          } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 26px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillText('EMERALD STOCK CARD', 400, 130);
          }

          // Pudia Number Badge
          ctx.fillStyle = '#D4AF37';
          ctx.font = 'bold 28px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Pudia Number: #${emerald.color || 'N/A'}`, 400, 230);

          // Decorative divider lines
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(150, 270);
          ctx.lineTo(650, 270);
          ctx.stroke();

          // Detail Lines
          ctx.textAlign = 'left';
          const specs = [];
          specs.push({ label: 'Stock Type:', value: emerald.stockType || 'Calibrated Series' });
          specs.push({ label: 'Shape / Cut:', value: shapesDisplay });
          if (emerald.stockType !== 'Single Pieces') {
            specs.push({ label: 'Lustre Grade:', value: emerald.lustreGrade || 'N/A' });
          }
          specs.push(
            { label: 'Origin Source:', value: originsStr || 'None' },
            { label: 'Group / Lot:', value: emerald.group || 'None' },
            { label: 'Total Weight:', value: `${totalWeight.toFixed(2)} carats` },
            { label: 'Total Pieces:', value: `${totalPieces} Pcs` }
          );

          const startY = specs.length > 6 ? 300 : 320;
          const spacingY = specs.length > 6 ? 45 : 50;

          specs.forEach((s, idx) => {
            const y = startY + idx * spacingY;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '16px sans-serif';
            ctx.fillText(s.label, 180, y);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(s.value, 330, y);
          });

          // Draw Valuation
          if (includePrice) {
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.lineWidth = 1;

            ctx.fillRect(150, 620, 500, 100);
            ctx.strokeRect(150, 620, 500, 100);

            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '12px sans-serif';
            ctx.fillText(`VALUED AT ₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/CT`, 400, 650);

            ctx.fillStyle = '#D4AF37';
            ctx.font = 'bold 32px Georgia, serif';
            ctx.fillText(`₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 400, 695);
          }
        }
      };

      // Initial draw
      drawAll();

      // Drag and drop event handling
      const getEventCoords = (e) => {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        return {
          screenX: clientX - rect.left,
          screenY: clientY - rect.top
        };
      };

      const handleStart = (e) => {
        const { screenX, screenY } = getEventCoords(e);
        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const x = screenX * scaleX;
        const y = screenY * scaleY;

        // Check Brand Header
        if (includeBrand && self.shareCoords.brandX !== null) {
          const ctx2d = canvas.getContext('2d');
          ctx2d.font = `bold ${Math.round(26 * scale)}px Georgia, serif`;
          const brandWidth = ctx2d.measureText('MAVA GEMS').width;
          const brandHeight = 26 * scale;

          if (x >= self.shareCoords.brandX - brandWidth && x <= self.shareCoords.brandX &&
            y >= self.shareCoords.brandY - brandHeight && y <= self.shareCoords.brandY + 10 * scale) {
            self.dragState = {
              target: 'brand',
              offsetX: x - self.shareCoords.brandX,
              offsetY: y - self.shareCoords.brandY
            };
            e.preventDefault();
            return;
          }
        }

        // Check Details Box
        if (self.shareCoords.boxX !== null) {
          if (x >= self.shareCoords.boxX && x <= self.shareCoords.boxX + boxWidth &&
            y >= self.shareCoords.boxY && y <= self.shareCoords.boxY + boxHeight) {
            self.dragState = {
              target: 'box',
              offsetX: x - self.shareCoords.boxX,
              offsetY: y - self.shareCoords.boxY
            };
            e.preventDefault();
            return;
          }
        }
      };

      const handleMove = (e) => {
        const { screenX, screenY } = getEventCoords(e);
        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const x = screenX * scaleX;
        const y = screenY * scaleY;

        if (self.dragState && self.dragState.target) {
          if (self.dragState.target === 'brand') {
            self.shareCoords.brandX = Math.max(120 * scale, Math.min(canvas.width, x - self.dragState.offsetX));
            self.shareCoords.brandY = Math.max(30 * scale, Math.min(canvas.height - 10 * scale, y - self.dragState.offsetY));
          } else if (self.dragState.target === 'box') {
            self.shareCoords.boxX = Math.max(0, Math.min(canvas.width - boxWidth, x - self.dragState.offsetX));
            self.shareCoords.boxY = Math.max(0, Math.min(canvas.height - boxHeight, y - self.dragState.offsetY));
          }
          drawAll();
          e.preventDefault();
        } else {
          // Hover state styling
          let hover = false;
          if (includeBrand && self.shareCoords.brandX !== null) {
            const ctx2d = canvas.getContext('2d');
            ctx2d.font = `bold ${Math.round(26 * scale)}px Georgia, serif`;
            const brandWidth = ctx2d.measureText('MAVA GEMS').width;
            const brandHeight = 26 * scale;
            if (x >= self.shareCoords.brandX - brandWidth && x <= self.shareCoords.brandX &&
              y >= self.shareCoords.brandY - brandHeight && y <= self.shareCoords.brandY + 10 * scale) {
              hover = true;
            }
          }
          if (!hover && self.shareCoords.boxX !== null) {
            if (x >= self.shareCoords.boxX && x <= self.shareCoords.boxX + boxWidth &&
              y >= self.shareCoords.boxY && y <= self.shareCoords.boxY + boxHeight) {
              hover = true;
            }
          }
          canvas.style.cursor = hover ? 'move' : 'default';
        }
      };

      const handleEnd = () => {
        if (self.dragState) {
          self.dragState.target = null;
        }
      };

      canvas.addEventListener('mousedown', handleStart);
      canvas.addEventListener('mousemove', handleMove);
      canvas.addEventListener('mouseup', handleEnd);
      canvas.addEventListener('mouseleave', handleEnd);

      canvas.addEventListener('touchstart', handleStart, { passive: false });
      canvas.addEventListener('touchmove', handleMove, { passive: false });
      canvas.addEventListener('touchend', handleEnd);

      const canvasContainer = document.getElementById('share-card-canvas-container');
      if (canvasContainer) {
        canvasContainer.innerHTML = '';
        canvas.style.cssText = 'max-width: 100%; display: block; height: auto; border-radius: 4px; user-select: none;';
        canvasContainer.appendChild(canvas);
      }

      self.activeShareCanvas = canvas;
    });
  },

  async exportShareCard(emerald) {
    if (!this.activeShareCanvas) {
      UI.showToast("No active share card preview found.", true);
      return;
    }

    try {
      const gradePart = String(emerald.lustreGrade || 'Grade').trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
      const pudiaPart = String(emerald.color || 'Pudia').trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
      const defaultName = `${gradePart}_${pudiaPart}.png`;
      const base64Data = this.activeShareCanvas.toDataURL('image/png').split(',')[1];

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        // Fallback for mobile browser: standard anchor trigger
        const link = document.createElement('a');
        link.download = defaultName;
        link.href = this.activeShareCanvas.toDataURL('image/png');
        link.click();
        UI.showToast("Export trigger complete!");
      } else {
        // Desktop native save dialog
        const chosenPath = await window.electronAPI.saveFileDialog(defaultName);
        if (!chosenPath) return; // User cancelled

        await window.electronAPI.savePdfFile(base64Data, chosenPath);
        UI.showToast("Share card exported successfully!");
        UI.closeModal('modal-share-emerald');
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Export failed: " + err.message, true);
    }
  },

  createFlatPudiaCard(item, isMultiplierEnabled, globalMultiplier) {
    const card = document.createElement('div');
    card.className = 'flat-pudia-card';

    const totalWeight = this.getEmeraldWeight(item);
    const totalPieces = this.getEmeraldPieces(item);
    const shapes = this.getEmeraldShapes(item);
    const shapesDisplay = shapes.length > 0 ? shapes.join(', ') : 'Unknown Shape';
    const originsStr = (item.origins || []).join(', ');

    const pricePerCaratInr = item.pricePerCarat || 0;
    const totalValueInr = Number((totalWeight * pricePerCaratInr).toFixed(2));

    let rateHtml = `₹${pricePerCaratInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
    let valueHtml = `₹${totalValueInr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (isMultiplierEnabled) {
      const discountedRate = Number((pricePerCaratInr * globalMultiplier).toFixed(2));
      const discountedValue = Number((totalWeight * discountedRate).toFixed(2));
      rateHtml = `<span style="text-decoration: line-through; opacity: 0.6; font-size: 11px;">₹${pricePerCaratInr.toLocaleString()}</span> <strong style="color: var(--text-gold-dark);">₹${discountedRate.toLocaleString()}</strong>/ct`;
      valueHtml = `<span style="text-decoration: line-through; opacity: 0.6; font-size: 11px;">₹${totalValueInr.toLocaleString()}</span> <strong style="color: var(--text-gold-dark);">₹${discountedValue.toLocaleString()}</strong>`;
    }

    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    const pricePerCaratUsd = Number((usdRate > 0 ? pricePerCaratInr / usdRate : 0).toFixed(2));
    const totalValueUsd = Number((usdRate > 0 ? totalValueInr / usdRate : 0).toFixed(2));

    let usdDisplay = '';
    if (usdRate > 0) {
      let usdRateDisplay = `$${pricePerCaratUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ct`;
      let usdValueDisplay = `$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (isMultiplierEnabled) {
        const discountedRate = Number((pricePerCaratInr * globalMultiplier).toFixed(2));
        const discountedValue = Number((totalWeight * discountedRate).toFixed(2));
        const discountedPriceUsd = Number((usdRate > 0 ? discountedRate / usdRate : 0).toFixed(2));
        const discountedValueUsd = Number((usdRate > 0 ? discountedValue / usdRate : 0).toFixed(2));
        usdRateDisplay = `<span style="text-decoration: line-through; opacity: 0.6;">$${pricePerCaratUsd.toLocaleString()}</span> <strong>$${discountedPriceUsd.toLocaleString()}</strong>/ct`;
        usdValueDisplay = `<span style="text-decoration: line-through; opacity: 0.6;">$${totalValueUsd.toLocaleString()}</span> <strong>$${discountedValueUsd.toLocaleString()}</strong>`;
      }
      usdDisplay = `
        <div style="font-size: 11px; color: var(--text-muted); border-top: 1px dashed var(--border-light); padding-top: 6px; margin-top: 6px; display: flex; flex-direction: column; gap: 2px;">
          <div>Rate (USD): <strong style="color: var(--text-main);">${usdRateDisplay}</strong></div>
          <div>Value (USD): <strong style="color: var(--text-main);">${usdValueDisplay}</strong></div>
        </div>
      `;
    }

    let imgHtml = '';
    if (item.image) {
      imgHtml = `<img src="${item.image}" alt="Pudia #${item.color}" class="flat-pudia-img">`;
    } else {
      imgHtml = `<div class="flat-pudia-no-img">No Image</div>`;
    }

    // Build sizes table HTML
    let sizesHtml = '';
    if (item.sizes && item.sizes.length > 0) {
      sizesHtml = '<table style="width:100%; font-size:11px; border-collapse:collapse; margin-top:10px; border: 1px solid var(--border-light);">';
      sizesHtml += '<tr style="color:var(--text-muted); font-size:9px; text-transform:uppercase; background-color:var(--bg-base); border-bottom:1px solid var(--border-light);"><th style="padding:4px; text-align:left;">Shape</th><th style="padding:4px; text-align:left;">MM</th><th style="padding:4px; text-align:right;">Pcs</th><th style="padding:4px; text-align:right;">cts</th></tr>';
      item.sizes.forEach(s => {
        sizesHtml += `<tr style="border-bottom: 1px solid var(--border-light);"><td style="padding:4px;">${UI.escapeHtml(s.shape || '')}</td><td style="padding:4px;">${UI.escapeHtml(s.mm || '')}</td><td style="padding:4px; text-align:right;">${s.pieces || 0}</td><td style="padding:4px; text-align:right;">${Number(s.weight || 0).toFixed(2)}</td></tr>`;
      });
      sizesHtml += '</table>';
    }

    card.innerHTML = `
      <div class="flat-pudia-header">
        <div class="flat-pudia-title">
          <span class="flat-pudia-num">Pudia #${item.color || 'N/A'}</span>
          <span class="flat-pudia-group">${UI.escapeHtml(item.group || 'Unassigned')}</span>
        </div>
        <span class="flat-pudia-grade-badge" title="${UI.escapeHtml(item.lustreGrade || 'N/A')}">
          ${UI.escapeHtml(item.lustreGrade || 'Calibrated')}
        </span>
      </div>

      <div class="flat-pudia-body">
        <div class="flat-pudia-details">
          <div class="flat-pudia-detail-item">
            <span class="flat-pudia-detail-label">Weight:</span>
            <span class="flat-pudia-detail-val">${totalWeight.toFixed(2)} cts</span>
          </div>
          <div class="flat-pudia-detail-item">
            <span class="flat-pudia-detail-label">Pieces:</span>
            <span class="flat-pudia-detail-val">${totalPieces} pcs</span>
          </div>
          <div class="flat-pudia-detail-item">
            <span class="flat-pudia-detail-label">Rate/ct:</span>
            <span class="flat-pudia-detail-val">${rateHtml}</span>
          </div>
          <div class="flat-pudia-detail-item">
            <span class="flat-pudia-detail-label">Valuation:</span>
            <span class="flat-pudia-detail-val" style="color: var(--text-gold-dark);">${valueHtml}</span>
          </div>
          ${usdDisplay}
        </div>
        <div class="flat-pudia-img-container" title="Click to view details & Share Card">
          ${imgHtml}
        </div>
      </div>

      <div class="flat-pudia-expandable">
        <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-light); padding-top: 8px;">
          <div><strong>Origin:</strong> ${originsStr || 'None'}</div>
          <div><strong>Pair:</strong> ${item.pair || 'No'}</div>
          <div><strong>Stock Type:</strong> ${item.stockType || 'Calibrated Series'}</div>
        </div>
        ${sizesHtml}
      </div>

      <div class="flat-pudia-footer">
        <button type="button" class="btn btn-secondary btn-small btn-toggle-expand" style="padding: 4px 8px; font-size: 11px;">
          Expand Sizes
        </button>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn btn-secondary btn-small btn-share-flat" style="padding: 4px 8px;" title="Share Card">
            Share
          </button>
          <button type="button" class="btn btn-secondary btn-small btn-edit-flat" style="padding: 4px 8px;" title="Edit">
            Edit
          </button>
          <button type="button" class="btn btn-danger btn-small btn-delete-flat" style="padding: 4px 8px; background-color: var(--danger-red); border-color: var(--danger-red); color: white;" title="Delete">
            Delete
          </button>
        </div>
      </div>
    `;

    // Click on Image opens share modal
    const imgEl = card.querySelector('.flat-pudia-img-container');
    if (imgEl) {
      imgEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.openShareModal(item);
      });
    }

    // Toggle expand button
    const btnExpand = card.querySelector('.btn-toggle-expand');
    const expandableDiv = card.querySelector('.flat-pudia-expandable');
    if (btnExpand && expandableDiv) {
      btnExpand.addEventListener('click', () => {
        const isActive = expandableDiv.classList.toggle('active');
        btnExpand.textContent = isActive ? 'Collapse' : 'Expand Sizes';
      });
    }

    // Edit button
    card.querySelector('.btn-edit-flat').addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.loadItemIntoForm(item);
      UI.openModal('modal-emerald-item');
    });

    // Delete button
    card.querySelector('.btn-delete-flat').addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.handleDeleteEmerald(item);
    });

    // Share button
    card.querySelector('.btn-share-flat').addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.openShareModal(item);
    });

    return card;
  }
};

window.EmeraldController = EmeraldController;
