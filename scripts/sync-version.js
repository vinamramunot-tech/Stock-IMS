const fs = require('fs');
const path = require('path');

// Read package.json version
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

console.log(`Syncing version ${version} to tauri.conf.json and Cargo.toml...`);

// 1. Sync tauri.conf.json
const tauriConfPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = version;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
}

// 2. Sync Cargo.toml
const cargoPath = path.join(__dirname, '../src-tauri/Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/^version = "[^"]*"/m, `version = "${version}"`);
  fs.writeFileSync(cargoPath, cargoContent);
}

// 3. Sync project.yml
const projectYmlPath = path.join(__dirname, '../src-tauri/gen/apple/project.yml');
if (fs.existsSync(projectYmlPath)) {
  let ymlContent = fs.readFileSync(projectYmlPath, 'utf8');
  ymlContent = ymlContent.replace(/CFBundleShortVersionString: [^\n]+/g, `CFBundleShortVersionString: ${version}`);
  ymlContent = ymlContent.replace(/CFBundleVersion: "[^"]*"/g, `CFBundleVersion: "${version}"`);
  fs.writeFileSync(projectYmlPath, ymlContent);
}

// 4. Sync Info.plist
const infoPlistPath = path.join(__dirname, '../src-tauri/gen/apple/mava-gems-stock_iOS/Info.plist');
if (fs.existsSync(infoPlistPath)) {
  let plistContent = fs.readFileSync(infoPlistPath, 'utf8');
  plistContent = plistContent.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/g, `$1${version}$2`);
  plistContent = plistContent.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/g, `$1${version}$2`);
  fs.writeFileSync(infoPlistPath, plistContent);
}

// 5. Clean previous iOS build output to prevent "Directory not empty" rename error
const iosBuildDir = path.join(__dirname, '../src-tauri/gen/apple/build');
if (fs.existsSync(iosBuildDir)) {
  try {
    fs.rmSync(path.join(iosBuildDir, 'arm64-sim'), { recursive: true, force: true });
    fs.rmSync(path.join(iosBuildDir, 'mava-gems-stock_iOS.xcarchive'), { recursive: true, force: true });
  } catch (e) {}
}

// 6. Sync Capacitor iOS Info.plist
const capPlistPath = path.join(__dirname, '../ios/App/App/Info.plist');
if (fs.existsSync(capPlistPath)) {
  let capPlistContent = fs.readFileSync(capPlistPath, 'utf8');
  capPlistContent = capPlistContent.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/g, `$1${version}$2`);
  capPlistContent = capPlistContent.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/g, `$1${version}$2`);
  fs.writeFileSync(capPlistPath, capPlistContent);
}

// 7. Sync Capacitor project.pbxproj MARKETING_VERSION and CURRENT_PROJECT_VERSION
const pbxPath = path.join(__dirname, '../ios/App/App.xcodeproj/project.pbxproj');
if (fs.existsSync(pbxPath)) {
  let pbxContent = fs.readFileSync(pbxPath, 'utf8');
  pbxContent = pbxContent.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  pbxContent = pbxContent.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${version};`);
  fs.writeFileSync(pbxPath, pbxContent);
}

// 8. Sync index.html app-version-display
const indexPath = path.join(__dirname, '../renderer/index.html');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  indexContent = indexContent.replace(/(id="app-version-display"[^>]*>)[^<]*(<\/span>)/g, `$1${version}$2`);
  fs.writeFileSync(indexPath, indexContent);
}

console.log('Version sync completed!');
