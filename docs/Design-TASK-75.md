# TASK-75 — Verilane v2 (ExceptionOS scope change) — Design.md

> **Stage:** 3 · UI/UX Design · **Ticket:** TASK-75 · **Date:** 2026-11-05  
> **Status:** MOCKUP PRESENTED, AWAITING USER APPROVAL  
> **Inputs:** Solution-PRD-TASK-75.md (approved 2026-11-05); existing Design.md (approved 2026-10-30, v1 direction "Evidence-First Operations")  
> **This document:** UI/UX direction for the two new routes (`/exceptions`, `/exceptions/[id]`) and amended Home screen with NSM metric. No redesign — all three screens apply the v1 visual system unchanged.

---

## 1. Design Approach: Extend, Never Redesign

The v1 design direction **"Evidence-First Operations"** (approved 2026-10-30) is the canonical foundation. TASK-75 adds three screens to the existing structure:

1. **Home (amended):** NSM metric introduced, same visual density and KPI layout
2. **Exceptions list (`/exceptions`):** new route, row-card pattern reusing v1 Queue style
3. **Exceptions detail (`/exceptions/[id]`):** new route, Investigation pattern reusing v1 invoice-detail layout

**No changes to:**
- Sidebar, top bar, or app shell (§13 of v1 Design.md)
- Typography, color tokens, or spatial rhythm (§12 of v1 Design.md)
- Existing routes (`/queue`, `/invoices/[id]`, `/disputes`, `/payments`, `/drafts`, `/audit`, `/settings`)
- Nav structure (Exceptions added to the existing sequence as a top-level nav item)
- Motion (state-change only, per v1 Design.md §17)

---

## 2. Information Architecture Addendum

**Updated sidebar navigation** (from v1 §5):

| Position | Route | Label | Badge | Role |
|---|---|---|---|---|
| 2 | `/` | Home | — | entry, orienting |
| 3 | `/queue` | Queue | count | primary task (v1) |
| 4 | `/disputes` | Disputes | count | secondary task (v1) |
| 5 | `/payments` | Payments | — | ledger (v1) |
| 6 | `/drafts` | Drafts | count | approval queue (v1) |
| **7 (NEW)** | **`/exceptions`** | **Exceptions** | **count** | **v2 unified queue** |
| 8 | `/audit` | Audit log | — | compliance (v1) |
| 9 | `/settings` | Settings | — | admin (v1) |

`/exceptions` sits between `/drafts` and `/audit` as the v2 primary queue for analyst actions on the three new exception kinds (unallocated_payment, short_payment_pattern) and the pre-existing five kinds (draft, uncertain_match, dispute, missing_info, reconciliation).

---

## 3. User Mental Model (TASK-75 Scope)

**Primary user intent on `/exceptions`:** *"Which payment or pattern needs my attention next, why, and what decision should I make?"*

**Three-stage resolution model:**
1. **Recommend Agent** → produces verified facts / recommendation
2. **Policy Agent** → evaluates against permission matrix, writes PolicyDecision
3. **Execute Agent** → performs the write (if policy permits) OR hands off to Manager

**Why shown visually:** Analysts need to understand the rationale behind an auto-permitted action (trust) and when they're being asked for judgment (judgment call) rather than just executing blindly. The three-stage view (§2.3 of Solution-PRD) is expensive architecture; the UI must justify it by being legible.

---

## 4. Exception Detail View — Three-Stage Workflow Display

**New section: "Exception resolution workflow"** (replaces the one-section Investigation view for exceptions; invoices reuse the existing Investigation layout).

Each of the three agents' outputs is shown as a distinct **agent-stage block** with:
- **Label:** "1. Recommend Agent" | "2. Policy Agent" | "3. Execute Agent"
- **Output:** human-readable description of what the agent did (facts verified, policy gate applied, action readiness)
- **Metadata:** timestamp, IDs, version/config (PolicyDecision config_version, policy_verdict enum value)

