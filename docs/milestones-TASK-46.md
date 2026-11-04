# TASK-46 — Milestones (Indian heritage background system)

> **Status:** **APPROVED (2026-11-02).** All 8 sign-off items as recommended (S25–S32 numbering). Campfire: TKT-46.01–.08 = TASK-46.1–46.8 (subtasks of TASK-46, deps per DAG).

> Stage 4 · Problem Breakdown · Campfire TASK-46 · 2026-11-02 · **DRAFT, at the gate (not approved)**
> Inputs (all approved 2026-11-02): [`Discovery-PRD-TASK-46.md`](Discovery-PRD-TASK-46.md), [`Solution-PRD-TASK-46.md`](Solution-PRD-TASK-46.md) (§9 fully signed off; risks R1–R10 in §15), [`Design-TASK-46.md`](Design-TASK-46.md) (§14 items 1–7 approved). Tickets: [`tickets-TASK-46.md`](tickets-TASK-46.md).
> Scope: ticket-scoped. The root `milestones.md` / `tickets.md` belong to TASK-1 and are not touched.
> IDs: milestones here are provisional `M-46.1`…`M-46.3` and tickets `TKT-46.01`…`TKT-46.08`, because the root `M-001…M-006` / `TKT-01…TKT-23` are taken and TASK-45 is planning concurrently. Stage 5 maps them to Campfire native IDs (see sign-off item 2).

## Sequence at a glance

```
               ┌──────────────── M-46.1 Foundation + tracer ────────────────┐
               │  TKT-46.01 branch + Design.md R2/R3 ──► TKT-46.02 TRACER   │
               └────────────────────────────────────────────┬───────────────┘
                                                            │ (R5 outcome: path A src/assets or B public/heritage)
            ┌───────────────────────────────────────────────┼────────────────────────────┐
            ▼                                               ▼                            │
  M-46.2 Behaviour on placeholder art                                                    │
  TKT-46.03 levels/responsive/forced-colors/print     TKT-46.05 encode script + image-budget gate
     │                    │                                 │
     ▼                    ▼                                 ▼
  TKT-46.04 idle preload  TKT-46.06 contrast/prominence  M-46.3  TKT-46.07 art generation (kie.ai, user-approved spend)
     │                    gate (SC1/SC2)                    │
     └────────────────────┴───────────────► TKT-46.08 final art swap-in + calibration + evidence ◄┘
```

Blocking edges (the DAG, authoritative copy in `tickets-TASK-46.md`):

| Ticket | Blocked by | Unblocks |
|---|---|---|
| TKT-46.01 | entry criterion E1 (green base commit) | 02 |
| TKT-46.02 | 01 | 03, 05 |
| TKT-46.03 | 02 | 04, 06 |
| TKT-46.04 | 03 | 08 |
| TKT-46.05 | 02 | 07 |
| TKT-46.06 | 03 | 08 |
| TKT-46.07 | 05, plus user approval of kie.ai spend | 08 |
| TKT-46.08 | 04, 06, 07 | Stage 7 / 8 |

Parallelism after the tracer: {03 → 04, 06} and {05 → 07} are independent lanes. 03 and 04 both edit the `/* TASK-46 heritage */` block in `globals.css`, so they run sequentially, not in parallel. The art lane (07) is gated by money and a human reviewer, not by code. It can start as soon as 05 lands, and it is the most likely critical path.

---

## M-46.1 · Foundation and tracer bullet
- **Objective:** kill R5 (and R7, plus the no-flash claim) with a throwaway placeholder, before any art is paid for or any behaviour is built on an unproven asset path.
- **Scope:** cut `task/46-heritage-bg` in its own worktree from a green commit. Apply the Design.md R2 then R3 text as the first commit. Mount `IndianHeritageBackground` in AppShell with a placeholder AVIF/WebP pair through `image-set()` and both theme selectors. Inspect the emitted CSS, headers and SW behaviour. Measure exposure on the three unmeasured detail routes.
- **Deliverables:** the branch with the R2/R3 commit; a placeholder heritage layer visible behind `/` in both themes on a production build; a written R5 verdict (path A or B) with the evidence (emitted CSS excerpt, response headers, SW cache listing).
- **Tickets:** TKT-46.01, TKT-46.02
- **Dependencies:** none inside TASK-46. **E1 (external):** a commit on `task/38-emerald-redesign` where `pnpm test:all` is green (PRD §9.13). HANDOFF records route-budget FAIL on 6 routes at `3145680`. Whether `f493a7b` ("drop @tanstack/react-table") is green is **unverified**. If no green commit exists, the user picks: wait for TASK-38, or branch from the latest commit and record the known-red gates as a baseline.
- **Entry:** Stage 4 approved, Stage 5 technical plan approved, E1 resolved.
- **Exit:** the R5 verdict is recorded as an execution decision. Both images resolve on a cold load in light, dark and system modes, and the first heritage request matches the theme (SC4 smoke). An open AccountMenu, AlertDialog and Tooltip paint above the art (R7). `test:all` is no worse than the E1 baseline.
- **DoD:** the common DoD in `tickets-TASK-46.md`. The verdict and its evidence are linked from HANDOFF.
- **Priority:** P1 · **Status:** Not started
- **Risks:** R5 (path rewrite), sub-risk **R5b** (new, see below), R7 (stacking), R6 (AppShell conflict with TASK-44/41), and E1 (no green base).

