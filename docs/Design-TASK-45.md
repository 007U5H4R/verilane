# Design — TASK-45 · Cinematic Lighthouse Splash Screen

- **Stage:** 3 · UI/UX Design. **Status:** APPROVED 2026-11-02 by the user. All 8 sign-off items in §17 were approved as recommended. The design is frozen (§18).
- **Date:** 2026-11-02.
- **Scope:** this file is ticket-scoped. The root `Design.md`, root `Solution-PRD.md`, `Discovery-PRD.md` and `decisions.md` are untouched.
- **Inputs (all approved):**
  - `docs/Solution-PRD-TASK-45.md` (S15–S24)
  - `docs/TASK-45-storyboard.md`
  - `docs/TASK-45-creative-brief.md`
  - `docs/Design-TASK-46.md` §8 (coordination constraints)
- **Mockup:** `.design/exploration/task-45/index.html`. It is a design prototype, not production. Open it straight from disk; it needs no server.

## 1. Source of truth and precedence

1. The approved Solution PRD fixes the architecture.
   - It is a server-rendered overlay before hydration, with `html[data-splash]` values `on`, `hold`, `exit` and `done`.
   - It uses an inline head runtime and animates only transform and opacity.
   - The bar is filled by events. The cinematic plays in full, once per tab, with skip and ceiling rules.
   - This document does not reopen any of that.
2. **The root `Design.md` still governs the app.** The splash is a **scoped exception** (§5): it is the only surface allowed gradients, glow and a decorative loop. The exception ends the moment `data-splash="done"` is set.
3. The four open Stage 3 values from PRD §9 item 7 are decided in §4. Each comes with its sign-off item in §15.

## 2. Surface classification

- **Classification:** Core surface, a transitional brand moment inside an authenticated-style app.
- **Public crawling:** none. Crawlers are redirected to `/welcome` (PRD §2.3).
- **Direction:** a single direction. No gallery is needed, because the storyboard and creative brief are approved and fix the composition. The real decisions are timing and motion values, and the scrubber and controls make those visible rather than describing them.

## 3. Direction and anti-direction

**Direction: "Harbour light at dusk."**
- **Scene:** deep emerald sky, a white-and-green SVG lighthouse at the right edge, one warm beam reaching left across the frame, and two soft cloud bands drifting.
- **Brand reveal:** the official V mark is lit by the beam, then the wordmark slides out of it, then the tagline appears.
- **Close:** a quiet progress pill reports real progress, and the scene hands off to the app skeleton with a single fade.
- **Emotional target:** calm, competent and "someone is keeping watch over your receivables". It should feel unhurried.

**Anti-direction:**
- No starfield, particles, lens flare or bokeh.
- No neon glow, no rotating beam strobing the screen, no fake percentage counter, and no bouncy or elastic easing.
- No typewriter tagline, no "loading tips", and no confetti on ready.
- No 3D/WebGL.
- No bar that creeps on a timer. A bar that lies is the cardinal sin here (S23).

## 4. The four resolutions (PRD §9 item 7)

| # | Question | Decision | Why | Alternative |
|---|---|---|---|---|
| 1 | Bar reveal time: 4.0 s or ≈3.2 s | **3.2 s**, the moment the tagline settles (F06 end). It is a 300 ms rise. | At 4.0 s, a 0.8 s dead beat follows the tagline, and the viewer reads it as "is that it?". At 3.2 s the bar is the next beat of the same sentence. Warm loads still fill it to 100 within 600 ms of reveal, so it reads as "done" rather than "racing". | Keep 4.0 s exactly as PRD R13 says. **This amends R13**, so it is a sign-off item. |
| 2 | Cloud distance: px or % of width | **Width-relative.** Production uses `vw`; the mockup uses `cqw` on the stage. The foreground cloud travels 10 vw and the background cloud 5 vw, as a one-way linear drift over 10 s. | A fixed px distance looks frantic at 375 and static at 1440. A 2:1 ratio gives the S24 parallax at every width. A one-way drift avoids a visible "rewind". | — |
| 3 | Beam: static or sweeping | **Static after it expands**, with a −6° tilt. The core "breathes" in opacity (1 → .78, 5 s period), and one sheen pass crosses the V at 1600 ms. | A sweep pulls the eye away from the logo and the bar, which are the two things that matter during hold. It also adds a 2.2.2 pause concern, and it fights the panorama handoff. Breathing reads as "alive" without moving the light. | A ±4° sweep with a period of 6 s or more, during hold only. |
| 4 | Exact *D* | **D = 5.7 s**, plus the 300 ms exit, so the visible end is ≈6.0 s. Ceiling = D + 4 s = **9.7 s**. | The choreography finishes at 3.2 s. Then 2.5 s of hold lets the bar fill and read "Workspace ready". That matches the "about 6 s" in S21. | 6.0 s + exit (ceiling 10 s). |

