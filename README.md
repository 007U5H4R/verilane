<p align="center">
  <img src="./public/brand/verilane-logo.png" alt="Verilane" width="360">
</p>

<p align="center"><strong>An evidence-first collections workbench for accounts-receivable teams.</strong></p>
<p align="center">Priority queue · Email evidence with provenance · Validated reminder drafts · Human approval · Per-browser audit log</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4-000000" alt="Next.js 16.4">
  <img src="https://img.shields.io/badge/React-19.3-149eca" alt="React 19.3">
  <img src="https://img.shields.io/badge/TypeScript-5.9_strict-3178c6" alt="TypeScript 5.9 strict">
  <img src="https://img.shields.io/badge/storage-IndexedDB_(Dexie_4)-4a7c59" alt="IndexedDB via Dexie 4">
  <img src="https://img.shields.io/badge/data-synthetic-6b7280" alt="Synthetic data">
</p>

---

**Verilane** helps an AR analyst decide whether to chase an overdue invoice at all, before anyone writes a reminder. It reconciles the ledger with the customer's emails (promised dates, "already paid" claims, disputes, duplicate-billing complaints), ranks the work, and only lets a reminder go out after it passes nine pre-approval checks and a Manager approves it. Every number a finance manager has to trust comes from a pure, unit-tested TypeScript domain engine, not from a model. It runs entirely in your browser with no account, no database and no API key.