## M-46.2 · Behaviour on placeholder art
- **Objective:** make every behaviour and every gate real while the art is still a placeholder, so the final art drops into a finished, measured system.
- **Scope:** `heritageLevelFor()` and its unit tests; the route-level table (§4); mobile/tablet rules; forced-colors and print; the SC9 switch-off; the idle preload with the Save-Data skip; `scripts/encode-heritage.ts`; the `scripts/image-budget.ts` gate in `test:all`; the contrast and prominence screenshot gate (SC1/SC2) in both themes at three widths.
- **Deliverables:** the levels visible per route; `pnpm image-budget` and the contrast spec running in `test:all`; unit and e2e tests for F1–F7.
- **Tickets:** TKT-46.03, TKT-46.04, TKT-46.05, TKT-46.06
- **Dependencies:** M-46.1 (path A/B decides the asset paths that 05 and 06 read).
- **Entry:** M-46.1 exit met.
- **Exit:** F1, F4–F7 and SC3, SC5, SC6, SC9 pass on the placeholder. The SC1/SC2 gate runs green on the calibrated Stage 3 placeholder (Design §6.1: light-normal 89.3, light-reduced 92.4, dark-normal 13.3, dark-reduced 9.7), proving the gate can pass and can fail (a deliberately darkened fixture must make it go red).
- **DoD:** common DoD.
- **Priority:** P1 · **Status:** Not started
- **Risks:** R1 (light AA vs normal band; this is where the gate gets built), N2 (JS headroom: `/settings` at 291.7/300 KB), and the contrast tooling being net-new. No screenshot or contrast tests exist in `tests/e2e` today.

## M-46.3 · Final art and ship readiness
- **Objective:** generate, review, encode and swap in the real panoramas, then prove the whole feature against every success criterion on the real thing.
- **Scope:** kie.ai generation (3 variations per theme, up to 3 rounds, the §6.3 rubric, the user as cultural reviewer); encoding the chosen masters; the tint/L\* calibration per Design §6.1; the asset swap-in; and final evidence: SC1/SC2 on the finals, SC4 cold-load per mode, SC7 splash first frame, N3 CLS, N4 Home LCP ±5%, N5 axe, SW cold-offline, and the QA screenshot set.
- **Deliverables:** `heritage-{light,dark}-{desk,strip}` AVIF+WebP within budget; the user's written accuracy sign-off (SC8); the evidence pack for Stages 7 and 8.
- **Tickets:** TKT-46.07, TKT-46.08
- **Dependencies:** M-46.2 (TKT-46.05 for the bytes check in the rubric; TKT-46.04 and TKT-46.06 for the final evidence).
- **Entry:** the user approves the kie.ai spend (count and per-call cost, stated before the first call).
- **Exit:** SC1–SC9 and N1–N6 all evidenced. Handoff to Stage 7 Design Critique.
- **DoD:** common DoD, plus an evidence index in HANDOFF.
- **Priority:** P1 · **Status:** Not started
- **Risks:** R2 (landmark accuracy; the stop rule is 3 rounds, then escalate), R3 (light texture over 60 KB; cut resolution before quality), R8 (design drift; judged in Stage 7), R10 (dark halation), and R4 (reduced-motion splash paints late; accepted).

---

## Risk to ticket map

