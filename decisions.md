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
- The `?__state=` hook works only when `NEXT_PUBLIC_E2E` is set and is checked at runtime. *(Superseded by EXE25: the hook is now compiled out of plain builds.)*
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

## EXE25 · a11y, perf, screen-state and dead-control sweep (TASK-25) — accepted
- New e2e specs: `a11y` (TC-080), `controls` (TC-081), `keyboard` (TC-082), `perf` (TC-085) and `states` (TC-079, including `/disputes/[id]`). R21 (axe and 390px on `/payments` and the Communication panel) is folded in. `ComingSoon.tsx` was removed.
- TC-083 route budget: `scripts/route-budget.ts` checks every route's gzip First Load JS against 300 KB and is a `test:all` step after `build`. `/queue` was 300.8 KB, so `ResetDialog` now loads lazily (295.9 KB). All 12 routes pass.
- `?__state=` and `__verilane` test hooks are compiled out of plain builds through `next.config` `env`, and `check:e2e-hooks` scans `.next/static` to prove it. The `/e2e-harness` route remains an accepted exception.
- `alert-dialog.tsx` returns focus to the opener on close. If the opener is gone, focus falls back to the nearest region, then to `<main>` (TC-082 Esc race).
- TC-081 clicks every button-like control on every route and fails on any click with no observable effect (DOM change, navigation, download, popup or dialog). Only the "Analyst" button on `/` is allow-listed. Already-checked radios are skipped, SVG animation changes are ignored, and "Hide filters" passes on an attribute change only.
- TC-085 times the committed result: the URL matches and the visible rows or count have changed, not just the click.
- TC-084 (`recompute()` ≤ 200 ms median of 5) runs in its own vitest project via `pnpm perf`, a separate `test:all` step. In the parallel unit pool it failed under machine load (median 264.6 ms; 19–27 ms alone), which made the unit gate flaky (`597aa4b`).
- Cross-lane touch: `/settings/eval` got a focusable region for axe.
- Review: 2 fix rounds. Proof that the new tests catch faults: an injected 1 s filter delay, a dead Export button and a removed focus fallback each failed the matching test. T25-5 (the keyboard walk uses programmatic focus/goto) is parked for the close-out wave.
- Merged at `d345663` (head `655b84f`). Gates: tsc and lint pass, unit 729/729 (also under induced build load), perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 169 passed / 1 skipped under `--workers=1` (e2e on `d345663`; `597aa4b` changes test config only).

## EXE26 · README with trust-boundary disclosure and eval results (TASK-28) — accepted
- `README.md` (new, root): one-command demo-mode run with no key; demo vs. live mode, naming `ANTHROPIC_API_KEY`/`VERILANE_LIVE_LLM`/`VERILANE_LLM_MODEL` without ever giving a value; the client-side trust boundary and the per-browser, not-tamper-proof audit log (S14); an eval-results table linking `eval/report.md`, stating TC-066 as a known limitation with the real gate numbers and that `pnpm eval` and `pnpm test:all` exit non-zero; a synthetic-data note; links to `docs/` (not `stage6-ledger.md`); and the test commands, including that e2e needs `--workers=1`.
- README states plainly what it can't make true: no `engines`/`.nvmrc` (states Node 20.9+ floor, developed on 26), the live-LLM path never run with a real key, and no `LICENSE` file so no license is granted.
- TC-090 (fresh clone, README commands verbatim): dev server, build, check:secrets, check:e2e-hooks, route-budget, build:e2e, production build+start and `e2e --workers=1` (169/1-skip) all matched the README. `pnpm test` and `pnpm perf` passed standalone. `pnpm test:all` failed twice, but on vitest's default test/hook timeouts under agent load (unit project 5 s; eval project's `beforeAll` 10 s) rather than cleanly reaching the 8 known held-out misses; the gate table itself (read from `eval/report.md`) is unchanged and is what the README quotes. Per the two-strikes rule, `test:all` wasn't retried a third time; the remaining steps were run individually and all passed. `eval/report.*` was restored with `git checkout --` both times `pnpm eval` dirtied it.
- README now also documents, from this run: `tsc --noEmit` needs Next's generated route types first on a bare clone (`pnpm exec next typegen`, or `pnpm dev`/`pnpm build`), and that a loaded machine can hit the unit/eval default timeouts before reaching the result being tested for.
- Repo defects found and reported, not fixed (parked to the close-out wave): the `e2e` script's hard-coded machine-specific Playwright paths (pre-existing, EXE25's T28 brief); `test:all`'s `e2e` step omits `--workers=1`; the unit/eval default vitest timeouts flaking under agent load, newly observed beyond TC-084/EXE25 (now also `unit` and `eval`); dev-mode "Could not validate `instant`" overlay noise at `RootLayout`/`DataProviderLoader` (cosmetic, pages still 200); `pnpm eval` always rewriting `eval/report.*` timestamps.
- Spec + quality review pass, no fix round needed. Only `README.md` changed; no secrets (env vars named, never valued). Merged `a2622a0..29d2bea` by fast-forward. Gates: tsc and lint clean on the merged branch; TC-090's full `test:all`-equivalent run done in the fresh clone per the brief.

## EXE27 · Test infra hardening (TASK-32) — accepted
- `e2e` is now plain `playwright test`. `playwright.config.ts` defaults `PLAYWRIGHT_BROWSERS_PATH` to the repo-local `node_modules/.cache/playwright/browsers` (a value already set in the environment wins) and reads `E2E_TMPDIR` for the temp override. New `pnpm e2e:install` (`scripts/e2e-install.ts`) installs Chromium into whatever path the config resolves. `test:all` now ends `pnpm e2e --workers=1`.
- Vitest: unit `testTimeout`/`hookTimeout` 30 s, eval `hookTimeout` 60 s, all finite; reasons are in comments in `vitest.config.ts`. The committed `eval/report.*` drops `generatedAt`/`durationMs`, so repeated runs give byte-identical files; the timestamp and duration go to the console instead.
- R20: both held-out sets have every item tagged with `phenomena`, and `labels.test` asserts the coverage. No label values changed. T18-N2: the home specs fail on a missing seed instead of skipping. T25-5: TC-082 reaches the queue row with real Tab presses; the `.focus()` call and the `goto` fallback are gone.
- Ownership extension: `docs/AI-Evaluation.md:40` (the report-determinism sentence).
- Expected one-time cost: because the browsers path moved, an existing checkout has to run `pnpm e2e:install` once. The first post-merge e2e run failed all 170 tests with `Executable doesn't exist`. That was the missing browsers in the new path, not a regression; after `pnpm e2e:install` the suite went green. The README documents this.
- Review PASS-WITH-FIXES, 1 fix round (`7f63972..4488446`). Merged at `e83266c`. Gates on `e83266c`: tsc and lint clean, unit 738/738, perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 169 passed / 1 skipped (`--workers=1`).

