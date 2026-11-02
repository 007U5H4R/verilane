# Verilane — Design.md

> **DESIGN FROZEN — 2026-10-30, approved by user** ("go ahead with stage 4"). Frozen: information architecture (§5) · visual direction (§8, §12) · CTA hierarchy (one primary pill per view, §14) · motion concept (§17, state-change only) · scroll concept (native) · approved mockup `.design/exploration/final/mockup.html`.
> Implementation may adjust technical details, pixel-level issues, browser constraints, and accessibility fixes. Changing any frozen item goes back to design review (build-workflow scope-change rule); delegated design skills never override it.
> **Not frozen yet:** the OG image (§22) — deferred by the user's move to Stage 4; it must be mocked and approved before Stage 10 deploy.

> Stage 3 · UI/UX Design · Campfire TASK-3 · status: **approved 2026-10-30**
> Builds on the approved [`Solution-PRD.md`](Solution-PRD.md) (S1–S14) and [`docs/Product-Requirements.md`](docs/Product-Requirements.md) (IA, traceability, Stage-3 deferrals). Canonical problem statement: [`Discovery-PRD.md`](Discovery-PRD.md).

## 1. Design Direction & Anti-Direction

**Direction — "Evidence-First Operations."** A dense, restrained finance-operations workspace where every number a user trusts carries a visible, one-click path back to its source record. The product's job is not to look intelligent; it's to let an AR analyst move fast through a queue while never having to take a claim on faith. Visual quietness is the trust signal: the UI gets out of the way of the data.

**Anti-direction (explicit, binding on implementation):**
- No generic AI dashboard template — no centered hero, no gradient hero band on an internal screen, no "AI-powered" chrome.
- No glassmorphism anywhere; no glow/neon; no oversized KPI tiles with giant numerals and no context.
- No decorative charts — every chart on Home must answer a specific operational question (see §15) or it is removed.
- No fake AI confidence scores as proof — the priority score is shown as an explainable rule output (gates + weighted factors), never as a bare "92% confidence."
- No ChatGPT-style full-screen chat interface — AI-authored content (drafts, extraction, recommendations) is always embedded in the record it's about, never a standalone conversation.
- No card-everything — the Collection Queue is one ranked list under a single column header, each row a 64px-tall hairline "row-card" (Expensify's report-list pattern, §7), not a grid of tiles. Rows share one column grid so the list scans as a table (Tesler's Law still holds: the product absorbs the complexity of 50 invoices); below 1024px each row reflows to a two-line card (§13). Cards are used only where a record is the unit of work (queue row, task-feed item, evidence group), never as decoration.
- No cartoon illustration, no stock photography, no decorative icon-per-label.
- Brand emerald is rationed: it marks the brand mark, the single primary action per view, and "verified/approved" semantic states. It is not the default color of the interface.

**Justifications for anything in the §1 slop catalog that nonetheless appears:** none apply — no gradients, no glass, no glow, no decorative motion are used anywhere in this design.

## 2. Surface Classification (`t-design` Step 0)

**Core**, shipped as a **PWA** (added by the user mid-Stage-3 — see §13.6). Verilane's Collection Queue, Investigation, Email Intelligence, Disputes, Review & Approvals and Audit Log are a dense internal-feel operational tool (admin/enterprise category), even though the finished build is deployed to a public Vercel URL as a portfolio demo and is installable. Public reachability triggers the Social-Preview/OG contract (`web-deliverables.md §4`) on exactly one page — the deployed app's root/landing response, which for this product *is* the Home screen behind a visible "Demo — no login required" banner — but it does not reclassify the product itself as a Web or Product-Journey surface. There is no marketing site, no signup funnel, no authenticated-vs-anonymous seam. Being a PWA (installable, offline-capable shell) is an **app-shell delivery decision**, not a surface reclassification either — it doesn't introduce a conversion funnel or a second design system. Consequence (`t-design` pipeline): steps 6/10–11 (multi-direction exploration) shrink to **one** primary direction; step 8 (hero/nav/mobile *for a marketing page*) is replaced by app-shell nav/mobile decisions in §13; step 3-WEB and step 13-web-conversion are skipped.

Real direction-level decisions still exist per `HANDOFF.md`'s open questions and are resolved below rather than explored as 2–4 full competing aesthetics: dark-mode logo treatment (§3), queue density/table-vs-card at 390px (§13), evidence provenance inline-vs-drawer (§13, resolved inline), OG image composition (§22), and now the PWA install/offline/icon decisions (§13.6).

## 3. User & Mental-Model Context

**Primary user:** an AR **Analyst** working the Collection Queue top-down: "which invoice do I act on next, and why." **Secondary user:** a **Manager** who additionally resolves disputes and approves escalated/high-value reminders, and periodically checks team workload.

**Mental model the UI must match:** "A queue of invoices, ranked by a rule I can inspect, each backed by evidence I can click through to." Users do **not** think in terms of "AI extraction pipeline" or "matching algorithm" — those are implementation detail. They think: *this invoice, this amount, this reason, this proof, this next action.*

**Dominant job:** one action — work the next item in the queue. The Queue, not the Home dashboard, is where the work happens (brief §5: "Do not make the analytics dashboard the centre of the product"). Overview is a landing/triage view whose primary CTA routes straight into the queue.

**ASSUMPTIONs carried from the brief/PRD (flagged, not invented):**
- ASSUMPTION: "Demo mode" is the default and only mode shown in the public deploy; "Live LLM" toggle is visible but disabled-with-reason there (SR6).
- ASSUMPTION: Analyst is the default role at first load; the role switcher is a visible global control, not hidden in settings.
- ASSUMPTION: as a PWA, "install" is an optional convenience for a repeat visitor (recruiter/reviewer coming back to the demo), not a requirement to use the product — the product works fully in-browser with no install (NF1 unaffected).

