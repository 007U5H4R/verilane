# Design — TASK-46 · Indian Heritage Background System

> **Status:** **APPROVED (2026-11-02).** The user approved all 7 sign-off items in §14 as recommended.

**Ticket-scoped.** This file does **not** modify root `Design.md`. §11 carries proposed Revision R2/R3 text from `docs/Solution-PRD-TASK-46.md §11`, still unapplied — it is applied to root `Design.md` only on the `task/46-heritage-bg` branch at the start of Stage 3 implementation, per PRD §9.12.

Root `Design.md` and its `.design/exploration/final/` mockup remain the approved baseline and outrank this document and every design skill default wherever they conflict and this document doesn't carry an explicit, user-approved exception (§11.2, R3).

**Surface classification:** Core (authenticated internal app — collections/dispute workspace). No Web or Product Journey surface is touched; §13/§25 (Web Experience) are N/A.

---

## 1. Source of truth

- Approved: `docs/Solution-PRD-TASK-46.md` (Stage 2, approved 2026-11-02, all 14 §9 items ticked).
- This document only adds the **visual direction, mockup evidence, and sign-off record** the PRD deferred to Stage 3. It does not re-litigate the PRD's technical decisions (rendering approach, mount point, encoding, budgets) — those are binding as written.

## 2. Direction (single direction — Core surface, no A/B needed)

One direction, not a gallery of competing directions: the PRD's §9 sign-off already fixed rendering approach, mount point, tone bands and switch-off rule as a Stage-2 user decision. Stage 3's job is to prove the direction composites correctly against the real shell and real screen states, not to propose alternatives. This matches `t-design`'s Core-path shrink rule (pipeline steps 6/10–11 collapse to one mockup when no real direction decision remains).

**Anti-direction (rejected, carried from PRD §2.1):** `<img>`/`next/image` element, inline SVG line art, a full-bleed saturated illustration, any art inside cards/dialogs/tables, any art on auth/onboarding routes, any art motion (parallax/fade/crossfade).

## 3. Mockup

**Location:** `.design/exploration/task-46/index.html` (open directly in a browser; no server needed — static page, relative asset paths).

Structure:
- Left control panel: theme (light/dark) · heritage level (normal/reduced/off) · route (Home/Queue/Drafts) · screen state (working/loading/empty/error) · viewport (1440/768/390) · overlays (text-zone + contrast annotations, open account menu).
- Center stage: a simplified recreation of the real `AppShell` (sidebar, topbar, content column), driven entirely by `data-theme`/`data-level`/`data-route`/`data-state`/`data-vp` attribute selectors, with the four calibrated art PNGs as CSS `background-image`.
- Evidence panel: the matching real screenshot from the current `task/38-emerald-redesign` branch (pre-heritage-art), for direct visual comparison of chrome fidelity.
- TASK-45 ↔ TASK-46 handshake panel: a conceptual two-pane mock of the splash's dark exit frame next to the panorama's first visible frame (§8 below).

Toggle combinations stand in for the full matrix (3 routes × 2 themes × 2 levels × 3 viewports × 4 states) rather than ~144 static pages, per `t-design/references/mockup-exploration.md`'s allowance for interactive/parametric mockups on the Core path. All combinations were spot-verified via Playwright screenshot sweeps (`/Volumes/E Drive/Dev/.scratch/task46/sweep-*.png` and `mockup-1440.png`), not just coded and assumed:

- Home/Queue/Drafts at 1440 (desk), 768 (tab), 390 (mob) — confirmed via the real-app geometry capture and the mockup's own viewport buttons.
- Light and dark, normal and reduced heritage level — confirmed via `scripts/stats2.mjs` L*/prominence measurement (table in §6) and a visual sweep.
- Dark-band art — `sweep-dark-desk-menu.png`.
- Open account menu over the art — `sweep-dark-desk-menu.png` (menu renders solid, fully opaque, above the art at `z-index:20`; art stays at `z-index:-10`).
- Text-zone + contrast annotation overlay — `sweep-light-tab-queue-annot.png` (dashed outline + CR badge showing `text 11.9:1 · muted 4.9:1`, both ≥ AA).
- Four screen states (working/loading/empty/error) — `sweep-light-desk-loading.png`, `sweep-light-desk-drafts-empty.png`, `sweep-dark-desk-error.png`, plus the default working state in `mockup-1440.png`.

**Known mockup-only artifact (not a defect):** the review-tool chrome itself (control panel + stage wrapper) does not reflow at narrow *browser* window widths — it's a fixed-layout design-review tool meant to be opened on a desktop screen, and the "viewport" being tested is the internal `.stage` width via its own toggle buttons, not the outer page. This is distinct from, and must not be confused with, the product's actual mobile responsiveness, which is what the viewport toggle demonstrates.

