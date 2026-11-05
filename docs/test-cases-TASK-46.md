# TASK-46 — Test cases (Indian heritage background system)

> Stage 5 · Technical Planning · Campfire TASK-46 · 2026-11-02 · **APPROVED 2026-11-02**
> Plan: [`technical-plan-TASK-46.md`](technical-plan-TASK-46.md). Tickets: [`tickets-TASK-46.md`](tickets-TASK-46.md). Requirements: Solution-PRD-TASK-46 §12–§13.
> **Block:** TC-091 … TC-125 is reserved for TASK-46 (pointer in root [`test-cases.md`](../test-cases.md)); the next free ID is **TC-126**. Mapping: TC-46.nn → TC-(090+nn).
> **Traceability rule (same as root):** every automated test title starts with its `TC-###`; a TC with no test is `Auto: N` and records its manual evidence in HANDOFF.
> **Single run command:** `pnpm test:all` (with `pnpm image-budget` inserted after `pnpm route-budget` by TASK-46.5). Specs run against the production build on `E2E_PORT` (never 3000/3141/3900).
> **Status values:** Not run · Pass · Fail · Blocked. **Finding:** CR-/SEC-/DES- ID or —.

## Mapping

| TC-46 | TC | Ticket | Campfire | Layer | File |
|---|---|---|---|---|---|
| .01 | TC-091 | TKT-46.01 | TASK-46.1 | manual/diff | — |
| .02–.08 | TC-092–TC-098 | TKT-46.02 | TASK-46.2 | e2e | `tests/e2e/heritage.spec.ts` |
| .09–.10, .13a | TC-099, TC-100, TC-103 | TKT-46.03 | TASK-46.3 | unit | `src/lib/heritage.test.ts` |
| .11–.15 | TC-101–TC-105 | TKT-46.03 | TASK-46.3 | e2e / static | `tests/e2e/heritage.spec.ts`, `pnpm route-budget` |
| .16–.18 | TC-106–TC-108 | TKT-46.04 | TASK-46.4 | unit + e2e | `src/lib/heritage.test.ts`, `tests/e2e/heritage.spec.ts` |
| .19–.22 | TC-109–TC-112 | TKT-46.05 | TASK-46.5 | unit | `scripts/image-budget.test.ts`, `scripts/encode-heritage.test.ts` |
| .23–.26 | TC-113–TC-116 | TKT-46.06 | TASK-46.6 | e2e (+unit helpers) | `tests/e2e/heritage-contrast.spec.ts`, `src/test/lstar.test.ts` |
| .27–.28 | TC-117–TC-118 | TKT-46.07 | TASK-46.7 | manual | scratch `gen/rubric.md` |
| .29–.35 | TC-119–TC-125 | TKT-46.08 | TASK-46.8 | static / e2e / manual | various |

---

## M-46.1 · Tracer

### TC-091 · Design.md gains exactly Revision R2 and R3
- **Rel:** M-46.1 · TKT-46.01 · TASK-46.1 · 46.1.3 · **Type:** docs · **Pri:** P2 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** Design.md matches the approved PRD §11.1/§11.2 text, nothing else.
- **Preconditions:** `task/46-heritage-bg` cut per A8.
- **Steps:** `git diff <base> -- Design.md`; diff the added block against PRD §11.1 + §11.2.
- **Data:** Solution-PRD-TASK-46 §11.
- **Expected:** Only additions after "Revision R1"; text identical to §11.1 then §11.2; no other Design.md line changes.

### TC-092 · Emitted CSS carries hashed heritage URLs in both image-set entries
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.5 · R5 · **Type:** integration · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** Kill R5: Next/Turbopack rewrites `url()` inside `image-set()` and keeps the `type()` hints.
- **Preconditions:** `pnpm build:e2e`; server on `E2E_PORT`.
- **Steps:** Load `/`; collect `link[rel=stylesheet]` hrefs; fetch each; find rules with `heritage-`.
- **Data:** Placeholder assets (46.2.1).
- **Expected:** Path A: both light and dark desk rules contain `/_next/static/media/heritage-…<hash>.avif` with `type("image/avif")` and `….webp` with `type("image/webp")`; every URL returns 200. Path B: `/heritage/…v1.*`, same checks.

