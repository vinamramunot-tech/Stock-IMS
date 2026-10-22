const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Ensure calc.js is loaded first to initialize the Indian Numeric System hooks
const Calc = require('../renderer/js/calc.js');

test('Indian Numeric System & Lakh/Crore Comma Formatting Suite', async (t) => {

  await t.test('1. Number.prototype.toLocaleString formats Lakhs and Crores by default', () => {
    // Under 1 Lakh
    assert.equal((1000).toLocaleString(), '1,000', '1 Thousand');
    assert.equal((10000).toLocaleString(), '10,000', '10 Thousand');
    assert.equal((99999).toLocaleString(), '99,999', '99 Thousand 999');

    // Lakhs (3-2 grouping)
    assert.equal((100000).toLocaleString(), '1,00,000', '1 Lakh must be 1,00,000');
    assert.equal((250000).toLocaleString(), '2,50,000', '2.5 Lakh must be 2,50,000');
    assert.equal((1000000).toLocaleString(), '10,00,000', '10 Lakh must be 10,00,000 (not 1,000,000)');
    assert.equal((5000000).toLocaleString(), '50,00,000', '50 Lakh must be 50,00,000');
    assert.equal((9900000).toLocaleString(), '99,00,000', '99 Lakh must be 99,00,000');

    // Crores (3-2-2 grouping)
    assert.equal((10000000).toLocaleString(), '1,00,00,000', '1 Crore must be 1,00,00,000 (not 10,000,000)');
    assert.equal((25000000).toLocaleString(), '2,50,00,000', '2.5 Crore must be 2,50,00,000');
    assert.equal((100000000).toLocaleString(), '10,00,00,000', '10 Crore must be 10,00,00,000');
    assert.equal((500000000).toLocaleString(), '50,00,00,000', '50 Crore must be 50,00,00,000');
  });

  await t.test('2. Decimals and options with undefined/omitted locale follow Indian system', () => {
    const formattedDec = (1234567.89).toLocaleString(undefined, { minimumFractionDigits: 2 });
    assert.equal(formattedDec, '12,34,567.89', '12.34 Lakh with 2 decimals');

    const formattedWhole = (1000000).toLocaleString(undefined, { minimumFractionDigits: 2 });
    assert.equal(formattedWhole, '10,00,000.00', '10 Lakh with forced .00 decimals');

    const formattedCroreDec = (25075420.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    assert.equal(formattedCroreDec, '2,50,75,420.50', '2.507 Crore with padded decimal zero');
  });

  await t.test('3. Explicit foreign locales (e.g. en-US for USD) remain supported', () => {
    const formattedUsd = (1000000).toLocaleString('en-US');
    assert.equal(formattedUsd, '1,000,000', 'Explicit en-US locale must produce Western 1,000,000');
  });

  await t.test('4. Intl.NumberFormat defaults to Indian Numeric System', () => {
    const formatter = new Intl.NumberFormat();
    assert.equal(formatter.format(1000000), '10,00,000', 'Intl.NumberFormat must format 10,00,000');
    assert.equal(formatter.format(10000000), '1,00,00,000', 'Intl.NumberFormat must format 1,00,00,000');
  });

  await t.test('5. Calc engine helper methods format INR and Indian numbers accurately', () => {
    assert.equal(Calc.formatINR(125000), '₹1,25,000.00', 'Calc.formatINR standard amount');
    assert.equal(Calc.formatINR(10000000), '₹1,00,00,000.00', 'Calc.formatINR 1 Crore');
    assert.equal(Calc.formatIndianNumber(2500000), '25,00,000', 'Calc.formatIndianNumber 25 Lakh');
    assert.equal(Calc.formatIndianNumber(1234567.89, { minimumFractionDigits: 2 }), '12,34,567.89');
  });

  await t.test('6. Complete piece evaluation selling price formats with Indian commas', () => {
    const mockItem = {
      grossWeight: 15.0,
      karat: 18,
      wastage: 15,
      labourCost: 10000,
      commission: 5000,
      profitPercentage: 40,
      stones: [{ weight: 4.0, ratePerCarat: 25000 }], // 100,000
      diamondsPolki: [{ weight: 2.0, ratePerCarat: 50000 }] // 100,000
    };
    const evalRes = Calc.evaluateItem(mockItem, 7500);
    // Ensure selling price is calculated and formats into Indian Lakhs
    assert.ok(evalRes.sellingPrice > 100000, 'Selling price must be above 1 Lakh');
    const formattedSellingPrice = evalRes.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 });
    
    // Must contain Lakh comma grouping (e.g. ₹X,XX,XXX.XX)
    assert.match(
      formattedSellingPrice,
      /^\d{1,2},\d{2},\d{3}\.\d{2}$/,
      `Selling price (${formattedSellingPrice}) must follow Indian comma grouping format`
    );
  });
});
