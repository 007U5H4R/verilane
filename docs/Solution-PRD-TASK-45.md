# TASK-45 — Cinematic Lighthouse Splash Screen — Solution PRD

> **Stage:** 2 · Solution Design (Full tier) · **Ticket:** TASK-45 · **Date:** 2026-11-02
> **Status:** **APPROVED (2026-11-02).** The user signed off §9 on 2026-11-02 with three reversals of earlier decisions:
> - a guaranteed full cinematic (S21);
> - skip on any input (S22);
> - a real-progress loading bar that replaces the draft's "no percentage" rule (S23).
>
> The user also corrected the storyboard's cloud parallax (S24). The storyboard is transcribed in `docs/TASK-45-storyboard.md`. Its remaining internal inconsistencies are open items for Stage 3 (§9 item 7). Stage 3 (UI/UX Design) may start in a fresh session.
> **Input:** `docs/Discovery-PRD-TASK-45.md`, with all nine §6 recommendations approved verbatim at Stage 1: once per tab session · first-time/demo audience · gated-app entry only, never `/welcome` · ≤15 KB gzip · ~400 ms floor · artwork generated in a later stage · no auth/guest split · the 5 DoD categories are complete · an independent chain. **Superseded at Stage 2 sign-off:** the ~400 ms floor (Q5) and DoD #1's "no added perceived latency" (Q8) are replaced by the guaranteed cinematic (S21); DoD #5's LCP wording is restated (§5.5); Q9's wording is replaced by the branch rule (S20).
> **Location:** this file is ticket-scoped, like Stage 1's. The root `Solution-PRD.md` is the whole-product TASK-1 artifact and is not touched.
> **This file covers:** the *how* at the architecture and requirements level. It does not cover visual composition, exact easing curves, frame-by-frame choreography, the skip hint's final copy or image prompts. Those belong to Stage 3 (`Design.md`, via `t-design`).

---

## 0. Three findings that shaped the brief and the locked decisions (read first)

1. **Timing: the honest-timing model would have hidden the storyboard, so the user chose a guaranteed cinematic (resolved, S21).** The Discovery rules were "never fake progress", "never delay entry beyond real readiness plus a ~400 ms floor" and DoD #1. Under those rules the splash would last exactly as long as the real load. The seed is 32 KB of CSV/JSON (`public/seed/`), and a returning tab only checks the seed version (`seedStatus`), so a warm load is probably well under 1 s. Most visitors would have seen about 0.4 s of a ~6 s storyboard. **The user's decision (2026-11-02):** the full ~6 s storyboard plays **once per tab session, even when the app is already ready**, and any click, tap or key ends it immediately (S22). This deliberately reverses Discovery Q5 / DoD #1 and the brief's own line "must not artificially delay entry to complete the animation". The reversal is bounded three ways: once per tab, skippable at any instant from the first frame, and never misreporting progress (once the app is ready the splash says so, §2.4). Real readiness is still measured and must not get slower (§5.1).
2. **First-time visitors enter the app by client-side navigation, not a page load.** On a fresh tab, `/` has no session and redirects to `/welcome`. From there, "Continue as guest" runs `startGuestSession()` and then `router.push("/")` (`src/components/onboarding/primitives.tsx:42-43`). If the splash only triggered on a hard page load, **the primary audience (Q2) would never see it on their first visit**. They would only see it when they later opened a new tab. The trigger is therefore *the first gated-app entry in this tab, whether by hard load or by client navigation out of onboarding*. This still honors Q3 (the splash never shows *on* `/welcome`/onboarding routes). (Approved, §9 item 2.)
3. **Q9 ("stays on `main`, never touches `task/38-emerald-redesign`") cannot be implemented as worded.** `main` holds only the Stage 1–5 planning-docs commit (`6e53103`) and no application code. The render tree this feature composes with (`ShellGate`, `ShellSkeleton`, `src/lib/session.ts`, `/brand/verilane-logo-light.png`) exists **only on `task/38-emerald-redesign`**. It is not on `main`, and not even on `build/verilane-v1`. **Approved:** keep Q9's intent (an independent artifact chain, no commits to `task/38`, no disruption to in-flight agents) and drop its literal wording. TASK-45 code goes on a new branch `task/45-splash`, in its own worktree, cut from a commit on `task/38-emerald-redesign` where all checks pass. It is merged back through the lead's normal `--no-ff` merge process, *after* TASK-38/39 settle. The TASK-45 docs are committed on that branch, never on `task/38` (§9 item 3, S20). **Open risk:** the last recorded gate run on `task/38` had `route-budget` failing on six routes (`HANDOFF.md`). If no commit passes *all* checks, Stage 6 must ask the user whether "all checks pass" may exclude that pre-existing overage (§8).

---

## 1. Chosen approach (one paragraph)

The splash is a **pre-hydration, server-rendered static overlay** in `RootLayout`. It is shown or hidden purely by CSS through a `data-splash` attribute on `<html>`. A tiny **inline runtime** in `<head>` sets that attribute before first paint, following the exact pattern of the existing `THEME_SCRIPT`. That makes the splash the very first frame on a cold load. All motion is **CSS keyframes on `transform`/`opacity` only**, with no animation library. React does not render or own the splash. The existing loading chain stays exactly as it is underneath, and React only **emits readiness events** into the runtime: session resolved → `DataProvider` mounted → seeding started (only if it really happens) → ready or error committed. The runtime plays the **full cinematic of fixed length *D* (~6 s)** once per tab and exits at `max(painted + D, ready)`, holding on a calm loop if the real load outlasts the cinematic, with a hard ceiling as the failsafe. **Any click, tap or key ends it at once**, handled by the inline runtime so it works before hydration. The skeleton chain (`GateSkeleton` → `ShellSkeleton` → `ShellLoading`) is unchanged and remains the experience whenever the splash is not shown, or has been skipped before the app is ready. The splash adds an overlay; it does not replace anything.

## 2. Key design decisions (options weighed, one recommended each)