**Fifth question: a stalled bar must read as "working", not "frozen".**
- **Stall definition:** more than 1.5 s since the last phase event, after reveal, and not yet ready.
- **Glint:** a soft light sweeps **inside the filled part only**. It is clipped to `--p`, has a 2.4 s period, and is eased. It never changes the value, so the bar is still honest; it simply shows that the system is alive.
- **Sub-line:** after a 4 s stall, or 1.5 s past *D*, a second line fades in under the status: *"Still working — first visits can take a few seconds."* Copy is a sign-off item.
- **Ceiling:** at the ceiling the splash exits anyway (S21). The app's own skeleton then carries the wait.

## 5. Scoped exception to the root `Design.md`

The root `Design.md` rejects gradients, glows, decorative motion, and redrawing the logo. The splash uses gradients, glow and a decorative loop under these limits:

- **Where:** only inside `#splash`, only while `html[data-splash]` is not `done`, and only on first entry per tab.
- **Logo:** the official `public/brand/verilane-logo-light.png` is used **unmodified**. It is split into two layers with static clip-paths, the same pattern `LogoCard.tsx` already uses:
  - V: `inset(0 74.6% 0 0)`
  - wordmark: `inset(0 0 0 25.4%)`

  Nothing is redrawn, recoloured or traced.
- **Glow:** only the lantern glow and the beam are luminous. No UI element has a glow. The bar fill is a `--rail-bright` → `--rail-mint` gradient, both existing tokens.
- **Exit:** the app behind the splash is exactly today's `ShellSkeleton`. The exception leaves no residue.

## 6. Frame timeline (normal motion)

The time origin t₀ is the first paint of the overlay. All motion uses transform and opacity only.

| Frame | Window (ms) | What moves | Easing |
|---|---|---|---|
| F01 Scene | 0–500 | Sky, sea/hills and clouds fade in (opacity 0 → 1). The cloud drift starts at once and runs 10 s, linear. | `ease-out` |
| F02 Lantern | 400–1100 | The lantern glow goes from opacity 0 → 1 and scale .6 → 1. | `cubic-bezier(.22,.61,.36,1)` |
| F03 Beam | 800–1800 | The beam grows with `scaleX` 0 → 1 from its right edge (the lantern). The core layer follows with a delay (`--d:1800ms`), then starts breathing. | `cubic-bezier(.22,.61,.36,1)` |
| F04 V mark | 1400–2000 | The V goes translateY 10 px → 0, scale .96 → 1, opacity 0 → 1. A sheen pass crosses it at 1600 ms over 700 ms. | `cubic-bezier(.22,.61,.36,1)` |
| F05 Wordmark | 2000–2600 | The wordmark goes translateX −14 px → 0, opacity 0 → 1. It slides "out of" the V. | `cubic-bezier(.22,.61,.36,1)` |
| F06 Tagline | 2600–3200 | "AR COLLECTIONS COPILOT" goes from opacity 0 → 1 with translateY 6 px → 0. | `ease-out` |
| F07 Bar | 3200–3500 | The progress block rises (translateY 6 px → 0, opacity). It already shows the current real value. | `ease-out` |
| Hold | 3500 → exit | The beam breathes and the clouds drift. The stall glint appears only when stalled (§4). | — |
| Exit | `max(t₀+D, ready+fill)` | The whole container fades (opacity 1 → 0, 300 ms). Then `data-splash="done"`, the node is removed, and `inert` is cleared on the app. | `ease-in` |

**Bar fill:** each new target animates `scaleX` over 350 ms `ease-out`. If ready lands after *D*, a completion beat of 250 ms or less runs before the exit.

**Simulated scenarios** (selector in the mockup, also `?scenario=`):

