# Mava Gems - Jewelry Stock Management

A premium, highly secure, and fully self-contained offline-first native desktop application engineered using **Tauri** and **Rust** for macOS and Windows to manage jewelry inventory stock, evaluate real-time gold component valuations, track multi-stone gem components, and log precise audit trails.

Designed with a high-contrast **Stark Light Luxury aesthetic** (ivory eggshell palettes, charcoal borders, Playfair Display typography) and **strictly zero curved edges** (`border-radius: 0px` globally) to evoke a premium designer feel.

---

## ✨ Features

### 📂 Dynamic Database Setup & Custom Pathing
- **Startup Onboarding Selection**: On first launch (or if disconnected), the application boots into a luxury onboarding setup dashboard with exactly **two actions**:
  1. **Create New Database**: Prompts a save dialog to select exactly where to initialize a fresh, clean database file on your system.
  2. **Open Existing Database**: Prompts a file selector dialog to connect an existing Mava Gems inventory file.
- **Smart Session Persistence**: Once a database is loaded or created, a lightweight configuration file (`app_config.json`) is created locally to remember its path. Subsequent launches bypass the setup screen and boot straight into your inventory catalog in under a second!
- **Database Connection Switcher**: Located in Vault Settings, you can click "Disconnect / Switch Database..." to safely disconnect the active catalog and return to the onboarding setup dashboard to connect or create a different file at any time.

### 💎 Unlimited Multi-Entry Gemstones & Diamonds
- **Multi-Record Buttons**: Elegantly designed click buttons (e.g. `[+ Emerald]`, `[+ Ruby]`, `[+ Diamond]`) under the Stones and Diamonds/Polki tabs.
- **Infinite Combinations**: Add infinite rows of the exact same gemstone or diamond category (e.g. multiple distinct Emerald or Diamond rows with different shapes, weights, and rates!).
- **Dynamic Bidirectional Math**: Each gemstone and diamond component features high-performance bidirectional calculations (changing Weight and Rate updates the Total, and changing the Total auto-recalculates the Rate per Carat).

### 📷 Client-Side Canvas Image Compression & Base64 Storage
- **Canvas Compression**: Uploaded jewelry photos are automatically down-scaled in-memory via an HTML canvas to a maximum dimension of `400px` (under 30KB) and stored directly inside the database text file as base64 JPEG strings, making database backups completely self-contained.

---

## 🛠️ Prerequisites

Before compiling or running the project, you need the following developer tools installed on your computer.

### 1. Node.js (LTS Version)
Ensure you have Node.js installed. You can download it from [nodejs.org](https://nodejs.org/).
To verify, run:
```bash
node -v
```

### 2. Platform Dependencies (C/C++ Build Tools)
Tauri compiles to a native desktop application, which requires local C/C++ build tools.

* **macOS**: Install Xcode Command Line Tools by running:
  ```bash
  xcode-select --install
  ```
* **Windows**: Download and install [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/). During installation, make sure to check the **"Desktop development with C++"** workload.

### 3. Rust Toolchain (Compiler & Cargo)
Tauri's core is written in Rust, so you must install the Rust toolchain.

* **macOS and Linux (via rustup)**:
  Run the following command in your terminal:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  ```
  Once installed, you must load Cargo into your current shell path:
  ```bash
  source "$HOME/.cargo/env"
  ```
  *(Optional)* To make Cargo permanently available in all future terminal sessions on macOS, run:
  ```bash
  echo 'source "$HOME/.cargo/env"' >> ~/.zshrc
  ```

* **Windows**:
  Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/) and follow the default prompts. After installation, restart your terminal or computer for changes to take effect.

To verify your Rust installation is successful, run:
```bash
cargo --version
```

---

## 🚀 Running Locally

Follow these quick steps to install and start Mava Gems on your machine:

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/Jewellery-Stock.git
cd Jewellery-Stock
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Run the Development Server
This boots up the hot-reloaded desktop app shell:
```bash
npm run dev
```

---

## 📦 Building Stand-Alone Installers (.app, .dmg & .msi)

To build fully packaged, optimized installer binaries locally on your computer:

```bash
npm run build
```

The completed installer files will be located in:
* **macOS**: `src-tauri/target/release/bundle/macos/`
* **Windows**: `src-tauri/target/release/bundle/msi/`

---

## ⛓️ GitHub Actions Workflow (CI/CD)

The project includes an automated GitHub Actions workflow defined in `.github/workflows/release.yml` that compiles and drafts a release of the application.

- **Supported Platforms**:
  - **Windows**: Compiles native `x86_64` `.msi` and `.exe` installers.
  - **macOS**: Compiles a **Universal macOS application bundle/DMG** supporting both Apple Silicon (`aarch64-apple-darwin`) and Intel (`x86_64-apple-darwin`) Macs.
- **Triggers**:
  - Automatically runs when pushing tags starting with `v*` (e.g. `v1.0.0`).
  - Can be triggered manually from the GitHub Actions tab (where it automatically extracts the fallback version string from `package.json`).

---

## 📄 License & Privacy
- **Privacy**: All stock information and photos are stored entirely locally on your own computer.
- **License**: Designed for private, commercial, and inventory management use.
