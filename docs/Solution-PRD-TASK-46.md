# Solution PRD — TASK-46 · Indian Heritage Background System

**Status:** APPROVED (2026-11-02). The user accepted the recommendation for every §9 item; see the approval record under §9.
**Tier:** Full (UI, public surface). **Stage:** 2 · Solution Design.
**Input:** `docs/Discovery-PRD-TASK-46.md`, Stage 1 approved 2026-11-02 with every Q1–Q13 recommendation accepted.
**Scope note:** This document is ticket-scoped. The root `Solution-PRD.md` and `Discovery-PRD.md` belong to TASK-1 and were not touched.
**Decision IDs:** These are provisional (`S46-a`…). They get real `S#` numbers when they are appended to `decisions.md` after approval, numbered after TASK-45's S15–S20 so the two don't collide. See Appendix A.

---

## 1. Problem recap (from Stage 1, approved)

We want a quiet, theme-aware Indian-monument panorama behind the authenticated app shell. It must not hurt trust, readability, performance or the frozen design language. Stage 1 established five things:

1. `Design.md` §1 forbids decorative illustration, and TASK-38 removed the R1 canvas art in commit `583ebab`. So this needs a formal design revision with a switch-off rule.
2. The dark canvas is `#0d1511`. The brief's `#062F24` is the sidebar colour.
3. The brief's per-module levels run opposite to the measured exposure: Drafts and Audit are the emptiest views.
4. The reference PNG is a style reference only. Its landmarks are inaccurate.
5. `AppShell.tsx` is shared with TASK-44 and TASK-41.

## 2. Chosen approach

**One decorative `<div>` mounted inside `AppShell`'s content column. The image is a CSS `background-image`, chosen by CSS from `[data-theme]` and a viewport media query. A pure pathname-to-level map sets a `data-level` attribute.**

- **Rendering.** The image comes from CSS (`image-set()` with AVIF first and WebP as fallback), not from `<img>`. The theme selectors copy the existing token block exactly:
  - light is the default;
  - dark applies under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and under `:root[data-theme="dark"] …`.

  `THEME_SCRIPT` sets `data-theme` before first paint, so the first fetch is always the correct theme's asset. There is no flash and no hydration dependency.
- **Placement.** The art is anchored at the top of the content area and scrolls with the page (Q5). The content column gets `relative isolate`. The art layer is `absolute inset-x-0 top-0 -z-10`, so it paints above the canvas and below all content.
- **Prominence.** One global treatment has three levels: `normal`, `reduced` and `off` (Q11). Each route's level comes from the measured exposure (§4). `off` is `display:none`, so the browser never fetches the image.
- **JS cost is about 0 bytes of new dependencies.** The client logic is one pure function (`heritageLevelFor(pathname)`) plus one single-shot idle callback (§5.3).

### 2.1 Rejected alternatives

| Alternative | Why it was rejected |
|---|---|
| `<picture>`/`<img>` with `media` | `media` can't see `data-theme`. Rendering both themes and hiding one with CSS still downloads both, and a JS swap flashes on toggle. |
| `next/image` | Same theme problem, plus it adds JS and an optimizer round-trip for a purely decorative image. |
| `position: fixed` viewport backdrop | Rejected in Q5, because the art should scroll with the page. A fixed layer also repaints under the translucent top bar on every scroll. |
| Crossfade on theme toggle | Rejected in Q8. The swap is instant. A crossfade means both images in memory plus a transition, for no user value. |
| Inline SVG linework | No paper or mist texture. Eight accurate landmarks would cost tens of KB of path data inside the JS/HTML payload, and the authoring cost is high. |
| Mount in `RootLayout` / `body::before` | It can't follow the sidebar's width (272px desktop, 72px tablet rail). It would show on auth routes, and it still needs the pathname for levels. |
| `z-index:-1` with no `isolate` on the column | Works today only because the body background propagates to the canvas. It breaks as soon as any ancestor gets a background, so it's fragile. |
| A portrait or mobile-specific panorama | Rejected in Q11. Mobile gets a cropped top strip of the desktop composition on Home only. |

## 3. Component contract — `IndianHeritageBackground`

**File:** `src/components/shell/IndianHeritageBackground.tsx` (client component). Styles go in `globals.css` under a `/* TASK-46 heritage */` block, next to the theme tokens.

```tsx
<div
  aria-hidden="true"
  data-heritage
  data-level={level}          // "normal" | "reduced" | "off"
  data-idle={idle ? "" : undefined}
  className="pointer-events-none absolute inset-x-0 top-0 -z-10 select-none"
>
  <span data-heritage-preload />   {/* 1px, opacity 0: other-theme idle preload */}
</div>
```

