# Verilane — Technical Plan

> Stage 5 · Technical Planning · Campfire TASK-5 · 2026-10-30
> Inputs: [`Solution-PRD.md`](Solution-PRD.md) (S8–S14, SR1–SR12, NFR1–NFR8), [`Design.md`](Design.md) (frozen, D1–D6), [`milestones.md`](milestones.md), [`tickets.md`](tickets.md), [`docs/Architecture.md`](docs/Architecture.md), [`docs/Data-Model.md`](docs/Data-Model.md), [`docs/Design-System.md`](docs/Design-System.md), [`docs/AI-Evaluation.md`](docs/AI-Evaluation.md). Tests: [`test-cases.md`](test-cases.md). Decisions: `TP1`–`TP8` in [`decisions.md`](decisions.md).
> **IDs.** Work items are Campfire native IDs from here on (`TASK-6` … `TASK-28`; mapping `TKT-NN → TASK-(NN+5)` frozen in `tickets.md`). Milestones `M-001`…`M-006` = Campfire `m-0`…`m-5`. Tests `TC-001`…`TC-090`. Sub-steps inside a ticket are `TASK-N.k` (plan-local, not Campfire items).
> **Scroll:** native (Design §15 / Design-System §7). No scroll plan needed. Design.md §25/§26/§27 do not exist, so there is no Spatial 3D or product-analytics plan.

---

## Part A · Technical approach

### A1. Architecture (one picture)

```
public/seed/*.csv|json ──fetch──► src/store/loader.ts ──► src/domain/ingest.ts (Zod) ──► Dexie `verilane` v1
                                                                                          │
         src/domain/{extract,classify,match,priority,evidence}  ◄── recompute() ──────────┘
                     │ (pure TS, no React/Next/Dexie/DOM — SR2)
                     ▼
         src/store/hooks.ts (client-only `useLiveQuery`)  ──►  src/app/** routes  ──►  src/components/**
                     ▲
   every write ──► src/domain/commands.ts  (can() → transition → audit) inside ONE Dexie rw transaction (SR7/SR8)

   src/ai/provider.ts  Result<Valid, Rejected>
      ├─ simulated.ts  (default; wraps domain/extract + classify + draft)
      ├─ faulty.ts     (eval only; FS11)
      └─ live.ts       (client stub → /api/llm/* → server-only @anthropic-ai/sdk; 503 unless opted in — S10)
```

- **Rendering:** Next.js App Router. Route `page.tsx` files are thin server components that render a `"use client"` view; all data access happens client-side through `src/store/hooks.ts`. Nothing reads IndexedDB during SSR, so there is no hydration mismatch (TP2). Static build: every route except `/api/llm/*` is static.
- **Trust boundary (S14):** the client is the disclosed boundary. Invariants live in `domain/` and are executed by `commands.ts`; Dexie enforces uniqueness (`&invoice_number`) and atomicity (transaction). README discloses that a determined visitor can edit their own IndexedDB.

### A2. Components and module layout

| Path | Responsibility | Depends on |
|---|---|---|
| `src/domain/schema.ts` | Zod schemas + inferred types for every entity (Data-Model §2–4) | zod |
| `src/domain/money.ts` | `Paise` branded int, `parseInr`, `formatInr` (`en-IN`, `₹`), `sum` | — |
| `src/domain/clock.ts` | `AS_OF_DATE = '2026-10-30'`, `asOf(override?)`, `daysBetween` (UTC dates only) | — |
| `src/domain/ingest.ts` | CSV rows → entities, `null` + `DataIssue`, derived outstanding, conflict detection | schema, money |
| `src/domain/extract.ts` / `classify.ts` | typed tokens, phrase families, signal + token, precedence | schema, money, clock |
| `src/domain/match.ts` | strict matcher (identity AND exact normalised ref) | schema |
| `src/domain/priority.ts` | `priority.v1`: gates G1–G7, score, tie-break, reason string | schema, clock, money |
| `src/domain/evidence.ts` | provenance records per fact | schema |
| `src/domain/draft.ts` / `validate.ts` | template over `VerifiedFact`s, nine checks | schema, money |
| `src/domain/permissions.ts` / `transitions.ts` | S4 matrix; state machines | schema |
| `src/domain/commands.ts` | `run(cmd, ctx)` command spec (pure) + `Tx` port interface | all above |
| `src/domain/aggregates.ts` | Home KPIs and chart buckets | priority |
| `src/ai/*` | provider interface + simulated/faulty/live | domain |
| `src/store/db.ts` | Dexie schema v1, `openDb()` with in-memory fallback (SR9) | dexie |
| `src/store/loader.ts` | seed fetch, version check, first-visit load, `recompute()` | domain, db |
| `src/store/tx.ts` | Dexie implementation of the `Tx` port; `execute(cmd)` | domain/commands, db |
| `src/store/hooks.ts` | `useInvoices`, `useInvoice(id)`, `useAudit`, `useRole`, … (client only) | dexie-react-hooks |
| `src/store/csv.ts` | Papa Parse import/export | papaparse, ingest |
| `src/components/shell/*` | Sidebar, IconRail, TopBar, BottomTabs, RoleSwitcher, ThemeToggle, Banner | shadcn, lucide |
| `src/components/{queue,investigation,disputes,drafts,home,settings,audit,payments}/*` | view components | store/hooks |
| `src/components/states/*` | `Skeleton`, `EmptyState`, `ErrorState` (Design §18) | — |
| `src/app/*` | routes `/`, `/queue`, `/invoices/[id]`, `/disputes`, `/disputes/[id]`, `/payments`, `/drafts`, `/audit`, `/settings`, `/settings/eval`, `/api/llm/{extract,draft}` | components |
| `scripts/seed.ts` | fixed-PRNG generator → `public/seed/*` | domain/schema |
| `scripts/check-bundle-secrets.ts` | NFR8 grep of `.next/static` | — |
| `eval/*` | labels, held-out, draft cases, harness, reports | domain, ai |
| `tests/e2e/*` | Playwright specs | — |

### A3. Data model

As [`docs/Data-Model.md`](docs/Data-Model.md). It is the single source and this plan does not restate it. Implementation specifics:
- **Money** is `number` integer paise, branded `Paise`. Floats are never stored. `parseInr("3.4 lakh") === 34_000_000`.
- **Dates** are ISO `YYYY-MM-DD` strings, compared as UTC day numbers, so there are no timezone bugs.
- **Dexie v1 stores** (Data-Model §6): `customers: 'customer_id'`, `invoices: 'row_id, &invoice_number, customer_id, status'`, `payments: 'payment_id, invoice_id'`, `emails: 'message_id, thread_id'`, `extractions: 'message_id'`, `matches: 'message_id, invoice_id'`, `priorities: 'invoice_id, band'`, `evidence: 'evidence_id, claim_id, source_record_id'`, `dataIssues: '++id, record_id'`, `disputes: 'dispute_id, invoice_id, status'`, `drafts: 'draft_id, invoice_id, status'`, `reviewItems: 'review_id, kind, status'`, `audit: '++event_id, action, subject'`, `meta: 'key'`.
- **Derived tables** (extractions, matches, priorities, evidence, dataIssues) are always recomputed from source plus workflow tables by `recompute()`. They are never edited by commands.

