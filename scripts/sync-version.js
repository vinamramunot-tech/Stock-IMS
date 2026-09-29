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

// 3. Clean previous iOS build output to prevent "Directory not empty" rename error
const iosBuildDir = path.join(__dirname, '../src-tauri/gen/apple/build');
if (fs.existsSync(iosBuildDir)) {
  try {
    fs.rmSync(path.join(iosBuildDir, 'arm64-sim'), { recursive: true, force: true });
    fs.rmSync(path.join(iosBuildDir, 'mava-gems-stock_iOS.xcarchive'), { recursive: true, force: true });
  } catch (e) {}
}

console.log('Version sync completed!');
