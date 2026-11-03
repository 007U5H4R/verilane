# TASK-46 — Indian Heritage Background System (light + dark panoramas) — Discovery PRD

> **Stage:** 1 · Product Discovery (Full tier) · **Ticket:** TASK-46 · **Date:** 2026-11-02
> **Status:** DRAFT. Stage 2 (Solution Design) waits for the user to sign off on the open questions in §6.
> **Source brief:** the user's creative brief for an app-wide Indian-architecture panorama, plus the reference image `~/Downloads/Misty Sage Panorama of Indian Landmarks.png`. The ticket is `backlog/tasks/task-46 - Add-Indian-heritage-background-system-light-dark-panoramas.md`.
> **Scope of this document:** *what* and *why* only. It contains no component architecture, no prompts and no code. Those belong to Stage 2 (`Solution-PRD-TASK-46.md`) and, because this is user-facing UI, Stage 3 (a Design.md revision).
> **Nothing was generated in Stage 1.** No kie.ai or Higgsfield call was made. The only image work was read-only analysis of the user's reference PNG and screenshots of the running dev app. Those files live in scratch at `/Volumes/E Drive/Dev/.scratch/task46/`, outside the repo.

## 0. Why this file is not `Discovery-PRD.md`

The root `Discovery-PRD.md` is TASK-1's approved product-level record, and it must not be overwritten. TASK-46 is its own Full-tier build: it has UI and a public, brand-visible surface. It therefore gets a ticket-scoped Stage 1 artifact, following the precedent of `docs/Discovery-PRD-TASK-45.md`. TASK-46 is independent of TASK-38/39 (the Emerald redesign, currently in Stage 6) and of TASK-45 (the splash, currently in Stage 2). Its overlaps with both are listed in §1.5.

## 1. Problem statement (as given, not yet validated)

> *A subtle, app-wide panorama of Indian architectural heritage, in pale monochrome linework with a paper texture and a bottom fade, would give Verilane a distinctive brand signature. The finance UI must stay primary.*

This is a **brand-identity hypothesis**. No user complaint lies behind it: no demo feedback or analytics signal is cited, and nobody has said the app "feels generic". That is a valid way to commission brand work. Discovery still has to state what breaks without it (answer: nothing functional) and who perceives the gain (§2). It also has to account for the fact that **the project's approved design system currently forbids this kind of asset** (§1.1).

### 1.1 Design governance: this contradicts the approved Design.md, and the same idea was already tried and reverted

- `Design.md` §1 anti-direction says: *"No cartoon illustration, no stock photography, no decorative icon-per-label"* and *"Visual quietness is the trust signal."* Global rules say an approved `Design.md` outranks any design skill. Only the user can override it, and the override must be recorded.
- **Revision R1** (TASK-37, user override, 2026-11-02) added a decorative fixed canvas image, `public/bg/canvas-blur.webp`, at opacity 0.85 light / 0.18 dark through `--canvas-art-opacity`. **TASK-38 (commit `583ebab`) deleted it the same day** in favour of "solid surfaces". An R2 entry documenting that reversal has **not** been written; `HANDOFF.md` lists "Design.md R2" as not started.
- TASK-46 is therefore the second attempt, inside one week, at a decorative app-wide canvas. That is allowed. But the build needs an explicit **Design.md revision**, and a **kill criterion** agreed before any art is made, so that a third flip-flop is a deliberate decision and not churn (Q3).

### 1.2 What the canvas actually looks like today (measured, not assumed)

The measurements below come from the running dev app on `task/38-emerald-redesign` at HEAD `f493a7b`, using a guest session. Playwright measured the fraction of the content-column viewport where no opaque element covers `--canvas`. The script is `/Volumes/E Drive/Dev/.scratch/task46/scripts/shots.mjs`, and the screenshots are in `/Volumes/E Drive/Dev/.scratch/task46/shots/`.

