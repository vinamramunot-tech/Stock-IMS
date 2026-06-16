/**
 * Master Application Coordinator for Mava Gems (Direct-Access Edition)
 * Manages view states, direct boot loaders, logs, and acts as the entry point.
 */

const App = {
  activeTab: 'tab-catalog',

  async init() {
    // 1. Initialize Modules
    Startup.init();
    Catalog.init();
    Settings.init();
    this.initTheme();
    if (window.EmeraldController) {
      EmeraldController.init();
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

    // Labour cost, profit percentage, and metal wastage input change listener
    document.getElementById('item-labour').addEventListener('input', () => UI.updateFormCalculations());
    document.getElementById('item-profit-pct').addEventListener('input', () => UI.updateFormCalculations());
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

    // Listen for external database changes to support instant hot-reloading
    window.electronAPI.onDatabaseChanged((filePath) => this.handleExternalDbChange(filePath));

    const photoSearchInput = document.getElementById('photo-search-input');
    if (photoSearchInput) {
      photoSearchInput.addEventListener('input', () => this.renderJewelryPhotos());
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

        if (action === 'tab-catalog' || action === 'tab-emerald-catalog' || action === 'tab-memos' || action === 'tab-logs' || action === 'tab-settings' || action === 'tab-stone-catalog' || action === 'tab-jewel-stone-memos' || action === 'tab-jewelry-memos' || action === 'tab-jewelry-photos') {
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
        }
      });
    });
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
   * Refresh views
   */
  refreshAllDisplays() {
    Catalog.renderDashboard();
    Catalog.renderCatalogGrid();
    if (window.EmeraldController) {
      EmeraldController.renderEmeraldGrid();
      EmeraldController.populateGroupAutocomplete();
      EmeraldController.populateShapeAutocomplete();
      EmeraldController.populateMmAutocomplete();
    }
    if (window.MemoController) {
      MemoController.renderMemoList();
    }
    if (window.StoneController) {
      StoneController.renderStoneGrid();
      StoneController.populateGroupAutocomplete();
      StoneController.populateShapeAutocomplete();
      StoneController.populateMmAutocomplete();
      StoneController.populateGradeAutocomplete();
    }
    if (window.JewelStoneMemoController) {
      JewelStoneMemoController.renderMemoList();
    }
    if (window.JewelryMemoController) {
      JewelryMemoController.renderMemoList();
    }
    this.renderActivityLogs();
    this.renderJewelryPhotos();
    
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
   * Theme toggling, persistence, and system synchronization logic
   */
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

    // Filter items: must have an image, and must match query (SKU or Name)
    let filtered = allItems.filter(item => {
      if (!item.image) return false;
      const matchSku = (item.sku || '').toLowerCase().includes(query);
      const matchName = (item.name || '').toLowerCase().includes(query);
      return matchSku || matchName;
    });

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
          <img src="${item.image}" alt="${item.name || 'Jewelry Photo'}" class="photo-card-img">
        </div>
        <div class="photo-card-body">
          <div class="photo-card-sku">${item.sku || 'SKU-NONE'}</div>
          <div class="photo-card-name">${item.name || 'Unnamed Piece'}</div>
        </div>
      `;

      // Allow clicking the photo card to view details (by triggering view modal)
      card.addEventListener('click', () => {
        this.openJewelryDetailModal(item);
      });

      gridContainer.appendChild(card);
    });
  },

  openJewelryDetailModal(item) {
    if (!item) return;

    // 1. Populate image and notes
    const imgEl = document.getElementById('detail-jewelry-image');
    if (imgEl) {
      imgEl.src = item.image || '';
      imgEl.style.display = item.image ? 'block' : 'none';
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
    if (metalsList) {
      metalsList.innerHTML = '';
      const netMetals = Calc.getNetMetals(item);
      if (netMetals.length === 0) {
        metalsList.innerHTML = '<div style="color: var(--text-muted);">No metal components added.</div>';
      } else {
        netMetals.forEach(m => {
          const div = document.createElement('div');
          div.innerHTML = `<strong>${m.karat}KT Gold:</strong> Gross: ${Number(m.weight || 0).toFixed(3)}g (Net: ${m.netWeight.toFixed(3)}g)`;
          metalsList.appendChild(div);
        });
      }
    }

    // 5. Weight summary
    let totalGrossWeight = 0;
    (item.metals || []).forEach(m => totalGrossWeight += Number(m.weight || 0));
    
    let totalGemWeight = 0;
    (item.stones || []).forEach(s => totalGemWeight += Number(s.weight || 0));
    (item.diamondsPolki || []).forEach(d => totalGemWeight += Number(d.weight || 0));
    
    const netMetalWeight = Math.max(0, totalGrossWeight - (totalGemWeight * 0.2));

    document.getElementById('detail-jewelry-gross-wt').textContent = totalGrossWeight.toFixed(3);
    document.getElementById('detail-jewelry-net-wt').textContent = netMetalWeight.toFixed(3);
    document.getElementById('detail-jewelry-gem-wt').textContent = totalGemWeight.toFixed(2);

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
    
    const homeCostWrapper = document.getElementById('detail-jewelry-home-cost-wrapper');
    if (evaluation.hasEmerald) {
      if (homeCostWrapper) homeCostWrapper.style.display = 'block';
      document.getElementById('detail-jewelry-home-price').textContent = `₹${evaluation.homeCostPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else {
      if (homeCostWrapper) homeCostWrapper.style.display = 'none';
    }
    
    document.getElementById('detail-jewelry-selling-price').textContent = `₹${evaluation.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // 9. Edit button wire up
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

    UI.openModal('modal-jewelry-detail');
  }
};

window.App = App;

// Bootstrap Application on fully loaded page
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
