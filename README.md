# Mava Gems - Jewelry Stock Management (Desktop)

A premium, highly secure, and fully self-contained offline-first native desktop application engineered for macOS and Windows to manage jewelry inventory stock, evaluate real-time gold component valuations, track multi-stone gem components, and log precise audit trails.

Designed with a high-contrast **Stark Light Luxury aesthetic** (ivory eggshell palettes, charcoal borders, Playfair Display typography) and **strictly zero curved edges** (`border-radius: 0px` globally) to evoke a premium designer feel.

---

## ✨ Features

### 📦 Self-Contained Portable JSON Database
- **Local Data Portability**: All business data is saved in a human-readable plain-text JSON database file `mava_gems_stock.db` inside the `./DATA/` folder directly under your application's installation path.
- **Privacy First**: Completely offline. No online server databases or external APIs are connected, keeping your private business inventory secure on your local hard drive.
- **Image down-scaling**: Uploaded jewelry photos are automatically compressed in-memory via an HTML canvas to a maximum dimension of `400px` (under 30KB) and stored directly inside the text file as base64 JPEG strings, making backups effortless.

### 📐 Dynamic Mathematical Valuation Engine
- **Independent Karats**: Break down a jewelry piece into infinite metal parts (e.g. main body vs. chain shank) with different gold karats (24KT, 22KT, 18KT, 14KT, 10KT, etc.) and custom weights.
- **Universal Gold Price Display**: Set your universal 24KT gold price per gram in the header. Valuations across all inventory items are automatically and instantly recalculated.
- **Infinite Gemstone & Diamond Rows**: Add infinite components of any stone type (Emerald, Ruby, Sapphire, Diamond, Polki, etc.). Fully supports bidirectional calculations (changing Weight and Rate updates the Total, and changing the Total auto-recalculates the Rate per Carat).
- **Progressive Slab Commissions**: Evaluates labor and progressive commission slabs (ranging from 10% down to 2% based on total value brackets). Features a manual override toggle.

### 📝 Chronological Differential Audit Logs
- Automatically registers and prints an audit trail when items are added, deleted, or gold rates are updated.
- Updates to existing stock trigger a comparative differential comparator, displaying a precise **Old Value → New Value** visual difference grid in the activity logs.

---

## 🛠️ Prerequisites

Before installing the application, ensure you have **Node.js** installed on your system:
- Download and install Node.js (LTS Version recommended) from [nodejs.org](https://nodejs.org/).
- Running `node -v` and `npm -v` in your command line should output version numbers.

---

## 🚀 Installation & Running Locally

Follow these quick steps to install and start Mava Gems on your machine:

### 1. Download or Clone the Repository
Clone the repository from GitHub or download the source code zip folder and extract it to your system:
```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/mava-gems-stock.git
```

### 2. Install Dependencies
Open your system terminal (Terminal on macOS, Command Prompt/PowerShell on Windows), navigate into your project folder, and run:
```bash
cd "Jewellery Stock"
npm install
```
*This downloads the core Node.js frameworks and native Chromium wrapper dependencies (Electron) required to run the desktop application.*

### 3. Run the Application
To launch the desktop application window instantly on your screen, run:
```bash
npm start
```
*On launch, a brand new blank database will automatically be initialized inside `Jewellery Stock/DATA/mava_gems_stock.db`.*

---

## 📦 Packaging Stand-Alone Desktop Applications (.app & .exe)

To compile the application into a single double-clickable executable file that runs independently without running commands or opening the terminal:

We can use `electron-packager` (a lightweight, zero-configuration packaging tool) to build it instantly:

### For macOS (.app)
Run this command from your terminal to compile a native Mac application:
```bash
npx electron-packager . "Mava Gems" --platform=darwin --arch=x64 --out=dist --overwrite
```
*(For modern Apple Silicon M1/M2/M3 chips, replace `--arch=x64` with `--arch=arm64`)*

### For Windows (.exe)
Run this command from your terminal to compile a native Windows executable:
```bash
npx electron-packager . "Mava Gems" --platform=win32 --arch=x64 --out=dist --overwrite
```

The completed executable files will be placed inside a newly generated folder named `dist/` in your project folder, ready to be double-clicked and used!

---

## 📄 License & Privacy
- **Privacy**: All stock information and photos are stored entirely locally on your own computer.
- **License**: Designed for private, commercial, and inventory management use.