## 4. Emotional Journey (Peak-End)

| Stage | Feeling target | Design move |
|---|---|---|
| Land on Home | Oriented, not overwhelmed | 6 real numbers + 2 purposeful charts, one CTA into the queue |
| Open a high-priority invoice | "I can see why" | Priority reason string + evidence panel open by default, not buried |
| Review a generated draft | In control, not replaced | Draft is editable inline; 9 checks shown as a visible pass/fail list, not hidden validation |
| **Peak:** approve & simulated-send | Competent close to a real task | Clear confirmation toast naming the invoice + amount + "simulated send" label (truthful, SR5) |
| Hit a disputed invoice in the queue | Protected, not blocked arbitrarily | Explicit "excluded — dispute under review" state with a link to the dispute, not a silent disappearance |
| **End of a session:** Audit Log | Reassured everything is recorded | Plain-language, reverse-chronological log entry for every action just taken |
| Lose connectivity mid-session (PWA) | Not stranded | Already-loaded data stays interactive (IndexedDB-backed); a quiet, honest "You're offline — some actions are paused" banner, not a dead white screen |

No manufactured urgency, no fake scarcity, no streaks — none of Verilane's workflow is funnel-shaped, so Goal-Gradient/Zeigarnik don't apply beyond the real, truthful "9/9 checks passed" state. The install prompt (§13.6) is likewise never nagged — it's a quiet, dismissible, user-initiated affordance, never a modal interrupt.

## 5. Information Architecture

**Changed in Stage 3 (approved 2026-10-30 with the mockup; `docs/Product-Requirements.md §1` updated to match).** The Expensify-pattern rebuild consolidated the Stage 2 IA (`docs/Product-Requirements.md §1`) into fewer, task-named destinations:

