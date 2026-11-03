# TASK-45 storyboard (transcribed from the user's image)

The user pasted the storyboard image in chat on 2026-11-02. The image file is not stored in the repo, so this is a faithful transcription of it. Header: "Splash Animation Storyboard — Lighthouse Reveal with Moving Clouds — SaaS Loading Experience". Total duration ~6.0s. Style: Clean · Premium · Subtle.

## Look (constant across frames)
- The scene is deep emerald green: a dark sky gradient over layered rolling green hills/waves in the lower third.
- A white/cream lighthouse with a green lantern cap stands at the right edge (about 85% x), rising from the hills.
- Two soft, dark-green, flat-shaded clouds: a small one at the top centre-left and a larger one at mid-left near the hills.
- The beam is a warm yellow-white wedge projecting leftward from the lantern, about 35–45° spread, with a soft gradient.
- The logo is a bright emerald "V" mark plus a white "Verilane" wordmark, centred slightly left at mid-height. The tagline "AR Collections Copilot" sits under it in small white type.
- The progress bar is a rounded pill near the bottom centre, in bright emerald on a dark track.

## Frames
| # | Time | What happens |
|---|---|---|
| 01 | 0.0–0.5s | Scene fades in: the landscape, hills and lighthouse appear softly. The clouds begin a slow, subtle drift (left → right). |
| 02 | 0.5–1.0s | The lighthouse light turns on with a gentle glow (anticipation). The clouds continue drifting right (~5–8% of screen width). |
| 03 | 1.0–1.8s | The beam expands smoothly from the lighthouse towards the left. The clouds glide at a steady, slow pace (parallax depth). |
| 04 | 1.8–2.5s | The "V" mark fades in and sharpens as the light passes over it. The background clouds continue their gentle motion. |
| 05 | 2.5–3.2s | The "Verilane" wordmark fades in to complete the logo. The beam holds softly. The clouds keep drifting (continuous, subtle). |
| 06 | 3.2–4.0s | The product descriptor "AR Collections Copilot" appears with a gentle fade-up. The scene feels settled and confident. |
| 07 | 4.0–5.5s | The loading progress animates smoothly from 0% to ~90% (ease-out). The cloud motion continues in the background. |
| 08 | 5.5–6.0s | The progress completes and holds briefly, then the splash transitions smoothly to the app (fade or quick slide, 200–300ms). |

## Animation timeline (layers)
| Layer | Active span |
|---|---|
| Scene fade (background + hills) | 0.0–6.0s |
| Clouds (looping drift) | 0.0–6.0s |
| Lighthouse glow | ~0.4–1.1s |
| Light beam (sweep) | ~0.8–1.8s |
| V mark (logo) | ~1.4–2.0s |
| "Verilane" text | ~2.0–2.6s |
| Tagline | ~2.6–3.2s |
| Loading progress | ~3.2–4.3s (the bar on the chart; the frame text says 4.0–5.5s) |

## Cloud motion detail
- Two cloud layers with slight parallax.
- Foreground cloud: slower, ~10–15px over 6s.
- Background cloud: faster, ~20–30px over 6s.
- The drift is continuous, linear or ease-in-out.
- Subtle and non-distracting (loop-ready).

## Key animation values
| Property | Value |
|---|---|
| Total duration | ~6.0 seconds |
| Easing | ease-out (primary), ease-in-out (secondary) |
| Cloud motion | Rightward drift, 5–10% of screen width over 6s |
| Light beam | Smooth expand, soft gradient, ~35–45° spread |
| Logo reveal | Fade (V) + fade (wordmark), no bounce |
| Loading bar | 0% → 100%, smooth fill (ease-out) |
| Transition | Fade or slide to the app (200–300ms) |

## User decisions (2026-11-02)
- **The loading bar stays, tied to real loading.** Real lifecycle phases fill it up to about 90%. It completes only when the app is ready, so it may jump or stall. It is never a scripted timer. This replaces the Solution-PRD's "no percentage" decision.
- **Parallax is corrected.** The foreground cloud moves faster than the background cloud, with the storyboard's speeds swapped.

## Internal inconsistencies in the source (for Stage 3 to resolve)
1. **The loading bar conflicts with the approved Solution-PRD.** The PRD has no percentage or progress bar, because the bar would be fake: the cinematic is guaranteed to last ~6s regardless of real loading. The user must decide whether it stays.
2. **The progress timing differs between the frame text and the layer chart**: 4.0–5.5s versus ~3.2–4.3s.
3. **The cloud distances disagree**: 10–30px over 6s versus "5–10% of screen width" (about 70–140px at 1440 wide).
4. **The parallax is inverted**: the foreground cloud is listed as slower than the background cloud. Normal depth cues run the other way.
5. The beam points left and is static after it expands. Frame 04's "as the light passes over it" implies a sweep, whereas the Solution-PRD has a sweep period of ≥3s.
