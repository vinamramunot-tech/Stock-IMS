const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const infoPlistPath = path.resolve(__dirname, '../ios/App/App/Info.plist');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const styleCssPath = path.resolve(__dirname, '../renderer/css/style.css');
const appJsPath = path.resolve(__dirname, '../renderer/js/app.js');

test('Landscape Orientation & Safe Area Insets Integrity Tests', async (t) => {
  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  await t.test('1. Native iOS Info.plist supports landscape orientations', () => {
    assert.match(
      infoPlist,
      /<key>UISupportedInterfaceOrientations<\/key>[\s\S]*?<string>UIInterfaceOrientationLandscapeLeft<\/string>/,
      'Info.plist must support UIInterfaceOrientationLandscapeLeft'
    );
    assert.match(
      infoPlist,
      /<key>UISupportedInterfaceOrientations<\/key>[\s\S]*?<string>UIInterfaceOrientationLandscapeRight<\/string>/,
      'Info.plist must support UIInterfaceOrientationLandscapeRight'
    );
    assert.match(
      infoPlist,
      /<key>UISupportedInterfaceOrientations~ipad<\/key>[\s\S]*?<string>UIInterfaceOrientationLandscapeLeft<\/string>/,
      'iPad Info.plist must support UIInterfaceOrientationLandscapeLeft'
    );
    assert.match(
      infoPlist,
      /<key>UISupportedInterfaceOrientations~ipad<\/key>[\s\S]*?<string>UIInterfaceOrientationLandscapeRight<\/string>/,
      'iPad Info.plist must support UIInterfaceOrientationLandscapeRight'
    );
  });

  await t.test('2. Safe-area insets left and right are applied to mobile containers and navbars', () => {
    assert.ok(
      customCss.includes('env(safe-area-inset-left') && customCss.includes('env(safe-area-inset-right'),
      'custom.css must include env(safe-area-inset-left) and env(safe-area-inset-right)'
    );
    assert.ok(
      styleCss.includes('env(safe-area-inset-left') && styleCss.includes('env(safe-area-inset-right'),
      'style.css must include env(safe-area-inset-left) and env(safe-area-inset-right)'
    );
    assert.match(
      styleCss,
      /\.app-header\s*\{[^}]*env\(safe-area-inset-(left|right)/s,
      'App header must account for landscape safe area insets'
    );
    assert.match(
      styleCss,
      /\.workspace-main\s*\{[^}]*env\(safe-area-inset-(left|right)/s,
      'Workspace main container must account for landscape safe area insets'
    );
    assert.match(
      styleCss,
      /\.startup-card\s*\{[^}]*env\(safe-area-inset-(left|right)/s,
      'Startup card must account for landscape safe area insets'
    );
  });

  await t.test('3. Dedicated landscape orientation styles are implemented', () => {
    assert.match(
      customCss,
      /@media[^{]*orientation:\s*landscape/,
      'CSS must define dedicated orientation: landscape rules'
    );
    // Header is sleek and single-row
    assert.match(
      customCss,
      /@media[^{]*orientation:\s*landscape[\s\S]*?\.app-header\s*\{[^}]*flex-direction:\s*row\s*!important/,
      'Landscape header must arrange items horizontally to conserve vertical space'
    );
    // Bottom nav is slimmed down
    assert.match(
      customCss,
      /@media[^{]*orientation:\s*landscape[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*height:\s*calc\(44px\s*\+\s*env\(safe-area-inset-bottom/s,
      'Landscape bottom nav must use a slim 44px profile'
    );
    // Launcher grid displays side-by-side suites
    assert.match(
      customCss,
      /@media[^{]*orientation:\s*landscape[\s\S]*?\.launcher-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)\s*!important/s,
      'Landscape startup screen must display 3 suites side-by-side'
    );
  });

  await t.test('4. JavaScript initializes orientation detection and listeners', () => {
    assert.ok(
      appJs.includes('initOrientationHandler'),
      'App must declare initOrientationHandler'
    );
    assert.ok(
      appJs.includes('orientationchange') && appJs.includes('orientation-landscape'),
      'App must listen for orientationchange and toggle orientation-landscape'
    );
  });
});
