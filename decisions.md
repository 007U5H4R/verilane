# Decision Log — Verilane

## S1 · Gate cadence: approve at Stages 1, 2, 3 and 9 — accepted
**Context.** The brief says "do not stop at planning"; the build-workflow mandates a human gate after every stage.
**Decision.** Human gates at Stage 1 (Discovery-PRD), Stage 2 (Solution-PRD), Stage 3 (Design.md + HTML mockup) and Stage 9 (QA-report). Stages 4–8 run straight through. Stage 10 deploy is outward-facing and is confirmed at the Stage 9 gate.
**Rejected.** Eleven gates (too slow for a brief that demands a running product); zero gates (problem, solution and visual direction are the user's decisions).

## S2 · Track in Campfire as project `verilane` — accepted
**Context.** Repo was empty and unregistered; global rules require a ticket per request in registered projects.
**Decision.** `git init`, `backlog init`, registered in `projects.json` as `verilane`. TASK-1 tracks Stage 1.
**Rejected.** Untracked build.

## S3 · Audience and surface: portfolio demo, local + public Vercel — accepted
**Context.** Audience drives success criteria, auth, and deploy scope.
**Decision.** Portfolio/demo piece that runs locally and is deployed publicly on Vercel at Stage 10 with OG/Twitter link previews. No real auth; a demo role switcher.
**Rejected.** Pilot-grade internal tool (needs real auth, durable multi-user storage — out of proportion for a demo).

## S4 · Persona permission split — accepted
**Context.** The brief forbids assuming identical permissions for Analyst and Manager.
**Decision.** Analyst: investigate, generate/edit/submit drafts, approve standard reminders, flag/propose dispute resolution. Manager: all analyst rights + resolve/reject disputes (only path back to the reminder queue) + approve escalated items (ambiguous matches, conflicting payment info, reminders > ₹5,00,000) + team workload view.
**Rejected.** Identical permissions; manager-approves-everything (would make the analyst persona inert).

## S5 · AI mode: deterministic demo mode gates, live Claude optional — accepted
**Context.** Brief requires a no-key demo mode and an env-configurable provider; eval results must be reproducible.
**Decision.** Acceptance targets are measured in deterministic demo mode. Optional live Claude provider via env var; outputs labelled Simulated / Live LLM; when a key is present the eval suite also runs live and reports alongside, ungated.
**Rejected.** Gating on live-LLM results (non-reproducible, needs a key to pass CI).

## S6 · Primary success measure: the end-to-end trust walk — accepted
**Context.** Need one measurable definition of "the product works" beyond feature count.
**Decision.** Queue → high-priority invoice → evidence to source → draft → validation → approve → simulated send → disputed invoice blocked/escalated → all in Audit Log, in the running app with no dead controls; plus the brief's eval targets.
**Rejected.** Feature checklist alone; dashboard-centric metrics.

## S7 · Canonical Discovery PRD lives at project root — accepted
**Context.** Brief asks for `docs/Discovery-PRD.md`; the build-workflow's canonical artifact is `Discovery-PRD.md` at root. One fact, one place.
**Decision.** `Discovery-PRD.md` at root is canonical; the brief's other docs (`docs/Architecture.md`, `docs/Data-Model.md`, `docs/AI-Evaluation.md`, `docs/Design-System.md`, `docs/Product-Requirements.md`) are produced in Stages 2–3 and link back to it.
**Rejected.** Duplicating the PRD in two locations.

## S8 · Stack: Next.js App Router + pure-TS domain engine — accepted
**Context.** The brief prefers Next.js/React/TS/Tailwind/shadcn. The trust guarantees need deterministic, testable logic that sits apart from the UI.
**Decision.** Next.js (App Router), React, TS strict, Tailwind, shadcn/ui, Lucide, Recharts, TanStack Table, Zod, Papa Parse, Dexie; pnpm; Vitest (unit + eval); Playwright (e2e + axe, temp and browsers on the E Drive). The domain engine in `src/domain/**` is pure TS, and lint forbids it from importing React/Next/Dexie/DOM.
**Rejected.** A separate backend service (no need at demo scale); Python for the domain (a second runtime, and the UI couldn't call it directly).

## S9 · Storage: zero-cost, per-visitor IndexedDB seeded from committed CSVs — accepted
**Context.** The user's constraint is to spend nothing. Storage has to work both locally and on Vercel, and Vercel's filesystem is ephemeral.
**Decision.** Seed CSV/JSON is committed in `public/seed/` and loaded into IndexedDB (Dexie) per visitor. Reset re-seeds. If storage is unavailable the app falls back to in-memory state behind a visible banner. Runs on Vercel Hobby at ₹0.
**Rejected.** Neon/Turso/Supabase free tiers (they need an account and a secret, and carry pause or overage risk); SQLite on Vercel (ephemeral filesystem); a dual local-DB/browser adapter (two code paths for no demo benefit).

## S10 · Live Claude is local-only and optional; public deploy is demo-only — accepted
**Context.** S5 makes live mode optional. Zero spend, plus no secret on a public surface.
**Decision.** `/api/llm/*` route handlers use `@anthropic-ai/sdk` structured outputs (`messages.parse` + `zodOutputFormat`). The model comes from `VERILANE_LLM_MODEL` (default `claude-opus-5-5`). They return 503 unless `ANTHROPIC_API_KEY` and `VERILANE_LIVE_LLM=1` are both set, and the key is server-side only. Vercel has no env vars set. A refusal or invalid output is rejected and goes to review.
**Rejected.** Live LLM on the public deploy (spend, abuse, secret exposure); calling the API from the browser (key leakage).

## S11 · Priority engine `priority.v1` with a frozen demo clock — accepted
**Context.** F3 needs explainable priority, and NF2 needs reproducibility.
**Decision.** Gates G1–G7 run first: closed, unknown status, missing field, open dispute, payment claim/conflict, not due, active promise with 3-day grace. Otherwise the invoice is scored: days overdue 10/20/35/45 + amount 5/12/20/30 + customer behaviour 0–15 + broken promise +10. Bands are High ≥55, Medium 30–54, Low <30. Ties break on score → days overdue → outstanding → invoice number. Config is versioned. `AS_OF_DATE = 2026-10-30`, with a per-browser override.
**Rejected.** An LLM-ranked queue (not reproducible and not explainable); a real-time clock (eval and demo would drift daily); weights editable in the UI (unversioned changes).

## S12 · Rule-based multi-signal extraction + strict matching — accepted
**Context.** A demo mode with no key needs credible extraction that is "not keyword-only" (brief), and matching errors are the costliest failure (FS3/FS4).
**Decision.** The extractor combines typed regex tokens (refs, INR amounts incl. lakh, dates) with phrase families that carry negation/hedging guards. A class requires a signal plus a supporting token. Precedence is dispute/duplicate > confirmation > commitment > delay > enquiry. The matcher requires sender identity **and** an exact normalised invoice reference owned by that customer. Outcomes are matched / ambiguous / customer_only / unresolved; transpositions are flagged and never accepted, and every non-match goes to review.
**Rejected.** Fuzzy/edit-distance or embedding matching (silent wrong matches); single-keyword classification.

## S13 · Eval harness: Vitest, independent labels, held-out set, fault injection — accepted
**Context.** The Discovery §8.2 targets must be measured honestly, not self-graded against the extractor's own output.
**Decision.** `pnpm eval` runs offline over hand-authored seed labels, a 30-thread held-out set written before the rules are frozen, ≥20 draft cases and a fault-injecting provider. It writes `eval/report.json`/`report.md` and exits non-zero on any gate miss (amount 100%, invoice no. 100%, unsupported claims 0, unambiguous matching 100%, dispute recall ≥95%, approval enforcement 100%). `pnpm eval:live` is opt-in (`--yes`); it reports results and does not gate.
**Rejected.** Labels derived from system output; gating on live results; an LLM-as-judge (non-deterministic, costs money).

## S14 · Invariants in one write path; client is the disclosed trust boundary — accepted
**Context.** With no server database there are no SQL constraints, so invariants still need a single enforcement point.
**Decision.** All state changes go through `domain/commands.ts`, in order: permission check → allowed transition → audit event. Each command runs in one Dexie transaction. Zod validates every boundary; there is a unique index on `invoice_number`; outstanding is always derived. Docs and the README disclose that client-side permissions can be bypassed in a no-auth demo; a pilot would move commands server-side unchanged.
**Rejected.** Scattered UI-level writes; claiming tamper-proof audit or permissions in a browser-only app.

## D1 · Visual direction: Expensify-pattern "money document you can audit" — accepted
**Context.** Mid-Stage-3 the user redirected the first mockup to take inspiration from Expensify web (Mobbin). Verilane's emerald brand, unaltered logo and content had to stay.
**Decision.** Dark emerald 216px sidebar on a warm cream canvas; system-serif display reserved for h1s, KPI values and amounts; pill buttons and chips; radius 14/10; brand emerald rationed to one primary action per view. Tokens live in the mockup `:root`, mirrored in `docs/Design-System.md`.
**Rejected.** The first-draft dense neutral table UI (generic); cloning Expensify branding, Concierge chat FAB, marketing nags or illustrations.
**Evidence.** 9 Mobbin screens cited in Design.md §7.

## D2 · Evidence shown inline with a provenance line under every value — accepted
**Context.** Stage 2 left inline vs. drawer open. The trust claim (every number traces to a source) is the product's core.
**Decision.** The Investigation page shows three grouped evidence tables (Invoice facts / Communication / Payments), each value followed by `Source · Row/Email · Field` in mono. Pre-approval checks use the violations pattern (failing first, "N of 9 passed").
**Rejected.** An evidence drawer (hides the reason the action is safe one click away; adds a focus-trap surface); a single pass/fail pill for checks.

## D3 · IA consolidated to Home · Queue · Disputes · Payments · Drafts · Audit log · Settings — accepted
**Context.** The Expensify-pattern rebuild merged the brief's nine destinations into task-named ones. The user moved to Stage 4 without choosing; this records the recommended option.
**Decision.** Invoices fold into Queue; Email Conversations fold into each invoice's Communication table; Review & Approvals → Drafts; Data Sources → Import data on Queue + Settings (Reset moves to Settings); Payments is new (S12 matcher review queue). `docs/Product-Requirements.md §1` and the `docs/Architecture.md` route list updated.
**Rejected.** Keeping the brief's nine-item IA (duplicated Queue/Invoices; split the email evidence away from the invoice it proves).
**Consequence.** Email classification has no standalone page, so the AI is less visible in the demo. **Reopen if** the user prefers the Stage 2 IA — only the sidebar and routes change, not the layouts.

## D4 · Responsive shell: rail → icon rail → top bar + 4-tab bar — accepted
**Context.** NFR6 / web-deliverables: no horizontal scroll at 1440/1280/768/390.
**Decision.** ≥1280 216px sidebar; 1024–1279 single-column content; 768–1023 72px icon rail with two-line queue cards; <768 top bar + bottom tabs Home · Queue · Disputes · More (48px). Verified in the mockup at all four widths.
**Rejected.** A horizontally scrolling table on mobile; a hamburger-only nav.

## D5 · PWA: non-nagging install, graceful offline, treatment-only icon — accepted
**Context.** The user added the PWA requirement mid-Stage-3.
**Decision.** One-time dismissible install chip + Settings entry (no modal); offline banner reusing the SR9 banner pattern, with state-changing actions disabled-with-reason; maskable icon = the unaltered mark on a white safe zone in a `--rail` frame; `theme_color` = `--rail`; no webfonts.
**Rejected.** Install modals or repeated prompts (ethical gate); a redrawn icon mark.

## D6 · OG image deferred to before Stage 10 — accepted
**Context.** The user moved to Stage 4 before the 1200×630 OG mockup was built; the composition is already decided (Design.md §22).
**Decision.** The OG image is mocked and approved before the Stage 10 deploy and is tracked as a Stage 4 ticket. It is the only open item in the Design Freeze.
**Rejected.** Shipping the public deploy without an approved OG image (web-deliverables gate).

## TP1 · One top-level test command, four layers — accepted
**Context.** Stage 5.5 requires a wired test architecture with a single run command; the build has unit, eval, e2e and static checks.
**Decision.** `pnpm test:all` = typecheck && lint && test && eval && build && check:secrets && build:e2e && e2e. Vitest (projects `unit`, `eval`), Playwright + axe on a production build, fixtures in `src/domain/__fixtures__/`, Playwright browsers and temp on `/Volumes/E Drive/Dev/.scratch`. Each automated case carries its `TC-###` in the test title.
**Rejected.** Separate ad-hoc scripts per layer; e2e against `pnpm dev` (hides production-only failures).

## TP2 · Client-only data hooks; no IndexedDB during SSR — accepted
**Context.** Dexie/IndexedDB does not exist on the server; App Router renders on the server by default (M-001 risk).
**Decision.** Pages are static shells; all data access goes through `'use client'` hooks in `src/hooks/` that open the store after mount and render the loading state until then. `src/domain/` stays pure and never imports the store.
**Rejected.** Server components reading data (no server data exists); dynamic-import tricks per page.

## TP3 · Eval runs as a Vitest project — accepted
**Context.** S13 specifies Vitest; the eval must be deterministic, offline and ≤30 s.
**Decision.** `pnpm eval` runs the `eval` Vitest project, writes `eval/report.json` + `eval/report.md`, exits non-zero on any gate miss, and stubs `fetch` to throw.
**Rejected.** A separate Node script harness (duplicates the runner, loses reporters and filters).

## TP4 · Campfire mapping and the multi-dependency workaround — accepted
**Context.** Stage 5.2 onboarding; the fork's `task create --dep "A,B"` keeps only one parent.
**Decision.** TKT-01…23 → TASK-6…28, milestones M-001…M-006 → m-0…m-5 (recorded in `tickets.md`). Multi-parent deps are set with repeated `task edit --dep`. The bug is reported against the fork, not patched here.
**Rejected.** Hand-editing task files or IDs.

## TP5 · Plan-local sub-step IDs `TASK-N.k` — accepted
**Context.** Atomic 2–5 minute steps need stable references without flooding Campfire.
**Decision.** Steps are numbered `TASK-N.k` inside `technical-plan.md` Part B only; Campfire tracks the ticket. Test cases reference the step (`Rel:` field).
**Rejected.** One Campfire task per atomic step.

## TP6 · No CI in v1 scope — accepted
**Context.** Single-developer portfolio demo on Vercel Hobby; no shared branch traffic.
**Decision.** `pnpm test:all` is run locally before every merge and at Stage 8; Vercel builds only. CI can be added later without changing the command.
**Rejected.** A GitHub Actions pipeline now (setup cost, browser-cache disk use, no consumer).

## TP7 · E2E-only state hooks behind a separate build — accepted
**Context.** Four-state and forced-permission tests (TC-016, TC-039) need to force states and call commands directly.
**Decision.** `?__state=` and `window.__verilane` exist only when `NEXT_PUBLIC_E2E === '1'`, set by `pnpm build:e2e`. The production build is checked to contain neither.
**Rejected.** Shipping test hooks in production; mocking at the network layer only (cannot reach the command path).

## TP8 · Hand-written service worker — accepted
**Context.** D5 needs a small offline cache keyed to the seed version.
**Decision.** A hand-written `public/sw.js` with cache name `verilane-<seedVersion>`, cache-first for static assets and seed, and old caches deleted on activate.
**Rejected.** Workbox / next-pwa (extra dependency and config surface for a few routes).

## EXE1 · Lint excludes the SR2 fixture; TC-002 not yet enforced — accepted
**Context.** `src/domain/__lint__/` holds a deliberately non-compliant fixture that proves the SR2 domain-purity rule fires.
**Decision.** `pnpm lint` ignores `src/domain/__lint__/**`; `pnpm lint:domain-fixture` lints it alone and must fail. The fixture re-exports `useState` instead of calling it, so `rules-of-hooks` cannot mask a missing SR2 rule. The SR2 override in `eslint.config.mjs` is pending the user's edit, and until it lands TC-002 is unenforced (the fixture script exits 0).
**Rejected.** Calling the hook in the fixture (a different rule would fail and hide the missing SR2 rule).

## EXE2 · Tooling additions for parallel execution — accepted
**Context.** The commit hook needs a compact eslint formatter, and parallel worktree agents ran e2e at the same time.
**Decision.** Add the devDep `eslint-formatter-compact`. Add an `E2E_PORT` env (default 3100) so each worktree serves on its own port. Drop `--no-lint` from `build:e2e`, because Next 16 removed the flag.
**Rejected.** A shared e2e port with serialized runs (blocks parallel agents).

## EXE3 · Investigation is a static shell read on the client — accepted
**Context.** Invoice data lives only in per-visitor IndexedDB (S9, TP2), so the server cannot know invoice ids.
**Decision.** `/invoices/[id]` renders a static shell: a Suspense boundary around a client component that reads the id with `useParams`. There is no `generateStaticParams`, so the build reports the route as PPR.
**Rejected.** `generateStaticParams` over the seed (couples the build to the seed and breaks for user-ingested invoices).

## EXE4 · Duplicate `invoice_number` on ingest is a conflict, not an overwrite — accepted
**Context.** The full seed (TASK-8) includes a deliberate duplicate invoice number.
**Decision.** Ingest flags a row whose `invoice_number` duplicates an existing one as a conflict and does not write it. That matches the unique `&invoice_number` index.
**Rejected.** Last-write-wins (silently loses evidence).

## EXE5 · `fake-indexeddb` is a runtime dependency on the fallback path — accepted
**Context.** SR9 (TASK-10) needs in-memory storage when IndexedDB throws.
**Decision.** `fake-indexeddb` moves to `dependencies` and is loaded with a dynamic import only on the fallback path. Users then see a banner saying their changes will not persist.
**Rejected.** A hand-written in-memory store (would duplicate Dexie's semantics).

## EXE6 · Eval label schema and draft-case semantics (TASK-11) — accepted
**Context.** The plan fixed one `invoice_id` per thread label and did not define draft-case semantics.
**Decision.**
- Labels gain two fields. `invoice_ids[]` lists every invoice the thread concerns: candidates for ambiguous matches, both invoices for duplicates, and empty for `customer_only` or `unresolved`. `note?` records why a label was chosen.
- For a duplicate claim, `invoice_id` is the invoice the customer asks to cancel. If they don't name one, it is the later re-issue.
- `ambiguous` is true for every ambiguous outcome. It is also true for `customer_only` when the customer has several open invoices.
- `commitment_date` also holds the claimed payment date for a confirmation or a `payment_already_completed` dispute.
- A DraftCase has `{invoice_id, role, edit?: append | replace_fact, tags, expected: {approvable, must_fail[1–9], requires_manager?}}`. Check numbers follow Architecture.md §7.
- Known gap: the seed has no clean open invoice over ₹5L, so no case covers an analyst blocked only by the manager threshold.
- TASK-12 decides whether the duplicate scorer accepts any id in `invoice_ids`.
**Rejected.** A single `invoice_id` only (cannot score duplicate pairs or ambiguous candidates).

## EXE7 · Queue interaction and state choices (TASK-9) — accepted
**Context.** The plan fixed URL-driven search, facets, sort, paging and four states, but left several behaviours open.
**Decision.**
- Every filter, sort and page control builds on `filterIntent.ts`. It holds the latest requested filters until the URL catches up, so rapid clicks don't drop each other (fix round 1). It follows the URL again on Back or a shared link.
- Sort is a select, not sortable column headers.
- A page number past the filtered results clamps to the last page.
- Error-state Retry reloads the page.
- The `?__state=` hook works only when `NEXT_PUBLIC_E2E` is set and is checked at runtime.
- The sidebar Queue count is live via `QueueCount`. The Disputes and Drafts counts stay hard-coded until their tickets.
- `loadDemoData` was added to the store for the empty-state action, and `BAND_LABELS` is exported.
**Rejected.** Waiting for the URL between clicks in tests (hides a real user bug).

## EXE8 · Simulated extractor contract (TASK-12) — accepted
- Provider `mode` is `'simulated'` (plan said `'demo'`), which matches the UI label.
- The provider interface has no `ctx` parameter and no `draft()`. Drafts are TASK-15.
- Extraction runs synchronously inside the recompute Dexie transaction. TASK-23's live provider must extract **outside** the transaction (async network inside an IndexedDB tx auto-commits it).
- Duplicate scoring (EXE6 open point): a predicted duplicate counts as correct if it names any id in the label's `invoice_ids`.
- Seed eval: amount/ref exact match is 100% on all 25 threads, and nothing in `src/` reads the label files (checked by grep at merge).

## EXE9 · Settings and data ops (TASK-19) — accepted
- CSV import drops `outstanding_amount`, so imported data never raises FS8 (conflict). This is a known gap: R1's G5 gate only fires on seed data. Parked for the close-out wave.
- A rejected import is still audited (`import_rejected`, no writes). Duplicate `invoice_number` values are caught in validation, not by a Dexie ConstraintError.
- `reset_demo` keeps the role and clears the as-of override and the audit log, so `demo_reset` is the first event. `set_as_of(null)` stores `AS_OF_DATE`.
- `loadDemoData` is removed. Queue "Load demo data" now goes through the audited `reset_demo` (M-001 R5). The seed transaction re-checks `seedVersion` and clears `dataIssues` first (M-001 R4, regression test included).
- `recompute()` transaction scope gains `meta` (stored as-of). At the merge it was unioned with TASK-12's `emails` + `extractions`.
- PriorityWeights (Settings) is read-only and duplicates the priority.v1 weight constants so `priority.ts` stays with TASK-13. If TASK-13 changes the weights, this copy must change too.
- TC ids follow test-cases.md (TC-057–061), not tickets.md.
- Open: after an import, workflow rows (notes, drafts, matches) can point at invoices that no longer exist; ThemeControl shows "Match system" when storage is unavailable; `/settings/eval` is a placeholder until TASK-21.

## EXE10 · Matcher, review items and gates (TASK-13) — accepted
- FS6 (duplicate claim) gates at **G5**, per technical-plan and TC-033. Architecture §5.1 says G4. The plan wins; the doc fix is parked for the close-out wave.
- Matcher: a duplicate claim over owned refs matches the later re-issue. An unknown ref plus an owned ref is **ambiguous**, never partial. A rejected extraction's refs are ignored. An unknown sender is `unresolved`, and the invoices it cites are listed as candidates.
- The G5 DataIssue gate is limited to `outstanding_amount` conflicts. `invoice_number` conflicts are data-quality issues only. A resolved or rejected Dispute suppresses the email's dispute signal.
- Every matched payment confirmation with outstanding > 0 raises a reconciliation item, exact-amount claims included (E-006/008/010). The latest commitment date in an email decides. An overpaid invoice (negative outstanding) closes at G1 (M-001 R12).
- Review items are workflow rows. `recompute()` upserts them, keeps their `status`, drops stale open email items and keeps closed ones as history. `recompute()` scope is now `recomputeTables()`; the seed transaction uses the same list, and the R4 guard was kept at the merge.
- No priority weights changed, so EXE9's Settings copy stays valid. Seed INV-A now scores 70 (broken promise +10).
- Open: for an unmatched item, "Open email" links to the first candidate's Communication section, which is not guaranteed to list that email (needs a per-email view). Hash links may not auto-scroll on client pages.

## EXE11 · Draft, nine checks, Investigation action bar (TASK-15) — accepted
- The Manager primary "Approve & send" and "Mark disputed" both take optional `onApprove`/`onMarkDisputed` props on `InvestigationView`/`ActionBar`, disabled with an inline reason until TASK-16/TASK-17 pass them in. `mark_disputed` is still `notYet("TASK-17")`.
- "Generate draft" is an outline button inside the draft panel's empty state, not a second primary; the action bar keeps exactly one primary.
- The primary uses `aria-disabled` (not `disabled`) so it stays focusable and its reason is reachable by keyboard/screen reader; `onPrimary` no-ops while blocked. E2E needs `click({force:true})` to exercise that no-op.
- Fix links per failed check: check 6 → "Review disputes" (`/disputes`, a ComingSoon page until TASK-17), check 7 → "Review payments" (`/payments`), check 9 → inline editor ("Edit draft"), every other check → "Review invoice facts" (`#ev-invoice-facts`).
- `useInvoiceDraft` returns the newest non-rejected draft that passes `DraftSchema`, skipping invalid rows (e.g. the TC-039 harness fixture) so they can't crash the view.
- `OPEN_DISPUTE` in `signals.ts` changed from a private const to an export, so check 6 shares one definition of an "open" dispute.
- The next-step callout text comes from `draftActions.nextStep(role, draft)`; the Manager-threshold wording uses `formatInr(MANAGER_APPROVAL_THRESHOLD)`, not a hard-coded amount.
- Merged into `build/verilane-v1` at `3388573`, no conflicts; all gates green (lint, tsc, vitest 542/542, build, e2e 58/58).

## D7 · OG image candidate approved — accepted
- The TASK-27 part-1 candidate (`.design/exploration/og/og.png`, 1200×630) approved by the user as-is: Design.md §22 headline/tagline, 4 real queue rows pulled live from the seeded app (Coromandel Foods, Aravalli Textiles, Ganga Steel Works, Konkan Agro), Verilane wordmark + "Collection Queue" pill.

## EXE12 · Responsive shell (TASK-20) — accepted
- `IconRail` (≥768px icon-only rail) and `BottomTabs` + `MoreSheet` (<768px, 7 routes across 5 tabs + a More sheet, 48px targets) replace a single fixed sidebar at narrow widths; `Sidebar` keeps the ≥1024px labelled nav.
- `ShellLoading` gives the shell itself a loading skeleton, closing the TASK-9 follow-up ("row skeleton doesn't show while DataProvider is loading").
- M-001 R2 (axe/contrast): `a{color:brand-strong}` and input/button resets moved under `@layer base` in `globals.css` so Tailwind utility classes can still override them. R3 (loading shell) and R13 (back link) folded into the same pass.
- Merge conflicts (expected per the brief's own risk list) in `InvestigationView.tsx`, `QueueView.tsx`, `RowCard.tsx` — each resolved by combining both branches' intent rather than picking one side: kept TASK-15's dynamic `formatDate(asOf)` header (TASK-20's branch had hard-coded the date — a regression, not kept), TASK-13's G4/G5/G7 excluded-badge `data-band`/`title` attributes, and TASK-15's `onApprove`/`onMarkDisputed` prop wiring, alongside TASK-20's responsive Tailwind classes. `Sidebar.tsx` auto-merged cleanly.
- Added `.gitignore` entry for `.claude/worktrees/` — agent worktrees are orchestration scratch, never committed (caught before this merge: `git add -A` had staged four worktree directories as embedded repos).
- Merged into `build/verilane-v1` at `b888ae3`, no further conflicts; all gates green (SR2 purity grep clean, lint, tsc, vitest 542/542, build:e2e, e2e 69 passed/1 skipped).
- TASK-27 part 2 (27.2–27.4: wire `public/og.png`, `layout.tsx` metadata, og test) proceeds against this candidate, no changes requested.

## EXE13 · M-002 fix round 1 (TASK-29) — accepted
- R14: `UnmatchedList.tsx` adds an "Open email" `<details>` disclosure for unmatched items with no invoice link, so the email text is reachable without a per-email Communication view.
- R15: `classify.ts` `claimedAmount` now binds the confirmation amount to the correct clause instead of the first amount found.
- R16: `phrases.ts` `MAY_HEDGE` and `classify.ts` `MAY_MONTH` disambiguate modal "may" ("may not be reflected") from the month "May" in dates.
- R17: `classify.ts` commitment branch now takes the latest commitment date when an email states more than one, matching M-001 R12's "latest wins" rule already used for review items.
- E2E flakiness observed post-merge under the default worker count (`responsive.spec.ts` TC-062/R2, occasionally `drafts.spec.ts`/`investigation.spec.ts`) was isolated to worker-level resource contention on this machine, not a regression: the same suite passed clean under `--workers=1` (71 passed, 1 skipped). The gate for this merge was confirmed under `--workers=1`.
- Merged into `build/verilane-v1` at `6856260`, no conflicts (6 files: `UnmatchedList.tsx`, `classify.ts`/`classify.test.ts`, `phrases.ts`/`phrases.test.ts`, `tests/e2e/payments.spec.ts`); gates green (SR2 purity grep clean, lint, tsc, vitest 561/561, build:e2e, e2e 71 passed/1 skipped under `--workers=1`).

## EXE14 · OG image wiring (TASK-27 part 2) — accepted
- `.design/exploration/og/og.png` (the D7-approved candidate) copied byte-for-byte to `public/og.png` (`cmp`-verified, 84,247 bytes). No re-render.
- Root `layout.tsx` sets `metadataBase` (from `NEXT_PUBLIC_SITE_URL`, falling back to a Stage-10 placeholder) plus `openGraph`/`twitter` objects with absolute-URL images, title, and Design.md §22's exact tagline as the description.
- **Next.js 16 Cache Components gotcha:** an explicit `openGraph.url` on the *root* layout's metadata — even a constant string — makes the Cache Components metadata resolver treat `/invoices/[id]`'s merged metadata as runtime data, failing `pnpm build` for that route (`blocking-prerender-metadata-runtime`). Fix: root layout's `openGraph` omits `url`; `/queue` (fully static) carries its own complete `metadata` export including `openGraph.url`, since Next 16 merges metadata per-segment rather than deep-merging nested objects within one segment's export. Worth remembering for any other route that needs a canonical OG url.
- `src/test/og.test.ts` (TC-089 unit half: dims, size cap, logo sha256 pin) + `tests/e2e/og.spec.ts` (TC-088 e2e half: OG/Twitter tags on `/queue`, image re-fetched by path rather than the placeholder prod domain).
- Merged into `build/verilane-v1` at `a687573` (on top of part 1's `17ca7d6`), no conflicts (7 files: `.design/exploration/og/og.html`, `.design/exploration/og/og.png`, `public/og.png`, `src/app/layout.tsx`, `src/app/queue/page.tsx`, `src/test/og.test.ts`, `tests/e2e/og.spec.ts`); gates green (SR2 purity grep clean, lint, tsc, vitest 565/565, build:e2e 13/13 routes, e2e 73 passed/1 skipped under `--workers=1`).

## EXE15 · Disputes state machine, Queue link, sidebar badge (TASK-17) — accepted
- `/disputes` (list) and `/disputes/[id]` (detail) pages, `DisputesView`/`DisputeDetailView`/`DisputeLabels` components, `DisputeCount` sidebar badge (`useDisputeCount`), `useDisputes`/`useDispute` hooks, and the `mark_disputed` command (`src/domain/commands.ts`). `RowCard.tsx` adds a sibling "View dispute" link for excluded/disputed rows, positioned outside the row's own `<a>` (HTML forbids nested anchors). `MarkDisputedDialog` is built and exported but deliberately unmounted — its ActionBar trigger belongs to TASK-15/16.
- **Next.js 16 PPR gotcha:** a dynamic route-param id (`/disputes/[id]`) containing literal `:` characters corrupts the PPR dynamic-route-param placeholder-token substitution in the static shell's RSC resume payload (`"%%drp:id:<hash>%%"` fails to substitute), so a DB-confirmed-present row renders "Dispute not found." Fix: `mark_disputed` sanitizes the ISO-timestamp portion of the generated `dispute_id` to alphanumeric-only (`` `D-manual-${invoiceId}-${ctx.tx.now().replace(/[^0-9A-Za-z]/g, "")}` ``). Worth remembering for any other route whose dynamic id embeds a raw timestamp or similarly-punctuated string.
- **Scar — latent tsc gap from TASK-15's own merge:** `commands.test.ts` and `validate.test.ts` carried `DisputeRecord` fixtures missing the `type` field TASK-13.3 had already made required, undetected because `tsc --noEmit` apparently wasn't re-run clean after TASK-15's merge (`3388573`). Fixed here (added `type: "incorrect_amount"` to the three fixtures) while resolving TASK-17's conflicts in the same files. Lesson: a merge's root-gate sequence (SR2 → eslint → tsc → vitest → e2e) must run in full even when conflict resolution "looks" complete — tsc catches what the diff review doesn't.
- Merged into `build/verilane-v1` at `36f8269` (base `183157b`, implementer commit `5c59853`), 5 files conflicted (`RowCard.tsx`, `commands.ts`, `commands.test.ts`, `schema.ts`, `hooks.ts`) — all resolved by combining both sides (TASK-13/15's additive work preserved alongside TASK-17's), none by discarding either side except the now-superseded `CommandNotImplemented` stub paths and the stale `tx.test.ts` "not-yet-implemented" test, both dead once `generate_draft`/`mark_disputed` were real. R19 (M-002, Queue dispute link) resolved: the merged `RowCard.tsx` keeps TASK-13's responsive layout and G4/G5/G7 badge logic intact alongside the new link. Gates green (SR2 purity grep clean, lint, tsc, vitest 568/568, build:e2e 14/14 routes incl. `/disputes/[id]` as Partial Prerender, e2e 83 passed/1 skipped under `--workers=1`).

## EXE16 · Home KPIs, task feed, charts (TASK-18) — accepted
- Pure domain aggregates in `src/domain/aggregates.ts` (SR2-clean), each Home block (KPI strip, "Needs your attention" feed, ageing chart, priority-mix chart) fails independently with its own inline error. `recharts` added, exact-pinned.
- **T18-2 — behaviour change to TASK-9's Queue:** closed invoices are now excluded from ageing buckets in both Home and Queue (shared `ageingBucketOfPriority`), so a chart bar's count always equals the filtered Queue row count it deep-links to. Previously the Queue ageing filter could include closed invoices.
- **T18-10:** the "Open disputes" KPI reads `useDisputeCount()`, the same source as the sidebar badge, so the two can never disagree.
- Seed-guard follow-up parked: `tests/e2e/home.spec.ts` still has 7 `test.skip` seed guards that would silently pass on an empty seed (close-out wave converts them to hard asserts); the BigInt-isolation guard was already converted (`4d396a5`).
- Merged into `build/verilane-v1` at `cfe0f4c` (base `041ff7a`, head `4d396a5`, 2 review fix rounds), no conflicts (16 files); gates green (lint, tsc, vitest 575/575, build:e2e, e2e 99 passed/1 skipped under `--workers=1`).

## EXE17 · PWA: manifest, service worker, offline banner, install chip (TASK-24) — accepted
- Web manifest, maskable icon (existing mark on a white safe-zone), `public/sw.js` cache-first for the app shell + seed data, cache key = seed version. Offline banner reuses the SR9 BannerHost pattern; import, reset and live-LLM triggers are disabled offline via `useOnline()`.
- **Seed bump keeps the shell (T24-1):** on adopting a new seed manifest the SW copies every non-`/seed/` entry into the new cache before evicting the old one, writes the manifest last, and deletes a half-built cache if adoption fails; while adoption is failed, `/seed/` requests go to the network so a seed cached for another version is never served. SW failures log as `[sw] …` and are forwarded to the page (`PwaRegister`).
- **One install prompt per page (T24-2):** the deferred `beforeinstallprompt` event lives in a module-level store (`src/lib/installPromptStore.ts`) read via `useSyncExternalStore`, shared by the header chip and Settings → Install app.
- **Test isolation:** service workers are blocked globally in `playwright.config.ts` and allowed only in `pwa.spec.ts`, because an active SW intercepts seed requests before `page.route` mocks. TC-077 serves the bumped manifest via `context.route` — no test writes tracked files. `/api/` is never handled by the SW; `/sw.js` is served uncached with a strict CSP (`next.config.ts`).
- Parked for the close-out wave: T24-4, T24-5, T24-7, T24-11, T24-12, re-review N1/N2. Not verified (HITL): a real install, the Lighthouse installable check, maskable icon under real OS masks.
- Merged into `build/verilane-v1` at `be197ae` (base `041ff7a`, head `fb23656`, 1 fix round, re-review PASS), no conflicts (26 files); gates green (lint, tsc, vitest 585/585, build:e2e, e2e 113 passed/1 skipped under `--workers=1`).

## EXE18 · Approve, confirm, simulated send + Drafts page (TASK-16) — accepted
- `approve_draft` re-runs the nine ledger checks inside the Dexie transaction, then calls `can()` again with the freshly derived `ambiguous_match` / `conflicting_payment`, and throws `PermissionDenied` before any write or audit entry (T16-1). A null re-check result is an `InvalidCommand` (T16-3); a dispute opened after validation fails check 6 and leaves the draft `validated` (T16-2). Manager-only above ₹5,00,000, on an ambiguous match, or on a conflicting payment.
- Confirm dialog names the invoice, customer and amount (`formatInr`); send runs through `execute()` with no network call, status → `sent_simulated`. TC-048 fails on any off-origin, non-GET, `next-action` or non-static request (T16-6).
- `/drafts` lists `validated` drafts with the four Design §18 states; the Drafts sidebar count reads live data (`useDraftCount`); other nav counts are still hard-coded.
- Parked for the close-out wave: T16-4 (a draft whose re-check failed still counts as ready) together with T16-R1 (an Analyst denied on fresh flags sees an enabled Approve that errors, instead of a disabled control with a reason; the domain still blocks the send).
- Merged into `build/verilane-v1` at `fd6e4ad` (base `041ff7a`, head `7b17f0a`, 1 fix round, re-review PASS), no conflicts; gates green (lint, tsc, vitest 593/593, build:e2e, e2e 123 passed/1 skipped under `--workers=1`).

## EXE19 · Live Claude provider, local-only and opt-in (TASK-23) — accepted
- `/api/llm/extract` and `/api/llm/draft` call `@anthropic-ai/sdk` structured outputs from `src/server/llm.ts` (the only SDK import; server-only). Model from `VERILANE_LLM_MODEL`, default `claude-opus-5-5`. Both routes return 503 `live_mode_disabled` unless `ANTHROPIC_API_KEY` is set and `VERILANE_LIVE_LLM=1`. `/api/llm/status` drives `LlmStatusBadge`, which reads "Simulated LLM" by default and while offline.
- Refusals, `max_tokens` stops and parse failures (`AnthropicError`) are rejected as `invalid_output` / `max_tokens`, never a 500 (T23-2). The browser gets a fixed reason plus a generic code; server logs carry only the error class and status, never bodies, key or headers (T23-4). Client: `timeout: 60_000`, `maxRetries: 1` (T23-5).
- `liveProvider` re-validates every row through `validateExtraction` and also rejects rows whose `message_id`/`thread_id` don't match the source message (eb0910d), a gap the shared validator has.
- NFR8: `pnpm check:secrets` scans `.next/static` after `pnpm build` and fails on a leak or on an empty/missing directory (T23-8). `pnpm eval:live --yes` runs under `tsx --conditions=react-server` (T23-1) and re-validates results, costed at Opus 5.5 rates (T23-9).
- **Deviation:** `liveProvider` is not wired into any UI yet, so no live trigger exists and the TASK-24 offline rule has nothing to gate. Whoever wires the first trigger must disable it offline via `useOnline()` with an inline reason.
- Parked for the close-out wave: T23-6, T23-7, T23-10, T23-11, T23-R1 (truncated/refused responses get the generic `invalid_output` reason), T23-R2 (`err.constructor.name` may be minified), T23-R3 (cost assumes Opus 5.5 under a model override), T23-R4 (no test for the literal `ANTHROPIC` string). HITL: the live path has never run with a real key.
- Merged into `build/verilane-v1` at `2f52f80` (base `041ff7a`, head `8bfd60a`, 1 fix round by a fresh implementer, re-review PASS), no conflicts at merge (TopBar resolved on the branch: badge then install chip); gates green (lint, tsc, vitest 623/623, build + check:secrets clean over 32 files, build:e2e, e2e 123 passed/1 skipped under `--workers=1`).

## EXE20 · Trust-walk e2e, same-origin + SW network check (TASK-26) — accepted
- `tests/e2e/trust-walk.spec.ts` (TC-086/TC-087): a single real-UI journey covering queue triage → evidence/provenance → draft generation (9/9 checks) → Analyst submit → Manager approve-and-send (simulated) → a disputed invoice blocked from submission with the correct disabled-control reason → the resulting `/audit` trail (5 rows, exact order) → a same-origin network assertion across the whole run, including requests the service worker actually served (`serviceWorkers: "allow"` override on this spec only; the global Playwright config blocks SWs elsewhere).
- No fixes needed; implementer's own gate run and the re-run on the merged branch both passed on the first attempt (0 fix-loop rounds).
- Flagged, not fixed (close-out wave): breadcrumb/sidebar highlights "Home" instead of "Queue" on the invoice page.
- Merged into `build/verilane-v1` at `f1bc396` (base `437b834`, head `09b9625`, 0 fix rounds, review PASS both stages); gates green on the merged branch (lint, tsc, vitest 623/623, build + check:secrets clean over 32 files, build:e2e, full e2e suite 123 passed/1 skipped under `--workers=1`).

## EXE21 · `pnpm eval` harness, gates, report + /settings/eval (TASK-21) — accepted, TC-066 open
- `eval/run.ts` runs the six gated metrics over the seed and held-out sets in pure Node. The clock is frozen, and `globalThis.fetch` is stubbed to throw and count calls (the budget test asserts 0 network calls, ≤30 s). Approval enforcement uses the real `approve_draft` against an in-memory Tx. `VERILANE_EVAL_FORCE_MISS=1` forces a miss (TC-069); `VERILANE_EVAL_REPORT_DIR` redirects report output.
- Report: sorted keys, numbers rounded to 4 decimals, camelCase keys (`report.live.json` from TASK-23 stays snake_case). `generatedAt` and `durationMs` are volatile, so every eval run dirties the committed report (close-out item).
- `/settings/eval` statically renders `eval/report.md` through a small markdown→React parser, with no raw HTML.
- **Held-out gates fail honestly (TC-066):**
  - unambiguous matching 21/23;
  - dispute recall 2/9 (gate ≥0.95);
  - approval enforcement 38/54.
  Root cause: the `classify.ts`/`phrases.ts` phrase classifier is overfit to seed wording (12/30 held-out emails classified correctly vs 25/25 seed). Thresholds and labels are unchanged.
- **User decision (2026-11-01):** merge now with the gates failing, then:
  - TASK-30 (P1) broadens dispute and confirmation recognition with general language. Its implementer is barred from reading held-out data and from running `pnpm eval`.
  - TASK-31 (P1) adds a fresh blind set, `eval/heldout-v2/`. Its author is barred from reading the classifier.
  - The original `eval/heldout/` stays in the report as "inspected, no longer blind" (the set grows, never shrinks).
  - TASK-21 stays In Progress until TC-066 passes on the fresh set.
- Gate convention from now on: unit gate is `vitest run --project unit`; `pnpm eval` is reported separately with its known failures listed.
- Merged into `build/verilane-v1` at `4926f71` (head `30aa211`, base `d217d0c`, 0 fix rounds, review PASS both stages), no conflicts. Gates on the merged branch: lint, tsc, unit 627/627, eval 13 passed / 3 known held-out failures, build + check:secrets clean over 32 files, build:e2e, e2e 129 passed / 1 skipped under `--workers=1`.

## EXE22 · Fresh blind held-out set `eval/heldout-v2/` (TASK-31) — accepted
- 30 new threads (H2-001…H2-030) with their own customers, invoices and labels. `eval/labels.test.ts` checks the labels and that no id collides with seed or held-out v1. `pnpm eval` reports v2 as a third column, and v1 is now labelled "inspected 2026-11-01, no longer blind".
- Barrier verified from the author's transcript: the classifier sources were never opened. The labels were committed before the first run.
- Debatable labels (H2-003, H2-011, H2-012) are left exactly as the author wrote them. Editing labels after seeing results would defeat the point of a blind set.
- Pre-TASK-30 baseline on v2: dispute recall 3/9, approval enforcement 38/56, unambiguous matching 20/23, email class 14/30. Amount (16/18) and invoice-number (25/26) exact match also miss on v2.
- Merged at `39a5d42` (head `5674130`, base `4926f71`, 0 fix rounds, review PASS both stages). Gates: lint, tsc, unit 631/631, build + check:secrets clean, e2e 129 passed / 1 skipped under `--workers=1`.

## EXE23 · General dispute/payment wording in the classifier (TASK-30) — accepted; TC-066 a known limitation
- `src/domain/phrases.ts` adds general word lists (goods, agreed, defect, negation, price terms, dispute patterns) plus a `PAYMENT_REF` regex (UTR/NEFT/RTGS/IMPS). In `classify.ts`, a payment reference now counts as evidence of an amount or reference, and a specific dispute type is preferred over `unknown`. `classify.general.test.ts` adds 68 cases written from general language, not from held-out data.
- Implementer decisions (EXE-T30-1..7):
  - damaged goods → `not_received`;
  - never ordered / PO mismatch → `missing_po`;
  - credit note, withholding and escalation → `unknown`;
  - TDS deduction is not a dispute;
  - "please escalate" alone is not a dispute;
  - a bare "Amount transferred" counts as a transfer verb.
  - Known misfires: other harmless uses of "escalate", and "Paid?" next to an amount.
- Barrier verified: the implementer read no held-out data and never ran `pnpm eval`. 0 of the 96 phrase literals appear verbatim in held-out v1.
- **Single honest measurement on v2** (`58e1b34`): dispute recall 3/9 → 4/9, approval enforcement 38/56 → 42/58, matching 20/23 unchanged, email class 14/30 → 15/30. On v1: dispute 2/9 → 4/9, approval 38/54 → 54/62. No tuning against v2 followed.
- **User decision (2026-11-01): TC-066 is a known limitation.** Phrase lists do not generalise far enough to reach the gates. The gates keep failing honestly, with thresholds and labels unchanged. TASK-30 and TASK-31 are Done, since their own checks pass. TASK-21 stays In Progress, and TC-066 will be listed as a known FAIL in the Stage 8 QA report and the README. The real fix is the live Claude provider, which needs a real key that only the user can supply.
- Merged with no conflicts (impl `e310c1e`, 0 fix rounds, review PASS both stages). Gates: lint, tsc, unit 699/699, eval 14 passed / 8 known held-out failures (v1: 3, v2: 5), build + check:secrets clean, e2e 129 passed / 1 skipped under `--workers=1`.

## EXE24 · FS11 fault injection and extraction cross-check (TASK-22) — accepted
- `src/ai/validateExtraction.ts`: `crossCheck` flags any amount or invoice reference that doesn't appear as a token in the email body. When body and `sent_at` are given, `validateExtraction` runs it and rejects with "cross-check failed".
- `src/domain/commands.ts`: `recordRejection` writes a `validation_failure` audit event (subject `review:RV-<message_id>-match`). `src/domain/validate.ts`: in `draftContextFor`, a rejected extraction with an open review item blocks drafts for its invoice or candidate invoices.
- `src/ai/faulty.ts` + `eval/faults.eval.ts`: 6 fault kinds, each 100% rejected, sent to needs_review and audited. 0 of 218 approval attempts became approvable (TC-070, TC-071).
- **Deviation:** there is no runtime ingest from a provider yet (extractions are seeded; `liveProvider` is unused per EXE19), so `recordRejection` is only called from eval. Wiring it into a real ingest path is parked for the close-out wave.
- Review PASS on both stages. One quality fix round: `1d44703` moved an orphaned comment back to `CLOSED_DRAFT`. Merged at `45dd9f8`; the conflict in `eval/report.*` was resolved by regenerating.
- Gates: lint and tsc pass, unit 723/723, eval 34 passed / 8 known held-out failures (v1: 3, v2: 5), build + check:secrets clean, e2e 129 passed / 1 skipped under `--workers=1`.