| Scenario | Events (ms) | Outcome |
|---|---|---|
| fast (warm) | ready at 900 | The bar is 100 by ≈3.85 s and reads "Workspace ready". Exit at 5700. |
| slow (seeding) | seeding at 3000, ready at 7400 | Hold, stall glint, then the completion beat. Exit at ≈7650. |
| slow, no seeding | ready at 6800 | The bar goes 10 → 35 → 65 → 100 and skips 80. Exit at ≈7050. |
| very slow | session 1500, provider 4200, seeding 5000, never ready | Stall glint, then the long-stall line, then the **ceiling at 9700** with the bar incomplete. |
| error | error at 4100 | Treated like ready (100, "Workspace opened"). Exit at 5700. The app shows its own error state. |

## 7. Progress, status copy and live region

- **Targets:** painted 10, session 35, provider 65, seeding 80 (only if seeding really ran), ready/error 100.
  - Values only increase. Before ready the bar stays at 90 or below, and there is no timer creep.
- **Status line** (one `role="status"`, polite, with the prefix "Verilane. " for the first announcement):
  - "Opening workspace…"
  - "Preparing demo data…" (only after a real seeding event)
  - "Workspace ready". On error: "Workspace opened" (sign-off item).
- **Progressbar:** `role="progressbar"` with `aria-valuemin=0`, `aria-valuemax=100` and `aria-valuenow`. `aria-valuetext` equals the phase text. It is not a live region, which avoids double announcements.
- **Announcements:** the mockup only updates the live region when the message *signature* changes. Production must do the same, so a value tick never re-announces.

## 8. Skip

- **Control:** a real `<button>`, bottom-right.
  - It reads "Skip intro", and **"Continue" once ready**.
  - It is 36 px tall on a pointer device and 44 px on touch, so it clears the 24×24 target minimum (2.5.8) and the touch comfort size.
  - Under it is a hint: "or press any key", or "or tap anywhere" on touch.
- **Triggers:** any `pointerdown` or `keydown` exits within 50 ms (S22).
  - Ignored in the first 250 ms.
  - Ignored on `event.repeat`.
  - The skipping event is never forwarded to the app.
- **Result:** a skip exits with the bar where it is. There is no fake fill-up.
- **Focus:** no auto-focus, and the button is reachable by Tab. After exit, focus stays on `body`, so the app's normal first Tab stop applies.

## 9. Reduced motion

- **Trigger:** `prefers-reduced-motion: reduce`. The mockup has a toggle and `?rm`.
- **Frame:** the full composed frame appears statically at t₀. The bar is visible from t₀.
  - No beam growth, no breathing, no drift, no sheen.
  - The glint is replaced by the stall sub-line alone.
- **Timing:** D_rm = 1 s, ceiling 5 s. The exit is an **instant cut** with no fade.
- **Evidence:** `shots/*-rm.png`.

## 10. Tokens

The splash is **always dark**, independent of the app theme. The scene is the brand moment, and the app theme takes over at exit.

These values are the ones the mockup actually uses (`index.html` `:root`). Each maps to an existing `--rail-*` token in `src/app/globals.css`, so no new colour enters the palette except the warm light.

| Token | Value | Maps to | Use |
|---|---|---|---|
| `--sp-base` | `#062f24` | `--rail-deep` | First frame (B0, server-rendered) and the sky's middle |
| `--sp-deep` | `#041f18` | — | Sky top |
| `--sp-mid` | `#083a2b` | `--rail-dark` | Sky toward the horizon |
| `--sp-hill-1/2/3` | `#052a20` / `#073427` / `#0a4030` | — | The three SVG hill bands |
| `--sp-mint` | `#8ed7b0` | `--rail-mint` | Bar fill end |
| `--sp-bright` | `#21845f` | `--rail-bright` | Bar fill start |
| `--sp-soft` | `#ddf2e7` | `--rail-soft-mint` | Track (at .16 alpha) and skip border (at .34) |
| `--sp-text` | `#f3f8f5` | `--rail-text` | Skip label. Contrast is 13.6:1 on `--sp-base`. |
| `--sp-muted` | `#b9d4c5` | `--rail-muted` | Tagline, status, hint and sub-line. Contrast is 9.2:1 on `--sp-base` and 7.4:1 on `--sp-hill-3`, the darkest-to-lightest areas behind the text. |
| `--sp-light` | `rgb(255 236 196)` | new | Lantern, beam, sheen and sky haze (the one warm light) |
| `--sp-tower` / `--sp-tower-shade` / `--sp-cap` | `#efe9d9` / `#cfc7b2` / `#176b50` | — | SVG tower |
| Type | Inter (next/font, already loaded). The tagline is `clamp(12px, 1.15vw, 16px)`, weight 500, tracking .18em (.14em on phones), uppercase. The status is 13 px. The skip label is 13 px, weight 500. | — | — |

