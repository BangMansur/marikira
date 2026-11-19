# MariKira 🪙

> "Know where every ringgit goes in under 5 seconds a day."

MariKira ("let's count") is an offline-first personal finance and expense tracker for everyday Malaysians. It's built with React Native, Expo SDK 58, TypeScript in strict mode, and SQLite encrypted with SQLCipher.

**Status: Phase 1 (MVP).** It covers accounts, categories, transactions (in, out, transfer, refund), the home dashboard with safe-to-spend, a monthly report and app lock.

---

## Quick start

```bash
npm install
npm test            # 179 unit, SQL and screen tests (~6 s)
npm run typecheck
npm run lint
```

### Run on a device or emulator

The local database is encrypted with **SQLCipher**, which is a native build option. Because of that the app **cannot run in Expo Go**. Use a development build instead:

```bash
npx expo run:android     # needs Android Studio / SDK
npx expo run:ios         # needs Xcode (macOS)
```

Or build in the cloud with EAS, with no local toolchain needed:

```bash
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

On first launch, choose **"Just exploring? Try with demo data"** to load about 3 months of realistic Malaysian transactions. You can also load them later from **Settings → Your data**.

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

### E2E (Detox)

`e2e/firstRun.e2e.ts` covers this flow: onboarding, then a calculator quick-add, then a transfer (which must not change Money OUT), then delete and undo. To run it:

1. `npx expo prebuild` (generates `android/` and `ios/`).
2. Add Detox's native test runner. The community plugin `@config-plugins/detox` currently declares support only up to Expo SDK 53. Either use it with `--legacy-peer-deps`, or follow Detox's manual Android setup (`DetoxTest.java` plus the `androidTestImplementation` dependency).
3. Build and run the tests:
   ```bash
   npm run e2e:build:android
   npm run e2e:test:android
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

- **On-device verification:** this build was verified with typecheck, lint, 179 Jest tests (including screen tests that drive the real UI against a real SQLite DB) and a production Android Metro/Hermes bundle. It has **not yet been run on a physical device or emulator**, and the Detox E2E suite has not been executed. Both need a machine with an Android or iOS toolchain.
- **Commitments and savings goals arrive in Phase 2.** Until then, safe-to-spend subtracts 0 commitments and only your savings target. The maths and the "no double counting" rules are already implemented and tested.
- **One currency per user.** The schema already stores `base_amount_minor` and `fx_rate_e8`. Multi-currency is planned for Phase 5.
- **No split editor UI yet** (Phase 2). Split data and reporting work today and are tested.
- **Date picking** uses previous/next-day steppers, not a calendar picker.
- **Calendar heatmap, tags management screen, recurring transactions, export/import and daily reminders** are planned for Phases 2–4.
- **If the database key is lost** (for example after restoring a backup onto a new phone), the data is unreadable. The app then offers to erase and start fresh. Encrypted backup/restore is planned for a later phase.
- **PIN strength:** a 4–6 digit PIN has little entropy. Protection relies on the keystore plus the lockout, not on the KDF alone.
- **Detox's Expo config plugin** lags behind SDK 58 (see the E2E section above).

## Next steps (Phase 2)

Commitments with reminders, budgets with alerts, savings goals (including an Emergency Fund), recurring transactions, the 50/30/20 view, and wiring commitments and goal transfers into safe-to-spend.