### 2.1 Animation technology → CSS-only (no library)
| Option | Cost | Verdict |
|---|---|---|
| **CSS keyframes, transform/opacity, static clip-paths** | about 0 JS, runs on the compositor, paints before JS | **Chosen** |
| Web Animations API | small JS, but needs JS *before* the first frame | Not needed: the timeline is declarative. Exit-from-anywhere is a container-level CSS fade (§2.5). |
| framer-motion / gsap | roughly 25–35 KB+ gzip each, and they need hydration before anything moves | Rejected: blows the 15 KB budget alone and cannot animate the pre-hydration frame |
| Lottie | about 60 KB player plus JSON | Rejected: same reasons |
| Video (webm/mp4) | heavy bytes, autoplay policies, LCP risk, can't track real readiness | Rejected |
| Canvas/WebGL | JS-heavy, no pre-hydration paint | Rejected |

Motion rules (these are requirements, not suggestions):
- Only `transform` and `opacity` are animated.
- Clip-paths and masks are **static**. The two-stage logo reveal uses two layers of the same artwork. Layer A is statically clipped to the V, the way `LogoCard`'s `mark` variant clips it. Layer B is statically clipped to the wordmark. Only their opacity and transform animate.
- No animated `filter`, `blur`, `backdrop-filter`, `box-shadow`, `mix-blend-mode`, or layout-affecting property.
- The cinematic's length *D* is a single source of truth: one CSS custom property (`--splash-d`) that the keyframe durations and delays derive from, and that the runtime reads, so CSS and the exit timer cannot drift apart.

### 2.2 Where it mounts → a sibling of `<Suspense><ShellGate/>` in `RootLayout`, outside the fallback chain
- **Rejected: putting the splash inside the loading fallbacks** (`GateSkeleton` / `ShellLoading`). A guest load swaps fallbacks three times: `GateSkeleton` → `DataProviderLoader`'s `loading` → `DataProvider`'s own `loading`. Each swap remounts the fallback, so the animation would **restart** (a brief "never" item). The splash would also only paint after hydration, and it would couple brand art to skeletons that must stay as they are for non-splash loads.
- **Rejected: a React client overlay in `GatedApp`.** It cannot paint before hydration without a flag script anyway. It adds shared JS, and it invites a hydration mismatch.
- **Chosen:** static overlay markup rendered by a server component in `RootLayout`, placed *before* the `Suspense`. It is present in every route's HTML and hidden unless `html[data-splash]` is set. It persists across every fallback swap and client navigation, because the layout never remounts. The app subtree goes in a `display:contents` wrapper so the runtime can set `inert` on it while the splash covers it, and no layout box changes.

### 2.3 Trigger rule → first gated-app entry per tab
The splash shows only when **all** of these hold:
- the route is not an auth route, using `AUTH_ROUTES` from `src/lib/session.ts` (one list, reused, not copied);
- stored `verilane-session === "guest"`;
- `sessionStorage['verilane-splash-seen']` is unset;
- storage is readable;
- this is not an e2e build, unless the URL has the opt-in `?__splash=1`.

Two entry paths:
- **Hard load:** the inline runtime decides before first paint.
- **Client entry from onboarding:** `GatedApp`'s first mount in the tab calls `window.__verilaneSplash.show()` in a layout effect, before paint, so the skeleton never flashes first.

Behaviour:
- **Refresh in the same tab does not replay.** `sessionStorage` survives reload. This matches Discovery Q1's rationale ("a refresh mid-session does not re-earn it") and the Q7 matrix row. Q1's option-(b) text said "shown again after a hard refresh"; the user confirmed the no-replay reading (§9 item 4).
- A new tab replays the splash.
- In-app navigation never replays it, because the layout persists.
- The flag is set when the splash *shows*, so a refresh mid-splash, or a skip, also does not replay.
- No session means no splash. The visitor is redirected to `/welcome` exactly as today.
- No JS (`noscript`) or blocked storage means no splash, so the default is off.