### TC-093 · Heritage asset is served immutable
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.5 · N1 · **Type:** integration · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** Repeat visits cost no heritage bytes.
- **Preconditions:** As TC-092.
- **Steps:** `request.get(<heritage url from TC-092>)`; read `cache-control`.
- **Data:** —
- **Expected:** Contains `max-age=31536000` and `immutable`.

### TC-094 · Service worker keeps the heritage asset referenced (STATIC_REF matches)
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.6 · R5b · **Type:** integration · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** `pruneStatics` in `public/sw.js` does not drop the art, because a cached CSS chunk's reference to it matches `STATIC_REF`.
- **Preconditions:** As TC-092.
- **Steps:** Fetch `/sw.js` text; extract the `STATIC_REF` regex literal; fetch the CSS chunk(s); run the regex over the CSS text.
- **Data:** Emitted CSS (absolute `/_next/static/media/…` or relative `../media/…`).
- **Expected:** Every heritage URL in the CSS is matched by `STATIC_REF`. On failure: stop and raise the regex widening for approval (plan sign-off item 6); `sw.js` is not edited without it.
- **Note:** Adapted per EXE56 (path B): the art is served from `/heritage/…`, outside `/_next/static/`, the only key space `pruneStatics()` manages, so the test asserts that instead of a `STATIC_REF` match.

### TC-095 · First heritage request matches the theme in light, dark and system-dark (SC4)
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.8 · SC4 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** No wrong-theme flash or wasted request.
- **Preconditions:** Fresh context per mode.
- **Steps:** Mode 1 `colorScheme: light`, no storage; mode 2 `verilane-theme=dark` via `addInitScript`; mode 3 `colorScheme: dark`, no storage. Record `page.on("request")` matching `/heritage-/` while loading `/`.
- **Data:** —
- **Expected:** First match contains `heritage-light-` (mode 1) or `heritage-dark-` (modes 2, 3); no request for the other theme before `data-idle` is set.

### TC-096 · Theme toggle swaps art in the same frame, no transition
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.8 · F3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** The art follows the theme instantly.
- **Preconditions:** `/` loaded in light.
- **Steps:** In one `page.evaluate`: click ThemeToggle, then in `requestAnimationFrame` read `getComputedStyle([data-heritage]).backgroundImage` and `transitionDuration`.
- **Data:** —
- **Expected:** `backgroundImage` contains `heritage-dark-`; `transitionDuration` is `0s`.

### TC-097 · Overlays stay above the art (R7)
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.9 · R7 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** `isolate`/`-z-10` do not trap menus, dialogs or tooltips under the band.
- **Preconditions:** `/` and `/settings` at 1440×900.
- **Steps:** Open AccountMenu, a Settings AlertDialog, and a Tooltip over the band; `document.elementFromPoint` at each overlay's centre.
- **Data:** —
- **Expected:** Each hit is inside its overlay element.

### TC-097b · Shell overlays paint above bottom tabs at 375 (R-1)
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · R-1 · EXE57 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04) · **Finding:** R-1
- **Objective:** The bottom tabs (fixed z-40, inside the isolated content column) never paint over or take taps meant for shell overlays below 768px.
- **Preconditions:** 375×800; `/`, `/disputes`, `/audit`.
- **Steps:** With nothing open, `document.elementFromPoint` at the centre of a non-current tab's bounding box, then tap there; open the disputes Filter side panel, the audit detail drawer and the tour confirm card, probing the same tab-centre point (the More tab's centre for the tour); close each and probe again.
- **Data:** —
- **Expected:** Closed: the hit is the targeted tab and the tap navigates to its href. Open: the hit is inside the dialog (the tour backdrop for the tour), never the Mobile nav.

### TC-098 · Clicks pass through the art (SC3)
- **Rel:** M-46.1 · TKT-46.02 · TASK-46.2 · 46.2.9 · SC3 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, d594918) · **Finding:** —
- **Objective:** The decorative layer never intercepts input.
- **Preconditions:** `/` at 1440×900.
- **Steps:** Pick a control inside the band area; `elementFromPoint` at its centre; click it.
- **Data:** —
- **Expected:** Hit element is not `[data-heritage]` or a descendant; the click takes effect.

## M-46.2 · Contract and gates

