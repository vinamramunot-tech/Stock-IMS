/**
 * Master Application Coordinator for Mava Gems (Direct-Access Edition)
 * Manages view states, direct boot loaders, search catalog grids, logs, and settings.
 */

const App = {
  activeTab: 'tab-catalog',

  async init() {
    // 1. Check if there is a remembered database path in the application local configuration and show the appropriate screen
    await this.showStartupScreen();


    // Onboarding setup button click listeners
    document.getElementById('btn-startup-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-open').addEventListener('click', () => this.handleStartupOpen());

    // Confirmation screen button click listeners
    document.getElementById('btn-startup-continue').addEventListener('click', () => this.handleStartupContinue());
    document.getElementById('btn-startup-confirm-create').addEventListener('click', () => this.handleStartupCreate());
    document.getElementById('btn-startup-confirm-open').addEventListener('click', () => this.handleStartupOpen());

    // Global keydown event listener to confirm database path when Enter is pressed
    window.addEventListener('keydown', (e) => {
      const confirmView = document.getElementById('startup-confirm-path-view');
      const startupScreen = document.getElementById('startup-screen');
      if (
        confirmView && !confirmView.classList.contains('hidden') &&
        startupScreen && !startupScreen.classList.contains('hidden') &&
        e.key === 'Enter'
      ) {
        e.preventDefault();
        this.handleStartupContinue();
      }
    });

    // Editable database path listener (on enter connect) and browse button listener
    const activeVaultInput = document.getElementById('active-vault-input');
    if (activeVaultInput) {
      activeVaultInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleVaultPathChange(e.target.value.trim());
        }
      });
    }
    const btnBrowseVault = document.getElementById('btn-browse-vault');
    if (btnBrowseVault) {
      btnBrowseVault.addEventListener('click', () => this.handleStartupOpen());
    }

    // Listen for external database changes to support instant hot-reloading
    window.electronAPI.onDatabaseChanged((filePath) => this.handleExternalDbChange(filePath));

    // 2. Tab switching navigation listeners
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        this.switchTab(target);
      });
    });

    // Sidebar special Add Item button click listener
    document.getElementById('btn-nav-add-item').addEventListener('click', () => {
      const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
      if (!goldRate || goldRate <= 0) {
        UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before adding jewelry pieces to ensure correct metal valuations.", true);
        return;
      }
      UI.resetForm();
      document.getElementById('jewelry-modal-title').textContent = "Add New Jewelry Piece";
      UI.openModal('modal-jewelry-item');
    });

    // 3. Modal close elements wire up
    const closeTriggers = document.querySelectorAll('.modal-close-trigger');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-jewelry-item');
        UI.closeModal('modal-gold-rate');
        UI.closeModal('modal-erase-confirm');
      });
    });

    // Gold Rate Modal Update click trigger
    document.getElementById('btn-edit-gold-rate').addEventListener('click', () => {
      const currentRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
      document.getElementById('gold-rate-input').value = currentRate > 0 ? currentRate : '';
      document.getElementById('gold-rate-date').value = new Date().toISOString().split('T')[0];
      UI.openModal('modal-gold-rate');
    });
    document.getElementById('btn-save-gold-rate').addEventListener('click', () => this.handleUpdateGoldRate());

    // Item modal tab controllers initialization
    UI.initModalTabs();
    UI.initImageUploader();
    UI.initStoneSelectors();
    UI.initDPSelectors();

    // Dynamic metal row button click
    document.getElementById('btn-add-metal-part').addEventListener('click', () => {
      UI.createMetalPartRow();
      UI.updateFormCalculations();
    });

    // Manual commission override typing listener
    const commInput = document.getElementById('item-commission');
    commInput.addEventListener('input', () => {
      if (UI.activeItemState) {
        UI.activeItemState.commission = {
          value: Number(commInput.value || 0),
          isManual: true
        };
        UI.updateFormCalculations();
      }
    });

    // Labour cost and metal wastage input change listener
    document.getElementById('item-labour').addEventListener('input', () => UI.updateFormCalculations());
    document.getElementById('item-wastage').addEventListener('input', () => {
      // Recompute individual metal part rows with new wastage percentage
      document.querySelectorAll('.metal-part-entry-card').forEach(row => {
        UI.updatePartValuation(row);
      });
      UI.updateFormCalculations();
    });

    // Auto reset commission button click
    document.getElementById('btn-toggle-manual-commission').addEventListener('click', () => {
      if (UI.activeItemState) {
        UI.activeItemState.commission = {
          value: 0,
          isManual: false
        };
        UI.updateFormCalculations();
      }
    });

    // Save jewelry piece click
    document.getElementById('btn-save-jewelry-piece').addEventListener('click', () => this.handleSaveJewelryPiece());

    // Catalog filtering, searching, and sorting watch inputs
    document.getElementById('search-input').addEventListener('input', () => this.renderCatalogGrid());
    document.getElementById('filter-category').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('filter-karat').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('sort-items').addEventListener('change', () => this.renderCatalogGrid());
    document.getElementById('btn-empty-add').addEventListener('click', () => {
      const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
      if (!goldRate || goldRate <= 0) {
        UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before adding jewelry pieces to ensure correct metal valuations.", true);
        return;
      }
      UI.resetForm();
      UI.openModal('modal-jewelry-item');
    });

    // Settings actions listeners
    document.getElementById('btn-disconnect-vault').addEventListener('click', () => this.handleDisconnectVault());
    document.getElementById('btn-export-backup').addEventListener('click', () => this.handleExportBackup());
    document.getElementById('btn-import-backup').addEventListener('click', () => this.handleImportBackup());
    document.getElementById('btn-erase-vault').addEventListener('click', () => {
      document.getElementById('erase-confirm-input').value = '';
      document.getElementById('btn-erase-vault-confirm').disabled = true;
      UI.openModal('modal-erase-confirm');
    });
    
    document.getElementById('erase-confirm-input').addEventListener('input', (e) => {
      const confirmBtn = document.getElementById('btn-erase-vault-confirm');
      confirmBtn.disabled = e.target.value !== 'ERASE';
    });
    document.getElementById('btn-erase-vault-confirm').addEventListener('click', () => this.handleEraseVault());
    document.getElementById('btn-clear-logs').addEventListener('click', () => this.handleClearLogs());
  },

  async showStartupScreen() {
    const rememberedPath = await window.electronAPI.getLastDbPath();
    if (rememberedPath) {
      document.getElementById('startup-initial-setup-view').classList.add('hidden');
      document.getElementById('startup-confirm-path-view').classList.remove('hidden');
      document.getElementById('startup-db-path-text').textContent = rememberedPath;
    } else {
      document.getElementById('startup-confirm-path-view').classList.add('hidden');
      document.getElementById('startup-initial-setup-view').classList.remove('hidden');
    }
    document.getElementById('app-workspace').classList.add('hidden');
    document.getElementById('startup-screen').classList.remove('hidden');
  },

  hideStartupScreen() {
    document.getElementById('startup-screen').classList.add('hidden');
    document.getElementById('app-workspace').classList.remove('hidden');
  },

  async handleStartupCreate() {
    try {
      const chosenPath = await window.electronAPI.createDbDialog();
      if (!chosenPath) return; // User canceled

      const initResult = await DBManager.initVault(chosenPath);
      if (initResult.success) {
        this.hideStartupScreen();
        // Populate path indicators in UI
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = chosenPath;
          activeInput.title = chosenPath;
        }
        document.getElementById('settings-vault-path').textContent = chosenPath;
        
        UI.showToast("Database successfully initialized!");
        this.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Database initialization failure: " + err.message, true);
    }
  },

  async handleStartupOpen() {
    try {
      const chosenPath = await window.electronAPI.openDbDialog();
      if (!chosenPath) return; // User canceled

      await this.bootstrapDatabase(chosenPath);
    } catch (err) {
      console.error(err);
      UI.showToast("Database connection failure: " + err.message, true);
    }
  },

  async handleStartupContinue() {
    try {
      const rememberedPath = await window.electronAPI.getLastDbPath();
      if (rememberedPath) {
        await this.bootstrapDatabase(rememberedPath);
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Database load failure: " + err.message, true);
    }
  },

  async handleDisconnectVault() {
    const check = confirm("Are you sure you want to disconnect this database?\n\nThis will safely close the active catalog and return you to the setup dashboard, where you can choose a different database or create a new one. Your data remains perfectly intact at its current location.");
    if (!check) return;

    try {
      // Clear memory active database state
      DBManager.database = null;
      DBManager.activePath = null;
      DBManager.isLoaded = false;

      // Reset last active database path in config file
      await window.electronAPI.setLastDbPath(null);

      UI.showToast("Database disconnected successfully.");
      await this.showStartupScreen();
    } catch (err) {
      UI.showToast("Failed to disconnect: " + err.message, true);
    }
  },

  async handleExternalDbChange(filePath) {
    if (!DBManager.isLoaded || DBManager.activePath !== filePath) return;
    
    try {
      // Reload vault state from disk silently
      const loadResult = await DBManager.loadVault(filePath);
      if (loadResult.success) {
        UI.showToast("Database updated externally; refreshing catalog.");
        this.refreshAllDisplays();
      }
    } catch (err) {
      console.error("Failed to hot-reload database:", err);
    }
  },

  async handleVaultPathChange(newPath) {
    if (!newPath) {
      UI.showToast("Please enter a valid database path.", true);
      const activeInput = document.getElementById('active-vault-input');
      if (activeInput) activeInput.value = DBManager.activePath || '';
      return;
    }
    try {
      const loadResult = await DBManager.loadVault(newPath);
      if (loadResult.success) {
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = newPath;
          activeInput.title = newPath;
        }
        document.getElementById('settings-vault-path').textContent = newPath;
        UI.showToast("Successfully connected to the new database!");
        this.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Failed to connect to database: " + err.message, true);
      // Revert input field value
      const activeInput = document.getElementById('active-vault-input');
      if (activeInput) activeInput.value = DBManager.activePath || '';
    }
  },

  /**
   * Bootstrap Database loading routine.
   */
  async bootstrapDatabase(customPath) {
    if (!customPath) {
      await this.showStartupScreen();
      return;
    }
    try {
      const loadResult = await DBManager.loadVault(customPath);
      
      if (loadResult.success) {
        this.hideStartupScreen();
        // Populate path indicators in UI
        const activeInput = document.getElementById('active-vault-input');
        if (activeInput) {
          activeInput.value = customPath;
          activeInput.title = customPath;
        }
        document.getElementById('settings-vault-path').textContent = customPath;
        
        UI.showToast("Database successfully loaded!");
        this.refreshAllDisplays();
      }
    } catch (err) {
      console.error(err);
      UI.showToast("Database file read failure: " + err.message, true);
      await this.showStartupScreen(); // Redirect back to setup screen if file is corrupted/missing
    }
  },

  /**
   * Refresh views
   */
  refreshAllDisplays() {
    this.renderDashboard();
    this.renderCatalogGrid();
    this.renderActivityLogs();
    
    // Update settings tab path display
    document.getElementById('settings-vault-path').textContent = DBManager.activePath || '';
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    // Nav active toggle
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
      const target = item.getAttribute('data-target');
      if (target === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Content active toggle
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => {
      if (c.id === tabId) {
        c.classList.remove('hidden');
        c.classList.add('active');
      } else {
        c.classList.remove('active');
        c.classList.add('hidden');
      }
    });

    this.refreshAllDisplays();
  },

  populateKaratFilterOptions() {
    const filterSelect = document.getElementById('filter-karat');
    if (!filterSelect) return;

    // Remember currently selected karat
    const currentSelected = filterSelect.value;

    // Gather all unique karats from the items
    const allItems = DBManager.getItems();
    const uniqueKarats = new Set();
    
    allItems.forEach(item => {
      (item.metals || []).forEach(m => {
        if (m.karat !== undefined && m.karat !== null && !isNaN(m.karat)) {
          uniqueKarats.add(Number(m.karat));
        }
      });
    });

    // Sort karats descending
    const sortedKarats = Array.from(uniqueKarats).sort((a, b) => b - a);

    // Build options HTML
    let optionsHtml = `<option value="">All Karats</option>`;
    sortedKarats.forEach(kt => {
      optionsHtml += `<option value="${kt}">${kt}KT Gold</option>`;
    });

    // To prevent infinite loops or cursor loss during keyup, only update DOM if options actually changed
    const currentOptionsString = Array.from(filterSelect.options).map(o => o.value).join(',');
    const newOptionsString = ["", ...sortedKarats].join(',');
    
    if (currentOptionsString !== newOptionsString) {
      filterSelect.innerHTML = optionsHtml;
      // Restore selected value if still valid
      if (uniqueKarats.has(Number(currentSelected))) {
        filterSelect.value = currentSelected;
      } else {
        filterSelect.value = "";
      }
    }
  },

  /**
   * Dashboard Rendering
   */
  renderDashboard() {
    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const items = DBManager.getItems();

    // Rates header rendering
    const dateStr = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate : '';
    document.getElementById('header-gold-rate').textContent = goldRate > 0 ? `₹${goldRate.toLocaleString()}/g` : '₹0.00/g';
    document.getElementById('header-gold-date').textContent = dateStr ? `Effective: ${new Date(dateStr).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}` : 'No date set';

    let totalPortfolioValuation = 0;
    let totalGoldWeight = 0;
    let totalGemWeight = 0;

    items.forEach(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      totalPortfolioValuation += evaluation.grandTotal;

      // Sum metals weight
      const metals = item.metals || [];
      metals.forEach(m => totalGoldWeight += Number(m.weight || 0));

      // Sum stones weight (cts)
      const stones = item.stones || [];
      stones.forEach(s => totalGemWeight += Number(s.weight || 0));

      // Sum diamonds weight (cts)
      const dp = item.diamondsPolki || [];
      dp.forEach(d => totalGemWeight += Number(d.weight || 0));
    });

    // Render Metrics Box
    document.getElementById('metric-total-valuation').textContent = `₹${totalPortfolioValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('metric-total-pieces').textContent = items.length;
    document.getElementById('metric-gold-weight').textContent = `${totalGoldWeight.toFixed(3)} g`;
    document.getElementById('metric-gem-weight').textContent = `${totalGemWeight.toFixed(2)} cts`;
  },

  /**
   * Catalog Grid Rendering
   */
  renderCatalogGrid() {
    const gridContainer = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const filterCat = document.getElementById('filter-category').value;
    
    // Dynamically populate the karat dropdown filter based on actual catalog items
    this.populateKaratFilterOptions();
    
    const filterKarat = document.getElementById('filter-karat').value;
    const sortVal = document.getElementById('sort-items').value;

    const goldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    const allItems = DBManager.getItems();

    // Clear grid
    gridContainer.innerHTML = '';

    // Filter Items
    let filtered = allItems.filter(item => {
      // 1. Text Search
      const matchesSearch = !query || 
        (item.name || '').toLowerCase().includes(query) || 
        (item.sku || '').toLowerCase().includes(query) || 
        (item.description || '').toLowerCase().includes(query) ||
        (item.metals || []).some(m => (m.name || '').toLowerCase().includes(query));

      // 2. Category Filter
      const matchesCat = !filterCat || item.category === filterCat;

      // 3. Karat Filter
      const matchesKarat = !filterKarat || (item.metals || []).some(m => m.karat == filterKarat);

      return matchesSearch && matchesCat && matchesKarat;
    });

    // Evaluate valuation before sorting so we can sort dynamically by calculated values!
    filtered = filtered.map(item => {
      const evaluation = Calc.evaluateItem(item, goldRate);
      return {
        ...item,
        calculatedTotal: evaluation.grandTotal,
        evaluation: evaluation
      };
    });

    // Sort Items
    if (sortVal === 'newest') {
      filtered.sort((a, b) => Number(b.id.split('_')[1] || 0) - Number(a.id.split('_')[1] || 0));
    } else if (sortVal === 'val-high') {
      filtered.sort((a, b) => b.calculatedTotal - a.calculatedTotal);
    } else if (sortVal === 'val-low') {
      filtered.sort((a, b) => a.calculatedTotal - b.calculatedTotal);
    } else if (sortVal === 'name-az') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gridContainer.classList.remove('hidden');

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'product-card';

      // Build specs preview string
      const metalsStr = (item.metals || []).map(m => `${m.karat}KT (${m.weight}g)`).join(', ');
      
      let totalMetalWeight = 0;
      (item.metals || []).forEach(m => totalMetalWeight += Number(m.weight || 0));

      let stonesSum = 0;
      (item.stones || []).forEach(s => stonesSum += Number(s.weight || 0));
      (item.diamondsPolki || []).forEach(d => stonesSum += Number(d.weight || 0));

      const grossWeight = totalMetalWeight + (stonesSum * 0.2);

      const imageHtml = item.image 
        ? `<img src="${item.image}" alt="${item.name}" class="product-img">`
        : `<svg viewBox="0 0 24 24" width="60" height="60" class="product-fallback-svg"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>`;

      card.innerHTML = `
        <div class="product-img-box">
          ${imageHtml}
          <div class="product-cat-badge">${item.category || 'Jewelry'}</div>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <div class="product-sku">${item.sku || 'SKU-NONE'}</div>
            <h3 class="product-title">${item.name || 'Unnamed Piece'}</h3>
          </div>
          
          <div class="product-specs">
            <div class="specs-line" title="${metalsStr}"><strong>Metal:</strong> ${metalsStr || 'None added'}</div>
            <div class="specs-line"><strong>Gemstones:</strong> ${stonesSum > 0 ? stonesSum.toFixed(2) + ' cts total' : 'None added'}</div>
            <div class="specs-line"><strong>Gross Weight:</strong> ${grossWeight.toFixed(3)} g</div>
            <div class="specs-line" style="margin-bottom:0;" title="${item.description || ''}"><strong>Notes:</strong> ${item.description || 'No description'}</div>
          </div>
          
          <div class="product-price-row">
            <div>
              <div class="price-lbl">MARKET COST PRICE</div>
              <div class="price-val" style="font-size: 15px; color: var(--text-muted); margin-bottom: 8px;">₹${item.evaluation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div class="price-lbl">SELLING PRICE</div>
              <div class="price-val">₹${item.calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="product-actions">
              <button type="button" class="btn btn-secondary btn-small btn-edit" title="Edit details">Edit</button>
              <button type="button" class="btn btn-danger btn-small btn-delete" title="Delete piece">Delete</button>
            </div>
          </div>
        </div>
      `;

      // Event Wire up
      card.querySelector('.btn-edit').addEventListener('click', () => {
        document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece";
        UI.loadItemIntoForm(item);
        UI.openModal('modal-jewelry-item');
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        this.handleDeleteItem(item);
      });

      gridContainer.appendChild(card);
    });
  },

  /**
   * Save Jewelry Item additions / edits
   */
  async handleSaveJewelryPiece() {
    const name = document.getElementById('item-name').value.trim();
    const sku = document.getElementById('item-sku').value.trim();
    const category = document.getElementById('item-category').value;
    const description = document.getElementById('item-description').value.trim();
    const labourCost = Number(document.getElementById('item-labour').value || 0);

    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    if (!goldRate || goldRate <= 0) {
      UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before saving jewelry pieces.", true);
      return;
    }

    if (!name || !sku || !category) {
      UI.showToast("Please fill all required fields (*) in the General tab.", true);
      return;
    }

    // Check duplicate SKUs (only if new, or modified on existing)
    const isEdit = UI.activeItemState && UI.activeItemState.id;
    const allItems = DBManager.getItems();
    const isSkuDuplicate = allItems.some(i => i.sku === sku && (!isEdit || i.id !== UI.activeItemState.id));
    if (isSkuDuplicate) {
      UI.showToast(`The SKU code "${sku}" is already in use by another piece.`, true);
      return;
    }

    // Reconstruct updated / new item
    const savedItem = {
      id: isEdit ? UI.activeItemState.id : 'item_' + Date.now(),
      name,
      sku,
      category,
      description,
      image: UI.activeItemState.image || null,
      metals: [],
      stones: [],
      diamondsPolki: [],
      labourCost,
      wastage: Number(document.getElementById('item-wastage').value || 0),
      commission: {
        value: Number(document.getElementById('item-commission').value || 0),
        isManual: UI.activeItemState.commission ? UI.activeItemState.commission.isManual : false
      },
      createdAt: isEdit ? UI.activeItemState.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Gather components
    // Metals
    const metalRows = document.querySelectorAll('.metal-part-entry-card');
    metalRows.forEach(row => {
      const partName = row.querySelector('.metal-part-name').value.trim() || 'Body Component';
      const karat = Number(row.querySelector('.metal-part-karat').value);
      const weight = Number(row.querySelector('.metal-part-weight').value || 0);
      savedItem.metals.push({ name: partName, karat, weight });
    });

    // Stones
    const stoneRows = document.querySelectorAll('.stone-entry-card');
    stoneRows.forEach(row => {
      const type = row.getAttribute('data-stone-type');
      const shape = row.querySelector('.stone-shape').value.trim() || 'Mixed';
      const pieces = Number(row.querySelector('.stone-pieces').value || 0);
      const weight = Number(row.querySelector('.stone-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.stone-rate').value || 0);
      const totalValue = Number(row.querySelector('.stone-total-val').value || 0);
      savedItem.stones.push({ type, shape, pieces, weight, ratePerCarat, totalValue });
    });

    // Diamonds/Polki
    const dpRows = document.querySelectorAll('.dp-entry-card');
    dpRows.forEach(row => {
      const type = row.getAttribute('data-dp-type');
      const shape = row.querySelector('.dp-shape').value.trim() || 'Round';
      const pieces = Number(row.querySelector('.dp-pieces').value || 0);
      const weight = Number(row.querySelector('.dp-weight').value || 0);
      const ratePerCarat = Number(row.querySelector('.dp-rate').value || 0);
      const totalValue = Number(row.querySelector('.dp-total-val').value || 0);
      savedItem.diamondsPolki.push({ type, shape, pieces, weight, ratePerCarat, totalValue });
    });

    // Recalculate dynamic subtotals for logging
    const evaluation = Calc.evaluateItem(savedItem, goldRate);
    savedItem.commission.value = evaluation.commissionValue; // Cache calculated commission in JSON

    try {
      if (isEdit) {
        // Deep Diff
        const changes = Logs.diffItem(UI.activeItemState, savedItem);
        const summary = Logs.buildSummary(changes, `Updated ${savedItem.name}`);
        
        DBManager.addLog("EDIT", savedItem.id, savedItem.name, summary, changes);

        // Replace item in array
        const index = DBManager.database.items.findIndex(i => i.id === savedItem.id);
        if (index !== -1) {
          DBManager.database.items[index] = savedItem;
        }
        UI.showToast("Jewelry details updated successfully!");
      } else {
        // Add
        DBManager.addLog("ADD", savedItem.id, savedItem.name, `Added new jewelry item: ${savedItem.name}`, []);
        DBManager.database.items.push(savedItem);
        UI.showToast("New jewelry piece added successfully!");
      }

      await DBManager.saveVault();
      UI.closeModal('modal-jewelry-item');
      this.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Delete Jewelry item
   */
  async handleDeleteItem(item) {
    const check = confirm(`Are you absolutely sure you want to delete "${item.name}" (SKU: ${item.sku}) from stock? This cannot be undone.`);
    if (!check) return;

    try {
      DBManager.addLog("DELETE", item.id, item.name, `Deleted jewelry item: ${item.name}`, []);
      
      const index = DBManager.database.items.findIndex(i => i.id === item.id);
      if (index !== -1) {
        DBManager.database.items.splice(index, 1);
      }

      await DBManager.saveVault();
      UI.showToast("Item deleted from stock.");
      this.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Update Universal 24KT Gold Rate
   */
  async handleUpdateGoldRate() {
    const newRate = Number(document.getElementById('gold-rate-input').value || 0);
    const dateVal = document.getElementById('gold-rate-date').value;

    if (newRate <= 0) {
      UI.showToast("Please enter a valid rate price.", true);
      return;
    }
    if (!dateVal) {
      UI.showToast("Effective date is required.", true);
      return;
    }

    const oldRate = DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0;
    
    // Update DB
    DBManager.database.settings.goldRate24kt = {
      ratePerGram: newRate,
      effectiveDate: dateVal,
      updatedAt: new Date().toISOString()
    };

    // Logging rate rotation
    const changes = [
      { field: '24KT Gold Rate per Gram', old: `₹${oldRate.toLocaleString()}`, new: `₹${newRate.toLocaleString()}` },
      { field: 'Rate Effective Date', old: DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.effectiveDate || 'None' : 'None', new: dateVal }
    ];
    DBManager.addLog("GOLD_RATE_UPDATE", "gold_rate_24kt", "Universal Gold Rate", `Updated global gold price from ₹${oldRate.toLocaleString()} to ₹${newRate.toLocaleString()}`, changes);

    try {
      await DBManager.saveVault();
      UI.closeModal('modal-gold-rate');
      UI.showToast("Valuation rates successfully rotated!");
      this.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Activity logs table rendering
   */
  renderActivityLogs() {
    const tbody = document.getElementById('logs-tbody');
    const emptyState = document.getElementById('logs-empty-state');
    const logs = DBManager.getLogs();

    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.parentElement.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.parentElement.classList.remove('hidden');

    logs.forEach(log => {
      const row = document.createElement('tr');
      
      const badgeClass = log.action.toLowerCase() === 'gold_rate_update' ? 'gold' : log.action.toLowerCase();
      const actionLabel = log.action.replace('_', ' ');

      const timeFormatted = new Date(log.timestamp).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      // Diff visual rendering if edits exist
      let diffHtml = '';
      if (log.changes && log.changes.length > 0) {
        diffHtml = `<div class="log-diff-box">`;
        log.changes.forEach(c => {
          diffHtml += `
            <div class="log-diff-item">
              <span class="diff-field">${c.field}:</span>
              <span class="diff-old">${c.old}</span>
              <span class="diff-arrow">&rarr;</span>
              <span class="diff-new">${c.new}</span>
            </div>
          `;
        });
        diffHtml += `</div>`;
      }

      row.innerHTML = `
        <td class="log-time">${timeFormatted}</td>
        <td><span class="badge-action ${badgeClass}">${actionLabel}</span></td>
        <td class="log-target">${log.targetName || 'Vault'}</td>
        <td>
          <div class="log-summary">${log.details || ''}</div>
          ${diffHtml}
        </td>
      `;

      tbody.appendChild(row);
    });
  },



  /**
   * Export database backup
   */
  async handleExportBackup() {
    try {
      const defaultName = `mava_gems_backup_${new Date().toISOString().split('T')[0]}.db`;
      const exportPath = await window.electronAPI.exportBackupDialog(defaultName);
      if (!exportPath) return;

      await window.electronAPI.copyFile(DBManager.activePath, exportPath);
      UI.showToast("Database backup successfully exported!");
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Import Database backup
   */
  async handleImportBackup() {
    try {
      const backupPath = await window.electronAPI.importBackupDialog();
      if (!backupPath) return;

      const check = confirm("WARNING: Importing a backup will overwrite your current active database completely. Are you sure you want to proceed?");
      if (!check) return;

      // Copy backup to active database location
      await window.electronAPI.copyFile(backupPath, DBManager.activePath);
      
      // Bootstrap the newly imported database directly!
      await this.bootstrapDatabase(DBManager.activePath);
      UI.showToast("Database backup successfully imported!");
    } catch (err) {
      UI.showToast(err.message, true);
    }
  },

  /**
   * Destructive clear database file
   */
  async handleEraseVault() {
    try {
      // Erase vault by calling initVault directly on the active path
      await DBManager.initVault(DBManager.activePath);

      UI.closeModal('modal-erase-confirm');
      UI.showToast("Vault successfully wiped!");
      
      // Refresh displays directly with the fresh empty database
      this.refreshAllDisplays();
    } catch (err) {
      UI.showToast("Failed to erase: " + err.message, true);
    }
  },

  /**
   * Clear logs
   */
  async handleClearLogs() {
    const check = confirm("Are you sure you want to clear the activity log history? The vault will keep a single initialization log.");
    if (!check) return;

    try {
      DBManager.database.logs = [];
      DBManager.addLog("ADD", "vault", "Vault", "Activity logs cleared by administrator.", []);
      await DBManager.saveVault();
      
      UI.showToast("Audit logs successfully cleared.");
      this.refreshAllDisplays();
    } catch (err) {
      UI.showToast(err.message, true);
    }
  }
};

window.App = App;

// Bootstrap Application on fully loaded page
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
