const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererDir = path.resolve(__dirname, '../renderer');
const indexHtmlPath = path.join(rendererDir, 'index.html');

test('UI & Application Integrity Tests', async (t) => {
  await t.test('Index HTML has no duplicate element IDs', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const idRegex = /id=["']([a-zA-Z0-9\-_]+)["']/g;
    const ids = new Map();
    const duplicates = [];

    let match;
    while ((match = idRegex.exec(html)) !== null) {
      const id = match[1];
      const count = ids.get(id) || 0;
      if (count === 1) {
        duplicates.push(id);
      }
      ids.set(id, count + 1);
    }

    assert.equal(
      duplicates.length,
      0,
      `Found duplicate element IDs in index.html which cause DOM lookup collisions: ${duplicates.join(', ')}`
    );
  });

  await t.test('Core application JavaScript files parse cleanly without syntax errors', () => {
    const coreScripts = [
      'js/calc.js',
      'js/catalog.js',
      'js/emerald.js',
      'js/stone.js',
      'js/ui.js',
      'js/startup.js'
    ];

    for (const scriptRel of coreScripts) {
      const fullPath = path.join(rendererDir, scriptRel);
      const code = fs.readFileSync(fullPath, 'utf8');
      assert.doesNotThrow(() => {
        new vm.Script(code, { filename: scriptRel });
      }, `Syntax error detected in ${scriptRel}`);
    }
  });

  await t.test('CSS files have balanced curly braces', () => {
    const cssFiles = ['css/custom.css', 'css/app.css'];
    for (const file of cssFiles) {
      const fullPath = path.join(rendererDir, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Strip string literals and comments
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/"[^"]*"/g, '')
          .replace(/'[^']*'/g, '');
        const openCount = (stripped.match(/\{/g) || []).length;
        const closeCount = (stripped.match(/\}/g) || []).length;
        assert.equal(
          openCount,
          closeCount,
          `Mismatched curly braces in ${file}: ${openCount} open vs ${closeCount} close`
        );
      }
    }
  });
});