| Route | Desktop 1440×900: visible canvas (whole / top 40%) | Mobile 390×844: visible canvas | Brief's requested level |
|---|---|---|---|
| Home `/` | 0.44 / 0.44 | 0.25 | visible-subtle |
| Queue | 0.26 / 0.42 | 0.39 | very subtle, upper canvas only |
| Disputes | 0.23 / 0.43 | 0.35 | subtle |
| Emails | 0.37 / 0.43 | 0.25 | nearly invisible |
| Invoices | 0.25 / 0.48 | 0.32 | very subtle |
| Payments | 0.32 / 0.52 | 0.33 | subtle |
| Drafts | **0.77** / 0.42 | **0.63** | very subtle |
| Audit | **0.62** / 0.42 | 0.52 | very subtle |
| Settings | 0.22 / 0.42 | 0.25 | very subtle |

Dark-theme desktop numbers match light-theme numbers.

What this shows:
- **Cards hide most of the canvas.** White (light) and `--surface` (dark) cards are opaque. The art will mostly be seen in gutters, in the band under the top bar and in empty states. **Composition and placement will matter more than opacity.** On Home, the reference image's monument band (22–68% of its height) would sit almost entirely behind the KPI cards and the attention list.
- **The brief's per-module levels run opposite to the real exposure.** Drafts and Audit are the emptiest pages: Drafts' default demo state is an empty state. So they would show the art *most*, even though the brief rates them "very subtle". Home, which the brief wants to be the most visible, is only mid-density.
- **On mobile** the canvas shows only in the 16px gutters between stacked cards, plus empty states. Whether mobile gets a background at all is an open question (Q6).
- **The sidebar (≥1024px) and icon rail (768–1023px) are dark emerald in both themes** (`--rail-deep` / `--rail-dark`). The panorama can only appear in the content column, which starts at x=272 on desktop.
- **The top bar is translucent and blurred** (`bg-topbar` = `rgb(248 250 248 / 0.88)` + `backdrop-blur-md`, sticky). The art will show through it, blurred, whenever it reaches the top of the viewport.
- **Pages scroll long** (mobile Invoices is 6537px tall). Fixing the art to the viewport and scrolling it with the page give very different results (Q5).

### 1.3 The reference image (is it the asset, or only a reference?)

Analysis of `Misty Sage Panorama of Indian Landmarks.png`:
- **Size and format:** 1672×941 (about 16:9, **not 21:9**), PNG, 1.4 MB, no alpha. At 1672px wide it is low-resolution for 2560px+ displays. A test WebP re-encode came to 16.6 KB natively and 34 KB upscaled to 2560px, so file weight is not the problem; sharpness is.
- **Background colour:** `#FAF9F7`, a warm off-white. It is **not** the app's light canvas `--canvas: #f7f9f7` and **not** the brief's `#F8FAF8`. Placed as an opaque image, it would show a faint visible rectangle unless it is masked or faded at every edge, or retinted.
- **Tonal range:** the darkest monument pixels are about `#D4DDD2`, which is lighter than the brief's monument tone `#C9D6CC`. Everything below about 70% of the image height is empty.
- **Landmark accuracy against the brief's "accurate silhouettes, no hybrids" rule:**
  - India Gate, Qutub Minar, Taj Mahal, Hawa Mahal and the Amber Fort–style hill palace are present and recognisable.
  - **The "Dravidian gopuram" is not a gopuram.** It is a curvilinear Nagara/Odisha-style *shikhara* with a flag and side domes. A gopuram is a rectangular, stepped, tiered gateway tower. This is exactly the kind of hybrid the brief forbids.
  - **The Hampi stone chariot is drawn with a lion-like animal in front.** The real Vijaya Vittala chariot has elephants.
  - **The Mysore Palace–inspired domes are missing.** A structure at the far right edge is cropped.
  - The skyline is continuous, so it **implies adjacency** between monuments that are hundreds of kilometres apart, which the brief rules out. That rule needs a definition: separate vignettes, atmospheric gaps, or simply accepted as stylisation (Q7).
  - Birds and clouds are present, but the brief does not mention them.

