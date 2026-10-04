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
    if (!itemData) return 0;
    let stonesSum = 0;
    (itemData.stones || []).forEach(s => {
      const w = Number(s?.weight || s?.carats || s?.cts || s?.totalWeight);
      if (!isNaN(w) && w > 0) stonesSum += w;
    });
    (itemData.diamondsPolki || []).forEach(d => {
      const w = Number(d?.weight || d?.carats || d?.cts || d?.totalWeight);
      if (!isNaN(w) && w > 0) stonesSum += w;
    });
    return Number((stonesSum * 0.2).toFixed(4));
  },

  /**
   * Helper to calculate proportional net weight of each metal part
   * Returns breakdown of Main Piece + any Additional Metal Parts
   */
  getNetMetals(itemData) {
    if (!itemData) return [];
    const stoneWeightGrams = this.getStoneWeightInGrams(itemData);
    let additionalMetals = itemData.metals || [];

    // Fallback detection for older records or Excel imports with alternate property names
    let totalGrossWeight = Number(itemData.grossWeight || itemData.grossWt || itemData.weight || 0);
    const mainKarat = Number(itemData.karat || (itemData.metals?.[0]?.karat) || 18);
    const mainWastage = Number(itemData.wastage !== undefined && itemData.wastage !== null && itemData.wastage !== ''
      ? itemData.wastage
      : (itemData.metals?.[0]?.wastage !== undefined ? itemData.metals[0].wastage : 15));

    // If item has a single Body Component metal (from Excel imports), it represents the Main Piece itself
    if (additionalMetals.length === 1 && (additionalMetals[0].name === 'Body Component' || additionalMetals[0].name === 'Main Piece')) {
      if (totalGrossWeight <= 0) {
        totalGrossWeight = Number(additionalMetals[0].weight || 0);
      }
      additionalMetals = []; // Promote it to the Main Piece so it is not double counted
    } else if (totalGrossWeight <= 0 && additionalMetals.length > 0) {
      totalGrossWeight = Number(additionalMetals[0].weight || 0);
      additionalMetals = additionalMetals.slice(1);
    }

    const result = [];

    // Sum of additional metal component weights (which are already part of the total gross weight)
    const additionalMetalsWeight = additionalMetals.reduce((sum, m) => sum + Number(m.weight || 0), 0);

    // If main piece gross weight is specified
    if (totalGrossWeight > 0) {
      // Main piece gross weight = Total Gross Weight - additional component weights
      const mainPieceGrossWeight = Math.max(0, Number((totalGrossWeight - additionalMetalsWeight).toFixed(4)));
      // Main piece net weight = Main piece gross weight - gemstones weight
      const mainNetWeight = Math.max(0, Number((mainPieceGrossWeight - stoneWeightGrams).toFixed(4)));

      result.push({
        name: 'Main Piece',
        karat: mainKarat,
        grossWeight: mainPieceGrossWeight,
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
    const w = Number(weight);
    const r = Number(ratePerCarat);
    if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return 0;
    return Number((w * r).toFixed(2));
  },

  calculateStoneRate(weight, totalValue) {
    const w = Number(weight);
    const tv = Number(totalValue);
    if (isNaN(w) || isNaN(tv) || w <= 0 || tv <= 0) return 0;
    return Number((tv / w).toFixed(2));
  },

  /**
   * Calculate discounted price given a multiplier (e.g. 0.9x for 10% off)
   */
  calculateDiscountedRate(baseRate, multiplier) {
    const rate = Number(baseRate);
    if (isNaN(rate) || rate <= 0) return 0;
    const mult = (multiplier !== undefined && multiplier !== null && !isNaN(Number(multiplier))) ? Number(multiplier) : 1.0;
    return Number((rate * mult).toFixed(2));
  },

  /**
   * Convert currency (e.g. USD to INR or INR to USD)
   */
  convertCurrency(amount, exchangeRate) {
    const amt = Number(amount);
    const rate = Number(exchangeRate);
    if (isNaN(amt) || isNaN(rate) || amt <= 0 || rate <= 0) return 0;
    return Number((amt * rate).toFixed(2));
  },

  /**
   * Manual commission helper (purely manual input)
   */
  calculateCommission(subtotal, commission) {
    let value = 0;
    if (commission !== undefined && commission !== null) {
      value = typeof commission === 'object' ? Number(commission.value || 0) : Number(commission || 0);
    }
    const pct = subtotal > 0 ? Number(((value / subtotal) * 100).toFixed(1)) : 0;
    return { value, percentage: pct };
  },

  /**
   * Calculate dual manufacturing and replacement profit metrics for a sale
   */
  calculateSaleProfit(soldPrice, mfgCost, replacementCost) {
    const sold = Number(soldPrice) || 0;
    const mfg = Number(mfgCost) || 0;
    const rep = (replacementCost !== undefined && replacementCost !== null) ? Number(replacementCost) : mfg;
    
    const mfgProfit = Number((sold - mfg).toFixed(2));
    const mfgMarginPct = mfg > 0 ? Number(((mfgProfit / mfg) * 100).toFixed(2)) : 0;

    const repProfit = Number((sold - rep).toFixed(2));
    const repMarginPct = rep > 0 ? Number(((repProfit / rep) * 100).toFixed(2)) : 0;

    const commodityGain = Number((rep - mfg).toFixed(2));

    return {
      soldPrice: sold,
      mfgCost: mfg,
      replacementCost: rep,
      mfgProfit,
      mfgMarginPct,
      replacementProfit: repProfit,
      replacementMarginPct: repMarginPct,
      goldCommodityGain: commodityGain
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
      : Number(itemData?.mfgGoldRate24kt || itemData?.goldRateAtAddition || itemData?.goldRateMfg || 0);

    const defaultWastage = Number(itemData?.wastage !== undefined && itemData.wastage !== null && itemData.wastage !== '' ? itemData.wastage : 15);

    // 1. Metal values (Global rate & Mfg date rate)
    let metalTotalGlobal = 0;
    let metalTotalMfg = 0;

    netMetals.forEach(part => {
      const manualVal = (part.totalValue !== undefined && part.totalValue !== null && part.totalValue !== '' && Number(part.totalValue) > 0)
        ? Number(part.totalValue)
        : ((part.directValue !== undefined && part.directValue !== null && part.directValue !== '' && Number(part.directValue) > 0)
          ? Number(part.directValue)
          : null);

      const partWastage = (part.wastage !== undefined && part.wastage !== null && part.wastage !== '') ? Number(part.wastage) : defaultWastage;
      const wastageFactor = 1 + (partWastage / 100);

      // Global / Replacement Metal Value (at live gold rate)
      if (part.netWeight > 0 && globalRate > 0) {
        const partValGlobal = this.calculateMetalValue(part.netWeight, part.karat, globalRate);
        metalTotalGlobal += partValGlobal * wastageFactor;
      } else if (manualVal !== null) {
        metalTotalGlobal += manualVal;
      }

      // Historical Manufacturing Metal Value (at mfg date gold rate or manual purchase cost)
      if (manualVal !== null) {
        metalTotalMfg += manualVal;
      } else if (part.netWeight > 0 && mfgRate > 0) {
        const partValMfg = this.calculateMetalValue(part.netWeight, part.karat, mfgRate);
        metalTotalMfg += partValMfg * wastageFactor;
      } else if (part.netWeight > 0 && globalRate > 0) {
        const partValGlobal = this.calculateMetalValue(part.netWeight, part.karat, globalRate);
        metalTotalMfg += partValGlobal * wastageFactor;
      }
    });

    // 2. Stone values
    let stoneTotal = 0;
    let emeraldTotal = 0;
    const stones = itemData?.stones || [];
    stones.forEach(stone => {
      let val = Number(stone.totalValue);
      if (isNaN(val) || val === 0) {
        val = Number((Number(stone.weight || 0) * Number(stone.ratePerCarat || 0)).toFixed(2));
      }
      if (!isNaN(val) && val > 0) {
        stoneTotal += val;
        if (stone.type && String(stone.type).toLowerCase() === 'emerald') {
          emeraldTotal += val;
        }
      }
    });

    // 3. Diamonds & Polki values
    let diamondPolkiTotal = 0;
    const diamondsPolki = itemData?.diamondsPolki || [];
    diamondsPolki.forEach(dp => {
      let val = Number(dp.totalValue);
      if (isNaN(val) || val === 0) {
        val = Number((Number(dp.weight || 0) * Number(dp.ratePerCarat || 0)).toFixed(2));
      }
      if (!isNaN(val) && val > 0) {
        diamondPolkiTotal += val;
      }
    });

    // 4. Labour Cost
    const labour = Number(itemData?.labourCost || 0);

    // 5. Compute subtotals
    const subtotalGlobal = Number((metalTotalGlobal + stoneTotal + diamondPolkiTotal + labour).toFixed(2));
    const subtotalMfg = Number((metalTotalMfg + stoneTotal + diamondPolkiTotal + labour).toFixed(2));

    // 6. Commission calculations (Manual Input Only)
    let finalCommValue = 0;
    if (itemData?.commission !== undefined && itemData?.commission !== null) {
      finalCommValue = typeof itemData.commission === 'object' ? Number(itemData.commission.value || 0) : Number(itemData.commission || 0);
    }
    const finalCommValueGlobal = finalCommValue;
    const finalCommValueMfg = finalCommValue;

    // 7. Overall Grand Totals
    // Market Cost Price / Replacement Cost calculated using Global Gold Rate
    const marketCostPrice = Number((subtotalGlobal + finalCommValueGlobal).toFixed(2));

    // Home Cost Price / Manufacturing Grand Total calculated using Mfg Gold Rate / historical cost
    const grandTotalMfg = (itemData?.mfgCostPrice && Number(itemData.mfgCostPrice) > 0)
      ? Number(Number(itemData.mfgCostPrice).toFixed(2))
      : Number((subtotalMfg + finalCommValueMfg).toFixed(2));
    
    // Home Cost Price calculated using Global Gold Rate with configurable Emerald discount percentage (default 50%)
    const emeraldDiscountPct = (itemData?.emeraldDiscountPercentage !== undefined && itemData?.emeraldDiscountPercentage !== null && itemData?.emeraldDiscountPercentage !== '')
      ? Number(itemData.emeraldDiscountPercentage)
      : ((itemData?.emeraldDiscount !== undefined && itemData?.emeraldDiscount !== null && itemData?.emeraldDiscount !== '')
        ? Number(itemData.emeraldDiscount)
        : 50);
    const emeraldDiscountFactor = Math.max(0, emeraldDiscountPct) / 100;
    const homeCostPrice = Number((marketCostPrice - (emeraldTotal * emeraldDiscountFactor)).toFixed(2));

    const profitPct = Number(itemData?.profitPercentage !== undefined ? itemData.profitPercentage : 40);
    const sellingPrice = Number((((marketCostPrice - emeraldTotal) * (1 + profitPct / 100)) + emeraldTotal).toFixed(2));

    const totalGrossWeight = Number((itemData?.grossWeight > 0 ? Number(itemData.grossWeight) : netMetals.reduce((sum, m) => sum + Number(m.grossWeight || 0), 0)).toFixed(3));
    const totalNetMetalWeight = Number(netMetals.reduce((sum, m) => sum + Number(m.netWeight || 0), 0).toFixed(3));
    const mainNetWeight = Number((netMetals.find(m => m.isMain)?.netWeight || 0).toFixed(3));

    return {
      metalSubtotal: Number(metalTotalGlobal.toFixed(2)),
      mfgMetalSubtotal: Number(metalTotalMfg.toFixed(2)),
      stoneSubtotal: Number(stoneTotal.toFixed(2)),
      diamondSubtotal: Number(diamondPolkiTotal.toFixed(2)),
      subtotal: subtotalGlobal,
      mfgSubtotal: subtotalMfg,
      commissionValue: finalCommValueGlobal,
      commissionPercentage: subtotalGlobal > 0 ? Number(((finalCommValueGlobal / subtotalGlobal) * 100 || 0).toFixed(1)) : 0,
      isManualCommission: true,
      grandTotal: marketCostPrice,
      marketCostPrice: marketCostPrice,
      mfgGrandTotal: grandTotalMfg,
      homeCostPrice: homeCostPrice,
      emeraldTotal: emeraldTotal,
      emeraldDiscountPercentage: emeraldDiscountPct,
      sellingPrice: sellingPrice,
      hasEmerald: emeraldTotal > 0,
      totalGrossWeight: totalGrossWeight,
      totalNetMetalWeight: totalNetMetalWeight,
      mainNetWeight: mainNetWeight
    };
  }
};

if (typeof window !== 'undefined') {
  window.Calc = Calc;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calc;
}