### TC-099 · heritageLevelFor maps every PRD §4 route
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.1 · F2 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 648be03) · **Finding:** —
- **Objective:** One table, exact levels.
- **Preconditions:** —
- **Steps:** `it.each` over the table, plus trailing-slash and `?q`/`#h` variants.
- **Data:** normal `/ /queue /disputes /invoices /payments`; reduced `/emails /settings /drafts /audit` and the detail routes (levels from 46.2.10); off `/e2e-harness`.
- **Expected:** Each returns its level.

### TC-100 · Unmapped routes default to reduced
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.1 · F2 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 648be03) · **Finding:** —
- **Objective:** A new route never gets full-strength art by accident.
- **Preconditions:** —
- **Steps:** `heritageLevelFor("/something-new")`, `heritageLevelFor("/a/b/c")`, `""`, and the near-miss names `/invoicesX`, `/queue-archive`, `/settingsx` (no prefix matching).
- **Data:** —
- **Expected:** `"reduced"`.

### TC-101 · Mobile fetches heritage art only on Home (F5)
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.5 · F5 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-05, fada8a8) · **Finding:** — TC-101b/c were updated for EXE109 (600px, 15 % at tablet) at 8a21f0b and passed in the full e2e run (495 pass).
- **Objective:** No mobile bytes off Home.
- **Preconditions:** Viewport 390×844.
- **Steps:** Load `/`, `/queue`, `/drafts` in fresh pages; record heritage requests.
- **Data:** —
- **Expected:** `/` requests the theme's `-strip` asset only; `/queue` and `/drafts` request none; `[data-heritage]` is `display:none` there.
- **Breakpoint guard (TC-101b, fix round R-4):** the heritage band's media conditions are Tailwind's md (48rem) and lg (64rem): mobile is the complement of md and tablet is md up to lg, with no `px` breakpoint. The test reads the conditions from the served CSSOM, because Lightning CSS lowers the source range syntax (`(width < 48rem)` → `not all and (min-width:48rem)`). It also checks the whole-pixel edges on `/queue`: 767 → `display:none`; 768 and 1023 → the 600px box; 1024 → not 600px (EXE109; was 300px). A fractional-width red is not possible because Chromium snaps viewports to whole CSS pixels, so the guard fails on the old `max-width:767px` queries instead.
- **Computed style (TC-101c, R-5):** `/drafts` at 1440 → `reduced`, opacity `0.6`; `/queue` at 800 → `normal`, height `600px`, `background-position` starting `15%` (EXE109; was 300px at 38%).

### TC-102 · Forced colors and print fetch nothing (F6)
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.5 · F6 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 0895326) · **Finding:** —
- **Objective:** The art disappears where it would harm legibility.
- **Preconditions:** `emulateMedia({ forcedColors: "active" })`, then separately `emulateMedia({ media: "print" })`, before navigation; each at 1440×900 and at 390×844 (R-1, where the mobile `display:block` on Home competes with the `!important` hide).
- **Steps:** Load `/`; record heritage requests; read computed `display`.
- **Data:** —
- **Expected:** Zero heritage requests; `display` is `none`.

### TC-103 · Switch-off renders an inert layer and fetches nothing (SC9)
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.1/46.3.5 · SC9 · **Type:** unit + e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 0895326) · **Finding:** —
- **Objective:** The one-line switch-off works.
- **Preconditions:** —
- **Steps:** Unit: `heritageLevelFor(route, false)` for every table route and an unmapped one. e2e: load `/e2e-harness` (level `off` by the table).
- **Data:** —
- **Expected:** Unit: all `"off"`. e2e: `[data-level="off"]`, `display:none`, zero heritage requests, no `data-idle` ever set.
- **Note (R-3):** the `data-idle` clause cannot fail until TASK-46.4 adds the idle preload. From then on it needs a MutationObserver or a wait past the rIC timeout to mean anything. **Done in 46.4 (5801e30, EXE61):** both the observer and a 4.5 s settle; passes in both projects.

### TC-104 · Auth routes do not mount the layer (F1)
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.5 · F1 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 0895326) · **Finding:** —
- **Objective:** ShellGate's bare auth routes stay bare. **Regression guard (R-6):** ShellGate already rendered these routes bare before 46.3, so this test passed before the change and guards against a future mount rather than proving new behaviour.
- **Preconditions:** Signed-out session state where needed.
- **Steps:** Load `/welcome`, `/sign-in`, `/sign-up`, `/onboarding`.
- **Data:** —
- **Expected:** `[data-heritage]` count 0; zero heritage requests.

