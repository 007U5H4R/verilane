# Verilane — Architecture

> Stage 2 artifact. Canonical requirements: [`../Discovery-PRD.md`](../Discovery-PRD.md). Approach: [`../Solution-PRD.md`](../Solution-PRD.md). Decisions S8–S14 in [`../decisions.md`](../decisions.md).

## 1. System shape

```
┌──────────────────────────── Browser (per visitor) ─────────────────────────────┐
│  Next.js UI (App Router, client components for data views)                     │
│     │  reads via hooks           │ writes only via commands                     │
│     ▼                            ▼                                              │
│  store/ (Dexie · IndexedDB) ◄── domain/commands.ts ── permission check          │
│     ▲   one txn per command:       │                   state transition         │
│     │   state + audit event        │                   audit event              │
│     │                              ▼                                            │
│     │                    domain/ (pure TS, no I/O)                              │
│     │   ingest · normalise · extract · match · classify · priority ·            │
│     │   evidence · draft · validate(9 checks) · permissions · audit             │
│     │                              │                                            │
│     │                    ai/provider.ts ── SimulatedProvider (default)          │
│     │                              └───── LiveProvider ──fetch──┐               │
└─────┼──────────────────────────────────────────────────────────┼───────────────┘
      │ seed (static)                                             │ only if enabled
 public/seed/*.csv + manifest.json                 /api/llm/* route handler (server)
                                                    @anthropic-ai/sdk · key from env
                                                    returns 503 when disabled
```

There is no database server, queue, vector store or background worker (Discovery §9 out-of-scope, brief §9).

## 2. Stack (S8)

| Concern | Choice | Note |
|---|---|---|
| Framework | Next.js (App Router), React, TypeScript strict | One deployable; route handlers only for optional live LLM |
| UI | Tailwind CSS, shadcn/ui, Lucide | Tokens defined in Stage 3 `Design.md` |
| Charts / tables | Recharts, TanStack Table | Home charts; Queue |
| Validation | Zod | Every boundary: CSV rows, provider output, commands, import |
| Persistence | Dexie over IndexedDB (S9) | Free and per visitor; unique indexes and transactions |
| CSV | Papa Parse | Import and export |
| LLM (optional) | `@anthropic-ai/sdk`, structured outputs | Server-side only (S10) |
| Package manager | pnpm (store on E Drive) | |
| Tests | Vitest (unit, domain, evals), Playwright (e2e, axe) | Playwright temp and browsers on E Drive |
| Hosting | Vercel Hobby | Static and edge-friendly; no env secrets |

## 3. Module layout

```
src/
  domain/            # pure TS — no React/Next/Dexie/DOM imports (lint-enforced, SR2)
    schema.ts        # Zod schemas = single source of entity types
    money.ts         # integer paise arithmetic, INR formatting
    clock.ts         # AS_OF_DATE, daysOverdue()
    ingest.ts        # CSV rows → validated, normalised entities
    extract.ts       # rule-based email signal extraction (SimulatedProvider core)
    match.ts         # strict customer + invoice matcher
    classify.ts      # signals → one of 7 email classes / 7 dispute types
    priority.ts      # gates → score → band (config priority.v1)
    evidence.ts      # claim → provenance record
    draft.ts         # template composer over verified facts
    validate.ts      # the nine pre-approval checks
    permissions.ts   # role × action matrix (S4)
    transitions.ts   # allowed state machines (invoice, dispute, draft, review item)
    commands.ts      # the only write path: permission → transition → audit event
    result.ts        # domain-local Result<T,E>/Rejected (TASK-79.3, EXE130) — never ai/provider.ts's
    recommend.ts     # Recommend agent: verified facts only, traced via evidence.ts (TASK-79.3, F15/R5)
    policy.ts        # Policy agent: pure gated rule table, append-only PolicyDecision (TASK-79.3, R5–R7)
  ai/
    provider.ts      # interface: extract(email, ctx) / draft(facts) → validated output
    simulated.ts     # wraps domain/extract + domain/draft
    live.ts          # client: POST /api/llm/*; output re-validated client-side
    faulty.ts        # test-only fault-injection provider (S13)
  store/             # Dexie DB, seed loader, reset, in-memory fallback (SR9)
  app/               # routes: home, queue, invoices/[id], disputes, payments,
                     #         drafts, audit, settings, api/llm/*  (IA per D3)
  components/
eval/                # labelled datasets, runner, report writer
public/seed/         # invoices.csv, customers.csv, payments.csv, emails.json, manifest.json
public/brand/        # verilane-logo.png (unaltered copy of the supplied file)
```

