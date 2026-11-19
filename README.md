# MariKira 🪙

[![CI](https://github.com/BangMansur/marikira/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BangMansur/marikira/actions/workflows/ci.yml)

> "Know where every ringgit goes in under 5 seconds a day."

MariKira ("let's count") is an offline-first personal finance and expense tracker for everyday Malaysians. It's built with React Native, Expo SDK 58, TypeScript in strict mode, and SQLite encrypted with SQLCipher.

**Status: Phase 1 (MVP).** It covers accounts, categories, transactions (in, out, transfer, refund), the home dashboard with safe-to-spend, a monthly report and app lock.

---

## Quick start

```bash
npm install
npm test            # 239 unit, SQL, screen and Phase 1 validation tests
npm run typecheck
npm run lint
```

### Run on a device or emulator

The local database is encrypted with **SQLCipher**, which is a native build option. Real use needs a development or store build:

```bash
npx expo run:android     # needs Android Studio / SDK
npx expo run:ios         # needs Xcode (macOS)
```

Or build in the cloud with EAS, with no local toolchain needed:

```bash
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

### Expo Go test mode (quick look only)

```bash
npx expo start      # then scan the QR code with Expo Go (SDK 58)
```

When the app detects Expo Go (`Constants.executionEnvironment === 'storeClient'`) it switches to **test mode**:

- Plain expo-sqlite in a separate file (`marikira-expogo-test.db`) with **no encryption**.
- PIN-only app lock (no biometrics). Crash reporting is not loaded.
- Onboarding offers **demo data only**.
- A permanent banner on every screen: **"Test mode: not encrypted, demo data only"**.
- If the database can't be opened, the error screen shows the error message, native error code and stack trace as selectable text, and `console.error`s it to Metro. This happens **only in Expo Go test mode with `__DEV__`**. Dev, preview and production builds show the plain message and log nothing.

Every other environment (`bare` dev builds, `standalone` preview/production builds, or an unknown value) uses SQLCipher. The encrypted path also checks `PRAGMA cipher_version` and **refuses to open** if SQLCipher isn't compiled in, because plain SQLite silently ignores `PRAGMA key`. `src/db/__tests__/encryptionMode.test.ts` proves this, and checks that `app.config.ts` enables SQLCipher for every EAS profile.

On first launch of a real build, choose **"Just exploring? Try with demo data"** to load about 3 months of realistic Malaysian transactions. You can also load them later from **Settings → Your data**.

### Builds

| Profile | Command | Output |
|---|---|---|
| development | `npx eas-cli@latest build --profile development` | Dev client |
| preview | `npx eas-cli@latest build --profile preview --platform android` | Installable APK |
| production | `npx eas-cli@latest build --profile production` | Store build |

### Environment variables

All of these are optional. See `.env.example`.

| Variable | When | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | runtime | Turns on crash reporting. When empty, crash reporting is off. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | build | Uploads source maps to Sentry. |

### Testing

| Layer | Where | Runs |
|---|---|---|
| Unit (money, dates, finance, calculator, PIN) | `src/core/**`, `src/features/security` | `npm test`, CI |
| Repositories on real SQLite | `src/features/__tests__`, `src/db/__tests__` | `npm test`, CI |
| Screen tests | `src/features/__tests__/*.test.tsx` | `npm test`, CI |
| **Phase 1 validation** (full app) | `src/features/__tests__/phase1Validation.test.tsx` | `npm test`, CI |
| Maestro E2E on real builds | `.maestro/` | EAS Workflows, PR label `e2e` |

**Phase 1 validation** renders the whole app through expo-router's in-memory router: root layout, database gate, tabs, modals and real screens. It runs on real SQLite, takes the production (SQLCipher) path, and freezes the date at 19 Nov 2026. Every check reads what the user sees, acts, and asserts the exact change in sen:
- expense, income, RM500 transfer
- refund (and the over-refund limit)
- delete + undo
- last-cycle exclusion
- keypad `12.50+8`
- percentages summing to exactly 100%
- safe-to-spend and "left today" to the sen
- Hide balances on every screen
- every string in Bahasa Melayu
- Delete all data → onboarding

A freshness barrier waits until the screen shows refetched data, so "unchanged" assertions can't pass on stale values. Each check was confirmed to catch a deliberately introduced bug.

**CI:** `.github/workflows/ci.yml` runs typecheck, lint and all Jest tests on every push and pull request to `main`.

### E2E (Maestro on EAS Workflows)

Flows in `.maestro/` run against an `e2e-test` build (unsigned Android APK and iOS simulator build, `withoutCredentials: true`). Each flow starts from a fresh install with demo data and checks exact before/after amounts:

| Flow | Checks |
|---|---|
| `onboarding_demo.yaml` | Demo onboarding lands on a populated Home, Plan and Reports; no test-mode banner |
| `add_expense.yaml` | `12.50+8` shows RM20.50; Money OUT +RM20.50 exactly; Money IN unchanged |
| `transfer.yaml` | RM500 Maybank → Cash: Money IN/OUT unchanged; balances −500 / +500 |
| `delete_undo.yaml` | Delete removes it and restores the totals; Undo brings it back; deleting again returns to baseline |

`.eas/workflows/e2e-tests.yml` builds both platforms and runs the flows when a pull request into `main` gets the **`e2e`** label. One-time setup: `npx eas-cli@latest init` (links the EAS project), then connect the GitHub repo under the project's settings on expo.dev.

```bash
npm run e2e:workflow          # run the workflow on demand
npm run e2e:build:android     # or build locally and run: maestro test .maestro/
```

---

## Architecture

```
src/
├── app/                 expo-router routes, thin: each file re-exports a feature screen
├── core/                pure TypeScript with no React or native imports (enforced by ESLint)
│   ├── money/           integer minor units, parse/format, banker's rounding, FX (BigInt)
│   ├── dates/           LocalDate ('YYYY-MM-DD') arithmetic, pay cycles
│   ├── finance/         safeToSpend, savings rate, commitment ratio, emergency fund,
│   │                    budget utilisation, goal contribution
│   ├── calculator/      keypad expression engine ("12.50+8"), exact rationals, no eval
│   └── id.ts            UUID v7
├── db/
│   ├── adapter.ts       SqlDb interface
│   ├── expoDb.ts        expo-sqlite + SQLCipher, key in the OS keystore, serialised writes
│   ├── testDb.ts        better-sqlite3 implementation for Jest (same SQL)
│   ├── migrations/      append-only, tracked with PRAGMA user_version
│   ├── helpers.ts       insert/update/soft-delete with sync_version + sync_log
│   └── seed/            bootstrap (user + default categories), 3-month demo data
├── features/            one folder per feature: repo (SQL) · hooks (React Query) · screens
│   ├── accounts/  categories/  transactions/  reports/  dashboard/
│   ├── onboarding/  plan/  settings/  security/
├── presets/             locale presets (MY: PTPTN, EPF, ASB, Tabung Haji, SOCSO, LHDN codes)
├── i18n/                en.json and ms.json (key parity enforced by a test)
├── ui/                  design system: theme tokens, Text, Amount, Keypad, charts, …
├── stores/              Zustand: session/lock state, snackbar
└── test/                screen-test harness (real DB + React Query + i18n)
```

### Key decisions

- **Money is always an integer count of minor units (sen).** Parsing is pure string arithmetic. Every division (per-day amounts, FX, percentages) goes through BigInt with banker's rounding. Percentages are basis points (1% = 100).
- **SQLite is the single source of truth.** React Query reads through repositories. Every write calls `invalidateQueries()`, so deleting a transaction updates balances, the dashboard and reports immediately.
- **Account balances are computed, never stored:** the opening balance plus the effect of every live transaction. They can't drift. A manual correction is an `adjustment` transaction, which also serves as the audit log.
- **Every repository query runs against a real SQLite engine in tests** (better-sqlite3 behind the same `SqlDb` interface), not against mocks.
- **Pay cycle:** pay day 25 means cycles run from the 25th to the 24th. Pay days 29–31 are clamped to the last day of shorter months (leap years tested).
- **Charts** are lightweight in-house SVG charts (donut and bars) using the Okabe–Ito colour-blind-safe palette. Every chart also has a text legend with percentages and screen-reader labels.

### Financial rules (all unit-tested)

| Rule | Where |
|---|---|
| Money IN = income. Money OUT = expenses − refunds. Transfers and adjustments are excluded from both. | `reports.repo.ts` |
| A refund reduces its original category, isn't income, and can't exceed the original. | `transactions.repo.ts` |
| A credit card purchase is an expense. Paying the card is a transfer. | ledger tests |
| A split transaction reports each part under its own category, and the parts must add up to the total. | `rules.ts`, `reports.repo.ts` |
| Safe to spend today = (income − commitments − savings reserved − spent before today) ÷ days left including today | `core/finance/safeToSpend.ts` |
| Commitment-linked transactions are excluded from "spent", so commitments are never counted twice. | `discretionarySpend` |
| Transfers into savings goals count toward the savings target (reserved = max(target, saved)). | `safeToSpend` |
| A negative safe-to-spend shows RM0 plus "Over by RM x this cycle". "Left today" = safe − spent today. | `safeToSpend`, `HomeScreen` |

**Acceptance checks covered by tests:**
- RM4,000 income, RM1,500 commitments, RM400 savings and RM900 spent on days 1–10 gives **RM60.00/day**.
- A RM500 Bank → e-wallet transfer leaves Money OUT unchanged. This is checked at the SQL level and by driving the real Add screen.
- Deleting a transaction updates balances, the dashboard and reports instantly, and undo restores them.
- The dashboard, cycle report, balances and search together take under 1 s over 10,000 transactions (Node/SQLite benchmark in the tests).

### Security and privacy

- **Database encryption:** SQLCipher with a random 256-bit key held in the Keychain/Keystore (`*_THIS_DEVICE_ONLY`). Android `allowBackup` is off.
- **App lock:**
  - 4–6 digit PIN, hashed with PBKDF2-SHA256 and a random salt, and stored in the keystore.
  - Lockout after 5 wrong tries (30 s, doubling, capped at 1 h).
  - Optional biometrics and a configurable auto-lock timeout.
  - App content is covered while the app is in the switcher.
- **Hide balances** masks every amount as `RM••••`.
- **Crash reports:**
  - Sentry is off unless a DSN is set.
  - No PII is sent.
  - Console and UI breadcrumbs are dropped.
  - Money-like numbers are redacted before sending.
- **No financial data in logs:** `no-console` is enforced by ESLint.
- **PDPA/GDPR:** "Delete all my data" erases the database file, the key and the PIN.

---

## Known limitations (Phase 1)

- **Expo Go SDK match:** the project is on Expo SDK 58 (`expo@58.0.26`, the latest on npm) and every native dependency matches SDK 58's bundled versions. I could not confirm the exact SDK of the Expo Go app currently on the iOS App Store from the build environment. Check that Expo Go → Settings shows SDK 58 support.
- **On-device verification:** this build was verified with typecheck, lint, 239 Jest tests (including the full-app Phase 1 validation suite on a real SQLite DB) and production Android and iOS Metro/Hermes bundles. The Maestro flows have not been run yet: they need the EAS project linked (`eas init`) and the GitHub integration connected.
- **Commitments and savings goals arrive in Phase 2.** Until then, safe-to-spend subtracts 0 commitments and only your savings target. The maths and the "no double counting" rules are already implemented and tested.
- **One currency per user.** The schema already stores `base_amount_minor` and `fx_rate_e8`. Multi-currency is planned for Phase 5.
- **No split editor UI yet** (Phase 2). Split data and reporting work today and are tested.
- **Date picking** uses previous/next-day steppers, not a calendar picker.
- **Calendar heatmap, tags management screen, recurring transactions, export/import and daily reminders** are planned for Phases 2–4.
- **If the database key is lost** (for example after restoring a backup onto a new phone), the data is unreadable. The app then offers to erase and start fresh. Encrypted backup/restore is planned for a later phase.
- **PIN strength:** a 4–6 digit PIN has little entropy. Protection relies on the keystore plus the lockout, not on the KDF alone.

## Next steps (Phase 2)

Commitments with reminders, budgets with alerts, savings goals (including an Emergency Fund), recurring transactions, the 50/30/20 view, and wiring commitments and goal transfers into safe-to-spend.
