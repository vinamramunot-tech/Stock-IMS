# Mandatory Testing & Release Workflow Rule

## 1. Automated Testing Requirement
- Before pushing any changes to TestFlight or executing release builds (`npm run ios:archive`, `npm run ios:build`, `npm run release`), **all unit and integrity tests MUST run and pass cleanly with 0 failures** (`npm test`).
- Whenever a bug is fixed, a calculation is adjusted, or a UI feature is added/simplified, corresponding unit tests MUST be added or updated in `tests/`.
- Tests must continue to run with zero extra dependencies using Node's built-in test runner (`node:test` and `node:assert`).

## 2. Continuous Test Evolution & Edge-Case Coverage
Every update should innovate and expand test coverage:
- **Math & Valuations**: Karat factors, stone-to-metal deductions, multiplier discounts, currency conversions, edge-case weights (0g, micro-weights, NaN, string numbers).
- **Showroom Mode Privacy**: Ensure sensitive trade data (`.cost-price-data`, `.margin-data`, `.broker-comm-data`, `[data-client-hide]`) is strictly hidden and never leaks confidential trade information.
- **UI Integrity & De-duplication**: Ensure no redundant or twin action buttons exist, no duplicate element IDs exist in `index.html`, and CSS/JS parse cleanly.
- **Data Integrity**: Validate JSON memo records, stock transfers, sale ledger entries, and stone weight consistency.

## 3. UI Simplification Standard
- Every UI element should maximize high density and clarity without sacrificing functionality.
- Consolidate multi-button actions into intuitive single toggles.
- Preserve 44px touch targets on mobile while minimizing redundant padding and vertical scroll fatigue.
- Safe-area compliance (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) is mandatory for all top/bottom bars on mobile iOS.