**Bar-fill contrast note (1.4.11):** the fill's left end (`--sp-bright`) is 3.15:1 on `--sp-base` but only 2.53:1 on `--sp-hill-3`, which is behind the bar. The value is also conveyed by the status text and `aria-valuetext`, so the information does not depend on the fill. Stage 6 should still start the gradient one step lighter, or give the track a 1 px `--sp-soft` outline, so the bar itself clears 3:1.

## 11. Scene construction (for Stage 5/6)

- **Sky:** a CSS gradient on the container. When the G1 plate ships, the sky is a ≤60 KB WebP with the gradient as its fallback, and the splash never waits for it.
- **Clouds:** two layers (G2 art, or CSS radial-gradient blobs until then). They are wider than the viewport and translate on X only.
- **Hills/sea:** one inline SVG group of three paths (`--sp-hill-1/2/3`). No raster.
- **Lighthouse:** an inline SVG tower (body, three stripes, gallery, lantern room, cap). It is anchored bottom-right at ≈85% x.
- **Beam:** two absolutely positioned layers, wide and core. Each is a linear-gradient wedge clipped by `clip-path: polygon(...)`, with `transform-origin: right center`, inside a −6° tilt wrapper.
- **Brand:** two `<img>` of the same PNG with the static clips (§5), plus a sheen layer masked to the V.
- **Budget:** ≈15 KB for the HTML and CSS of the splash, +0.5 KB shared JS (PRD), and rasters ≤60/30 KB.

### 11.1 Stage 6 asset spec (not generated; generation costs money and is Stage 6's job)

- **G1 sky plate:** 2400×1350 WebP, ≤60 KB.
  - Prompt: "Painterly dusk sky over calm sea, deep emerald to teal gradient, faint warm haze low on the right horizon, soft atmospheric depth, no objects, no text, no lighthouse, no light beam, no stars, no logo, minimal detail, 16:9."
- **G2 cloud strips:** two transparent WebPs, ≤30 KB total.
  - Foreground: 3200×600. Background: 3200×500.
  - Prompt: "Soft low stratus cloud band, semi-transparent white-green mist, horizontal strip, seamless edges left and right, transparent background, no hard edges, no text."
- **Never in the art:** the logo, text, the beam or the lighthouse (PRD).

## 12. Responsive behaviour

The mockup uses container queries on the stage so that one page can show three widths. **Production uses viewport media queries at the same thresholds (900 px and 600 px).**

| Width | Layout |
|---|---|
| ≥ 901 (1440 checked) | Brand axis `--bx` at 46 vw. The bar is centred on the brand axis, `clamp(200px, 24vw, 340px)` wide, at `bottom: max(116px, 13vh)`. Both clouds are shown. |
| 601–900 (768 checked) | `--bx` at 44 vw. Same structure, slightly smaller logo. |
| ≤ 600 (375 checked) | `--bx` at 50 vw, so the brand is centred. The lighthouse sits below the tagline at the right. The bar is `min(62vw, 260px)` wide. The background cloud is hidden and the foreground cloud drops to opacity .8. Skip is 44 px tall. |

**Measured in the mockup by Playwright:**
- no horizontal scroll at 1440, 768 or 375;
- no overlap between skip and logo, skip and bar, logo and bar, or logo and rig;
- no page errors.

## 13. Screen states (web-deliverables)

| State | What the user sees | Evidence |
|---|---|---|
| Loading | The splash itself (F01–F07, then hold, with the stall glint and sub-line if slow) | `shots/*-f02…f07-bar.png`, `*-hold-stall.png`, `*-ceiling-hold.png` |
| Working / ready | The splash fades into the app's `ShellSkeleton`, then the real app | `shots/*-ready-exited.png` |
| Error | Bar goes to 100, "Workspace opened", exit on schedule. The app's own error banner carries the message; the splash never shows an error itself | `shots/*-error-exited.png` |
| Empty / ceiling | Ceiling exit with the bar incomplete; the skeleton keeps loading | `shots/*-ceiling-exited.png` |

**Ceiling observability:** `performance.mark("splash:ceiling")` plus one `console.warn`, so a stuck load is visible in a trace (PRD).

## 14. TASK-46 handshake (panorama background)

Rules from `Design-TASK-46.md` §8: no shared code; the splash never waits for the heritage art; any overlap is fixed with the panorama's `background-position`.