Visual hierarchy:
- Stage 1 (Recommend): facts listed as "verified claims," each with a source reference
- Stage 2 (Policy): verdict + reason + config_version (no raw gate list, just the outcome and why)
- Stage 3 (Execute): status ("ready to allocate" / "pending manager hand-off" / "executed at {time}") + what happens next

**Example for an unallocated payment:**

```
Stage 1: Recommend Agent
  Verified facts: NEFT received on 2026-11-03 for ₹45,000; ₹45,000 outstanding on ACME invoice INV-0142; 
  no prior payments from this sender.
  Recommendation: Allocate to INV-0142. Confidence: high (exact match).

Stage 2: Policy Agent
  Policy decision: Amount ≤ ₹5,00,000 and exact/unambiguous match → auto-permitted for Analyst action.
  Policy verdict: auto_permitted. Policy version: v1. Evaluated at: 2026-11-05 14:22 UTC.

Stage 3: Execute Agent
  Status: Ready to allocate. Awaiting analyst approval to apply the write (one transaction with audit event).
  Execute ready. No action taken yet.
```

**CreditNote shown as an audit event:** when a short-payment write-off is approved, the resulting CreditNote row is listed in the audit trail like any other action ("Manager Tanya approved write-off of ₹12,300 on 2026-11-04 14:15").

---

## 5. Exceptions List (`/exceptions`) — Row-Card Pattern

**Reuses v1 Collection Queue row-card layout** (Design.md v1, §14 / §7):

| Column | Content | v1 Analogue |
|---|---|---|
| Kind | Exception type (badge label or text) | (new, no v1 analogue) |
| Subject | Payment reference, customer name, or pattern description | invoice number or dispute identifier |
| Amount | ₹ value (exact for payments, negative for short-payments/write-offs) | outstanding amount |
| Status | Open / Policy Review / Pending Manager / Resolved | status (Collection in progress / Awaiting approval / Disputed) |
| Priority | badge (High / Medium / Low / Disputed) | priority band + reason |
| Action | "Review" button or link | "Open" or view link |

**Density unchanged:** 64px tall hairline cards, one per row, no horizontal scroll.

**Three new exception kinds shown alongside pre-existing five:**
- `unallocated_payment` — new, shown with Kind label, payment amount and receiver reference
- `short_payment_pattern` — new, shown with Kind label, negative amount (write-off quantum), customer name
- `draft`, `uncertain_match`, `dispute`, `missing_info`, `reconciliation` — existing five, unchanged

**Excluded/disputed rows:** muted (opacity: 0.6) with a "Disputed — excluded from queue" badge, matching v1 behavior (Design.md v1, §14).

**Filters:** reuse the v1 Queue filter panel (status, priority, customer, ageing, search). No new filters introduced; the new exception kinds are filtered by the status/priority fields already in the system.

---

## 6. Home Screen — NSM Metric Introduction

**New section added above the existing task-feed (v1 Design.md, §15):**

```
KPI Strip (unchanged)
  Outstanding | High priority | Open disputes | Avg days overdue
  
NSM Section (NEW)
  Heading: "NEW: Normalized Success Metric (NSM)"
  Value: ₹18,32,500 (or the session's computed total)
  Description: "Simulated — one demo session = one analyst-week. This metric shows the 
               value of correctly resolved exceptions in this session."

Tasks Heading (unchanged)
  "Needs your attention"
  
Task Cards (amended)
  High-priority invoices | Exceptions | Open disputes | Drafts
  (Exceptions card added as one of the four task-card items)
```

**NSM styling:**
- **Container:** `--brand-tint` background (light emerald, 10px radius, 14px border left in `--brand`)
- **Label:** 11px uppercase, muted gray (matches v1 labels)
- **Value:** 24px serif (Iowan Old Style, same as KPI values), brand green
- **Description:** 13px gray, honest language ("Simulated," not "Projected" or "Estimated")

