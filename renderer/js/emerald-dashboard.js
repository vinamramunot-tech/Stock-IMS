/**
 * Emerald Dashboard & Investment Analysis Controller
 * Performs dynamic stock calculations, breakdown analysis, and simulates raw material yields.
 */

const EmeraldDashboardController = {
  filters: {
    group: '',
    origin: '',
    lustre: ''
  },

  init() {
    // Set up filter change listeners
    const groupFilter = document.getElementById('analysis-filter-group');
    const originFilter = document.getElementById('analysis-filter-origin');
    const lustreFilter = document.getElementById('analysis-filter-lustre');
    const resetFiltersBtn = document.getElementById('btn-reset-analysis-filters');

    if (groupFilter) {
      groupFilter.addEventListener('change', () => {
        this.filters.group = groupFilter.value;
        this.renderDashboard();
      });
    }

    if (originFilter) {
      originFilter.addEventListener('change', () => {
        this.filters.origin = originFilter.value;
        this.renderDashboard();
      });
    }

    if (lustreFilter) {
      lustreFilter.addEventListener('change', () => {
        this.filters.lustre = lustreFilter.value;
        this.renderDashboard();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        if (groupFilter) groupFilter.value = '';
        if (originFilter) originFilter.value = '';
        if (lustreFilter) lustreFilter.value = '';
        this.filters.group = '';
        this.filters.origin = '';
        this.filters.lustre = '';
        this.renderDashboard();
      });
    }

    // Set up Investment Simulator listeners
    const roughWeightInput = document.getElementById('planner-rough-weight');
    const weightUnitSelect = document.getElementById('planner-weight-unit');
    const roughCostInput = document.getElementById('planner-rough-cost');
    const yieldSlider = document.getElementById('planner-yield-slider');
    const salePriceInput = document.getElementById('planner-sale-price');
    const plannerGroupSelect = document.getElementById('planner-group-select');
    const fillAvgBtn = document.getElementById('btn-planner-fill-average');

    if (roughWeightInput) roughWeightInput.addEventListener('input', () => this.runSimulatorCalculations());
    if (weightUnitSelect) weightUnitSelect.addEventListener('change', () => this.runSimulatorCalculations());
    if (roughCostInput) roughCostInput.addEventListener('input', () => this.runSimulatorCalculations());
    
    if (yieldSlider) {
      yieldSlider.addEventListener('input', () => {
        const lbl = document.getElementById('lbl-planner-yield');
        if (lbl) lbl.textContent = yieldSlider.value + '%';
        this.runSimulatorCalculations();
      });
    }

    if (salePriceInput) salePriceInput.addEventListener('input', () => this.runSimulatorCalculations());

    if (plannerGroupSelect) {
      plannerGroupSelect.addEventListener('change', () => {
        const groupName = plannerGroupSelect.value;
        const customInput = document.getElementById('planner-group-custom');
        if (customInput && groupName) {
          customInput.value = ''; // clear custom if select is chosen
        }
        this.presetPlannerSalePrice(groupName);
      });
    }

    if (fillAvgBtn) {
      fillAvgBtn.addEventListener('click', () => {
        const selectedGroup = plannerGroupSelect ? plannerGroupSelect.value : '';
        const customGroupInput = document.getElementById('planner-group-custom');
        const customGroup = customGroupInput ? customGroupInput.value.trim() : '';
        this.presetPlannerSalePrice(selectedGroup || customGroup);
      });
    }

    // Initial load calculations
    this.runSimulatorCalculations();
  },

  /**
   * Helper to get total weight of an emerald pudia
   */
  getEmeraldWeight(e) {
    if (e.sizes && e.sizes.length > 0) {
      return e.sizes.reduce((sum, s) => sum + Number(s.weight || 0), 0);
    }
    return Number(e.weight || 0);
  },

  /**
   * Helper to get total pieces of an emerald pudia
   */
  getEmeraldPieces(e) {
    if (e.sizes && e.sizes.length > 0) {
      return e.sizes.reduce((sum, s) => sum + Number(s.pieces || 0), 0);
    }
    return Number(e.pieces || 0);
  },

  /**
   * Helper to collect all shapes in an emerald pudia
   */
  getEmeraldShapes(e) {
    const sSet = new Set();
    if (e.sizes && e.sizes.length > 0) {
      e.sizes.forEach(s => { if (s.shape) sSet.add(s.shape.trim()); });
    } else if (e.shape) {
      sSet.add(e.shape.trim());
    }
    return Array.from(sSet);
  },

  /**
   * Populate group options on the Analysis tab and the planner tab
   */
  populateGroupOptions(emeralds) {
    const groupFilter = document.getElementById('analysis-filter-group');
    const plannerGroup = document.getElementById('planner-group-select');
    if (!groupFilter || !plannerGroup) return;

    // Get unique groups
    const groups = new Set();
    emeralds.forEach(e => {
      if (e.group && e.group.trim()) groups.add(e.group.trim());
    });

    const sortedGroups = Array.from(groups).sort();

    // Preserve active selection
    const activeGroupVal = groupFilter.value;
    const activePlannerVal = plannerGroup.value;

    groupFilter.innerHTML = '<option value="">All Groups</option>';
    plannerGroup.innerHTML = '<option value="">-- Choose Group or Custom --</option>';

    sortedGroups.forEach(g => {
      groupFilter.innerHTML += `<option value="${UI.escapeHtml(g)}">${UI.escapeHtml(g)}</option>`;
      plannerGroup.innerHTML += `<option value="${UI.escapeHtml(g)}">${UI.escapeHtml(g)}</option>`;
    });

    // Restore select value if it still exists
    if (sortedGroups.includes(activeGroupVal)) groupFilter.value = activeGroupVal;
    if (sortedGroups.includes(activePlannerVal)) plannerGroup.value = activePlannerVal;
  },

  /**
   * Dynamic dashboard rendering based on active filters
   */
  renderDashboard() {
    const allEmeralds = DBManager.getEmeralds();

    // 1. Update filter options dynamically
    this.populateGroupOptions(allEmeralds);

    // 2. Filter emeralds
    const filtered = allEmeralds.filter(e => {
      const matchesGroup = !this.filters.group || e.group === this.filters.group;
      const matchesOrigin = !this.filters.origin || (e.origins || []).includes(this.filters.origin);
      const matchesLustre = !this.filters.lustre || e.lustreGrade === this.filters.lustre;
      return matchesGroup && matchesOrigin && matchesLustre;
    });

    // 3. Compute Metrics
    let totalWeight = 0;
    let totalValueInr = 0;
    let totalPieces = 0;
    let totalPudias = filtered.length;

    filtered.forEach(e => {
      const w = this.getEmeraldWeight(e);
      totalWeight += w;
      totalValueInr += w * (e.pricePerCarat || 0);
      totalPieces += this.getEmeraldPieces(e);
    });

    const usdRate = DBManager.getSettings().usdToInr ? DBManager.getSettings().usdToInr.rate : 0;
    const totalValueUsd = usdRate > 0 ? totalValueInr / usdRate : 0;

    const avgRateInr = totalWeight > 0 ? totalValueInr / totalWeight : 0;
    const avgRateUsd = totalWeight > 0 ? totalValueUsd / totalWeight : 0;
    const avgPudiaWeight = totalPudias > 0 ? totalWeight / totalPudias : 0;

    // Update metrics UI
    document.getElementById('analysis-total-weight').textContent = `${totalWeight.toFixed(2)} cts`;
    document.getElementById('analysis-total-pieces').textContent = `${totalPieces.toLocaleString()} pieces`;
    document.getElementById('analysis-valuation-inr').textContent = `₹${totalValueInr.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    document.getElementById('analysis-avg-rate-inr').textContent = `₹${avgRateInr.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ct (avg)`;
    
    document.getElementById('analysis-valuation-usd').textContent = `$${totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    document.getElementById('analysis-avg-rate-usd').textContent = `$${avgRateUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ct (avg)`;
    
    document.getElementById('analysis-pudias-count').textContent = totalPudias;
    document.getElementById('analysis-avg-pudia-weight').textContent = `${avgPudiaWeight.toFixed(2)} cts / pudia`;

    // 4. Compute Distributions
    this.renderDistribution('group', filtered, totalWeight);
    this.renderDistribution('lustre', filtered, totalWeight);
    this.renderDistribution('shape', filtered, totalWeight);
    this.renderDistribution('origin', filtered, totalWeight);

    // 5. Top lists
    this.renderTopTables(filtered);
  },

  /**
   * Helper to draw bar breakdowns
   */
  renderDistribution(dimension, filtered, grandTotalWeight) {
    const counts = {};

    filtered.forEach(e => {
      const weight = this.getEmeraldWeight(e);
      if (dimension === 'group') {
        const val = e.group || 'Unassigned';
        counts[val] = (counts[val] || 0) + weight;
      } else if (dimension === 'lustre') {
        const val = e.lustreGrade || 'Calibrated Series';
        counts[val] = (counts[val] || 0) + weight;
      } else if (dimension === 'origin') {
        const origins = e.origins || ['None Specified'];
        origins.forEach(o => {
          counts[o] = (counts[o] || 0) + weight;
        });
      } else if (dimension === 'shape') {
        const shapes = this.getEmeraldShapes(e);
        if (e.sizes && e.sizes.length > 0) {
          e.sizes.forEach(s => {
            const sh = s.shape || 'Unknown';
            counts[sh] = (counts[sh] || 0) + Number(s.weight || 0);
          });
        } else {
          shapes.forEach(sh => {
            counts[sh] = (counts[sh] || 0) + weight;
          });
        }
      }
    });

    const items = Object.entries(counts).map(([name, weight]) => {
      const pct = grandTotalWeight > 0 ? (weight / grandTotalWeight) * 100 : 0;
      return { name, weight, pct };
    }).sort((a, b) => b.weight - a.weight);

    const container = document.getElementById(`analysis-${dimension}-distribution`);
    if (!container) return;
    container.innerHTML = '';

    if (items.length === 0) {
      container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 15px;">No data available</div>';
      return;
    }

    // Limit to top 5 categories for visual cleanliness
    const displayItems = items.slice(0, 5);

    displayItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'distribution-row';
      row.innerHTML = `
        <div class="distribution-progress-fill" style="width: ${item.pct.toFixed(1)}%;"></div>
        <span class="distribution-row-label">${UI.escapeHtml(item.name)}</span>
        <span class="distribution-row-value"><strong>${item.weight.toFixed(2)} cts</strong> (${item.pct.toFixed(1)}%)</span>
      `;
      container.appendChild(row);
    });

    if (items.length > 5) {
      const remainingCount = items.length - 5;
      const remainingWeight = items.slice(5).reduce((sum, item) => sum + item.weight, 0);
      const remainingPct = grandTotalWeight > 0 ? (remainingWeight / grandTotalWeight) * 100 : 0;
      
      const row = document.createElement('div');
      row.className = 'distribution-row';
      row.style.opacity = '0.7';
      row.innerHTML = `
        <div class="distribution-progress-fill" style="width: ${remainingPct.toFixed(1)}%; background-color: rgba(0, 0, 0, 0.05);"></div>
        <span class="distribution-row-label" style="font-style: italic; color: var(--text-muted);">${remainingCount} Other Categories</span>
        <span class="distribution-row-value"><strong>${remainingWeight.toFixed(2)} cts</strong> (${remainingPct.toFixed(1)}%)</span>
      `;
      container.appendChild(row);
    }
  },

  /**
   * Render Top 5 Highest-Valued and heaviest tables
   */
  renderTopTables(filtered) {
    const list = filtered.map(e => {
      const weight = this.getEmeraldWeight(e);
      const valInr = weight * (e.pricePerCarat || 0);
      return {
        color: e.color || 'N/A',
        group: e.group || 'Unassigned',
        weight: weight,
        rate: e.pricePerCarat || 0,
        value: valInr
      };
    });

    // 1. Top 5 Valued
    const sortedValued = [...list].sort((a, b) => b.value - a.value).slice(0, 5);
    const valuedTbody = document.getElementById('analysis-top-valued-tbody');
    if (valuedTbody) {
      valuedTbody.innerHTML = '';
      if (sortedValued.length === 0) {
        valuedTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px 0;">No stock items found</td></tr>';
      } else {
        sortedValued.forEach(row => {
          valuedTbody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.03);">
              <td style="padding: 8px 4px; font-weight: 700; color: var(--text-main);">#${row.color}</td>
              <td style="padding: 8px 4px; color: var(--text-muted); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHtml(row.group)}</td>
              <td style="padding: 8px 4px; text-align: right; font-weight: 600;">${row.weight.toFixed(2)} cts</td>
              <td style="padding: 8px 4px; text-align: right; color: var(--text-muted);">₹${row.rate.toLocaleString()}</td>
              <td style="padding: 8px 4px; text-align: right; font-weight: 700; color: var(--text-gold-dark);">₹${row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>
          `;
        });
      }
    }

    // 2. Top 5 Largest by Weight
    const sortedWeight = [...list].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const weightTbody = document.getElementById('analysis-top-weight-tbody');
    if (weightTbody) {
      weightTbody.innerHTML = '';
      if (sortedWeight.length === 0) {
        weightTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px 0;">No stock items found</td></tr>';
      } else {
        sortedWeight.forEach(row => {
          weightTbody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.03);">
              <td style="padding: 8px 4px; font-weight: 700; color: var(--text-main);">#${row.color}</td>
              <td style="padding: 8px 4px; color: var(--text-muted); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${UI.escapeHtml(row.group)}</td>
              <td style="padding: 8px 4px; text-align: right; font-weight: 700; color: var(--text-main);">${row.weight.toFixed(2)} cts</td>
              <td style="padding: 8px 4px; text-align: right; color: var(--text-muted);">₹${row.rate.toLocaleString()}</td>
              <td style="padding: 8px 4px; text-align: right; font-weight: 600;">₹${row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>
          `;
        });
      }
    }
  },

  /**
   * Dynamic preset for sale price based on selected group avg rate
   */
  presetPlannerSalePrice(groupName) {
    if (!groupName) return;
    const allEmeralds = DBManager.getEmeralds();
    const matching = allEmeralds.filter(e => e.group && e.group.trim().toLowerCase() === groupName.trim().toLowerCase());
    
    if (matching.length === 0) return;

    let totalWeight = 0;
    let totalValInr = 0;
    matching.forEach(e => {
      const w = this.getEmeraldWeight(e);
      totalWeight += w;
      totalValInr += w * (e.pricePerCarat || 0);
    });

    if (totalWeight > 0) {
      const avgRate = Math.round(totalValInr / totalWeight);
      const salePriceInput = document.getElementById('planner-sale-price');
      if (salePriceInput) {
        salePriceInput.value = avgRate;
        this.runSimulatorCalculations();
        UI.showToast(`Preset estimated sales price to Group Average: ₹${avgRate}/ct`);
      }
    }
  },

  /**
   * Simulator Calculations Logic
   */
  runSimulatorCalculations() {
    const weightEl = document.getElementById('planner-rough-weight');
    const unitEl = document.getElementById('planner-weight-unit');
    const costEl = document.getElementById('planner-rough-cost');
    const yieldEl = document.getElementById('planner-yield-slider');
    const salePriceEl = document.getElementById('planner-sale-price');

    if (!weightEl || !unitEl || !costEl || !yieldEl || !salePriceEl) return;

    const inputWeight = parseFloat(weightEl.value) || 0;
    const unit = unitEl.value; // 'grams' or 'carats'
    const totalCost = parseFloat(costEl.value) || 0;
    const yieldPct = parseFloat(yieldEl.value) || 0;
    const estSalePricePerCt = parseFloat(salePriceEl.value) || 0;

    // Convert rough weight to carats (1g = 5cts)
    const roughWeightCarats = unit === 'grams' ? inputWeight * 5 : inputWeight;

    // Calculate expected polished output
    const polishedCarats = (roughWeightCarats * yieldPct) / 100;

    // Cost per rough carat
    const costPerRoughCt = roughWeightCarats > 0 ? Math.round(totalCost / roughWeightCarats) : 0;

    // Break even price per polished carat
    const breakEvenPerPolishedCt = polishedCarats > 0 ? Math.round(totalCost / polishedCarats) : 0;

    // Expected revenue
    const expectedRevenue = Math.round(polishedCarats * estSalePricePerCt);

    // Projected net profit
    const netProfit = expectedRevenue - totalCost;

    // ROI
    const roiPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

    // Update Output Elements
    const outRoughCarats = document.getElementById('out-rough-carats');
    const outPolishedCarats = document.getElementById('out-polished-carats');
    const outCostPerRoughCt = document.getElementById('out-cost-per-rough-ct');
    const outBreakEvenCt = document.getElementById('out-break-even-ct');
    const outSalesRevenue = document.getElementById('out-sales-revenue');
    const outNetProfit = document.getElementById('out-net-profit');
    const outRoiPct = document.getElementById('out-roi-percentage');
    const outMarginStatus = document.getElementById('out-margin-status');

    if (outRoughCarats) outRoughCarats.textContent = `${roughWeightCarats.toFixed(2)} cts`;
    if (outPolishedCarats) outPolishedCarats.textContent = `${polishedCarats.toFixed(2)} cts`;
    if (outCostPerRoughCt) outCostPerRoughCt.textContent = `₹${costPerRoughCt.toLocaleString()}`;
    if (outBreakEvenCt) outBreakEvenCt.textContent = `₹${breakEvenPerPolishedCt.toLocaleString()}`;
    if (outSalesRevenue) outSalesRevenue.textContent = `₹${expectedRevenue.toLocaleString()}`;
    
    if (outNetProfit) {
      outNetProfit.textContent = (netProfit >= 0 ? '+' : '') + `₹${netProfit.toLocaleString()}`;
      if (netProfit >= 0) {
        outNetProfit.className = 'planner-output-val profit-positive';
      } else {
        outNetProfit.className = 'planner-output-val profit-negative';
      }
    }

    if (outRoiPct) outRoiPct.textContent = (roiPct >= 0 ? '+' : '') + `${roiPct.toFixed(1)}%`;

    if (outMarginStatus) {
      if (roiPct >= 50) {
        outMarginStatus.textContent = 'HIGH MARGIN';
        outMarginStatus.className = 'roi-badge high-margin';
      } else if (roiPct >= 0) {
        outMarginStatus.textContent = 'MODERATE MARGIN';
        outMarginStatus.className = 'roi-badge moderate-margin';
      } else {
        outMarginStatus.textContent = 'LOSS / NEGATIVE';
        outMarginStatus.className = 'roi-badge loss';
      }
    }
  }
};

window.EmeraldDashboardController = EmeraldDashboardController;