- The mockup's "exit into: TASK-46 panorama" option renders the app with `../task-46/art/{light,dark}-normal.png` at `background-position: 62% 100%` / `cover`.
- The handshake panel shows three frames: the splash frozen at 5.7 s, the panorama, and a 50% onion-skin.
- **Finding:** the splash lighthouse sits at ≈85% x. In the TASK-46 placeholder art, the `cover` crop puts the landmarks near mid-screen. They do not collide with the splash (it is gone by then), but there is no spatial "rhyme" either. If TASK-46 wants the rhyme, its `background-position` is the lever, per its own rule. **This is TASK-46's call and is not blocking.**

## 15. Gates

**Ethical behavioural design gate — pass.**
- The bar never lies.
- Skip is always available after 250 ms.
- There is no forced wait beyond the approved S21 cinematic, and there is a hard ceiling.
- The skipping click is never forwarded, so there are no accidental actions.

**Anti-AI-slop gate — pass, with notes.**
- **Grayscale:** the scene still reads (tower, beam and logo carry by value).
- **20-SaaS test:** the composition is specific to this brand (the lighthouse is the "watch over receivables" metaphor from the brief), not a generic gradient-plus-spinner.
- **No slop tropes:** no particles, no glassmorphism, no typewriter.

**Accessibility, WCAG 2.2 AA — designed and mockup-checked, not yet tested with assistive technology.**
- **2.2.2 Pause, Stop, Hide:** motion lasts more than 5 s only in a slow load, and skip stops it all. Hold motion is low-amplitude.
- **2.3.1 Three Flashes:** no flashing; the breathing and glint cycles are 5 s and 2.4 s.
- **2.3.3 Animation from Interactions:** reduced motion is honoured (§9).
- **1.4.3 Contrast:** all text is 7.4:1 or better (§10).
- **1.4.11 Non-text Contrast:** the fill's left end is 2.53:1 on the hill behind it. It is mitigated by the text and has a Stage 6 fix (§10).
- **2.5.8 Target Size:** the skip button is 36 px or larger, 44 px on touch.
- **4.1.3 Status Messages:** one polite status message.
- **Focus:** no auto-focus. The app is `inert` until exit, and decorative layers are `aria-hidden`.

**Default patterns gate.**
- **Guided tour: N/A for the splash.** It is a 6-second, one-time transition with no controls to teach; the tour is TASK-44's surface and starts after the splash.
- **Skeleton loading: satisfied.** The existing `ShellSkeleton` is the exit target, shown in the mockup.

**Web-deliverables.**
- **Mobile:** checked at 375 and 768 (§12).
- **Four states:** §13.
- **OG / link preview: N/A.** The splash needs JS, sessionStorage and a guest session on a non-auth route, and crawlers are redirected to `/welcome` (PRD §2.3), so no crawler ever renders it.

## 16. Verification evidence

- **Mockup:** `.design/exploration/task-45/index.html`. It has:
  - controls for replay, skip, the load scenario, viewport (1440/768/375), exit target, reduced motion, app theme, touch and onion-skin;
  - a scrubber with "Play from here";
  - URL params `?bare&w=&h=&t=&scenario=&rm&touch&theme=light&bg=panorama&skip=`.
- **Screenshots:** 34 files in `.design/exploration/task-45/shots/`.
  - For each of 1440, 768 and 375: `f02`, `f04`, `f06`, `f07-bar`, `hold-stall`, `ceiling-hold`, `ready-exited`, `error-exited`, `ceiling-exited`, `rm` and `panorama-exit`.
  - Plus `review-page-375.png`, the whole review page at phone width.
- **Script:** `/Volumes/E Drive/Dev/.scratch/task45/shots.mjs` (Playwright). It also asserts no horizontal scroll and no overlaps.
- **Verified:**
  - every frame renders at all three widths, with no horizontal scroll, no overlaps and no page errors;
  - the stall sub-line appears in `ceiling-hold`;
  - the error-exit shows the app's error banner;
  - the reduced-motion frame shows everything statically, with the bar visible;
  - the panorama exit renders;
  - the handshake minis render at 375.
- **Not verified:**
  - live click/keyboard skip in a real browser session (it is scripted via `?skip=` only);
  - the glint motion itself (stills only);
  - a screen-reader pass;
  - real-device performance.
- **Known cosmetic note:** at 1440 the beam core crosses the wordmark. It stays readable, and Stage 6 can soften the core by another step if Stage 7 flags it.