## EXE28 · Live Claude provider hardening (TASK-36) — accepted
- Both live routes read the body through `readBoundedJson`: 256 KiB cap, `413 payload_too_large` on an over-cap declared `Content-Length` or once the streamed total passes the cap. Zod field caps: extract ids ≤ 200, `from_address` ≤ 320, `subject` ≤ 1,000, `body` ≤ 20,000; draft `context` 1–20,000 and `invoice_id` matching `^INV-(?:\d{1,9}|[A-Z])$` (it sits outside the prompt fence). Anything else is `400 invalid_request`.
- `src/server/llm.ts`: untrusted text is fenced with a per-request random tag; a smuggled closer is stripped first (whitespace-tolerant, zero-width characters removed). Calls use structured JSON output, `max_tokens` 8192, effort `low` (extract) / `medium` (draft), no thinking or sampling params, no fallback model. Non-success outcomes map to `refusal`, `truncated` (`max_tokens` / `model_context_window_exceeded`), `unexpected_stop_reason` or `invalid_output`; rejection and failure logs carry only the code, sanitized stop reason, refusal category and HTTP status, never request or response text.
- `scripts/eval-live-report.ts`: cost estimate uses a per-model price table; an unlisted model prints "cost unknown" instead of a guess.
- Ownership deviation: `src/server/llm.ts` was outside the brief's file list. The change was necessary (the fence, stop-reason handling and call settings all live there) and contained to that module and its tests; accepted.
- Review PASS-WITH-FIXES, 1 fix round (`d5dbf60`: random fence tag, strict `invoice_id`, log rejects; T36-1..4), re-reviewed MERGE-READY. Parked nits: T36-5 (cost-estimate detail), T36-6 (some tests pin coverage rather than a reproduced regression), T36-7 (`max_tokens` 8192 with no fallback — revisit if live runs truncate). README live-mode section updated (`e6a52ea`).
- Still true: the live path has never run against a real key.
- Merged at `388c058`. Gates on `388c058`: tsc and lint clean, unit 792/792, perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 169 passed / 1 skipped (`--workers=1`).

## EXE29 · PWA service-worker close-out (TASK-35) — accepted
- T24-5: an offline navigation serves the exact cached page, then the same path with the query string ignored, then a precached self-contained `/offline.html` (light/dark, 44px "Go to Home"). It no longer falls back to Home's HTML. Ignoring the query string is safe only because every page is static per path and reads its query client-side; a future server component that reads `searchParams` would break this (comment at the top of `public/sw.js`).
- T24-7: outside production, `PwaRegister` unregisters every service worker on the origin and registers none; if a stale SW still controls the page it reloads once (sessionStorage-guarded). Verified at helper level only, not with a live dev-after-prod check.
- T24-11: icon crop widened to the mark's real bounding box (430 px wide) and the icons regenerated. T24-12: `/_next/static/` is pruned by mark-and-sweep (keep what cached HTML/JS/CSS references) above 150 entries; pages are capped at 50 by write order. N1: a failed manifest fetch resets the seed bypass. N2: cache adoption switches the active cache before the copy loop, so writes during the copy land in the new cache, with rollback on error.
- Cache-write failures (e.g. quota) still return the network response and warn with a stable code and the error name only, no URL.
- Accepted trade-offs: a pruned static still needed offline is missing until the next online visit; a write racing the sweep can be dropped and is re-cached on the next visit.
- Review PASS-WITH-FIXES, 1 fix round (`0f7f1fc`: T35-1..6, T35-8/9; TC-076c now forces and pins the offline-fallback branch, red on the base SW), re-reviewed MERGE-READY.
- Merged at `957cc6d`. Gates on `957cc6d`: tsc and lint clean, unit 817/817, perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 173 passed / 1 skipped (`--workers=1`; 4 new PWA tests).

## EXE30 · Domain formatter/ingest/evidence fixes and live nav counts (TASK-33) — accepted
- R7: date and whole-rupee display now routes through `clock.ts`/`money.ts` (`formatDate`, `formatDateTime`, `formatInrWhole`) instead of ad hoc formatting; `AuditRow`'s `formatAt` uses the same helpers.
- R8: `Draft.amount_paise` is branded as Paise at the schema boundary (`money.ts`).
- R9: a bad ingest row becomes an invalid `DataIssue` instead of throwing (`ingest.ts`).
- R10: a duplicate invoice number shows as Conflict, not Missing (`evidence.ts`).
- R11: `execute()`'s transaction scope now includes `priorities` and `dataIssues` (`store/tx.ts`) — a prior scope gap could leave those tables stale after a write.
- T16-4/T16-R1 (product call, carried from TASK-16 parking): a draft whose recheck fails is excluded from the ready-to-approve count and shown "Blocked — checks failed", instead of still counting as ready with no fix path.
- Sidebar/nav counts (`NavItems.tsx`) are now live (`QueueCount`/`DisputeCount`/`DraftCount` hooks) instead of the hard-coded placeholder noted in the ledger's "Open threads".
- Reviewer follow-ups (`TASK-33-review.md`), not folded into this lane — tracked here, not re-opened as new tickets:
  - T33-1 (Medium): a blocked draft can stay blocked after its cause clears; "Open one to fix it" has no direct fix path. Route to the investigation/drafts owner.
  - T33-2 (Low): three date displays (disputes/payments/investigation) still bypass the shared formatter R7 added; add `formatDay(instant)` to `clock.ts` and point their imports at it.
  - T33-3 (Low): `useDraftCount` counts raw rows while `validatedDrafts()` filters through `DraftSchema`, so a schema-invalid "awaiting" row can inflate the badge past what `/drafts` lists. Recommended to skip — pre-existing, narrow.
  - T33-4 (Nit): `NavItems.test.ts` pins that `count` is gone from the type but doesn't test the loading-state render. Recommended to skip.
- Review verdict PASS-WITH-FIXES with every finding routed as a follow-up or recommended-skip, not rework; merged as-is.
- Merged at `43f5744` (head `ef53eb0`, base `3902427`). Gates on the combined TASK-33+34+T34-6 result: tsc and lint clean, unit 847/847, perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 185 passed / 1 skipped (`--workers=1`).

