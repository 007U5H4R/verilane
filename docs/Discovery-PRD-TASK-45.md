# TASK-45 — Cinematic Lighthouse Splash Screen — Discovery PRD

> **Stage:** 1 · Product Discovery (Full tier) · **Ticket:** TASK-45 · **Date:** 2026-11-02
> **Status:** DRAFT — awaiting user sign-off on the open questions in §6 before Stage 2 (Solution Design)
> **Source brief:** verbatim creative brief + 8-frame storyboard pasted into the TASK-45 ticket (quoted in full in `backlog/tasks/task-45 - Cinematic-lighthouse-splash-screen-Verilane-brand-reveal.md`)
> **Scope of this document:** *what* and *why* only — no visual design, animation architecture, or code. That is Stage 2 (`Solution-PRD.md`) and, because this is user-facing UI, Stage 3 (`Design.md`).

## 0. Why this file is not `Discovery-PRD.md`

The repo's root `Discovery-PRD.md` is the **whole-product** Stage-1 artifact (TASK-1, approved 2026-10-30) — it is a signed-off historical record and must not be overwritten. TASK-38 and TASK-39, the two features currently mid-execution (Stage 6, on `task/38-emerald-redesign` and merged into it), were inserted into the *existing* product chain as tickets, not as independent 11-stage builds, so they never got their own `Discovery-PRD.md`.

TASK-45 was scoped by the user as its own Full-tier build (any UI → Full tier), so it needs its own Stage 1 artifact. To avoid colliding with the canonical product-level file, this ticket-scoped Discovery PRD lives at `docs/Discovery-PRD-TASK-45.md`, alongside the product's other `docs/*.md` deep-dive artifacts. If Stage 2 concludes the splash doesn't deserve a full independent chain after all, this file folds into the main `decisions.md`/`tickets.md` instead — a decision for that gate, not this one.

## 1. Problem statement (as given, not yet validated)

> *A premium, minimal splash/loading animation would make Verilane's app startup feel calm, confident, and enterprise-grade, with a lighthouse as a metaphor for clarity/direction/confidence.*

This is a **brand-polish / first-impression hypothesis**, not a hypothesis grounded in a measured user complaint. No bug report, support ticket, demo feedback, or analytics signal is cited as the trigger — the brief is a creative/visual spec handed down fully formed, storyboard included. That's a legitimate way to commission a brand asset, but Discovery still owes the user an explicit statement of *what breaks if we don't build this* (see §4) and *who actually experiences the gap* (see §2), because the grooming/brief does not establish either.

### What "loading" actually looks like today (grounded in the codebase, not assumed)

Verilane (Next.js 16, Turbopack, Cache Components — confirmed against `node_modules/next/dist/docs/`) already has a layered loading sequence, most of it rebuilt one week ago (TASK-43, 4512aa6):

