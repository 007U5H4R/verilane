# Verilane — Design System (implementation reference)

> Stage 3 artifact, frozen 2026-10-30. The canonical problem statement is in [`../Discovery-PRD.md`](../Discovery-PRD.md) (S7), and the design rationale is in [`../Design.md`](../Design.md).
> **Source of truth for values:** the `:root` blocks of [`../.design/exploration/final/mockup.html`](../.design/exploration/final/mockup.html). This file maps those values into the stack (S8: Tailwind + shadcn/ui + Lucide). On any conflict the mockup wins, and this file gets fixed.

## 1. Tokens → CSS variables

Ship these exactly as written in `src/app/globals.css`. Map shadcn's semantic variables onto them; don't add a second palette.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#f8f7f3` | `#0f1613` | page background |
| `--surface` | `#ffffff` | `#17201c` | cards, row-cards, tables |
| `--surface-sunken` | `#f1efe8` | `#121a16` | table headers, KPI strip, filter panel, skeletons |
| `--border` | `#e4e1d8` | `#283531` | hairlines |
| `--border-strong` | `#cdc8bb` | `#3a4944` | inputs, secondary buttons |
| `--text` | `#17221c` | `#e7f0ea` | primary text |
| `--text-muted` | `#53605a` | `#a9b8b0` | secondary text (≥4.5:1) |
| `--brand` | `#1f7a4d` | `#3fae79` | one primary action per view, links, focus ring, active nav |
| `--brand-strong` | `#145c38` | `#6fcc9a` | primary hover |
| `--brand-tint` | `#e6f3ec` | `#173326` | Next-step callout, selected row |
| `--on-brand` | `#ffffff` | `#06140d` | text on `--brand` |
| `--rail` | `#0f3d29` | `#0a2419` | sidebar; also manifest `theme_color` |
| `--rail-active` | `#1c5a3e` | `#17402d` | active nav item |
| `--rail-text` | `#f3f8f5` | `#f3f8f5` | sidebar labels |
| `--rail-muted` | `#b9d4c5` | `#9fc2af` | sidebar headings, footer |
| `--high` / `--high-bg` | `#b3261e` / `#fbe9e7` | `#ff8a80` / `#3a1f1d` | High, failing check, error |
| `--med` / `--med-bg` | `#8a5a00` / `#fdf1dc` | `#e8b35c` / `#3a2e18` | Medium, needs review, warning |
| `--low` / `--low-bg` | `#3a6b52` / `#e8f2ec` | `#7fcba0` / `#16302a` | Low, passed, verified |
| `--disp` / `--disp-bg` | `#5b5f7a` / `#ececf2` | `#a9acc9` / `#23263a` | Disputed / excluded |
| `--disabled-bg` / `--disabled-text` | `#ebe8e0` / `#6b736e` | `#222c28` / `#93a29a` | disabled-with-reason (no hover change) |

**Theme selection:** dark applies under `prefers-color-scheme: dark` unless the user picked Light, and always when they pick Dark (`[data-theme]` on `<html>`).

**shadcn mapping:**
- `--background`→`--canvas`
- `--card`/`--popover`→`--surface`
- `--muted`→`--surface-sunken`
- `--muted-foreground`→`--text-muted`
- `--primary`→`--brand`
- `--primary-foreground`→`--on-brand`
- `--border`/`--input`→`--border`/`--border-strong`
- `--ring`→`--brand`
- `--destructive`→`--high`

## 2. Type

| Role | Stack | Use |
|---|---|---|
| `--font-display` | `"Iowan Old Style","Charter","Source Serif 4",Georgia,serif` | page h1, KPI values, document-card amount **only** |
| `--font-ui` | `ui-sans-serif,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif` | everything else; weights 400/500/600 |
| `--font-mono` | `ui-monospace,"SF Mono",Menlo,Consolas,monospace` | invoice numbers, provenance lines, references |

