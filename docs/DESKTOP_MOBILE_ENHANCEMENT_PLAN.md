# Mava Gems Stock Management: Desktop & Mobile Enhancement Plan

## Objective
Deliver a unified, high-performance experience optimized for both **Desktop** (macOS/Windows via Tauri) and **Mobile/Tablet** (iOS/iPadOS via Capacitor), addressing back-office data density and showroom client presentation.

---

## 1. Input Ergonomics & Search Sanitization (P0)
- **Problem**: Default virtual keyboards on mobile show QWERTY for numeric inputs; search inputs autocorrect and autocapitalize alphanumeric SKUs (e.g. `RN-` -> `Rn-`).
- **Implementation**:
  - Add `inputmode="decimal"` to all weight, carat, rate, wastage, labor, commission, and price fields.
  - Add `autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="search"` to all search inputs across Catalog, Emeralds, Loose Stones, Memos, Sales, Photos, and Logs.
  - Add `autocapitalize="characters" autocorrect="off" spellcheck="false"` to SKU input fields.

---

## 2. Catalog Chunked Lazy Rendering & Virtualization (P0)
- **Problem**: Rendering 500–1,500+ items directly creates thousands of complex DOM nodes with base64 images in a single loop, causing memory spikes and scroll jank, risking iOS WebKit Jetsam kills.
- **Implementation**:
  - Implement chunked lazy rendering in `renderer/js/catalog.js`:
    - Initial render: 30 items.
    - As the user scrolls near the bottom of `#catalog-grid`, smoothly append the next chunk of 30 items using an `IntersectionObserver` or scroll threshold.
    - Drastically improves initial render time (<16ms) and preserves flat memory usage.

---

## 3. Desktop Global Command Palette (`Cmd+K`) & Power Hotkeys (P1)
- **Problem**: Desktop power users have to click around with the mouse for common actions (changing gold rates, switching suites, adding items, toggling showroom mode).
- **Implementation**:
  - Add `#modal-command-palette` with a sleek backdrop and search input.
  - Global shortcut `Cmd+K` / `Ctrl+K` to toggle.
  - Quick actions in Palette:
    - Jump to suite / tab (Jewelry, Emeralds, Stones, Memos, Sales, Analysis).
    - Set 24KT Gold Rate, USD Rate.
    - New Piece (`Cmd+N`), New Memo.
    - Toggle Showroom Mode (`Cmd+Shift+S`).
    - Quick search piece by SKU or Name.
  - Hotkeys:
    - `/` to focus the active tab's search box.
    - `Esc` to close modals, palette, or clear search.
    - `Cmd+1` through `Cmd+5` for primary tabs.

---

## 4. Fullscreen Client Lightbox & Pinch-to-Zoom (P1)
- **Problem**: In Showroom Mode, clients cannot pinch-to-zoom into gemstone facets and jewelry craftsmanship.
- **Implementation**:
  - Create `#modal-image-lightbox` with a luxury dark velvet theme.
  - Support multi-touch pinch-to-zoom and drag/pan on iOS, mouse-wheel zoom and drag on desktop.
  - Floating client-safe pill: displays Piece Name, SKU, Karat, Gross/Net Weight, Diamond Carats, and Retail Price only (zero cost or margin data).
  - WhatsApp / Native Share button via `@capacitor/share`.

---

## 5. Native Camera Capture Integration (P1)
- **Problem**: Image upload currently opens the standard file browser rather than the native iOS camera.
- **Implementation**:
  - Add "Take Photo" button (`#btn-camera-capture`) in the image uploader.
  - If running in Capacitor native iOS, call `@capacitor/camera` with square framing.
  - If running on desktop / web, fallback gracefully to file input or web camera.
  - Auto-compress captured photos to prevent database bloat.

---

## 6. Native iOS Sheet Swipe-Down to Dismiss (P2)
- **Problem**: Slide-up sheets on mobile look native but lack drag-down to dismiss.
- **Implementation**:
  - Touch event listeners on modal grab handle (`.modal-card::before`): downward swipe > 80px triggers modal dismiss with haptic confirmation.

---

## 7. Automated Test Suite & Verification
- Dedicated test suite `tests/desktop-mobile-enhancements.test.js` verifying:
  - Input attributes (`inputmode="decimal"`, `autocapitalize="none"`, `autocorrect="off"`).
  - Chunked lazy rendering logic.
  - Command palette DOM structure and hotkey bindings.
  - Lightbox privacy boundaries (no cost data exposed).
- Full `npm test` execution.

---

## 8. Version Bump & Native iOS Sync
- Bump version from `14.0.22` to `14.0.23` in `package.json`.
- Run `node scripts/sync-version.js` and `npm run ios:sync`.