## 17. Stage 3 sign-off items (recommendations)

1. **Bar reveal at 3.2 s. This amends PRD R13 (4.0 s).** Recommend approving. The alternative is to keep 4.0 s.
2. **D = 5.7 s** (visible end ≈6.0 s, ceiling 9.7 s). Recommend approving. The alternative is 6.0 s with a 10 s ceiling.
3. **Clouds:** width-relative, foreground 10 vw and background 5 vw over 10 s, background hidden on phones. Recommend approving.
4. **Beam:** static, breathing and one sheen pass, no sweep. Recommend approving. The alternative is a ±4° sweep with a period of 6 s or more, in hold only.
5. **Error copy "Workspace opened"** (neutral; the app banner owns the error). Recommend approving.
6. **Stall copy:** "Still working — first visits can take a few seconds." after a 4 s stall or 1.5 s past *D*. Recommend approving.
7. **Skip placement bottom-right**, with "Skip intro" turning into "Continue" when ready. Recommend approving.
8. **Splash is always dark**, independent of the app theme. Recommend approving.

**Approval record:** the user approved all 8 items as recommended on 2026-11-02.

## 18. Design Freeze (2026-11-02)

**Frozen:**
- **Mockup:** `.design/exploration/task-45/index.html` is the frozen reference. Its screenshots are in `shots/`.
- **Direction:** "Harbour light at dusk" (§3), including the anti-direction.
- **Composition and responsive layout:** the lighthouse at the bottom right (≈85% x), the brand centred on the `--bx` axis, and the bar centred under the brand. Breakpoints are 900 and 600 (§12).
- **Timeline:** frames F01–F07 with their windows and easings (§6).
  - The bar reveals at **3.2 s**. This amends PRD R13.
  - **D = 5.7 s**, the exit is 300 ms, and the ceiling is 9.7 s.
  - Under reduced motion, D_rm = 1 s, the ceiling is 5 s, and the exit is an instant cut.
- **Beam:** it holds still after extending, at a −6° tilt. It breathes (opacity 1 → .78, 5 s) and gives one sheen pass at 1.6 s. It **never sweeps**.
- **Clouds:** width-relative. The foreground moves 10 vw and the background 5 vw, one way over 10 s. The background cloud is hidden at ≤600 px.
- **Progress:** the bar is driven only by events (10/35/65/(80)/100, ≤90 before ready).
  - The stall glint stays inside the fill and never changes the value.
  - The stall sub-line appears after a 4 s stall or 1.5 s past *D*.
- **Copy:**
  - "Opening workspace…"
  - "Preparing demo data…"
  - "Workspace ready"
  - error: "Workspace opened"
  - stall: "Still working — first visits can take a few seconds."
  - skip: "Skip intro" / "Continue"
  - hints: "or press any key" / "or tap anywhere"
- **Skip:** a button at the bottom right, 36 px tall (44 px on touch), with a 250 ms guard. The skipping event is never forwarded.
- **Tokens:** the §10 token table. The splash is always dark.
- **Accessibility model:** a single polite `role="status"`, a non-live progressbar whose `aria-valuetext` equals the phase text, decorative layers `aria-hidden`, the app `inert` until exit, and no auto-focus.
- **Scoped exception:** the scoped exception to the root `Design.md` (§5). The logo is the official PNG, unmodified, split by clip-path.

**Stage 6 requirements carried forward (these are not redesigns):**
1. **Fill contrast (1.4.11):** the fill's left end (`--sp-bright`, 2.53:1 on `--sp-hill-3`) must reach ≥ 3:1 against what is behind it. Either start the gradient one step lighter, or give the track a 1 px `--sp-soft` outline. Verify by measurement.
2. **Beam core over the wordmark at 1440:** it may be softened by one step if Stage 7 flags it.
3. **G1/G2 art:** generate it to the §11.1 spec, within the size limits. The splash never waits on the art.
4. **Production layout:** use viewport media queries and `vw`/`vh` in place of the mockup's container queries and `cqw`/`cqh`.

**Allowed after the freeze:** fixes for technical, pixel, browser, performance and accessibility issues that keep the frozen decisions above.

**Not allowed without returning to design review:** changing the composition, the timeline values, the beam behaviour, the copy, the skip placement or the always-dark rule.

**Decisions log:** these decisions go into `decisions.md` as `D#` entries once `task/45-splash` is cut (Stage 4/6), numbered after S15–S24. They must never be added on task/38, and they are not appended yet.