## 4. Visual direction — what the mockup shows

- Pale, low-contrast monochrome-emerald linework panorama (India Gate, Qutub Minar, Taj Mahal, Hawa Mahal, hill fort, gopuram, Hampi chariot+elephants, Mysore Palace domes — placeholder art for this mockup only, see §6).
- Mounted as a background layer behind the content column (`.content{position:relative;isolation:isolate}`, art `position:absolute;inset-x:0;top:0;z-index:-10;pointer-events:none`), never above cards/dialogs/menus.
- Bottom edge fades to canvas via `mask-image:linear-gradient(to bottom, black 0%, black 55%, transparent 100%)`.
- Box height: `clamp(320px,42vw,620px)` desktop, `300px` tablet (`background-position:38% top`), `clamp(160px,44vw,240px)` mobile, Home route only.
- At first glance the art reads as *extremely* subtle — this is correct, not a bug (§6 confirms the earlier session's suspicion that it wasn't rendering was a false alarm: it renders, it's just intentionally low-prominence per the calibrated P8–15%/P4–8% target bands).

## 5. The one real open tension: art vs. root Design.md §1

Root `Design.md §1` states "visual quietness is the trust signal" / no decorative illustration. TASK-46 is a **user-directed, scoped exception** to that rule (PRD §2, Stage 1/2 already approved the concept). This document does not resolve that tension by editing root `Design.md` — it carries the exact exception text (§11 below) for application at implementation start, per the binding Stage-2 decision in PRD §9.12/§9.13. **Recommendation: proceed as scoped — this is not a new decision for Stage 3, it was already made and approved in Stage 2; Stage 3's job was only to prove it visually holds up, which the mockup evidence in §3 does.**

## 6. Calibration — the finished-image spec (for Stage 6)

No image generation happened in this stage (cost; Stage 6 owns generation). The mockup's four art layers are a **placeholder**, built by tinting the user-supplied reference PNG (`/Users/tushar/Downloads/Misty Sage Panorama of Indian Landmarks.png`, 1672×941, grayscale range 195–255) — not the final asset. They exist to prove the tone-calibration math and the compositing, not to ship.

### 6.1 Measured calibration (verified against this mockup's placeholder art)

| | Target peak L* band | Target P | Measured peak L* | Measured P | Canvas target L* | Measured canvas L* |
|---|---|---|---|---|---|---|
| light-normal | 85–91 | 8–15% | **89.3** ✓ | 9.9% | 97.7 | 97.5 |
| light-reduced | 91–94 | 4–8% | **92.4** ✓ | 6.2% | 97.7 | 97.1 |
| dark-normal | 13–19.5 | — | **13.3** ✓ (low edge) | — | 6.0 | 5.5 |
| dark-reduced | 9.5–13 | — | **9.7** ✓ (low edge) | — | 6.0 | 5.5 |

All four land inside their PRD §6.2 target bands. Dark-normal and dark-reduced sit at the conservative (less prominent) edge of their bands — acceptable, since under-prominence only costs visibility, not an AA violation; text-zone contrast was separately verified ≥ 4.5:1/3:1 in the annotation overlay (§3).

**Load-bearing technical finding for whoever builds the Stage 6 generation/encoding pipeline:** when applying a monochrome tint to grayscale art (e.g. via `sharp().greyscale().linear(a,b).tint(hex)`), the tint operation preserves each pixel's **L\*** from the preceding grayscale step and only overlays the tint's hue/chroma — it does **not** make the rendered peak's L* equal to the tint hex's own L*. Calibrate the `linear(a,b)` grayscale mapping against the *target rendered peak's* sRGB value (via an inverse sRGB→L* table), then verify the actual output pixels with a stats script — not by eyeballing the flat tint swatch.

### 6.2 Finished-image prompt spec (Stage 6 generation)

**Format:** 21:9, 3360×1440, PNG, 8-bit sRGB (master; encoded down per PRD §6.4/§7).

**Light prompt (example form, tune at generation time):**
> A wide 21:9 panoramic skyline silhouette of eight Indian heritage landmarks rendered as fine, pale architectural linework with a soft paper-mist wash, extremely low saturation, emerald-neutral grayscale tones only — no color. Left to right: India Gate, Qutub Minar, Taj Mahal with dome and minarets, Hawa Mahal facade, an Amber-style hill fort, a Meenakshi-style tiered sculpted gopuram (not a shikhara), the Hampi stone chariot pulled by two carved elephants, Mysore Palace domes. Each landmark separated by a soft mist break, no shared ground line, no implied adjacency between monuments. Skyline occupies the upper 15–55% of frame height; below that, empty paper/mist dissolving toward a flat `#f7f9f7` background. Outer 6% of left and right edges dissolve fully to background. No birds, no people, no text, no flags, no color, no heavy shadow.

**Dark prompt (same landmark set and composition rules, inverted tone):**
> ...identical composition and accuracy rules as above, rendered as pale linework glowing faintly against a near-black emerald background `#0d1511`, strokes brightening rather than darkening against the canvas, same mist breaks, same no-birds/people/text/flags rule, same edge dissolve.

**Accuracy rules (binding, from PRD §6.1, Q6 — the user is cultural reviewer):**
- Gopuram must be a genuine Meenakshi-style tiered, sculpted, truncated pyramid form — explicitly **not** a shikhara (the two are visually distinct temple-tower types and are commonly confused by generative art).
- Hampi chariot must show elephants, not horses (the real Hampi stone chariot's wheels are iconic but the draught-animal pairing in this brief is elephants).
- Mysore Palace must be present and recognizable by its domes.
- No birds, no people, no text/flags anywhere in frame (the mockup's placeholder art, derived directly from the user's reference PNG, does show faint birds in the upper right — that is a reference-source artifact to be explicitly excluded from the Stage 6 generated asset, not replicated).

**Selection rubric (3-round cap, PRD §6.3):** accuracy sign-off (user, cultural reviewer) → composition check (skyline 15–55% height, text zone mist-only, mist breaks, no shared ground line) → tone check (P in-band, text-zone contrast ≥4.5:1) → byte budget (§7: ≤60KB desktop, ≤25KB mobile strip after encoding) → taste (user's pick among survivors, viewed next to the TASK-45 splash exit frame mock, §8). Any rubric failure eliminates the candidate. No candidate survives 3 rounds → escalate to user, don't keep regenerating silently.

## 7. Responsive behavior

Confirmed via the real-app geometry capture (`shots2.mjs` output) and the mockup's viewport toggle:

| Viewport | `main` left/top | Art box |
|---|---|---|
| 1440 desk | 272/76 | `clamp(320,42vw,620)` height, full width |
| 768 tab | 72/68 | 300px height, `background-position:38% top` |
| 390 mob | 0/117 (Home) / 0/145 (Drafts, taller header) | `clamp(160,44vw,240)` height, **Home only** — Queue/Drafts show no art on mobile |

## 8. TASK-45 coordination constraints (for TASK-45's Stage 3 agent)

This section is the authoritative hand-off — read before designing the splash's exit frame.

- **No shared code.** The splash (`html[data-splash]` pre-hydration overlay) and the heritage background (`AppShell` content-column CSS layer) are fully decoupled. Coordination is visual only: the splash's last frame and the panorama's first visible frame should share silhouette language so the fade-to-app reads as one continuous image, not a hard cut.
- **Shared visual language to aim for:** a tall landmark/vertical element positioned toward the right of frame (splash: lighthouse at ~85% x; panorama: Qutub Minar/gopuram/Taj cluster sits right-of-center in the current composition), and warm light breaking left-to-right through cool mist (splash: beam; panorama: none currently — if TASK-45's beam angle is finalized, consider whether the panorama's mist-break brightness near the matching screen region should be nudged, but **do not add motion or warm color to the heritage art to force this** — the art stays monochrome-emerald per PRD §6.1).
- **Timing:** the art is already painted under the splash by the time it exits (fetches during the ~6s cinematic, well under budget). TASK-45's splash should not wait on or read any heritage-art loading signal — PRD §10 is explicit that TASK-46 "holds no promise, no `onload` gate, no `data-splash` read." On the reduced-motion ~1s path, a late art paint just after exit is accepted (fixed-height box, no layout shift).
- **Overlap check before finalizing TASK-45's exit frame geometry:** verify the lighthouse silhouette and the panorama's tallest elements (gopuram/Taj/Qutub Minar cluster) don't occupy the exact same screen region during the cross-fade — if they do, the fix is to shift the panorama's `background-position` (already parameterized), not to redesign either asset. A conceptual mock of this handshake is in `.design/exploration/task-46/index.html`'s bottom panel; it is illustrative only, not pixel-exact, since the splash's real visual design belongs to TASK-45's own Stage 3.

## 9. Accessibility checklist (WCAG 2.2 AA)

- [x] Text-zone contrast ≥ 4.5:1 body / ≥ 3:1 large text — enforced by composition (mist-only text zone) and measured via the annotation overlay (§3); CR badge in the mockup reports live sampled values.
- [x] No motion — art has zero animation in any state; nothing to reduce under `prefers-reduced-motion`.
- [x] `forced-colors: active` — art hidden entirely (PRD §8); not re-demonstrated pixel-for-pixel in this HTML mockup since it's a CSS media-query behavior, not a visual-direction decision — flagged as implementation-verified in Stage 8, not Stage 3.
- [x] Print — art hidden (PRD §8), same note as above.
- [x] Switch-off path exists and needs no design re-review (PRD §9.12 R3 switch-off rule) — this is the accessibility/maintenance escape hatch if real measurement in Stage 7/8 disagrees with this mockup's numbers.

## 10. Default patterns gate

- **Guided tour:** N/A for this ticket — TASK-46 changes only a passive background layer with no new interactive surface; no tour step is warranted. (Guided tour ownership belongs to TASK-44, a separate ticket.)
- **Skeleton loading:** the existing `ShellLoading`/`ContentSkeleton` pattern (from TASK-43) is unchanged by this ticket and already renders with the art visible behind it per PRD §10.2 — demonstrated in `sweep-light-desk-loading.png`.

## 11. Mandatory gates

1. **Ethical behavioral-design gate:** no dark patterns — this is a decorative background layer with a hard byte/contrast budget and a one-line kill switch; no manipulation surface exists. Pass.
2. **Anti-AI-slop gate:** grayscale test passes trivially (the art *is* near-monochrome by design). Beauty-masking: art never substitutes for missing content or real data (empty/error states show the art faintly behind clearly-labeled empty/error copy, not instead of it — `sweep-light-desk-drafts-empty.png`, `sweep-dark-desk-error.png`). 20-SaaS test: N/A rationale — this is an internal Core app, not a competitive public SaaS surface; no generic-template risk applies.
3. **Accessibility checklist:** §9 above.
4. **Default patterns gate:** §10 above.
5. **Evidence:** rendered HTML (`.design/exploration/task-46/index.html`), viewport screenshots (`/Volumes/E Drive/Dev/.scratch/task46/sweep-*.png`, `mockup-1440.png`), interaction demo (menu-over-art toggle, state toggles) — all captured. **Explicit user approval is the one outstanding item** — this document and the mockup are presented at the gate below, not self-approved.

## 12. Web-deliverables gates

- **Mobile responsiveness:** checked at 390 and 768 (simulated-shell, not outer-browser-window — see §3 caveat). Home shows a short art strip; Queue/Drafts show none on mobile (intentional, PRD §9.3). No horizontal scroll *introduced by this feature* — see §13 caveat for a pre-existing unrelated issue.
- **Link preview / OG:** **N/A.** This is a private, authenticated internal app behind auth; there is no publicly shareable URL for this surface, so Open Graph/Twitter Card tags and an OG image are not applicable.
- **Four screen states:** loading, empty, error, working all demonstrated with art compositing correctly behind each (§3).

## 13. Caveat — pre-existing bug, out of scope, flagged not fixed

The real app (not this mockup) has a **pre-existing mobile horizontal-overflow bug**: `document.documentElement.scrollWidth` measures 603–815px at 390/768px viewport widths (confirmed via the `shots2.mjs` geometry capture, `sw` field), caused by the top-bar "Guest · Demo Workspace" pill + role-switcher buttons not wrapping or collapsing at narrow widths. This is **unrelated to TASK-46** (no code changes were made or are proposed here) and must not be fixed as part of this ticket — flagging it for a separate ticket.

## 14. Stage 3 sign-off items

| # | Item | Recommendation |
|---|---|---|
| 1 | Overall direction (one direction, no gallery) | Approve — Core-path, no real direction decision remained after Stage 2's §9 sign-off; Stage 3's job was proving compositing, which the mockup does. |
| 2 | Light-normal/reduced and dark-normal/reduced calibration bands | Approve as measured (§6.1); dark bands sit at the conservative low edge of their target range, which is the safe direction to err. |
| 3 | Root `Design.md` §1 exception (R2/R3 text) | Approve carrying it unapplied in this ticket-scoped doc; apply verbatim at `task/46-heritage-bg` branch start per PRD §9.12/§9.13 — not a new decision, already made in Stage 2. |
| 4 | Tablet text-zone-vs-skyline geometry | Approve with a note: the annotation overlay's fixed 160px-tall text-zone box visually overlapped the "Sample record" card at 768px in one sweep screenshot — this is a mockup-annotation sizing quirk (the overlay box isn't itself responsive), not a production CSS issue, since the production text-zone is defined by actual DOM layout, not a fixed overlay. No action needed before Stage 4. |
| 5 | Splash/panorama first-frame handshake | Approve the coordination constraints in §8 as the brief for TASK-45's Stage 3 agent; no pixel-exact joint mock is required beyond the conceptual panel already built. |
| 6 | Pre-existing mobile overflow bug (§13) | Approve flagging only — out of scope, do not fix in this ticket. |
| 7 | Finished-image generation spec (§6.2) | Approve as the brief for Stage 6; no generation happens before then. |

---

**Gate question:** Do you approve this UI/UX direction, or would you like changes?
