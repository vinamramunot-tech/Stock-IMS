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
   * Resizes and compresses an uploaded image to keep database size tiny.
   * Compresses to max 400px width/height and saves as a high-quality JPEG.
   */
  processImageUpload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension limit: 400px
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Get compressed data url (quality 0.85)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Failed to load image file."));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Initialize Image Uploader Handlers
   */
  initImageUploader() {
    const dropzone = document.getElementById('image-dropzone');
    const fileInput = document.getElementById('item-image-file');
    const previewContainer = document.getElementById('uploader-preview');
    const previewImg = document.getElementById('uploaded-img-el');
    const promptContainer = document.getElementById('uploader-prompt');
    const removeBtn = document.getElementById('btn-remove-image');

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
      UI.activeItemState.image = null;
    });

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
        UI.activeItemState.image = compressedBase64;
      } catch (err) {
        UI.showToast(err.message, true);
      }
    }
  },

  /**
   * Metals Components UI Builders
   */
  createMetalPartRow(part = { name: '', karat: 18, weight: '' }) {
    const container = document.getElementById('metals-list-container');
    const partId = 'metal_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    const row = document.createElement('div');
    row.className = 'metal-part-entry-card';
    row.id = partId;

    row.innerHTML = `
      <div class="input-group" style="margin-bottom:0;">
        <label>Part Name</label>
        <input type="text" class="metal-part-name" placeholder="e.g. Main Ring Shank" value="${part.name || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Karat (KT)</label>
        <input type="number" class="metal-part-karat recalc-trigger" step="0.01" min="0" max="24" placeholder="e.g. 18" value="${part.karat || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Weight (grams)</label>
        <input type="number" class="metal-part-weight recalc-trigger" step="0.01" min="0" placeholder="0.00" value="${part.weight || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Metal Value (₹)</label>
        <div class="readonly-calc-box metal-part-val">₹0.00</div>
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

    const triggerRecalc = () => {
      this.updatePartValuation(row);
      this.updateFormCalculations();
    };

    // Karat updates on change, input, and keyup
    karatSelect.addEventListener('change', triggerRecalc);
    karatSelect.addEventListener('input', triggerRecalc);
    karatSelect.addEventListener('keyup', triggerRecalc);

    // Weight updates on typing (input), change, and key release (keyup)
    weightInput.addEventListener('input', triggerRecalc);
    weightInput.addEventListener('change', triggerRecalc);
    weightInput.addEventListener('keyup', triggerRecalc);

    // Name changes
    nameInput.addEventListener('input', triggerRecalc);

    container.appendChild(row);
    this.updatePartValuation(row); // Initial calculation
  },

  updatePartValuation(row) {
    const karat = Number(row.querySelector('.metal-part-karat').value || 18);
    const weight = Number(row.querySelector('.metal-part-weight').value || 0);
    const goldRate24kt = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const wastage = Number(document.getElementById('item-wastage').value || 0);
    
    const baseValue = Calc.calculateMetalValue(weight, karat, goldRate24kt);
    const valueWithWastage = baseValue * (1 + wastage / 100);
    row.querySelector('.metal-part-val').textContent = `₹${valueWithWastage.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  },

  /**
   * Colored Gemstone Components UI Builders
   */
  createStoneRow(stone = { type: 'Emerald', shape: '', weight: '', ratePerCarat: '', totalValue: '', pieces: '' }) {
    const container = document.getElementById('stones-list-container');
    const stoneId = 'stone_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const safeStoneType = this.escapeHtml(stone.type || '');
    const safeStoneShape = this.escapeHtml(stone.shape || '');
    const safeStonePieces = this.escapeHtml(stone.pieces || '');
    const safeStoneWeight = this.escapeHtml(stone.weight || '');

    const card = document.createElement('div');
    card.className = 'stone-entry-card';
    card.id = stoneId;
    card.setAttribute('data-stone-type', stone.type);

    card.innerHTML = `
      <div class="input-group" style="margin-bottom:0;">
        <label>${safeStoneType} - Shape/Cut</label>
        <input type="text" class="stone-shape" placeholder="e.g. Oval Mixed" value="${safeStoneShape}">
      </div>
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
        <input type="number" class="stone-rate recalc-trigger" step="0.01" min="0" placeholder="0.00" value="${stone.ratePerCarat || ''}">
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label>Total Stone Value (₹)</label>
        <input type="number" class="stone-total-val" step="0.01" min="0" placeholder="0.00" value="${stone.totalValue || ''}">
      </div>
      <div class="entry-card-btn-col" style="padding-bottom:0;">
        <span style="font-size:11px; color:var(--text-muted); cursor:pointer;" class="btn-remove-stone-card">&times; Erase</span>
      </div>
    `;

    // Wire up events
    const piecesInput = card.querySelector('.stone-pieces');
    const weightInput = card.querySelector('.stone-weight');
    const rateInput = card.querySelector('.stone-rate');
    const totalInput = card.querySelector('.stone-total-val');
    
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
    const goldRate24kt = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);

    // Gathers items state on the fly
    const currentItem = {
      labourCost: Number(document.getElementById('item-labour').value || 0),
      wastage: Number(document.getElementById('item-wastage').value || 0),
      profitPercentage: Number(document.getElementById('item-profit-pct').value || 100),
      commission: {
        value: Number(document.getElementById('item-commission').value || 0),
        isManual: this.activeItemState && this.activeItemState.commission ? this.activeItemState.commission.isManual : false
      },
      metals: [],
      stones: [],
      diamondsPolki: []
    };

    // Metals
    const metalRows = document.querySelectorAll('.metal-part-entry-card');
    metalRows.forEach(row => {
      const name = row.querySelector('.metal-part-name').value || 'Body Part';
      const karat = Number(row.querySelector('.metal-part-karat').value);
      const weight = Number(row.querySelector('.metal-part-weight').value || 0);
      currentItem.metals.push({ name, karat, weight });
    });

    // Stones & Diamonds
    const stoneRows = document.querySelectorAll('.stone-entry-card');
    stoneRows.forEach(row => {
      const type = row.getAttribute('data-stone-type') || 'Emerald';
      const shape = row.querySelector('.stone-shape').value || 'Mixed';
      const pieces = Number(row.querySelector('.stone-pieces').value || 0);
      const weight = Number(row.querySelector('.stone-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.stone-rate').value || 0);
      const totalValue = Number(row.querySelector('.stone-total-val').value || 0);
      
      const component = { type, shape, pieces, weight, ratePerCarat, totalValue };
      if (type === 'Diamond' || type === 'Polki') {
        currentItem.diamondsPolki.push(component);
      } else {
        currentItem.stones.push(component);
      }
    });

    // Perform Evaluation
    const evalResult = Calc.evaluateItem(currentItem, goldRate24kt);

    // Update Form View
    document.getElementById('summary-metal-subtotal').textContent = `₹${evalResult.metalSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const combinedStonesVal = evalResult.stoneSubtotal + evalResult.diamondSubtotal;
    document.getElementById('summary-stone-subtotal').textContent = `₹${combinedStonesVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('summary-labour-subtotal').textContent = `₹${evalResult.subtotal ? currentItem.labourCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}`;
    
    document.getElementById('summary-subtotal').textContent = `₹${evalResult.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // Commission Slab indicator text
    const commSlabIndicator = document.getElementById('slab-indicator');
    commSlabIndicator.textContent = `Commission Slab: ${evalResult.commissionPercentage}% bracket (Subtotal: ₹${evalResult.subtotal.toLocaleString()})`;

    // Check commission overrides
    const commInput = document.getElementById('item-commission');
    const commBadge = document.getElementById('comm-percentage-badge');
    const resetCommBtn = document.getElementById('btn-toggle-manual-commission');

    if (!evalResult.isManualCommission) {
      commInput.value = evalResult.commissionValue > 0 ? evalResult.commissionValue : '';
      commBadge.textContent = `${evalResult.commissionPercentage}%`;
      resetCommBtn.classList.add('hidden');
    } else {
      commBadge.textContent = `Manual (${evalResult.commissionPercentage}%)`;
      resetCommBtn.classList.remove('hidden');
    }

    document.getElementById('summary-grand-total').textContent = `₹${evalResult.marketCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    
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
    document.getElementById('item-wastage').value = '15.00';
    document.getElementById('item-profit-pct').value = '40.0';
    document.getElementById('metals-list-container').innerHTML = '';
    document.getElementById('stones-list-container').innerHTML = '';
    
    // Reset image uploader display
    document.getElementById('item-image-file').value = '';
    document.getElementById('uploaded-img-el').src = '';
    document.getElementById('uploader-preview').classList.add('hidden');
    document.getElementById('uploader-prompt').classList.remove('hidden');

    // No checkboxes to uncheck

    // Default metals/stones (can start empty)
    this.resetModalTabs();
    this.updateFormCalculations();
  },

  /**
   * Pre-fill the form with item data for editing
   */
  loadItemIntoForm(item) {
    this.resetForm();
    
    // De-reference values to prevent direct mutation of state before save
    this.activeItemState = JSON.parse(JSON.stringify(item));

    document.getElementById('item-name').value = item.name || '';
    document.getElementById('item-sku').value = item.sku || '';
    document.getElementById('item-category').value = item.category || 'Ring';
    document.getElementById('item-labour').value = item.labourCost || '';
    document.getElementById('item-wastage').value = item.wastage !== undefined ? Number(item.wastage).toFixed(2) : '15.00';
    document.getElementById('item-profit-pct').value = item.profitPercentage !== undefined ? Number(item.profitPercentage).toFixed(1) : '40.0';
    document.getElementById('item-description').value = item.description || '';

    // Image Setup
    if (item.image) {
      document.getElementById('uploaded-img-el').src = item.image;
      document.getElementById('uploader-prompt').classList.add('hidden');
      document.getElementById('uploader-preview').classList.remove('hidden');
    }

    // Metals Load
    const metals = item.metals || [];
    metals.forEach(part => this.createMetalPartRow(part));

    // Stones Load
    const stones = item.stones || [];
    stones.forEach(stone => this.createStoneRow(stone));

    // Diamonds Load (loaded into same stones container)
    const dp = item.diamondsPolki || [];
    dp.forEach(d => this.createStoneRow({ ...d, type: d.type || 'Diamond' }));

    // Commission Configuration
    if (item.commission && item.commission.isManual) {
      document.getElementById('item-commission').value = item.commission.value || '';
    }

    this.resetModalTabs();
    this.updateFormCalculations();
  }
};

window.UI = UI;