## 4. Pipeline (brief §8)

| Step | Module | Deterministic? | Output on uncertainty |
|---|---|---|---|
| CSV ingestion + schema validation | `ingest` | yes | Row rejected with message; import aborted on any error (SR11) |
| Normalisation | `ingest`, `money`, `clock` | yes | Missing field → explicit `null` plus a `dataIssues[]` entry |
| Email extraction | provider → `extract` | demo: yes / live: no | Field `unknown` with reason |
| Customer + invoice matching | `match` | **always yes** | `ambiguous` / `unresolved` → review item |
| Dispute classification | provider → `classify` | demo: yes / live: no | `unknown` class → review item |
| Priority | `priority` | **always yes** | `needs_review` band with reason |
| Evidence mapping | `evidence` | yes | Claim marked `unsupported` |
| Draft generation | provider → `draft` | demo: yes / live: no | n/a, because validation follows |
| Validation (9 checks) | `validate` | **always yes** | Approval blocked with per-check reason |
| Human approval | `commands` + `permissions` | yes | Disallowed action shown disabled with reason (FS13) |
| Audit | `commands` | yes | Every command emits exactly one event |

Per A1, financial maths, matching, priority, transitions, permissions and send restrictions never pass through a provider.

### 4.1 Exception review extension: Recommend → Policy → Execute (TASK-79.3, brief §TKT-75.03)

Three further agents extend the same pipeline for an open `Exception` review item. Like `match`/`priority`/`permissions`, Recommend and Policy are pure domain logic — `domain/recommend.ts`, `domain/policy.ts` — and per A1 never pass through `ai/provider.ts`; the only AI-provider seam remains email extraction/classification/draft above.

| Step | Module | Deterministic? | Output on uncertainty |
|---|---|---|---|
| Recommend | `domain/recommend.ts` (`recommendForException`) | yes | No candidate → `Rejected("cannot recommend", reason)` (F13); a claim without a source record never reaches Policy (R5) |
| Policy | `domain/policy.ts` (`decidePolicyVerdict`, `evaluatePolicyForException`) | yes — pure gated rule table over `(kind, amount, confidence, config_version)` | Out-of-enum/malformed verdict rejected via `Result<T,E>`, never persisted |
| Execute | *(out of scope — TASK-79.4)* | — | — |

Recommend runs lazily inside `useException()`'s live query (pure computation, safe on every render, no I/O). Policy's write runs once per exception, lazily, only on an actual page view of `/exceptions/[id]` (`usePolicyEvaluationTrigger`) — never from `loader.ts`'s `recompute()`, which also fires during seeding and every store test's setup (EXE130). Policy's verdict is actor-independent (`kind`/`amount`/`confidence` only, no role); `permissions.ts`'s `can()` separately still gates who may act on the exception. `PolicyDecision` rows are append-only and versioned by `config_version` — re-evaluation appends a new row, never an update (R7); when a later Policy verdict disagrees with the Recommend agent's suggestion, Policy's verdict governs and the conflict is shown and logged (FS22).

## 5. Priority engine (S11), config `priority.v1`

Inputs come only from ledger facts and **matched, validated** email signals.

### 5.1 Gates (evaluated in order; first hit decides the band and skips scoring)