**Contract:**

1. **Hidden from assistive tech.** It is `aria-hidden="true"`, has no text, no role, no focusable descendants, and no `alt` (it isn't an image element). Axe must report zero new violations.
2. **No interaction.** It has `pointer-events:none` and `user-select:none`. It must never intercept clicks, hover or drag. The e2e check is a click at a point over the art that reaches the element underneath.
3. **Mount point.** It is the **first child** of the content column `<div className="flex min-w-0 flex-col">` in `AppShell.tsx`. That column gets `relative isolate`, and nothing else in `AppShell` changes. This is the only edit to a file shared with TASK-44 and TASK-41: two class tokens and one child element. Whichever branch merges second rebases.
4. **Stacking is safe (verified by reading the code).**
   - TopBar is `sticky z-20 isolate`, and its non-portaled dropdowns (GlobalSearch, NotificationsBell, AccountMenu at `z-30`) live in TopBar's own stacking context.
   - Radix Tooltip and AlertDialog portal to `body`, and native `<dialog>` uses the top layer.
   - BottomTabs (`fixed z-40`) and RailDemoData (`fixed z-30`) are outside the column.
   - The column's `isolate` therefore changes no existing paint order. The art shows blurred through the translucent top bar (`rgb(248 250 248/.88)` + `backdrop-blur-md`). That's intended: one continuous surface.
5. **Height.** The art box height is `clamp(320px, 42vw, 620px)` on desktop and tablet. It only needs to cover the top band (see the §6 composition rule), and it fades to transparent at the bottom using `mask-image: linear-gradient(to bottom, #000 55%, transparent)`, so it never ends in a hard edge.
6. **Level source.** `heritageLevelFor(pathname: string): "normal" | "reduced" | "off"` is a pure function in `src/lib/heritage.ts`. It is unit-tested, and it is the one place that controls the switch-off (§8, SC9).
7. **No coupling.** The component never reads `data-splash` (TASK-45), the onboarding state or any data hook. TASK-45 never reads anything from it.

## 4. Per-route level table (from measured exposure)

Exposure is the share of the viewport where the canvas (and so the art) is visible. It was measured in Stage 1 at desktop 1440×900 and mobile 390×844, and dark matches light.

| Route | Whole | Top 40% | Mobile | **Desktop and tablet level** | **Mobile (<768px) level** | Reason |
|---|---|---|---|---|---|---|
| `/` Home | 0.44 | 0.44 | 0.25 | **normal** | **normal: top strip** | The landing view. Cards cover the lower band. The only mobile placement (Q11). |
| `/queue` | 0.26 | 0.42 | 0.39 | **normal** | off | Art is seen only in the header band, and the KPI strip and table cover the rest. |
| `/disputes` | 0.23 | 0.43 | 0.35 | **normal** | off | Same as Queue. |
| `/invoices` | 0.25 | 0.48 | 0.32 | **normal** | off | Same as Queue. |
| `/payments` | 0.32 | 0.52 | 0.33 | **normal** | off | Same as Queue. Top-band exposure is the highest, so it is checked first in Stage 7. |
| `/emails` | 0.37 | 0.43 | 0.25 | **reduced** | off | A reading surface. The brief asks for quiet here. |
| `/settings` | 0.22 | 0.42 | 0.25 | **reduced** | off | Forms. The brief asks for quiet here. |
| `/drafts` | **0.77** | 0.42 | 0.63 | **reduced** | off | The emptiest view, where the art is seen unobstructed. This is the inverse of the brief. |
| `/audit` | **0.62** | 0.42 | 0.52 | **reduced** | off | Same as Drafts. |
| `/invoices/[id]`, `/disputes/[id]`, `/settings/eval` | not measured | | | **reduced** (default) | off | Measured in the Stage 6 tracer bullet, then confirmed or moved. |
| Any unmapped shell route | | | | **reduced** (default) | off | A safe default. New routes never get `normal` by accident. |
| `/e2e-harness` | | | | **off** | off | Test surface. Keeps the visual baselines stable. |
| `/welcome`, `/sign-in`, `/sign-up`, `/onboarding` | | | | **not mounted** | not mounted | No `AppShell`, because `ShellGate` renders auth routes bare (Q7). |

**Breakpoints.** The project's breakpoints are Tailwind's `md` at 768 and `lg` at 1024.

- **≥1024 (desktop):** the full asset, `background-size: cover` anchored `center top`, behind a 272px sidebar.
- **768–1023 (tablet):** the same desktop asset, **repositioned** with `background-position: 38% top` so the gopuram and Taj stay visible beside the 72px rail. No separate tablet asset exists (Q11).
- **<768 (mobile):** `display:none` unless `data-level="normal"` **and** the route is Home. On Home it loads the **mobile strip** asset, a cropped centre band of the master (§6.4), at a box height of `clamp(160px, 44vw, 240px)`.

## 5. Theme handling

### 5.1 No-flash first paint

```css
[data-heritage]        { background-image: image-set(url(<light.avif>) type("image/avif"), url(<light.webp>) type("image/webp")); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) [data-heritage] { background-image: image-set(<dark…>); }
}
:root[data-theme="dark"] [data-heritage] { background-image: image-set(<dark…>); }
```

- The mobile-strip overrides are nested in `@media (max-width: 767px)` with the same three selectors.
- `THEME_SCRIPT` runs in `<head>` before paint, so the browser fetches only the active theme's asset on a cold load. This is the same mechanism the ThemeToggle icons already use with no flash.
- Before the image decodes, the box is transparent over `var(--canvas)`. Nothing shifts, because the box has a fixed height whether or not the image has loaded.

### 5.2 Instant swap on toggle (Q8)

When the user toggles the theme, ThemeToggle flips `data-theme`, and CSS swaps the background in the same frame, with no transition.

- If the other theme's image is already preloaded (§5.3), the swap is a cached repaint.
- If the user toggles before the idle preload has landed, the art is briefly absent (bare canvas) until the fetch completes. **It never shows the wrong theme's image.** This is acceptable for decoration.

### 5.3 Idle preload of the other theme

- **On mount:** call `requestIdleCallback(cb, { timeout: 4000 })` once, falling back to `setTimeout(cb, 2500)`. The callback sets `data-idle`.
  - It is single-shot. It has no loop and no retry, and the effect cleanup cancels it.
  - It is skipped when `navigator.connection?.saveData` is true.
- **CSS:** `[data-heritage][data-idle] [data-heritage-preload]` is given the **opposite** theme's `background-image`. That element is 1×1px, `opacity:0`, `position:absolute`, so the browser fetches it at idle priority and nothing visible changes.
- The preload is the desktop asset when ≥768px and the strip below that, mirroring the active selector.

### 5.4 Asset URLs and caching

- **Primary option.** Reference the files through relative `url()` in source CSS (`src/assets/heritage/*.avif|webp`), so the bundler emits hashed `/_next/static/media/*` with immutable caching.
  - `public/sw.js` already serves `/_next/static/` cache-first. Its `pruneStatics` regex already keeps `static/media` files that cached CSS references. So the service worker needs **no change**.
  - R1's "not precached" rule still holds: the files are runtime-cached on first fetch, never put in the install precache.
- **Tracer-bullet risk.** The Stage 6 slice-1 must verify that this Next version's CSS pipeline (Turbopack/lightningcss) rewrites `url()` **inside `image-set()`**.
- **Fallback.** If it doesn't, ship `public/heritage/heritage-{light|dark}-{desk|strip}.v1.{avif,webp}` with the version in the filename, plus one `headers()` rule in `next.config.ts` for `/heritage/:path*` (`Cache-Control: public, max-age=31536000, immutable`). Add `/heritage/` to the service worker's cache-first prefixes only if Stage 6 measures a cold-offline gap, since that touches the service worker.

## 6. Asset pipeline

**No generation happens in this stage.** Images are generated in Stage 3 (design exploration) or Stage 6, under the user's eye.

### 6.1 Master spec (both themes)

- **Aspect and size:** 21:9 master at **3360×1440** (2× of 1680 CSS px), PNG, 8-bit sRGB.
- **Style:** fine architectural linework with a soft wash, a paper or mist texture, low saturation and emerald-tinted neutrals. The reference PNG is for **style only**: its line weight and mist (Q1).
- **Landmarks (Q6), left to right, each separated by a mist break, with no shared ground line and no implied adjacency:**
  1. India Gate
  2. Qutub Minar
  3. Taj Mahal (dome plus minarets)
  4. Hawa Mahal facade
  5. an Amber-style hill fort
  6. a real **Meenakshi-style gopuram** (tiered, sculpted, truncated pyramid; *not* a shikhara)
  7. the Hampi stone chariot drawn by **elephants**
  8. Mysore Palace domes

  **No birds, no people, no text, no flags.**
- **Composition rule, tied to measured exposure:**
  - The skyline lives in the **upper band, 15–55% of the image height**, and must avoid the text zone (§6.2).
  - From about 60% height down, the image is empty paper or mist dissolving into the canvas colour. Cards cover that region on every `normal` route anyway.
  - The left and right edges dissolve to the canvas colour across their outer 6% (no cropped monument, unlike the reference). Every edge is also masked with `mask-image` gradients in CSS as a backstop.
- **Background:** the exact canvas hex. Light is **`#f7f9f7`**, not the reference's `#FAF9F7`. Dark is **`#0d1511`**, not `#062F24` (Q2).

### 6.2 Tone limits (measured, load-bearing)

Prominence is P = (L\*canvas − L\*art_peak) / (L\*canvas − L\*text) in CIELAB. `art_peak` is the **2nd-percentile darkest art pixel** (light) or **98th-percentile brightest** (dark) within the exposed canvas, taken from screenshots (Q10).

| | Canvas L\* | Text L\* | Normal band (P 8–15%) | Reduced band (P 4–8%) | **AA ceiling for `--text-muted` (≥4.5:1)** |
|---|---|---|---|---|---|
| Light | 97.7 | 12.5 | art peak L\* ≈ 85–91 | L\* ≈ 91–94 | art L\* **≥ 92.1** (P ≤ 6.6%) |
| Dark | 6.0 | 95.6 | art peak L\* ≈ 13–19.5 (e.g. `#1e3128`, P 14.0%, muted 6.06:1) | L\* ≈ 9.5–13 | art L\* **≤ 27.5** (P ≤ 24%) |

**Finding.** The brief's light tone `#C9D6CC` (P 15.6%) puts `--text-muted #5f6c65` at **3.66:1, which fails AA**. The brief's dark tones `#174C3A`/`#28634C`/`#397A5D` reach P 25–45%, and muted text on `#174C3A` is 4.34:1, which also fails. The page subtitle (muted text) sits on the exposed canvas inside the header band.

**So the rule is: in the text zone, light art stays at L\* ≥ 92.1. The normal band's darker linework (L\* 85–91) is allowed only outside the text zone.** The text zone is the page header region from the left edge of the content column to about 55% of its width, and from the top bar's bottom edge to about 160px below it, plus any canvas-exposed heading. In the composition, this puts the darker strokes of the skyline to the right of, and above or behind, the title and subtitle, and keeps only mist in the text zone.

Dark is not constrained by AA inside the normal band. Its limit is purely aesthetic.

### 6.3 Generation and choosing

- **Three variations per theme**, so six candidates in total, generated with the same seed family. Dark is generated as its own image, not by inverting the light one.
- **Selection rubric**, applied in order. Any failure eliminates the candidate:
  1. **Accuracy.** The user, as cultural reviewer (Q6), signs off that all eight landmarks are correct (gopuram, elephant chariot, Mysore present, no birds).
  2. **Composition.** The skyline is within 15–55% height, the text zone is mist only, there are mist breaks between landmarks, and there is no shared ground line.
  3. **Tone.** Measured P is in the normal band, and text-zone contrast is ≥ 4.5:1 for `--text-muted` (§6.2).
  4. **Bytes.** It meets §7 after encoding.
  5. **Taste.** The user's pick among the survivors. Stage 3 mocks the TASK-45 splash's final frame next to each candidate, so the lighthouse and the monuments don't compete (§10).
- If no candidate survives steps 1–3, regenerate. Up to **three rounds**. After that, escalate to the user (stop rule).

### 6.4 Encoding

The script is `scripts/encode-heritage.ts`, run manually and committed. It uses `sharp` (already a dependency, 0.35.5). `cwebp` is available, but `avifenc` and ImageMagick are not.

| Output | Size | Format | Settings to start from |
|---|---|---|---|
| `heritage-light-desk` / `heritage-dark-desk` | 2400×1029 (21:9) | AVIF and WebP | AVIF q≈45, effort 9, chroma 4:2:0. WebP q≈70, smart subsample. |
| `heritage-light-strip` / `heritage-dark-strip` | 1200×480, cropped from the master's 15–55% band around Taj and gopuram | AVIF and WebP | The same settings. |

- Light texture is low-contrast noise, which compresses well. If it doesn't fit, cut the resolution before the quality: 2000 wide is acceptable, since the art is soft and blurred under the top bar.
- Both themes' sources keep a sRGB ICC profile, and the encoder strips the profile after converting to sRGB.

## 7. Image-size budget

`route-budget` counts **only JS**, so it can't catch image weight. TASK-46 adds a gate.

- **The new script is `scripts/image-budget.ts`.** It fails the run if any `heritage-*-desk.{avif,webp}` is **> 60 KB** or any `heritage-*-strip.*` is **> 25 KB** (Q9). It is wired into `test:all` right after `route-budget`, so it shares the same failure path, exit code and CI step.
- **JS delta.** The target is +≤1.5 KB gzip on shell routes: one small component plus one pure map. `/settings` is the largest route at 291.7 KB of 300 KB, so it has 8.3 KB of headroom. The existing `route-budget` gate enforces this.
- **Network per cold session:** at most one desktop asset (≤ 60 KB), plus one idle preload (≤ 60 KB, skipped on `saveData`). Mobile non-Home routes cost 0 bytes.
- **LCP.** The art is a CSS background, so it is never an LCP candidate. Stage 8 measures Home LCP before and after, and it must not get worse by more than noise (±5%).

## 8. Accessibility, motion and forced colours

- **Reduced motion.** The art has **no motion** in any mode: no parallax, no fade-in, no theme crossfade. The existing global `prefers-reduced-motion` block needs nothing new. There is nothing to reduce.
- **Forced colours (Windows High Contrast).** `@media (forced-colors: active) { [data-heritage] { display:none } }`. The image would be meaningless against system colours and could reduce text contrast. Hiding it also skips the fetch.
- **Contrast.** Every text pixel over the exposed canvas keeps **≥ 4.5:1** (body) and **≥ 3:1** (large text and UI glyphs). This is measured by screenshot sampling, not assumed (SC1).
- **Print.** `@media print { [data-heritage] { display:none } }`.
- **Switch-off (SC9).** Returning `"off"` from `heritageLevelFor` for every route disables the feature everywhere, with no fetch and no DOM effect beyond an inert hidden div. That is **one function, one line**. Deleting the component is a three-line revert in `AppShell`.

## 9. Sign-off checklist (the Stage 2 gate)

Each item has a recommendation. Approve, amend or reject each one.

**Approval record (2026-11-02):** all 14 items approved as recommended (ticked below). For §9.4 the user chose **"Mist behind text"**: only soft mist sits in the page-header text zone (the left ~55% of the content column, from the top bar down ~160px), and all landmark linework goes outside it. Screenshot checks assert every text pixel is ≥ 4.5:1, and the dark art uses the deeper band at L\* 13–19.5 (e.g. `#1e3128`), not the brief's tones. §9.12 text is carried, still unapplied, in the ticket-scoped `docs/Design-TASK-46.md` until the `task/46-heritage-bg` branch exists (§9.13).

| # | Decision | Recommendation |
|---|---|---|
| [x] **9.1** | Rendering approach | CSS `background-image` with `image-set()` AVIF/WebP, chosen by `[data-theme]` selectors that mirror the token block. Reject `<img>`, `next/image` and SVG (§2.1). |
| [x] **9.2** | Mount point and stacking | First child of `AppShell`'s content column. The column gets `relative isolate`, and the art is `absolute top-0 -z-10`. This is a 3-line edit to a shared file, coordinated with TASK-44 and TASK-41 by rebasing whichever merges second. |
| [x] **9.3** | Per-route levels | Adopt the §4 table. **normal:** Home, Queue, Disputes, Invoices, Payments. **reduced:** Emails, Settings, Drafts, Audit, detail routes and any unmapped route. **off:** `/e2e-harness`. Mobile: Home strip only. |
| [x] **9.4** | **Light tone versus muted-text AA** (new, load-bearing) | **The text-zone rule:** light art is L\* ≥ 92.1 inside the header text zone, and the normal band (L\* 85–91) applies only outside it, enforced by composition and verified by measurement. The alternative is capping light art at P ≤ 6.5% everywhere, which is safe but nearly invisible. That alternative is the fallback if the composition can't hold the zone. |
| [x] **9.5** | Dark tone band | Normal art peak at L\* 13–19.5 (e.g. `#1e3128`). This rejects the brief's `#174C3A`/`#28634C`/`#397A5D`, whose P of 25–45% is far stronger than the light theme, and where muted text on `#174C3A` fails AA. |
| [x] **9.6** | Asset spec | 21:9 master at 3360×1440. Eight landmarks with mist breaks, skyline at 15–55% height, exact canvas hex, edges dissolved, no birds. Three variations per theme. The §6.3 rubric with a three-round stop rule. |
| [x] **9.7** | Encoding and limits | `sharp` encodes AVIF and WebP desktop assets at 2400w (≤ 60 KB) and the mobile strip at 1200w (≤ 25 KB), gated by a new `scripts/image-budget.ts` in `test:all`. |
| [x] **9.8** | Asset hosting | Use bundler-hashed `/_next/static/media` through CSS `url()`, which needs no service-worker change. If Stage 6 shows `image-set()` URLs aren't rewritten, fall back to versioned `public/heritage/` plus an immutable `headers()` rule. |
| [x] **9.9** | Theme swap and preload | Instant CSS swap. One single-shot idle preload of the other theme, skipped on `saveData`. A toggle before the preload lands shows bare canvas briefly, never the wrong art. |
| [x] **9.10** | Splash coordination with TASK-45 | No code coupling. The art loads under the ~6s cinematic overlay, so the first revealed frame already has it. On the ~1s reduced-motion path, a late paint is accepted. Stage 3 mocks the splash's last frame next to the panorama. |
| [x] **9.11** | Reduced motion, forced colours, print | No motion at all. Hidden under `forced-colors: active` and in print. |
| [x] **9.12** | Design.md revisions | Apply §11.1 (the missing **R2**, which the TASK-38 owner confirms) and then §11.2 (**R3, the heritage background** with its switch-off rule) on the TASK-46 branch, at the start of Stage 3. |
| [x] **9.13** | Branch and worktree | `task/46-heritage-bg` in its own worktree, cut from a commit on `task/38-emerald-redesign` where `test:all` is green (Q12). Not from `main`, which has no `src/`. |
| [x] **9.14** | Decision IDs | Provisional `S46-a`…`S46-h` (Appendix A). They get real `S#` numbers after TASK-45's S15–S20, at the time they are appended. |

## 10. Coordination with TASK-45 (splash)

- **TASK-45's behaviour, as revised:** a guaranteed ~6s cinematic once per tab session, skippable by any click, tap or key. Reduced-motion users get a ~1s static logo. It is a pre-hydration overlay driven by `html[data-splash=on|exit|done]`, always dark emerald, and its exit fade reveals the active theme.
- **How the first frame is coordinated, with no shared code:**
  1. While the overlay plays, the app tree hydrates under it. Once `DataProvider` resolves, `AppShell` mounts and the art fetches (≤ 60 KB, well inside 6s). When the overlay fades, the revealed frame is the app **with the art already painted**.
  2. Behind `GateSkeleton` and `ShellSkeleton` the art isn't shown, because they don't render `AppShell`. Behind `ShellLoading`, which renders its own `AppShell` around `ContentSkeleton`, the art **is** shown (Q7). The `ShellLoading` to `AppShell` remount repaints from the memory cache, so there is no visible flicker.
  3. The art never delays the splash exit (Q7). TASK-46 holds no promise, no `onload` gate and no `data-splash` read.
  4. On the reduced-motion ~1s path, the art may paint just after the exit. Its box has a fixed height, so there is no layout shift. This is accepted (risk R4).
  5. A same-tab reload has no splash, and the art comes from the HTTP or service-worker cache.
- **Visual handshake (Stage 3):** mock the splash's final frame (the dark emerald lighthouse fading out), then the revealed Home in **both** themes. Check that the lighthouse silhouette and the gopuram or Taj don't occupy the same screen region in the cross-fade. If they do, shift the panorama's `background-position`. Don't touch TASK-45.

## 11. Proposed `Design.md` revision text

**This text is proposed only. It is not applied in this stage.** Append it in this order, after "Revision R1", on the TASK-46 branch at the start of Stage 3, once §9.12 is approved.

### 11.1 Missing entry — Revision R2

> ## Revision R2 — 2026-11-02 (TASK-38, emerald FinTech redesign) — *recorded retroactively by TASK-46; TASK-38 owner to confirm*
>
> Code already cites "Design.md Revision R2 (TASK-38)" (`globals.css`, `layout.tsx`, `NavItems.tsx`, `tokens.test.ts`) but the entry was never written. This records what shipped:
>
> - **Palette:** emerald FinTech tokens in `src/app/globals.css` are authoritative. Light canvas `#f7f9f7`, surface `#ffffff`, text `#17231e`, muted `#5f6c65`, rail `#062f24`/`#083a2b`. Dark canvas `#0d1511`, surface `#141f19`, text `#edf4ef`, muted `#a0b0a5`. `tokens.test.ts` guards them.
> - **Type:** Inter via `next/font` replaces the prior stack.
> - **Navigation order:** as defined in `NavItems.tsx`.
> - **Surfaces:** solid surfaces replace R1's frosted glass (commit `583ebab`).
> - **R1 decorative asset removed:** `public/bg/canvas-blur.webp` and `--canvas-art-opacity` are deleted. The canvas is a flat `var(--canvas)`. R1's shadow, row-card and translucent top-bar items stand where the code still uses them.
> - §1 "visual quietness is the trust signal" stands unchanged.

### 11.2 Revision R3 — heritage background

> ## Revision R3 — <date of approval> (TASK-46, user override with switch-off rule)
>
> **Scoped exception to §1 "no decorative illustration".** One decorative layer is permitted: the Indian heritage panorama (`IndianHeritageBackground`). Nothing else gains illustration through this revision.
>
> - **Where:** only inside the authenticated `AppShell` content column, anchored to the top of the content area, scrolling with the page. Never on auth or onboarding routes, never behind the sidebar, never over surfaces (cards, tables, dialogs and menus stay solid).
> - **What:** a monochrome emerald-neutral linework and mist panorama of eight named Indian landmarks, with mist breaks between them and no shared ground line. Exact canvas background. No birds, people, text or motion. Assets are listed in `src/lib/heritage.ts`, and the user is the cultural reviewer for any replacement.
> - **How strong:** three levels, `normal` / `reduced` / `off`, set per route in `heritageLevelFor()`. Normal is P 8–15% (CIELAB prominence against the canvas, normalised to text). Reduced is P 4–8%. **Every text pixel over the art keeps ≥ 4.5:1** (≥ 3:1 for large text and UI glyphs). In light theme, the art is L\* ≥ 92.1 in the page-header text zone.
> - **Mobile:** Home only, as a top strip. Tablet repositions the desktop asset.
> - **Off by system:** hidden under `forced-colors: active` and in print. No motion exists to reduce.
> - **Weight:** ≤ 60 KB per theme on desktop and ≤ 25 KB on the mobile strip, AVIF with WebP fallback, enforced by `scripts/image-budget.ts`.
> - **Switch-off rule (binding):** if Stage 7 critique or Stage 8 measurement shows the art failing SC1 (contrast) or SC2 (prominence band) on any data-dense route, **or** the user judges it to be noise after one week of use, set `heritageLevelFor()` to return `"off"` for the affected routes, or for all of them. **Do not redesign the art to rescue it.** Switching off is a one-line change and needs no further design review. Deleting the feature reverts this revision.

## 12. Requirements

**Functional**

- F1. The art renders behind every `AppShell` route at the level given in §4, and it never renders on auth routes.
- F2. The correct theme's asset is the first one fetched on a cold load, in light, dark and system modes.
- F3. A theme toggle swaps the art in the same frame as the tokens, with no transition.
- F4. The other theme's asset is preloaded once at idle, and skipped on `saveData`.
- F5. Mobile (<768) shows the strip on Home only and fetches nothing on other routes.
- F6. `forced-colors: active` and print hide the art and fetch nothing.
- F7. `heritageLevelFor()` is the single control, and unmapped routes default to `reduced`.

**Non-functional**

- N1. Image budget: ≤ 60 KB desktop and ≤ 25 KB strip per theme (gate: `image-budget`).
- N2. JS: ≤ +1.5 KB gzip on shell routes, and all 18 routes stay ≤ 300 KB (gate: `route-budget`).
- N3. CLS: 0 contribution (fixed-height box).
- N4. Home LCP no worse than the baseline ±5%.
- N5. Zero new axe violations.
- N6. `test:all` is green.

## 13. Success criteria (measurable; these refine the Stage 1 SC1–SC9)

| ID | Criterion | How it's measured |
|---|---|---|
| SC1 | Every text pixel over exposed art ≥ 4.5:1 (≥ 3:1 for large text and UI) | Screenshot sampling script on every route, in both themes, at all three widths. |
| SC2 | Prominence in the band: normal P 8–15% and reduced P 4–8% outside the text zone; light text zone L\* ≥ 92.1 | Same script, using the percentile peak in §6.2. |
| SC3 | No interaction interference | e2e: a click over the art reaches the target. Pointer-events assertion. |
| SC4 | No-flash theme | e2e: on a cold load in each mode, the first heritage request's URL matches the theme. A toggle swaps it within one frame. |
| SC5 | Byte budget | `image-budget` gate in `test:all`. |
| SC6 | JS budget | `route-budget` gate. |
| SC7 | Splash first frame | Stage 3 mock approved. In Stage 8, with the cinematic path on a cold load, the art is painted at the moment `data-splash=done`. |
| SC8 | Cultural accuracy | User sign-off on the chosen asset (§6.3 step 1). |
| SC9 | Reversible in one place | Unit test: setting all routes to `off` means no `background-image` request in e2e. |

**Acceptance:** SC1–SC9 pass, plus the expanded QA screenshot set (Q13), in both themes:

- desktop: every route;
- tablet: Home;
- mobile: Home, plus one non-Home route to show it is absent;
- Drafts' empty state;
- a menu (AccountMenu) and a dialog (AlertDialog) open over the art;
- `prefers-reduced-motion` and `forced-colors` runs.

## 14. Out of scope

- Animation or parallax of any kind, and any crossfade.
- Per-tenant or user-chosen backgrounds, or a settings toggle. Switch-off is a code change by design.
- Art on auth, onboarding, the splash (TASK-45 owns that), or the sidebar.
- A portrait or mobile-specific composition, or art on mobile non-Home routes.
- Service-worker changes, unless the §5.4 fallback measures a need.
- Any change to the TASK-45 code, or to `GateSkeleton`/`ShellSkeleton`.

## 15. Risks

| # | Risk | Likelihood and impact | Mitigation |
|---|---|---|---|
| R1 | **Light normal band conflicts with muted-text AA** (§6.2) | High / High | The text-zone composition rule (§9.4), measured by SC1. Fall back to a global P ≤ 6.5%. |
| R2 | The generator can't produce accurate landmarks: gopuram as shikhara, chariot with a lion (as in the reference) | High / Medium | Three variations, the user as reviewer, a three-round stop rule. Allow per-landmark inpainting before regenerating everything. |
| R3 | Light paper texture won't fit 60 KB | Medium / Low | Cut resolution first (2400 to 2000), then quality. AVIF on light gradients is usually 30–50 KB. |
| R4 | On the reduced-motion ~1s splash, the art paints just after the overlay exits | Medium / Low | Fixed-height box so CLS is 0. Accepted for decoration. |
| R5 | This Next/Turbopack version doesn't rewrite `url()` inside `image-set()` | Medium / Low | Stage 6 tracer bullet first. Fallback to versioned `public/heritage/` plus `headers()`. |
| R6 | Merge conflict in `AppShell.tsx` with TASK-44 and TASK-41 | Medium / Low | A 3-line, additive edit. Whoever merges second rebases. Called out in the PR. |
| R7 | `isolate` on the content column changes a stacking order I didn't find | Low / Medium | The e2e and screenshot set includes an open menu and dialog. The fallback is `z-index:-1` without `isolate`. |
| R8 | Design drift: the art turns out to be noise, eroding §1 "quietness is trust" | Medium / Medium | The binding switch-off rule in R3 (§11.2). Stage 7 critique judges it against `Design.md`. |
| R9 | The R2 text I wrote retroactively misstates what TASK-38 intended | Low / Low | It's flagged for the TASK-38 owner to confirm before it's appended. |
| R10 | The dark asset looks heavier than the light one at the same P (perceived halation on a dark canvas) | Medium / Low | Judge both themes side by side in Stage 3, and allow dark P at the low end of the band. |

## 16. Build order hint (for Stage 4/5; not binding)

1. **Tracer bullet (the riskiest slice):** a placeholder gradient image through `image-set()` in CSS from `src/assets`. Check that the hashed URL is rewritten, the theme selector picks it with no flash, it mounts in `AppShell`, and stacking under an open menu and dialog is correct. This proves R5 and R7 before any art exists.
2. `heritageLevelFor()`, its unit tests, and the mobile/forced-colours/print rules.
3. The idle preload.
4. Asset generation, selection, encoding, and the `image-budget` gate.
5. The measurement script (SC1/SC2) and the QA screenshot set.

---

## Appendix A — Proposed decision entries (not appended to `decisions.md`)

These get real `S#` numbers when they are appended, after TASK-45's S15–S20.

- **S46-a · CSS background via `image-set()`, theme by `[data-theme]` selectors — proposed.** Rejected options: `<img>`/`<picture>`, `next/image`, SVG, a fixed backdrop.
- **S46-b · Mount in the `AppShell` content column (`relative isolate`, art at `-z-10`), scrolling with the page — proposed.**
- **S46-c · Three levels from the measured-exposure table; `heritageLevelFor()` is the only control; unmapped routes default to `reduced` — proposed.**
- **S46-d · Light text zone L\* ≥ 92.1, so every text pixel keeps ≥ 4.5:1; dark normal peak L\* 13–19.5 — proposed.**
- **S46-e · 21:9 master; eight landmarks with mist breaks; three variations per theme; the user is cultural reviewer; three-round stop rule — proposed.**
- **S46-f · ≤ 60 KB desktop and ≤ 25 KB strip, AVIF/WebP, enforced by `scripts/image-budget.ts` in `test:all` — proposed.**
- **S46-g · Instant swap plus a single-shot idle preload of the other theme; no coupling to TASK-45 — proposed.**
- **S46-h · `Design.md` gets R2 (retroactive) and then R3 (heritage, with binding switch-off) — proposed.**