**Honest labeling (per Solution-PRD §2.5):** the label "Simulated — one demo session = one analyst-week" appears *every time* the NSM is shown (Home, `/exceptions`, any report). It is not hidden, not collapsed, and reads as prominent as the figure itself. This is the same honesty move v1 Design.md made for the splash cinematic's status text (S18/S21).

---

## 7. Sidebar Navigation Update

**Added to the navigation order (after Drafts, before Audit log):**

```
| Exceptions | badge (count) |
```

The badge shows the count of open (non-Resolved) exceptions, refreshed whenever an exception is actioned or a new one arrives. Reuses the v1 badge styling (brand background, white text, 11px weight-600).

**No existing nav item is moved, renamed, or hidden.**

---

## 8. Evidence Inline — Payment & CreditNote

**Exception detail page shows evidence grouped by type** (reusing v1 Invoice Investigation pattern, §14):

| Group | Content | New fields (TASK-75) |
|---|---|---|
| **Payment** | Received, amount, method, sender reference | (none; reuses existing settlement fields) |
| **Invoice facts** | Invoice ID, customer, outstanding, days overdue | (none; reuses existing invoice fields) |
| **CreditNote (if applicable)** | Credit-note ID, amount, reason, approved-by, created-at | (all new; only shown if a write-off was approved) |

**Provenance line format unchanged:** `Source: {file} · Row/Email: {id} · Field: {field}` (12px mono).

**CreditNote table only appears if a write-off has been applied.** It is not a placeholder section; only exceptions with an actual CreditNote row show this group.

---

## 9. Policy Decision as a Card

**New sidebar card on exception detail pages (matching v1 pattern of status/priority sidebars):**

```
Policy Decision
  Verdict: auto_permitted | needs_analyst | needs_manager | blocked
  Reason: (one-line summary of the gate)
  Decision ID: POL-{id}
  Policy version: v1
  Evaluated: {ISO timestamp}
```

**Styling:** `detail-card` pattern (white background, 1px border, 14px radius, 20px padding), text in 13px body copy, metadata in 11px muted gray.

**When to show:** always on exception detail, even if the Execute agent has not yet acted. This shows the analyst/manager *what policy allowed* before they approve the action.

---

## 10. Audit Trail — Agent Stages and Actions

**The audit log on exception detail shows:**

```
2026-11-05 14:22 — Policy Agent evaluated exception (verdict: auto_permitted)
2026-11-05 14:22 — Recommend Agent generated facts
2026-11-03 10:45 — Payment received
```

**If an action is executed (e.g., allocation):**

```
2026-11-05 14:30 — Exception allocated to INV-0142 by Execute Agent (audit event: allocation)
2026-11-05 14:22 — Policy Agent evaluated exception (verdict: auto_permitted)
...
```

**If a write-off is approved (CreditNote created):**

```
2026-11-04 14:15 — Manager Tanya approved write-off of ₹12,300 (audit event: credit_note_created)
2026-11-04 14:12 — Policy Agent evaluated exception (verdict: needs_manager)
...
```

This is a **plain-language, reverse-chronological list** (matching v1 Audit Log, no invention). Every action is an audit event (per Solution-PRD §2.3, S14 one-write-path invariant).

---

## 11. Action Bar — Exception Detail

**Same two-button pattern as v1 Investigation (Design.md v1, §14):**

```
[Mark disputed] [Submit for approval]
```

**For unallocated payments and short-payment patterns:**
- If policy verdict is `auto_permitted`: "Submit for approval" button is enabled (analyst action)
- If policy verdict is `needs_manager`: button is disabled-with-reason ("Manager approval required")
- If status is already `Resolved` (action taken): button is disabled-with-reason ("Already resolved")

**No new buttons introduced.** The Execute agent's work (writing the allocation / credit-note) happens when the analyst clicks "Submit for approval," which triggers the existing `commands.ts` one-write-path transaction (Solution-PRD §2.3, R11).

---

## 12. Visual Direction (Unchanged)

**Applying v1 Design.md §8 direction word-for-word:**

