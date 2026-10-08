const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const infoPlistPath = path.resolve(__dirname, '../ios/App/App/Info.plist');
const appDelegatePath = path.resolve(__dirname, '../ios/App/App/AppDelegate.swift');
const sceneDelegatePath = path.resolve(__dirname, '../ios/App/App/SceneDelegate.swift');
const mainStoryboardPath = path.resolve(__dirname, '../ios/App/App/Base.lproj/Main.storyboard');
const indexHtmlPath = path.resolve(__dirname, '../renderer/index.html');
const customCssPath = path.resolve(__dirname, '../renderer/css/custom.css');
const biometricAuthJsPath = path.resolve(__dirname, '../renderer/js/biometric-auth.js');
const appJsPath = path.resolve(__dirname, '../renderer/js/app.js');

test('Face ID Biometric Security & Landscape Orientation Integrity Tests', async (suite) => {
  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
  const appDelegate = fs.readFileSync(appDelegatePath, 'utf8');
  const sceneDelegate = fs.readFileSync(sceneDelegatePath, 'utf8');
  const mainStoryboard = fs.readFileSync(mainStoryboardPath, 'utf8');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  const biometricJs = fs.readFileSync(biometricAuthJsPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // =========================================================================
  // 1. NATIVE IOS FACE ID SECURITY PROTOCOLS & CONFIGURATION
  // =========================================================================
  await suite.test('1. Native iOS Info.plist has NSFaceIDUsageDescription', () => {
    assert.match(
      infoPlist,
      /<key>NSFaceIDUsageDescription<\/key>\s*<string>[^<]+<\/string>/,
      'Info.plist must define NSFaceIDUsageDescription to comply with Apple security guidelines'
    );
  });

  await suite.test('2. Native AppDelegate.swift implements LocalAuthentication & BiometricAuthPlugin', () => {
    assert.match(appDelegate, /import\s+LocalAuthentication/, 'AppDelegate.swift must import LocalAuthentication framework');
    assert.match(appDelegate, /@objc\(BiometricAuthPlugin\)/, 'AppDelegate.swift must declare @objc(BiometricAuthPlugin)');
    assert.match(appDelegate, /public\s+class\s+BiometricAuthPlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/, 'BiometricAuthPlugin must conform to CAPPlugin and CAPBridgedPlugin');
    assert.match(appDelegate, /@objc\s+public\s+func\s+checkBiometry/, 'BiometricAuthPlugin must implement public checkBiometry');
    assert.match(appDelegate, /@objc\s+public\s+func\s+authenticate/, 'BiometricAuthPlugin must implement public authenticate');
    assert.match(appDelegate, /\.deviceOwnerAuthentication/, 'BiometricAuthPlugin must support device passcode fallback');
    assert.match(appDelegate, /class\s+ViewController:\s*CAPBridgeViewController/, 'ViewController must subclass CAPBridgeViewController to register plugins');
    assert.match(appDelegate, /registerPluginInstance\(BiometricAuthPlugin\(\)\)/, 'ViewController must register BiometricAuthPlugin on bridge');
    assert.match(mainStoryboard, /customClass="ViewController"/, 'Main.storyboard must use ViewController customClass');
  });

  await suite.test('3. App Switcher privacy shield curtain hides sensitive data on backgrounding', () => {
    assert.match(appDelegate, /showPrivacyProtectionCurtain\(\)/, 'AppDelegate must implement showPrivacyProtectionCurtain()');
    assert.match(appDelegate, /applicationWillResignActive/, 'AppDelegate must trigger privacy curtain when resigning active');
    assert.match(appDelegate, /applicationDidEnterBackground/, 'AppDelegate must trigger privacy curtain when entering background');
    assert.match(sceneDelegate, /sceneWillResignActive/, 'SceneDelegate must trigger privacy curtain when scene resigns active');
    assert.match(sceneDelegate, /sceneDidEnterBackground/, 'SceneDelegate must trigger privacy curtain when scene enters background');
  });

  // =========================================================================
  // 2. FRONTEND LOCK SCREEN, ONBOARDING MODAL & SETTINGS UI
  // =========================================================================
  await suite.test('4. Early FOUC lock prevention and lock screen overlay in DOM', () => {
    assert.match(
      indexHtml,
      /localStorage\.getItem\(['"]face_id_enabled['"]\)\s*===\s*['"]true['"][\s\S]*?classList\.add\(['"]vault-locked['"]\)/,
      'Early head script must add vault-locked class immediately to prevent sensitive data flash'
    );
    assert.match(indexHtml, /id="biometric-lock-screen"/, 'index.html must have #biometric-lock-screen overlay');
    assert.doesNotMatch(indexHtml, /id="btn-biometric-unlock"/, 'Lock screen has zero buttons for automatic seamless Face ID');
    assert.match(indexHtml, /id="biometric-lock-status"/, 'index.html must have #biometric-lock-status label');
    assert.match(indexHtml, /<script\s+src="js\/biometric-auth\.js"><\/script>/, 'index.html must load biometric-auth.js');
  });

  await suite.test('5. One-time Face ID Onboarding Modal for new installs and older version upgrades', () => {
    assert.match(indexHtml, /id="modal-face-id-onboarding"/, 'index.html must have #modal-face-id-onboarding modal');
    assert.match(indexHtml, /id="btn-face-id-onboarding-enable"/, 'Onboarding modal must have #btn-face-id-onboarding-enable');
    assert.match(indexHtml, /id="btn-face-id-onboarding-skip"/, 'Onboarding modal must have #btn-face-id-onboarding-skip');
  });

  await suite.test('6. Settings UI has Face ID toggle and status indicator', () => {
    assert.match(indexHtml, /id="settings-card-biometrics"/, 'Settings must have biometric settings card');
    assert.match(indexHtml, /id="toggle-face-id-lock"/, 'Settings must have #toggle-face-id-lock checkbox');
    assert.match(indexHtml, /id="face-id-badge-status"/, 'Settings must have #face-id-badge-status badge');
    assert.match(indexHtml, /id="btn-test-biometric-auth"/, 'Settings must have #btn-test-biometric-auth test button');
  });

  // =========================================================================
  // 3. JAVASCRIPT BIOMETRIC LOGIC & VERIFICATION PROTOCOLS
  // =========================================================================
  await suite.test('7. BiometricAuth module enforces native bridge and once-only onboarding protocols', () => {
    assert.match(biometricJs, /isFaceIdEnabled\(\)/, 'BiometricAuth must implement isFaceIdEnabled()');
    assert.match(biometricJs, /setFaceIdEnabled\(/, 'BiometricAuth must implement setFaceIdEnabled()');
    assert.match(biometricJs, /isFaceIdPrompted\(\)/, 'BiometricAuth must implement isFaceIdPrompted()');
    assert.match(biometricJs, /setFaceIdPrompted\(/, 'BiometricAuth must implement setFaceIdPrompted()');
    assert.match(biometricJs, /checkAndShowOnboardingPrompt\(\)/, 'BiometricAuth must implement checkAndShowOnboardingPrompt()');
    assert.match(biometricJs, /handleToggleChange\(/, 'BiometricAuth must implement handleToggleChange()');
    assert.match(biometricJs, /promptOnLaunch\(\)/, 'BiometricAuth must implement promptOnLaunch()');
    assert.match(biometricJs, /initLifecycleListener\(\)/, 'BiometricAuth must listen for background/resume events');
    assert.doesNotMatch(biometricJs, /Face ID Security Simulation/i, 'No fake simulated alert prompts allowed in biometric module');
    assert.match(appJs, /BiometricAuth\.init\(\)/, 'app.js must initialize BiometricAuth in App.init()');
  });

  // =========================================================================
  // 4. LANDSCAPE MODE UI INTEGRITY & COMPACT LAYOUTS
  // =========================================================================
  await suite.test('8. Landscape CSS compacts modals, command palette, and tables', () => {
    assert.match(customCss, /\.command-palette-results\s*\{[^}]*max-height:\s*160px\s*!important/, 'Command palette results must be compact in landscape (max-height <= 160px)');
    assert.match(customCss, /\.wa-message-preview-box\s*\{[^}]*max-height:\s*100px\s*!important/, 'WhatsApp preview box must be compact in landscape (max-height <= 100px)');
    assert.match(customCss, /#merge-pudias-checklist-container\s*\{[^}]*max-height:\s*110px\s*!important/, 'Merge checklist must be compact in landscape (max-height <= 110px)');
    assert.match(customCss, /\.logs-table\s+th,\s*\.logs-table\s+td\s*\{[^}]*padding:\s*7px\s+10px\s*!important/, 'Data tables must use dense padding in landscape to prevent vertical overflow');
    assert.match(customCss, /\.biometric-lock-card\s*\{[^}]*max-width:\s*480px\s*!important/, 'Biometric lock screen card must adapt cleanly in landscape');
    assert.match(customCss, /html\.vault-locked\s*\{[^}]*overflow:\s*hidden\s*!important/, 'vault-locked state must suppress background scrolling');
    assert.match(customCss, /\.switch\s*\{[^}]*position:\s*relative/, 'custom.css must style .switch toggle button');
  });
});