| # | Condition | Result | Recommended action |
|---|---|---|---|
| G1 | status `paid` / `written_off` / outstanding = 0 | `closed` | None |
| G2 | status unknown/unparseable (FS10) | `needs_review` | Confirm status with ledger owner |
| G3 | invoice number, due date or outstanding amount missing (FS1, FS2) | `needs_review` | Complete missing field |
| G4 | dispute status ∈ {new, under_review, awaiting_customer} (T3, FS6) | `disputed` (excluded from reminder path) | Resolve dispute (Manager) |
| G5 | matched payment-confirmation claim, or ledger/email payment conflict (FS5, FS7) | `hold_reconcile` | Reconcile payment |
| G6 | due date > AS_OF_DATE | `not_due` | Monitor |
| G7 | active payment commitment with promised date ≥ AS_OF_DATE − 3 days | `on_hold_promised` | Follow up after promised date |

### 5.2 Score (when no gate fires; max 100)

| Factor | Rule | Points |
|---|---|---|
| Days overdue | 1–15 / 16–30 / 31–60 / 61+ | 10 / 20 / 35 / 45 |
| Outstanding (verified balance; partial payments netted, FS8) | < ₹50,000 / ₹50,000–1,99,999 / ₹2,00,000–4,99,999 / ≥ ₹5,00,000 | 5 / 12 / 20 / 30 |
| Customer behaviour (from payment history) | avg days late on paid invoices: ≤ 5 / 6–20 / 21–45 / > 45 / no history | 0 / 5 / 10 / 15 / 5 |
| Broken promise | commitment date passed by > 3 days with no payment | +10 |

**Bands:** High ≥ 55 · Medium 30–54 · Low < 30.
**Tie-break (queue order):** score desc → days overdue desc → outstanding desc → invoice number asc (total and stable).

### 5.3 Reason string

Format: top factors by points, each linking to its source record. Example: *"High (65): 47 days overdue [invoices.csv row 12 · due_date] · ₹3,40,000 outstanding [row 12 · outstanding_amount] · promise of 2026-10-20 broken [email E-014]"*.

### 5.4 Worked examples

| Invoice | Facts | Result |
|---|---|---|
| A | 47 days overdue, ₹3,40,000, avg 12 days late, broken promise | 35 + 20 + 5 + 10 = **70 → High** |
| B | 10 days overdue, ₹40,000, avg 2 days late | 10 + 5 + 0 = **15 → Low** |
| C | 90 days overdue, ₹6,00,000, open "incorrect amount" dispute | G4 → **Disputed**, not scored |
| D | 20 days overdue, email says "paid yesterday", ledger unpaid | G5 → **Hold – reconcile** |
| E | due date missing | G3 → **Needs review** |

Weights are a starting point, consistent with AS2. They live in one constant and appear read-only in Settings; changing them means a version bump (`priority.v2`) and re-running the eval and unit fixtures.

## 6. Extraction and matching (S12)