> "Evidence-First Operations." A dense, restrained finance-operations workspace where every number a user trusts carries a visible, one-click path back to its source record.

**Inherited from v1:**
- §1 Anti-direction (no glass, no glow, no gradients, no generic dashboard template)
- §12 Color system (cream canvas, dark emerald rail, rationed brand green)
- §12.3 Typography (system serif for values, system sans for UI, system mono for provenance)
- §13 App shell (fixed sidebar, sticky top bar, native scroll)
- §14 Component specs (row-card, badge-pill, evidence table with provenance)

**No new visual elements.** Every screen added in TASK-75 fits within the existing token set and pattern library.

---

## 13. Screen States (Four-State Contract per web-deliverables.md §2)

| State | Exception List | Exception Detail |
|---|---|---|
| **Loading** | Skeleton row-cards (5–7 rows), same 64px height as filled cards | Page layout skeleton: title, action bar, cards with placeholder content |
| **Empty** | "No exceptions to review — go to Queue or check back later" message | N/A (detail view always has a single exception loaded) |
| **Error** | "Error loading exceptions. Retry?" with a button | "Error loading exception. Retry?" with a button |
| **Working** | Full list of exception rows, with counts and badges | Full exception detail with three agent stages, evidence, and audit trail |

**Offline state (PWA, per v1 Design.md §13.6):** "You're offline — viewing cached data" banner; actions that require sync are disabled-with-reason. Already-loaded exception data stays browsable.

**No invented states.** Only states the system can actually enter.

---

## 14. Responsive Behavior (No New Decisions)

**Reuses v1 Design.md §13 breakpoints and reflow logic:**

| Viewport | Layout |
|---|---|
| ≥1280px (Desktop) | Fixed 216px sidebar, sticky top bar, two-column exception detail (evidence left, audit right), row-cards one per line |
| 1024–1279px (Compact) | Same sidebar, exception detail single-column (checks/audit below evidence) |
| 768–1023px (Tablet) | 72px icon rail, row-cards two-line cards |
| <768px (Mobile) | Top bar + bottom tab nav, row-cards two-line cards, exception detail full-height single column |

**No horizontal scroll, ever (NFR6 from v1 Design.md).**

**No new mobile-specific behavior introduced.** The exception list and detail views reflow like the existing Queue and Investigation patterns.

---

## 15. Accessibility (WCAG 2.2 AA)

**Inherited from v1 Design.md, no new decisions:**

- Color + text badges (never color-only for meaning)
- Semantic HTML (buttons are `<button>`, links are `<a>`, form controls have labels)
- Focus ring (`--brand` color, consistent across all interactive elements)
- Keyboard navigation (tab order follows visual order)
- Screen-reader text for icon-only buttons (aria-label)
- Sufficient color contrast (4.5:1 on body text, 3:1 on graphics — v1 tokens verified)

**New elements follow the same rules:**
- Agent-stage labels are text + left border, not color-only
- PolicyDecision verdict is text + optional icon, not badge-only
- Exception kind badges use text + icon or text + color, matching v1 priority/status badge pattern

---

## 16. Ethical Behavioral Design Gate (per web-deliverables.md §5)

**TASK-75 adds no dark patterns. All gates pass:**

✅ **Honest simplification:** three-stage workflow is shown completely (not hidden under a "show details" disclosure that users skip). The Policy Agent's decision is its own card, legible without a tooltip.

✅ **No manufactured urgency:** no "3 exceptions waiting!" nag; no streaks; no countdown timers. The task feed shows the count matter-of-factly.

