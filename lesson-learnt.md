# Lessons learnt — Verilane v1 (Stages 1–10)

Written at the Stage 10 close-out, 2026-11-03 (TASK-65). Each lesson names what happened, why it mattered, and the guard that now stops it from happening again.

## 1. Test as a real visitor, with real data

- **What happened:** two layout overflows passed e2e and then showed up in production.
  - DES-001: the e2e build's implicit session hid the guest pill, so TC-062 never saw the real top bar.
  - TASK-63: INV-A, the first row in the live queue, has a longer recipient and provenance than the INV-042 fixture. At 375px its card widened the invoice grid to 448px.
- **Why it mattered:** a green suite proved only the fixture path. The data and session a real visitor gets were never exercised.
- **Guard:**
  - The DES-001 loop in `tests/e2e/responsive.spec.ts` runs as a stored guest and now includes `/invoices/INV-A`.
  - Grid tracks use `minmax(0,1fr)` so long content cannot widen them.
  - Re-check 375 and 768 on the live URL after every deploy.

## 2. A full disk looks like flakiness

- **What happened:** the internal disk filled up. Playwright hit ENOSPC on browser launch, and this surfaced as a different test failing on each run.
- **Guard:** caches and temp files are redirected to the E Drive. When failures move around between runs, run `df` before suspecting a race.

## 3. e2e flakiness under host load

- **What happened:** with parallel workers on a loaded host, e2e results were timing-sensitive.
- **Guard:** e2e runs use `--workers=1`, and TC-081 has a longer timeout. A follow-up is to trim the reloads in TC-081 so the timeout can come back down.

## 4. Infrastructure IDs vanish on compaction

- **What happened:** the Vercel project, team and deploy IDs were lost when context was compacted and had to be looked up again.
- **Guard:** HANDOFF.md, Stage 10, records the project, team, production deploy and rollback IDs. Update them after every deploy.

## 5. A stale `.git/index.lock` blocks git

- **What happened:** an interrupted git process left `index.lock` behind, and every later git command failed.
- **Guard:** first check that no git process is running, then remove the lock. Never delete it while git is active.

## 6. Browser validators are not always available

- **What happened:** LinkedIn Post Inspector and opengraph.xyz could not be run. The Chrome extension was not connected, and opengraph.xyz returned HTTP 429 to a plain fetch.
- **Guard:** the fallback is a server-side curl check of the og:* and twitter:* tags plus a fetch of og.png (HTTP 200, 1200×630). It shows the tags are correct, but it does not prove the platforms render the preview. That still needs a manual validator run, which is tracked as a follow-up.

## 7. Lab perf is not field perf

- **What happened:** after the deploy, mobile /queue measured LCP 3.21 s and TBT 398 ms in the lab ("needs improvement"). Desktop LCP is 0.70 s. There is no RUM, so field Core Web Vitals are unknown.
- **Guard:** QA-004 stays open. Turning on Speed Insights or Web Analytics is a follow-up, and field data should decide the next fix.
