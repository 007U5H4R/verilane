# Verilane — Solution PRD

> Stage 2 · Solution Design · Campfire TASK-2 · status: **approved 2026-10-30**
> Builds on the approved [`Discovery-PRD.md`](Discovery-PRD.md) (canonical, S7). Decisions S8–S14 in [`decisions.md`](decisions.md).
> Detail docs: [Architecture](docs/Architecture.md) · [Data Model](docs/Data-Model.md) · [AI Evaluation](docs/AI-Evaluation.md) · [Product Requirements](docs/Product-Requirements.md)

## 1. Chosen approach (one paragraph)

Verilane is a **single Next.js app with a pure-TypeScript domain engine at its core**. Every fact a finance manager must trust is computed by deterministic, unit-tested code: outstanding amounts, days overdue, matching, priority, state transitions, permissions and the nine pre-approval checks. The UI, the eval suite and the optional live-LLM route all call that same engine. State lives **in the visitor's browser** (IndexedDB), seeded from synthetic CSVs that ship in the repo, so the public demo costs **₹0**: no database, no account, no API spend. AI-shaped work (extraction, classification, drafting) goes through a **provider interface**:
- **Simulated** (the default): a rule-based extractor plus template drafting. Deterministic and reproducible.
- **Live Claude** (optional, local only): structured outputs validated by Zod. It is enabled only when `ANTHROPIC_API_KEY` is set in `.env.local`.

Every output from either provider passes through the **same** schema validation, strict matching and provenance checks before it can reach an approved message.

## 2. Key decisions

| ID | Decision | Why |
|---|---|---|
| S8 | Next.js (App Router) + React + TS + Tailwind + shadcn/ui + Lucide + Recharts + TanStack Table + Zod; pnpm; Vitest; Playwright | Brief's preferred stack; no reason to deviate |
| S9 | **Zero-cost storage**: seed CSVs in repo → IndexedDB per visitor (Dexie); Reset = re-seed | User constraint: spend nothing. Works identically locally and on Vercel Hobby |
| S10 | Live Claude is **local-only and optional**; public deploy is demo-mode only, no key, no API route active | Zero spend; no secret on a public surface; S5 gate unaffected |
| S11 | Deterministic priority engine: gates → score → band, versioned config, frozen demo clock | Explainable, reproducible (NF2), F3 |
| S12 | Rule-based multi-signal extractor + strict identity-and-reference matcher, no fuzzy matching | A1, A5, FS3/FS4, "not keyword-only" |
| S13 | Vitest eval harness against independently authored labels + held-out set + fault-injection provider | §8.2 targets measured honestly, not self-graded |
| S14 | Pure domain core enforces invariants; IndexedDB has unique indexes; the client is the trust boundary in this demo (disclosed) | Data invariants as close to data as the architecture allows |

## 3. Scope of this solution (smallest useful increment)

**In:** all of Discovery F1–F11, NF1–NF7, A1–A6, T1–T6, FS1–FS13 (traceability in [Product Requirements](docs/Product-Requirements.md)).

**Out (beyond Discovery §9 out-of-scope):**
- Server-side persistence, shared state between visitors, or any hosted database
- Live LLM on the public deploy (it can be enabled later by adding an env var and a rate limit, which is a separate decision)
- Real-time clock for overdue maths in demo mode (a frozen "as-of" date is used; an override is available in Settings)
- Editing priority weights in the UI (read-only display; changes go through code and a config version bump)
- Fuzzy or ML-based matching, embeddings, vector search
- Background jobs, queues, cron, webhooks

## 4. Requirements added by the solution

| ID | Requirement |
|---|---|
| SR1 | `pnpm dev` runs the full app with zero env vars; `pnpm build && pnpm start` works identically |
| SR2 | Domain engine (`src/domain/**`) has **no imports** from React, Next.js, Dexie or the browser. This is enforced by an ESLint `no-restricted-imports` rule |
| SR3 | Demo clock: `AS_OF_DATE = 2026-10-30` (constant in seed manifest). All "today" maths use it. Settings shows it, and it can be overridden per browser |
| SR4 | Priority config is a versioned constant (`priority.v1`). Every priority result records the config version it was computed with |
| SR5 | Every AI output is persisted with `mode: "simulated" \| "live"`, `provider`, `model` (live only) and `schemaVersion`, and is labelled in the UI |
| SR6 | `/api/llm/*` route handlers return `503 live_mode_disabled` unless `ANTHROPIC_API_KEY` is set **and** `VERILANE_LIVE_LLM=1`. The key is read server-side only and never exposed through `NEXT_PUBLIC_*` |
| SR7 | Every state-changing action goes through `domain/commands.ts`. The command checks role permission, applies the transition, and returns the audit event; no UI code writes state directly |
| SR8 | Writes to IndexedDB happen in one Dexie transaction per command (state change + audit event commit together or not at all) |
| SR9 | Storage-unavailable path (private mode, quota, blocked): app falls back to in-memory state, shows a persistent banner "Changes won't survive reload", and logs to console. No silent failure |
| SR10 | `pnpm eval` runs the eval suite, prints the metrics table and writes `eval/report.json` + `eval/report.md`; exits non-zero if any §8.2 gate misses |
| SR11 | CSV import validates with Zod, rejects the whole file on schema error with row-level messages, and records an audit event either way |
| SR12 | Playwright, its browsers and all caches write to `/Volumes/E Drive` (machine rule) |

