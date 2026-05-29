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
        UI.closeModal('modal-erase-confirm');
      });
    });

    // Item modal tab controllers initialization
    UI.initModalTabs();
    UI.initImageUploader();
    UI.initStoneSelectors();

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
