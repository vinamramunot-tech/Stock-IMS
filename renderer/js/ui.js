/**
 * UI Components & Form Lifecycle Manager for Mava Gems
 */

const UI = {
  activeItemState: null, // Temporary store for the item currently being added/edited

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  debounce(func, delay = 250) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  },

  // Toast Notification
  showToast(message, isError = false) {
    const toast = document.getElementById('toast-alert');
    const msgEl = document.getElementById('toast-message');
    msgEl.textContent = message;

    if (isError) {
      toast.style.backgroundColor = 'var(--danger-red)';
    } else {
      toast.style.backgroundColor = 'var(--border-dark)';
    }

    toast.classList.remove('hidden');

    // Play a gentle notification sound/vibration if supported
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  },

  // Custom generic confirm dialog to bypass Tauri v2 native blocking
  confirm(message, callback) {
    const modal = document.getElementById('modal-generic-confirm');
    if (!modal) return;

    const msgEl = document.getElementById('generic-confirm-msg');
    if (msgEl) msgEl.textContent = message;

    // Explicitly bind all buttons using onclick to overwrite any existing handlers and ensure they work
    const btnCancel = modal.querySelector('.btn-secondary');
    const btnConfirm = modal.querySelector('.btn-danger');
    const btnClose = modal.querySelector('.btn-close');

    const closeAndCleanup = () => {
      this.closeModal('modal-generic-confirm');
    };

    if (btnCancel) {
      btnCancel.onclick = closeAndCleanup;
    }

    if (btnClose) {
      btnClose.onclick = closeAndCleanup;
    }

    if (btnConfirm) {
      btnConfirm.onclick = () => {
        closeAndCleanup();
        // Use a small timeout to let the modal close smoothly before executing potentially heavy callbacks
        setTimeout(() => {
          if (callback) callback();
        }, 50);
      };
    }

    this.openModal('modal-generic-confirm');
  },

  // Modal Lifecycles
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  },

  // Setup Modal Tab switching
  initModalTabs() {
    const tabs = document.querySelectorAll('.modal-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');

        // Deactivate all
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active', 'hidden'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.add('hidden'));

        // Activate current
        tab.classList.add('active');
        const content = document.getElementById(targetTab);
        content.classList.remove('hidden');
        content.classList.add('active');
      });
    });
  },

  // Reset Tab focus to the first tab (General)
  resetModalTabs() {
    const tabs = document.querySelectorAll('.modal-tab-btn');
    tabs.forEach((tab, index) => {
      if (index === 0) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    const contents = document.querySelectorAll('.modal-tab-content');
    contents.forEach((content, index) => {
      if (index === 0) {
        content.classList.remove('hidden');
        content.classList.add('active');
      } else {
        content.classList.remove('active');
        content.classList.add('hidden');
      }
    });
  },

  /**
   * Reads an uploaded image and compresses it using Canvas (max 1200px, 82% quality) to optimize memory and disk I/O.
   */
  processImageUpload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        let rawBase64 = event.target.result;
        const filename = (file.name || '').toLowerCase();
        if (
          file.type === 'image/heic' ||
          file.type === 'image/heif' ||
          filename.endsWith('.heic') ||
          filename.endsWith('.heif') ||
          rawBase64.startsWith('data:image/heic') ||
          rawBase64.startsWith('data:image/heif') ||
          rawBase64.startsWith('data:application/octet-stream')
        ) {
          try {
            if (window.__TAURI__ && window.__TAURI__.core) {
              rawBase64 = await window.__TAURI__.core.invoke('convert_heic_to_jpeg', { base64Heic: rawBase64 });
            }
          } catch (e) {
            console.warn("HEIC conversion via Tauri failed:", e);
          }
        }
        this.compressBase64Image(rawBase64, 1200, 0.82)
          .then(compressed => resolve(compressed))
          .catch(() => resolve(rawBase64));
      };
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Helper to compress base64 image strings to limit maximum payload size
   */
  compressBase64Image(base64Str, maxDim = 1200, quality = 0.82) {
    if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
      return Promise.resolve(base64Str || null);
    }
    if (base64Str.length < 400000) {
      return Promise.resolve(base64Str);
    }
    return new Promise((resolve) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(base64Str);
        }
      }, 1000);

      const img = new Image();
      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        try {
          let width = img.width || 1;
          let height = img.height || 1;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  },

  /**
   * Initialize Image Uploader Handlers
   */
  initImageUploader() {
    // Initialize image editor controller
    if (window.ImageEditor) {
      ImageEditor.init();
    }

    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('item-image-file');
    const previewContainer = document.getElementById('uploader-preview');
    const previewImg = document.getElementById('uploaded-img-el');
    const promptContainer = document.getElementById('uploader-prompt');
    const removeBtn = document.getElementById('btn-remove-image');

    // Prevent default drag/drop behaviors globally to stop browser from navigating/opening images
    window.addEventListener('dragover', (e) => e.preventDefault(), false);
    window.addEventListener('drop', (e) => e.preventDefault(), false);

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

    const editBtn = document.getElementById('btn-edit-jewelry-image');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentBase64 = previewImg.src;
        if (currentBase64) {
          ImageEditor.open(currentBase64, (croppedBase64) => {
            previewImg.src = croppedBase64;
            UI.activeItemState.image = croppedBase64;
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
      UI.activeItemState.image = null;
    });

    async function handleImageFile(file) {
      const filename = (file.name || '').toLowerCase();
      const isHeic = filename.endsWith('.heic') || filename.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
      if (!file.type.startsWith('image/') && !isHeic) {
        UI.showToast("Only image files are supported.", true);
        return;
      }
      try {
        const compressedBase64 = await UI.processImageUpload(file);
        previewImg.src = compressedBase64;
        promptContainer.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        UI.activeItemState.image = compressedBase64;

        if (window.ImageEditor) {
          ImageEditor.open(compressedBase64, (croppedBase64) => {
            previewImg.src = croppedBase64;
            UI.activeItemState.image = croppedBase64;
          });
        }
      } catch (err) {
        UI.showToast(err.message, true);
      }
    }
  },

  /**
   * Metals Components UI Builders
   */
  createMetalPartRow(part = null) {
    const container = document.getElementById('metals-list-container');
    const mainKaratEl = document.getElementById('item-karat');
    const defaultKarat = mainKaratEl && Number(mainKaratEl.value) > 0 ? Number(mainKaratEl.value) : 18;
    const partData = part || { name: '', karat: defaultKarat, weight: '', wastage: null, directValue: '' };
    const partId = 'metal_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const safePartName = this.escapeHtml(partData.name || '');
    const defaultWastage = document.getElementById('item-wastage') ? document.getElementById('item-wastage').value : '15.00';
    const displayWastage = (partData.wastage !== undefined && partData.wastage !== null) ? partData.wastage : defaultWastage;
    const directVal = (partData.directValue !== undefined && partData.directValue !== null && partData.directValue !== '')
      ? partData.directValue
      : ((partData.totalValue !== undefined && partData.totalValue !== null && partData.totalValue !== '') ? partData.totalValue : '');

    const row = document.createElement('div');
    row.className = 'metal-part-entry-card';
    row.id = partId;

    row.innerHTML = `
      <div class="input-group" style="margin-bottom:0;">
        <label>Part Name</label>
        <input type="text" class="metal-part-name" placeholder="e.g. Chain / Clasp" value="${safePartName}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Karat (KT)</label>
        <input type="number" class="metal-part-karat recalc-trigger" step="0.01" min="0" max="24" placeholder="e.g. 18" value="${partData.karat || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Weight (g)</label>
        <input type="number" class="metal-part-weight recalc-trigger" step="0.01" min="0" placeholder="0.00" value="${partData.weight || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Wastage (%)</label>
        <input type="number" class="metal-part-wastage recalc-trigger" step="0.01" min="0" placeholder="15.00" value="${displayWastage}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Direct Value (₹) <span style="font-size:10px; font-weight:normal; color:var(--text-muted);">(Optional)</span></label>
        <input type="number" class="metal-part-direct-value recalc-trigger" step="0.01" min="0" placeholder="e.g. 5000" value="${directVal}">
      </div>
      <div class="entry-card-btn-col">
        <button type="button" class="btn btn-danger btn-small btn-remove-part">&times;</button>
      </div>
    `;

    // Remove row event listener
    row.querySelector('.btn-remove-part').addEventListener('click', () => {
      row.remove();
      this.updateFormCalculations();
    });

    // Explicit, bomb-proof event bindings to trigger dynamic metal valuations
    const nameInput = row.querySelector('.metal-part-name');
    const karatSelect = row.querySelector('.metal-part-karat');
    const weightInput = row.querySelector('.metal-part-weight');
    const wastageInput = row.querySelector('.metal-part-wastage');
    const directValInput = row.querySelector('.metal-part-direct-value');

    const triggerRecalc = () => {
      this.updateFormCalculations();
    };

    karatSelect.addEventListener('change', triggerRecalc);
    karatSelect.addEventListener('input', triggerRecalc);
    karatSelect.addEventListener('keyup', triggerRecalc);

    weightInput.addEventListener('input', triggerRecalc);
    weightInput.addEventListener('change', triggerRecalc);
    weightInput.addEventListener('keyup', triggerRecalc);

    wastageInput.addEventListener('input', triggerRecalc);
    wastageInput.addEventListener('change', triggerRecalc);
    wastageInput.addEventListener('keyup', triggerRecalc);

    if (directValInput) {
      directValInput.addEventListener('input', triggerRecalc);
      directValInput.addEventListener('change', triggerRecalc);
      directValInput.addEventListener('keyup', triggerRecalc);
    }

    nameInput.addEventListener('input', triggerRecalc);

    container.appendChild(row);
    this.updateFormCalculations(); // Initial calculation
  },

  updatePartValuation(row) {
    this.updateFormCalculations();
  },

  /**
   * Colored Gemstone Components UI Builders
   */
  createStoneRow(stone = null) {
    const container = document.getElementById('stones-list-container');
    const stoneData = stone || { type: 'Emerald', shape: '', weight: '', ratePerCarat: '', totalValue: '', pieces: '' };
    const stoneId = 'stone_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const rawType = stoneData.type || 'Emerald';
    const isOther = rawType === 'Other' || rawType === 'Other Stone' || (!['Emerald', 'Ruby', 'Sapphire', 'Diamond', 'Polki', 'Other Semi-Precious'].includes(rawType));
    const safeStoneType = this.escapeHtml(rawType);
    const safeStoneShape = this.escapeHtml(stoneData.shape || '');
    const safeStonePieces = this.escapeHtml(stoneData.pieces || '');
    const safeStoneWeight = this.escapeHtml(stoneData.weight || '');

    const card = document.createElement('div');
    card.className = 'stone-entry-card';
    card.id = stoneId;
    card.setAttribute('data-stone-type', rawType);

    const firstColHtml = isOther ? `
      <div class="input-group" style="margin-bottom:0;">
        <label>Stone Name & Shape</label>
        <div style="display: flex; gap: 6px;">
          <input type="text" class="stone-custom-type recalc-trigger" placeholder="Stone (e.g. Tanzanite)" value="${(rawType === 'Other' || rawType === 'Other Stone') ? '' : safeStoneType}" style="flex: 1.2;">
          <input type="text" class="stone-shape" placeholder="Shape (e.g. Oval)" value="${safeStoneShape}" style="flex: 1;">
        </div>
      </div>
    ` : `
      <div class="input-group" style="margin-bottom:0;">
        <label>${safeStoneType} - Shape/Cut</label>
        <input type="text" class="stone-shape" placeholder="e.g. Oval Mixed" value="${safeStoneShape}">
      </div>
    `;

    card.innerHTML = `
      ${firstColHtml}
      <div class="input-group" style="margin-bottom:0;">
        <label>Pieces</label>
        <input type="number" class="stone-pieces recalc-trigger" min="1" step="1" placeholder="1" value="${safeStonePieces}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Weight (cts)</label>
        <input type="number" class="stone-weight recalc-trigger" step="0.01" min="0" placeholder="0.00" value="${safeStoneWeight}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Rate / Carat (@/ct)</label>
        <input type="number" class="stone-rate recalc-trigger" step="0.01" min="0" placeholder="0.00" value="${stoneData.ratePerCarat || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Total Stone Value (₹)</label>
        <input type="number" class="stone-total-val" step="0.01" min="0" placeholder="0.00" value="${stoneData.totalValue || ''}">
      </div>
      <div class="entry-card-btn-col" style="padding-bottom:0;">
        <span style="font-size:11px; color:var(--text-muted); cursor:pointer;" class="btn-remove-stone-card">&times; Erase</span>
      </div>
    `;

    // Wire up events
    const customTypeInput = card.querySelector('.stone-custom-type');
    const shapeInput = card.querySelector('.stone-shape');
    const piecesInput = card.querySelector('.stone-pieces');
    const weightInput = card.querySelector('.stone-weight');
    const rateInput = card.querySelector('.stone-rate');
    const totalInput = card.querySelector('.stone-total-val');

    if (customTypeInput) {
      customTypeInput.addEventListener('input', () => {
        const val = customTypeInput.value.trim() || 'Other Stone';
        card.setAttribute('data-stone-type', val);
        this.updateFormCalculations();
      });
    }

    if (shapeInput) {
      shapeInput.addEventListener('input', () => this.updateFormCalculations());
    }

    // Bidirectional Calculation: Changing weight or rate updates total
    [piecesInput, weightInput, rateInput].forEach(inp => {
      inp.addEventListener('input', () => {
        const wt = Number(weightInput.value || 0);
        const rt = Number(rateInput.value || 0);
        const computed = Calc.calculateStoneTotal(wt, rt);
        totalInput.value = computed > 0 ? computed : '';
        this.updateFormCalculations();
      });
    });

    // Bidirectional Calculation: Changing total value updates rate per carat
    totalInput.addEventListener('input', () => {
      const wt = Number(weightInput.value || 0);
      const tot = Number(totalInput.value || 0);
      const computedRate = Calc.calculateStoneRate(wt, tot);
      rateInput.value = computedRate > 0 ? computedRate : '';
      this.updateFormCalculations();
    });

    card.querySelector('.btn-remove-stone-card').addEventListener('click', () => {
      card.remove();
      this.updateFormCalculations();
    });

    container.appendChild(card);
  },

  initStoneSelectors() {
    const addBtns = document.querySelectorAll('.btn-add-stone');
    addBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-stone');
        this.createStoneRow({ type: type });
        this.updateFormCalculations();
      });
    });
  },



  /**
   * Real-time form calculator
   */
  updateFormCalculations() {
    // Use global gold rate for Market Cost & Selling Price, and per-item mfg rate for Home Cost
    const globalRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const itemRateEl = document.getElementById('item-gold-rate-24kt');
    const mfgGoldRate24kt = (itemRateEl && Number(itemRateEl.value) > 0) ? Number(itemRateEl.value) : globalRate;
    const mfgDate = document.getElementById('item-mfg-date')?.value || new Date().toISOString().split('T')[0];

    // Gathers items state on the fly
    const currentItem = {
      mfgDate: mfgDate,
      mfgGoldRate24kt: mfgGoldRate24kt,
      goldRateAtAddition: mfgGoldRate24kt,
      grossWeight: Number(document.getElementById('item-gross-weight')?.value || 0),
      karat: Number(document.getElementById('item-karat')?.value || 18),
      wastage: Number(document.getElementById('item-wastage')?.value || 0),
      labourCost: Number(document.getElementById('item-labour')?.value || 0),
      profitPercentage: Number(document.getElementById('item-profit-pct')?.value || 40),
      commission: {
        value: Number(document.getElementById('item-commission')?.value || 0),
        isManual: this.activeItemState && this.activeItemState.commission ? this.activeItemState.commission.isManual : false
      },
      metals: [],
      stones: [],
      diamondsPolki: []
    };

    // Additional Metals
    const metalRows = document.querySelectorAll('.metal-part-entry-card');
    metalRows.forEach(row => {
      const name = row.querySelector('.metal-part-name')?.value || 'Additional Part';
      const karatVal = Number(row.querySelector('.metal-part-karat')?.value);
      const karat = karatVal > 0 ? karatVal : (currentItem.karat || 18);
      const weight = Number(row.querySelector('.metal-part-weight')?.value || 0);
      const wastageVal = row.querySelector('.metal-part-wastage')?.value;
      const wastage = (wastageVal !== undefined && wastageVal !== null && wastageVal.trim() !== '') ? Number(wastageVal) : null;
      const directValStr = row.querySelector('.metal-part-direct-value')?.value;
      const directValue = (directValStr !== undefined && directValStr !== null && directValStr.trim() !== '') ? Number(directValStr) : null;

      currentItem.metals.push({ name, karat, weight, wastage, directValue, totalValue: directValue });
    });

    // Stones & Diamonds
    const stoneRows = document.querySelectorAll('.stone-entry-card');
    stoneRows.forEach(row => {
      const customTypeInput = row.querySelector('.stone-custom-type');
      const type = customTypeInput ? (customTypeInput.value.trim() || 'Other Stone') : (row.getAttribute('data-stone-type') || 'Emerald');
      const shape = row.querySelector('.stone-shape').value || 'Mixed';
      const pieces = Number(row.querySelector('.stone-pieces').value || 0);
      const weight = Number(row.querySelector('.stone-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.stone-rate').value || 0);
      const totalValue = Number(row.querySelector('.stone-total-val').value || 0);

      const component = { type, shape, pieces, weight, ratePerCarat, totalValue };
      if (type.toLowerCase().includes('diamond') || type.toLowerCase().includes('polki')) {
        currentItem.diamondsPolki.push(component);
      } else {
        currentItem.stones.push(component);
      }
    });

    // Perform Evaluation (globalRate for market cost/selling price, mfgGoldRate24kt for home cost)
    const evalResult = Calc.evaluateItem(currentItem, globalRate, mfgGoldRate24kt);

    // Update Form View: Metal subtotal and subtotal dynamically reflect the 24KT Gold Rate set in the form
    document.getElementById('summary-metal-subtotal').textContent = `₹${evalResult.mfgMetalSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('summary-total-gross-weight').textContent = `${evalResult.totalGrossWeight.toFixed(3)} g`;
    document.getElementById('summary-total-net-weight').textContent = `${evalResult.totalNetMetalWeight.toFixed(3)} g`;
    const combinedStonesVal = evalResult.stoneSubtotal + evalResult.diamondSubtotal;
    document.getElementById('summary-stone-subtotal').textContent = `₹${combinedStonesVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('summary-labour-subtotal').textContent = `₹${evalResult.mfgSubtotal ? currentItem.labourCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}`;

    document.getElementById('summary-subtotal').textContent = `₹${evalResult.mfgSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    document.getElementById('summary-grand-total').textContent = `₹${evalResult.marketCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const mfgCostEl = document.getElementById('summary-mfg-cost');
    if (mfgCostEl) {
      mfgCostEl.textContent = `₹${evalResult.mfgGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    // Home Cost display condition
    const homeCostCard = document.getElementById('home-cost-card');
    if (evalResult.hasEmerald) {
      homeCostCard.classList.remove('hidden');
      document.getElementById('summary-home-cost').textContent = `₹${evalResult.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else {
      homeCostCard.classList.add('hidden');
    }

    // Selling Price display
    document.getElementById('summary-selling-price').textContent = `₹${evalResult.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  },

  /**
   * Reset the active item form completely
   */
  resetForm() {
    this.activeItemState = {
      image: null,
      commission: { value: 0, isManual: false },
      profitPercentage: 40
    };

    document.getElementById('jewelry-form').reset();
    const _grossWtEl = document.getElementById('item-gross-weight'); if (_grossWtEl) _grossWtEl.value = '';
    const _karatEl = document.getElementById('item-karat'); if (_karatEl) _karatEl.value = '18';
    const _formWastageEl = document.getElementById('item-wastage'); if (_formWastageEl) _formWastageEl.value = '15.00';
    document.getElementById('item-profit-pct').value = '40.0';
    const _mfgDateEl = document.getElementById('item-mfg-date');
    if (_mfgDateEl) _mfgDateEl.value = new Date().toISOString().split('T')[0];
    // Pre-fill the per-item mfg gold rate from the current global rate
    const _globalRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const _goldRateEl = document.getElementById('item-gold-rate-24kt');
    if (_goldRateEl) _goldRateEl.value = _globalRate > 0 ? _globalRate : '';
    document.getElementById('metals-list-container').replaceChildren();
    document.getElementById('stones-list-container').replaceChildren();

    const skuInput = document.getElementById('item-sku');
    if (skuInput) {
      skuInput.value = '';
      skuInput.dataset.autoFilled = 'true';
      delete skuInput.dataset.lastAutoSku;
    }

    // Reset image uploader display
    document.getElementById('item-image-file').value = '';
    document.getElementById('uploaded-img-el').src = '';
    document.getElementById('uploader-preview').classList.add('hidden');
    document.getElementById('uploader-prompt').classList.remove('hidden');

    // No checkboxes to uncheck

    // Populate dynamic karat datalist with presets and past inventory karats
    this.populateKaratDatalist();

    // Default metals/stones (can start empty)
    this.resetModalTabs();
    this.updateFormCalculations();
    this.updateSkuSuggestion();

    const badgeEl = document.getElementById('jewelry-modal-status-badge');
    if (badgeEl) badgeEl.replaceChildren();
  },

  /**
   * Populate Gold Karat datalist dynamically from presets and past records
   */
  populateKaratDatalist() {
    const datalist = document.getElementById('jewelry-karat-options');
    if (!datalist) return;

    const baseKarats = [24, 22, 18, 14, 10, 9];
    const usedKarats = new Set(baseKarats);

    const allItems = DBManager.getItems();
    allItems.forEach(item => {
      if (item.karat && Number(item.karat) > 0) {
        usedKarats.add(Number(item.karat));
      }
      (item.metals || []).forEach(m => {
        if (m.karat && Number(m.karat) > 0) {
          usedKarats.add(Number(m.karat));
        }
      });
    });

    const sortedKarats = Array.from(usedKarats).sort((a, b) => b - a);
    datalist.innerHTML = '';
    sortedKarats.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `${k} KT`;
      datalist.appendChild(opt);
    });
  },

  /**
   * Pre-fill the form with item data for editing
   */
  loadItemIntoForm(item) {
    this.resetForm();
    this.populateKaratDatalist();

    // De-reference values to prevent direct mutation of state before save
    this.activeItemState = JSON.parse(JSON.stringify(item));

    const badgeEl = document.getElementById('jewelry-modal-status-badge');
    if (badgeEl) {
      const status = item.status || 'In Stock';
      let statusClass = 'stock';
      let statusLabel = 'In Stock';
      if (status === 'On Memo') {
        statusClass = 'memo';
        statusLabel = 'On Memo';
      } else if (status === 'Sold') {
        statusClass = 'sold';
        statusLabel = 'Sold';
      }
      const span = document.createElement('span');
      span.className = `badge-status ${statusClass}`;
      span.textContent = statusLabel;
      badgeEl.replaceChildren(span);
    }

    document.getElementById('item-name').value = item.name || '';
    document.getElementById('item-sku').value = item.sku || '';
    document.getElementById('item-category').value = item.category || 'Ring';
    document.getElementById('item-labour').value = item.labourCost || '';
    const _editMfgDateEl = document.getElementById('item-mfg-date');
    if (_editMfgDateEl) _editMfgDateEl.value = item.mfgDate || (item.createdAt ? item.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);

    // Gross weight, Karat & Wastage on General Tab
    const grossWtEl = document.getElementById('item-gross-weight');
    const karatEl = document.getElementById('item-karat');
    const wastageEl = document.getElementById('item-wastage');

    let loadedGrossWeight = item.grossWeight;
    let loadedKarat = item.karat;
    let loadedWastage = item.wastage !== undefined ? item.wastage : 15;

    // Backward compatibility: If older item had metals array but no root grossWeight
    let additionalMetals = item.metals || [];
    if ((loadedGrossWeight === undefined || loadedGrossWeight === null || Number(loadedGrossWeight) <= 0) && additionalMetals.length > 0) {
      // First metal part can be populated into the General tab
      const firstPart = additionalMetals[0];
      loadedGrossWeight = firstPart.weight;
      loadedKarat = firstPart.karat || 18;
      if (firstPart.wastage !== undefined && firstPart.wastage !== null) {
        loadedWastage = firstPart.wastage;
      }
      additionalMetals = additionalMetals.slice(1);
    }

    if (grossWtEl) grossWtEl.value = loadedGrossWeight !== undefined && loadedGrossWeight !== null ? loadedGrossWeight : '';
    if (karatEl) karatEl.value = String(loadedKarat || 18);
    if (wastageEl) wastageEl.value = loadedWastage !== undefined ? Number(loadedWastage).toFixed(2) : '15.00';

    // Load the saved per-item mfg gold rate (fallback to goldRateAtAddition or global if not set)
    const _savedRate = item.mfgGoldRate24kt || item.goldRateAtAddition || Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const _editGoldRateEl = document.getElementById('item-gold-rate-24kt');
    if (_editGoldRateEl) _editGoldRateEl.value = _savedRate > 0 ? _savedRate : '';
    document.getElementById('item-profit-pct').value = item.profitPercentage !== undefined ? Number(item.profitPercentage).toFixed(1) : '40.0';
    document.getElementById('item-description').value = item.description || '';

    // Image Setup
    if (item.image) {
      document.getElementById('uploaded-img-el').src = item.image;
      document.getElementById('uploader-prompt').classList.add('hidden');
      document.getElementById('uploader-preview').classList.remove('hidden');
    }

    // Additional Metals Load
    additionalMetals.forEach(part => this.createMetalPartRow(part));

    // Stones Load
    const stones = item.stones || [];
    stones.forEach(stone => this.createStoneRow(stone));

    // Diamonds Load (loaded into same stones container)
    const dp = item.diamondsPolki || [];
    dp.forEach(d => this.createStoneRow({ ...d, type: d.type || 'Diamond' }));

    // Commission Configuration (Manual)
    if (item.commission !== undefined && item.commission !== null) {
      const commVal = typeof item.commission === 'object' ? item.commission.value : item.commission;
      document.getElementById('item-commission').value = (commVal !== undefined && commVal !== null && commVal !== '') ? commVal : '';
    } else {
      document.getElementById('item-commission').value = '';
    }

    this.resetModalTabs();
    this.updateFormCalculations();
    this.updateSkuSuggestion();
  },

  /**
   * Dynamically calculate and display suggested next SKU for selected category
   */
  updateSkuSuggestion() {
    const helperEl = document.getElementById('sku-helper-text');
    if (!helperEl) return;

    const categorySelect = document.getElementById('item-category');
    if (!categorySelect) return;

    const category = categorySelect.value || 'Ring';
    const isEdit = this.activeItemState && this.activeItemState.id !== undefined;

    // Standardized Prefixes mapping (supports both singular and plural)
    const prefixes = {
      'Earrings': 'EAR-',
      'Earring': 'EAR-',
      'Rings': 'RNG-',
      'Ring': 'RNG-',
      'Necklaces': 'NCK-',
      'Necklace': 'NCK-',
      'Bracelets': 'BRC-',
      'Bracelet': 'BRC-',
      'Pendants': 'PND-',
      'Pendant': 'PND-',
      'Other': 'JWL-'
    };

    const prefix = prefixes[category] || 'JWL-';
    const allItems = DBManager.getItems();
    const normCat = (category || '').toLowerCase().replace(/s$/, '');

    const categoryItems = allItems.filter(item => {
      const itemNorm = (item.category || '').toLowerCase().replace(/s$/, '');
      return itemNorm === normCat || (item.sku && item.sku.toUpperCase().startsWith(prefix.toUpperCase()));
    });
    const count = categoryItems.length;

    // Find highest suffix number in existing SKUs of this category
    let maxNum = 0;
    allItems.forEach(item => {
      if (item.sku && item.sku.toUpperCase().startsWith(prefix.toUpperCase())) {
        const match = item.sku.match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const nextNum = maxNum > 0 ? maxNum + 1 : 1;
    const formattedNum = String(nextNum).padStart(2, '0');
    const suggestedSku = `${prefix}${formattedNum}`;

    const skuInput = document.getElementById('item-sku');
    if (skuInput) {
      if (!isEdit && (!skuInput.value || skuInput.dataset.autoFilled === 'true' || skuInput.dataset.lastAutoSku === skuInput.value)) {
        skuInput.value = suggestedSku;
        skuInput.dataset.autoFilled = 'true';
        skuInput.dataset.lastAutoSku = suggestedSku;
      }

      helperEl.replaceChildren();
      if (isEdit) {
        helperEl.appendChild(document.createTextNode(`Next suggestion for new ${category}s: `));
        const skuSpan = document.createElement('span');
        skuSpan.style.color = 'var(--text-gold)';
        skuSpan.style.fontWeight = '600';
        skuSpan.textContent = suggestedSku;
        helperEl.appendChild(skuSpan);
        const countText = ` (${count} ${category}${count === 1 ? '' : 's'} exist)`;
        helperEl.appendChild(document.createTextNode(countText));
      } else {
        helperEl.appendChild(document.createTextNode('Suggested next SKU: '));
        const skuSpan = document.createElement('span');
        skuSpan.id = 'sku-suggestion-value';
        skuSpan.style.color = 'var(--text-gold)';
        skuSpan.style.fontWeight = '600';
        skuSpan.style.cursor = 'pointer';
        skuSpan.style.textDecoration = 'underline';
        skuSpan.title = 'Click to auto-fill';
        skuSpan.textContent = suggestedSku;
        helperEl.appendChild(skuSpan);
        const countText = ` (${count} ${category}${count === 1 ? '' : 's'} exist) — Auto-applied`;
        helperEl.appendChild(document.createTextNode(countText));

        skuSpan.addEventListener('click', () => {
          skuInput.value = suggestedSku;
          skuInput.dataset.autoFilled = 'true';
          skuInput.dataset.lastAutoSku = suggestedSku;
          this.showToast(`Applied SKU: ${suggestedSku}`);
        });
      }
    }
  }
};

window.UI = UI;
