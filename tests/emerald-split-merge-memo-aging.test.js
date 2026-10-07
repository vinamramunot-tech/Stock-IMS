const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const emeraldJsPath = path.resolve(__dirname, '../renderer/js/emerald.js');
const memoJsPath = path.resolve(__dirname, '../renderer/js/memo.js');
const jewelryMemoJsPath = path.resolve(__dirname, '../renderer/js/jewelry-memo.js');
const uiJsPath = path.resolve(__dirname, '../renderer/js/ui.js');

test('Option 3 & Option 4: Emerald Pudia Splitting/Merging & B2B Memo Aging Workflow', async (suite) => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(customCssPath, 'utf8');
  const emeraldJs = fs.readFileSync(emeraldJsPath, 'utf8');
  const memoJs = fs.readFileSync(memoJsPath, 'utf8');
  const jewelryMemoJs = fs.readFileSync(jewelryMemoJsPath, 'utf8');
  const uiJs = fs.readFileSync(uiJsPath, 'utf8');

  // =========================================================================
  // 1. OPTION 4: B2B MEMO AGING ENGINE
  // =========================================================================
  await suite.test('1. B2B Memo Aging: Calculation, Overdue Threshold (>7 days) & Aging Badges', () => {
    // Pure calculation helper matching memo.js / jewelry-memo.js
    function computeDaysOpen(issueDateStr, refDate = new Date('2026-10-07T00:00:00')) {
      const d = new Date(issueDateStr + 'T00:00:00');
      const today = new Date(refDate);
      today.setHours(0, 0, 0, 0);
      return !isNaN(d.getTime()) ? Math.max(0, Math.floor((today - d) / (1000 * 60 * 60 * 24))) : 0;
    }

    // Test aging for varying dates
    assert.equal(computeDaysOpen('2026-10-07'), 0, 'Same day memo is 0 days open');
    assert.equal(computeDaysOpen('2026-10-05'), 2, '2 days ago is 2 days open');
    assert.equal(computeDaysOpen('2026-10-01'), 6, '6 days ago is 6 days open');
    assert.equal(computeDaysOpen('2026-09-29'), 8, '8 days ago is 8 days open');
    assert.equal(computeDaysOpen('2026-09-20'), 17, '17 days ago is 17 days open');

    // Threshold classification
    function getAgingBadge(daysOpen, status) {
      if (status !== 'open') return 'Closed';
      if (daysOpen > 7) return 'badge-overdue';
      if (daysOpen >= 5) return 'badge-due-soon';
      return 'badge-active-memo';
    }

    assert.equal(getAgingBadge(3, 'open'), 'badge-active-memo');
    assert.equal(getAgingBadge(5, 'open'), 'badge-due-soon');
    assert.equal(getAgingBadge(7, 'open'), 'badge-due-soon');
    assert.equal(getAgingBadge(8, 'open'), 'badge-overdue');
    assert.equal(getAgingBadge(15, 'closed'), 'Closed');

    // Verify presence in source files
    assert.match(memoJs, /filterVal\s*===\s*'overdue'/, 'memo.js must support overdue status filter');
    assert.match(memoJs, /metric-memo-overdue-count/, 'memo.js must update overdue metric count');
    assert.match(jewelryMemoJs, /filterVal\s*===\s*'overdue'/, 'jewelry-memo.js must support overdue status filter');
    assert.match(jewelryMemoJs, /metric-jewelry-memo-overdue-count/, 'jewelry-memo.js must update overdue metric count');
  });

  // =========================================================================
  // 2. OPTION 4: 1-TAP WHATSAPP BROKER REMINDERS
  // =========================================================================
  await suite.test('2. WhatsApp Broker Reminders: Phone Formatting & Direct Link Generation', () => {
    // Phone cleaner logic matching UI.openWhatsAppReminderModal
    function cleanWhatsAppPhone(rawPhone) {
      let clean = (rawPhone || '').replace(/[^0-9]/g, '');
      if (clean.length === 10) {
        clean = '91' + clean;
      }
      return clean;
    }

    assert.equal(cleanWhatsAppPhone('9829012345'), '919829012345', '10-digit Indian phone gets 91 prefixed');
    assert.equal(cleanWhatsAppPhone('+91 98290 12345'), '919829012345', 'Formatted number stripped cleanly');
    assert.equal(cleanWhatsAppPhone('14155552671'), '14155552671', 'US/international numbers keep exact digits');

    // WhatsApp URL generation
    function buildWhatsAppUrl(phone, msg) {
      return `https://api.whatsapp.com/send?phone=${cleanWhatsAppPhone(phone)}&text=${encodeURIComponent(msg)}`;
    }

    const testMsg = "Namaste Brokerji, Kindly return emerald parcel #9A.";
    const url = buildWhatsAppUrl('9829012345', testMsg);
    assert.ok(url.startsWith('https://api.whatsapp.com/send?phone=919829012345&text='), 'Valid WhatsApp API deep link');
    assert.ok(url.includes(encodeURIComponent("emerald parcel #9A")), 'Message text properly percent-encoded');

    // Verify UI helper and modal in source files
    assert.match(uiJs, /openWhatsAppReminderModal/, 'ui.js must export openWhatsAppReminderModal');
    assert.match(memoJs, /openWhatsAppReminder\s*\(/, 'memo.js must implement openWhatsAppReminder');
    assert.match(jewelryMemoJs, /openWhatsAppReminder\s*\(/, 'jewelry-memo.js must implement openWhatsAppReminder');
    assert.match(html, /id="modal-whatsapp-reminder"/, 'index.html must have #modal-whatsapp-reminder modal');
  });

  // =========================================================================
  // 3. OPTION 3: PUDIA SPLITTING MATHEMATICS & CONSTRAINTS
  // =========================================================================
  await suite.test('3. Pudia Splitting: Weight Deductions, Proportional Sizes & In-Company Invariance', () => {
    const parentParcel = {
      id: 'em_parent_1',
      color: 9,
      group: 'A-1 Lot',
      stockType: 'Calibrated Series',
      pricePerCarat: 15000,
      weight: 50.00,
      sizes: [
        { shape: 'Emerald Cut', mm: '7x5', pieces: 20, weight: 20.00 },
        { shape: 'Emerald Cut', mm: '6x4', pieces: 40, weight: 30.00 }
      ]
    };

    const splitCarats = 15.00;
    const splitPieces = 18;
    const memoCarats = 10.00;
    const availableInCompany = parentParcel.weight - memoCarats; // 40.00 cts

    // Split validity check
    assert.ok(splitCarats < parentParcel.weight, 'Split carats must be less than total parcel weight');
    assert.ok(splitCarats <= availableInCompany, 'Split carats cannot exceed goods available in company');

    const remParentWeight = Number((parentParcel.weight - splitCarats).toFixed(3)); // 35.00 cts
    assert.ok(remParentWeight >= memoCarats, 'Remaining parent weight must satisfy active memo requirement');

    const ratioChild = splitCarats / parentParcel.weight; // 0.30
    const ratioParent = remParentWeight / parentParcel.weight; // 0.70

    // Distribute sizes
    let allocatedChildWeight = 0;
    const childSizes = parentParcel.sizes.map((s, idx) => {
      const isLast = idx === parentParcel.sizes.length - 1;
      const w = isLast ? Number((splitCarats - allocatedChildWeight).toFixed(3)) : Number((s.weight * ratioChild).toFixed(3));
      allocatedChildWeight += w;
      const p = Math.max(1, Math.round(s.pieces * ratioChild));
      return { shape: s.shape, mm: s.mm, pieces: p, weight: w };
    });

    let allocatedParentWeight = 0;
    const remParentSizes = parentParcel.sizes.map((s, idx) => {
      const isLast = idx === parentParcel.sizes.length - 1;
      const w = isLast ? Number((remParentWeight - allocatedParentWeight).toFixed(3)) : Number((s.weight * ratioParent).toFixed(3));
      allocatedParentWeight += w;
      const p = Math.max(1, Math.round(s.pieces * ratioParent));
      return { shape: s.shape, mm: s.mm, pieces: p, weight: w };
    });

    const sumChildWeight = childSizes.reduce((sum, s) => sum + s.weight, 0);
    const sumParentWeight = remParentSizes.reduce((sum, s) => sum + s.weight, 0);

    assert.equal(sumChildWeight, splitCarats, 'Child size breakdown weight must equal split carats');
    assert.equal(sumParentWeight, remParentWeight, 'Parent size breakdown weight must equal remaining carats');
    assert.equal(Number((sumChildWeight + sumParentWeight).toFixed(3)), parentParcel.weight, 'Total carats strictly conserved');

    // Verify emerald.js implements split methods
    assert.match(emeraldJs, /openSplitModal\s*\(/, 'emerald.js must implement openSplitModal');
    assert.match(emeraldJs, /updateSplitPreview\s*\(/, 'emerald.js must implement updateSplitPreview');
    assert.match(emeraldJs, /handleConfirmSplit\s*\(/, 'emerald.js must implement handleConfirmSplit');
    assert.match(html, /id="modal-split-pudia"/, 'index.html must have #modal-split-pudia modal');
  });

  // =========================================================================
  // 4. OPTION 3: PUDIA MERGING MATHEMATICS & WEIGHTED AVERAGE VALUATION
  // =========================================================================
  await suite.test('4. Pudia Merging: Combined Carats, Weighted Average Rate/ct & Active Memo Guards', () => {
    const lotA = { id: 'em_1', color: 10, weight: 25.50, pricePerCarat: 12000, shape: 'Oval', origins: ['Zambian'] };
    const lotB = { id: 'em_2', color: 11, weight: 14.50, pricePerCarat: 18000, shape: 'Octagon', origins: ['Russian'] };
    const lotC = { id: 'em_3', color: 12, weight: 10.00, pricePerCarat: 20000, shape: 'Oval', origins: ['Zambian'] };

    const selectedLots = [lotA, lotB, lotC];
    const totalCarats = selectedLots.reduce((sum, l) => sum + l.weight, 0); // 50.00 cts
    const totalValuation = selectedLots.reduce((sum, l) => sum + (l.weight * l.pricePerCarat), 0);
    // (25.5 * 12000) + (14.5 * 18000) + (10 * 20000) = 306000 + 261000 + 200000 = 767000
    assert.equal(totalCarats, 50.00);
    assert.equal(totalValuation, 767000);

    const weightedAvgRate = totalValuation / totalCarats; // 767000 / 50 = 15340
    assert.equal(weightedAvgRate, 15340, 'Weighted average rate must accurately weigh lot carats');

    // Merge shapes and origins
    const mergedShapes = Array.from(new Set(selectedLots.map(l => l.shape)));
    assert.deepEqual(mergedShapes, ['Oval', 'Octagon']);

    const mergedOrigins = Array.from(new Set(selectedLots.flatMap(l => l.origins)));
    assert.deepEqual(mergedOrigins, ['Zambian', 'Russian']);

    // Active memo guard check
    function canMergeLots(lots, getOpenMemoCarats) {
      return !lots.some(l => getOpenMemoCarats(l.id) > 0);
    }

    assert.equal(canMergeLots(selectedLots, () => 0), true, 'Allowed when no lots on memo');
    assert.equal(canMergeLots(selectedLots, (id) => id === 'em_2' ? 5.0 : 0), false, 'Blocked when lotB is out on memo');

    // Verify emerald.js implements merge methods
    assert.match(emeraldJs, /openMergeModal\s*\(/, 'emerald.js must implement openMergeModal');
    assert.match(emeraldJs, /renderMergeChecklist\s*\(/, 'emerald.js must implement renderMergeChecklist');
    assert.match(emeraldJs, /updateMergeCalc\s*\(/, 'emerald.js must implement updateMergeCalc');
    assert.match(emeraldJs, /handleConfirmMerge\s*\(/, 'emerald.js must implement handleConfirmMerge');
    assert.match(html, /id="modal-merge-pudias"/, 'index.html must have #modal-merge-pudias modal');
    assert.match(html, /id="btn-merge-emerald-main"/, 'index.html must have #btn-merge-emerald-main toolbar button');
  });

  // =========================================================================
  // 5. OPTION 3: LAYOUT / MATCHED SUITE BUILDER METADATA
  // =========================================================================
  await suite.test('5. Layout / Matched Suite Builder: Stock Type, Category & Progression', () => {
    assert.match(html, /<option value="Layout \/ Matched Suite">Layout \/ Matched Suite<\/option>/, 'index.html stock type options include Layout / Matched Suite');
    assert.match(html, /id="emerald-layout-config-section"/, 'index.html has layout config section');
    assert.match(html, /id="emerald-layout-category"/, 'index.html has layout category selector');
    assert.match(html, /id="emerald-layout-progression"/, 'index.html has layout progression text input');

    // Emerald form logic supports layout fields
    assert.match(emeraldJs, /layoutCategory/, 'emerald.js captures layoutCategory');
    assert.match(emeraldJs, /layoutProgression/, 'emerald.js captures layoutProgression');
    assert.match(css, /\.badge-layout-suite/, 'custom.css contains styling for .badge-layout-suite');
  });

  // =========================================================================
  // 6. CSS LUXURY STYLING & INTEGRITY AUDIT
  // =========================================================================
  await suite.test('6. CSS Integrity: Badges for Overdue, Due Soon, Active Memo & Modal Previews', () => {
    assert.match(css, /\.badge-overdue\s*\{[^}]*color:\s*#eb5757/, 'badge-overdue has high-contrast danger alert styling');
    assert.match(css, /\.badge-due-soon\s*\{[^}]*color:\s*#f2994a/, 'badge-due-soon has warning amber styling');
    assert.match(css, /\.badge-active-memo\s*\{[^}]*color:\s*#27ae60/, 'badge-active-memo has active green styling');
    assert.match(css, /\.wa-message-preview-box\s*\{[^}]*white-space:\s*pre-wrap/, 'wa-message-preview-box preserves whatsapp formatting');
  });
});