### A4. Data flows

1. **First visit:** `loader.ensureSeeded()` reads `meta.seedVersion`. If it is absent, it fetches `public/seed/manifest.json` and the four files, runs `ingest`, then `bulkPut` and `recompute()` in one transaction, then writes `meta.seedVersion`. If it differs, it shows the "New demo data available — Reset" prompt and never auto-wipes (TC-014).
2. **Recompute:** for each email: `provider.extract` → `validate schema` → `match` → `classify`; workflow `disputes` + extraction signals → `priority.v1` for all invoices → `evidence`. It is pure apart from the final `bulkPut`. Target ≤200 ms for 50+25 (NFR2, TC-084).
3. **Command:** a UI action calls `execute(cmd)`, which opens `db.transaction('rw', …)` and runs `can()`. A denial writes no audit event: the UI already shows the control disabled with a reason, and a forced call throws `PermissionDenied`, which the toast reports (TC-039). Otherwise it runs `transition()`, then the write, then exactly one `audit.add()`, then `recompute()` if needed, and commits. Any throw rolls everything back (TC-038).
4. **Approve:** `approveDraft` re-runs `validate()` inside the same transaction against live data (TC-046), then sets `sent_simulated`. There is no `fetch` (TC-048).
5. **Live mode (local only):** the client calls `POST /api/llm/extract`. The route returns 503 `{error:'live_mode_disabled'}` unless `ANTHROPIC_API_KEY` and `VERILANE_LIVE_LLM=1` are both set. The server uses `client.messages.parse` with `zodOutputFormat(ExtractionSchema)`. A refusal or parse failure returns `{status:'rejected'}`. The client re-validates with Zod before use (TC-074).

### A5. Integrations and dependencies

Runtime: `next`, `react`, `react-dom`, `zod`, `dexie`, `dexie-react-hooks`, `papaparse`, `@tanstack/react-table`, `recharts`, `lucide-react`, shadcn/ui (copied components on Radix), `sonner`, `class-variance-authority`, `tailwind-merge`. Server-only and optional: `@anthropic-ai/sdk`, imported only from `src/app/api/llm/**` and guarded by `import 'server-only'`. Dev: `typescript`, `eslint` + `eslint-config-next`, `vitest`, `@vitest/coverage-v8`, `fake-indexeddb`, `@playwright/test`, `@axe-core/playwright`, `tsx`, `prettier`. **No other external services, no analytics, no fonts CDN.** Pin exact versions at TASK-6.1 (`pnpm add -E`).

### A6. Auth / authz

There is no authentication (S3, a portfolio demo). Authorisation is the S4 **role simulation**: `meta.role ∈ {analyst, manager}`, switched in the top bar. Every switch is audited. `permissions.can(role, action, subject)` is the only gate, called by `commands.ts` and by UI hooks (`useCan`) to render disabled-with-reason. Manager-only actions: approve > ₹5,00,000; approve with an ambiguous match or conflicting payment info; dispute → resolved/rejected; dismiss a reconciliation item.

### A7. Observability

- **In app:** the audit log is the product's own observability (every command, `validation_failure`, `demo_reset`, imports accepted/rejected, role switches).
- **Developer:** `console.error` on every caught failure (Dexie open failure, seed fetch failure, invariant throw) with prefix `[verilane]`. This is never silent: each path also has a visible UI state (Architecture §9).
- **Build/CI:** `eval/report.json` and `report.md`, Playwright HTML report and traces on failure (`test-results/`, gitignored), `pnpm check:secrets` output.
- **Prod (Stage 10):** Vercel deployment status only. There is no server state to monitor apart from `/api/llm/*` returning 503 in prod.

### A8. Failure modes

| Failure | Handling | Test |
|---|---|---|
| IndexedDB unavailable | in-memory Dexie-compatible store, persistent Banner, `console.error` | TC-018 |
| Seed fetch fails | Queue/Home error state + Retry | TC-016 |
| Seed version mismatch | Reset prompt, no auto-wipe | TC-014 |
| CSV schema error | whole file rejected, row/field/reason list, audited | TC-057 |
| Provider returns invalid/refusal | `rejected` → `validation_failure` audit → `needs_review` | TC-070/071/074 |
| Live mode off | 503, UI keeps the "Simulated" label | TC-072 |
| Invariant violation in a command | throw → rollback → error toast | TC-038 |
| Permission denied when forced | throw, no state change, toast with reason | TC-039 |
| Offline (PWA) | offline Banner wins over the storage banner; mutating data ops disabled with reason | TC-076 |
| Stale SW cache after seed bump | cache key = seed version | TC-077 |

### A9. Sequencing (critical path)

`TASK-6 → 7 → 8 → 11 → 12 → 13 → 15 → 16 → 21 → 22 → 28` is the critical path, together with `7 → 14` (command core), which joins at 15/17. Parallel lanes once TASK-7 is done: **lane A** email intelligence (8, 11, 12, 13); **lane B** command core (14), then 19; **lane C** 10 (storage banner) and 20 (responsive shell, after 9). TASK-27 (OG) can start right after TASK-9 because its user gate must never block release. TASK-23 (live LLM, P2) is the first thing cut if time is short.

### A10. Risks (technical)

| Risk | Mitigation | Owner task |
|---|---|---|
| Dexie + App Router SSR friction | client-only hooks behind `"use client"` + `dynamic(..., {ssr:false})` for the data shell; proven in TASK-7 before anything else depends on it | TASK-7.6 |
| Domain purity erodes | ESLint `no-restricted-imports` on `src/domain/**` (SR2), checked by TC-002 | TASK-6.3 |
| Extractor overfits seed | held-out set committed before TASK-12 (git order = evidence) | TASK-11 |
| Eval labels edited to pass | `eval/CHANGELOG.md` rule plus a schema test; Stage 8 reviews `git log eval/` | TASK-11.4 |
| Non-atomic state + audit | one rw transaction plus a failure-injection test | TASK-14.4 |
| Secret in client bundle | `server-only` import plus `pnpm check:secrets` in `test:all` | TASK-23.5 |
| Internal disk fills (ENOSPC looks like flakiness) | pnpm store, Playwright browsers and temp on E Drive; `df -h` before blaming flakiness | TASK-6.1 |
| Mobile shell regressions | overflow spec from TASK-20 runs in every later `test:all` | TASK-20.5 |