## 5. Success criteria (measurable)

1. **Trust walk (S6):** a Playwright e2e test drives the full walk (queue → evidence → draft → validate → approve → simulated send → disputed invoice blocked → audit log) in a fresh browser context, and it passes on the production build.
2. **AI gate (S5, Discovery §8.2):** `pnpm eval` in demo mode reports amount exact-match 100%, invoice-number exact-match 100%, unsupported claims 0, unambiguous matching 100%, dispute recall ≥95%, approval enforcement 100%. This applies to the seed set **and** the held-out set.
3. **Guardrails under fault injection:** with the fault-injecting provider, 100% of malformed or hallucinated outputs are rejected and never reach an approvable draft.
4. **Determinism:** two consecutive `pnpm eval` runs produce byte-identical `report.json`, apart from the timestamp field.
5. **Zero spend:** the deployed demo has no env secrets set in Vercel, no external service calls (verified via the network panel during the trust walk), and runs on Vercel Hobby.
6. **Failure scenarios:** each of FS1–FS13 has at least one named automated test that passes.

## 6. Acceptance criteria (Stage 2 → build)

- [ ] Each Discovery requirement maps to a component or a test ([Product Requirements](docs/Product-Requirements.md) §2)
- [ ] Priority rules are fully specified with worked examples ([Architecture](docs/Architecture.md) §5)
- [ ] Data model covers every field the brief's screens and provenance require ([Data Model](docs/Data-Model.md))
- [ ] Eval dataset, labelling protocol, metrics and gates are defined ([AI Evaluation](docs/AI-Evaluation.md))
- [ ] Decisions S8–S14 are logged

## 7. Non-functional requirements (measurable)

| ID | NFR | Budget |
|---|---|---|
| NFR1 | First load of the Collection Queue (production build, desktop, cold cache) | LCP ≤ 2.5 s; JS for route ≤ 300 KB gzip |
| NFR2 | Re-prioritising all 50 invoices + processing 25 emails in demo mode | ≤ 200 ms in the browser |
| NFR3 | Queue interactions (sort/filter/search/page) | INP ≤ 200 ms |
| NFR4 | `pnpm eval` (demo mode) | ≤ 30 s, no network |
| NFR5 | Accessibility | axe: 0 serious/critical violations on every route, both themes |
| NFR6 | Responsive | no horizontal page scroll at 1440/1280/768/390 px |
| NFR7 | Cost | ₹0 per month: Vercel Hobby, no paid services, no API calls in the deployed demo |
| NFR8 | Secrets | no secret in repo, client bundle, or logs. Enforced by `.gitignore` of `.env*.local` and a build-time check that no `ANTHROPIC` string appears in `.next/static` |

## 8. Known tradeoffs (honest)

- **The browser is the trust boundary.** Permissions (Analyst vs Manager) and the approval gate run in client-side code. That suits a no-auth portfolio demo (S3), and the rules live in pure, tested domain functions, but a determined user could bypass them via devtools. A pilot would move commands server-side behind real auth and a database, and the domain engine is designed to move unchanged.
- **Audit log is per browser.** It is the full record for that visitor's session, not a tamper-evident shared ledger.
- **No database constraints in the SQL sense.** Invariants are enforced by the domain engine (one write path, SR7), Zod at every boundary, Dexie unique indexes, and one transaction per command (SR8).
- **Frozen clock.** Overdue maths is reproducible but does not "age" in real time unless the visitor overrides the as-of date.
- **Simulated extraction is rule-based.** It is a fair stand-in for evaluating the *guardrails* (AS6). It is not a claim about LLM extraction quality; live-mode results are reported separately.