✅ **Reversible actions:** "Mark disputed" and approval rejection are always available. No permanent "gone" states without an undo or re-open path (matching v1's dispute/reopen model).

✅ **Honest labeling:** NSM says "Simulated" every time it's shown. PolicyDecision reasons are stated plainly (e.g., "Amount ≤ ₹5,00,000 and exact match," not "Super AI says yes!").

✅ **The easy path is the honest path:** the system default (auto-permitted for analyst-actionable exceptions) reflects the true Policy gate, not a sales-biased ranking or a manipulative default.

---

## 17. Anti-AI-Slop Review Gate (per anti-ai-slop.md §8)

| Check | Status | Notes |
|---|---|---|
| No generic SaaS template | ✅ PASS | Row-card pattern is Expensify's (finance-specific), not a generic card grid |
| No unjustified card-everything | ✅ PASS | Exception list is a ranked row-card list (like Queue), not tiles |
| No fake metrics | ✅ PASS | NSM is "Simulated — one session," not a projections or a fabricated average |
| No generic AI marketing copy | ✅ PASS | Agent labels are functional ("Recommend Agent," "Policy Agent"), not "AI-Powered" or "Intelligent" |
| No gratuitous gradient/glass/glow | ✅ PASS | Only flat colors + hairline borders, matching v1 |
| No badge/icon saturation | ✅ PASS | One badge per row-card (priority), same as v1 Queue rows |
| No dashboard-by-default | ✅ PASS | `/exceptions` is a list first, charts are deferred or removed (only Home has two charts, both v1) |
| No fake AI processing (spinning loader, "thinking...") | ✅ PASS | Skeleton loading only while data fetches; no fake delay animations |
| Hierarchy holds without decoration | ✅ PASS | Grayscale test: typography weight, size and spacing carry the hierarchy; color (badges, brand links) enhances but does not define it |
| 20-SaaS test (remove all brand color, does it read?) | ✅ PASS | Remove emerald: layout, density, spacing and typography still define the interface; sidebar is a contrasting surface by value alone |

---

## 18. Default Patterns (per default-patterns.md §3)

| Pattern | Status | Notes |
|---|---|---|
| Guided tour / First-run | N/A for v2 | TASK-75 adds screens to existing app; onboarding is deferred (v1's decision, unchanged) |
| Skeleton loading | ✅ INCLUDED | Exception list and detail pages show skeleton cards while loading (matching v1 pattern) |

---

## 19. Motion (State-Change Only, per v1 Design.md §17)

**No new motion introduced.** Inherited from v1:

- Hover: background color change on interactive rows/cards (no elaborate tween)
- Focus: outline on buttons/links (no animation)
- Chevron: rotate on disclosure triangles (accordion-style, matching Home task-feed)
- Toast on approve: slides up from bottom, fades out after 4s (matching v1 pattern)

---

## 20. Copy & Microcopy

**Follows v1 Design.md §10 principles:**

- Object + Action + Result: "Submit for approval," "Mark disputed," "Review exception"
- Reason strings: "Amount ≤ ₹5,00,000 and exact match" (fact + fact → conclusion)
- Evidence provenance: "`Source: {file} · Row: {id} · Field: {field}`"
- Agent descriptions: "Verified facts: [list]" / "Policy verdict: auto_permitted" / "Status: Ready to allocate"
- Honest labeling: "Simulated — one demo session = one analyst-week"

**No invented jargon.** Every term is already in the Solution-PRD or v1 Design.md.

---

## 21. Mockup Location & Navigation

**HTML mockup:** `.design/exploration/task-75/mockup.html`

**Three screens built as interactive tabs:**
1. **Home** — KPI strip + NSM section + task cards (shows new metric in context)
2. **Exceptions List** — row-cards showing the two new exception kinds + one pre-existing kind (excluded)
3. **Exceptions Detail** — unallocated payment example with three-stage workflow, evidence tables, policy card, audit trail

**Mobile responsive:** mockup renders at desktop / 768px / 375px; no horizontal scroll.

---

## 22. Design Freeze

> **DESIGN FROZEN — 2026-11-05, approved by user ("Approved go ahead").**
> Mockup: `.design/exploration/task-75/mockup.html` (Home/NSM, Exceptions list, Exceptions detail). This freeze extends root `Design.md`'s "Evidence-First Operations" direction unchanged — no new design system, no new direction was introduced.

**Frozen on approval:**
- Information architecture: `/exceptions` route addition, sidebar order (§2, §7)
- Visual direction: Evidence-First Operations, no redesign, existing v1 tokens (§12)
- Exception detail layout: three-stage agent display + evidence inline (§4, §8)
- Exceptions list: row-card pattern, same density as v1 Queue (§5)
- Home NSM metric: brand-tint section with honest "Simulated" label (§6)
- Component specs: all inherited from v1 (§14)
- Responsive breakpoints and reflow: reuse v1 (§14)

**Implementation may adjust:**
- Pixel-level alignment and spacing (CSS fine-tuning)
- Browser-specific rendering (font fallbacks, shadow rendering)
- Accessibility fixes (color contrast edge cases, keyboard navigation UX)
- Performance optimizations (skeleton loading timing, animation frame drops)

**Major changes return to design review:**
- Moving the three-stage workflow to a drawer or collapsible section
- Changing the row-card density or layout on exceptions list
- Relocating the NSM metric or changing its prominence
- Adding new visual elements (gradients, shadows, illustrations) not in v1 token set
- Introducing a new nav item or changing existing nav structure beyond `/exceptions` addition

---

## 23. Decisions Log (S38–S46 appended to decisions.md on TASK-75's own branch, not before)

**See Solution-PRD-TASK-75.md, Appendix A, for S38–S46** — the Solution stage locked all design decisions (entity model, agent architecture, policy engine, NSM computation, routing, sequencing). Stage 3 (this design) captures only the UI/UX expression of those solutions, which has no competing directions per §2 (Core path, one direction, extending v1 unchanged).

No new D# entries are appended from Stage 3 (design decisions are already locked in S38–S46; this design simply visualizes them). Per the Solution-PRD's own sequencing note (Appendix A header), S38–S46 are appended to `decisions.md` only once TASK-75's implementation work lands on its own branch — not at this Stage 3 design-approval point, which is still on an unrelated branch (`docs/handoff-task64-shipped`).

---

## 24. Exit Criteria (Stage 3 → Stage 4)

- ✅ Design direction stated and justified (§1: extend v1 "Evidence-First Operations," no redesign)
- ✅ Information architecture updated and shown (§2: `/exceptions` added, sidebar order shown)
- ✅ User mental model documented (§3: three-stage workflow rationale)
- ✅ Three new screens mocked and shown (§4, §5, §6: exceptions detail, exceptions list, Home with NSM)
- ✅ Evidence inline pattern shown for CreditNote and PolicyDecision (§8, §10)
- ✅ Accessibility checklist completed (§15: WCAG 2.2 AA, inheritance from v1)
- ✅ Anti-slop gates passed (§17: grayscale, 20-SaaS, no gradients, honest labeling)
- ✅ Default patterns addressed (§18: skeleton loading included)
- ✅ Screen states defined (§13: loading, empty, error, working)
- ✅ Responsive behavior specified (§14: reuse v1 breakpoints)
- ✅ Motion intent stated (§19: state-change only, no new tween)
- ✅ Microcopy principles applied (§20: object + action + result, facts not claims)
- ✅ Mockup rendered and navigable (`.design/exploration/task-75/mockup.html`)
- ✅ **USER APPROVAL GIVEN** — "Approved go ahead," 2026-11-05 (§22, Design Freeze)

---

## Appendix A — OG Image (Deferred)

TASK-75 is a back-office feature addition; the public OG image (on Verilane's Home/landing page) is out of scope for this design. If a future release wants to surface the "Exception Resolution Workflow" capability in the public preview, OG image design will be a separate Stage 3 decision. For now: **N/A**.

---

**Mockup:** `.design/exploration/task-75/mockup.html`  
**Previous design (v1):** `Design.md` (approved 2026-10-30)  
**Solution guide:** `Solution-PRD-TASK-75.md` (approved 2026-11-05)

Ready for user review and approval.