### 2.4 Reading real loading state → React emits events; the runtime never invents progress
| Phase event | Emitted by | Meaning |
|---|---|---|
| `painted` | inline runtime (or `show()` on client entry) | the splash is on screen; the cinematic clock starts (`performance.now()`) |
| `session` | `GatedApp` (guest resolved) | hydration happened |
| `provider` | `DataProvider` mount | the DataProvider chunk loaded; the db is opening |
| `seeding` | `DataProvider`, **only** when `seedStatus` returns null and `ensureSeeded` actually runs | first-visit seeding is really happening |
| `ready` | `DataProvider` ready branch, in an effect *after commit* (the route's children are mounted underneath) | the app is painted and usable |
| `error` | `DataProvider` error branch (it renders children anyway) | treated like `ready` for exit purposes; the user is never trapped |

- Each event is one `window.dispatchEvent(new CustomEvent("verilane:splash", { detail }))` call, or a direct call into `window.__verilaneSplash`. Either way it is a few bytes in already-shipped components. These are **observe-only** hooks with zero behaviour change to the session, Dexie or seed pipeline, which Discovery §4 keeps out of scope. Tests pin that.
- **The splash never says "loading" when the app is ready.** This is how "never fake progress" survives the guaranteed cinematic. The status line reflects the real phase: "Opening workspace…" by default, "Preparing demo data…" only after a real `seeding` event, and a ready state ("Workspace ready", final copy in Stage 3) as soon as `ready` arrives, even if the cinematic still has seconds to run. The skip hint then reads as "continue" rather than "skip" (§2.6).

### 2.4a Loading bar → real-progress pill, driven only by the phase events (S23)
**What it is:** the storyboard's rounded pill near the bottom centre, a bright emerald fill on a dark track. The draft's indeterminate indicator is replaced. The user chose to keep the bar on the condition that it is tied to real loading.

**What drives it.** The bar is driven only by the phase events above, never by a timer. Its fill is a monotonic function of the *latest real phase reached*:

| Phase reached | Fill target | Notes |
|---|---|---|
| `painted` | 10 % | the HTML and the inline runtime are on screen |
| `session` | 35 % | hydrated; guest session resolved |
| `provider` | 65 % | DataProvider chunk loaded; db opening |
| `seeding` | 80 % | only when seeding really runs (first visit); otherwise the bar stays at 65 % until `ready` |
| `ready` / `error` | 100 % | the only way to reach 100 % |

- **The bar never exceeds 90 % before `ready`.** If Stage 3 retunes the values, that cap still holds, along with these rules:
  - the values only increase, and they stay in the same order;
  - nothing creeps or interpolates between events.

  So the bar **will jump** (for example, 10 → 65 % within one frame on a warm load) and **will stall** (for example, at 80 % for the length of a cold seed). That is the honest behaviour the user asked for.
- **Movement between targets:** a short ease-out CSS transition on `transform: scaleX()` (about 300–400 ms; the exact value is set in Stage 3). It runs on the compositor and causes no layout. Under reduced motion, steps are instant.
- **When it appears:** at ***t₀* + 4.0 s**, which is storyboard frame 07. Phase events before then are recorded but not shown. When the bar is revealed, it animates from 0 to the *current* real target. It does not replay the steps it missed.
  - **App ready before 4.0 s** (the common warm case): at reveal, the bar fills to 100 % quickly, in one ease-out of ≤ 600 ms. It then holds full, with the ready status, until *t₀* + *D*. This is the storyboard's "progress completes and holds briefly", but driven by a fact rather than a timeline.
  - **App ready between 4.0 s and *D*:** the bar shows the real target, then goes to 100 % when `ready` arrives. The exit still waits for *t₀* + *D*.
  - **App ready after *D*:** this is the hold (§2.5). The bar stays at its last real value, then goes to 100 % at `ready`. The exit starts as soon as the fill transition completes, ≤ 250 ms after `ready`. That short "complete" beat is the only time the splash adds latency after the app is ready. It is bounded and shown truthfully.
- **Ceiling:** the ceiling still applies, at *t₀* + *D* + 4 s (≈ 10 s; this replaces the old 8 s). If it fires, the splash exits **with the bar still incomplete** and hands over to the skeleton, which is still an honest loading state. The bar is never driven to 100 % to "finish nicely".
- **Skip:** a skip exits immediately (§2.6), whatever the bar shows. The bar is **not** jumped to 100 %. If the app is not ready yet, the existing skeleton chain takes over and the app arrives at its real `T_ready`.
- **Reduced motion:** the bar is part of the static frame from *t₀*, because there is no 4.0 s choreography when the scene doesn't move. It shows the real value and steps instantly, and there is no fill animation.
- **Accessibility:** the bar is a real `role="progressbar"`, not `aria-hidden` (§2.8). The reasons:
  - it now carries real, meaningful information, so hiding it from assistive technology would break WCAG 1.3.1;
  - its values are coarse and truthful, so exposing them misleads no one;
  - it mirrors what a sighted user sees.

  It is **not** a live region, and the overlay's `role="status"` remains the single announcer. Screen readers announce progressbar value changes inconsistently, and some announce every change, so two announcers would double up.

### 2.4b Readiness signal ownership
The runtime holds the latest phase, the bar target, the status text and `data-splash`. React only emits events (§2.4). The bar, the status line and the exit timing all read that one value, so they can never disagree. This is one fact in one place.

### 2.5 Timing: cinematic length, hold, ceiling and exit
Let *t₀* = `painted`, *D* = the cinematic length (~6.0 s nominal; Stage 3 fixes the exact value from the storyboard), and *D_rm* = 1.0 s (the reduced-motion length, §2.7).
- **Cinematic:** frames 1–7 of the storyboard play once, in full, from *t₀* to *t₀ + D*, **whether or not the app is already ready**. This is a user-approved deliberate delay (S21), not a loading state, and the status line says so honestly (§2.4).
- **Exit starts** at `max(t₀ + D, t_ready + fill)`, within 50 ms of that moment. Here *fill* is the ≤ 250 ms bar-completion beat (§2.4a). It is zero when `ready` arrived earlier than *D* − 250 ms, because the bar has already completed. If the user skips first, the exit starts within 50 ms of the skip input (§2.6).
- **Hold (only when the real load outlasts the cinematic):** if `ready`/`error` has not arrived by *t₀ + D*, frame 07 continues as a calm loop:
  - the cloud drift continues;
  - the beam keeps whatever ambient motion Stage 3 chooses (storyboard inconsistency 5);
  - the status text stays truthful;
  - the bar **stalls honestly** at its last real value.

  The loop can be cut at any instant without looking broken. The hold ends at `ready`, at a skip, or at the ceiling.
- **Ceiling: *t₀* + *D* + 4 s (≈ 10 s; ≈ 5 s under reduced motion).** The old 8 s ceiling was "storyboard plus margin" under honest timing, where the splash only ever covered loading. With a fixed 6 s cinematic it would leave just 2 s for a slow load, so it now means "how long we hold the finished brand frame and a stalled bar before handing over to the more informative skeleton". If `ready`/`error` has not arrived by then, the splash exits **with the bar still incomplete** to the existing skeleton chain underneath, which is still an honest loading state. The runtime records `performance.mark("splash:ceiling")` and calls `console.warn`. *This is the stop rule. It fires on a genuinely slow first-visit seed or an upstream failure, and it is observable.* Stage 5 baselines first-visit seed time. If its p95 on the throttled profile is near *D* + 4 s, revisit the number with data instead of guessing.
- **Exit:** a single container fade of **≤ 300 ms** (the brief's 200–300 ms fade, no zoom). When it starts, the overlay gets `pointer-events: none` and the app subtree loses `inert`. If the app is ready, it is already mounted and interactive underneath, so the exit adds no latency beyond itself. If the exit was caused by a skip or the ceiling before `ready`, the exit reveals the existing skeleton chain, and the app arrives exactly when it would have without the splash.
- When the exit ends, the overlay goes to `display: none` and `data-splash="done"`. A timeout fallback covers `animationend` never firing.
- **Loads without the splash** (refresh, in-app navigation, no session, e2e default) have no cinematic, no floor and no delay. They are exactly today's behaviour.

### 2.6 Skip → any click, tap or key ends the splash immediately
- **Inputs:** `pointerdown` (mouse, pen and touch) anywhere on the overlay, and `keydown` of **any key, including Esc**, on `window`. The listeners live **in the inline runtime**, so skip works from the first frame, before any JS bundle has downloaded or React has hydrated. They are removed at exit.
- **Effect:** exit starts within 50 ms of the input, using the normal ≤ 300 ms exit (§2.5). Under reduced motion it is an instant cut.
- **The skipping input is consumed, never forwarded:**
  - The `pointerdown` lands on the overlay, because it still has pointer events at that instant. The runtime then swallows the **one** `click` that the same gesture produces (a capture-phase listener with `preventDefault` + `stopPropagation`, cleared at the next `pointerup` + 1 frame or after 500 ms), so a tap never activates an app control that the exit has uncovered under the finger.
  - The skipping `keydown` is not re-dispatched, so Enter or Space can't activate whatever is underneath. The app is `inert` at that instant anyway.
  - The runtime does **not** call `preventDefault` on keys, so browser shortcuts (Cmd/Ctrl+R, Cmd+L, Cmd+Tab, Cmd+W) keep working. Pressing them also skips, which is harmless.
- **Accidental-skip guards:**
  - Inputs in the first **250 ms** after *t₀* are ignored. This covers a double-click or a held Enter carried over from "Continue as guest" on the client-entry path.
  - Auto-repeat keydowns (`event.repeat`) are ignored.
- **Affordance → one small, unobtrusive real button plus a hint (chosen over "no affordance").**
  - A low-emphasis `<button type="button">` reads "Skip intro" while loading, and "Continue" after `ready`. It sits with a visible key hint, for example "or press any key", or "Tap to skip" on `(hover: none)`. Stage 3 sets the final copy and placement.
  - It is visible and in the accessibility tree **from the first frame**. It is not auto-focused, so a hard load gets no focus ring and no surprise focus move.
  - It must have a ≥ 24×24 px target (WCAG 2.5.8) and ≥ 4.5:1 text contrast.
  - **Why a real button and not just a hint:** in a screen reader's browse or virtual mode, the screen reader consumes most keys, so "press any key" may never reach the page. A real button is the one thing a screen-reader user can find and activate. It is also the discoverable, documented mechanism that WCAG 2.2.2 (Pause, Stop, Hide) asks for: the moving cinematic auto-starts and lasts more than 5 s, and the button plus any-key hide it. A hint alone would be thinner evidence. A big, primary-looking skip button would compete with the logo, which the brief forbids.
- **After a skip:** focus is not moved programmatically. On a hard load it is already on `body`. On client entry the "Continue as guest" button has unmounted, so it falls to `body`. If the skip button itself had focus, focus is returned to `body` before the overlay goes to `display:none`, so focus is never lost on a hidden element. The next Tab press enters the app (or the skeleton) in normal order.

### 2.7 `prefers-reduced-motion` → a static logo frame for ~1 s, then an instant cut
- The global `globals.css:278` rule already kills every animation and transition with `!important` under `reduce`. So the splash's **base CSS is the final, composed static frame**: full logo lockup, descriptor, a static beam, clouds at rest, the status text, the real-value loading bar (stepping instantly, §2.4a) and the skip button.
- All motion is added only inside `@media (prefers-reduced-motion: no-preference)`.
- Under `reduce` the runtime uses ***D_rm* = 1.0 s** instead of *D*, so exit is at `max(t₀ + 1 s, t_ready)` with the ceiling at *t₀* + 5 s. The exit is an instant cut, because the global rule removes the transition. Skip works the same way. The status text carries the "loading" or "ready" meaning that the motion would otherwise carry.
- The runtime decides with `matchMedia("(prefers-reduced-motion: reduce)")` at `painted`. The CSS and the runtime use the same media query, so they cannot disagree.
- Note that the brief says "fade-in logo only" under reduced motion. The user chose a static logo, and the global rule removes the fade anyway. Stage 3 should not add one back.

### 2.8 Accessibility semantics → the splash is a visible, skippable, announced state
The Stage 2 draft made the whole overlay `aria-hidden`. That is wrong once the splash is skippable, and once it can outlast the load by seconds. Elements under `inert` are also removed from the accessibility tree, so the `ShellSkeleton` status would *not* be announced while the splash covers it, and a screen-reader user would hear nothing for about 6 s.
- **The overlay root is *not* `aria-hidden`.** It is a plain `<div>` landmark-free container with `data-splash-overlay`. It is not `role="dialog"`: there is no focus trap and nothing to dismiss in a modal sense, and the brief says "no focus trap".
- **Decorative layers are `aria-hidden="true"`:** the sky, clouds, SVG lighthouse, beam, glow, and the two logo layers. The logo carries an accessible name through the status text instead.
- **One `role="status"` (`aria-live="polite"`) inside the overlay** holds the truthful phase text, prefixed with the product name ("Verilane. Opening workspace…" → "Verilane. Workspace ready"). While the splash is visible, it is the **single** accessible loading announcement, because the `ShellSkeleton` status is inert and hidden from the accessibility tree until the exit. One fact, one place at any moment: the splash's status while it covers the app, then the skeleton's own `role="status" aria-busy` after the exit if loading continues.
- **The loading bar is `role="progressbar"`** with:
  - `aria-label="Loading workspace"`;
  - `aria-valuemin="0"` and `aria-valuemax="100"`;
  - `aria-valuenow`, set to the real fill target;
  - `aria-valuetext`, set to the same phase text as the status, for example "Opening workspace" or "Workspace ready".

  It is exposed to assistive technology only while it is visible (from *t₀* + 4.0 s; from *t₀* under reduced motion), so what the accessibility tree reports matches the screen. It is not live; the `role="status"` announces (§2.4a).
- **The skip `<button>`** is the overlay's only focusable element (§2.6).
- **The app subtree stays `inert`** until exit starts, so no keyboard focus lands on obscured shell links (WCAG 2.4.11). `inert` is removed at exit start, at the same moment the overlay gets `pointer-events: none`.
- **Pointer events:** the overlay has `pointer-events: auto` while `data-splash="on"`, which is what makes click/tap-to-skip possible. It gets `pointer-events: none` at exit start and `display: none` at exit end.

### 2.9 Theme → the splash scene is always dark emerald
- The scene uses the brief's existing tokens (`--rail-deep` through `--rail-soft-mint`) regardless of the app theme, per Q7.
- The exit fade reveals whichever theme is active. In light theme that is one dark-to-light crossfade: a single transition, not a flash.

### 2.10 Image-asset plan → generated atmosphere only; everything brand-critical or anchored is code
The brief's rule (never bake the logo, text or beam into a generated image) is extended with one more principle: **anything the beam must align to is code, not raster.**

| Layer | Built as | Why |
|---|---|---|
| Base sky/sea gradient | CSS gradients (tokens) | It paints in frame 1 with zero bytes, and the scene is complete even before any raster loads |
| **G1 — Atmospheric plate** (dusk/night sea and sky, emerald-toned, no lighthouse, no text, no beam, no logo) | **Generated** (kie.ai/Higgsfield, in a later stage) | The premium texture is where generation earns its place |
| **G2 — Cloud layers**: two, a background cloud and a foreground cloud, each with alpha | **Generated**, with the background removed (e.g. Higgsfield `remove_background`) | A rightward parallax drift, with the **foreground cloud moving faster than the background one** (S24 swaps the storyboard's speeds to restore normal depth cues). The drift is **one-way** over the splash's longest life (the ≈ 10 s ceiling), so the art does **not** need to tile seamlessly, but it must be wide enough for 10 s of drift. Stage 3 sets the absolute distances (storyboard inconsistency 3) |
| Lighthouse silhouette | **Inline SVG** (about 1 KB) | It shares one coordinate container with the beam, so the lantern and beam origin cannot misalign at any aspect ratio. A raster inside a `cover`-fit plate drifts with viewport shape. It is crisp at any DPR, and minimal fits "premium, minimal" |
| Lantern glow, beam, vignette | CSS gradients, with the beam as a gradient wedge that expands leftward (storyboard: about 35–45° spread). Stage 3 decides whether it then holds still or sweeps slowly (storyboard inconsistency 5) | It is the brief's rule, and animated on transform/opacity only |
| Logo, V then wordmark | The **official** `verilane-logo-light.png` artwork. It may get a resized/re-encoded derivative (WebP) for weight, but is never regenerated or altered | Two statically clipped layers (§2.1) |
| Descriptor "AR Collections Copilot", status text, skip button | Live text (Inter, already loaded) | Never baked into an image |
| Loading bar (pill) | CSS (`scaleX` on the fill) plus ARIA attributes set by the runtime | Real-progress fill driven by phase events (§2.4a) |

- **Tradeoff named:** a generated lighthouse layer could look more painterly than an SVG silhouette. It costs fragile beam alignment, more bytes and a background-removal step. The user approved the SVG. Stage 3 may propose a generated lighthouse only if its mockups show the SVG clashing with the plate, and it must keep the beam anchor in code.
- **Delivery:** rasters are **CSS `background-image`s scoped under `html[data-splash]`**. Browsers only fetch background images for elements that are actually rendered, so a load without the splash downloads **0 splash bytes**. AVIF with a WebP fallback goes through `image-set()`. Mobile and desktop encodes are chosen by media query. Rasters fade in when loaded, and their absence never blocks or delays anything. With a 6 s cinematic, a plate that arrives late is now *visible* arriving, so Stage 3 should make the gradient-only frame look intentional on its own.

## 3. Scope (smallest useful increment)
**In:**
- the static overlay markup (scene, SVG lighthouse, two-layer logo, descriptor, status, real-progress loading bar, skip button);
- the inline runtime (trigger decision, cinematic length *D*/*D_rm*, phase → bar mapping, hold, ceiling, exit, skip listeners and guards, click swallowing, `inert`, seen-flag, performance marks);
- the splash CSS (base static frame, motion under `no-preference`, `--splash-d`);
- observe-only readiness events in `GatedApp` and `DataProvider`;
- the client-entry `show()` call;
- the e2e opt-in hook `?__splash=1`;
- G1/G2 asset generation (in Stage 3, per Q6);
- a splash budget check;
- tests across the matrix in §6.

**Out (explicit):**
- sound;
- a once-per-day / cross-tab limit (Q2 floated it; Q1 locked once-per-tab, so it is not built; see the new-tab risk in §8);
- a "don't show again" preference;
- any progress that is not driven by a real phase event: no timer-driven fill, no creep between events, no numeric percentage text;
- any animation library, video, Lottie or canvas;
- changing `ShellSkeleton` / `ShellLoading` / `GateSkeleton`;
- changing session, Dexie or seed behaviour;
- `/welcome` and onboarding (TASK-39 territory);
- the PWA manifest's OS-level splash (`src/app/manifest.ts`), which is a **different, static, OS-controlled screen** and stays untouched;
- fixing the pre-existing route-budget overage.

## 4. Requirements added by the solution
- **R1:** the splash paints in the first frame of a qualifying hard load, before any JS bundle executes.
- **R2:** the overlay is one DOM node that persists from first paint to exit. It is never remounted or restarted across fallback swaps.
- **R3:** without a skip, the exit begins within 50 ms of `max(t₀ + D, t_ready)` (`D_rm` under reduced motion) and lasts ≤ 300 ms. Pointer input and focus reach the app (or the skeleton) at exit start.
- **R4:** if neither `ready` nor `error` has arrived by *t₀* + *D* + 4 s, the splash exits to the skeleton chain and leaves a `splash:ceiling` performance mark and a console warning.
- **R5:** the trigger rule in §2.3, including client entry from onboarding. It never shows on auth routes or with no session, and it never replays on refresh, in the same tab, or on in-app navigation.
- **R6:** the status text reflects only real phases. "Preparing demo data…" appears only after a real `seeding` event. After `ready` the status shows the ready state; the splash never shows a loading state for an app that is ready.
- **R13 (loading bar):** the fill target is a pure function of the latest real phase (§2.4a table), only ever increases, stays ≤ 90 % before `ready`/`error`, and reaches 100 % only on `ready`/`error`. No timer ever changes it. It is revealed at *t₀* + 4.0 s (at *t₀* under reduced motion). It is never completed by a skip or by the ceiling. Its ARIA values equal its visual target.
- **R7:** observe-only hooks. `DataProvider`'s and `GatedApp`'s rendered output and timing are unchanged, and pinned by tests.
- **R8:** under `NEXT_PUBLIC_E2E=1` the splash is off unless `?__splash=1` is present, so the 185/1 baseline is untouched. It mirrors the existing `?__session=none` / `?__state=` hook pattern (TP7).
- **R9:** the runtime's decision, timing and skip logic is authored as a typed, unit-tested pure function and stringified into the inline script, the way `THEME_SCRIPT` is a string. It is not hand-written untested JS.
- **R10:** performance marks `splash:painted`, `splash:ready`, `splash:skip`, `splash:exit` and `splash:ceiling`, plus a `data-splash` attribute value (`on|hold|exit|done`), make the lifecycle observable in tests and in the field.
- **R11 (skip):** from *t₀* + 250 ms, any `pointerdown` on the overlay or any non-repeat `keydown` (including Esc) starts the exit within 50 ms. The skipping gesture never activates app UI (the click is swallowed and the key is not forwarded). Browser shortcuts are not blocked.
- **R12 (a11y):** the overlay is not `aria-hidden`; decorative layers are. The overlay contains exactly one `role="status"` and exactly one focusable element (the skip button, which is not auto-focused). Focus is never left on a hidden element after exit.

## 5. Success criteria (the 5 locked DoD categories, now with numbers)
1. **No added *real* latency; the added *perceived* time is bounded and the user's to end.** (Restated from Discovery DoD #1, which is deliberately reversed by S21.)
   - Time-to-app-ready (`splash:ready`, the `ready` commit) is unchanged versus the no-splash baseline, within noise (5-run median, ±50 ms). The splash must not slow the load it covers.
   - Without a skip, the splash's visible end is ≤ `max(t₀ + D, T_ready + 250 ms) + 300 ms` (`D_rm` = 1 s under reduced motion), or ≤ the ceiling + 300 ms. The 250 ms is the bar-completion beat, and it only applies when `ready` lands late in or after the cinematic.
   - With a skip, exit starts ≤ 50 ms after the input. **Time-to-interactive after a skip** (input → the app accepts pointer and keyboard input) is ≤ 350 ms when the app is already ready. When it is not, the skeleton chain is visible ≤ 350 ms after the input, and the app arrives at `T_ready` as it would without the splash.
   - The forced wait is once per tab and zero for a user who presses anything (after the 250 ms guard).
   - There is no restart, and no "loading" state is shown for an app that is ready (R6).
   - The bar's fill is never ahead of the real phase, never at 100 % before `ready`, and never moved by a timer (R13).
2. **No net-new budget regression.**
   - Splash own weight ≤ **15 KB gzip**: inline runtime ≤ 2 KB (raised from 1.5 KB for the skip, hold and reduced-motion logic), CSS ≤ 7 KB, markup plus SVG ≤ 4 KB, with headroom kept. Rasters are excluded.
   - `route-budget` shared first-load JS delta ≤ **0.5 KB gzip** per route. The runtime lives in HTML, not a chunk, so React only gains event one-liners.
   - No currently-passing route flips to OVER, and the six already-failing routes grow by no more than that same ≤ 0.5 KB.
   - Splash rasters total ≤ **60 KB** desktop and ≤ **30 KB** mobile over the wire, and **0 bytes** on loads without the splash.
3. **Accessibility.**
   - `prefers-reduced-motion`: a static composed frame with zero running animations (checked with `getAnimations()` on the overlay), shown for ~1 s, then an instant cut.
   - WCAG 2.2.2: the auto-playing, more-than-5-s cinematic can be stopped and hidden by a documented, discoverable mechanism (the skip button plus any key, click or tap), available from the first frame.
   - Descriptor, status text and skip-button contrast ≥ 4.5:1 against the scene. The skip target is ≥ 24×24 px.
   - No content flashes more than 3 times per second (WCAG 2.3.1). If Stage 3 keeps a beam sweep, its period is ≥ 3 s.
   - The loading bar is exposed as `role="progressbar"`, and its `aria-valuenow` matches its visual target.
   - Axe is clean on the `on`, `hold` and ready states of the overlay.
   - No focus is reachable under the overlay. Exactly one status announcement is live at any moment. A screen reader can find and activate the skip button.
4. **e2e.** The 185/1 baseline is unchanged (the splash is off by default under e2e), and new splash specs cover the matrix in §6.
5. **Core Web Vitals, restated honestly.** A 6 s fixed cover breaks the Discovery wording "LCP unaffected or improved". The document's LCP will often be the splash's own logo/plate, or will land when the overlay lifts, and it would no longer say anything about the app. So:
   - **Loads without the splash** (refresh, new route, e2e, the overwhelming majority of loads): LCP, CLS and INP ≤ the no-splash baseline (lab, Fast-4G with 4× CPU, 5-run median). The overlay is hidden and 0 splash bytes load, so this is the real regression guard.
   - **Loads with the splash:** the gate is the **app's own readiness under the splash** (`splash:ready` ≤ baseline ±50 ms, §5.1) plus **time-to-interactive after a skip** (§5.1). The document LCP is recorded and reported for information, but it is not a pass/fail gate, because it measures the deliberate cover.
   - The splash contributes CLS = 0 (it is a fixed overlay).
   - The skip input's own INP is ≤ 100 ms. The handler only flips an attribute and sets marks.

## 6. Acceptance criteria / test matrix (feeds Stage 5 `test-cases.md`)
**Hard-load entry:**
- Hard load, new context, stored guest → the splash is on at first paint (R1). The full cinematic plays and the exit follows R3.
- Fast load (warm seed, ready well before *D*) → the full ~6 s cinematic still plays. The status switches to the ready state at `splash:ready`. The bar is hidden until *t₀* + 4.0 s, then fills to 100 % in ≤ 600 ms and holds. The exit starts at *t₀* + *D* (±50 ms). `splash:ready` is unchanged versus the no-splash baseline.
- Slow or throttled load (ready after *D*) → `data-splash="hold"`. The loop continues with truthful status, and with the `seeding` label when seeding is real. The bar stalls at its last phase value (65 % or 80 %) and never creeps. There is no restart (same node identity throughout, R2). The bar goes to 100 % at `ready`, and the exit starts ≤ 250 ms later.
- Very slow or failed load → the ceiling fires at *t₀* + *D* + 4 s (R4), with the mark and the warning. The bar is still below 100 % at exit, and the skeleton is visible.

**Loading bar (R13):**
- Driving the phase events in a unit test of the runtime gives the targets 10 → 35 → 65 → (80) → 100.
  - The fill never decreases.
  - It is ≤ 90 % until `ready`.
  - It does not change when only time passes: with no new events, it stays put for 10 s under `page.clock`.
- `aria-valuenow` equals the target at each step.
- The bar is absent from the accessibility tree before *t₀* + 4.0 s, and present after.
- Under reduced motion the bar is visible from *t₀*, with instant steps.
- A skip at a 65 % fill → the exit starts and the bar is not driven to 100 %.

**Skip (R11, R12):**
- Click, tap (touch emulation), Esc, a letter key and Enter, each at about 2 s → the exit starts ≤ 50 ms after the input, and `splash:skip` is marked.
- Skip before `ready` → the skeleton chain is visible and the app arrives at its normal `T_ready`.
- Skip after `ready` → the app is interactive ≤ 350 ms after the input.
- A tap on top of a spot where an app link sits underneath → the link is **not** activated (click swallowed).
- Enter pressed to skip → no app control is activated.
- Input within 250 ms of *t₀* is ignored; a held key's auto-repeat is ignored.
- Cmd/Ctrl+R during the splash → the browser reloads (not blocked) and the splash does not replay.
- The skip button is in the accessibility tree from the first frame, not focused on load, and activatable by keyboard and by screen-reader virtual click. If it had focus at exit, focus ends on `body`, not on a hidden element.
- The overlay's `role="status"` announces the phase, then ready. Decorative layers are hidden from the accessibility tree.

**Client entry, refresh and tabs:**
- **First entry via onboarding "Continue as guest" (client nav)** → the splash shows and the skeleton never paints first. A double-click on "Continue as guest" does not skip it (the 250 ms guard).
- Refresh mid-session, mid-splash, or after a skip → no splash.
- New tab → the splash shows.
- In-app navigation → no splash.

**Never shown:**
- Auth routes (`/welcome`, `/sign-in`, `/sign-up`, `/onboarding`) → never.
- No session → no splash, and the redirect still happens.
- Blocked storage or a private window that throws → no splash, and the app still loads.

**Failure paths:**
- The DataProvider db error path → treated as `ready`: the splash exits at `max(t₀ + D, t_error)` and the app renders.
- An injected chunk-load failure → the ceiling fires (R4).

**Breakpoints, themes and motion:**
- Breakpoints at 375, 768 and 1280: no horizontal scroll; the beam stays aligned to the lantern at every one; the skip button is reachable and overlaps neither the logo nor the loading bar.
- Clouds: the foreground cloud's drift per second is greater than the background cloud's (S24).
- Light and dark themes: an identical scene, and the exit reveals the correct theme.
- Reduced motion: a static frame, exit at `max(t₀ + 1 s, ready)` as an instant cut, and skip still works.

**Network:**
- A load without the splash requests zero splash rasters (a network assertion).

**e2e timing notes (for Stage 5):**
- The specs that assert *D* itself wait the real ~6 s. There are only a few of them, and they are marked slow.
- Every other splash spec ends the splash with a keypress, the same way a user would, instead of adding a test-only "short cinematic" hook. That keeps the code path real and the suite fast.
- The runtime's timers use `setTimeout`/`performance.now`, so Playwright's `page.clock` may fast-forward them where that helps. CSS keyframes are not clock-controlled, so assertions about the timeline use the `data-splash` state and the performance marks, not visual frames.

## 7. Non-functional requirements (measurable)
- **Performance:**
  - compositor-only animation;
  - no long task > 50 ms attributable to the splash under 4× CPU throttle;
  - the overlay never blocks the main thread's hydration work, because it contains no JS beyond the inline runtime;
  - the skip handlers are passive apart from the one swallowed click, and do O(1) work.
- **Budget:** the §5.2 numbers, enforced by a **mechanical gate**: a new `splash-budget` check (or an extension of `route-budget`) fails the build above 15 KB. This follows the global "promote rules into gates" principle, and it is not a review-time judgement.
- **Robustness:**
  - every storage access is wrapped, as `session.ts` does today;
  - the runtime is idempotent if `show()` is called twice, or if skip and `ready` arrive in the same frame;
  - bfcache restore never re-shows a finished splash;
  - a skip during the exit is a no-op.
- **Observability:** R10 marks (including `splash:skip`), plus a console warning on the ceiling. The skip rate is the field signal for whether 6 s is too long.
- **No new dependencies.**

## 8. Known tradeoffs and risks (honest)
- **A deliberate delay, chosen by the user.** Every qualifying tab now waits ~6 s unless the user acts. This reverses the brief's "must not artificially delay entry to complete the animation" and Discovery DoD #1 (S21). Mitigations: once per tab, skip from the first frame, no fake loading, and real readiness is unaffected.
- **New tabs replay it, which taxes operational users.** Once-per-tab means a user who Cmd/Ctrl-clicks an invoice or a dispute into a new tab gets the 6 s cinematic in that tab too. Previously that cost ~0.4 s; now it costs one keypress or ~6 s. Discovery Q2 floated "never more than once per day across tabs". It was not adopted (Q1 locked once-per-tab) and is out of scope here. **If the user wants it, it is a cheap `localStorage` timestamp in the same runtime, but it is a scope change that needs their say-so.** The `splash:skip` rate (§7) will show whether it is needed.
- **A real-progress bar will look uneven** (S23). Because the bar follows real phases, a warm load fills it in one jump, and a cold seed can hold it at 80 % for several seconds. The storyboard's smooth 0 → 90 % ease is something the bar will rarely show.
  - That unevenness is the price of honesty, and the user accepted it.
  - Stage 3 must make a stall read as "working", for example through the still-moving clouds and the status text, and not as "frozen".
  - On warm loads the bar is mostly "already full", because it only appears at 4.0 s. That is honest, but it gives the bar little visible job on the most common path.
- **An inline runtime outside the React tree.** It is less idiomatic than a component, but it is the only way to get pre-hydration first paint, pre-hydration skip and near-zero shared-JS cost. R9 (a typed, tested source that is stringified) keeps it inside the test tooling. The codebase already accepts the identical pattern for `THEME_SCRIPT`.
- **The splash overlay is in every page's HTML, including auth routes (hidden).** It costs about 3–4 KB of gzipped HTML per document, counted inside the 15 KB budget. The alternative, building the DOM from the runtime, would move that weight into JS that runs before first paint, which is worse.
- **SVG lighthouse versus a generated one.** This is an alignment and weight win, at a possible stylistic mismatch that Stage 3 mockups will reveal (§2.10).
- **Two premium reveals, close together, for a brand-new visitor** (the onboarding illustrations, then a 6 s splash). This is now more pronounced than in the draft, because the splash no longer shortens itself on a fast hand-off. Mitigation: it never shows on the onboarding routes themselves, it is skippable, and Stage 3 should make the two visually continuous rather than competing.
- **Branch base may not exist yet.** "Cut from a commit on `task/38` where all checks pass" assumes such a commit exists. The last recorded run had `route-budget` red on six routes, which is pre-existing and not this ticket's to fix. Stage 6 must confirm with the user whether that one known failure is acceptable in the base, rather than silently redefining "all checks".

## 9. User sign-off — APPROVED 2026-11-02
- [x] **1. Timing → guaranteed full cinematic** (replaces "accept compressed, honest timing"). The full ~6 s storyboard plays once per tab session, even when the app is already ready; a same-tab refresh does not replay it, a new tab does. This is a user-approved reversal of Discovery Q5 / DoD #1 (S21). §§0.1, 2.4, 2.5 and 5 have been updated.
- [x] **2. The trigger includes client-side entry out of onboarding** (§0.2 / §2.3), so the splash also plays on onboarding → app, and never on `/welcome`.
- [x] **3. Branch:** a new `task/45-splash` branch in its own worktree, cut from a commit on `task/38-emerald-redesign` where all checks pass. Nothing is committed to `task/38` (§0.3, S20; see the base-commit risk in §8).
- [x] **4. Refresh in the same tab does not replay** (§2.3).
- [x] **5. SVG lighthouse with a CSS beam; only the sky/sea plate and the clouds are generated** (§2.10).
- [x] **6. The numbers:**
  - splash ≈ 15 KB gzip;
  - shared-JS delta ≤ 0.5 KB;
  - rasters ≤ 60 KB desktop / 30 KB mobile, and 0 when not shown;
  - **cinematic *D* ≈ 6 s (exact value from the storyboard in Stage 3) and *D_rm* = 1 s**, replacing the 400 ms floor;
  - **ceiling *D* + 4 s (≈ 10 s)**, replacing 8 s;
  - exit ≤ 300 ms;
  - skip → exit ≤ 50 ms, with a 250 ms accidental-skip guard;
  - beam period ≥ 3 s;
  - CWV restated per §5.5.
- [x] **Skip (new):** any click, tap or key (including Esc) ends the splash immediately through the ≤ 300 ms exit. Reduced motion gets a static logo for about 1 s. "No skip button" is reversed (S22). The affordance is one small real "Skip intro" button plus a key hint (§2.6), and the a11y semantics are in §2.8.
- [x] **e2e:** the splash is off by default and on with `?__splash=1` (R8).
- [x] **decisions.md:** S15–S24 are appended only once the work is on `task/45-splash` (Appendix A).
- [x] **Loading bar (new, S23):** the storyboard's bottom-centre pill stays, filled only by real phases (§2.4a). This reverses the draft's "no percentage" decision.
- [x] **Cloud parallax (new, S24):** the foreground cloud moves faster than the background cloud, swapping the storyboard's speeds.
- [x] **7. Storyboard provided.** The user pasted it in chat on 2026-11-02, and it is transcribed in `docs/TASK-45-storyboard.md`. The image file itself is not in the repo. `docs/TASK-45-creative-brief.md` is a session summary of the brief, not verbatim. **Stage 3 resolves the storyboard's remaining open items. They are not decided here:**
  - **(a) Progress timing:** the frame text says 4.0–5.5 s and the layer chart says about 3.2–4.3 s. This PRD reveals the bar at 4.0 s, and Stage 3 may move it.
  - **(b) Cloud distance:** 10–30 px over 6 s versus 5–10 % of the screen width (about 70–140 px at 1440 px).
  - **(c) Beam:** it expands left and holds still, but frame 04's "as the light passes over it" implies a sweep.
  - **(d) The exact *D*:** frame 08 (5.5–6.0 s) contains the 200–300 ms exit, so *D* is about 5.7–6.0 s.

  Items 1 (the bar) and 4 (inverted parallax) in the storyboard's inconsistency list are already resolved by S23 and S24.

### Phase model that Stage 3 maps the storyboard onto
| Phase | When | Content constraint |
|---|---|---|
| B0 · First frame | *t₀*, pre-JS | The static base composition paints instantly: gradients, SVG lighthouse, logo layers at their start state, and the skip button |
| B1 · Cinematic | *t₀* → *t₀* + *D* (~6 s), **always plays in full unless skipped** | Storyboard frames 01–07: scene fade-in → lantern glow → beam expands → V-mark → wordmark → descriptor → loading bar revealed at 4.0 s showing the **real** fill (§2.4a). The status is truthful throughout and switches to ready the moment `ready` arrives |
| B2 · Hold | *t₀* + *D* → `ready` (only if loading outlasts *D*; ≤ ceiling *D* + 4 s) | Frame 07 as a calm loop: one-way cloud parallax (foreground faster), the beam's ambient motion as Stage 3 chooses (a sweep period ≥ 3 s if any), truthful status, the bar stalled at its real value. It can be cut at any instant without looking broken |
| B3 · Exit | at `max(t₀ + D, ready + fill)`, at a skip, or at the ceiling; ≤ 300 ms | Frame 08: the bar is complete (only if really ready), then a container fade (no zoom) reveals the live app, or the skeleton if the app is not yet ready (after a skip or the ceiling, with the bar incomplete) |
| B4 · Reduced motion | the whole lifetime, *D_rm* = 1 s | The static final composition, an instant cut on exit, and skip still works |
| B5 · Skipped | any time after *t₀* + 250 ms | It jumps straight to B3 from whatever frame is showing. Every frame must therefore be a tolerable starting point for the exit fade |

---

## Appendix A — decision-log entries to append to root `decisions.md` (status: approved 2026-11-02, not yet appended)
They are not yet appended to `decisions.md`, because it is a tracked file in the `task/38-emerald-redesign` working tree, where an in-flight TASK-38 commit could sweep it up. Append them on the `task/45-splash` branch, as the first commit there, together with the TASK-45 docs. IDs continue the existing sequence (S1–S14 are taken).

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