### 1.4 Palette check against the real tokens

- **Dark-theme mismatch (load-bearing).** The brief's dark background values `#062F24` / `#083A2B` are the **sidebar** tokens `--rail-deep` / `--rail-dark`. The real dark content canvas is `--canvas: #0d1511`, a near-black green, and cards use `--surface: #141f19`. A panorama faded to `#062F24` would show as a visible emerald slab on `#0d1511`. The brief also asks to "fade to the real dark canvas", which in this codebase means `#0d1511`. So the brief contradicts itself, and the dark asset's monument tones (`#174C3A` / `#28634C` / `#397A5D`) must be checked against `#0d1511` (Q2).
- **Light theme.** The brief's `#F8FAF8` is close to `--canvas: #f7f9f7`, and it exactly matches the top-bar tint. The difference is subpixel, but an image with a baked-in background still needs that background to be either exact or masked.
- **Prominence.** The brief targets "8–15% prominence" but does not say what it is a percentage of: layer opacity, luminance contrast against the canvas, or area. It must be defined before it can be a success criterion (Q12).

### 1.5 Existing constraints and other in-flight work (sequencing and merge risk)

- **Branches.** `main` (`6e53103`) contains no `src/` at all, only planning documents. The app on `build/verilane-v1` (`2e360f1`) is the old TASK-37 glass restyle. The code this feature must compose with (the rewritten `AppShell`, `globals.css` tokens, `layout.tsx`) exists **only on `task/38-emerald-redesign`**, which is 54 commits ahead. TASK-46 therefore **cannot be built on `main`**. It must branch from `task/38-emerald-redesign` at a gates-green point, or wait for that branch to merge (Q11). TASK-45's Solution PRD reached the same conclusion.
- **`AppShell.tsx` is a hotspot.** It is the natural mount point, because it is shared by every in-app route and also renders during `ShellLoading`. `task/44-demo-tour` (`AppShell` +10 lines, `ShellGate` +15) and `task/41-auto-send` (`AppShell` +10 lines: an `AutopilotGate` beside `<main>`) both already edit it. A third edit in the same region is a predictable merge conflict.
- **TASK-45 (splash).** The splash is a server-rendered overlay beside `<Suspense><ShellGate/>` in `RootLayout`, always dark emerald. Its exit fade reveals whichever theme is active. A shell-level panorama would sit under the skeleton and be **the first thing revealed when the splash fades**. The two tickets need one coordinated first frame: does the panorama load before the splash ends, appear after it, or fade in? Neither should hold up the other (Q9). TASK-45's plan explicitly does not change `ShellSkeleton`, `ShellLoading` or `GateSkeleton`.
- **Theme mechanism.** There is no React theme provider. `THEME_SCRIPT` in `layout.tsx` sets `data-theme` on `<html>` before hydration, from `localStorage['verilane-theme']` or the system preference. `ThemeToggle` flips the attribute; it holds no React state. Dark tokens are defined twice: under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and under `:root[data-theme="dark"]`. Anything that "follows the theme" must key off that attribute. The brief's "no new provider" rule fits this.
- **Reduced motion.** `globals.css` (around line 278) disables every animation and transition under `prefers-reduced-motion`. Any crossfade on theme switch therefore disappears for those users, which is correct.
- **Route budget.** `scripts/route-budget.ts` measures only gzip First Load JS (≤300 KB per route). Images do not count. Current state: **all 18 routes pass**. The largest is `/settings` at 291.7 KB, leaving about 8.3 KB of headroom. (`HANDOFF.md`'s "FAILS on 6 routes" is stale.) A decorative background must add roughly zero JS, and its image bytes need their own ceiling, because the existing gate would not catch them.
- **Asset conventions.** TASK-39's kie.ai art lives in `public/onboarding/*.webp` at 1200×896 (1200×1490 for auth), 29–52 KB each, with originals kept separately. Brand marks are in `public/brand/`. The PWA precache rules decide whether a background image ships offline; R1 chose "not precached".
- **Auth routes** (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`) render without `AppShell` and already carry TASK-39 illustrations. A shell-mounted background would not reach them (Q10).

## 2. Target users

| User | What they would experience | What matters to them |
|---|---|---|
| **AR analyst / collections manager (daily user)** | Hours a day in Queue, Disputes and Invoices. They will see the art thousands of times. | Zero cost to scanning speed, contrast or focus. Decoration that is noticed on day 1 must not become noise by day 30. |
| **Demo evaluator / prospective buyer** | A few minutes, usually on Home and one workflow, often on a projector or a shared screen. | A memorable, distinctive brand impression, and cultural accuracy: an Indian audience will notice a wrong gopuram. |
| **Indian enterprise stakeholders (the cultural audience)** | They read the landmarks as a statement about identity. | Respectful, correct depiction. No implied geography, no hybrid monuments, no exoticising. |
| **Users with low vision, high contrast needs or reduced motion** | They see the art behind text-bearing surfaces. | The art never lowers text contrast, never moves, and disappears or holds still when the OS asks. |

The daily analyst pays the cost and the demo evaluator collects the benefit. That imbalance is why the brief's "finance UI first" rule and the kill criterion in Q3 matter.

## 3. In scope (what, not how)

1. A theme-aware decorative background for **in-app (shell) routes**: one light and one dark treatment that match the real canvases (`#f7f9f7` / `#0d1511`).
2. A curated, **accurate** landmark set, as confirmed in Q7, depicted without hybrids. "No implied adjacency" gets a definition.
3. Final raster assets made with kie.ai/Higgsfield in a **later stage** (not Stage 1). Masters are kept separately, and the delivered files are web-optimised (AVIF/WebP).
4. Per-route visibility control (at minimum on, reduced or off), set from measured canvas exposure rather than only from the brief's table (Q4).
5. Correct behaviour across theme switching (no flash of the wrong asset), breakpoints (desktop, tablet, mobile), reduced motion, loading (the skeleton chain and the TASK-45 splash exit), and all four screen states of each data-backed view.
6. A Design.md revision that records the override of §1 anti-direction, and the kill criterion.
7. QA evidence: screenshots of Home, Queue and Disputes in both themes, plus mobile Home in both themes; contrast checks; and the standard gates (typecheck, lint, unit, perf, build, route-budget, e2e and axe baseline).

## 4. Out of scope

- **Making any art in Stage 1.** Generation happens after Stage 3 approves the composition. (Stage 1 made no API calls.)
- **Auth routes and the TASK-39 onboarding art**, unless Q10 decides otherwise.
- **The TASK-45 splash.** TASK-46 neither restyles it nor changes the loading chain (`GateSkeleton`, `ShellSkeleton`, `ShellLoading`) beyond letting the background show through.
- **Parallax, scroll-linked motion, animated elements, large blur filters, video.** The brief rules these out.
- **New dependencies or a theme provider**, and any change to the token system beyond what the background needs.
- **Fixing other tickets' problems** found during discovery: the stale HANDOFF route-budget line, the missing Design.md R2, and the dev overlay's "1 Issue". They are reported separately.
- **Marketing pages, OG images, the PWA icon or the manifest colour.**
- **What breaks if we don't build it:** nothing functional. The cost of not building is a lost brand-signature opportunity, which is also why it must never cost the finance UI anything.

## 5. Success criteria (categories; numbers are proposed and confirmed in Stage 2 or 5)

| # | Category | Proposed measure |
|---|---|---|
| SC1 | **Finance UI unaffected** | Every text and icon on every route keeps WCAG AA contrast, measured over the art. The axe and e2e baseline holds (185 passed, 1 skipped). Users can still find what they were looking for. |
| SC2 | **Prominence within the agreed band** | Prominence is defined (Q12), then measured per route and theme from screenshots. Each route falls inside its agreed level. |
| SC3 | **Zero JS cost** | The route-budget delta is ≈0 KB on every route. `/settings` stays at or under 300 KB. |
| SC4 | **Bounded image weight** | A proposed ceiling of ≤60 KB per theme for desktop and ≤25 KB for mobile, if mobile has a background. The off-theme asset is not downloaded until it is needed, or the reason for preloading it is accepted. Not precached, unless decided otherwise. |
| SC5 | **No layout or paint regressions** | CLS is unchanged. There is no flash of the wrong theme's art on a cold load or a toggle. LCP is not taken over by the decorative image. |
| SC6 | **No stacking regressions** | Menus, popovers, tooltips, dialogs (Radix and native `<dialog>`), the sticky top bar, the fixed BottomTabs, RailDemoData, toasts and the TASK-45 splash all render above the art. The art never captures pointer events and is hidden from assistive technology. |
| SC7 | **Cultural accuracy** | A named reviewer confirms every landmark silhouette (Q7). No hybrids, and the adjacency rule is met as defined. |
| SC8 | **Coverage** | Both themes. Desktop, tablet and mobile behave as decided in Q6. Reduced motion, forced colours and high contrast degrade cleanly. All four screen states are checked on Home, Queue and Disputes. |
| SC9 | **Reversibility** | The background can be turned off in one place (a token, flag or prop) without touching any route code. That is the mechanical form of the kill criterion. |

## 6. Open questions (each with a recommendation)

1. **Is the reference PNG the light asset, or only a style reference?**
   ➡️ **Recommend: style reference only.** It is 16:9 and not 21:9, too low-resolution for wide displays, and its background `#FAF9F7` doesn't match the canvas. The "gopuram" is a shikhara, the chariot has the wrong animal, Mysore is missing and the right edge is cropped. Keep its mood (sage linework, mist, paper) and generate accurate assets later.
2. **Which dark canvas do the dark assets target?** The brief's `#062F24` / `#083A2B` are the sidebar tokens; the real content canvas is `#0d1511`.
   ➡️ **Recommend `#0d1511`** (and `--surface #141f19` where the art could meet cards). Re-check the brief's monument tones against it in Stage 3, since they may need shifting toward the canvas.
3. **Do you explicitly override Design.md §1 ("no illustration … visual quietness") for this, given that R1 added a decorative canvas and TASK-38 removed it the same day?**
   ➡️ **Recommend yes, but recorded as a Design.md revision, with a kill criterion agreed now.** Proposed criterion: if, after Stage 7 critique, the art fails SC1 or SC2 on any data-dense route, or you judge it noise after a week of daily use, it is switched off globally through SC9 rather than redesigned again. TASK-38's still-missing R2 entry should be written first, so the revision history stays readable.
4. **Use the brief's per-module visibility table, or re-base it on measured exposure?**
   ➡️ **Recommend one global treatment, plus per-route overrides set from measurement.** The table runs opposite to reality: Drafts and Audit are the emptiest pages (0.77 and 0.62 of the canvas visible), so the art shows most there even though the brief rates them "very subtle". Home is mid-density. Proposed: Home normal; Queue, Disputes, Invoices and Payments upper band only; Emails, Settings, Drafts and Audit reduced. Keep the levels to three (normal, reduced, off), not nine bespoke values.
5. **Should the art be fixed to the viewport, or scroll away with the page?** Pages run up to about 6.5k px on mobile.
   ➡️ **Recommend: anchored to the top of the content column and scrolling away with the page**, so it reads as a header-band signature that is gone once the user is working. The alternative is a fixed backdrop that sits under the data permanently. This also suits Queue's "upper canvas only" request. Note that it shows blurred through the translucent top bar.
6. **Mobile (<768px): a separate portrait asset, a crop, or nothing?** Today the canvas is visible only in 16px gutters and empty states.
   ➡️ **Recommend: no separate asset for v1.** Show a cropped, header-band-only strip on Home and turn it off elsewhere on mobile. Optional Asset C is deferred until desktop is approved. Tablet repositions the desktop asset.
7. **The landmark set and the accuracy rules.** Which 8 monuments? Does "Dravidian gopuram" mean a specific temple (for example Meenakshi or Brihadeeswarar)? Is Mysore Palace in? Does "no implied adjacency" mean separate vignettes or atmospheric gaps, or is a continuous stylised skyline acceptable? Who signs off on accuracy?
   ➡️ **Recommend:** keep the brief's eight. Make the gopuram an unmistakable tiered rectangular gateway tower (Meenakshi style), give the chariot elephants, include Mysore's domes, and drop birds unless wanted. Define adjacency as "atmospheric breaks (mist, scale changes) between landmarks, no shared ground line". **You are the cultural reviewer**, unless you name someone else.
8. **Is a crossfade on theme switch worth its cost?** There is no React theme state, and a crossfade needs both assets loaded and layered.
   ➡️ **Recommend: an instant swap driven by CSS on `[data-theme]`, with no fade.** The rest of the UI already swaps instantly on toggle, and reduced motion would remove the fade anyway. Preload the alternate asset only on idle or on toggle hover, not up front, which keeps SC4 honest. If you want the crossfade, Stage 2 will price it.
9. **During loading and the TASK-45 splash, does the art show under the skeleton?**
   ➡️ **Recommend: yes, but it never blocks or holds up the splash exit.** It is present under `ShellLoading` if already decoded, and it is never part of the splash readiness signal. TASK-45's exit reveals it like any other canvas content. Coordinate the first frame with the TASK-45 Stage 3 mockups, so the two brand moments don't compete.
10. **Should auth routes (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`) get it?**
    ➡️ **Recommend: no.** They have no shell and already carry TASK-39 illustrations, and two art systems on one screen would clash.
11. **Sequencing and branch.** It cannot be built on `main`, which has no code.
    ➡️ **Recommend:** run Stages 2–5 now, since they are docs only. Cut `task/46-heritage-bg` from `task/38-emerald-redesign` at a gates-green point after TASK-38/39 settle, in its own worktree. Agree an `AppShell` insertion point with TASK-44 and TASK-41 (or land after them) to avoid three-way conflicts. Commit the TASK-46 docs on that branch, not on `task/38`.
12. **What does "8–15% prominence" measure, and what are the byte ceilings?**
    ➡️ **Recommend:** define prominence as the art's peak luminance contrast against the canvas, expressed as an equivalent layer opacity, measured from screenshots. Adopt SC4's ceilings (≤60 KB per theme on desktop, ≤25 KB on mobile).
13. **Is the QA screenshot list complete?** The brief lists Home, Queue and Disputes in both themes, plus mobile Home in both themes.
    ➡️ **Recommend: add** tablet Home in both themes, Drafts' empty state (the highest exposure), a menu or dialog open over the art (stacking), and reduced-motion plus forced-colours checks.

## 7. What this Stage 1 document deliberately does not contain

- No component API: the brief's `IndianHeritageBackground` props (opacity, vertical position, fade, page visibility) are inputs for Stage 2, not decisions.
- No layering or CSS approach, mount point, image-loading strategy, or prompts for kie.ai/Higgsfield.
- No generated or edited assets. None exist yet.
- No change to source, `Design.md`, `decisions.md`, or any TASK-45 or TASK-38/39 artifact.

**Next:** with the user's sign-off on §6, Stage 2 (`bw-solution-design`) writes `docs/Solution-PRD-TASK-46.md`.
