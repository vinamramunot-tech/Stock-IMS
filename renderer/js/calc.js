/**
 * Mathematical Calculation Engine for Mava Gems
 * Centralizes all calculations to ensure consistency across the application.
 */

const Calc = {
  // Metal karats presets and factors
  KARAT_FACTORS: {
    24: 24 / 24,
    22: 22 / 24,
    18: 18 / 24,
    14: 14 / 24,
    10: 10 / 24,
    9: 9 / 24
  },

  /**
   * Calculate value of a specific metal part
   * @param {number} weight - Weight in grams
   * @param {number} karat - Karat rating (e.g. 18, 14)
   * @param {number} goldRate24kt - Global 24KT gold rate per gram
   */
  calculateMetalValue(weight, karat, goldRate24kt) {
    if (!weight || !karat || !goldRate24kt) return 0;
    const factor = this.KARAT_FACTORS[karat] || (karat / 24);
    return Number((weight * goldRate24kt * factor).toFixed(2));
  },

  /**
   * Helper to get total stone weight in grams (1 ct = 0.2 g)
   */
  getStoneWeightInGrams(itemData) {
    let stonesSum = 0;
    (itemData.stones || []).forEach(s => stonesSum += Number(s.weight || 0));
    (itemData.diamondsPolki || []).forEach(d => stonesSum += Number(d.weight || 0));
    return Number((stonesSum * 0.2).toFixed(4));
  },

  /**
   * Helper to calculate proportional net weight of each metal part
   * Returns breakdown of Main Piece + any Additional Metal Parts
   */
  getNetMetals(itemData) {
    if (!itemData) return [];
    const stoneWeightGrams = this.getStoneWeightInGrams(itemData);
    const mainGrossWeight = Number(itemData.grossWeight || 0);
    const mainKarat = Number(itemData.karat || 18);
    const mainWastage = Number(itemData.wastage !== undefined && itemData.wastage !== null && itemData.wastage !== '' ? itemData.wastage : 15);
    const additionalMetals = itemData.metals || [];

    const result = [];

    // If main piece gross weight is specified
    if (mainGrossWeight > 0) {
      const mainNetWeight = Math.max(0, Number((mainGrossWeight - stoneWeightGrams).toFixed(4)));
      result.push({
        name: 'Main Piece',
        karat: mainKarat,
        grossWeight: mainGrossWeight,
        netWeight: mainNetWeight,
        wastage: mainWastage,
        isMain: true
      });
    }

    // Additional metal components (e.g. chain, clasp)
    additionalMetals.forEach((m, idx) => {
      const w = Number(m.weight || 0);
      const k = Number(m.karat || mainKarat);
      const was = (m.wastage !== undefined && m.wastage !== null && m.wastage !== '') ? Number(m.wastage) : mainWastage;
      result.push({
        ...m,
        name: m.name || `Metal Part #${idx + 1}`,
        karat: k,
        grossWeight: w,
        netWeight: w, // Additional components do not have stone deduction
        wastage: was,
        isMain: false
      });
    });

    // Fallback for legacy items that only had metals array without root grossWeight
    if (result.length === 0 && additionalMetals.length > 0) {
      const totalGross = additionalMetals.reduce((sum, m) => sum + Number(m.weight || 0), 0);
      return additionalMetals.map(m => {
        const gross = Number(m.weight || 0);
        const prop = totalGross > 0 ? (gross / totalGross) : 0;
        const ded = stoneWeightGrams * prop;
        return {
          ...m,
          grossWeight: gross,
          netWeight: Number(Math.max(0, gross - ded).toFixed(4)),
          wastage: (m.wastage !== undefined && m.wastage !== null) ? Number(m.wastage) : mainWastage
        };
      });
    }

    return result;
  },

  /**
   * Bidirectional Stone Calculations
   */
  calculateStoneTotal(weight, ratePerCarat) {
    if (!weight || !ratePerCarat) return 0;
    return Number((weight * ratePerCarat).toFixed(2));
  },

  calculateStoneRate(weight, totalValue) {
    if (!weight || !totalValue) return 0;
    return Number((totalValue / weight).toFixed(2));
  },

  /**
   * Calculate commission based on subtotal progressive slabs
   * Slab Table:
   *   Below ₹25,000         -> 10%
   *   ₹25,000 - ₹50,000     -> 8%
   *   ₹50,000 - ₹1,50,000   -> 6%
   *   ₹1,50,000 - ₹3,00,000 -> 4%
   *   ₹3,00,000 - ₹5,00,000 -> 3%
   *   Above ₹5,00,000       -> 2%
   */
  calculateCommission(subtotal) {
    if (!subtotal || subtotal <= 0) return 0;
    
    let rate = 0;
    if (subtotal < 25000) {
      rate = 0.10;
    } else if (subtotal < 50000) {
      rate = 0.08;
    } else if (subtotal < 150000) {
      rate = 0.06;
    } else if (subtotal < 300000) {
      rate = 0.04;
    } else if (subtotal < 500000) {
      rate = 0.03;
    } else {
      rate = 0.02;
    }

    return {
      value: Number((subtotal * rate).toFixed(2)),
      percentage: rate * 100
    };
  },

  /**
   * Complete item valuation calculator
   * @param {Object} itemData - Raw, un-saved or parsed item state
   * @param {number} goldRate24kt - Global 24KT rate per gram (used for Market Cost Price & Selling Price)
   * @param {number} [mfgGoldRate24kt] - 24KT rate per gram on Date of Mfg (used for Home Cost Price)
   */
  evaluateItem(itemData, goldRate24kt, mfgGoldRate24kt) {
    const netMetals = this.getNetMetals(itemData);

    const globalRate = Number(goldRate24kt || 0);
    const mfgRate = (mfgGoldRate24kt !== undefined && mfgGoldRate24kt !== null && Number(mfgGoldRate24kt) > 0)
      ? Number(mfgGoldRate24kt)
      : Number(itemData?.mfgGoldRate24kt || itemData?.goldRateAtAddition || globalRate);

    const defaultWastage = Number(itemData?.wastage !== undefined && itemData.wastage !== null && itemData.wastage !== '' ? itemData.wastage : 15);

    // 1. Metal values (Global rate & Mfg date rate)
    let metalTotalGlobal = 0;
    let metalTotalMfg = 0;

    netMetals.forEach(part => {
      const partWastage = (part.wastage !== undefined && part.wastage !== null && part.wastage !== '') ? Number(part.wastage) : defaultWastage;
      const wastageFactor = 1 + (partWastage / 100);

      const partValGlobal = this.calculateMetalValue(part.netWeight, part.karat, globalRate);
      metalTotalGlobal += partValGlobal * wastageFactor;

      const partValMfg = this.calculateMetalValue(part.netWeight, part.karat, mfgRate);
      metalTotalMfg += partValMfg * wastageFactor;
    });

    // 2. Stone values
    let stoneTotal = 0;
    let emeraldTotal = 0;
    const stones = itemData?.stones || [];
    stones.forEach(stone => {
      const val = Number(stone.totalValue || 0);
      stoneTotal += val;
      if (stone.type && stone.type.toLowerCase() === 'emerald') {
        emeraldTotal += val;
      }
    });

    // 3. Diamonds & Polki values
    let diamondPolkiTotal = 0;
    const diamondsPolki = itemData?.diamondsPolki || [];
    diamondsPolki.forEach(dp => {
      diamondPolkiTotal += Number(dp.totalValue || 0);
    });

    // 4. Labour Cost
    const labour = Number(itemData?.labourCost || 0);

    // 5. Compute subtotals
    const subtotalGlobal = Number((metalTotalGlobal + stoneTotal + diamondPolkiTotal + labour).toFixed(2));
    const subtotalMfg = Number((metalTotalMfg + stoneTotal + diamondPolkiTotal + labour).toFixed(2));

    // 6. Commission calculations
    const autoCommGlobal = this.calculateCommission(subtotalGlobal);
    const autoCommMfg = this.calculateCommission(subtotalMfg);

    let finalCommValueGlobal = autoCommGlobal.value;
    let finalCommValueMfg = autoCommMfg.value;
    let isManual = false;

    if (itemData?.commission && itemData.commission.isManual) {
      finalCommValueGlobal = Number(itemData.commission.value || 0);
      finalCommValueMfg = Number(itemData.commission.value || 0);
      isManual = true;
    }

    // 7. Overall Grand Totals
    // Market Cost Price calculated using Global Gold Rate
    const marketCostPrice = Number((subtotalGlobal + finalCommValueGlobal).toFixed(2));

    // Home Cost Price / Manufacturing Grand Total calculated using Mfg Date 24KT Gold Rate
    const grandTotalMfg = Number((subtotalMfg + finalCommValueMfg).toFixed(2));
    const homeCostPrice = Number((grandTotalMfg - (emeraldTotal * 0.5)).toFixed(2));

    const profitPct = Number(itemData?.profitPercentage !== undefined ? itemData.profitPercentage : 40);
    const sellingPrice = Number((((marketCostPrice - emeraldTotal) * (1 + profitPct / 100)) + emeraldTotal).toFixed(2));

    const totalGrossWeight = Number(netMetals.reduce((sum, m) => sum + Number(m.grossWeight || 0), 0).toFixed(3));
    const totalNetMetalWeight = Number(netMetals.reduce((sum, m) => sum + Number(m.netWeight || 0), 0).toFixed(3));

    return {
      metalSubtotal: Number(metalTotalGlobal.toFixed(2)),
      mfgMetalSubtotal: Number(metalTotalMfg.toFixed(2)),
      stoneSubtotal: Number(stoneTotal.toFixed(2)),
      diamondSubtotal: Number(diamondPolkiTotal.toFixed(2)),
      subtotal: subtotalGlobal,
      mfgSubtotal: subtotalMfg,
      commissionValue: finalCommValueGlobal,
      commissionPercentage: isManual ? Number(((finalCommValueGlobal / subtotalGlobal) * 100 || 0).toFixed(1)) : autoCommGlobal.percentage,
      isManualCommission: isManual,
      grandTotal: marketCostPrice,
      marketCostPrice: marketCostPrice,
      mfgGrandTotal: grandTotalMfg,
      homeCostPrice: homeCostPrice,
      emeraldTotal: emeraldTotal,
      sellingPrice: sellingPrice,
      hasEmerald: emeraldTotal > 0,
      totalGrossWeight: totalGrossWeight,
      totalNetMetalWeight: totalNetMetalWeight
    };
  }
};

window.Calc = Calc;