- **No webfonts.** System stacks keep the offline shell and first paint cheap.
- **Scale:** 12 (min) / 13 / 14 (base) / 16 / 20 / 28 / 34px.
- **Line height:** headings 1.15, body 1.5.
- **Money:** `font-variant-numeric: tabular-nums` on all money.
- **Prose:** capped at about 70ch.

## 3. Shape, elevation, spacing

| Token | Value | Use |
|---|---|---|
| `--r-lg` | 14px | row-cards, task-feed items, document card, evidence groups, chart cards |
| `--r-md` | 10px | inputs, segmented controls, logo card, callouts |
| pill | 999px | all buttons, priority/status chips |

- **Shadow:** one soft shadow, used only on menus, popovers, dialogs and toasts.
- **Spacing:** 4px base. Mobile gutter 16px. Queue row-card height 64px. Touch targets ≥44px (48px on the mobile tab bar).
- **Never:** glass, gradients or glow.

## 4. Logo

Use `public/brand/verilane-logo.png` as supplied. **Never redraw, recolour, crop or stretch.**
- **In the app:** it always sits on a white card (`#fff`, `--r-md`, padding 8×10px), max width 150px (104px in the mobile top bar), in both themes.
- **PWA icon:** the mark centred on a white safe-zone square inside a `--rail` maskable frame (Design.md §13.6).

## 5. Breakpoints & shell

| Width | Shell |
|---|---|
| ≥1280 | 216px rail sidebar + sticky top bar; Investigation in two columns |
| 1024–1279 | same shell; Home and Investigation in a single column |
| 768–1023 | 72px icon rail (tooltip + `aria-label`); queue rows become two-line cards |
| <768 | top bar + 4-item bottom tabs (Home · Queue · Disputes · More) |

Nav order: Home · Queue · Disputes · Payments · Drafts · Audit log · Settings (D3). Nothing scrolls horizontally at 1440 / 1280 / 768 / 390.

## 6. Components (Design.md §14 has the behaviour)

| Component | Build on | Key rule |
|---|---|---|
| Priority / status chip | shadcn `Badge` | dot or icon **and** text label, never colour-only |
| Queue row-card | TanStack Table rows rendered as cards | the whole row is one link; one shared column header; collapsible "Hide filters" panel |
| Task-feed item | native `<details>` | count + verb summary; links into the filtered queue |
| KPI strip | plain markup | four sunken cells, serif value, 12px label |
| Action bar | shadcn `Button` (pill) | exactly one primary; disabled-with-reason shows the reason inline |
| Next-step callout | plain markup | `--brand-tint`, one sentence |
| Document card | plain markup | From → To, serif amount, score with its factors |
| Evidence table | plain `<table>` | provenance line `Source · Row/Email · Field` in 12px mono under every value |
| Pre-approval checks | `<details>` list | "N of 9 passed"; failing checks first and expanded |
| Activity log + note | list + `Textarea` | audit trail, not chat |
| Approve confirm | shadcn `AlertDialog` | names the invoice, customer and amount |
| Toast | shadcn `Sonner` | truthful action text, including "(simulated)" |
| Banners (storage fallback, offline) | shared `Banner` | one pattern for both |
| Charts | Recharts | the two charts in Design.md §15 only; labelled legends; every bar links into the queue |

Icons: Lucide, 1.5px stroke, 16px inline / 20px standalone.

## 7. Motion & states

- **Motion:** state changes only (hover, focus, disclosure, toast), about 150ms, matching the mockup's `.15s`. Under `prefers-reduced-motion`, all transitions and animations are off. Scrolling is native.
- **States:** every data view designs loading (skeleton on `--surface-sunken`), empty, error and working states (Design.md §18). The mockup's States panel is the visual reference.

## 8. Verification hooks (for Stages 5–8)

- axe in both themes.
- Playwright overflow check at the four widths.
- The `impeccable detect` design checker run on the built UI in Stage 7.
- A contrast test asserting the token pairs above stay ≥4.5:1 for text, which turns this table into a mechanical guard.