1. `RootLayout` → `<Suspense fallback={<GateSkeleton/>}>` wraps `ShellGate` (`src/app/layout.tsx`, `src/components/onboarding/ShellGate.tsx`).
2. `ShellGate` reads `pathname`: auth routes (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`) render bare — these already have their own illustrated first-visit experience from TASK-39 (kie.ai WebP art, currently inline SVG pending the real asset swap per `HANDOFF.md`).
3. Every other route is `GatedApp`: `useSession()` resolves the guest flag from `localStorage` via `useSyncExternalStore`. Until resolved, or while `session !== "guest"`, it renders `GateSkeleton` → `ShellSkeleton` (`src/components/states/ShellSkeleton.tsx`) — the app-frame skeleton TASK-43 just built to replace a bare spinner. No session → redirect to `/welcome`.
4. A guest session mounts `DataProviderLoader` (`src/components/DataProviderLoader.tsx`), a `next/dynamic(..., {ssr:false})` wrapper (required because Next 16 disallows `ssr:false` directly in a Server Component) whose `loading` fallback is `ShellLoading` (`src/components/shell/ShellLoading.tsx`) — real `AppShell` chrome plus a `ContentSkeleton` body.
5. Inside `DataProvider` (`src/components/DataProvider.tsx`): opens the Dexie IndexedDB (`openDb()`), then checks/loads the seed (`seedStatus` / `ensureSeeded`). While `status.kind === "loading"`, it renders `ShellLoading` again. On error it swallows the db failure and renders children anyway (existing behavior, not this ticket's concern).
6. Only once the db is open and seeded does the real route render — and the route itself may show its own skeleton (`?__state=loading` pattern, Design.md R2 decision).

**There is no "auth" in this product.** TASK-39 made sign-in/sign-up honest no-op forms ("accounts aren't available") that point to "Continue as guest." The only real entry is the guest/demo session. The brief's testing matrix lists "authenticated entry" as a distinct case from "guest/demo entry" — that distinction does not exist in this codebase (see Q7, §6).

### Existing constraints this feature walks into

- **Performance budget is currently failing, not merely tight.** Per `HANDOFF.md` (2026-11-02, Stage 6 of the unrelated TASK-38/39 work), `pnpm route-budget` is **already over its 300 KB gzip ceiling** on six routes (up to 308.2 KB), and growing with each merge — unresolved as of this writing. Anything mounted in `RootLayout`/`ShellGate` (which is everything, on every route) adds to the **shared** first-load chunk, not a per-route one. A splash that isn't deliberately code-split and asset-light will make an already-red gate redder. This is a hard scope constraint for Stage 2, not a detail to defer.
- **No animation library exists.** `package.json` has no `framer-motion`, `gsap`, `lottie`, or equivalent. All existing motion (`animate-pulse`, a custom `.ob-spinner` spin) is plain CSS, and `globals.css` already has a `@media (prefers-reduced-motion: reduce)` block (line 278) the team maintains. Any animation approach decided in Stage 2 inherits this "CSS/transform-opacity first" posture by default — introducing a new motion dependency would itself be a scope decision, not a given.
- **The brand asset and palette already exist, unmodified.** `src/components/shell/LogoCard.tsx` already implements a two-stage-capable logo treatment (full lockup, a `clip-path`-cropped "V mark only" variant, and a halo glow) from `/brand/verilane-logo-light.png` (dark surfaces) / `verilane-logo.png` (light surfaces), 460×170, V occupying the left ~25.3%. Every hex the brief lists is a **verbatim existing design token**, not a new palette to define: `--rail-deep:#062f24` (Forest background), `--rail-dark:#083a2b` (Deep emerald), `--brand:#176b50` (Primary emerald), `--rail-nav:#147653` (Active emerald), `--interactive`/`--rail-bright:#21845f` (Interactive emerald), `--rail-mint:#8ed7b0` (Mint accent), `--mint`/`--rail-soft-mint:#ddf2e7` (Soft mint). The product descriptor "AR Collections Copilot" already appears verbatim in `src/components/shell/Sidebar.tsx`. This is strong evidence the brief was written *for this exact app*, which de-risks the "does this fit the brand" question but does **not** by itself justify skipping discovery on scope/frequency/success criteria.
- **A different, OS-level "splash" already exists and is not this feature.** `src/app/manifest.ts` defines the PWA's native splash (`background_color`, `theme_color`, icons) — a static, OS-controlled screen shown only when launched as an installed PWA. The brief's animated, in-DOM, always-shown lighthouse reveal is a distinct, additional experience. Stage 2 should name both explicitly so nobody conflates "fix the PWA splash" with "build the lighthouse reveal."
- **Two illustrated first-visit experiences would compete if scoped wrong.** TASK-39 already gives a brand-new visitor an illustrated `/welcome` onboarding flow. If the lighthouse splash is *also* shown ahead of that, a first-time visitor sees two premium full-screen reveals stacked, which argues against the brief's own "calm, confident" goal. See Q3, §6.

## 2. Target users

Two groups experience "app startup" differently, and the brief does not distinguish them:

- **First-time evaluators** (a prospect clicking a demo link, someone being shown Verilane for the first time): startup happens once, truly "cold," and a cinematic reveal plausibly earns its ~6s reference budget — this is the audience a brand-reveal splash is classically built for.
- **Returning/frequent users** (an AR analyst who opens or refreshes the tool many times a day in real operational use, once this ships to real customers): for them, "app startup" is background noise they want out of the way, every single time — the brief's own "avoid list" (anything that makes the app feel slow) is written with exactly this audience's patience in mind.

Who this feature is *for* changes what "success" means (a one-time wow moment vs. a thing experienced hundreds of times that must disappear instantly when unneeded). Discovery cannot settle scope/frequency (§6, Q1/Q9) without the user naming the primary audience.

## 3. In scope (candidate — pending §6 sign-off)

- A startup-time visual reveal (lighthouse scene, cloud layers, light beam, two-stage logo reveal, product descriptor, loading indicator) that **tracks real app-readiness** (session resolve → db open → seed ready), never a fixed fake timer.
- Respecting `prefers-reduced-motion` to at least the standard the codebase already applies elsewhere (remove continuous motion, show the completed composition, keep accessible contrast).
- Working across the existing responsive breakpoints the shell already uses (mobile / tablet / desktop), not a separate breakpoint scheme.
- Composing with the existing loading architecture (`ShellGate` → `GateSkeleton`/`ShellSkeleton` → `DataProviderLoader` → `ShellLoading` → `DataProvider`) rather than forking a parallel one — *how* it composes is Stage 2's decision, but *that* it must compose (not replace blindly) is a Stage-1 boundary set by the ticket brief itself.
- A measured performance budget for the feature's own added weight (exact numbers are a Stage 2/5 decision; that a ceiling exists at all is decided now — see Q4).

## 4. Explicitly out of scope for this ticket

- **Fixing the pre-existing route-budget failures.** Those six routes are already over budget today, before this ticket exists, and are tracked as an open, unresolved item in `HANDOFF.md` for the TASK-38 work. This ticket must not make that worse, but is not the ticket that fixes the existing overage.
- **Generating the final production artwork.** The brief names kie.ai/Higgsfield landscape/cloud assets as inputs. Discovery needs to confirm *that* bespoke artwork is required (not a stock/placeholder image) and *who* produces it — commissioning the actual generation is Stage 3 (UI/UX Design) work, once a layered-composition approach is approved, following the TASK-39 precedent (kie.ai asset commissioning happened inside that stage, not before it).
- **Redesigning `/welcome`, onboarding, sign-in/sign-up, or any TASK-39 territory.** This ticket touches the *gated-app* startup path only, unless §6 Q3 is answered otherwise.
- **Introducing a new animation library.** Unless Stage 2 makes an explicit, justified case against the existing CSS-first posture, this stays within what the codebase already uses.
- **Changing session/auth architecture, the Dexie seed/load pipeline, or the service-worker/manifest PWA splash.** The splash observes their state; it does not change their behavior.

## 5. Success criteria (categories locked now; exact numbers deferred to Stage 2/5)

A ticket this motion- and performance-sensitive needs criteria the user can actually check, not "feels premium." Discovery locks the *categories*; Stage 2 (Solution-PRD NFR targets) and Stage 5 (`test-cases.md`) lock the numbers:

1. **No added perceived latency on a real load.** On a load that would have reached the ready app in *T* ms today, the splash must not push real readiness later than *T* ms (plus, at most, the agreed flash-guard floor — see Q5). It must reach exactly the real completed state, never an inaccurate percentage, never a restart, never a hold on an already-complete bar.
2. **No net-new route-budget regression.** The feature's own added shared-bundle weight (JS/CSS, not counting lazily-fetched decorative images) stays under a concrete ceiling to be set in Stage 2, and the `route-budget` gate's *existing* failures are not attributable to this ticket when re-measured.
3. **Accessibility: clean on `prefers-reduced-motion`, contrast, and no flashing content**, consistent with the standard already enforced elsewhere in this codebase (`globals.css` line 278 and friends).
4. **No regression in the existing e2e baseline** (currently 185 passed / 1 skipped per `HANDOFF.md`), plus new splash-specific coverage for: fresh cold start, guest/demo entry, fast load, slow/throttled load, browser refresh, the responsive breakpoints already in use, reduced motion, and both app themes (light/dark) — see the corrected matrix at Q7.
5. **Core Web Vitals on cold load (LCP/CLS/INP) are unaffected or improved**, not merely "build succeeds" — measured, not assumed, per the global verification standard.

## 6. Open questions — require explicit sign-off before Stage 2

These are the frontier of what Discovery can't settle without the user. Each is worded so "yes" accepts the recommendation; a different answer is equally fine, it just needs to be said.

---

**Q1 — Trigger frequency: how often does a tab actually show this?**
Candidates: (a) every cold load *and* every refresh of any route, every time; (b) once per browser tab/session (e.g. a `sessionStorage` flag) — shown the first time the gated app mounts in that tab, not replayed on in-app navigation, but shown again after a hard refresh or a new tab; (c) only ever once, on this browser's genuinely first visit, never again after that.
This decision directly trades off the brief's "cinematic first impression" goal against its own "avoid list" item, "anything that makes the app feel slow" — a frequent refresher who has to sit through the beam/logo reveal every time will experience exactly the slowness the brief says to avoid.

➡️ Recommend **(b)**: once per tab session. A first-time cold load earns the reveal; a refresh mid-session (the common case for an active operational user) does not re-earn it.

---

**Q2 — Primary audience: who is this actually for?**
First-time evaluators/demos (a one-time "wow" is the whole point) vs. frequent daily operational users (for whom the brief's "fast, calm, never makes you wait" promise is the whole point, and the reveal itself is closer to a tax than a feature).

➡️ Recommend **first-time evaluators/demo context as primary**, with the explicit design consequence that returning users should see this rarely (reinforces Q1's "once per session" default, and argues against ever showing it more than once per day even across tabs, if that turns out to be cheap to implement).

---

**Q3 — Scope boundary against `/welcome`/onboarding: does the splash ever appear on the auth routes?**
TASK-39 already gives a brand-new visitor an illustrated first-visit experience at `/welcome`. Showing the lighthouse reveal *there too* means a new visitor sees two consecutive full-screen premium reveals before reaching anything functional.

➡️ Recommend **no** — the splash applies only to the gated-app entry path (`session === "guest"`, while `DataProviderLoader`/`DataProvider` are still resolving), never to `/welcome`, `/sign-in`, `/sign-up`, `/onboarding`.

---

**Q4 — Performance ceiling: is a concrete KB budget for the splash's own code+assets an in-scope success criterion, given the shared bundle is already over budget on six routes?**
The alternative is treating this ticket as exempt from the budget gate until the pre-existing overage is separately resolved (per §4, not this ticket's job) — which risks shipping a splash nobody can measure against anything.

➡️ Recommend **yes** — set a concrete ceiling in Stage 2 for the splash's own shared-bundle JS/CSS weight (a reasonable opening number to test against in Stage 2 is ≤15 KB gzip, with any raster/decorative imagery lazy-loaded and excluded from the first-load JS measurement), and treat "did not worsen the pre-existing failures when re-measured" as the acceptance bar for this ticket specifically, independent of whoever/whenever fixes the existing six.

---

**Q5 — The flash-guard floor: how long is "kept short"?**
The brief says a minimum display time is fine "only to avoid a flash on very fast loads" but gives no number, and this is in tension with "never artificially delay entry."

➡️ Recommend **a floor of ~400 ms** (long enough that nothing flashes on an instant load, short enough nobody would call it an artificial delay) as the Stage 2 starting number, confirmed/adjusted in `test-cases.md`.

---

**Q6 — Artwork commissioning: confirmed as Stage 3's job, not Stage 1's or Stage 2's?**
The brief specifies kie.ai/Higgsfield-generated landscape/cloud art, following the TASK-39 precedent. Discovery just needs to confirm bespoke artwork (not a stock photo or a flat placeholder) is actually required, and that producing it is deferred until a layered-composition approach exists to generate *for*.

➡️ Recommend **yes, Stage 3**, following the TASK-39 pattern exactly (illustration brief + generation happened inside the design stage once the approach was approved, not before).

---

**Q7 — Testing matrix correction: drop "authenticated entry" as a distinct case?**
The brief's testing matrix lists "authenticated entry" and "guest/demo entry" as two cases. This codebase has no auth backend — the only real entry is the guest session (TASK-39's explicit, user-approved decision). Carrying the brief's matrix forward unedited would have Stage 5/8 write a test case for a state that cannot exist.

➡️ Recommend **yes** — the corrected matrix is: fresh cold start, guest/demo entry (the only entry), fast load, slow/throttled load, browser refresh mid-session, the existing desktop/tablet/mobile breakpoints, reduced motion, and both app themes (light/dark) — with the splash's own scene staying dark-emerald regardless of theme, per the brief, since that's a deliberate choice already consistent with how the theme script in `layout.tsx` works today.

---

**Q8 — Definition of done: are the five success-criteria categories in §5 the right and complete list?**
Listed again for a single yes/no: (1) no added perceived latency beyond the agreed flash-guard, (2) no net-new route-budget regression, (3) reduced-motion/contrast/no-flashing accessibility, (4) the existing e2e baseline plus new splash coverage across the corrected matrix, (5) Core Web Vitals on cold load unaffected or improved.

➡️ Recommend **yes, as the complete list** — Stage 2 attaches numbers, Stage 5 attaches test cases; nothing new gets added informally later without walking the artifact-sync chain.

---

**Q9 — Given this is genuinely new, independently-run Stage-1 work while TASK-38/39 execution is mid-flight on `task/38-emerald-redesign`: confirmed this chain stays entirely on `main`, touches no other branch/worktree, and gets its own ticket-scoped artifact set (this file, and eventually its own `Solution-PRD`/`Design.md`/etc.) rather than folding into the TASK-38 chain's artifacts?**
This mirrors the explicit instruction already given for this task, restated here so it's on record as a Discovery-time decision rather than an assumption carried only in chat.

➡️ Recommend **yes** — confirmed by the task framing itself; recorded here for traceability.

---

## 7. What Stage 1 deliberately does not contain

No visual design, no layer architecture, no animation timing implementation, no chosen composition point inside `ShellGate`/`ShellLoading`, no image-generation prompts, no component names. All of that is Stage 2 (`Solution-PRD.md`) and, since this is user-facing UI, Stage 3 (`Design.md` via `t-design`, with the mandatory `web-deliverables.md` mobile-responsiveness / link-preview / four-screen-state gates — link-preview does not apply here since this is not a publicly shared page, but mobile responsiveness and screen-states do).