| Stage 2 IA | Stage 3 mockup | Where the capability lives now |
|---|---|---|
| Overview | **Home** | KPI strip + "Needs your attention" task feed + 2 charts |
| Collection Queue | **Queue** (count badge) | unchanged role; ranked row-cards |
| Invoices | folded into **Queue** | the queue lists all open invoices (Low included); filters replace a separate table |
| Email Conversations | folded into **Investigation** | the *Communication* evidence table per invoice (classification + provenance) |
| Disputes | **Disputes** (count badge) | unchanged |
| Review & Approvals | **Drafts** (count badge) | drafts awaiting approval; approve happens in Investigation's action bar |
| Data Sources | **Import data** action on Queue + Settings | the CSV import and Load-demo/Reset actions |
| — | **Payments** (new) | the payment ledger and unmatched payments (the matcher's review queue, S12) |
| Audit Log · Settings | **Audit log · Settings** | unchanged |

- **Sidebar order:** Home · Queue · Disputes · Payments · Drafts · Audit log · Settings, under an "AR · Demo workspace · {role}" header.
- `docs/Product-Requirements.md §1`, its traceability rows and the `docs/Architecture.md` route list were updated to this IA at the Stage 3 freeze. Reset Demo Data moves from Data Sources to Settings (still behind a confirmation dialog).
- **Global chrome:** DEMO DATA indicator · role switcher (Analyst/Manager) · theme toggle · Simulated/Live LLM mode label · storage-fallback banner (SR9, shown only when triggered) · offline indicator (PWA, §13.6) · install affordance (PWA, §13.6, in Settings + a dismissible one-time header prompt)

Serial-position ordering: Queue sits second (first after the orienting Home) because it's the dominant job; Settings is last because it's the least frequent.

## 6. Attention & Cognitive-Load Analysis

- **Recognition over recall:** priority band, status and dispute state are always shown as labelled badges with icon + text (never color alone — brief's semantic-color rule), so a user scanning the queue never has to remember what a color means.
- **Choice overload control:** Collection Queue filters are curated to the fields that actually matter for triage (status, priority band, customer) — not every column is independently filterable.
- **Tesler's Law:** priority computation complexity (7 gates + weighted score) is absorbed by the system; the user sees one band + one reason string, with an optional "show factors" disclosure for the curious/auditing case — not the raw gate list by default.
- **Chunking:** the Investigation workspace groups into three visually separated blocks — Invoice Summary, AI Observations + Recommended Action, Evidence — so a 10+-field record doesn't read as one wall of text.

## 7. Production-Pattern Research

**Primary reference (user-directed, 2026-10-30): Expensify web, via Mobbin** — https://mobbin.com/apps/expensify-web-378fb653-628f-455e-a43c-3441470f981f. Expensify is the closest production analogue to Verilane's job: a finance-ops queue of money documents, each opened into a report with line-item evidence, policy violations and an approval chain. Layout and interaction *patterns* are adopted; Expensify's branding, illustrations, copy and colours are **not** (Verilane keeps its emerald brand and unaltered logo).

| Pattern adopted | Mobbin screen | Verilane use |
|---|---|---|
| Dark brand-coloured left sidebar, light canvas | [Workspace home](https://mobbin.com/screens/fa7c53f2-8163-4df2-8da8-60543d2574eb) | 216px emerald rail + cream canvas (§12, §13) |
| "Needs your attention" task feed of expandable items | [Home task feed](https://mobbin.com/screens/f36171d1-af5c-4a87-8bd4-abb22b075298) | Home: 4 `<details>` task cards (high priority, disputes, drafts, unmatched payment) |
| Ranked list with uppercase column header + collapsible filter panel | [List + filters](https://mobbin.com/screens/f5013451-73be-43a8-a137-90ea17817959) | Collection Queue row-cards + "Hide filters" panel |
| Report header: action bar, "Next step:" callout, From → To document card | [Approved report](https://mobbin.com/screens/e08d4c7a-de65-4916-bc66-91a091d1d753) | Investigation header + "Next step" callout + Verilane Collections → customer card |
| Grouped line-item detail, each value with its source | [Invoice detail](https://mobbin.com/screens/f01ed61a-94a3-4fb2-8a9a-0fe4412280f1) | Evidence tables: Invoice facts / Communication / Payments, each value + `Source · Row · Field` |
| Policy violations listed on the document | [Violations](https://mobbin.com/screens/cd87843f-cef8-4000-b9f1-27e2ce3b37e2) | Pre-approval checks (8 of 9) with the failing check expanded |
| Reject/hold reason popover | [Reject popover](https://mobbin.com/screens/fe23aaa2-6388-4e95-88de-768a44bbe4e3) | Mark-disputed / reject-draft reason capture (Stage 6) |
| Activity thread on a report | [Chats](https://mobbin.com/screens/fb37b615-55b6-43ea-b5b0-ffd6240e07a6) | Activity log + note box on Investigation (audit, not chat) |
| Skeleton loading in final layout shape | [Loading](https://mobbin.com/screens/f434e94d-727b-4f59-a2e1-cc3b071a2200) | Queue loading state (§18) |

**Patterns deliberately rejected from Expensify:** the chat-first "Concierge" floating button and inbox-as-chat model (violates §1's no-chat-interface rule), upgrade/marketing nags, and illustrated empty states (anti-direction: no cartoon illustration).

**Secondary vocabulary (brief-named):** Ramp (finance tabular conventions, receipt-as-evidence) and shadcn/ui (implementation substrate, S8). Linear is no longer a visual reference — its restraint survives in density and type discipline only.

Stopped after nine screens because further Expensify screens repeated the same list → report → evidence model and stopped changing the hypothesis.

## 8. Design Hypothesis / Direction (Core path — one direction)

**"Evidence-First Operations."**
- **Hypothesis:** an AR analyst trusts a system faster when every claim is one click from its source than when the system looks more polished or more "AI."
- **Hero/entry equivalent:** none (no marketing hero) — the Home screen's "equivalent" moment is a plain-language status summary + one CTA.
- **Narrative:** *see it → trust it → act on it → it's recorded.*
- **Distinctness:** N/A — Core path, single direction (§2). A first Linear/Ramp-styled mockup was shown and the user redirected to the Expensify web pattern set (§7); the mockup was rebuilt rather than run as two competing directions. The open questions in §13 are resolved as targeted calls within this one direction.
- **Expression:** "a money document you can audit" — the queue reads like a ledger, and each invoice opens like an expense report: who it's from and to, what the facts are, where each fact came from, what's blocking it, and what happened.

## 9. Behavioral & Psychological Design Rationale

Product-type mapping (`behavioral-design.md`): **Enterprise dashboard** + **Transactional/finance**.

| Principle | Where used | Why | Ethical gate |
|---|---|---|---|
| Choice-overload curation (Hick's) | Queue filters, dispute-type list | 7 dispute types / many columns shown only where decision-relevant | Helps the user's own task; nothing hidden, just prioritized ✓ |
| Tesler's Law | Priority score, extraction/matching | Absorb real complexity instead of exposing raw pipeline state | Truthful simplification, factors still inspectable ✓ |
| Recognition over recall | Status/priority/dispute badges | Analysts triage dozens of rows per session | No manipulation — purely reduces memory load ✓ |
| Von Restorff (one emphasis) | One primary CTA per screen (e.g. "Review collection queue", "Approve") | Decision clarity | Single honest action, not a dark-pattern decoy ✓ |
| Peak-End | Draft approval → simulated send → audit entry | End the core task on a clear, truthful confirmation | No fake success state, "simulated" is labelled ✓ |
| Labor Illusion — **not used** | — | No AI "thinking" animation anywhere; extraction/classification in demo mode is near-instant rule-based, and showing a fake delay would misrepresent it | Explicitly rejected per `anti-ai-slop.md §7` |

**Ethical Behavioral Design Gate:** ✅ all five checks pass — every principle serves the analyst's own task (triage and act correctly), nothing is fabricated (no fake progress/scarcity/social proof — brief explicitly bans fake confidence scores and this design complies), every state is reversible (edit returns draft to validation; reject is always available), no fear/shame/FOMO mechanics exist in an internal ops tool (including the PWA install prompt, which is never nagged — §4), and the easy path (accept the system default) is also the honest path (defaults reflect the true computed priority/evidence, never a sales-biased ranking). No banned dark pattern is present.

## 10. Content Strategy & Microcopy Principles

- **Object + Action + Result**, never "Supercharge your collections": CTAs read "Review collection queue," "Approve reminder," "Resolve dispute," "Generate draft" — the verb names the real action.
- Priority reason strings follow the brief's exact format: *"High priority — 45 days overdue with no recorded payment commitment."* (fact + fact → conclusion, always traceable to a gate/factor).
- Evidence entries follow the brief's exact triplet format: `Outstanding amount: ₹85,000 / Source: invoices.csv / Row: 12 / Field: outstanding_amount`.
- AI-authored text is always labelled **Simulated** or **Live LLM** (SR5) next to the content it produced, in small type, not hidden in a tooltip.
- The offline banner and the install prompt use the same plain, factual register as everything else: "You're offline — some actions are paused" / "Install Verilane for quicker access" — never urgency language ("Don't miss out!").
- No invented metrics, testimonials, or "X companies trust us" — none exist in this product; none are added.

## 11. Mockup Scope & Plan (Core path)

Per `mockup-exploration.md §4`, one direction, planned then built:

```yaml
visual_direction: Evidence-First Operations
narrative: see it → trust it → act on it → it's recorded
layout: app shell — 216px dark emerald sidebar (desktop) / 72px icon rail (tablet) / top bar + bottom nav (mobile), sticky top bar, evidence inline on the Investigation page
desktop_scroll: native
mobile_scroll: native
motion: minimal (hover/focus states, chevron rotate on task expand, one toast on approve)
surface: cream canvas, white hairline cards, no shadows except overlays/menus
typography: system serif display (h1 + money figures) + system sans UI + system mono (provenance, IDs)
color: cream neutral canvas + emerald rail + rationed emerald primary action + 4 semantic priority colours
conversion: N/A (no conversion surface)
pwa: installable app shell, offline-aware (read + already-synced data only), standalone display
```
Anti-direction: see §1.

Priority screens built in `.design/exploration/final/mockup.html` (brief + `web-deliverables.md §3`):
1. **Home** (entry) — KPI strip, "Needs your attention" task feed, two question-led charts
2. **Collection Queue** (primary task flow) — filters panel, 6 ranked row-cards incl. the disputed (excluded) row, pager
3. **Invoice Investigation** (key result) — action bar with disabled-with-reason primary, Next-step callout, From → To card, priority reason + factors, three evidence tables with provenance, reminder draft with footnoted facts, Pre-approval checks (8 of 9), Activity + note. This screen also carries the draft-review and approval step that §5 lists as "Review & Approvals" — the Manager role sees "Approve & send" in the same action bar.
4. **Mobile 390** — phone frame: 2×2 KPIs, task cards, bottom nav, offline banner
5. **Screen states** — loading, empty (filtered), empty (no data), error (row-level CSV), working; plus Offline / Install prompt / Storage fallback toggles
Disputes and the standalone Review & Approvals list reuse the Queue row-card + Investigation patterns and are not separately mocked (no new layout decision).

## 12. Visual System

### 12.1 Color (values are the mockup's `:root` tokens — `.design/exploration/final/mockup.html` is the source of truth; the logo's folded-ribbon mark reads emerald ~`#1E7A58`–`#2D9A70`, so the brand hue sits in the same family without recolouring the logo)

The Expensify-inspired direction (§7) moves the brand mass into a **dark emerald sidebar** and puts the work on a **warm cream canvas**, so emerald is felt as the product's frame while staying rationed inside the content (one primary action per screen).

**Light theme**
| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#f8f7f3` | app background (warm cream) |
| `--surface` | `#ffffff` | cards, row-cards, tables |
| `--surface-sunken` | `#f1efe8` | table headers, KPI strip, filter panel, skeletons |
| `--border` / `--border-strong` | `#e4e1d8` / `#cdc8bb` | hairlines / input + secondary-button borders |
| `--text` / `--text-muted` | `#17221c` / `#53605a` | primary / secondary text (muted ≥ 4.5:1 on canvas) |
| `--brand` | `#1f7a4d` | **primary action**, links, focus ring, active segment |
| `--brand-strong` | `#145c38` | primary hover |
| `--brand-tint` | `#e6f3ec` | Next-step callout, selected row, subtle brand fill |
| `--on-brand` | `#ffffff` | text on `--brand` |
| `--rail` / `--rail-active` | `#0f3d29` / `#1c5a3e` | sidebar background / active nav item |
| `--rail-text` / `--rail-muted` | `#f3f8f5` / `#b9d4c5` | sidebar labels / group headings + footer |
| `--disabled-bg` / `--disabled-text` | `#ebe8e0` / `#6b736e` | disabled-with-reason controls (no hover change) |

**Dark theme** (applied by `prefers-color-scheme` unless the user picks Light, and by the explicit Dark toggle)
| Token | Hex |
|---|---|
| `--canvas` / `--surface` / `--surface-sunken` | `#0f1613` / `#17201c` / `#121a16` |
| `--border` / `--border-strong` | `#283531` / `#3a4944` |
| `--text` / `--text-muted` | `#e7f0ea` / `#a9b8b0` |
| `--brand` / `--brand-strong` / `--brand-tint` | `#3fae79` / `#6fcc9a` / `#173326` |
| `--on-brand` | `#06140d` (dark text — white on `#3fae79` is only 2.8:1) |
| `--rail` / `--rail-active` / `--rail-muted` | `#0a2419` / `#17402d` / `#9fc2af` |
| `--disabled-bg` / `--disabled-text` | `#222c28` / `#93a29a` |

**Priority / status (semantic; always icon-or-dot + text label, never colour-only):**
| Token pair (fg / bg) | Light | Dark | Meaning |
|---|---|---|---|
| `--high` / `--high-bg` | `#b3261e` / `#fbe9e7` | `#ff8a80` / `#3a1f1d` | High priority, failing check, error |
| `--med` / `--med-bg` | `#8a5a00` / `#fdf1dc` | `#e8b35c` / `#3a2e18` | Medium priority, needs review, warning |
| `--low` / `--low-bg` | `#3a6b52` / `#e8f2ec` | `#7fcba0` / `#16302a` | Low priority, passed check, verified |
| `--disp` / `--disp-bg` | `#5b5f7a` / `#ececf2` | `#a9acc9` / `#23263a` | Disputed / excluded (deliberately not red: it's a parked state, not an alarm) |

Emerald `--brand` is reserved for: the single primary action per screen, links, the focus ring, active segment/nav, and the Next-step callout tint. It never colours table stripes, chart decoration or arbitrary chrome (brief: "Do not colour every component green"). The rail is the one large emerald surface, and it carries navigation only.

### 12.2 Logo treatment (open question, resolved)

The logo file (`public/brand/verilane-logo.png`, 2172×724 RGBA, transparent, near-black wordmark) is **never redrawn, recoloured, cropped or stretched**. Because the sidebar is dark emerald in **both** themes, the logo always sits on a **white backing card** (`#ffffff`, radius `--r-md` 10px, padding 8×10px, max width 150px; 104px in the mobile top bar). The near-black wordmark keeps full contrast regardless of theme. This is a treatment *behind* the logo, not a change *to* it. The PWA app icon (§13.6) applies the same rule.

### 12.3 Typography

```yaml
typography:
  display: system serif stack — "Iowan Old Style", "Charter", "Source Serif 4", Georgia, serif
           used ONLY for page h1s, KPI values and the document-card amount (Expensify's serif-headline pattern, §7)
  ui: system sans — ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial — weights 400/500/600
  mono: ui-monospace, "SF Mono", Menlo, Consolas — invoice numbers, provenance lines (Source · Row · Field), references; tabular-nums on all money
  scale: 12 (min, labels/provenance) / 13 / 14 (base) / 16 / 20 / 28 / 34px (h1, clamp-bounded)
  heading_line_height: 1.15
  body_line_height: 1.5
  measure: prose blocks (reminder draft, dispute text, Next step) capped ~70ch
  wrap_strategy: text-wrap balance on headings
```
System stacks only: no webfont download, which matters for a PWA's offline shell and first paint. The serif display is the one expressive move and gives Verilane a "financial document" register distinct from a default SaaS sans. It is never used for body copy, tables or buttons.

### 12.4 Surfaces & shape

```
Canvas (cream) → page background; no card wraps the whole page
White card + 1px hairline, radius 14px (--r-lg) → row-cards, task-feed items, document card, evidence groups, chart cards
Sunken fill → table headers, KPI strip, filter panel
Radius 10px (--r-md) → inputs, segmented controls, logo card, callouts
Pill (999px) → all buttons and priority/status chips (Expensify button language)
Elevated (one soft shadow) → menus, popovers, dialogs, toasts only
Sticky → top bar; queue column header
No glass, no gradient, no glow
```
Evidence is shown **inline** on the Investigation page as grouped tables (§13), not in a drawer.

### 12.5 Iconography

Lucide, one family, 1.5px stroke, 16px inline / 20px standalone. Icons pair with a text label in every status/semantic use (never icon-only for meaning-bearing state). Icon-only buttons (the 72px tablet rail, row overflow) get an `aria-label` and a tooltip.

## 13. App Shell, Navigation & Responsive Behavior

**Desktop (≥1280px):** fixed **216px dark emerald sidebar** with the logo card, an "AR · Demo workspace · {role}" header and the nav from §5 (Home · Queue · Disputes · Payments · Drafts · Audit log · Settings, with count badges on Queue, Disputes and Drafts), plus a footer showing the frozen as-of date. A sticky top bar holds breadcrumb/page title, the DEMO DATA badge, the Analyst/Manager segmented switcher, the Simulated/Live LLM label and the theme toggle. Content sits on the cream canvas. Investigation is two columns: the document + evidence on the left, and checks + activity on the right.

**Compact desktop (1024–1279px):** same shell. The Investigation and Home grids collapse to a single column (checks and activity follow the evidence).

**Tablet (768–1023px):** the sidebar becomes a **72px icon rail** (labels in tooltips + `aria-label`; the logo card shrinks). Queue row-cards reflow from one aligned line to a **two-line card**: customer + amount on line 1, invoice no., days overdue, priority chip and action on line 2. The column header is hidden because each value carries its own label.

**Mobile (<768px, verified at 390):** the rail becomes a **top bar** (logo card + DEMO badge + role switcher + theme toggle), with a **4-item bottom tab bar** (`Home · Queue · Disputes · More`, 48px targets; Payments, Drafts, Audit log and Settings sit under More) for primary navigation. There is no hover flyout. Gutters are 16px, the KPI strip becomes 2×2, and the queue is the two-line card list. **Queue density decision (open question, resolved):** a single aligned row-card list on desktop and two-line cards below 1024px. Nothing ever scrolls horizontally (NFR6).

**Evidence provenance placement (open question, resolved — changed from the first draft's drawer):** evidence is **inline**, on the Investigation page itself, as three grouped tables (*Invoice facts*, *Communication*, *Payments*). Each value has a mono provenance line directly under it (`Source: invoices.csv · Row 142 · Field: amount_due`). The reason: in Expensify's report pattern (§7) the line items *are* the document, and in Verilane the evidence *is* the reason the action is safe, so it should not be one click away. The drawer is dropped, which removes a layer and a focus-management surface. On mobile the tables stack as label/value lists with the same provenance line.

### 13.6 Progressive Web App (new — added by the user mid-Stage-3)

Verilane ships as an installable PWA on top of the existing architecture (S9's per-visitor IndexedDB is already offline-shaped — this is additive, not a re-architecture). Four decisions, made here because they change layout/chrome, not just config:

- **Installability:** a standard web app manifest (`display: standalone`, `theme_color` = `--rail` (`#0f3d29`, matches the sidebar so the standalone title bar reads as part of the shell), `background_color` matching the splash). The install affordance is **never a modal or a nag banner** — it's a small, dismissible one-time header chip ("Install Verilane") plus a permanent entry under Settings → "Install app." Dismissing it once suppresses it for the session (per the Ethical Behavioral Design Gate, §9 — no re-prompt pressure).
- **App icon (maskable):** derived from the same unaltered logo file, but because OS home-screen icons need a safe-zone crop (maskable icon spec requires ~40% safe padding), the icon is the logo's mark (not the full wordmark lockup, which doesn't read at icon size) centered on a white safe-zone square (the same white backing as §12.2's logo card) inside a `--rail` emerald maskable frame with generous padding — a **treatment around** the mark, exactly analogous to the dark-mode logo card in §12.2, never a redraw of the mark itself. The full wordmark lockup remains the only thing used in-app chrome.
- **Offline behavior:** this is a read-mostly demo already backed by IndexedDB, so going offline mid-session degrades gracefully rather than breaking. A persistent, calm header banner ("You're offline — viewing cached data; some actions are paused") appears; already-loaded queue/investigation/dispute data stays fully browsable; state-changing actions that would need the service worker/network (CSV import, Reset Demo Data, Live LLM calls if ever enabled) are disabled with a reason, not hidden. This is the PWA analogue of the existing SR9 storage-fallback banner — same visual pattern, reused rather than invented.
- **Splash/start screen:** the OS-generated splash uses the manifest's `background_color` (`--canvas` `#f8f7f3`) and the maskable icon — no custom splash illustration is built (anti-direction: no decorative asset for a moment the user sees once).

These are Stage-3 **intent** decisions (what the install/offline/icon experience is); the manifest file, service-worker caching strategy (cache-first for the shell + seed assets, since they're static and versioned) and exact Workbox/next-pwa config are Stage 5/6 implementation detail and do not get decided here.

## 14. Component & Interaction Specs (representative, non-exhaustive — full inventory is a Stage 6 implementation detail)

- **Priority badge:** colored dot/icon + text label (`High` / `Medium` / `Low` / `Needs review` / `Disputed` / `On hold`), never color-only.
- **Queue row-card:** 64px white hairline card. Columns: priority chip · customer (+ invoice no. in mono) · amount (tabular) · days overdue · recommended action · status. The whole row is one link to Investigation, and focus wraps the whole card. The uppercase column header sits above the list, not in each card. A collapsible **"Hide filters"** panel (search, priority, status, customer, ageing) sits above the header and shows its active-filter count when collapsed.
- **Task-feed item (Home "Needs your attention"):** a `<details>` card with a chevron. The summary is a count + verb sentence ("12 high-priority invoices need a decision") and expanding it lists the top items with a link into the filtered queue. Keyboard-native, with no custom disclosure JS.
- **KPI strip:** four sunken cells with a serif value and a 12px label: Outstanding, High priority, Open disputes, Avg days overdue.
- **Action bar (Investigation):** pill buttons, right-aligned: secondary actions (Mark disputed, Edit draft), then **one** primary (Submit for approval for an Analyst, Approve & send for a Manager). When blocked, the primary is disabled-with-reason and the reason shows inline next to it ("1 pre-approval check is failing"), not only in a tooltip.
- **Next-step callout:** a `--brand-tint` band directly under the header that says, in one sentence, what has to happen next and why (e.g. confirm whether NEFT/ACME/0142 is a duplicate payment). Adapted from Expensify's "Next step:" line.
- **Document card:** From (Verilane Collections) → To (customer) with the amount in serif, invoice no., due date, days overdue, and the priority score with its band and contributing factors listed (the reason, not just the number).
- **Evidence table + provenance line:** grouped tables (Invoice facts / Communication / Payments). Each row is label · value, with `Source: {file} · Row/Email: {id} · Field: {field}` in 12px mono under the value and a validation chip (`Verified`/`Conflict`/`Missing`) where relevant.
- **Pre-approval checks (violations pattern):** the header reads "8 of 9 passed". Failing checks list **first**, expanded, with the reason and a fix link; passed checks follow, collapsed to one line each. A single pass/fail pill is never used: the analyst needs to see which check failed.
- **Activity log + note box:** a reverse-chronological audit list (actor · action · time) with a plain note textarea under it. This is an audit trail, not a chat: there are no avatars, typing indicators or AI replies.
- **Disputed-invoice state in queue:** row is visually de-emphasized (muted, not hidden) with a `Disputed — excluded from queue` badge and a link into the dispute record, never silently removed.
- **Approve action:** requires explicit confirmation (System-2 friction, brief's finance-operations register) — a lightweight confirm step naming the invoice/customer/amount, not a bare button that fires immediately, and is disabled-with-reason for Analysts on >₹5,00,000/ambiguous items (S4/FS13).
- **Toast on approve/send:** names the action truthfully: *"Reminder for INV-00142 (Acme Textiles) approved and sent (simulated)."*
- **Install chip** (PWA): dismissible, one-time, header-level — see §13.6.
- **Offline banner** (PWA): persistent while offline, same visual treatment as the SR9 storage-fallback banner — see §13.6, §16.

## 15. Chart Specifications (Home — anti-slop gate applied: every chart answers a named question)

| Chart | Question it answers | Type |
|---|---|---|
| Outstanding by ageing bucket | Where is the money stuck? | Horizontal bars, buckets 1–15 / 16–30 / 31–60 / 60+ days overdue, ₹ value labelled at bar end |
| Priority mix of the queue | How much of the queue is urgent? | One 100% stacked bar: High 12 / Medium 19 / Low 14 / Disputed 3, with a labelled legend (never colour-only) |

Two charts, not four. The Expensify-style Home leads with the **task feed** ("Needs your attention"), so the charts are context, not the headline. The first draft's status donut duplicated the priority mix, and its weekly-activity line had no decision attached, so both were cut (anti-slop: no chart without a question). Each bar links into the queue pre-filtered to that bucket or band.

## 16. Error Strategy & Trust/AI-Epistemic UX

- Every AI-authored field (extraction, classification, drafted text, recommended action) carries its `Simulated`/`Live LLM` label and, where relevant, a link to the evidence behind it (A3/A6) — never a bare confidence number.
- Non-matches, ambiguous matches and missing-info cases are shown as an explicit **Needs review** state with the reason, never silently dropped or guessed (A5).
- Provider/storage failures (SR9) show a persistent, non-dismissible-until-resolved banner: *"Changes won't survive reload — storage unavailable."*
- **Offline (PWA, §13.6)** shows the sibling banner *"You're offline — viewing cached data; some actions are paused"*; the two banners never stack (offline takes precedence since storage fallback is moot without a reachable network to fail against).
- CSV import errors are row-level and block the whole file on schema failure (SR11), shown as a list the user can scan, not a single generic error.

## 17. Accessibility (WCAG 2.2 AA) — Review Checklist

```
[x] semantic order + heading hierarchy — one H1 per route, landmark nav/main/aside
[x] keyboard path through primary task — queue → row → investigation → draft → approve, no mouse-only step
[x] visible focus on every surface — 2px high-contrast focus ring, tested on brand/surface/elevated
[x] focus not obscured by sticky UI (2.4.11) — scroll-padding-top accounts for sticky header height
[x] targets ≥ 24px, primary touch ~44px — table row actions and mobile card taps sized ≥44px
[x] reflow at 320px, text at 200% — queue becomes card list; type scale is clamp-bounded
[x] reduced-motion behaviour defined — task-feed chevron rotation and toast fade skipped under prefers-reduced-motion, state still communicated instantly
[x] color independence — every semantic/priority state pairs icon + text label
[x] drag alternatives (2.5.7) — no drag interactions exist in this product
[x] form labels + error recovery — CSV import and Settings forms use visible labels, inline row-level errors
[x] media alternatives — no video/audio content in this product
[x] tab order matches visual order at each breakpoint — verified in mockup at desktop/tablet/mobile
```
All boxes pass; none require a justification exception.

## 18. Four Screen States (per data view, per NF5)

Demonstrated concretely in the mockup's *States* panel (§11, item 5), which has Offline / Install prompt / Storage fallback toggles and specified for every other data view:

| View | Loading | Empty | Error | Working |
|---|---|---|---|---|
| Collection Queue | skeleton row-cards (row shape preserved) | two variants: *filtered* — "No invoices match these filters" + Clear filters; *no data* — "No invoices yet" + Import CSV / Load demo data | row-level CSV error list (row, field, reason) + retry; storage failure → banner | ranked row-cards, filterable |
| Home | skeleton KPI strip + task cards + chart blocks | "Nothing needs your attention" (plain, no celebration) | per-block inline error, rest of page unaffected | KPIs + task feed + 2 charts |
| Investigation | skeleton document card + evidence tables | n/a (reached only from an existing row) | "Couldn't load INV-…" + back to queue | full report layout |
| Disputes | skeleton list | "No open disputes" (a true empty state, not a fake celebration) | load error banner + retry | dispute list |
| Review & Approvals | skeleton list | "Nothing waiting for approval" | load error banner + retry | item list with action buttons |

**Fifth, PWA-specific state — Offline:** every data view above still renders its `Working` state from already-loaded IndexedDB data while offline; the difference is the persistent offline banner (§16) and state-changing controls (import, reset, approve-if-it-ever-needed-network) disabled-with-reason. This is not a fifth row per view — it's an overlay condition on top of whichever of the four states is otherwise true.

## 19. Interaction-Cost Analysis

Primary task (approve a standard reminder) cost: 1 click to open queue item (already on Queue) → evidence already visible inline on the Investigation page (no drawer, no extra click) → 1 click to generate/accept draft → 1 confirm click to approve → done. Four interactions from queue row to sent, matching the brief's trust-walk (S6) without padding.

## 20. Validation Plan

- Grayscale/wireframe test, beauty-masking test, 20-SaaS test — run in §21 before approval.
- `impeccable detect` static pre-check on `.design/exploration/` — must exit clean (it caught on-brand contrast, disabled-hover contrast, sub-12px text and a heading skip; all fixed).
- Responsive: rendered at 1440 / 1280 / 768 / 390 with a scripted scrollWidth = clientWidth check on all five panels (no horizontal scroll), plus screenshots in light and dark.
- Accessibility: checklist in §17 reviewed against the rendered mockup (axe automation happens at Stage 8, per `web-deliverables.md`'s evidence rule — Stage 3 reviews the static mockup by inspection).
- Keyboard pass and reduced-motion check on the `final/` mockup.
- Offline banner and install chip reviewed visually in the mockup (functional service-worker behavior is a Stage 6 test, per `t-design`'s boundary rule — Stage 3 fixes the *intent*, not the implementation).

## 21. Design QA Checklist (Anti-AI-Slop Gate, `anti-ai-slop.md §8`)

```
## Structure
[x] grayscale test passes — row-cards, chips (dot + label), serif h1 vs sans UI and the dark rail all read without colour
[x] primary goal obvious — "work this queue item" on every screen
[x] task model coherent — queue → investigate → draft → approve → audit, consistent across screens

## Product Specificity
[x] 20-SaaS test passes — per-value provenance lines, 9 pre-approval checks shown as violations, the Next-step callout naming a real payment reference and the gate-based priority reason are Verilane-specific, not swappable
[x] terminology is product-specific — "Collection Queue," "Priority band," "Evidence," "Simulated send"
[x] visual direction reflects domain/user/task — money-document register (serif figures, cream paper canvas), mono provenance, restrained emerald; Expensify patterns borrowed, Expensify branding not
[x] anti-direction explicit — §1

## Components
[x] no card-everything — cards only where a record is the unit of work (row-card, task item, evidence group); queue rows share one column grid
[x] components have interaction reasons — inline evidence (it is the justification), `<details>` for the task feed (progressive disclosure), dialog for confirm (consequential action)
[x] badges are semantic — priority/status/validation badges map to real states
[x] icons improve comprehension — paired with labels, one family

## Visual
[x] gradients — none used, N/A
[x] glass — none used, N/A
[x] radius intentional — 14px cards / 10px controls / pill buttons + chips, one system (Expensify's soft-document language), not mixed ad hoc
[x] shadows communicate depth — reserved for overlays/menus only
[x] typography reflects identity — serif display for figures and h1s only, system sans UI, mono provenance; no webfont
[x] color has semantic logic — §12.1

## Copy
[x] no generic AI marketing language — verified against §10
[x] CTA text describes the actual action
[x] metrics are real — all Home numbers derive from the seed dataset, no invented metric
[x] labels correspond to real domain objects

## AI
[x] processing states truthful — no fake "AI thinking"; simulated mode is near-instant and labelled as such
[x] sources/provenance shown where needed — inline provenance line under every extracted value
[x] uncertainty communicated — Needs review / Unknown / Ambiguous states, never hidden
[x] consequential actions confirmed — approve requires explicit confirm step

## Responsive
[x] mobile has its own task model — two-line cards + bottom tab bar, not a squeezed list
[x] tablet defined — §13
[x] desktop defined — §13

## Motion
[x] every major animation has communicative purpose — task-feed chevron (open/closed state), toast (feedback/completion); nothing else moves
[x] reduced-motion defined — §17

## Scroll
[x] native scroll considered first and used — no scroll-jacking, no parallax, no snap, no custom scroll system anywhere

## PWA (added for this product)
[x] install affordance is non-nagging, dismissible, no modal interrupt — §13.6, §9
[x] offline state is truthful, not a fake "still working" illusion — §13.6, §16
[x] app icon is a safe-zone treatment around the unaltered logo mark, not a redraw — §13.6
```
No Web-experience, Product-journey or Spatial-3D blocks apply (Core surface, no 3D) — see §2.

## 22. Social Preview / OG (public deploy — `web-deliverables.md §4`)

The deployed demo is publicly reachable on Vercel (S3), so one OG image is produced for the root URL per `~/.claude/workflow/og-image-guidelines.md`. Composition (open question, resolved): the Home screen's queue-ranked framing, rendered as a clean product shot — Verilane wordmark top-left, tagline *"Every collection action has evidence. Every uncertain decision has a human."*, and a cropped, legible fragment of the Collection Queue showing 3–4 real rows with a visible priority badge and evidence link — not an abstract gradient card. 1200×630, absolute HTTPS asset URL, to be built and approved in `.design/exploration/og/` **before Stage 10 deploy** (deferred at the 2026-10-30 freeze; tracked in `HANDOFF.md`).

## 23. Open Questions Resolved (carried from `HANDOFF.md`, plus the PWA addition)

| Question | Resolution | Section |
|---|---|---|
| Dark-mode logo treatment | White backing card behind the unaltered logo, in both themes (the rail is dark emerald in both) | §12.2 |
| Queue density/table vs card at 390px | Aligned row-card list ≥1024px; two-line cards below 1024px | §13 |
| Evidence provenance inline vs drawer | **Inline** grouped tables with a provenance line under every value (changed from drawer after the Expensify redirect) | §13 |
| Visual reference (added 2026-10-30 by the user) | Expensify web patterns via Mobbin; Verilane brand + content kept | §7 |
| OG image composition | Real queue-screen fragment + wordmark + tagline (image itself deferred to before Stage 10) | §22 |
| **PWA install/offline/icon** (added mid-Stage-3 by the user) | Non-nagging install chip; graceful offline overlay on existing four screen states; maskable icon = safe-zone treatment around the unaltered mark | §13.6 |

## 24. Design QA Checklist

See §21 (Anti-AI-Slop Gate, including the PWA block) and §17 (Accessibility). Both pass in full; no outstanding justifications.

---

## §25 Web Experience — N/A

Verilane is a Core surface (§2), not a Web or Product-Journey surface — no marketing/landing page, no conversion funnel, no public-vs-authenticated seam exists in the product itself. Being installable as a PWA (§13.6) is an app-shell delivery decision, not a Web-surface reclassification. The one public-facing artifact (the OG image for the demo's shareable link) is covered under §22, not §25.

## §26 Spatial 3D — N/A

No real-time 3D, spatial visualization, product configuration/inspection, WebGL/WebGPU or XR need exists anywhere in Verilane's feature set (charts are 2D/Recharts; no 3D direction was proposed or considered).

## §27 Product Experience — N/A

Verilane has no authenticated product journey distinct from a public acquisition layer (§2) — there is no signup, onboarding or activation funnel to specify.

## Revision R1 — 2026-11-02 (TASK-37, user override)

The user chose to restyle the whole app closer to the Expensify web reference and to review the running app instead of a mockup. This overrides three frozen rules:
- **Shadows:** cards get a soft `shadow-card` (token `--card-shadow`, light and dark values). This replaces "no shadows except overlays/menus".
- **Decorative asset:** a blurred, downscaled Unsplash photo (Bhautik Patel, green glass ribbon; Unsplash license) at `public/bg/canvas-blur.webp` sits fixed behind all content. Opacity is 0.85 in light and 0.18 in dark, set by `--canvas-art-opacity`. It is not precached for offline use.
- **Frosted glass:** cards use the `glass` utility instead of solid `bg-surface`. It is a translucent `--glass` fill (white at 62% in light, `#17201c` at 58% in dark) with a 16px backdrop blur. Inputs, menus and dialogs keep solid surfaces. KPI tiles, home charts and chart tooltips are glass too; chart bars use a glossy 3D glass gradient (`GlassGradient.tsx`).
- **Queue rows:** these are now separated row-cards with an 8px gap, replacing the single fused list.

Also: the sidebar and icon rail are now sticky at full viewport height, and the top bar is translucent (`bg-canvas/75` + blur).
