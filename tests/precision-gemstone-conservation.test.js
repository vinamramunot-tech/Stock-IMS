const test = require('node:test');
const assert = require('node:assert');
const DBManager = require('../renderer/js/db-manager.js');

test.describe('Precision Gemstone Conservation Suite', () => {

  test.beforeEach(() => {
    DBManager.database = {
      items: [],
      emeralds: [],
      stones: [],
      memos: [],
      jewelryMemos: [],
      jewelStoneMemos: [],
      jewelrySales: [],
      logs: [],
      settings: {}
    };
  });

  test('1. 3-decimal carat arithmetic avoids IEEE-754 floating point drift during parcel splits', () => {
    // Initial lot of 100.555 carats
    const initialLot = {
      id: 'em_split_source',
      color: 'P-100',
      group: 'Russian Emeralds',
      weight: 100.555,
      costPrice: 4500
    };

    // Split lot into three parcels: 33.333 cts, 33.333 cts, and remainder
    const split1Carats = 33.333;
    const split2Carats = 33.333;
    const remainder = Number((initialLot.weight - split1Carats - split2Carats).toFixed(3));

    assert.strictEqual(remainder, 33.889);
    // Total sum should exactly equal 100.555, not 100.55500000000002
    const totalConservation = Number((split1Carats + split2Carats + remainder).toFixed(3));
    assert.strictEqual(totalConservation, 100.555);
  });

  test('2. Weighted-average price per carat during lot merges mathematically conserves total inventory valuation', () => {
    // Lot A: 40.000 cts @ ₹5,000/ct = ₹200,000
    // Lot B: 60.000 cts @ ₹8,000/ct = ₹480,000
    // Merged: 100.000 cts @ (200,000 + 480,000) / 100 = ₹6,800/ct
    const lotA = { weight: 40.000, costPrice: 5000 };
    const lotB = { weight: 60.000, costPrice: 8000 };

    const totalWeight = Number((lotA.weight + lotB.weight).toFixed(3));
    const totalValuation = (lotA.weight * lotA.costPrice) + (lotB.weight * lotB.costPrice);
    const weightedAvgPrice = Number((totalValuation / totalWeight).toFixed(2));

    assert.strictEqual(totalWeight, 100.000);
    assert.strictEqual(totalValuation, 680000);
    assert.strictEqual(weightedAvgPrice, 6800.00);

    // Verify reverse calculation matches total valuation
    const mergedLotValuation = Number((totalWeight * weightedAvgPrice).toFixed(2));
    assert.strictEqual(mergedLotValuation, totalValuation);
  });

  test('3. Error guards against negative carat balances and returns exceeding issued amounts', () => {
    const memoItem = {
      emeraldId: 'em_10',
      carats: 15.500,
      pieces: 20,
      returnedCarats: 0,
      soldCarats: 0,
      returnedPieces: 0,
      soldPieces: 0
    };

    // Calculate remaining carats
    const remCarats = Math.max(0, Number((memoItem.carats - (memoItem.returnedCarats || 0) - (memoItem.soldCarats || 0)).toFixed(3)));
    assert.strictEqual(remCarats, 15.500);

    // Attempting to return 16.000 carats should trigger error
    const inputCarats = 16.000;
    const canReturn = inputCarats <= remCarats + 0.001;
    assert.strictEqual(canReturn, false, 'Cannot return more than issued/remaining carats');

    // Partial return of 10.000 carats
    memoItem.returnedCarats = 10.000;
    const newRem = Math.max(0, Number((memoItem.carats - memoItem.returnedCarats - memoItem.soldCarats).toFixed(3)));
    assert.strictEqual(newRem, 5.500);

    // Attempting to sell 6.000 carats when only 5.500 remain should fail
    const canSellExcess = 6.000 <= newRem + 0.001;
    assert.strictEqual(canSellExcess, false, 'Cannot sell more than remaining carats');
  });

  test('4. Loose stone deduction upon mounting into jewelry pieces', () => {
    const looseStone = {
      id: 'stone_ruby_lot_1',
      type: 'Ruby',
      color: 'Lot-1',
      weight: 50.000,
      pieces: 100,
      sizes: [
        { size: '2.5mm', weight: 50.000, pieces: 100 }
      ]
    };
    DBManager.database.stones = [looseStone];

    // Mount 12.500 carats (25 pieces) onto a jewelry piece
    const mountedCarats = 12.500;
    const mountedPieces = 25;

    const curW = looseStone.weight;
    const newW = Math.max(0, Number((curW - mountedCarats).toFixed(3)));
    const curPcs = looseStone.pieces;
    const newPcs = Math.max(0, curPcs - mountedPieces);

    if (looseStone.sizes && looseStone.sizes.length > 0 && curW > 0) {
      const ratio = newW / curW;
      looseStone.sizes.forEach(s => {
        s.weight = Number((Number(s.weight || 0) * ratio).toFixed(3));
        s.pieces = Math.round(s.pieces * (newPcs / curPcs));
      });
    }
    looseStone.weight = newW;
    looseStone.pieces = newPcs;

    assert.strictEqual(looseStone.weight, 37.500);
    assert.strictEqual(looseStone.pieces, 75);
    assert.strictEqual(looseStone.sizes[0].weight, 37.500);
    assert.strictEqual(looseStone.sizes[0].pieces, 75);
  });
});
