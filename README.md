# Mava Gems - Jewelry Stock Management (Desktop)

A premium, highly secure, and fully self-contained offline-first native desktop application engineered for macOS and Windows to manage jewelry inventory stock, evaluate real-time gold component valuations, track multi-stone gem components, and log precise audit trails.

Designed with a high-contrast **Stark Light Luxury aesthetic** (ivory eggshell palettes, charcoal borders, Playfair Display typography) and **strictly zero curved edges** (`border-radius: 0px` globally) to evoke a premium designer feel.

---

## ✨ Features

### 📂 Dynamic Database Setup & Custom Pathing
- **Startup Onboarding Selection**: On first launch (or if disconnected), the application boots into a luxury onboarding setup dashboard with exactly **two actions**:
  1. **Create New Database**: Prompts a save dialog to select exactly where to initialize a fresh, clean database file (`.db` or `.json`) on your system.
  2. **Open Existing Database**: Prompts a file selector dialog to connect an existing Mava Gems inventory file.
- **Smart Session Persistence**: Once a database is loaded or created, a lightweight configuration file (`app_config.json`) is created locally to remember its path. Subsequent launches bypass the setup screen and boot straight into your inventory catalog in under a second!
- **Database Connection Switcher**: Located in Vault Settings, you can click "Disconnect / Switch Database..." to safely disconnect the active catalog and return to the onboarding setup dashboard to connect or create a different file at any time.

### 💎 Unlimited Multi-Entry Gemstones & Diamonds
- **Multi-Record Buttons**: Elegantly designed click buttons (e.g. `[+ Emerald]`, `[+ Ruby]`, `[+ Diamond]`) under the Stones and Diamonds/Polki tabs.
- **Infinite Combinations**: Add infinite rows of the exact same gemstone or diamond category (e.g. multiple distinct Emerald or Diamond rows with different shapes, weights, and rates!).
- **Dynamic Bidirectional Math**: Each component features high-performance bidirectional calculations (changing Weight and Rate updates the Total, and changing the Total auto-recalculates the Rate per Carat).

### 📷 Client-Side Canvas Image Compression & Base64 Storage
- **Canvas Compression**: Uploaded jewelry photos are automatically down-scaled in-memory via an HTML canvas to a maximum dimension of `400px` (under 30KB) and stored directly inside the database text file as base64 JPEG strings, making database backups completely self-contained.

### 📐 Dynamic Mathematical Valuation Engine
- **Independent Karats**: Break down a jewelry piece into infinite metal parts with different gold karats (24KT, 22KT, 18KT, 14KT, 10KT, etc.) and custom weights.
- **Universal Gold Price Display**: Set your universal 24KT gold price per gram in the header. Valuations across all inventory items are automatically and instantly recalculated.
- **Progressive Slab Commissions**: Evaluates labor and progressive commission slabs (ranging from 10% down to 2% based on total value brackets). Features a manual override toggle.

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
*This downloads the core Node.js frameworks and native Electron wrapper dependencies required to run the desktop application.*

### 3. Run the Application
To launch the desktop application window instantly on your screen, run:
```bash
npm start
```

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
