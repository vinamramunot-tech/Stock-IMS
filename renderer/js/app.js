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
    if (window.EmeraldController) {
      EmeraldController.init();
    }
    if (window.MemoController) {
      MemoController.init();
    }
    if (window.StoneController) {
      StoneController.init();
    }
    if (window.StoneMemoController) {
      StoneMemoController.init();
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

        if (action === 'tab-catalog' || action === 'tab-emerald-catalog' || action === 'tab-memos' || action === 'tab-logs' || action === 'tab-settings' || action === 'tab-stone-catalog' || action === 'tab-stone-memos' || action === 'tab-jewelry-memos') {
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
        } else if (action === 'add-stone-memo') {
          if (window.StoneMemoController) {
            window.StoneMemoController.openCreateMemoModal();
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
    }
    if (window.MemoController) {
      MemoController.renderMemoList();
    }
    if (window.StoneController) {
      StoneController.renderStoneGrid();
    }
    if (window.StoneMemoController) {
      StoneMemoController.renderMemoList();
    }
    if (window.JewelryMemoController) {
      JewelryMemoController.renderMemoList();
    }
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
  }
};

window.App = App;

// Bootstrap Application on fully loaded page
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
