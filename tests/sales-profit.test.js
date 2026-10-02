const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../renderer/js/calc.js');

test('Sales Profit & Margin Mathematics - Pure Calculation Engine', async (t) => {
  await t.test('Computes dual manufacturing and replacement profits with margin %', () => {
    // Sold: ₹125,000, Mfg Cost: ₹80,000, Replacement Cost: ₹95,000
    // Mfg Profit: 125,000 - 80,000 = ₹45,000 (+56.25%)
    // Replacement Profit: 125,000 - 95,000 = ₹30,000 (+31.58%)
    // Gold Commodity Gain: 95,000 - 80,000 = ₹15,000
    const result = Calc.calculateSaleProfit(125000, 80000, 95000);

    assert.equal(result.soldPrice, 125000);
    assert.equal(result.mfgCost, 80000);
    assert.equal(result.replacementCost, 95000);
    assert.equal(result.mfgProfit, 45000);
    assert.equal(result.mfgMarginPct, 56.25);
    assert.equal(result.replacementProfit, 30000);
    assert.equal(result.replacementMarginPct, 31.58);
    assert.equal(result.goldCommodityGain, 15000);
  });

  await t.test('Handles sale where replacementCost is omitted or matches mfgCost', () => {
    const result = Calc.calculateSaleProfit(100000, 80000);
    assert.equal(result.mfgProfit, 20000);
    assert.equal(result.replacementProfit, 20000);
    assert.equal(result.goldCommodityGain, 0);
  });

  await t.test('Handles negative profit / discount sales correctly', () => {
    // Sold at a loss: Sold ₹70,000 against Mfg Cost ₹80,000
    const result = Calc.calculateSaleProfit(70000, 80000, 85000);
    assert.equal(result.mfgProfit, -10000);
    assert.equal(result.mfgMarginPct, -12.5);
    assert.equal(result.replacementProfit, -15000);
    assert.equal(result.replacementMarginPct, -17.65);
  });

  await t.test('Safely handles zero or empty input without NaN', () => {
    const result = Calc.calculateSaleProfit(0, 0, 0);
    assert.equal(result.mfgProfit, 0);
    assert.equal(result.mfgMarginPct, 0);
    assert.equal(Number.isNaN(result.mfgMarginPct), false);
    assert.equal(Number.isNaN(result.replacementMarginPct), false);
  });
});
