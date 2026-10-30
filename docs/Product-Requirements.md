# Verilane — Product Requirements (traceability)

> Stage 2 artifact. The **canonical** requirements are in [`../Discovery-PRD.md`](../Discovery-PRD.md) (S7). This file does not restate them; it maps each one to where it is built and how it is proven. Solution-level requirements SR1–SR12 and NFR1–NFR8 are in [`../Solution-PRD.md`](../Solution-PRD.md).

## 1. Information architecture (brief §IA)

Sidebar: **Home · Queue · Disputes · Payments · Drafts · Audit log · Settings** (consolidated at the Stage 3 freeze, D3; mapping from the brief's IA in [`../Design.md §5`](../Design.md)).
- Invoices fold into Queue; Email Conversations fold into each invoice's Investigation (Communication evidence table); Review & Approvals → Drafts; Data Sources → an Import data action on Queue + Settings; Payments is new (matcher review queue, S12).

Global: DEMO DATA indicator · role switcher (Analyst / Manager) · theme toggle · Simulated / Live LLM mode label · Reset Demo Data (in Settings, with a confirmation dialog).

## 2. Traceability

| Req | Built in | Proven by |
|---|---|---|
| F1 Home (overview) | `app/home`, Recharts, `domain/priority` | unit (aggregates) + e2e filters |
| F2 Queue | `app/queue`, TanStack Table | e2e search/sort/filter/page/navigate |
| F3 Explainable priority | `domain/priority` (priority.v1) | unit per gate and band + worked examples A–E |
| F4 Investigation + evidence | `app/invoices/[id]`, `domain/evidence` | e2e: evidence → source row/email (trust walk) |
| F5 Email intelligence | `domain/extract`, `match`, `classify`, providers | eval §3 metrics |
| F6 Disputes | `app/disputes`, `transitions` (dispute) | unit transitions + e2e Manager resolve |
| F7 Drafting + 9 checks + simulated send | `domain/draft`, `validate`, `commands` | eval drafts set + unit per check + e2e |
| F8 Drafts (review & approvals) | `app/drafts`, ReviewItem | e2e per item kind |
| F9 Audit log | `commands` → `audit` | unit: every command emits one event; e2e trust walk |
| F10 CSV import/export, Reset, DEMO DATA | `store/`, Queue import action, `app/settings` | unit ingest + e2e import invalid/valid, reset |
| F11 Light/dark theme | Stage 3 tokens | axe both themes |
| NF1 One command, no key | SR1 | CI: fresh clone `pnpm i && pnpm build` with empty env |
| NF2 Reproducible | SR3, SR4, seed committed | eval determinism check |
| NF3 Responsive | Stage 3 | Playwright at 1440/1280/768/390, no horizontal scroll |
| NF4 Accessible | Stage 3 | axe + keyboard e2e |
| NF5 Screen states | every data view | e2e: loading / empty / error / working per view |
| NF6 No dead controls | every view | e2e control inventory per route |
| NF7 Public demo, no secrets | S10, NFR8 | build check + Stage 10 OG verification |
| A1 Determinism boundary | SR2 lint rule | ESLint + unit |
| A2 Schema-validated outputs | `ai/provider` Result type | fault-injection eval |
| A3 Provenance | `domain/evidence` | eval unsupported-claim metric |
| A4 Demo / live labelled | SR5, SR6 | e2e label present; route 503 when disabled |
| A5 Explicit unknown | gates G2/G3, match outcomes | FS tests |
| A6 No confidence-as-proof | no confidence UI; validation and eval shown | design review (Stage 7) |
| T1 No invented facts | check 9 | eval |
| T2 Approval before send | `commands`, `permissions` | approval-enforcement metric |
| T3 Disputes/claims block | G4/G5, checks 6/7 | unit + e2e (trust walk, disputed invoice) |
| T4 No unsupported claim in approved message | check 9 at approve time | eval drafts set |
| T5 Synthetic data | seed generator | review + coverage test |
| T6 Audit everything | `commands` | unit |
| FS1–FS13 | see Architecture §5–§8 | one named test each (`fs01…fs13`) |

## 3. Role × action summary (S4)

| Action | Analyst | Manager |
|---|---|---|
| Investigate, view evidence | ✓ | ✓ |
| Generate / regenerate / edit / submit draft | ✓ | ✓ |
| Approve standard reminder (≤ ₹5,00,000, no escalation) | ✓ | ✓ |
| Approve reminder > ₹5,00,000, ambiguous match, conflicting payment info | — (disabled, reason shown) | ✓ |
| Flag dispute / propose resolution | ✓ | ✓ |
| Resolve / reject dispute | — | ✓ |
| Simulated send (after approval) | ✓ | ✓ |
| Team workload view | — | ✓ |
| Import CSV / Reset demo | ✓ | ✓ |

## 4. Deferred to Stage 3

> Resolved at the Stage 3 freeze (2026-10-30): see [`../Design.md`](../Design.md) and [`Design-System.md`](Design-System.md). The OG image remains open until before Stage 10.

Design system and tokens (emerald palette from the brief), dark-mode logo treatment (the supplied near-black wordmark must stay unaltered: no recolour, crop or stretch; the treatment is a surface behind it), screen layouts and the four screen states, OG image.