| Risk | Where it is killed or tested | How |
|---|---|---|
| R1 light AA vs normal band | TKT-46.06 (gate), TKT-46.08 (finals) | Text-zone L\* ≥ 92.1 and ≥ 4.5:1 per text pixel, measured. Fallback: global P ≤ 6.5%. |
| R2 landmark accuracy | TKT-46.07 | Rubric step 1, user review, ≤ 3 rounds, inpaint before regenerate. |
| R3 bytes | TKT-46.05 (gate), TKT-46.08 | Cut 2400 to 2000 wide before lowering quality. |
| R4 reduced-motion late paint | TKT-46.08 | Accepted. Evidence that CLS is 0. |
| **R5 `url()` in `image-set()`** | **TKT-46.02 (tracer)** | Inspect the emitted CSS. Fallback: path B. |
| **R5b (new) SW prunes the asset** | **TKT-46.02** | See below. |
| R6 AppShell conflict | TKT-46.02 AC, PR note | The edit stays at 2 class tokens and 1 child element. Whoever merges second rebases. |
| R7 `isolate` stacking | TKT-46.02, re-checked in TKT-46.08 | e2e with an open menu, dialog and tooltip. Fallback: `-z-10` without `isolate`. |
| R8 design drift | TKT-46.01 (R3 switch-off rule), Stage 7 | Binding switch-off rule. |
| R9 R2 text misstates TASK-38 | TKT-46.01 | The TASK-38 owner (the user) confirms before the commit. Already approved in PRD §9.12. |
| R10 dark halation | TKT-46.07, TKT-46.08 | Dark sits at the low edge of its band (already 13.3 in Stage 3). |
| E1 no green base | M-46.1 entry | The user decides (sign-off item 5). |

**R5b, a new sub-risk found during breakdown.** `public/sw.js` keeps cached statics only if a cached HTML, JS or CSS file references them. It does this with `STATIC_REF = /(?:\/_next\/)?static\/(?:chunks|media|[A-Za-z0-9_-]{10,})\/[A-Za-z0-9._~/-]+/g` (line 263). If Turbopack emits the CSS reference as a **relative** `url(../media/x.hash.avif)`, the regex does not match it. `pruneStatics` would then delete the heritage image from the cache, and offline loads would lose it. PRD §5.4 says the SW "needs no change", but that assumes the absolute form. The tracer must record the emitted form. If it is relative, the smallest fix is a one-line regex widening in `sw.js`, which touches shared infrastructure, so it goes to the user before it is made. Under path B (`/heritage/`), the SW doesn't cache-first those files at all. That is a cold-offline gap that PRD §5.4 already defers to measurement in TKT-46.08.

---

## Proposed decision entries (draft only, NOT appended to `decisions.md`)

> **Appended in TASK-46.1** to `decisions.md` on `task/46-heritage-bg` as S25–S32, unchanged and without renumbering (EXE54). `decisions.md` is now authoritative; the block below is the historical draft.

These are the Stage 2 decisions from PRD Appendix A. They are drafted here and get appended to `decisions.md` **on `task/46-heritage-bg`** as part of TKT-46.01, after this gate is approved. Numbering follows the `S#` series (Stage 2 decisions), after TASK-45's claimed **S15–S24**. The PRD text says "after S15–S20", but TASK-45 added S21–S24 at its own sign-off, so S25 is the first free number. The numbers are **provisional until the append**. If another branch claims S25+ first, renumber at append time and update the cross-references in this file. Format matches `decisions.md` (`## <ID> · title — status`, append-only).