### TC-105 · Route budgets hold with the heritage code (N2)
- **Rel:** M-46.2 · TKT-46.03 · TASK-46.3 · 46.3.6 (re-run 46.8.3) · N2 · **Type:** static · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 648be03; JS +301 B every route vs d7144cb, cumulative for 46.1–46.3; /settings 295.0 KB. CSS +412 B gzip after fix round 1 (shared chunk 16,868 → 17,280 B, `gzip -c`, base `3ilam13vdx2jo.css` vs `0tqku-bvfemwl.css`; the review measured +418 B before the range-syntax change). route-budget counts JS only, so the CSS delta is recorded here by hand. Whether to adopt this as the new A8 baseline is with the user.) · **Finding:** —
- **Objective:** The component and CSS cost ≤ 1.5 KB gzip per shell route.
- **Preconditions:** `pnpm build`; base route-budget numbers from A8.
- **Steps:** `pnpm route-budget`; diff per route against base.
- **Data:** Base: 18 routes ≤ 300 KB.
- **Expected:** Exit 0; each shell route delta ≤ +1.5 KB; `/settings` ≤ 300 KB.

### TC-106 · Exactly one other-theme request after idle (F4)
- **Rel:** M-46.2 · TKT-46.04 · TASK-46.4 · 46.4.1/46.4.4 · F4 · **Type:** unit + e2e · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, unit 540c696, e2e 5801e30; e2e TC-106b runs in both projects at 1440 (desk) and 390 (strip), with "after `data-idle`" by network start time, EXE61) · **Finding:** —
- **Objective:** Toggling is instant without double-fetching on first paint.
- **Preconditions:** Unit: fake timers. e2e: `/` in light.
- **Steps:** Unit: `scheduleIdleOnce` with rIC host (called once, `{timeout:4000}`) and without rIC (`setTimeout` 2500); cb runs once. e2e: wait for `[data-idle]`, wait 1 s, count requests for `heritage-dark-`.
- **Data:** —
- **Expected:** Unit as stated; e2e exactly 1 opposite-theme request, issued after `data-idle`.

### TC-107 · Save-Data skips the preload
- **Rel:** M-46.2 · TKT-46.04 · TASK-46.4 · 46.4.1/46.4.4 · F4 · **Type:** unit + e2e · **Pri:** P2 · **Auto:** Y · **Status:** Pass (2026-11-04, unit 540c696, e2e 5801e30 TC-107b) · **Finding:** —
- **Objective:** Respect data-saver users.
- **Preconditions:** e2e: `addInitScript` defines `navigator.connection = { saveData: true }`.
- **Steps:** Unit: host with `saveData: true`. e2e: load `/`, wait 5 s.
- **Data:** —
- **Expected:** Nothing scheduled; zero opposite-theme requests; no `data-idle`.

### TC-108 · Unmount before idle leaves no request and no error
- **Rel:** M-46.2 · TKT-46.04 · TASK-46.4 · 46.4.1 · **Type:** unit · **Pri:** P2 · **Auto:** Y · **Status:** Pass (2026-11-04, 540c696) · **Finding:** —
- **Objective:** The effect cleans up.
- **Preconditions:** Fake timers.
- **Steps:** `const cancel = scheduleIdleOnce(host, cb); cancel(); vi.runAllTimers(); cancel();`
- **Data:** Both rIC and setTimeout hosts.
- **Expected:** `cb` never called; no throw on double cancel.

### TC-109 · image-budget fails a desk asset over 60 KB
- **Rel:** M-46.2 · TKT-46.05 · TASK-46.5 · 46.5.1 · N1/SC5 · **Type:** unit · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-04, 3d55b6d · EXE91) · **Finding:** —
- **Objective:** The byte budget is enforced, not hoped for.
- **Preconditions:** —
- **Steps:** `checkBudget` with `heritage-light-desk.v1.avif` at 62 464 bytes (61 KB) and a 62 464-byte WebP. A file of exactly 61 440 bytes (60 KB, the limit) passes; the limit is inclusive (EXE91).
- **Data:** —
- **Expected:** `ok:false`; error names the file and its size and the 60 KB limit. `main()` exits 1 (46.5.4 demonstration).