## EXE31 · Detail-page breadcrumbs, evidence-anchor fix, and sidebar highlight (TASK-34 + T34-6) — accepted
- R18: the email-class badge in `CommunicationTable.tsx` gets `id="ev-<message_id>:emails.json:email_class"` plus a `ProvenanceLine`, and a one-shot effect scrolls to an `#ev-…` fragment once Dexie's messages load (the browser's own fragment-jump runs before that data exists, so without this a deep link never lands). The same effect fixes `UnmatchedList`'s `#ev-communication` link (an open item carried from EXE10).
- Detail pages (`/invoices/<id>`, `/disputes/<id>`, `/settings/eval`) now show a breadcrumb trail (`breadcrumb.ts`'s pure `crumbsFor`) instead of always announcing "Home" (ledger Wave-1 follow-up). T34-1: the invoice crumb shows the invoice number the page and Queue row use, resolved from the store, not the raw `invoice_id`. T34-5: an unknown route returns no crumbs rather than falsely claiming Home as current.
- T34-6 (orchestrator fix wave, this lane's follow-up): the sidebar/rail/bottom-tab active highlight used an exact `pathname === NAV_ITEMS[].href` match, so a detail page like `/invoices/INV-042` left Home highlighted instead of Queue. Added `navHrefFor(pathname)` to `breadcrumb.ts`, reusing the same `PARENTS`/`SUB_PAGES` maps `crumbsFor` uses, and switched `AppShell.tsx` to it. Unit tests in `breadcrumb.test.ts`; an e2e assertion in `investigation.spec.ts` pins that `/invoices/INV-042` marks `/queue`'s nav link current and not `/`'s.
- Reviewer follow-ups (`TASK-34-review.md`), parked as noted (T34-1 and T34-5 above were fixed in this lane, not parked):
  - T34-2 (Low): the deep-link scroll target lands flush against the viewport top with no context or highlight. Cosmetic; Stage 7 candidate.
  - T34-3 (Low): the scroll-landed `ref` isn't reset when the invoice changes without a remount. Narrow; low traffic path (full navigations dominate).
  - T34-4 (Low): the deep-link e2e test writes a screenshot to an absolute dev-machine path for every project run, not just the one project that needs it. Test-only nit.
- Re-reviewed MERGE-READY after fix round 1 (head `218a015`); merged as-is, with T34-6 added afterward in this close-out session.
- Merged at `c8c7fa9` (head `218a015`, base `3902427`); T34-6 committed on top of the merged branch. Gates on the combined TASK-33+34+T34-6 result: tsc and lint clean, unit 847/847, perf 1/1, build, check:secrets and check:e2e-hooks clean, route budget 12/12, e2e 185 passed / 1 skipped (`--workers=1`).

## DEP1 · Production deploy target: `verilane.tusharpathak.com` — user-requested 2026-11-03
- Stage 10 deploys to the subdomain `verilane.tusharpathak.com` (user's own domain). Acted on only after the Stage 9 `QA-report.md` gate is approved; the DNS record and Vercel domain binding are confirmed with the user at that point, not before.
- Consequence: Verilane gets a public URL, so the OG/Twitter link-preview gate (D6, web-deliverables) changes from "N/A — private app" to **required**: a 1200×630 image mocked and approved before Stage 10, absolute `https://verilane.tusharpathak.com/...` URLs, verified with LinkedIn Post Inspector + opengraph.xyz. Stage 7 (TASK-49) checks the current tag state as a DES- finding.

## RCA1 · `/queue` stat badges truncated at 375px (TASK-64) — fixed and guarded
- **Bug:** at 375px, the `/queue` page's KPI stat cards (`src/components/queue/QueueKpis.tsx`) clipped their sub-line text instead of wrapping — the chip labels ("Needs decision", "Requires attention", "Resolution required") and the outstanding amount ("₹61,17,500.00 outstanding") were cut off mid-word.
- **Root cause:** the sub-line `<span>` had a `truncate` class. At 375px each card's text column is only ~80px wide (2-col grid, `size-10` icon, `p-4` padding), so content that should have wrapped onto a second line was clipped instead.
- **Fix:** `QueueKpis.tsx` — the sub-line span's class changed from `truncate` to `break-words`, and `max-w-full` was added to the `Chip` component's span, so chip/amount text wraps within the card instead of clipping.
- **Regression test:** TC-173 (`tests/e2e/responsive.spec.ts`) checks, for every element inside `[data-testid="queue-kpis"]`, that `scrollWidth <= clientWidth + 1`, as a stored guest at 375px. Confirmed RED before the fix (4 elements clipped: `queue-kpi-total`, `queue-kpi-high`, `queue-kpi-needs_review`, `queue-kpi-disputed`), confirmed GREEN after, in both the chromium-light and chromium-dark projects.

## S15 · TASK-45 splash: CSS-only motion, no animation library — approved 2026-11-02
**Context.** ≤15 KB gzip budget; the splash must paint before hydration; no motion library is installed.
**Decision.** CSS keyframes on transform/opacity only; static clip-paths; no animated filters or blend modes; one `--splash-d` property drives the cinematic length.
**Rejected.** framer-motion, gsap and Lottie (each blows the budget and needs hydration); video; canvas/WebGL; WAAPI (not needed).

## S16 · TASK-45 splash: pre-hydration static overlay in RootLayout plus an inline runtime — approved 2026-11-02
**Context.** The fallback chain swaps three times, so a splash inside it would restart; it must paint in the first frame; the route budget is already failing.
**Decision.** A server-rendered overlay sibling to `<Suspense><ShellGate/>`, with CSS visibility via `html[data-splash]`, set by a typed, tested, stringified inline runtime (the THEME_SCRIPT pattern). The app subtree goes in a `display:contents` wrapper, made `inert` while covered.
**Rejected.** A splash inside `GateSkeleton`/`ShellLoading` (it restarts and paints late); a React overlay in `GatedApp` (post-hydration, shared JS, mismatch risk).

## S17 · TASK-45 splash: trigger is the first gated-app entry per tab, including client entry from onboarding — approved 2026-11-02
**Context.** First-time visitors enter through `router.push("/")` from `/welcome`; Q1 (once per tab), Q3 (never on auth routes).
**Decision.** `sessionStorage` seen-flag, set on show; hard load decided pre-paint; client entry through `show()` in a layout effect; refresh does not replay; e2e is off unless `?__splash=1`.
**Rejected.** Hard-load only (the primary audience never sees it on visit one); localStorage once-per-day (not asked for; see the new-tab risk in the PRD §8).

## S18 · TASK-45 splash: real readiness via observe-only events; truthful status; hold and ceiling — approved 2026-11-02 (timing amended by S21, indicator amended by S23)
**Context.** "Never fake progress" (brief, DoD #1); no stop rule existed.
**Decision.**
- Events `painted/session/provider/seeding/ready/error`.
- Truthful phase text that switches to a ready state at `ready`, with the loading bar of S23.
- Exit at `max(t₀ + D, ready + fill)`, per S21 and S23.
- Hold on a calm loop if the load outlasts *D*.
- A ceiling at *t₀* + *D* + 4 s yields to the skeleton with a mark and a warning.

**Rejected.**
- A "loading" state that continues after the app is ready (fake progress).
- The draft's 8 s ceiling (it would leave only 2 s of load margin after a 6 s cinematic).
- *(The draft's rejection of any percentage or bar is superseded by S23.)*

## S19 · TASK-45 splash: generated atmosphere only; lighthouse, beam, logo and text in code — approved 2026-11-02
**Context.** The brief's rule against baking in the logo, text or beam; beam-to-lantern alignment across aspect ratios; budget.
**Decision.** G1 plate plus two G2 cloud layers (foreground faster than background, S24) generated in Stage 3; SVG lighthouse; CSS beam and glow; official logo PNG layers; live text. Rasters are CSS backgrounds gated on `html[data-splash]` (0 bytes when not shown), AVIF/WebP, ≤60/30 KB.
**Rejected.** A generated lighthouse (fragile alignment; Stage 3 may revisit with evidence); a single baked hero image (violates the brief).

## S20 · TASK-45 branch strategy: own branch cut from task/38, not main — approved 2026-11-02
**Context.** `main` has no app code; the composed render tree exists only on `task/38-emerald-redesign`.
**Decision.** A new `task/45-splash` branch in its own worktree, cut from a commit on `task/38-emerald-redesign` where all checks pass; no commits to `task/38`; merged by the lead after TASK-38/39 settle. If the only failing check at every candidate base is the pre-existing route-budget overage, ask the user before cutting.
**Rejected.** `main` (impossible); `build/verilane-v1` (lacks ShellGate, session and the light logo, so merges would conflict heavily).

## S21 · TASK-45 splash: guaranteed full cinematic once per tab — USER-APPROVED REVERSAL, 2026-11-02
**Context.** Discovery Q5 (a ~400 ms floor), DoD #1 ("no added perceived latency") and the brief's "must not artificially delay entry to complete the animation" together meant the splash would last only as long as the real load, roughly 0.4 s on a warm load. That would show the primary first-time/demo audience (Q2) a fraction of the ~6 s storyboard the feature was commissioned for (PRD §0.1). The user was shown that tradeoff at the Stage 2 gate.
**Decision.** Reverses Q5, DoD #1 and that brief line. The full ~6 s cinematic plays once per tab session even when the app is ready. Exit is at `max(t₀ + D, ready)`, with *D_rm* = 1 s under reduced motion. A same-tab refresh does not replay; a new tab does. Bounded by: skip on any input (S22), truthful status that shows "ready" rather than fake loading (S18), and unchanged real time-to-ready (PRD §5.1). DoD #1 and DoD #5 are restated in PRD §5.
**Rejected.** Compressed honest timing (the draft recommendation; it hides the storyboard); a cinematic with no skip (a forced 6 s wait, and it fails WCAG 2.2.2).
**Reason recorded.** The user's sign-off decision on 2026-11-02, choosing the brand reveal for first-time and demo visitors over sub-second entry, with skip as the escape hatch.

## S22 · TASK-45 splash: skip on any click, tap or key; skippable-overlay a11y — USER-APPROVED REVERSAL, 2026-11-02
**Context.** The draft's "no skip button" was justified by honest timing, where there was nothing to skip to. S21 removes that premise, and a more-than-5-s auto-playing animation needs a stop/hide mechanism (WCAG 2.2.2).
**Decision.** Any `pointerdown` or `keydown` (including Esc), handled in the inline runtime from the first frame, starts the ≤ 300 ms exit within 50 ms. A 250 ms start guard and `event.repeat` filtering prevent accidental skips, and the skipping click/key is never forwarded to the app. Affordance: one small, unobtrusive, not-auto-focused real "Skip intro"/"Continue" button plus a key hint. The overlay root is no longer `aria-hidden`: the decorative layers are, and one `role="status"` carries the truthful phase while the app is `inert`. Pointer events are on while showing and off at exit start. Focus is never left on a hidden element.
**Rejected.** No affordance at all (undiscoverable, and unreachable for screen-reader browse mode); a prominent skip button (competes with the logo); `role="dialog"` with a focus trap (the brief forbids a focus trap); keeping the whole overlay `aria-hidden` (the inert app's own status would be hidden too, leaving about 6 s of silence).

## S23 · TASK-45 splash: real-progress loading bar — USER-APPROVED REVERSAL, 2026-11-02
**Context.** The draft rejected any percentage or determinate bar, because few, unequal phases make a bar jump or stall, and under a guaranteed 6 s cinematic a smooth bar would have to be a scripted timer, which is fake progress. The storyboard (`docs/TASK-45-storyboard.md`, frame 07) shows a bottom-centre emerald pill easing from 0 to about 90 %. The user decided to keep it, on the condition that it is tied to real loading.
**Decision.** This reverses the draft's "no percentage" rule. The bar works as follows:
- Its fill is a monotonic function of the latest real phase only: `painted` 10 %, `session` 35 %, `provider` 65 %, `seeding` 80 % (only if seeding is real), `ready`/`error` 100 %.
- It stays ≤ 90 % before `ready`. No timer changes it and nothing creeps between events, so it may jump or stall.
- It is revealed at *t₀* + 4.0 s, or at *t₀* under reduced motion. If the app is already ready at that point, it fills to 100 % in ≤ 600 ms.
- If the app becomes ready after *D*, the exit follows a ≤ 250 ms completion beat.
- A skip or the ceiling exits with the bar incomplete, and the skeleton takes over. The bar is never faked to 100 %.
- Accessibility: it is a non-live `role="progressbar"` whose `aria-valuenow`/`aria-valuetext` equal its real target. The overlay's `role="status"` stays the single announcer.

**Rejected.**
- A storyboard-timed ease from 0 to 90 to 100 % (a scripted timer, so fake progress).
- Creeping between events (it implies progress that is not happening).
- An `aria-hidden` bar (it now carries real information, so hiding it would break WCAG 1.3.1).
- A live progressbar (double announcements next to the status).

## S24 · TASK-45 splash: cloud parallax corrected — user decision, 2026-11-02
**Context.** The storyboard lists the foreground cloud as slower (10–15 px over 6 s) than the background cloud (20–30 px), which inverts normal depth cues.
**Decision.** The foreground cloud drifts faster than the background cloud; the storyboard's speeds are swapped. The drift is rightward and one-way over the splash's longest life (≈ 10 s). Stage 3 sets the absolute distances (storyboard inconsistency 3).
**Rejected.** The storyboard's literal speeds (they read as wrong depth).

## D8 · TASK-45 splash: loading bar revealed at t₀ + 3.2 s (amends R13's 4.0 s) — approved 2026-11-02
**Context.** At 4.0 s a 0.8 s dead beat follows the tagline.
**Decision.** Reveal as a 300 ms rise at 3.2 s (F06 end); t₀ under reduced motion.
**Rejected.** 4.0 s.

## D9 · TASK-45 splash: D = 5.7 s, 300 ms exit, ceiling 9.7 s; D_rm = 1 s, ceiling 5 s — approved 2026-11-02
**Context.** Choreography ends at 3.2 s; 2.5 s of hold lets a warm bar fill and read "Workspace ready".
**Rejected.** 6.0 s / 10 s ceiling.

## D10 · TASK-45 splash: width-relative cloud drift (fg 10 vw, bg 5 vw, one way over 10 s; bg hidden ≤ 600 px) — approved 2026-11-02
**Context.** Fixed px reads frantic at 375 and static at 1440.
**Rejected.** px distances; looping drift.

## D11 · TASK-45 splash: static beam at −6°, breathing 1 → .78 over 5 s, one sheen at 1.6 s, never sweeps — approved 2026-11-02
**Context.** A sweep pulls the eye off logo and bar and adds a 2.2.2 concern.
**Rejected.** ±4° sweep ≥ 6 s period in hold.

## D12 · TASK-45 splash: error copy "Workspace opened"; the app banner owns the error — approved 2026-11-02

## D13 · TASK-45 splash: stall glint inside the fill only + sub-line "Still working — first visits can take a few seconds." after a 4 s stall or 1.5 s past D — approved 2026-11-02
**Context.** An honest bar stalls; the stall must read as working, not frozen. The glint never changes the value.

## D14 · TASK-45 splash: skip button bottom-right, "Skip intro" → "Continue" at ready, 36 px (44 px touch), no autofocus — approved 2026-11-02

## D15 · TASK-45 splash: always dark, independent of app theme; exit fade reveals the active theme — approved 2026-11-02

## S33 · TASK-45 build order: tracer first on a bare overlay — approved 2026-11-02 (Stage 4 gate)
**Context.** Only the overlay/runtime/event path touches the shared render tree, hydration and time-to-ready.
**Decision.** TKT-45.02 ships the real runtime state machine, events, skip and inert on a flat overlay, and must pass ±50 ms ready, skip→input ≤ 350 ms, zero hydration warnings and node identity before any bar, scene or art work starts. A fail reopens Stage 2 (S16).
**Rejected.** Scene-first (polishes the cheap part while the expensive risk is unknown).

## S34 · TASK-45 perf measurement protocol — approved 2026-11-02 (Stage 4 gate)
**Context.** §5.1's ±50 ms gate on a 5-run median may sit inside lab noise under Fast-4G + 4× CPU.
**Decision.** Production build on its own port; measure the no-splash baseline spread first; if the 5-run spread exceeds ±50 ms, run interleaved A/B (splash on/off alternating) with n ≥ 9 and compare medians. Record both raw series in the evidence pack.
**Rejected.** A single 5-run comparison regardless of noise (could pass or fail on noise).

## S35 · TASK-45 budget gate is a separate `scripts/splash-budget.ts` in `test:all`, landed before the scene — approved 2026-11-02 (Stage 4 gate)
**Context.** §7 requires a mechanical gate; `route-budget` measures route JS chunks, while the splash's weight is inline HTML/CSS plus rasters.
**Decision.** New script, own unit test, beside `route-budget` in `test:all`; it measures the inline runtime (≤ 2 KB), splash CSS (≤ 7 KB), markup + SVG (≤ 4 KB), total ≤ 15 KB gzip, and splash rasters (≤ 60 / 30 KB); `route-budget` is unchanged and its per-route 300 KB limit still applies (no passing route may flip, shared-JS delta ≤ 0.5 KB). Landed in TKT-45.07 right after the tracer so 04/05/06/09 grow under it.
**Rejected.** Extending `route-budget` (mixes two different measurements in one owner's script).

## S36 · TASK-45 art spend: per-round user approval, max 3 rounds per asset, placeholder is the fallback — approved 2026-11-02 (Stage 4 gate)
**Context.** kie.ai generation costs money (KIE_API_KEY); the splash never waits on art (S19).
**Decision.** Before each round, state the model, the count and the estimated cost and wait for approval; max 3 rounds per asset (G1, G2), then escalate; if nothing passes, ship the CSS-gradient placeholder sky and clouds and record it. Key read from .env.local only, never printed.
**Rejected.** Open-ended regeneration.

## S37 · Root Design.md scoped exception appended as Revision R4 (TASK-45 splash) — approved 2026-11-02 (Stage 4 gate)
**Context.** Design-TASK-45 §5; TASK-46 appends R2/R3 on its own branch.
**Decision.** Append Design-TASK-45 §5 as "Revision R4 — TASK-45 splash scoped exception" after the last revision present on the base, in TKT-45.01, verbatim; renumber if the base already holds an R4. Scope: gradients, glow and a decorative loop only inside #splash while html[data-splash] ≠ done; official logo unmodified; no residue after exit.
**Rejected.** Editing the root Design.md rules in place.

## TP16 · TASK-45: Runtime as typed source, stringified (TP-45.a) — approved 2026-11-03
- `src/lib/splash/runtime.ts` has no imports. Its pure functions are `decide`, `progress` and `step`, and `boot` does the DOM wiring.
- `buildSplashScript` concatenates their `.toString()` and appends `boot(window, <JSON cfg>)`.
- Rule: no free references to top-level non-function bindings (constants live inside functions).
- Guarded by a `node:vm` unit test that runs the string against a stub window/document, and by a string scan for `require(`, `__webpack` and `import(`.

## TP17 · TASK-45: Overlay via `dangerouslySetInnerHTML`; the app gets a `display:contents` wrapper (TP-45.b) — approved 2026-11-03
- React owns only the two containers, both `suppressHydrationWarning`. The runtime mutates inside the overlay freely.
- Toaster and PwaRegister move inside the wrapper.
- The tracer must show 0 hydration warnings and the same overlay node across ShellGate swaps.
- Fallback (recorded as an EXE decision if needed): `inert` on a node React never renders, i.e. a runtime-created `<div>` sibling.

## TP18 · TASK-45: Public API is `window.verilaneSplash`, not `window.__verilaneSplash` (TP-45.c) — approved 2026-11-03
- `scripts/check-e2e-hooks.ts` scans `.next/static` for the substring `__verilane`. The Stage 4 name would trip it.
- Add `"__splash"` to HOOKS. The e2e force param `?__splash=1` is captured at boot into sessionStorage (e2e builds only).
- The non-e2e `buildSplashScript` string must not contain `__splash` (unit-asserted), because it ships in server HTML, which the static scan does not see.

## TP19 · TASK-45: Baseline-comparable readiness mark (TP-45.d) — approved 2026-11-03
- `emitSplash("ready")` always marks `splash:ready`, with or without a splash, so the S34 A/B measures the same code path. The runtime marks `splash:painted`, `splash:skip`, `splash:exit` and `splash:ceiling`.

## TP20 · TASK-45: Hook placement (observe-only, R7) (TP-45.e) — approved 2026-11-03
- The phase hooks go where A1 lists them. They have no return values and no state, and no control flow depends on them. Client entry is a `useLayoutEffect` in GatedApp. A pinning test (TC-141) asserts that ShellGate/DataProvider behaviour is unchanged with the splash off.

## TP21 · TASK-45: E2E force and session (TP-45.f) — approved 2026-11-03
- Under `NEXT_PUBLIC_E2E=1`, `?__splash=1` is persisted to sessionStorage, so client entry after navigation still honours it.
- Specs store `verilane-session=guest` via `addInitScript`, because the runtime reads localStorage directly while the e2e default guest comes from `resolveSession`.
- Otherwise e2e builds never show the splash, so the existing 185 specs are untouched.

## TP22 · TASK-45: `splash-budget` measures source, deterministically (TP-45.g) — approved 2026-11-03
- It is a new `scripts/splash-budget.ts` plus a test, inserted in `test:all` after `route-budget` (and after TASK-46's `image-budget`). It measures:
- gzip-9 of the built script string, `splash.css` and `splashMarkup()` together, against ≈15 KB;
- each raster in `src/assets/splash/` against 60 / 30 KB;
- the per-route shared-JS delta against E1, read from route-budget's stats, at ≤0.5 KB.
- `route-budget` itself is unchanged.

## TP23 · TASK-45: Perf A/B outside the default e2e run (TP-45.h) — approved 2026-11-03
- `tests/e2e/splash-perf.spec.ts` is tagged `@perf` and excluded from `pnpm e2e` via `grepInvert`. It runs with `pnpm e2e:splash-perf`.
- It first measures the baseline spread of `splash:ready`. If the spread is wider than ±50 ms, it runs interleaved A/B with n≥9 (S34). A no-go reopens Stage 2.
- The functional splash specs run in `test:all`. Specs that need the full D use `test.slow()`; the others skip via a keypress, and `page.clock` is used where timers allow.

## TP24 · TASK-45: Isolation (TP-45.i) — approved 2026-11-03
- Worktree `.claude/worktrees/task-45-splash`.
- `E2E_PORT=3145`. Never use 3000/3141/3900/3920; TASK-46 uses 3146.
- Scratch and temp go to `/Volumes/E Drive/Dev/.scratch/task45/`, with `TMPDIR=E2E_TMPDIR=/Volumes/E Drive/Dev/.scratch/task45/tmp`.

## TP25 · TASK-45: Fill-start contrast (TP-45.j) — approved 2026-11-03
- The ≥3:1 bar colour is chosen in TASK-45.5 against the placeholder and re-checked on final art in TASK-45.9. It is recorded as an EXE decision, not a Design revision, unless it changes the hue family.

## EXE32 · TASK-45 branch cut from main `d7144cb`, not the task/38 head (TASK-45.1) — accepted
- The plan (A8, Part E item 1; S20) said to cut `task/45-splash` from the green task/38 head (eb85789+, tip cf2c541). Both commits are now merged into `main`, so the branch is cut from `main` `d7144cb` (merge of PR #4, TASK-64), which contains them. Worktree `.claude/worktrees/task-45-splash`.
- Steps 45.1.2 (worktree) and 45.1.3 (TASK-45 docs and `.design/exploration/task-45/`) were already satisfied on `main`: the docs are tracked there, so the branch-cut commit carries only `decisions.md` and `Design.md`.
- Numbering at append time: S15–S24, D8–D15 and S33–S37 were free and are used as drafted. TP-45.a–j become TP16–TP25 (TP9–TP15 are reserved for TASK-46). No cross-reference in the TASK-45 docs changes; they keep the draft `TP-45.x` labels, which each TP entry names in its heading.

## EXE33 · TASK-45 E1 baseline on `d7144cb`: green except the accepted held-out eval gates (TASK-45.1) — accepted
- **Context.** Step 45.1.1 runs `pnpm test:all` once on E1 (`d7144cb7`, port 3145) before any TASK-45 change. The full log is in the TASK-45 scratch dir (`baseline-test-all.log`), with the CPU shared with the TASK-46 worktree.
- **Precondition.** A fresh worktree has no `.next/types`, so `typecheck` fails with `TS2304 Cannot find name 'LayoutProps'` until `pnpm exec next typegen` runs. That command writes only to the gitignored `.next/`. Run it once per new worktree, before the first typecheck.
- **Result.**
  - typecheck: pass.
  - lint: pass, 1 warning (`steps.ts:141`, TASK-70).
  - unit: 97 files / 1226 passed.
  - perf: 1/1 passed.
  - eval: 35 passed / 8 failed of 43. The 8 failures are the held-out TC-066 and heldout-v2 gates, the same as the committed `eval/report.md`.
  - build: pass.
  - check:secrets and check:e2e-hooks: clean (80 files).
  - route-budget: all 18 routes ≤ 300 KB gzip (max `/settings` 294.7 KB).
  - e2e `--workers=1`: 355 passed, 1 skipped, 0 failed (21.5 min), with TC-081 and TC-085 green on this run.
- **Decision.** The eval failures count as a known red, not a regression, per EXE23 (user, 2026-11-01: TC-066 is a known limitation and the thresholds are unchanged). Because `test:all` is an `&&` chain it stops at `eval`, so the baseline runs in two parts: `typecheck → eval`, then `build → e2e`. TASK-45 regressions are judged against these counts.

## EXE34 · Splash runtime is one self-contained function, stringified into the head (TASK-45.2) — accepted
- `src/lib/splash/runtime.ts` exports a pure `step()` state machine (unit-tested) and `splashRuntime()`, which embeds its own copy of the machine. `buildSplashScript()` inlines `splashRuntime.toString()` with the config. The script follows the THEME_SCRIPT pattern and is allowed by the static CSP's 'unsafe-inline'. It has no imports, so it adds nothing to client JS (`/settings` stays at 294.8 KB). It adds about 5.1 KB of inline HTML per page.
- `script.test.ts` runs the exact emitted string in a fresh `node:vm` context. A helper or import leaking out of the function fails there rather than in a browser.
- Globals are reached through a `(w as Window & typeof globalThis)` cast on the passed window, so the stringified body never references module scope.

## EXE35 · 45.2 `decide()` is the minimum; auth routes, seen flag and TC-135 step 3 go to TASK-45.3 (TASK-45.2) — accepted
- In 45.2 the splash shows only for a guest session with readable storage. In e2e builds it is off unless forced with `?__splash=1`, which persists in sessionStorage `verilane-splash-force`. `"__splash"` joins HOOKS in `check-e2e-hooks`. The full truth table (auth routes, `verilane-splash-seen`, once per tab) and TC-135 step 3 are TASK-45.3 / TC-137.

## EXE36 · Overlay stacks above the sonner toaster (TASK-45.2) — accepted
- `#verilane-splash` uses `z-index: 2147483000`, above sonner's toaster (999999999). No toast can paint over the splash while the app below is inert.

## EXE37 · TC-129 and TC-134 hold readiness by routing the seed manifest (TASK-45.2) — accepted
- The plan delayed the DataProvider chunk. That chunk name is not stable under Turbopack, while a fresh context always fetches `**/seed/manifest.json` to seed. The specs delay that request (TC-129, 1.5 s) or never resolve it (TC-134), so readiness can be controlled without touching the app.

## EXE38 · `layout.test.ts` updated for the splash head script and markup (TASK-45.2) — accepted
- `<head>` now has two scripts (THEME_SCRIPT, then the splash). The existing theme assertion read the head's single child, so it now finds the theme script by its content. A new test asserts the splash script, the `#verilane-splash` overlay and the `#verilane-app` wrapper (`display: contents`). Both the overlay and the wrapper carry `suppressHydrationWarning`, because the runtime sets attributes on them before hydration.

## EXE39 · Timers tick at `max(now, deadline)` (TASK-45.2) — accepted
- **Found by TC-134.** Chromium ran the 9700 ms ceiling timer while `performance.now()` still read 9699.x. `step()` saw "not yet" and nothing rescheduled, so the overlay never left (one light-project run hung).
- **Fix.** The runtime ticks with `Math.max(now(), due)`. The regression test is `script.test.ts` "treats a timer that fires slightly early as having reached its deadline" (red, then green).

## EXE40 · The TC-130 spec is tagged `@splash-perf`, not `@perf` (TASK-45.2) — accepted
- TP-45.h said `@perf`, but the existing `perf.spec.ts` uses `describe("@perf")` and runs inside `pnpm e2e` (TC-085). A shared tag would either pull the 10-minute TC-130 into `pnpm e2e` or drop TC-085 from it.
- `playwright.config.ts` greps `@splash-perf` only when `SPLASH_PERF=1`, and greps it out otherwise. The script is `pnpm e2e:splash-perf` (chromium-light, 1 worker). Setting `SPLASH_PERF_MODE=interleaved` forces A/B pairs even when the baseline spread is ≤ ±50 ms; use it when the CPU is shared.

## EXE41 · TC-134 asserts the exit at 9.7 s and done at 10.0 s (TASK-45.2) — accepted
- Per the technical plan, the ceiling starts the exit at t0 + D + 4000 = 9700 ms (±200 ms), and `done` follows exitMs (300) later. The `done` check is measured from the exit, not from t0; see EXE44.

## EXE42 · TC-128 also matches minified React hydration codes (TASK-45.2) — accepted
- Production React reports hydration errors only as #418, #423 and #425. The console regex is `/hydrat|did not match|mismatch|#418|#423|#425/i`, plus any `pageerror`.

## EXE43 · RK2 / TC-130 verdict is taken from interleaved A/B under CPU contention (TASK-45.2) — accepted
- The first run used simple A/B (9 off, then 9 on), because its baseline spread was ±27.8 ms. It gave Δ = +157.9 ms (off 589.5, on 747.4), at load 20.5 → 16.0, with the TASK-46 agent and iCloud running.
- Two interleaved re-runs gave Δ = −8.1 ms (spread ±111.8, load 12.2) and Δ = −30.4 ms (spread ±434.2, load 12.7). Only interleaving controls for contention that changes over time, so the verdict comes from the interleaved runs: no measurable regression.
- **Caveat.** These spreads are well above the 50 ms budget, so the gate cannot resolve 50 ms on this machine today. Re-run `SPLASH_PERF_MODE=interleaved pnpm e2e:splash-perf` on a quiet machine before TASK-45.7 (budget).

## EXE44 · Exit marks are stamped before slow effects; TC-134 bounds `done` from the exit (TASK-45.2) — accepted
- **Found in the gate run.** TC-134 saw `done` at t0 + 10244, outside ±200 of 10000, while the exit was within tolerance. Repeats then showed `done − exit` at 273–299 ms.
- **Cause 1, fixed.** The exit mark was stamped after the attr change and after un-inerting a large subtree. The ceiling's `console.warn` also ran before them, and it is slow with a CDP console listener. So `splash:exit` was stamped tens of ms after `tExit`, while the done timer was keyed to `tExit`.
  - `exit()` now emits the mark first, and the ceiling warns after the exit effects. Both orders are covered by `runtime.test.ts` "step · exit effect order" (red, then green).
- **Cause 2, accepted.** The done timer can fire up to about 6 ms early against `performance.now()`. This is the same slack as EXE39; `max(now, due)` counts it as due.
- **TC-134 now asserts** `300 − 20 ≤ done − exit ≤ 1500`. One run saw an 814 ms main-thread stall after un-inert. Its cause is unmeasured; the CSS fade is unaffected. A point check of `done` against t0 stacks two timers' lateness and flakes under contention.

## EXE45 · TC-130 interleaved mode judges the median of 21 paired differences (TASK-45.2) — accepted
- Four earlier runs on bbb8955 gave deltas of +157.9 (simple), −8.1, −30.4 and +74.0 ms (interleaved, 9 pairs). The baseline spread was about 150–160 ms, roughly 3× the 50 ms budget, so a difference of two medians over 9 runs could not tell pass from fail. One stalled "on" run (1148.7 ms) was enough to swing the +74 result.
- User ruling 2026-11-04: harden the test, then rerun. Interleaved mode now runs `PAIRS = 21`, alternates which side of each pair runs first, and judges `median(on[i] − off[i])`, which cancels drift between pairs and ignores a lone stalled run. Simple mode is unchanged (9 runs, difference of medians). This stays within TC-130 (n ≥ 9, compare medians).
- Caveat: the paired metric was chosen after the failing run was seen, so only fresh runs count as evidence. Fresh run on bbb8955: delta −13.7 ms. The difference of medians agrees (740.7 vs 738.1 ms), so the verdict does not depend on which estimator is used. Load average 5.7–10 during the run. Raw data: `task45/perf/tc-130-chromium-light-1793764705812.json`.
- Re-verify TC-130 at the Stage 8 test pass, after 45.3–45.10 add the full scene and bar.

## EXE46 · TC-131 measures each app interaction in its own pass, after the app has mounted (TASK-45.2, review R-6) — accepted
- **Input clock.** `input` is the skipping event's own `e.timeStamp`, captured by a window capture listener in an init script. That listener is registered before the runtime's own listener. The skip runs `splash:exit − input ≤ 50`.
- **The skip waits for the first `/invoices/` row to be attached.** The row attaches about 1.1 s after t0. Without this wait, "interactive ≤ 350 ms after input" would time the app's own load, not the splash. So the skip lands after the TC's nominal 400 ms. The skip time itself is unchanged. Separately, the ticket says "~2 s after ready" while TC-131 says 400 ms; the TC text is left alone and the mismatch is raised for review.
- **One interaction per pass.** Each skip variant runs twice: a keyboard pass and a pointer pass. The measured interaction is the first driver action after the skip. When both were chained in one pass, Playwright round-trips (probe and mark reads, Escape, scroll) added 430–790 ms that the app never spent.
  - **Keyboard pass.** Ctrl/Cmd+K must focus the shell's search combobox inside `#verilane-app` within 350 ms. Tab cannot be used, because the overlay's skip button comes first in DOM order and stays focusable during the exit (raised for review).
  - **Pointer pass.** The first row is scrolled to the centre under the overlay before the skip. A raw `mouse.click` at its box (no actionability wait) must reach the row within 350 ms of input.
- **The probe lives in `sessionStorage`.** A row click opens the invoice as a full document load, with or without the splash (checked with the splash off). An in-page probe would be lost with that page.
- Evidence: `task45/tc-131-timings.txt`. The worst cases were exit−input 30.1 ms, search−input 311.6 ms and click−input 92.1 ms.

## EXE47 · TC-131 times emulated touch from the first listener, not `e.timeStamp` (TASK-45.2, review R-6) — accepted
- **Found in R-6.** On touch, `splash:exit − e.timeStamp` was about 163 ms in both projects, while `exit − (first listener's performance.now())` was under 1 ms.
- **Cause.** Headless Chromium delivers an emulated `touchscreen.tap` 40–220 ms after its timeStamp. This happens with or without the splash: 133–145 ms with the splash on and idle, and 100–123 ms with the splash off. Mouse and keyboard are delivered 4–11 ms after their timeStamp. Evidence: `task45/touch-latency-evidence.txt` and `task45/touch-latency-nosplash.log`.
- **Rule.** The touch variant passes `clock: "handler"`. It reads input from the init script's first listener, which runs before the runtime's, and asserts the same ≤ 50 and ≤ 350 bounds. Key and mouse keep `e.timeStamp`. Every run annotates both clocks, so the delivery gap stays visible.
- Real-device touch latency is not measured here; check it on a phone at Stage 8.
- **Mixed clocks on the touch click (review N-4).** In the pointer pass, `click − input` under `clock: "handler"` subtracts the tap's first-listener `performance.now()` from the row click's `e.timeStamp`. Both are on the same performance timeline, but they are different kinds of reading. Because the handler runs after the tap's late delivery, the number leaves out the emulator's 40–220 ms delivery gap. It does not leave out any of the app's time. The annotation names the clock, so the comparison is visible. Mouse and keyboard compare `e.timeStamp` with `e.timeStamp`.

## EXE48 · The overlay is `inert` while it exits (TASK-45.3, review-45.2 Q2 carry-in) — accepted
- **Change.** The effect that removes `inert` from `#verilane-app` (on `exit`) also sets `inert` on `#verilane-splash`. The skip button can no longer take focus, or be activated, during the 300 ms fade. Before this, Tab from the page start landed on a button that was fading out (noted in EXE46).
- **Scope.** The runtime only. GatedApp and DataProvider output are unchanged (R7). `start()` removes the overlay's `inert` again, so a client-entry splash in the same document is interactive.
- **Owner.** a11y TC-45.43 still owns the full focus check. Pinned in `script.test.ts` ("overlay inert (EXE48)").

## EXE49 · TC-137 probes `[data-state="loading"]` because `[data-skeleton]` does not exist (TASK-45.3) — accepted
- **Found.** TC-137's precondition names `[data-skeleton]`, but no element in the app has that attribute. Every loading skeleton the client entry can paint carries `data-state="loading"` already: ShellLoading (the DataProviderLoader fallback), ShellSkeleton, HomeSkeleton and RowSkeleton.
- **Rule.** The probe uses `[data-state="loading"]`. Adding a `data-skeleton` marker would change GatedApp/DataProvider output, which R7 forbids for this task.
- **Probe.** An init script counts animation frames after an armed flag is set (just before the double click on "Get started"). It records the first frame with a skeleton and the `data-splash` value in that frame. `seed/manifest.json` is held for 1 s, so the loading frames are long enough to see.
- **Red proof.** With the `showSplash()` call removed from GatedApp's layout effect, TC-137 fails: the splash never turns on.
- **Start step.** The spec opens `/onboarding?step=3` instead of clicking through steps 1–2. Steps 1–2 are client-side `?step=` pushes that never mount GatedApp, so they do not change what is measured.

## EXE85 · The E1 route baseline is a constant in `splash-budget.ts`, not a `scripts/fixtures/` file (TASK-45.7, TC-161) — accepted
- **Found.** TC-161's precondition says the E1 stats snapshot is committed under `scripts/fixtures/`. The TASK-45.7 side-track brief allows only `scripts/splash-budget.ts`, its test, `package.json` and the docs.
- **Rule.** `E1_ROUTE_GZIP` in `scripts/splash-budget.ts` holds the exact First Load JS gzip bytes for each of the 18 routes. Same data, one file fewer, and the test pins it (18 routes, `/settings` = 301778 B).
- **Source.** A clean `pnpm build` of d7144cb (E1, technical plan A8) in the side worktree (detached checkout, then back to the branch), measured with route-budget's own `measureRoutes`. Every route matches `task45/baseline-test-all.log` to the 0.1 KB it prints. Raw: `task45/side-45.7/e1-route-budget.json`.
- **Update rule.** Re-record only when a ticket deliberately moves the baseline. A route with no E1 entry fails the gate.

## EXE86 · Only the 15 KB inline total gates; the ticket's per-part sub-targets are printed, not enforced (TASK-45.7) — open for the orchestrator
- **Found.** TP-45.g gates gzip-9 of script + `splash.css` + `splashMarkup()` together at ≈15 KB. TKT-45.07 also lists sub-targets: runtime ≤ 2 KB, CSS ≤ 7 KB, markup + SVG ≤ 4 KB. At 95684a3 the runtime string is **2997 B** gzip, already over the 2 KB sub-target (CSS 826 B, markup 182 B, total 3875 B / 15360 B).
- **Rule.** The plan (TP-45.g) wins: the gate enforces the 15 KB total (15360 B), and prints the three parts as `info` so drift stays visible.
- **Ask.** If the 2 KB runtime cap is meant to be hard, that is a product call (it would fail today, before TASK-45.4's bar logic lands). Not decided here.

## EXE87 · Splash rasters are classified by file name (TASK-45.7, TC-160) — accepted
- **Rule.** Under `src/assets/splash/`, a raster (`.avif .webp .png .jpg .jpeg .gif`) whose name contains `sky` is capped at 60 KB per file; names containing `cloud` are summed per format and capped at 30 KB (Design §11: two strips ≤ 30 KB total; TC-165: AVIF and the WebP fallback each within the same caps). Any other raster fails as "not sky or clouds". Bytes are raw file size, since images ship uncompressed.
- **Consequence.** TASK-45.9 must name its files with `sky` / `cloud`. The directory does not exist yet, so the check passes with nothing to measure and says so.

## EXE88 · TC-162 scans `.next/static/chunks/*.js` for markers taken from the runtime config and markup (TASK-45.7) — accepted
- **Markers.** `seenKey` and `forceKey` from `splashConfig(false)`, every `data-splash-*` attribute in `splashMarkup()`, and the runtime's `splash:painted` mark. The `events.ts` dispatch strings (`verilane:splash`, `splash:ready`) are allowed, as TC-162 says.
- **Scope.** JS only. `splash.css` is imported by `layout.tsx` and lands in a CSS chunk by design; it is counted in the inline total instead.
- **Not vacuous.** All five markers appear in the 15 prerendered `.next/server/app/*.html` files; injecting `"verilane-splash-seen"` into a built chunk makes the gate exit 1 naming the chunk and 20 B (`task45/side-45.7/negative-check.log`).
- **Inline measure.** The script is measured from source (`buildSplashScript` under tsx), which is not minified. The string in the built HTML is SWC-minified, so the source figure is an upper bound.
