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

console.log('Version sync completed!');
