const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');

test('Showroom Mode & Client Privacy UI Tests', async (t) => {
  const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
  const cssContent = fs.readFileSync(customCssPath, 'utf8');

  await t.test('Index HTML contains showroom indicator bar', () => {
    assert.match(htmlContent, /id="showroom-indicator-bar"/);
  });

  await t.test('Does NOT display "Confidential Trade Data" to clients', () => {
    assert.doesNotMatch(htmlContent, /Confidential Trade Data/i, 'The showroom banner must never advertise that confidential trade data is being hidden');
    assert.match(htmlContent, /<span>Showroom Mode<\/span>/, 'Indicator must display clean "Showroom Mode" text');
  });

  await t.test('Showroom indicator bar has iOS safe-area top padding', () => {
    assert.match(
      cssContent,
      /\.showroom-indicator-bar[\s\S]*?env\(safe-area-inset-top[\s\S]*?\)/,
      'Indicator bar must account for notch / Dynamic Island safe-area-inset-top'
    );
  });

  await t.test('Showroom indicator bar has flex-shrink: 0 and high z-index', () => {
    assert.match(
      cssContent,
      /\.showroom-indicator-bar[\s\S]*?flex-shrink:\s*0/,
      'Indicator bar must have flex-shrink: 0 so it never collapses'
    );
    assert.match(
      cssContent,
      /\.showroom-indicator-bar[\s\S]*?z-index:\s*(10[1-9]|1[1-9]\d|[2-9]\d{2,})/,
      'Indicator bar must have high z-index (>= 101) to stay above headers'
    );
  });

  await t.test('Prevents double-padding on app-header in showroom mode on mobile', () => {
    assert.match(
      cssContent,
      /body\.showroom-client-mode\s+\.app-header[\s\S]*?padding-top:\s*8px\s*!important/,
      'Mobile app header should not double-pad safe-area when showroom bar is visible'
    );
  });

  await t.test('Hides sensitive cost, margin, and broker data when in client mode', () => {
    const sensitiveSelectors = [
      'body.showroom-client-mode .cost-price-data',
      'body.showroom-client-mode .margin-data',
      'body.showroom-client-mode .broker-comm-data',
      'body.showroom-client-mode [data-client-hide]'
    ];

    for (const selector of sensitiveSelectors) {
      assert.ok(
        cssContent.includes(selector),
        `CSS must include rule hiding sensitive selector: ${selector}`
      );
    }
  });
});