### A11. Deployment

Vercel Hobby, Git-connected, with no env vars in production (NFR7 ₹0, S10). `pnpm build` must succeed with an empty env (TC-001). `/api/llm/*` is deployed but returns 503. Stage 10 owns the actual deploy. This plan only guarantees a buildable, env-free app plus `next.config.ts` security headers (CSP `default-src 'self'`; `connect-src 'self'`, since there are no external origins; `frame-ancestors 'none'`).

### A12. Migration

- **IndexedDB schema:** v1 only for this build. Any later change bumps the Dexie `version(n)` with an `upgrade()` that rebuilds derived tables from source. Workflow tables (disputes, drafts, reviewItems, audit) are migrated, never dropped.
- **Seed:** `manifest.json.seedVersion` (e.g. `2026-10-30.1`). A bump triggers the Reset prompt (no auto-wipe) and a new SW cache key.
- **priority config:** `config_version` is stored on every Priority row. A `priority.v2` would be added alongside, never edited in place.

### A13. Testing strategy (5.5 test architecture)

| Layer | Tool | Location | Scope | Command |
|---|---|---|---|---|
| Unit (domain, store, ai) | Vitest project `unit` (node env; `fake-indexeddb/auto` for store tests) | `src/**/*.test.ts`, `scripts/*.test.ts`, `eval/*.test.ts` | TDD for all domain code; FS1–FS13; permission/transition matrices | `pnpm test` |
| Eval | Vitest project `eval` (node, no network, frozen clock) | `eval/*.eval.ts` | six gates, fault injection, determinism; writes `eval/report.{json,md}`; non-zero exit on gate miss | `pnpm eval` |
| E2E + a11y + responsive | Playwright (Chromium) + `@axe-core/playwright` against `pnpm build && pnpm start` on :3100 | `tests/e2e/*.spec.ts` | user flows, four states, axe both themes, overflow ×4 widths, network log | `pnpm e2e` |
| Static gates | `tsc --noEmit`, ESLint, `scripts/check-bundle-secrets.ts` | — | typecheck, SR2, NFR8 | `pnpm typecheck`, `pnpm lint`, `pnpm check:secrets` |
| Perf | Playwright + `PerformanceObserver` (LCP, INP proxy), `next build` route-size output parsed | `tests/e2e/perf.spec.ts`, `scripts/route-budget.ts` | NFR1–NFR3 | part of `pnpm e2e` (tagged `@perf`) |

- **Single top-level command:** `pnpm test:all` = `pnpm typecheck && pnpm lint && pnpm test && pnpm eval && pnpm build && pnpm check:secrets && pnpm e2e`. It is the Stage 6 per-phase gate, the Stage 8 test pass and the pre-deploy check. It exits non-zero on the first failure.
- **Fixtures / test data:** `public/seed/*` (the demo data), `src/domain/__fixtures__/` (hand-written minimal cases incl. worked examples A–E and FS1–FS13), `eval/heldout/`, `eval/drafts.cases.json`, `tests/e2e/fixtures/{bad-invoices.csv,good-invoices.csv}`.
- **Result storage:** `eval/report.json` + `report.md` (committed); Playwright `playwright-report/` + `test-results/` (gitignored, kept locally for the Stage 8 QA report); `coverage/` (gitignored).
- **E Drive paths (SR12):** `.npmrc` `store-dir=/Volumes/E Drive/Dev/.pnpm-store`; the `e2e` script exports `PLAYWRIGHT_BROWSERS_PATH=/Volumes/E Drive/Dev/.scratch/pw-browsers` and `TMPDIR=/Volumes/E Drive/Dev/.scratch/tmp` inline; `playwright.config.ts` keeps `outputDir` inside the repo (E Drive).
- **Regression execution:** every TC marked automation-candidate=yes lives in a spec file named by the ticket (e.g. `tests/e2e/queue.spec.ts`) and has the TC ID in the test title (`test('TC-015 …')`). `grep -rn "TC-0" src eval tests scripts` is the traceability check.
- **CI:** none is required for the demo (Vercel builds only). A `.github/workflows/ci.yml` running `pnpm test:all` is **not** in scope. If the user wants one, it is a Stage 10 add (TP6).

### A14. Rollback

- **Code:** each ticket lands as its own commit(s) on the build branch; revert by commit. The tracer (TASK-7) is the fallback baseline.
- **Deploy:** Vercel "instant rollback" to the previous production deployment (Stage 10).
- **User data:** per-visitor IndexedDB. **Reset Demo Data** is the universal recovery, and the README tells users so.
- **Eval regressions:** a failing gate blocks the merge (`pnpm eval` non-zero). Labels change only via `eval/CHANGELOG.md`.

### A15. Design implementation rules (verbatim, Design.md frozen)