```markdown
## S25 · Heritage art is a CSS background via image-set(), theme chosen by [data-theme] selectors — approved
Context: TASK-46. One decorative layer whose theme must be correct on the first fetch with no JS swap.
Decision: background-image: image-set(AVIF, WebP) on [data-heritage]; light by default, dark under
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) …} and :root[data-theme="dark"] ….
Rejected: <img>/<picture> (media can't see data-theme; both download), next/image (same + optimizer JS),
inline SVG (no texture, tens of KB in payload), fixed viewport backdrop (Q5).
Source: Solution-PRD-TASK-46 §2, §5 (S46-a).

## S26 · Mount in the AppShell content column (relative isolate, art at -z-10), scrolling with the page — approved
Decision: IndianHeritageBackground is the first child of AppShell's content column; the column gains
`relative isolate`; nothing else in AppShell changes. Not in RootLayout/body (sidebar width, auth routes).
Source: PRD §2, §3 (S46-b). Risks: R6, R7.

## S27 · Three levels from measured exposure; heritageLevelFor() is the only control; unmapped routes default to reduced — approved
Decision: normal = Home, Queue, Disputes, Invoices, Payments; reduced = Emails, Settings, Drafts, Audit,
detail routes and any unmapped route; off = /e2e-harness. Mobile (<768) shows the strip on Home only.
Switch-off for the whole feature = one line in src/lib/heritage.ts (SC9).
Source: PRD §4, §8 (S46-c).

## S28 · Light text zone L* ≥ 92.1 ("mist behind text"); dark normal peak L* 13–19.5 — approved
Decision: in the page-header text zone (left ~55% of the content column, top-bar bottom to ~160px below)
light art stays at L* ≥ 92.1 so every text pixel keeps ≥ 4.5:1; darker linework (L* 85–91) only outside it.
Dark normal band L* 13–19.5, reduced 9.5–13. Enforced by screenshot measurement, not assumed (SC1/SC2).
Source: PRD §6.2, §9.4 (S46-d); calibration Design-TASK-46 §6.1.

## S29 · 21:9 master, eight landmarks with mist breaks, three variations per theme, user as cultural reviewer, three-round stop rule — approved
Decision: 3360×1440 master; India Gate, Qutub Minar, Taj Mahal, Hawa Mahal, Amber-style fort,
Meenakshi-style gopuram (not a shikhara), Hampi chariot drawn by elephants, Mysore Palace; no birds,
people, text or flags. Rubric order: accuracy → composition → tone → bytes → taste. ≤ 3 rounds, then escalate.
Source: PRD §6.1, §6.3 (S46-e); prompt spec Design-TASK-46 §6.2.

## S30 · Image budget ≤ 60 KB desktop and ≤ 25 KB strip, AVIF/WebP, enforced by scripts/image-budget.ts in test:all — approved
Decision: route-budget counts only JS, so a separate gate runs right after route-budget in test:all.
Cut resolution (2400 → 2000) before quality if over budget.
Source: PRD §6.4, §7 (S46-f).

## S31 · Instant theme swap plus a single-shot idle preload of the other theme; no coupling to TASK-45 — approved
Decision: no crossfade; requestIdleCallback(cb,{timeout:4000}) falling back to setTimeout(2500), once,
cancelled on unmount, skipped when navigator.connection.saveData. The component never reads data-splash.
Source: PRD §5.2, §5.3, §10 (S46-g).

## S32 · Design.md gets R2 (retroactive, TASK-38) then R3 (heritage background, with binding switch-off) — approved
Decision: append PRD §11.1 then §11.2 verbatim after Revision R1, as the first commit on task/46-heritage-bg.
Source: PRD §9.12, §11 (S46-h). Risk: R9.
```

**Execution-time decision expected in TKT-46.02, numbered at the time:** the R5 verdict (path A `src/assets/heritage/` hashed, or path B `public/heritage/*.v1.*` plus an immutable `headers()` rule) and the R5b verdict (SW regex unchanged or widened). These are execution decisions, so they belong in the `EXE#` series (EXE31 is the last today), not in `S#`/`D#`.

---

## Sign-off items for this gate

| # | Item | Recommendation |
|---|---|---|
| 1 | Granularity: 3 milestones, 8 tickets, about 20 sp; each ticket is one fresh context window | **Approve.** The art (07) and the final swap (08) are kept apart, because 07 is gated by money and a human reviewer, not code. |
| 2 | ID scheme: provisional `M-46.x` / `TKT-46.xx`; Stage 5 creates **one** Campfire milestone for TASK-46 (or none) and the 8 tickets as subtasks of TASK-46 (`--parent TASK-46`, `--dep` mirroring the DAG) | **Approve.** One milestone is enough for an 8-ticket build. The three doc milestones are sequencing aids, not board objects. |
| 3 | Decision numbering S25–S32 (Stage 2 series), not D# | **Approve S25–S32.** These are Stage 2 decisions and D# is the Design series (D1–D7). Renumber at append if a sibling claims them first. Alternative if you prefer: D8–D15. |
| 4 | Test-case IDs: Stage 5 allocates the next free `TC-###` at the time it writes `test-cases.md` (today TC-090 is last); the tickets cite provisional `TC-46.xx` | **Approve.** Reserving a fixed block now (e.g. TC-150–169) would leave gaps and still race TASK-45. Allocate at Stage 5. |
| 5 | E1: no known green `test:all` commit on `task/38-emerald-redesign` | **Decide at Stage 5 entry:** check `f493a7b` first. If it is red, branch anyway and record the red gates as a frozen baseline rather than block TASK-46 on TASK-38. |
| 6 | R5b: if the CSS reference is relative, widen `STATIC_REF` in `public/sw.js` | **Approve in principle.** The edit goes to you as a separate change in TKT-46.02 before it is made, because `sw.js` is shared infrastructure. |
| 7 | Reduced level is a CSS treatment (opacity or filter) on the same asset per theme, not a second asset | **Approve.** Zero extra bytes. TKT-46.06 measures that it lands in the reduced band (light L\* 91–94, dark 9.5–13). If it can't, Stage 5 revisits. |
| 8 | Exposure of `/invoices/[id]`, `/disputes/[id]`, `/settings/eval` is measured in the tracer, and their level is confirmed or moved in TKT-46.03 | **Approve.** As PRD §4 says. |