### 6.1 Simulated extractor (`domain/extract.ts`)
- **Typed tokens by regex:** invoice refs (`INV-\d{4}` and declared variants), INR amounts (`₹`, `Rs.`, `INR`, lakh grouping `3,40,000`, and "3.4 lakh"), dates (ISO, `30 Oct 2026`, `30/10/2026` read as DD/MM per India locale, plus relative phrases resolved against the email's sent date).
- **Intent signals by phrase pattern families**, each a set of patterns with **negation and hedging guards** (e.g. "we have *not* paid", "will pay *if*"). An email class needs a **signal plus a supporting token**: a commitment needs a future date, a confirmation needs a past-tense payment verb plus a reference or amount, and a dispute needs a dispute verb plus an object such as an amount, PO or period. A single keyword never decides the class (brief: "not keyword-only").
- **Precedence when several signals fire:** dispute/duplicate > payment confirmation > commitment > delay > enquiry. All fired signals are kept as secondary signals and shown to the reviewer.
- **Output** has the same Zod schema as live mode, so both modes go through one validation path.

### 6.2 Strict matcher (`domain/match.ts`)
1. **Customer identity:** sender email domain or address ∈ customer contacts. A name mention alone is never enough. No match → `customer_unresolved`.
2. **Invoice reference:** exact normalised invoice number (uppercased, whitespace and dash normalised; *no* edit distance) **belonging to that customer**.
3. Outcomes:
   - `matched`: identity and reference agree on exactly one invoice
   - `ambiguous`: more than one candidate, or a near-miss such as INV-1042 vs INV-1024 found only by transposition (detected and **flagged**, never accepted; FS3)
   - `customer_only`: customer matched but no reference, with several open invoices (FS4)
   - `unresolved`: anything else
4. Every outcome except `matched` creates a review item (F8). An amount mentioned in an email never overrides the ledger amount; a mismatch becomes a reconciliation signal (FS5).

### 6.3 Live provider (optional, S10)
- Route handlers `/api/llm/extract` and `/api/llm/draft` call `client.messages.parse({ model, max_tokens, messages, output_config: { format: zodOutputFormat(Schema) } })` from `@anthropic-ai/sdk` (`zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`).
- Model from `VERILANE_LLM_MODEL` (default `claude-opus-5-5`); effort is set explicitly; `stop_reason === "refusal"` → treated as invalid output (FS11).
- The model receives only the email text and the candidate invoice **numbers**. It never receives authority to compute amounts. Its output is re-validated client-side, and **matching, priority and validation still run deterministically** on top of it.
- Disabled → `503 live_mode_disabled`; the UI then stays in Simulated mode with a visible label.

## 7. Drafting and the nine checks

- **Draft composition (demo):** a template filled only from `VerifiedFact`s, each carrying a `claimId`. Live drafts must return `{ body, claims[] }`. Any number, date, invoice reference or customer name found in the body that is not covered by a claim backed by evidence is an **unsupported claim**.
- **`validate.ts` checks** (all must pass; each failure has a human-readable reason):
  1. invoice exists
  2. customer matches the invoice's customer
  3. amount equals the verified outstanding balance (integer paise)
  4. currency is known
  5. due date is present
  6. no unresolved dispute
  7. no payment-confirmation claim
  8. not paid, closed or excluded
  9. every factual token is covered by a validated claim
- **Edits re-run all nine checks** (FS12). Approving above ₹5,00,000 or on an escalated item requires Manager (S4).
- **Simulated send:** status `sent_simulated` plus an audit event. There is no network call.

## 8. Permissions (S4)

`permissions.ts` exports `can(role, action, subject) → { allowed, reason }`. The UI renders disallowed controls as disabled with the reason, and `commands.ts` re-checks so a call cannot bypass the UI (FS13). The matrix is unit-tested exhaustively (role × action).

## 9. Failure and observability

| Failure | Behaviour | How you'd know |
|---|---|---|
| IndexedDB unavailable or quota exceeded | in-memory fallback, persistent banner (SR9) | banner + `console.error` |
| Seed fetch fails | error state with Retry (NF5) | error screen |
| CSV import invalid | file rejected, row errors listed, audit event | toast + import panel row errors + audit |
| Provider output invalid / refusal | rejected, `validation_failure` audit event, item `needs_review` (FS11) | Review inbox + audit |
| Live mode disabled | Simulated label persists; generate never errors | label |
| Domain invariant violated (bug) | command throws, transaction rolled back, error toast | toast + console + failing unit test is the scar |

## 10. Deploy (S3, S10)

- Vercel Hobby, production build, **no env vars set**. `/api/llm/*` responds 503.
- OG and Twitter tags plus a 1200×630 image (Stage 3 design, Stage 10 verification).
- Local live mode: `.env.local` with `ANTHROPIC_API_KEY` and `VERILANE_LIVE_LLM=1` (gitignored). Spend is the user's choice and is never required.