### TC-110 · image-budget fails a strip asset over 25 KB
- **Rel:** M-46.2 · TKT-46.05 · TASK-46.5 · 46.5.1 · N1/SC5 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 3d55b6d) · **Finding:** —
- **Objective:** Mobile budget enforced separately.
- **Preconditions:** —
- **Steps:** `checkBudget` with a 26 624-byte strip.
- **Data:** —
- **Expected:** `ok:false` with the file named; a 25 600-byte strip passes.

### TC-111 · image-budget fails on a missing file
- **Rel:** M-46.2 · TKT-46.05 · TASK-46.5 · 46.5.1 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, 3d55b6d) · **Finding:** —
- **Objective:** A deleted asset cannot pass by absence.
- **Preconditions:** —
- **Steps:** `checkBudget` with 7 of 8 expected files; with 0 files.
- **Data:** —
- **Expected:** Both `ok:false`, listing the missing names.

### TC-112 · encode-heritage outputs the right sizes and formats
- **Rel:** M-46.2 · TKT-46.05 · TASK-46.5 · 46.5.3 · **Type:** unit · **Pri:** P1 · **Auto:** Y · **Status:** Pass (2026-11-04, da06ee9) · **Finding:** —
- **Objective:** The pipeline is reproducible.
- **Preconditions:** Synthetic 3360×1440 sharp image in a temp dir under `TMPDIR` (E Drive).
- **Steps:** `encodeHeritage(master, "light", { out })`; `sharp(file).metadata()` on each output; repeat with `width: 2000`.
- **Data:** —
- **Expected:** 4 files; desk 2400×1029 (2000×857 with `width`), strip 1200×480; formats `heif`/AV1 and `webp`; no ICC/EXIF.

### TC-113 · Text over the art meets contrast in light (SC1)
- **Rel:** M-46.2 · TKT-46.06 · TASK-46.6 · 46.6.3 · SC1 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The art never costs legibility.
- **Preconditions:** `chromium-light` project; light theme; widths 1440/768 (390 on `/`).
- **Steps:** For each non-off shell route: screenshot with `color: transparent !important` injected; for each text element in the text zone, take the 2nd-percentile background inside its box; compute contrast with its computed colour.
- **Data:** `src/test/lstar.ts` helpers.
- **Expected:** ≥ 4.5:1 body, ≥ 3:1 large text and UI glyphs, every element.

### TC-114 · Text over the art meets contrast in dark (SC1)
- **Rel:** M-46.2 · TKT-46.06 · TASK-46.6 · 46.6.3 · SC1 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** As TC-113 for dark.
- **Preconditions:** As TC-113 with dark set via `emulateMedia` + `verilane-theme=dark`.
- **Steps:** As TC-113, 98th-percentile background.
- **Data:** —
- **Expected:** As TC-113.

### TC-115 · Prominence stays inside the band per level (SC2)
- **Rel:** M-46.2 · TKT-46.06 · TASK-46.6 · 46.6.4 · SC2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Pass (2026-11-05, fada8a8) · **Finding:** — TASK-46.8 fix round 1 full e2e: 495 pass, 1 fail, 24 skip. The one fail is TC-146, an unrelated flake (confirmed).
- **Objective:** Visible but quiet, as designed.
- **Preconditions:** As TC-113, both themes.
- **Steps:** Outside the text zone compute P = (L\*canvas − L\*peak)/(L\*canvas − L\*text); inside it, peak L\*.
- **Data:** PRD §6.2 bands.
- **Expected:** light normal P ≤ 6.5 % (PRD §15 R1 fallback, approved TASK-46.8, EXE108; no lower bound); dark normal P 8–15 %; reduced P 4–8 % in both themes; light text-zone L\* ≥ 92.1; dark peak L\* normal 13–19.5, reduced 9.5–13. Applies at every width (1440, 768, 390).

### TC-116 · The contrast gate fails a too-dark fixture
- **Rel:** M-46.2 · TKT-46.06 · TASK-46.6 · 46.6.5 · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The gate can actually fail.
- **Preconditions:** `tests/e2e/fixtures/heritage/negative-dark.webp`.
- **Steps:** `page.route(/heritage-light-desk/)` to the fixture; run the SC1 assertion on `/`.
- **Data:** —
- **Expected:** The assertion throws (test passes by expecting failure).

## M-46.3 · Final art and ship

