/**
 * Master Application Coordinator for Mava Gems (Direct-Access Edition)
 * Manages view states, direct boot loaders, logs, and acts as the entry point.
 */

const App = {
  activeTab: 'tab-jewelry-analyzer',

  async init() {
    // 1. Initialize Modules
    Startup.init();
    Catalog.init();
    Settings.init();
    this.initTheme();
    if (window.EmeraldController) {
      EmeraldController.init();
    }
    if (window.EmeraldDashboardController) {
      EmeraldDashboardController.init();
    }
    if (window.MemoController) {
      MemoController.init();
    }
    if (window.StoneController) {
      StoneController.init();
    }
    if (window.JewelStoneMemoController) {
      JewelStoneMemoController.init();
    }
    if (window.JewelryMemoController) {
      JewelryMemoController.init();
    }
    if (window.JewelrySalesController) {
      JewelrySalesController.init();
    }
    if (window.SalesController) {
      SalesController.init();
    }
    this.initLogs();
    UI.initScrollToTop();

    // 2. Tab switching navigation listeners
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        this.switchTab(target);
      });
    });


    // 3. Modal close elements wire up
    const closeTriggers = document.querySelectorAll('.modal-close-trigger');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-jewelry-item');
        UI.resetForm();
        UI.closeModal('modal-gold-rate');
        UI.closeModal('modal-usd-rate');
        UI.closeModal('modal-erase-confirm');
        UI.closeModal('modal-clear-logs-confirm');
      });
    });

    const detailCloseTriggers = document.querySelectorAll('.modal-close-trigger-detail');
    detailCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-jewelry-detail');
      });
    });

    const shareCloseTriggers = document.querySelectorAll('.modal-close-trigger-share-emerald');
    shareCloseTriggers.forEach(btn => {
      btn.addEventListener('click', () => {
        UI.closeModal('modal-share-emerald');
      });
    });

    // Item modal tab controllers initialization
    UI.initModalTabs();
    UI.initImageUploader();
    UI.initStoneSelectors();

    // SKU helper updates on category change
    document.getElementById('item-category').addEventListener('change', () => {
      UI.updateSkuSuggestion();
    });

    // Dynamic metal row button click
    document.getElementById('btn-add-metal-part').addEventListener('click', () => {
      UI.createMetalPartRow();
      UI.updateFormCalculations();
    });

    // Commission manual typing listener
    const commInput = document.getElementById('item-commission');
    if (commInput) {
      commInput.addEventListener('input', () => {
        if (UI.activeItemState) {
          UI.activeItemState.commission = {
            value: Number(commInput.value || 0),
            isManual: true
          };
        }
        UI.updateFormCalculations();
      });
    }

    // Labour cost, profit percentage, gross weight, karat, wastage, and per-item gold rate change listeners
    document.getElementById('item-labour').addEventListener('input', () => UI.updateFormCalculations());
    document.getElementById('item-profit-pct').addEventListener('input', () => UI.updateFormCalculations());
    const itemGoldRateInput = document.getElementById('item-gold-rate-24kt');
    if (itemGoldRateInput) {
      itemGoldRateInput.addEventListener('input', () => UI.updateFormCalculations());
      itemGoldRateInput.addEventListener('change', () => UI.updateFormCalculations());
      itemGoldRateInput.addEventListener('keyup', () => UI.updateFormCalculations());
    }
    
    const grossWtInput = document.getElementById('item-gross-weight');
    if (grossWtInput) {
      grossWtInput.addEventListener('input', () => UI.updateFormCalculations());
    }
    const karatInput = document.getElementById('item-karat');
    if (karatInput) {
      karatInput.addEventListener('input', () => UI.updateFormCalculations());
      karatInput.addEventListener('change', () => UI.updateFormCalculations());
    }
    const _wastageEl = document.getElementById('item-wastage');
    if (_wastageEl) {
      _wastageEl.addEventListener('input', () => UI.updateFormCalculations());
    }

    // Per-item gold rate: reset button restores global rate
    const _btnResetGoldRate = document.getElementById('btn-reset-gold-rate');
    const _itemGoldRateEl = document.getElementById('item-gold-rate-24kt');
    if (_btnResetGoldRate && _itemGoldRateEl) {
      _btnResetGoldRate.addEventListener('click', () => {
        const globalRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
        _itemGoldRateEl.value = globalRate > 0 ? globalRate : '';
        UI.updateFormCalculations();
      });
    }

    // Listen for external database changes to support instant hot-reloading
    window.electronAPI.onDatabaseChanged((filePath) => this.handleExternalDbChange(filePath));

    const photoSearchInput = document.getElementById('photo-search-input');
    if (photoSearchInput) {
      photoSearchInput.addEventListener('input', UI.debounce(() => this.renderJewelryPhotos(), 200));
    }

    const emeraldPhotoSearchInput = document.getElementById('emerald-photo-search-input');
    if (emeraldPhotoSearchInput) {
      emeraldPhotoSearchInput.addEventListener('input', UI.debounce(() => this.renderEmeraldPhotos(), 200));
    }

    // Mobile Menu Wire up
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
    const btnCloseMobileMenu = document.getElementById('btn-close-mobile-menu');

    if (btnMobileMenu && mobileMenuOverlay) {
      btnMobileMenu.addEventListener('click', () => {
        mobileMenuOverlay.classList.remove('hidden');
      });
    }

    if (btnCloseMobileMenu && mobileMenuOverlay) {
      btnCloseMobileMenu.addEventListener('click', () => {
        mobileMenuOverlay.classList.add('hidden');
      });
      // Click outside content to close
      mobileMenuOverlay.addEventListener('click', (e) => {
        if (e.target === mobileMenuOverlay) {
          mobileMenuOverlay.classList.add('hidden');
        }
      });
    }

    // Handle mobile menu clicks
    const mobileMenuItems = document.querySelectorAll('.mobile-menu-item');
    mobileMenuItems.forEach(item => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        mobileMenuOverlay.classList.add('hidden');

        if (action === 'tab-jewelry-analyzer' || action === 'tab-catalog' || action === 'tab-jewelry-sales' || action === 'tab-emerald-catalog' || action === 'tab-memos' || action === 'tab-logs' || action === 'tab-settings' || action === 'tab-stone-catalog' || action === 'tab-jewel-stone-memos' || action === 'tab-jewelry-memos' || action === 'tab-jewelry-photos' || action === 'tab-emerald-photos') {
          this.switchTab(action);
        } else if (action === 'add-jewelry') {
          const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
          if (!goldRate || goldRate <= 0) {
            UI.showToast("Please set the Universal 24KT Gold Rate at the top of the screen before adding jewelry pieces.", true);
            return;
          }
          UI.resetForm();
          UI.openModal('modal-jewelry-item');
        } else if (action === 'add-emerald') {
          if (window.EmeraldController) {
            window.EmeraldController.openAddModal();
          }
        } else if (action === 'add-memo') {
          if (window.MemoController) {
            window.MemoController.openCreateMemoModal();
          }
        } else if (action === 'add-stone') {
          if (window.StoneController) {
            window.StoneController.openAddModal();
          }
        } else if (action === 'add-jewel-stone-memo') {
          if (window.JewelStoneMemoController) {
            window.JewelStoneMemoController.openCreateMemoModal();
          }
        } else if (action === 'add-jewelry-memo') {
          if (window.JewelryMemoController) {
            window.JewelryMemoController.openCreateMemoModal();
          }
        } else if (action === 'switch-app') {
          this.showLauncher();
        }
      });
    });

    // Wire up Launcher Portal Buttons
    const btnLaunchJewelry = document.getElementById('btn-launch-jewelry');
    if (btnLaunchJewelry) {
      btnLaunchJewelry.addEventListener('click', () => this.launchApp('jewelry'));
    }
    const btnLaunchEmerald = document.getElementById('btn-launch-emerald');
    if (btnLaunchEmerald) {
      btnLaunchEmerald.addEventListener('click', () => this.launchApp('emerald'));
    }
    const btnLaunchStone = document.getElementById('btn-launch-stone');
    if (btnLaunchStone) {
      btnLaunchStone.addEventListener('click', () => this.launchApp('stone'));
    }
    const btnLauncherDisconnect = document.getElementById('btn-launcher-disconnect');
    if (btnLauncherDisconnect) {
      btnLauncherDisconnect.addEventListener('click', () => Startup.showStartupScreen());
    }
    const btnSidebarSwitchApp = document.getElementById('btn-sidebar-switch-app');
    if (btnSidebarSwitchApp) {
      btnSidebarSwitchApp.addEventListener('click', () => this.showLauncher());
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

  /**
   * Refresh views (Active tab rendered synchronously, background tabs deferred)
   */
  refreshAllDisplays() {
    const tab = this.activeTab || 'tab-catalog';

    // 1. Immediately render active tab & top header metrics for instant UI response
    Catalog.renderDashboard();

    if (tab === 'tab-catalog') {
      Catalog.renderCatalogGrid();
    } else if (tab === 'tab-jewelry-photos') {
      this.renderJewelryPhotos();
    } else if (tab === 'tab-jewelry-memos') {
      if (window.JewelryMemoController) JewelryMemoController.renderMemoList();
    } else if (tab === 'tab-jewelry-sales') {
      if (window.JewelrySalesController) JewelrySalesController.renderSalesList();
    } else if (tab === 'tab-emerald-catalog') {
      if (window.EmeraldController) {
        EmeraldController.renderEmeraldGrid();
        EmeraldController.populateGroupAutocomplete();
        EmeraldController.populateShapeAutocomplete();
        EmeraldController.populateMmAutocomplete();
      }
    } else if (tab === 'tab-emerald-photos') {
      this.renderEmeraldPhotos();
    } else if (tab === 'tab-emerald-analysis') {
      if (window.EmeraldDashboardController) EmeraldDashboardController.renderDashboard();
    } else if (tab === 'tab-memos') {
      if (window.MemoController) MemoController.renderMemoList();
    } else if (tab === 'tab-stone-catalog') {
      if (window.StoneController) {
        StoneController.renderStoneGrid();
        StoneController.populateGroupAutocomplete();
        StoneController.populateShapeAutocomplete();
        StoneController.populateMmAutocomplete();
        StoneController.populateGradeAutocomplete();
      }
    } else if (tab === 'tab-jewel-stone-memos') {
      if (window.JewelStoneMemoController) JewelStoneMemoController.renderMemoList();
    } else if (tab === 'tab-sales' || tab === 'tab-emerald-sales') {
      if (window.SalesController) SalesController.renderSalesList();
    } else if (tab === 'tab-logs') {
      this.renderActivityLogs();
    }

    const pathEl = document.getElementById('settings-vault-path');
    if (pathEl) pathEl.textContent = DBManager.activePath || '';

    // 2. Defer background non-active tab rendering to avoid UI thread lag
    setTimeout(() => {
      if (tab !== 'tab-catalog') Catalog.renderCatalogGrid();
      if (tab !== 'tab-jewelry-photos') this.renderJewelryPhotos();
      if (tab !== 'tab-jewelry-memos' && window.JewelryMemoController) JewelryMemoController.renderMemoList();
      if (tab !== 'tab-jewelry-sales' && window.JewelrySalesController) JewelrySalesController.renderSalesList();
      if (tab !== 'tab-emerald-catalog' && window.EmeraldController) {
        EmeraldController.renderEmeraldGrid();
        EmeraldController.populateGroupAutocomplete();
        EmeraldController.populateShapeAutocomplete();
        EmeraldController.populateMmAutocomplete();
      }
      if (tab !== 'tab-emerald-photos') this.renderEmeraldPhotos();
      if (tab !== 'tab-emerald-analysis' && window.EmeraldDashboardController) EmeraldDashboardController.renderDashboard();
      if (tab !== 'tab-memos' && window.MemoController) MemoController.renderMemoList();
      if (tab !== 'tab-stone-catalog' && window.StoneController) {
        StoneController.renderStoneGrid();
        StoneController.populateGroupAutocomplete();
        StoneController.populateShapeAutocomplete();
        StoneController.populateMmAutocomplete();
        StoneController.populateGradeAutocomplete();
      }
      if (tab !== 'tab-jewel-stone-memos' && window.JewelStoneMemoController) JewelStoneMemoController.renderMemoList();
      if (tab !== 'tab-sales' && tab !== 'tab-emerald-sales' && window.SalesController) SalesController.renderSalesList();
      if (tab !== 'tab-logs') this.renderActivityLogs();
    }, 50);
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

    const mainWorkArea = document.querySelector('.workspace-main');
    if (mainWorkArea) {
      mainWorkArea.scrollTop = 0;
    }
    if (UI.updateScrollToTop) {
      UI.updateScrollToTop();
    }

    this.refreshAllDisplays();
  },

  initLogs() {
    const searchInp = document.getElementById('logs-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', UI.debounce(() => this.renderActivityLogs(), 200));
    }

    const actionFilter = document.getElementById('logs-filter-action');
    if (actionFilter) {
      actionFilter.addEventListener('change', () => this.renderActivityLogs());
    }

    const dateFrom = document.getElementById('logs-filter-date-from');
    if (dateFrom) {
      dateFrom.addEventListener('change', () => this.renderActivityLogs());
    }

    const dateTo = document.getElementById('logs-filter-date-to');
    if (dateTo) {
      dateTo.addEventListener('change', () => this.renderActivityLogs());
    }

    const clearFilterBtn = document.getElementById('logs-filter-clear');
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', () => {
        if (searchInp) searchInp.value = '';
        if (actionFilter) actionFilter.value = '';
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';
        this.renderActivityLogs();
      });
    }
  },

  /**
   * Activity logs table rendering strictly scoped to the active suite
   */
  renderActivityLogs() {
    const tbody = document.getElementById('logs-tbody');
    const emptyState = document.getElementById('logs-empty-state');
    if (!tbody) return;

    const currentSuite = this.activeApp || 'jewelry';
    const suiteTitles = {
      jewelry: 'Jewelry Suite Audit & Activity Logs',
      emerald: 'Emerald Suite Audit & Activity Logs',
      stone: 'Loose Stones Suite Audit & Activity Logs'
    };
    const suiteDescs = {
      jewelry: 'Change history and inventory audit trail for the Jewelry Suite.',
      emerald: 'Change history and lot activity audit trail for the Emerald Suite.',
      stone: 'Change history and stone stock audit trail for the Loose Stones Suite.'
    };

    const titleEl = document.getElementById('logs-suite-title');
    const descEl = document.getElementById('logs-suite-desc');
    if (titleEl) titleEl.textContent = suiteTitles[currentSuite] || 'Audit Trail & Activity Logs';
    if (descEl) descEl.textContent = suiteDescs[currentSuite] || 'Audit trail and activity log history.';

    // Fetch logs strictly for active suite
    const suiteLogs = DBManager.getLogs(currentSuite);

    // Filter logs
    const searchInp = document.getElementById('logs-search-input');
    const query = (searchInp?.value || '').toLowerCase().trim();
    const actionFilter = document.getElementById('logs-filter-action')?.value || '';
    const dateFrom = document.getElementById('logs-filter-date-from')?.value || '';
    const dateTo = document.getElementById('logs-filter-date-to')?.value || '';

    const filtered = suiteLogs.filter(log => {
      // Action filter
      if (actionFilter && log.action !== actionFilter) {
        return false;
      }

      // Date filter
      const lDate = log.timestamp ? log.timestamp.split('T')[0] : '';
      if (dateFrom && lDate < dateFrom) return false;
      if (dateTo && lDate > dateTo) return false;

      // Query search
      if (query) {
        const match =
          (log.targetName || '').toLowerCase().includes(query) ||
          (log.targetId || '').toLowerCase().includes(query) ||
          (log.details || '').toLowerCase().includes(query) ||
          (log.action || '').toLowerCase().includes(query) ||
          (log.changes || []).some(c => (c.field || '').toLowerCase().includes(query) || String(c.old).toLowerCase().includes(query) || String(c.new).toLowerCase().includes(query));
        if (!match) return false;
      }

      return true;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      tbody.parentElement.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    tbody.parentElement.classList.remove('hidden');

    filtered.forEach(log => {
      const row = document.createElement('tr');
      
      const badgeClass = log.action.toLowerCase() === 'gold_rate_update' ? 'gold' : log.action.toLowerCase();
      const actionLabel = log.action.replace(/_/g, ' ');

      const timeFormatted = new Date(log.timestamp).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      // Diff visual rendering if edits exist
      let diffHtml = '';
      if (log.changes && log.changes.length > 0) {
        diffHtml = `<div class="log-diff-box" style="margin-top:6px;">`;
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
        <td class="log-time" style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${timeFormatted}</td>
        <td><span class="badge-action ${badgeClass}">${actionLabel}</span></td>
        <td class="log-target" style="font-weight:600;color:var(--text-main);">${UI.escapeHtml(log.targetName || 'Vault')}</td>
        <td>
          <div class="log-summary" style="font-size:13px;color:var(--text-main);">${UI.escapeHtml(log.details || '')}</div>
          ${diffHtml}
        </td>
      `;

      tbody.appendChild(row);
    });
  },

  initTheme() {
    // Wire up header toggle button
    const toggleBtn = document.getElementById('btn-toggle-theme');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Wire up mobile header toggle button
    const mobileToggleBtn = document.getElementById('btn-mobile-toggle-theme');
    if (mobileToggleBtn) {
      mobileToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Wire up startup screen toggle button
    const startupToggleBtn = document.getElementById('btn-startup-toggle-theme');
    if (startupToggleBtn) {
      startupToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Wire up launcher screen toggle button
    const launcherToggleBtn = document.getElementById('btn-launcher-toggle-theme');
    if (launcherToggleBtn) {
      launcherToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Wire up Settings tab theme preference buttons
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');
    const btnReset = document.getElementById('btn-theme-reset');

    if (btnLight) btnLight.addEventListener('click', () => this.applyTheme('light'));
    if (btnDark) btnDark.addEventListener('click', () => this.applyTheme('dark'));
    if (btnReset) btnReset.addEventListener('click', () => this.applyTheme(null));

    // Listen to system preference changes at runtime
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      // Only react if there is no explicit override in localStorage
      if (!localStorage.getItem('color-scheme')) {
        this.updateThemeAttributes(null);
      }
    });

    // Initial load sync highlight on settings page buttons
    this.highlightActiveThemeButton();
  },

  toggleTheme() {
    const currentTheme = localStorage.getItem('color-scheme');
    let targetTheme;

    if (currentTheme === 'dark') {
      targetTheme = 'light';
    } else if (currentTheme === 'light') {
      targetTheme = 'dark';
    } else {
      // If no override, check the current system state
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      targetTheme = isSystemDark ? 'light' : 'dark';
    }

    this.applyTheme(targetTheme);
  },

  applyTheme(theme) {
    if (theme) {
      localStorage.setItem('color-scheme', theme);
    } else {
      localStorage.removeItem('color-scheme');
    }
    this.updateThemeAttributes(theme);
    this.highlightActiveThemeButton();
  },

  updateThemeAttributes(theme) {
    const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
    
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (metaColorScheme) metaColorScheme.content = 'dark';
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (metaColorScheme) metaColorScheme.content = 'light';
    } else {
      // System default
      document.documentElement.removeAttribute('data-theme');
      if (metaColorScheme) metaColorScheme.content = 'light dark';
    }
  },

  highlightActiveThemeButton() {
    const theme = localStorage.getItem('color-scheme');
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');
    const btnReset = document.getElementById('btn-theme-reset');

    if (!btnLight || !btnDark || !btnReset) return;

    // Reset styles
    btnLight.style.borderColor = 'var(--border-light)';
    btnLight.style.backgroundColor = 'transparent';
    btnLight.style.color = 'var(--text-main)';
    btnDark.style.borderColor = 'var(--border-light)';
    btnDark.style.backgroundColor = 'transparent';
    btnDark.style.color = 'var(--text-main)';
    btnReset.style.borderColor = 'var(--border-light)';
    btnReset.style.backgroundColor = 'transparent';
    btnReset.style.color = 'var(--text-main)';

    // Set active style
    let activeBtn;
    if (theme === 'light') activeBtn = btnLight;
    else if (theme === 'dark') activeBtn = btnDark;
    else activeBtn = btnReset;

    if (activeBtn) {
      activeBtn.style.borderColor = 'var(--border-dark)';
      activeBtn.style.backgroundColor = 'var(--text-main)';
      activeBtn.style.color = 'var(--bg-card)';
    }
  },

  renderJewelryPhotos() {
    const gridContainer = document.getElementById('jewelry-photos-grid');
    const emptyState = document.getElementById('jewelry-photos-empty-state');
    if (!gridContainer || !emptyState) return;

    const queryInput = document.getElementById('photo-search-input');
    const query = queryInput ? queryInput.value.toLowerCase().trim() : '';

    // Retrieve all items
    const allItems = DBManager.getItems();

    // Canonical chronological S.No map for all items in the database
    const chronological = [...allItems].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id?.split('_')[1] || 0);
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id?.split('_')[1] || 0);
      return tA - tB;
    });
    const itemSnoMap = new Map();
    chronological.forEach((it, idx) => {
      itemSnoMap.set(it.id, it.sno || (idx + 1));
    });

    // Filter items: match search query (SKU, Name, Category, or S.No)
    let filtered = allItems.filter(item => {
      if (!query) return true;
      const matchSku = (item.sku || '').toLowerCase().includes(query);
      const matchName = (item.name || '').toLowerCase().includes(query);
      const matchCat = (item.category || '').toLowerCase().includes(query);
      const snoStr = String(itemSnoMap.get(item.id) || item.sno || '');
      return matchSku || matchName || matchCat || snoStr.includes(query);
    });

    // Consistently sort by S.No (Ascending) so pieces always stay in their exact fixed slots
    filtered.sort((a, b) => (itemSnoMap.get(a.id) || a.sno || 0) - (itemSnoMap.get(b.id) || b.sno || 0));

    gridContainer.innerHTML = '';

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    gridContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      const serialNumber = itemSnoMap.get(item.id) || item.sno || 1;
      
      const imgContent = item.image
        ? `<img src="${item.image}" alt="${UI.escapeHtml(item.name || 'Jewelry Photo')}" class="photo-card-img">`
        : `<div class="product-img-placeholder-content" style="padding: 20px;">
             <svg class="product-img-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
               <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
               <circle cx="8.5" cy="8.5" r="1.5"/>
               <path d="M21 15l-5-5L5 21"/>
             </svg>
             <span class="product-img-placeholder-text">NO PHOTO</span>
             <span style="font-size: 10px; color: var(--text-gold-light); text-decoration: underline; margin-top: 2px;">+ Add Photo</span>
           </div>`;

      card.innerHTML = `
        <div class="photo-card-img-box ${!item.image ? 'product-img-box-placeholder' : ''}">
          ${imgContent}
        </div>
        <div class="photo-card-body">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span class="product-sno-badge" style="font-family: var(--font-mono); font-weight: 800; font-size: 11px; background: var(--bg-gold-subtle, rgba(212, 175, 55, 0.15)); color: var(--text-gold-dark, #b8860b); border: 1px solid var(--border-gold-subtle, rgba(212, 175, 55, 0.3)); padding: 1px 6px; border-radius: 4px;">S.No: ${serialNumber}</span>
            <div class="photo-card-sku">${UI.escapeHtml(item.sku || 'SKU-NONE')}</div>
          </div>
          <div class="photo-card-name">${UI.escapeHtml(item.name || 'Unnamed Piece')}</div>
        </div>
      `;

      // Allow clicking the photo card to view details or add photo
      card.addEventListener('click', () => {
        if (!item.image) {
          document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece & Add Photo";
          UI.loadItemIntoForm(item);
          UI.openModal('modal-jewelry-item');
        } else {
          this.openJewelryDetailModal(item);
        }
      });

      gridContainer.appendChild(card);
    });
  },

  renderEmeraldPhotos() {
    const gridContainer = document.getElementById('emerald-photos-grid');
    const emptyState = document.getElementById('emerald-photos-empty-state');
    if (!gridContainer || !emptyState) return;

    const queryInput = document.getElementById('emerald-photo-search-input');
    const query = queryInput ? queryInput.value.toLowerCase().trim() : '';

    // Retrieve all emeralds
    const allEmeralds = DBManager.getEmeralds();

    // Filter items: must have an image, and must match query (Group or Shape)
    let filtered = allEmeralds.filter(item => {
      if (!item.image) return false;
      const matchGroup = (item.group || '').toLowerCase().includes(query);
      const matchShape = (item.shape || '').toLowerCase().includes(query);
      return matchGroup || matchShape;
    });

    // Sort by Pudia/Color number
    filtered.sort((a, b) => (Number(a.color) || 0) - (Number(b.color) || 0));

    gridContainer.innerHTML = '';

    if (filtered.length === 0) {
      gridContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    gridContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      
      card.innerHTML = `
        <div class="photo-card-img-box">
          <img src="${item.image}" alt="Pudia #${item.color}" class="photo-card-img">
        </div>
        <div class="photo-card-body">
          <div class="photo-card-sku">${item.group || 'Lot'} #${item.color || 'N/A'}</div>
          <div class="photo-card-name">${item.shape || 'Mixed Shapes'}</div>
        </div>
      `;

      // Allow clicking the photo card to view details (by triggering share modal)
      card.addEventListener('click', () => {
        if (window.EmeraldController) {
          EmeraldController.openShareModal(item);
        }
      });

      gridContainer.appendChild(card);
    });
  },

  openJewelryDetailModal(item) {
    if (!item) return;

    // 1. Populate image and notes
    const imgEl = document.getElementById('detail-jewelry-image');
    let placeholderEl = document.getElementById('detail-jewelry-image-placeholder');
    
    if (imgEl) {
      const parentContainer = imgEl.parentElement;
      if (placeholderEl) {
        placeholderEl.remove();
        placeholderEl = null;
      }

      if (item.image) {
        imgEl.src = item.image;
        imgEl.style.display = 'block';
      } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        
        placeholderEl = document.createElement('div');
        placeholderEl.id = 'detail-jewelry-image-placeholder';
        placeholderEl.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-muted); opacity: 0.7; cursor: pointer; height: 100%; width: 100%;';
        placeholderEl.innerHTML = `
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span style="font-size: 12px; font-weight: 600; text-transform: uppercase;">No Photo Attached</span>
          <button type="button" class="btn btn-secondary btn-small" id="btn-detail-add-photo" style="font-size: 11px;">+ Upload Photo</button>
        `;
        parentContainer.appendChild(placeholderEl);
        
        placeholderEl.querySelector('#btn-detail-add-photo').addEventListener('click', () => {
          UI.closeModal('modal-jewelry-detail');
          document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece & Add Photo";
          UI.loadItemIntoForm(item);
          UI.openModal('modal-jewelry-item');
        });
      }
    }

    const descEl = document.getElementById('detail-jewelry-description');
    if (descEl) {
      descEl.textContent = item.description || 'No description / notes recorded for this piece.';
    }

    // 2. Populate basic meta
    document.getElementById('detail-jewelry-name').textContent = item.name || 'Unnamed Piece';
    document.getElementById('detail-jewelry-sku').textContent = item.sku || 'SKU-NONE';
    document.getElementById('detail-jewelry-category').textContent = item.category || 'Jewelry';

    // 3. Status Badge
    const statusBadge = document.getElementById('detail-jewelry-status');
    if (statusBadge) {
      statusBadge.className = 'badge-status';
      let statusClass = 'stock';
      let statusLabel = 'In Stock';
      if (item.memoId) {
        statusClass = 'memo';
        statusLabel = 'On Memo';
      } else if (item.sold) {
        statusClass = 'sold';
        statusLabel = 'Sold';
      }
      statusBadge.classList.add(statusClass);
      statusBadge.textContent = statusLabel;
    }

    // 4. Metals List
    const metalsList = document.getElementById('detail-jewelry-metals-list');
    const netMetals = Calc.getNetMetals(item);
    if (metalsList) {
      metalsList.innerHTML = '';
      if (netMetals.length === 0) {
        metalsList.innerHTML = '<div style="color: var(--text-muted);">No metal components recorded.</div>';
      } else {
        netMetals.forEach(m => {
          const div = document.createElement('div');
          const valTag = (m.directValue || m.totalValue) ? ` · <span style="color: var(--text-gold-light); font-weight: 600;">₹${Number(m.directValue || m.totalValue).toLocaleString('en-IN')} (Direct Value)</span>` : '';
          div.innerHTML = `<strong>${m.name || 'Metal'} (${m.karat}KT Gold):</strong> Gross: ${Number(m.grossWeight || 0).toFixed(3)}g (Net: ${Number(m.netWeight || 0).toFixed(3)}g, Wastage: ${Number(m.wastage || 0).toFixed(2)}%)${valTag}`;
          metalsList.appendChild(div);
        });
      }
    }

    // 5. Weight summary
    let totalGemWeight = 0;
    (item.stones || []).forEach(s => totalGemWeight += Number(s.weight || 0));
    (item.diamondsPolki || []).forEach(d => totalGemWeight += Number(d.weight || 0));

    const totalGrossWeight = netMetals.reduce((sum, m) => sum + Number(m.grossWeight || 0), 0);
    const netMetalWeight = netMetals.reduce((sum, m) => sum + Number(m.netWeight || 0), 0);

    document.getElementById('detail-jewelry-gross-wt').textContent = totalGrossWeight.toFixed(3);
    document.getElementById('detail-jewelry-net-wt').textContent = netMetalWeight.toFixed(3);
    document.getElementById('detail-jewelry-gem-wt').textContent = totalGemWeight.toFixed(2);

    const mfgDateEl = document.getElementById('detail-jewelry-mfg-date');
    if (mfgDateEl) mfgDateEl.textContent = item.mfgDate || (item.createdAt ? item.createdAt.split('T')[0] : 'N/A');

    const mfgRate = item.mfgGoldRate24kt || item.goldRateAtAddition || 0;
    const mfgGoldRateEl = document.getElementById('detail-jewelry-mfg-gold-rate');
    if (mfgGoldRateEl) mfgGoldRateEl.textContent = mfgRate > 0 ? `₹${mfgRate.toLocaleString()}/g` : 'N/A';

    // 6. Gemstones Breakdown
    const gemCard = document.getElementById('detail-jewelry-gemstones-card');
    const gemList = document.getElementById('detail-jewelry-gemstones-list');
    if (gemCard && gemList) {
      gemList.innerHTML = '';
      const stones = item.stones || [];
      if (stones.length > 0) {
        gemCard.style.display = 'block';
        stones.forEach(s => {
          const div = document.createElement('div');
          div.innerHTML = `• <strong>${s.type || 'Stone'} (${s.shape || 'Any'}):</strong> ${Number(s.weight || 0).toFixed(2)} cts @ ₹${Number(s.ratePerCarat || 0).toLocaleString()}/ct (Total: ₹${Number(s.totalValue || 0).toLocaleString()})`;
          gemList.appendChild(div);
        });
      } else {
        gemCard.style.display = 'none';
      }
    }

    // 7. Diamonds Breakdown
    const diaCard = document.getElementById('detail-jewelry-diamonds-card');
    const diaList = document.getElementById('detail-jewelry-diamonds-list');
    if (diaCard && diaList) {
      diaList.innerHTML = '';
      const diamonds = item.diamondsPolki || [];
      if (diamonds.length > 0) {
        diaCard.style.display = 'block';
        diamonds.forEach(d => {
          const div = document.createElement('div');
          div.innerHTML = `• <strong>${d.type || 'Diamond'} (${d.shape || 'Any'}):</strong> ${Number(d.weight || 0).toFixed(2)} cts @ ₹${Number(d.ratePerCarat || 0).toLocaleString()}/ct (Total: ₹${Number(d.totalValue || 0).toLocaleString()})`;
          diaList.appendChild(div);
        });
      } else {
        diaCard.style.display = 'none';
      }
    }

    // 8. Valuations
    const goldRate = Number(DBManager.getSettings().goldRate24kt ? DBManager.getSettings().goldRate24kt.ratePerGram : 0);
    const evaluation = Calc.evaluateItem(item, goldRate);
    
    document.getElementById('detail-jewelry-market-price').textContent = `₹${evaluation.marketCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    
    const mfgPriceEl = document.getElementById('detail-jewelry-mfg-price');
    if (mfgPriceEl) {
      mfgPriceEl.textContent = `₹${evaluation.mfgGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    
    const homeCostWrapper = document.getElementById('detail-jewelry-home-cost-wrapper');
    if (evaluation.hasEmerald) {
      if (homeCostWrapper) homeCostWrapper.style.display = 'block';
      document.getElementById('detail-jewelry-home-price').textContent = `₹${evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else {
      if (homeCostWrapper) homeCostWrapper.style.display = 'none';
    }
    
    document.getElementById('detail-jewelry-selling-price').textContent = `₹${evaluation.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // 9. Edit & Sell button wire up
    const btnEdit = document.getElementById('btn-detail-edit-item');
    if (btnEdit) {
      const newBtn = btnEdit.cloneNode(true);
      btnEdit.parentNode.replaceChild(newBtn, btnEdit);
      newBtn.addEventListener('click', () => {
        UI.closeModal('modal-jewelry-detail');
        document.getElementById('jewelry-modal-title').textContent = "Edit Jewelry Piece";
        UI.loadItemIntoForm(item);
        UI.openModal('modal-jewelry-item');
      });
    }

    const btnSell = document.getElementById('btn-detail-sell-item');
    if (btnSell) {
      const newSellBtn = btnSell.cloneNode(true);
      btnSell.parentNode.replaceChild(newSellBtn, btnSell);
      if (item.status === 'Sold') {
        newSellBtn.textContent = "Item Sold";
        newSellBtn.disabled = true;
        newSellBtn.style.opacity = '0.6';
      } else {
        newSellBtn.textContent = "Record Sale";
        newSellBtn.disabled = false;
        newSellBtn.style.opacity = '1';
        newSellBtn.addEventListener('click', () => {
          UI.closeModal('modal-jewelry-detail');
          if (window.JewelryMemoController) {
            JewelryMemoController.openCompleteSaleModal(null, -1, item);
          }
        });
      }
    }

    UI.openModal('modal-jewelry-detail');
  },

  activeApp: null,

  launchApp(appName) {
    this.activeApp = appName;
    
    // Hide Launcher Portal Screen
    document.getElementById('app-launcher-screen').classList.add('hidden');
    // Show Main Workspace
    document.getElementById('app-workspace').classList.remove('hidden');

    // Filter sidebar navigation groups
    const appGroups = document.querySelectorAll('.sidebar-app-group[data-app-group]');
    appGroups.forEach(group => {
      const groupName = group.getAttribute('data-app-group');
      if (groupName === appName || groupName === 'system') {
        group.classList.remove('hidden');
      } else {
        group.classList.add('hidden');
      }
    });

    // Also filter mobile menu items based on active app suite
    const mobileItems = document.querySelectorAll('.mobile-menu-item[data-action]');
    mobileItems.forEach(item => {
      const action = item.getAttribute('data-action');
      let show = false;
      if (appName === 'jewelry') {
        show = ['tab-jewelry-analyzer', 'tab-catalog', 'tab-jewelry-photos', 'tab-jewelry-memos', 'tab-jewelry-sales', 'tab-logs', 'tab-settings', 'add-jewelry', 'add-jewelry-memo'].includes(action);
      } else if (appName === 'emerald') {
        show = ['tab-emerald-catalog', 'tab-emerald-analysis', 'tab-emerald-photos', 'tab-memos', 'tab-emerald-sales', 'tab-logs', 'tab-settings', 'add-emerald', 'add-memo'].includes(action);
      } else if (appName === 'stone') {
        show = ['tab-stone-catalog', 'tab-jewel-stone-memos', 'tab-logs', 'tab-settings', 'add-stone', 'add-jewel-stone-memo'].includes(action);
      }
      
      if (show) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // Automatically boot into the first/default tab of the selected app suite
    let defaultTab = 'tab-jewelry-analyzer';
    if (appName === 'emerald') {
      defaultTab = 'tab-emerald-catalog';
    } else if (appName === 'stone') {
      defaultTab = 'tab-stone-catalog';
    }

    this.switchTab(defaultTab);
  },

  showLauncher() {
    this.activeApp = null;
    document.getElementById('app-workspace').classList.add('hidden');
    document.getElementById('startup-screen').classList.add('hidden');
    document.getElementById('app-launcher-screen').classList.remove('hidden');

    const dbPathText = document.getElementById('launcher-db-path-text');
    if (dbPathText) {
      dbPathText.textContent = DBManager.activePath || '';
    }
  }
};

window.App = App;

// Bootstrap Application on fully loaded page
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
