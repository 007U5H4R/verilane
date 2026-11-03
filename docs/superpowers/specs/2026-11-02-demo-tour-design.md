# Demo tour — design

Date: 2026-11-02 · Status: approved 2026-11-02 · Owner: Tushar

## Intent and why

Verilane is a portfolio demo. Today, showing it means being in the room to explain where to click and why it matters. The demo tour lets Tushar **send someone a link and have them walk the whole product alone**, with a short pitch at every step.

The belief the viewer should leave with (Tushar's words):

> "Verilane helps me collect smarter, not just chase harder — and I can trust why it recommends every action."

Its three pillars:

- **Business value:** better decisions, not just automated reminders.
- **Trust:** evidence behind every recommendation.
- **Control:** AI assists, humans decide.

The feeling it should leave: *"I finally have clarity and control over my receivables, without blindly trusting AI."*

## Goals

- There is one guided tour of the whole app, and it includes the Copilot autopilot chapter. There is no separate autopilot tour.
- A cold visitor opening the demo link (`?tour=1`) goes **straight into the tour**. The tour starts a guest session and skips /welcome.
- A **Demo** button in the top bar is always visible and starts or restarts the tour for anyone already in the app.
- **Guided prompts only:** the tour points and explains, and the viewer performs every action. The tour never clicks, types or navigates on the viewer's behalf. The one exception is the confirmed reset at the start (see below).
- It works at 375px, 768px and desktop, in light and dark themes.

## Non-goals

- No auto-play or "drive the app for me" mode.
- No voice-over or video.
- No analytics on how far viewers get.
- No tours for disputes, payments, emails or settings beyond autopilot.
- No editing of tour content without a code change.

## Anti-goals (failure even if it "works")

- **A viewer gets stuck:** the step waits for an action they can't find, or the target isn't on screen. Every step must always offer Next/Skip, and must tell the viewer how to get to the target.
- **Fake data or a fake UI:** the tour must run on the real screens and the real seeded data.
- **Silent destruction:** the reset happens only after the viewer confirms it.
- **Autopilot looks like the AI acting unchecked:** the pitch must always frame it as "you set the rules".
- **Perceived slowdown:** it must not bloat the app for people not taking the tour. The tour code loads only when started, and existing route budgets (TC-083) must not regress further.

## Decided by Tushar

| Decision | Choice |
|---|---|
| Scope | Whole-app tour, one tour, autopilot chapter included |
| Mechanism | Guided prompts only; the viewer does the actions |
| Entry | Top-bar Demo button, always visible; plus a shareable link |
| Audience | Someone sent a link, running it alone |
| Visual style | **Spotlight**: dim the page, ring the exact element, callout beside it (mockup option B) |
| Data | The tour **resets the demo data** at the start |
| Cold link | Goes straight into the tour as a guest, with no /welcome screen |

## The steps

There are three acts, which map to the three pillars. The copy is draft; Tushar may edit it.

1. **Queue · Who matters today.** *"Most collections tools chase everyone, harder. Verilane ranks every open invoice by what is actually at stake: how late it is, how big it is, and whether the customer has broken a promise."*
   - Spotlight: the ranked list.
   - Advances on: Next.
2. **Queue · Who not to chase.** *"Sometimes the smartest action is to not send a reminder. This customer says they've already paid and the ledger hasn't caught up yet, so Verilane holds the invoice for reconciliation instead of sending an awkward reminder."*
   - Spotlight: the INV-D "Hold – reconcile" row.
   - Advances on: Next, which then asks the viewer to open INV-A (the top row).
3. **INV-A · The why, with receipts.** *"Here is why this invoice is at the top: it is 47 days late, the amount is ₹3.4L, and the customer missed a payment date they promised. Each reason links to the email it came from."*
   - Spotlight: `priority-reason` and its provenance.
   - Advances on: the viewer clicks **Generate draft** (a draft exists for INV-A).
4. **INV-A · Nothing leaves without evidence.** *"Copilot wrote the reminder, but before anyone can send it, the draft is checked nine ways: the amount, the dates, the payments and the tone are all compared against your ledger. A draft that fails any check can't be approved."*
   - Spotlight: `checks-summary` ("9 of 9 passed").
   - Advances on: the viewer submits for approval (the draft status is awaiting approval).
5. **INV-A · A person signs off.** *"AI drafts, and a person decides. Nothing goes to a customer until someone with the right authority approves it. Switch to Manager, the senior person, and approve it."*
   - Spotlight: first the role switcher (Manager), then the Approve & send action on the invoice (Investigation) page, not /drafts. Only a Manager sees "Approve & send" (`primaryAction()` in `src/components/investigation/draftActions.ts`); an Analyst only ever sees "Submit for approval".
   - Advances on: the INV-A draft is sent (simulated) by a human.
6. **Settings · You set the rules.** *"Want to stop clicking approve on every small reminder? As a Manager, you can let Copilot send the lowest-risk ones by itself. The draft has to pass all nine checks and stay under a cap you choose, and switching it off takes one click."*
   - Spotlight: the `autopilot-control` card. The viewer is already a Manager from step 5.
   - Advances on: the autopilot policy is enabled (default cap ₹50,000).
7. **INV-B · Watch Copilot work.** *"Now switch back to Analyst, the person doing the day-to-day work. Here is a ₹40,000 reminder that passes every check. Submit it, and Copilot sends it within a second, under the rules you just set. Anything over the cap, or anything with a failed check, waits for a person and shows the reason."*
   - Spotlight: the role switcher (Analyst), then Generate draft, then Submit for approval.
   - Why the switch back: a Manager only gets "Approve & send", which would be a human send. Autopilot only picks up drafts that were *submitted* (status `validated`).
   - Advances on: the INV-B draft is `sent_simulated` with `sent_by: "copilot"`.
8. **Audit Log · Clarity and control.** *"Your approval and Copilot's send are both in the log, each with who did it, why, and the evidence behind it. Verilane gives you clarity and control over your receivables, without blindly trusting AI."*
   - Spotlight: the human send row and the "Auto-sent by Copilot" row.
   - Advances on: Finish, which closes the tour and offers "Restart demo".

### Step behaviour

- **Role switches** are part of the story (Tushar's call, 2026-11-02): no app behaviour changes. The viewer starts as Analyst, becomes Manager in step 5 to approve, and goes back to Analyst in step 7. Each switch is its own prompt that spotlights the role switcher and advances when `meta.role` changes.
- **Action steps** (3–7) advance by themselves once the real data change lands. Completion is detected from the database state (Dexie live queries), not from DOM clicks. Their Next button stays available as a "skip this action" escape hatch.
- **Look-only steps** (1, 2, 8) advance on Next.
- **Wrong page:** if the viewer is on a different page from the one a step needs, the callout says where to go ("Open Settings from the sidebar") and spotlights the nav link. On mobile it spotlights the **More** menu.
- **Back:** Back goes to the previous step's explanation only. It does not undo data.
- **Skip tour and Esc:** both exit the tour at any time. The data stays as the viewer left it.
- **State:** the current step persists across page navigations and a refresh, in sessionStorage scoped to the tab. Wrap it in try/catch and fall back to memory.

## Start of tour (confirmed reset)

When the tour is started from the link or the button:

1. **Link entry only:** if there is no session, call `startGuestSession()` (src/lib/session.ts) and skip /welcome. `ShellGate` must let a `?tour=1` visit through instead of redirecting.
2. **Confirm dialog:** "Start the demo? This resets the demo data to a fresh start." It has two choices:
   - **Start demo:** continues to step 3 below.
   - **Cancel:** exits the tour and leaves the data untouched.
3. **On confirm, put the app in a known state:**
   - Run `resetDemo(db)` (src/store/dataCommands.ts).
   - Set the role to **Analyst**.
   - Set the autopilot policy to **off with the default cap**.
   - Verified in `src/store/tx.ts` (reset_demo): the reset clears every table, including `meta`, so the autopilot policy falls back to its default (off, ₹50,000). It deliberately **keeps `meta.role`**, because the role is a viewer preference. So the tour must set the role back to Analyst itself; otherwise a second run starts as Manager, step 4's "Submit for approval" button isn't there, and the step 5 switch to Manager loses its meaning. The tour should still write the autopilot policy explicitly (off, default cap) so the step doesn't depend on that reset detail.
   - Then go to /queue at step 1.

## Constraints

- **Next.js version:** the app runs Next.js 16.4.3 with non-standard APIs. Read `node_modules/next/dist/docs/` before touching routing or search params (AGENTS.md).
- **Bundle size:** the tour must be lazy-loaded, as AutopilotRunner is in AppShell. The Demo button itself must be tiny. /queue, /audit and /disputes are already over budget, so the tour must not add to their first load.
- **Accessibility:**
  - The callout is a non-modal dialog with a labelled heading and "Step N of 8".
  - Focus moves to the callout on step change.
  - Esc exits the tour.
  - The spotlight ring has a non-colour cue and doesn't trap focus, because the viewer must be able to reach the target.
  - Respect `prefers-reduced-motion`.
- **Mobile (375px / 768px):**
  - The ring stays on the target.
  - The callout docks as a bottom sheet.
  - There is no horizontal scroll.
  - Targets inside the sidebar resolve to the More menu.
- **Branch:** build on `task/38-emerald-redesign` with `task/41-auto-send` merged in, because the tour needs both the TASK-39 session gate and the TASK-41 autopilot. Work in a fresh worktree. The main checkout has uncommitted edits that are not part of this work.
- **Route budget (my call):** the Demo button is a tiny static button in TopBar; everything else is loaded only when the tour starts. Measure `scripts/route-budget.ts` output before and after. If the button pushes a route further over, load the button lazily too.
- **Tracking:** create a Campfire ticket before the build starts.

## Riskiest assumption (tracer bullet first)

**INV-B passes all nine checks and is under the default cap, so autopilot sends it in step 7.** This is unverified. Only INV-A has been proven to pass 9/9.

- Prove it first with a unit/e2e check against the seed.
- If INV-B fails a check, pick another seeded invoice that's under ₹50,000 and clean, and update the step 7 copy.
- If none exists, stop and bring it back to Tushar. Do not change the seed silently.

## Left to the builder

- The spotlight implementation:
  - hand-rolled, or a small dependency (justify any dependency against the bundle budget);
  - how it handles scroll, resize and targets that render late.
- Target lookup. Prefer existing `data-testid`s, and add `data-tour` attributes where none fit.
- The exact sessionStorage shape, and the tour state machine/module layout.
- The Demo button's exact placement, label and icon within the top bar's mobile two-row layout (TopBar.tsx).
- Test coverage. At minimum:
  - an e2e run of the full tour on the light and dark projects;
  - the cold-link entry;
  - reset-cancel;
  - Skip;
  - 375px and 768px with no overflow;
  - zero console errors (beyond the known TASK-42 prefetch 404s).