### TC-117 · Landmark accuracy signed off by the user (SC8)
- **Rel:** M-46.3 · TKT-46.07 · TASK-46.7 · 46.7.4 · SC8 · **Type:** manual · **Pri:** P0 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** No wrong or blended landmarks ship.
- **Preconditions:** Spend approved (46.7.1); candidates scored.
- **Steps:** Present the review pack; record the user's written pick and accuracy sign-off in HANDOFF.
- **Data:** Design §6.2 landmark list.
- **Expected:** Written sign-off naming the chosen light and dark masters.

### TC-118 · Rubric sheet complete for every candidate
- **Rel:** M-46.3 · TKT-46.07 · TASK-46.7 · 46.7.3 · **Type:** manual · **Pri:** P2 · **Auto:** N · **Status:** Not run · **Finding:** —
- **Objective:** Selection is evidence-based.
- **Preconditions:** Round complete.
- **Steps:** Check `gen/rubric.md`.
- **Data:** PRD §6.3 rubric.
- **Expected:** Every candidate has accuracy, composition, tone (measured L\*), bytes (encoded) and taste; rejects say why; spend per round recorded.

### TC-119 · Final assets pass the byte budget (N1/SC5)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.1 · **Type:** static · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The real art is within budget.
- **Preconditions:** Finals encoded; placeholders deleted.
- **Steps:** `pnpm image-budget`.
- **Data:** —
- **Expected:** Exit 0; 8 files; desk ≤ 60 KB, strip ≤ 25 KB.

### TC-120 · Final art passes SC1 and SC2 at every width and theme
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.2 · **Type:** e2e · **Pri:** P0 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** Tone is calibrated on the shipped files.
- **Preconditions:** Finals in place.
- **Steps:** `pnpm exec playwright test heritage-contrast.spec.ts`.
- **Data:** —
- **Expected:** TC-113–TC-116 green.

### TC-121 · Home LCP within ±5 % of base (N4)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.3 · N4 · **Type:** perf · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The art is never the LCP element and does not slow it.
- **Preconditions:** Base number from 46.1.2; same build type and machine.
- **Steps:** TC-083 run on `/`, 3 runs, median; read the LCP element.
- **Data:** Base JSON in scratch `baseline/`.
- **Expected:** Median within ±5 % of base; LCP element is not `[data-heritage]`.

### TC-122 · No layout shift from the art (N3)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.3 · N3 · **Type:** perf · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** CLS 0 from the layer.
- **Preconditions:** `/` and `/queue`, cold load.
- **Steps:** `PerformanceObserver("layout-shift", buffered)`; inspect `sources[].node`.
- **Data:** —
- **Expected:** No entry whose source is `[data-heritage]` or caused by it; total CLS not above base.

### TC-123 · No new axe violations (N5)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.3 · N5 · **Type:** a11y · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** `aria-hidden` art adds nothing to the a11y tree or violations.
- **Preconditions:** TC-080 suite.
- **Steps:** Run TC-080 at 1280 and 390; compare with base.
- **Data:** —
- **Expected:** Zero new violations; `[data-heritage]` has `aria-hidden="true"`.

### TC-124 · Art survives a cold offline reload (SW)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.4 · R5b · **Type:** e2e · **Pri:** P1 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The PWA keeps the art offline.
- **Preconditions:** `tests/e2e/heritage-pwa.spec.ts` with `serviceWorkers: "allow"`.
- **Steps:** Visit `/` online; wait for SW `activated`; `context.setOffline(true)`; reload; probe the computed heritage URL with `new Image()`.
- **Data:** —
- **Expected:** Image loads (`naturalWidth > 0`). Under path B a failure is reported to the user, not patched.

### TC-125 · Art is complete at the splash's last frame (SC7)
- **Rel:** M-46.3 · TKT-46.08 · TASK-46.8 · 46.8.5 · SC7 · **Type:** e2e · **Pri:** P2 · **Auto:** Y · **Status:** Not run · **Finding:** —
- **Objective:** The splash hands off to a finished background.
- **Preconditions:** TASK-45 merged; cold cinematic load.
- **Steps:** Wait for `html[data-splash=done]`; check the heritage image is decoded (`Image().decode()` resolves before or at that moment).
- **Data:** —
- **Expected:** Decoded at hand-off. If TASK-45 is not merged: **Blocked**, recorded in HANDOFF.