## Highlights
- **Deterministic priority queue** — a gate → score → band engine (`priority.v1`) ranks 50 invoices against a frozen as-of date (2026-10-30), and every result records the config version it was computed with.
- **Evidence with provenance** — each figure on an invoice page shows where it came from, down to the source file, row and field.
- **Strict matching, no guessing** — the email-to-invoice matcher uses identity and reference rules only. Ambiguous threads are escalated for review instead of being matched by similarity.
- **Nine pre-approval checks** — a reminder draft can't be approved while the invoice is disputed, already paid, missing evidence, or carries an amount or reference that the evidence doesn't support.
- **Two roles, one write path** — Analysts submit and Managers approve, switched from the top bar. Every state change goes through `src/domain/commands.ts` and commits together with its audit event in one IndexedDB transaction.
- **Simulated send only** — an approved reminder is marked `sent_simulated`. No email ever leaves the app.
- **Honest eval suite** — `pnpm eval` measures six gates on a seed set and two held-out sets and publishes the misses (see [Eval results](#eval-results)).
- **Offline-capable PWA** — a service worker precaches the seed files and the app shell, and every data-backed view has loading, empty, error and working states.

## Getting started
> **Prerequisites:** Node.js **20.9 or newer** (the floor set by Next.js 16.4; developed on Node 26) and **pnpm 11** (the repo pins `pnpm@11.25.0` via `packageManager`, so `corepack enable` picks it up). The repo has no `.nvmrc` and no `engines` field of its own.

One command, no key and no `.env` file:

```bash
pnpm install && pnpm dev
```

Served at **http://localhost:3000**. Use `pnpm dev --port 3113` (or any free port) if 3000 is taken.

The first visit seeds your browser's IndexedDB from the synthetic files in `public/seed/`. **Settings → Reset** re-seeds it.

To run the production build instead:

```bash
pnpm build && pnpm start
```

## Demo mode and live mode
- **Demo mode (default)** — extraction, classification and drafting use the rule-based **simulated** provider (`src/ai/simulated.ts`). It is deterministic, makes no network calls and costs nothing. The top bar badge reads **Simulated LLM**. The public demo is demo mode only.
- **Live mode (local only, opt-in)** — a server-only Claude provider behind `/api/llm/extract` and `/api/llm/draft` (`src/server/llm.ts`). Both routes return `503 live_mode_disabled` unless **both** of these are set on the server:
  - `ANTHROPIC_API_KEY` — your own key, in `.env.local` (git-ignored) for `pnpm dev`, or exported in your shell for `pnpm eval:live`. Never commit it. It is read server-side only and never exposed through a `NEXT_PUBLIC_*` variable.
  - `VERILANE_LIVE_LLM=1`
  - Optional: `VERILANE_LLM_MODEL` overrides the model (default `claude-opus-5-5`).

  `pnpm check:secrets` scans the built client bundle and fails if any `ANTHROPIC` string leaks into it.

**Limits of live mode, stated plainly:**
- **The live path has not been exercised with a real API key yet.** It is covered by unit tests with the SDK stubbed, and nothing more.
- **No UI triggers it yet.** The live provider isn't wired into any screen, so enabling it changes only the status badge and the API routes.
- **`pnpm eval:live --yes` is the only live entry point.** It runs the held-out emails through Claude, writes `eval/report.live.json` and prints a rough cost estimate. It spends real money, refuses to run without `--yes`, and is reported but never gated.

## Trust boundary: read this before relying on it
Verilane is a no-login portfolio demo, and **the browser is the trust boundary** (decision S14, [Solution PRD §8](./Solution-PRD.md#8-known-tradeoffs-honest)).
- **Roles are not security.** The Analyst/Manager permissions and the approval gate run in client-side code. They live in pure, tested domain functions, but anyone with devtools can bypass them.
- **The audit log is per browser and not tamper-proof.** It records everything done in *your* browser's IndexedDB. It is not a shared or tamper-evident ledger: other visitors can't see it, clearing site data erases it, and devtools can edit it.
- **Invariants are enforced as close to the data as this design allows** — one command path, Zod at every boundary, Dexie unique indexes and one transaction per command. There are no server-side constraints, because there is no server-side state.
- **A real pilot would move commands server-side** behind real authentication and a database. The domain engine (`src/domain/**`, which imports nothing from React, Next.js, Dexie or the DOM) is built to move unchanged.

## Synthetic data
Every customer, invoice, payment and email in `public/seed/` and `eval/` is **synthetic**. There are no real customers, people, companies or money, and no real email is ever sent. Amounts are in Indian rupees, stored as integer paise.

## Eval results
`pnpm eval` runs six gated metrics offline (simulated provider, frozen clock, `fetch` stubbed to throw) over three sets: the 25-thread **seed** set, the 30-thread **held-out** set (inspected on 2026-11-01, so no longer blind), and a fresh blind 30-thread **held-out v2** set. The full report, including per-class tables and fault injection, is in [`eval/report.md`](./eval/report.md) and on the **Settings → Eval** page.

| Gate | Threshold | Seed | Held-out | Held-out v2 |
| --- | --- | --- | --- | --- |
| Amount exact match | 100% | PASS 17/17 | PASS 16/16 | **FAIL** 16/18 (88.9%) |
| Invoice number exact match | 100% | PASS 24/24 | PASS 25/25 | **FAIL** 25/26 (96.2%) |
| Unsupported financial claims | 0 | PASS 0 | PASS 0 | PASS 0 |
| Unambiguous matching | 100% | PASS 23/23 | **FAIL** 21/23 (91.3%) | **FAIL** 20/23 (87.0%) |
| Dispute recall | ≥ 95% | PASS 10/10 | **FAIL** 4/9 (44.4%) | **FAIL** 4/9 (44.4%) |
| Approval enforcement | 100% | PASS 40/40 | **FAIL** 54/62 (87.1%) | **FAIL** 42/58 (72.4%) |

**Known limitation (TC-066): the held-out gates fail.** Everything passes on the seed set, but **8 gates miss on the held-out sets** (3 on held-out, 5 on held-out v2). The cause is the rule-based classifier: its phrase lists don't generalise far beyond the seed wording. Email-class exact match, which is reported but not gated, is 25/25 on seed and only **16/30 (53.3%)** on held-out and **15/30 (50.0%)** on held-out v2. Missed disputes and misclassified emails then drag down matching and approval enforcement.

What still holds:
- **Unsupported financial claims stay at 0** on every set.
- **Fault injection is clean:** 100% of malformed, hallucinated or refused provider outputs are rejected, and 0 of 218 approval attempts become approvable.
- **No false blocks:** 0 allowed approvals were wrongly blocked.

The thresholds and labels have **not** been relaxed to make the run pass. Because a gate misses, **`pnpm eval` exits non-zero, and so does `pnpm test:all`**, which stops at its eval step. The expected fix is the live Claude provider, which has not yet been run with a real key (see [Demo mode and live mode](#demo-mode-and-live-mode)).

## How it works
- **Pure domain core** — `src/domain/**` holds money (integer paise), the clock, ingest, extraction, classification, matching, priority, evidence, the nine checks and the command layer. An ESLint rule bans React, Next.js, Dexie and DOM imports there.
- **Browser storage** — seed CSV/JSON → Zod-validated ingest → Dexie (IndexedDB) → `useLiveQuery` hooks → App Router views. Routes prerender statically; all data access is client-side, so nothing reads IndexedDB during SSR. If storage is unavailable (private mode, quota), the app falls back to in-memory state and shows a "Changes won't survive reload" banner.
- **Provider interface** — `src/ai/provider.ts` returns `Result<Valid, Rejected>`. Simulated, fault-injecting (eval only) and live providers all pass through the same validator and evidence cross-check before anything can reach an approvable draft.
- **Data in and out** — Settings imports CSVs (the whole file is rejected on any schema error, with row-level messages) and exports CSVs, including the audit log. Imports, rejected imports and resets are written to the audit log.

## Development
```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest unit project
pnpm perf        # recompute() budget (TC-084), its own vitest project
pnpm eval        # eval gates; currently exits non-zero (TC-066, see above)
pnpm build       # production build
pnpm check:secrets     # no ANTHROPIC string in .next/static (run after build)
pnpm check:e2e-hooks   # test hooks are compiled out of the plain build
pnpm route-budget      # each route's First Load JS ≤ 300 KB gzip
```

- **Typecheck on a fresh clone** — `src/app/layout.tsx` uses Next's generated `LayoutProps` type, so `pnpm typecheck` fails with `Cannot find name 'LayoutProps'` until Next has generated its types. Run `pnpm exec next typegen` once (or `pnpm dev` / `pnpm build`) first.
- **Timeouts** — `vitest.config.ts` gives the unit project a 30 s test and hook timeout, and the eval project a 60 s hook timeout (twice its 30 s run budget), so a loaded machine slows the run down instead of failing it. The config explains each number.
- **`eval/report.json` and `eval/report.md` only change when a result does.** Both files leave out the run's timestamp and duration; `pnpm eval` prints them to the console instead.

### End-to-end tests (Playwright)
E2E runs against a **production build compiled with test hooks**, so `build:e2e` must come first:

```bash
pnpm build:e2e && pnpm e2e --workers=1
```

- **Use `--workers=1`.** Parallel workers have proven flaky on the development machine; every recorded green e2e run used a single worker.
- **Port** — Playwright starts `pnpm start` on port 3100 and will reuse a server that's already running there. Set `E2E_PORT` to use another port, e.g. `E2E_PORT=3113 pnpm e2e --workers=1`.
- **Browsers and temp files** — by default both stay inside the repo, under `node_modules/.cache/playwright` (gitignored, on the repo's own disk). `playwright.config.ts` sets this, so nothing lands in the OS browser cache or temp dir. On a fresh checkout, install Chromium there once:

  ```bash
  pnpm e2e:install
  ```

  Two overrides, both optional: `PLAYWRIGHT_BROWSERS_PATH` (an existing value is kept, e.g. to share one browser install across worktrees; export it in a file non-interactive shells read, such as `~/.zshenv`) and `E2E_TMPDIR` (where browser profiles and artifacts go). Set them the same way for `pnpm e2e:install` and `pnpm e2e`.

### Everything at once
```bash
pnpm test:all
```

This runs typecheck → lint → unit → perf → eval → build → check:secrets → check:e2e-hooks → route-budget → build:e2e → e2e. **It currently stops at `pnpm eval` at the latest**, because of the known held-out failures above, so to check the later steps, run them one by one. Its `e2e` step runs with `--workers=1`.

## Docs
- [Product Requirements](./docs/Product-Requirements.md) — requirement traceability
- [Architecture](./docs/Architecture.md) — components, priority rules with worked examples
- [Data Model](./docs/Data-Model.md) — entities, fields and provenance
- [AI Evaluation](./docs/AI-Evaluation.md) — dataset, labelling protocol, metrics and gates
- [Design System](./docs/Design-System.md) — tokens, type, components
- [Solution PRD](./Solution-PRD.md) and [decisions log](./decisions.md) — why it's built this way

## Credits & license
Built with Next.js, React, Dexie, Zod, Tailwind CSS, shadcn/ui, Radix, TanStack Table, Recharts, Lucide and the Anthropic TypeScript SDK. The repository does not include a license file, so no license is granted.
