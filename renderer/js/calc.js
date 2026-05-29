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
   * @param {number} goldRate24kt - Active 24KT rate per gram
   */
  evaluateItem(itemData, goldRate24kt) {
    // 1. Metal values
    let metalTotal = 0;
    const wastage = Number(itemData.wastage !== undefined ? itemData.wastage : 15);
    const metals = itemData.metals || [];
    metals.forEach(part => {
      metalTotal += this.calculateMetalValue(part.weight, part.karat, goldRate24kt);
    });
    metalTotal = metalTotal * (1 + wastage / 100);

    // 2. Stone values
    let stoneTotal = 0;
    let emeraldTotal = 0;
    const stones = itemData.stones || [];
    stones.forEach(stone => {
      const val = Number(stone.totalValue || 0);
      stoneTotal += val;
      if (stone.type && stone.type.toLowerCase() === 'emerald') {
        emeraldTotal += val;
      }
    });

    // 3. Diamonds & Polki values
    let diamondPolkiTotal = 0;
    const diamondsPolki = itemData.diamondsPolki || [];
    diamondsPolki.forEach(dp => {
      diamondPolkiTotal += Number(dp.totalValue || 0);
    });

    // 4. Labour Cost
    const labour = Number(itemData.labourCost || 0);

    // 5. Compute subtotal
    const subtotal = Number((metalTotal + stoneTotal + diamondPolkiTotal + labour).toFixed(2));

    // 6. Commission
    const autoComm = this.calculateCommission(subtotal);
    let finalCommValue = autoComm.value;
    let isManual = false;

    if (itemData.commission && itemData.commission.isManual) {
      finalCommValue = Number(itemData.commission.value || 0);
      isManual = true;
    }

    // 7. Overall Grand Total (Market Cost Price)
    const grandTotal = Number((subtotal + finalCommValue).toFixed(2));
    const profitPct = Number(itemData.profitPercentage !== undefined ? itemData.profitPercentage : 40);

    return {
      metalSubtotal: Number(metalTotal.toFixed(2)),
      stoneSubtotal: Number(stoneTotal.toFixed(2)),
      diamondSubtotal: Number(diamondPolkiTotal.toFixed(2)),
      subtotal: subtotal,
      commissionValue: finalCommValue,
      commissionPercentage: isManual ? Number(((finalCommValue / subtotal) * 100 || 0).toFixed(1)) : autoComm.percentage,
      isManualCommission: isManual,
      grandTotal: grandTotal,
      marketCostPrice: grandTotal,
      homeCostPrice: Number((grandTotal - (emeraldTotal * 0.5)).toFixed(2)),
      emeraldTotal: emeraldTotal,
      sellingPrice: Number((((grandTotal - emeraldTotal) * (1 + profitPct / 100)) + emeraldTotal).toFixed(2)),
      hasEmerald: emeraldTotal > 0
    };
  }
};

window.Calc = Calc;