- **Tokens:** `src/app/globals.css` copies the three token blocks from `.design/exploration/final/mockup.html` byte-for-byte: `:root{…}`, `@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){…} }`, `:root[data-theme="dark"]{…}`. Tailwind maps names to `var(--token)`. No raw hex anywhere else; Stage 7 greps `src/` for `#[0-9a-f]{3,6}` outside `globals.css`.
- **Theme:** `data-theme` on `<html>`, persisted in `localStorage` (`verilane-theme`). A pre-hydration inline script in `layout.tsx` sets it to avoid a flash (the mockup's toggle logic).
- **Type:** the system stacks only (`--font-ui`; `--font-display` for h1/KPI/document amount; `--font-mono` for refs and provenance). Scale 12/13/14/16/20/28/34. `tabular-nums` on money. No webfonts.
- **Shape:** `--r-lg` 14px cards, `--r-md` 10px inputs, pill buttons/chips; one shadow (menus, popovers, dialogs, toasts); no glass, gradients or glow. 4px spacing base; row-card 64px; touch targets ≥44px (48px mobile tabs).
- **Components:** exactly Design-System §6 (chips with dot+text, row-card link rows, `<details>` task feed and checks, AlertDialog confirm, Sonner toast, one shared Banner, two Recharts charts, Lucide at 1.5 stroke).
- **Motion:** `transition: …150ms` on state changes only. `@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}`.
- **Four states:** every data view (Design §18) via `src/components/states/*`.
- **Logo:** `public/brand/verilane-logo.png` unmodified, on a white `--r-md` card, max 150px (104px mobile).

---

## Part B · Per-ticket atomic tasks

Format: each `TASK-N.k` is 2–5 minutes and touches the listed files. **Gate** is the check that must pass before moving on. Interfaces are TypeScript signatures. TDD tickets write the test step **first** (red), then the implementation (green). Existing plan-local IDs `TSK-01…07` in `tickets.md` map to `TASK-6.1–6.8` and `TASK-7.1–7.9` below (superseded by this finer split, not renumbered).

### TASK-6 · Scaffold repo and app shell (TKT-01) · M-001

- **6.1** Scaffold. Files: `package.json`, `.npmrc` (`store-dir=/Volumes/E Drive/Dev/.pnpm-store`), `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, paths `@/*`), `next.config.ts`, `.gitignore` (`.env*.local`, `.next`, `node_modules`, `test-results`, `playwright-report`, `coverage`). `pnpm create next-app` with `--ts --app --tailwind --eslint --src-dir --use-pnpm`, then pin versions with `-E`. **Gate:** `pnpm dev` serves `/`.
- **6.2** Tokens. File: `src/app/globals.css`. Copy the three token blocks verbatim from the mockup, then base styles (body `background: var(--canvas)`, fonts) and the reduced-motion rule. Tailwind theme maps `canvas, surface, surface-sunken, border, border-strong, text, text-muted, brand, brand-strong, brand-tint, rail*, high*, med*, low*, disp*, disabled-*, on-brand` → `var(--…)`. **Gate:** token diff test in 6.8.
- **6.3** SR2 lint rule. File: `eslint.config.mjs`, override for `src/domain/**` with `no-restricted-imports` patterns `react*`, `next*`, `dexie*`, `@/store/*`, `@/components/*` and `no-restricted-globals` `window, document, indexedDB, localStorage`. **Gate:** TC-002 — fixture `src/domain/__lint__/forbidden.fixture.ts` imports `react`; `pnpm lint:domain-fixture` must fail (fixture is ignored by the normal lint run).
- **6.4** shadcn init + primitives. Files: `components.json`, `src/components/ui/{button,badge,alert-dialog,textarea,tooltip,sonner}.tsx`, `src/lib/cn.ts`. **Gate:** typecheck.
- **6.5** Shell. Files: `src/components/shell/{Sidebar,TopBar,ThemeToggle,RoleSwitcher,LogoCard,NavItems}.tsx`, `src/app/layout.tsx`. `NavItems` = Home `/` · Queue `/queue` · Disputes `/disputes` · Payments `/payments` · Drafts `/drafts` · Audit log `/audit` · Settings `/settings` (Lucide icons). Sidebar 216px, as-of footer `As of 30 Oct 2026`. TopBar: `DEMO DATA` badge, `RoleSwitcher` disabled with reason "Arrives with permissions", `Simulated` label, `ThemeToggle` (persists; pre-hydration script). **Gate:** visual check at 1440 vs mockup; theme survives reload.
- **6.6** Placeholders. Files: `src/app/{page,disputes,payments,drafts,audit,settings}/page.tsx` → `<ComingSoon milestone="M-00x" />` (the only allowed stub). **Gate:** every nav link returns 200.
- **6.7** Test configs. Files: `vitest.config.ts` (`test.projects`: `unit` = `src/**/*.test.ts, scripts/**/*.test.ts, eval/**/*.test.ts`, node, `setupFiles:['src/test/setup.ts']`; `eval` = `eval/**/*.eval.ts`, node, `testTimeout:30000`), `src/test/setup.ts` (`import 'fake-indexeddb/auto'`), `playwright.config.ts` (`testDir:'tests/e2e'`, `webServer:{command:'pnpm start -p 3100', url:'http://127.0.0.1:3100', reuseExistingServer:true, env:{NEXT_PUBLIC_E2E:'1'}}` — note `NEXT_PUBLIC_*` is inlined at build, so `e2e` builds with it set, see TP7; projects `chromium-light`, `chromium-dark` via `colorScheme`; `outputDir:'test-results'`). `package.json` scripts:
  ```
  "dev": "next dev", "build": "next build", "start": "next start",
  "typecheck": "tsc --noEmit", "lint": "eslint .",
  "test": "vitest run --project unit", "eval": "vitest run --project eval",
  "build:e2e": "NEXT_PUBLIC_E2E=1 next build --no-lint",
  "e2e": "PLAYWRIGHT_BROWSERS_PATH='/Volumes/E Drive/Dev/.scratch/pw-browsers' TMPDIR='/Volumes/E Drive/Dev/.scratch/tmp' playwright test",
  "check:secrets": "tsx scripts/check-bundle-secrets.ts",
  "test:all": "pnpm typecheck && pnpm lint && pnpm test && pnpm eval && pnpm build && pnpm check:secrets && pnpm build:e2e && pnpm e2e"
  ```
  Browser install: `PLAYWRIGHT_BROWSERS_PATH='/Volumes/E Drive/Dev/.scratch/pw-browsers' pnpm exec playwright install chromium`. **Gate:** `pnpm test` and `pnpm e2e` run with smoke spec `tests/e2e/smoke.spec.ts` (loads `/queue`).
- **6.8** Guards. Files: `src/test/logo.test.ts` (TC-003: sha256 of `public/brand/verilane-logo.png` equals the constant recorded from the supplied file), `src/test/tokens.test.ts` (extracts token blocks from mockup and `globals.css`, asserts equal; contrast of text pairs ≥4.5:1 in both themes), `scripts/check-bundle-secrets.ts` (fails if `/ANTHROPIC|sk-ant-/` appears under `.next/static`). **Gate:** `pnpm test` green; TC-001 = `env -i PATH="$PATH" HOME="$HOME" pnpm build` succeeds.

### TASK-7 · Tracer: seed → IndexedDB → priority → Queue → evidence (TKT-02) · M-001

- **7.1** (test first) `src/domain/money.test.ts` → `money.ts`: `type Paise = number & {__brand:'Paise'}`; `paise(n):Paise` (throws on non-integer); `parseInr(s):Paise|null` (`₹`, `Rs.`, `INR`, Indian and Western grouping, `lakh(s)`, `crore`); `formatInr(p):string` → `₹3,40,000.00`. **Gate:** TC-007.
- **7.2** `src/domain/clock.ts`: `AS_OF_DATE='2026-10-30'`, `toDay(iso):number`, `daysBetween(a,b):number`, `asOf(meta?):string` + `clock.test.ts`. **Gate:** unit green.
- **7.3** `src/domain/schema.ts`: Zod for Customer, Invoice, Payment, EmailMessage, DataIssue, Priority, Evidence (rest added per ticket), `export type X = z.infer<…>`. **Gate:** typecheck.
- **7.4** (test first) `src/domain/ingest.test.ts` → `ingest.ts`: `ingest(raw:{invoices:Row[];customers:Row[];payments:Row[];emails:unknown}): {customers;invoices;payments;emails;dataIssues:DataIssue[]}`; missing → `null` + `DataIssue{kind:'missing'}`; `outstanding = amount − Σpayments`, disagreeing supplied value → `DataIssue{kind:'conflict'}`; unknown `status_raw` → `status:'unknown'`. **Gate:** TC-008 (FS1, FS2), TC-009 (FS8, FS10).
- **7.5** (test first) `src/domain/priority.test.ts` with `src/domain/__fixtures__/worked-examples.ts` (A, B, E) → `priority.ts`: `prioritise(inv, ctx:PriorityCtx):Priority`, `rank(ps):Priority[]`; `PriorityCtx = {asOf; payments; customerHistory; dataIssues; signals /* G4/G5/G7 empty until TASK-13 */}`. Gates in order G1→G7, first hit wins. Score: days overdue 10/20/35/45; outstanding 5/12/20/30 at 50k/2L/5L; avg days late 0/5/10/15 (5 if no history); broken promise +10. Bands High ≥55, Medium 30–54, Low <30. Tie-break score → days overdue → outstanding → invoice number asc. `reason` e.g. `"High (70): 47 days overdue · ₹6,20,000 outstanding · …"` with evidence ids per factor. `config_version:'priority.v1'`. **Gate:** TC-004, TC-005, TC-006.
- **7.6** `src/store/db.ts`: `class VerilaneDb extends Dexie` (v1 stores, A3); `openDb(): Promise<{db; persistent:boolean}>`. `src/store/loader.ts`: `ensureSeeded(db, fetcher=fetch)`, `recompute(db)`. `src/store/hooks.ts` (`"use client"`): `useDb()`, `useQueue()`, `useInvoice(id)`. `src/components/DataProvider.tsx` loaded with `dynamic(…, {ssr:false})`. Test `src/store/loader.test.ts` (fake-indexeddb): fixture seed loads, counts match, `&invoice_number` unique. **Gate:** unit green and `pnpm build` clean — **riskiest assumption; if it fights back, stop and record a TP decision.**
- **7.7** Minimal seed: `public/seed/{invoices.csv,customers.csv,payments.csv,emails.json,manifest.json}`, ~8 invoices covering A, B, E, FS1, FS2, FS8, FS10; `seedVersion:'2026-10-30.0'`. **Gate:** loader test against the real files.
- **7.8** Queue rows: `src/app/queue/page.tsx`, `src/components/queue/{QueueView,RowCard,PriorityChip}.tsx`. Row = one `<a>`: chip (dot+text), invoice no. (mono), customer, outstanding (`tabular-nums`), days overdue, reason first line; 64px. **Gate:** `/queue` lists rows in rank order.
- **7.9** Investigation: `src/app/invoices/[id]/page.tsx` (client-rendered detail; must build static — record the chosen pattern in the commit), `src/components/investigation/{DocumentCard,PriorityReason,EvidenceTable,ProvenanceLine}.tsx`, `src/domain/evidence.ts` (`buildInvoiceEvidence(inv, rowNo): Evidence[]`). `ProvenanceLine` = `invoices.csv · Row 12 · due_date`, 12px mono. **Gate:** TC-010 `tests/e2e/tracer.spec.ts` on the production build.

### TASK-8 · Full synthetic seed and coverage test (TKT-03) · M-001

- **8.1** `scripts/seed.ts` with `mulberry32(20261030)`; `pnpm seed` writes `public/seed/*` (50 invoices, 10 customers, payments, 25 threads; `seedVersion:'2026-10-30.1'`). Scenario spec table at top of file (scenario → invoice/thread IDs).
- **8.2** (test) `scripts/seed.test.ts`: generate twice into `/Volumes/E Drive/Dev/.scratch/verilane-seed-*`, byte-compare (TC-012).
- **8.3** (test) `src/domain/seed-coverage.test.ts`: ≥5 each of duplicate, commitment, confirmation, dispute, missing-data; every FS1–FS10; worked examples A–E present by ID (TC-011).
- **8.4** Uniqueness: `ingest` flags duplicate `invoice_number` with a DataIssue; Dexie `bulkAdd` of a duplicate throws `ConstraintError` (TC-013).
- **8.5** `src/components/SeedUpdatePrompt.tsx`: version mismatch → "New demo data available" + Reset (disabled with reason "Reset arrives with Settings" until TASK-19). `loader.test.ts` asserts no wipe on mismatch (TC-014).

### TASK-9 · Queue: search, filters, sort, paging, four states (TKT-04) · M-001

- **9.1** `src/components/queue/useQueueTable.ts`: TanStack `useReactTable`, columns `priority, invoice_number, customer, outstanding, days_overdue, status`; filtered/sorted/paginated row models (25/page).
- **9.2** `src/components/queue/queueParams.ts`: `parse(URLSearchParams):QueueFilters`, `serialize(f):string` (`q, band, status, customer, ageing, sort, page`); unit round-trip test (TC-017 part).
- **9.3** `FiltersPanel.tsx`: "Hide filters" disclosure, active-filter count, Clear filters.
- **9.4** `src/components/states/{RowSkeleton,EmptyState,ErrorState}.tsx`; Queue: skeleton, empty-filtered ("No invoices match these filters" + Clear filters), empty-no-data ("No invoices yet" + Load demo data), error + Retry. Test hook `?__state=loading|empty|error` honoured **only** when `NEXT_PUBLIC_E2E==='1'` at build (TP7).
- **9.5** Muted excluded rows (`disputed, hold_reconcile, on_hold_promised`) with badge slot; sidebar Queue count via `useQueueCount()`.
- **9.6** `tests/e2e/queue.spec.ts`: TC-015, TC-016, TC-017.

### TASK-10 · Storage fallback banner, SR9 (TKT-05) · M-001

- **10.1** `openDb` catches `OpenFailedError`/`SecurityError`/`QuotaExceededError` → in-memory Dexie (via `fake-indexeddb` memory factory so the code path is identical), `persistent:false`, `console.error('[verilane] storage unavailable', err)`.
- **10.2** `src/components/shell/Banner.tsx` (shared) `<Banner kind="storage"|"offline">`; storage text "Changes won't survive reload — storage unavailable"; `BannerHost` renders at most one, offline wins.
- **10.3** Unit: `indexedDB` stub throws → `persistent:false`, store still works.
- **10.4** `tests/e2e/storage-fallback.spec.ts`: `addInitScript` makes `window.indexedDB` throw `SecurityError` → banner visible, Queue works (TC-018).

### TASK-11 · Eval labels and held-out set before extractor (TKT-06) · M-002

- **11.1** `eval/schema.ts`: `ThreadLabel` (`thread_id, customer_id|null, invoice_id|null, match_outcome(4), email_class(7), dispute_type?(7), amounts:int[], invoice_refs, commitment_date?, ambiguous`), `DraftCase`.
- **11.2** `eval/seed.labels.json`: 25 labels written **from the scenario spec in `scripts/seed.ts`**, not from any output.
- **11.3** `eval/heldout/{emails.json,invoices.csv,customers.csv,labels.json}`: 30 new fictional threads — near-miss refs (`INV-1024` vs `INV-1042`), negation, hedging, lakh amounts, relative dates, DD/MM; wording deliberately unlike the seed.
- **11.4** `eval/drafts.cases.json` (≥20, incl. FS12 adversarial edits: amount change, added date, new ref, customer swap); `eval/CHANGELOG.md` initial entry; `eval/labels.test.ts` validates all files (TC-019).
- **11.5** **Commit this ticket on its own before any TASK-12 code** (TC-020 checks git order).

### TASK-12 · Simulated extractor and classifier → Communication evidence (TKT-07) · M-002

- **12.1** (test) `extract.ts`: `extractTokens(msg):Tokens` = `{refs; amounts:Paise[]; dates; relativeDates:{text;resolved}[]}`; refs `/\bINV-\d{4}\b/i` → uppercase; amounts via `parseInr`; dates ISO / `30 Oct 2026` / DD/MM/YYYY (never MM/DD); relative dates resolved against `sent_at`. **Gate:** TC-021.
- **12.2** (test) `src/domain/phrases.ts`: families `dispute, duplicate, confirmation, commitment, delay, enquiry, missing_info`, each `{patterns; negations; hedges}`; negated/hedged matches don't count (TC-022).
- **12.3** (test) `classify.ts`: `classify(tokens, text):{email_class; signals; dispute_type?}`; class needs signal + supporting token (confirmation ⇒ amount or ref; commitment ⇒ date); precedence dispute/duplicate > confirmation > commitment > delay > enquiry; secondary signals kept. **Gate:** TC-023, TC-024.
- **12.4** `src/ai/provider.ts`: `interface Provider { name:'simulated'|'faulty'|'live'; extract(msg, ctx): Promise<Result<Extraction,Rejected>>; draft(input): Promise<Result<DraftBody,Rejected>> }`, `type Result<T,E> = {ok:true;value:T}|{ok:false;error:E}`. `src/ai/simulated.ts` stamps `{mode:'demo', provider:'simulated', schemaVersion:'extraction.v1'}`. `src/ai/validateExtraction.ts`: every provider output passes Zod (SR5).
- **12.5** `recompute()` runs the provider over all emails → `extractions`; `evidence.ts` adds `buildEmailEvidence`.
- **12.6** `src/components/investigation/CommunicationTable.tsx`: class chip, key facts, `emails.json · E-007 · amounts[0]` provenance, `Simulated` label; FS9 "No prior communication". `tests/e2e/investigation.spec.ts` (TC-025, TC-026).
- **12.7** Quick check: amount/ref exact match over `eval/seed.labels.json` = 100%. Label files are read-only to this ticket.

### TASK-13 · Strict matcher, review items, G4/G5/G7, Payments page (TKT-08) · M-002

- **13.1** (test) `match.ts`: `match(ext, msg, ledger):Match`. Identity = `from_address ∈ customer.contact_emails` (lowercased); exact normalised ref owned by that customer → `matched`; ref owned by another customer or >1 candidate → `ambiguous`; transposition (same digit multiset) → `ambiguous` "possible transposition of INV-xxxx"; identity, no ref → `customer_only`; neither → `unresolved`. **No edit distance** (comment + Stage 8 grep). **Gate:** TC-027, TC-028.
- **13.2** `src/domain/review.ts`: `reviewItemsFor(match, ext, ledger):ReviewItem[]`; email amount ≠ ledger outstanding → `reconciliation` item (ledger never overridden).
- **13.3** (test) priority signals: G4 dispute signal or open Dispute; G5 payment claim / reconciliation conflict / `DataIssue{conflict}`; G7 active commitment while `asOf ≤ commitment_date + 3`; broken promise +10 after that if unpaid; FS6 duplicate claim → G5 on both invoices. **Gate:** TC-029–TC-033 (worked examples C, D).
- **13.4** `/payments`: `src/app/payments/page.tsx`, `src/components/payments/{PaymentsView,LedgerTable,UnmatchedList}.tsx`, four states (TC-034).
- **13.5** Queue badges Disputed / Hold — reconcile / On hold (promised), each linking to the cause.

### TASK-14 · Command core: permissions, transitions, audit, Audit log (TKT-09) · M-003

- **14.1** (test, table-driven exhaustive) `permissions.ts`: `Role='analyst'|'manager'`; `Action = 'add_note'|'generate_draft'|'edit_draft'|'submit_draft'|'approve_draft'|'reject_draft'|'mark_disputed'|'dispute_transition'|'resolve_dispute'|'dismiss_review'|'action_review'|'import_csv'|'reset_demo'|'switch_role'|'set_as_of'`; `can(role, action, subject):{allowed; reason?}`. **Gate:** TC-035.
- **14.2** (test) `transitions.ts`: `transition(machine:'invoice'|'dispute'|'draft'|'review', from, event)` → next state or throws `IllegalTransition`. **Gate:** TC-036.
- **14.3** `commands.ts`: `Command = {type:Action; subject:{kind;id}; payload; actor:Role}`; `interface Tx { get; put; audit(e):void }`; `run(cmd, tx)` = `can` → `transition` → writes → exactly one `tx.audit`.
- **14.4** `src/store/tx.ts`: `execute(cmd)` wraps `run` in `db.transaction('rw', …)`. `src/store/tx.test.ts`: one audit per command (TC-037); injected throw after write rolls back write + audit (TC-038).
- **14.5** `RoleSwitcher.tsx` live → `execute({type:'switch_role'})`; `meta.role` persisted; `useCan(action, subject)`.
- **14.6** `/audit`: `src/components/audit/{AuditView,AuditRow}.tsx`, reverse-chron, filter by action/subject, four states, no edit/delete (TC-040).
- **14.7** `ActivityLog.tsx` + note Textarea → `add_note`. e2e FS13: Analyst sees manager-only control disabled with reason; forcing via `window.__verilane.execute` (exposed only in E2E builds) throws, state unchanged (TC-039).

### TASK-15 · Draft, nine checks, action bar (TKT-10) · M-003

- **15.1** `schema.ts`: `VerifiedFact {claimId; kind:'invoice_number'|'customer_name'|'amount'|'due_date'|'days_overdue'|'contact'; value; evidenceId}`, `Draft`.
- **15.2** (test) `draft.ts`: `buildDraft(facts):{body; footnotes:{claimId;span:[number,number]}[]}`; template interpolates facts only, no free numbers (TC-044).
- **15.3** (test) `validate.ts`: `validate(draft, ctx):Check[]` (9), `Check={id; name; passed; reason}`; check 9 tokenises numbers, dates, `INV-` refs, customer names, fails on any token outside a footnote span. **Gate:** TC-041, TC-043.
- **15.4** Commands `generate_draft`, `edit_draft` (re-runs all nine, FS12), `submit_draft` (TC-042 incl. `eval/drafts.cases.json` subset).
- **15.5** `src/components/investigation/{DraftPanel,ChecksPanel,ActionBar,NextStepCallout}.tsx`: "N of 9 passed", failures first and expanded with fix link; exactly one primary (Submit for approval / Approve & send); disabled-with-reason inline (TC-045).

### TASK-16 · Approve, confirm, simulated send, Drafts page (TKT-11) · M-003

- **16.1** (test) `approve_draft`: re-validates in tx, needs 9/9 + `can()`; Manager-only if outstanding > ₹5,00,000 (`> 50_000_000` paise), ambiguous match, or conflicting payment info (TC-046, TC-047).
- **16.2** `ApproveDialog.tsx` (AlertDialog) names invoice, customer, amount; Sonner toast "Reminder for INV-… (Customer) approved and sent (simulated)."; status `sent_simulated`.
- **16.3** `/drafts`: `src/components/drafts/DraftsView.tsx`, awaiting-approval list, four states, sidebar badge (TC-049).
- **16.4** `tests/e2e/approve.spec.ts`: `page.on('request')` during send — no request leaves `127.0.0.1:3100`, none beyond the asset/RSC baseline (TC-048).

### TASK-17 · Disputes page, state machine, Manager resolve (TKT-12) · M-003

- **17.1** Dispute schema; `recompute()` creates disputes from dispute/duplicate emails (idempotent by source `message_id`); `mark_disputed` command.
- **17.2** (test) machine + role: only Manager enters `resolved|rejected`; only those release G4 (TC-050, TC-051).
- **17.3** `/disputes` + `/disputes/[id]`: claim text, email provenance, recommendation; four states; sidebar badge (TC-053).
- **17.4** Queue muted row "Disputed — excluded from queue" + link; approval blocked by check 6 (TC-052).

### TASK-18 · Home: KPIs, task feed, two charts (TKT-13) · M-004

- **18.1** (test) `aggregates.ts`: `kpis(state):{outstanding; high; openDisputes; avgDaysOverdue}`, `ageingBuckets`, `priorityMix` (TC-054).
- **18.2** `src/components/home/{KpiStrip,TaskFeed,AgeingChart,PriorityMixChart}.tsx`; Recharts with labelled legends; bar click → `/queue?` + `serialize(filter)`; keyboard-reachable link list as a11y fallback.
- **18.3** Per-block inline errors; four states ("Nothing needs your attention", no celebration). `tests/e2e/home.spec.ts` (TC-055, TC-056).

### TASK-19 · Settings and data ops (TKT-14) · M-004

- **19.1** (test) `src/store/csv.ts`: `parseImport(kind, file):Result<Rows, RowError[]>` (Papa → Zod per row; any error rejects the whole file); `toCsv(kind, rows)`.
- **19.2** Commands `import_csv` (replace; audited on accept and reject), `reset_demo` (clear → re-seed → recompute; `demo_reset` first event), `set_as_of` (re-ranks).
- **19.3** `/settings`: `src/components/settings/{DataOps,ImportDialog,ResetDialog,AsOfControl,PriorityWeights,ThemeControl}.tsx`; Queue "Import data" entry; eval link → `/settings/eval`.
- **19.4** Wire `SeedUpdatePrompt` Reset.
- **19.5** `tests/e2e/settings.spec.ts` + `tests/e2e/fixtures/{bad-invoices.csv,good-invoices.csv}` (TC-057–TC-061).

### TASK-20 · Responsive shell (TKT-15) · M-004

- **20.1** `IconRail.tsx` (768–1023, 72px, Tooltip + `aria-label`); `BottomTabs.tsx` (<768: Home · Queue · Disputes · More, 48px); `MoreSheet.tsx` (Payments, Drafts, Audit log, Settings).
- **20.2** `RowCard` two-line variant <1024; `EvidenceTable` stacks to label/value <768.
- **20.3** Investigation/Home single column 1024–1279; theme toggle no-wrap at 390.
- **20.4** Tab order = visual order (DOM order, no positive `tabindex`).
- **20.5** `tests/e2e/responsive.spec.ts`: every route × [1440, 1280, 768, 390] → `scrollWidth <= innerWidth` (TC-062); mobile nav reaches all seven (TC-063); tab order (TC-064). Stays in every later `pnpm e2e`.

### TASK-21 · pnpm eval harness (TKT-16) · M-005

- **21.1** `eval/metrics.ts`: `computeMetrics(results, labels):Metrics` — six gated metrics + P/R/F1 per class/type + ambiguous escalation rate.
- **21.2** `eval/run.ts`: seed + held-out + draft cases, simulated provider, frozen clock → `Report{generatedAt; gates:{name;value;threshold;passed}[]; …}`; approval enforcement via `approve_draft` against an in-memory `Tx`.
- **21.3** `eval/gates.eval.ts`: one test per gate per set (TC-065, TC-066); writes `eval/report.json` (stable key order) + `report.md`; failed expect → non-zero exit.
- **21.4** `eval/determinism.eval.ts` (two runs equal minus `generatedAt`, TC-067); `eval/forced-miss.eval.ts` (child run with `VERILANE_EVAL_FORCE_MISS=1` exits non-zero, TC-068); wall-clock in report ≤30 s (TC-069).
- **21.5** `/settings/eval` renders `eval/report.md` at build time (server component `fs.readFileSync`).

### TASK-22 · Fault-injection provider, FS11 (TKT-17) · M-005

- **22.1** `src/ai/faulty.ts`: `faulty(base, kind:FaultKind):Provider`, `FaultKind = 'malformed_json'|'missing_fields'|'bad_enum'|'hallucinated_amount'|'wrong_ref'|'refusal'`, deterministic per message index.
- **22.2** `validateExtraction` + `crossCheck(ext, msg)` (amounts and refs must appear as tokens in the source) → `rejected` → `validation_failure` audit → `needs_review` (TC-070).
- **22.3** `eval/faults.eval.ts`: rejection rate 100%; no rejected item yields an approvable draft (TC-071); rate in report.

### TASK-23 · Live Claude provider (TKT-18, P2) · M-005

- **23.0** **Load the `claude-api` skill before writing any SDK code.**
- **23.1** `src/app/api/llm/{extract,draft}/route.ts`: `import 'server-only'`; `runtime='nodejs'`; guard → 503 `{error:'live_mode_disabled'}` unless `ANTHROPIC_API_KEY` set and `VERILANE_LIVE_LLM==='1'`.
- **23.2** `src/server/llm.ts`: `new Anthropic()`; `client.messages.parse` with `zodOutputFormat(ExtractionSchema)` (exact params from the skill), model `process.env.VERILANE_LLM_MODEL ?? 'claude-opus-5-5'`; refusal or parse failure → `{ok:false}`.
- **23.3** `src/ai/live.ts`: `fetch('/api/llm/extract')` → Zod re-validate → `Result`; UI shows `Live LLM` only when `/api/llm/status` reports enabled.
- **23.4** `scripts/eval-live.ts` (`pnpm eval:live --yes`): refuses without `--yes`, prints cost estimate, writes `eval/report.live.json` "reported, not gated".
- **23.5** `src/app/api/llm/route.test.ts`: no env → 503 (TC-072); mocked refusal → rejected (TC-074); `pnpm check:secrets` after build (TC-073).

### TASK-24 · PWA (TKT-19) · M-006

- **24.1** `src/app/manifest.ts`: `display:'standalone'`, `theme_color:'#0f3d29'`, `background_color:'#f8f7f3'`, icons 192/512 + maskable.
- **24.2** `public/icons/icon-{192,512,maskable-512}.png` from `scripts/make-icons.ts` (`sharp`, dev): unaltered logo centred on a white safe-zone inside a `#0f3d29` frame; source logo checksum unchanged.
- **24.3** `public/sw.js` (hand-written): cache `verilane-${seedVersion}`; precache shell + `/seed/*`; cache-first static/seed, network-first navigations with cached fallback; `activate` deletes other `verilane-*`. Registered by `src/components/PwaRegister.tsx` (prod only).
- **24.4** Offline banner via shared Banner (offline wins); `useOnline()` disables import, reset, live calls with "Unavailable offline".
- **24.5** `InstallChip.tsx`: `beforeinstallprompt`; dismiss in `sessionStorage`; Settings → Install app. No modal.
- **24.6** `tests/e2e/pwa.spec.ts`: TC-075 (manifest + SW), TC-076 (`context.setOffline(true)`), TC-077 (new cache name on seed bump), TC-078 (chip dismiss). Lighthouse installable check run manually once, recorded.

### TASK-25 · Quality sweep (TKT-20) · M-006

- **25.1** `tests/e2e/states.spec.ts`: each data route × four states (`?__state=` hook + real empty after reset) (TC-079).
- **25.2** `tests/e2e/a11y.spec.ts`: `AxeBuilder` per route in light and dark projects; 0 serious/critical (TC-080).
- **25.3** `tests/e2e/controls.spec.ts`: every interactive element either has an effect (nav, DOM change, toast) or is `aria-disabled` with visible reason (TC-081).
- **25.4** `tests/e2e/keyboard.spec.ts`: queue → row → investigation → draft → approve, keyboard only (TC-082).
- **25.5** `tests/e2e/perf.spec.ts` (@perf): LCP ≤2.5 s on `/` and `/queue`; `scripts/route-budget.ts` fails any route >300 KB gzip First Load JS (TC-083); `src/domain/perf.test.ts` `recompute` 50+25 ≤200 ms median of 5 (TC-084); filter/sort event timing ≤200 ms (TC-085).
- **25.6** Save reports to `/Volumes/E Drive/Dev/.scratch/verilane-qa/` for the Stage 8 QA report.

### TASK-26 · Trust-walk e2e (TKT-21) · M-006

- **26.1** `tests/e2e/trust-walk.spec.ts`: fresh context, production build: queue → top High → evidence → provenance → generate draft → 9/9 → approve (Manager if needed) → toast → disputed invoice blocked → every step in `/audit` (TC-086).
- **26.2** Same spec: every request origin is `http://127.0.0.1:3100` (TC-087).

### TASK-27 · OG image (TKT-22) · M-006

- **27.1** `.design/exploration/og/og.html` (1200×630: logo card, tagline, real 3–4-row queue fragment in tokens) → Playwright screenshot `.design/exploration/og/og.png`.
- **27.2** **User gate:** present the PNG; record approval as `D7` in `decisions.md`; only then copy to `public/og.png`.
- **27.3** `layout.tsx` `metadata`: `metadataBase` from `NEXT_PUBLIC_SITE_URL` (final URL at Stage 10), `openGraph`, `twitter:{card:'summary_large_image'}`.
- **27.4** `src/test/og.test.ts`: 1200×630, <5 MB (TC-089); e2e checks built meta tags use absolute `https://` URLs (TC-088).

### TASK-28 · README (TKT-23) · M-006

- **28.1** `README.md` via the `create-readme-file` skill: one-command run, demo vs live mode, trust boundary (S14), per-browser audit log, eval summary linking `eval/report.md`, synthetic-data note, `docs/` links.
- **28.2** TC-090: fresh clone into `/Volumes/E Drive/Dev/.scratch/verilane-fresh`, README commands run verbatim.

---

## Part C · Stage 6 execution playbook

1. **Branch:** the repo has no commits yet. When the user asks to commit, first commit the planning docs on `main`, then create `build/verilane-v1`. Use git worktrees only for parallel subagents.
2. **Order:** follow A9. TASK-6 and TASK-7 run in the main context (the tracer's riskiest assumption needs a direct check). After TASK-7, subagent-per-ticket is allowed for lanes A and B in parallel worktrees. TASK-11 is committed before TASK-12 is dispatched.
3. **Per ticket:** Campfire `TASK-N` → In Progress → TDD domain sub-tasks → UI → gates (`pnpm test:all`, or the subset that exists yet) → verify in the running app (Chrome if the extension is connected, otherwise Playwright screenshots) → commit with `TASK-N` in the subject → Campfire Done.
4. **Per milestone (no user gate, S1):** a fresh-context reviewer subagent reads `git diff main..HEAD --stat` then the milestone diff against `tickets.md` ACs and this plan. Fix loop max 2 rounds; leftovers become follow-up tickets.
5. **Budget / stop rules:** model allocation via jev-router. Implementer subagents get only their ticket section + file list. Stop and ask the user if a ticket exceeds 2× its `sp:` estimate, or the same `pnpm test:all` failure repeats twice. Check `df -h /` before diagnosing flaky failures.
6. **User touchpoints inside Stage 6:** only TASK-27 (OG approval, D6) and any change to approved scope.

## Part D · Traceability

| Milestone | Campfire | Tasks | TCs |
|---|---|---|---|
| M-001 | m-0 | TASK-6, 7, 8, 9, 10 | TC-001–TC-018 |
| M-002 | m-1 | TASK-11, 12, 13 | TC-019–TC-034 |
| M-003 | m-2 | TASK-14, 15, 16, 17 | TC-035–TC-053 |
| M-004 | m-3 | TASK-18, 19, 20 | TC-054–TC-064 |
| M-005 | m-4 | TASK-21, 22, 23 | TC-065–TC-074 |
| M-006 | m-5 | TASK-24, 25, 26, 27, 28 | TC-075–TC-090 |
