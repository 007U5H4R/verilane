# Verilane: QA Report (Stage 9 release gate)

- **Branch:** `task/38-emerald-redesign` at `cd07c25`, compared with `main`.
- **Tickets:** TASK-50 (Stage 8) and TASK-57 (Stage 9).
- **Date:** 2026-11-03.
- **Deploy target:** verilane.tusharpathak.com. The deploy runs only after this report is approved.

## 1. Executive summary

**Recommendation: READY WITH ACCEPTED RISKS**

- **No open findings at Critical or High.** Every High from Stages 7, 8 and 9 is fixed and has been retested.
- **Security review: PASS** for a public demo deploy, with these conditions:
  - live LLM mode is off;
  - no API key is set;
  - no e2e build flags are set.
- **The functional suite is green:**
  - unit tests: 1214/1214;
  - e2e: 351 passed, 1 skipped, 0 failed;
  - typecheck: 0 errors;
  - lint: 0 errors, 1 warning;
  - production build: OK.
- **The desktop performance requirement (NFR1) passes.** Queue LCP is 0.94 s against a 2.5 s budget. Route JS is 293 KB against a 300 KB budget.
- **There are two known issues that need your ruling.**
  - **QA-001, eval gates.** 8 of the 43 held-out eval gates fail. You have already decided to ship this as a known issue (TASK-51).
  - **QA-004, mobile lab performance.** Simulated LCP on mobile was 4.4–4.7 s locally; on the live production URL (Stage 10) it is 3.21 s, "Needs improvement". No requirement covers mobile.

## 2. Per-stage results

### Stage 7: Design critique (DES)

| Total | Fixed | Partially fixed | Parked | No change |
|---|---|---|---|---|
| 14 | 9 | 1 | 3 | 1 |

- **Fixed:**
  - DES-001 and DES-002 (High), commit `5efc824`.
  - DES-003 (Medium), commit `2f1464f`.
  - DES-004 (Medium), commit `07f9b56`.
  - DES-006 (Medium), commit `9556572`.
  - DES-008 (Medium), commit `df3350c`.
  - DES-009 (Low), commit `7a0fcf5`.
  - DES-010 (Low), commit `1426b0e`.
  - DES-012 (Low), commit `e0e6c70`.
- **Partially fixed:** DES-005 (Medium), commit `0d3ba3f`.
  - SITE_URL and `og:url` are correct.
  - **The `og.png` image is still the pre-redesign artwork.** See ruling R1.
- **Parked:**
  - DES-007: nav order versus IA §5 (ruling R3).
  - DES-011: chart redundancy (Low).
  - DES-013: same issue as CR-016, tracked in TASK-56.
- **No change:** DES-014 was a screen-capture artifact, not a bug.

### Stage 8A: Code review (CR)

| Total | Fixed | Moved to Security | Parked with ticket |
|---|---|---|---|
| 19 | 8 | 4 | 7 |

- **Fixed:** CR-001 to CR-008, including the CR-006 MoreSheet close-on-widen fix and the CR-008 bulk-bar count.
- **Moved to security:**

  | Code-review finding | Security finding |
  |---|---|
  | CR-009 | SEC-001 |
  | CR-010 | SEC-006 |
  | CR-011 | SEC-007 |
  | CR-017 | SEC-003 |

- **Parked, each with a ticket:**

  | Finding | Severity | Ticket |
  |---|---|---|
  | CR-012 | Medium | TASK-52 |
  | CR-015 | Medium | TASK-52 |
  | CR-013 | Medium | TASK-53 |
  | CR-014 | Medium | TASK-54 |
  | CR-018 | Low | TASK-55 |
  | CR-019 | Low | TASK-55 |
  | CR-016 (same as DES-013) | Low | TASK-56 |

### Stage 8B: Test execution (TC and QA)

| Gate | Result |
|---|---|
| typecheck | 0 errors |
| lint | 0 errors, 1 warning |
| unit | 1214 / 1214 |
| build | OK |
| e2e (chromium, light and dark) | 351 passed / 1 skipped / 0 failed |
| test-cases.md | 86 PASS · 1 FAIL (TC-066, QA-001) · 3 not run (TC-001, TC-002, TC-090) |

- **QA-001: eval gates fail (known issue, ships).**
  - 8 of 43 held-out eval gates fail. The dev set passes 40/40.
  - The failures are in dispute recall, approval enforcement, unambiguous matching, and amount and invoice-number exact match.
  - **Cause:** the extractor misses disputes and duplicates in the held-out phrasing.
  - **This is not a bypass of the approval guard.** Every case where approval was not enforced traces back to an email the extractor missed. The fault-injection classes are rejected 100% of the time.
  - **Mitigation:** a person approves every send.
  - **Follow-up:** TASK-51 (P2).
- **QA-002: flaky test TC-081.** Fixed. The `open()` helper now waits for the queue skeleton to clear before asserting.
- **QA-003: `mark_disputed` failed.** Its transaction scope did not include the tables the guard reads. Fixed test-first in `tx.test.ts` (failing test, then fix). The e2e suite is green again.
- **QA-004: mobile lab LCP and TBT.** See §5 and ruling R2.

**Performance scorecard (Lighthouse 13.6.0)**

- Lab measurements only, on a plain production build served from localhost.
- 3 runs per row, reported as median [min–max].
- CLS is 0 on every row.

| Route · device | Score | LCP | TBT | JS KB |
|---|---|---|---|---|
| queue · mobile | 56 [44–58] | 4698 ms [4502–5387] | 1595 ms [1265–1962] | 308 |
| queue · desktop | 98 [96–99] | **943 ms** [893–1013] | 101 ms | **293** |
| invoice · mobile | 66 [61–72] | 4421 ms | 750 ms | 300 |
| invoice · desktop | 99 [94–99] | 933 ms | 52 ms | 300 |
| drafts · mobile | 72 [64–77] | 4362 ms | 497 ms | 285 |
| drafts · desktop | 97 [94–99] | 1015 ms | 118 ms | 285 |

| Requirement | Result |
|---|---|
| NFR1: desktop queue LCP ≤ 2.5 s and route JS ≤ 300 KB | **PASS**. JS headroom is only about 2%. |
| NFR3: INP | Deferred to Stage 10, where field data will be available. |

Full report: `.scratch/task50/perf-report.md`.

### Stage 9: Security (SEC)

**Verdict: PASS. No Critical or High findings.**

Evidence:
- `pnpm audit --prod` reports no known vulnerabilities.
- The LLM route and provider tests pass, 72/72.
- `.next/static` contains no `sk-ant-` or `ANTHROPIC` strings.
- The production build contains no e2e hooks.

| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-001 (CR-009) | Medium if live mode is on; Info while off | The `/api/llm/draft` and `/api/llm/extract` routes have no auth, rate limit, origin check or spend cap. | **Accepted risk with live mode off.** See note 1. Hardening: TASK-62. |
| SEC-002 | Low | No security headers and no CSP. Headers are set only for `/sw.js`. | Parked, TASK-58. Recommended before deploy (R5). |
| SEC-003 (CR-017) | Low | The Vercel build runs only `pnpm build`, so nothing checks that the e2e harness stays out. | Verified safe today. See note 2. Guard: TASK-59, recommended before deploy (R5). |
| SEC-004 | Low | CSV formula injection in the disputes export (leading `= + - @`) and the payments export (leading tab or CR). | Parked, TASK-60. |
| SEC-005 | Low (inferred) | The auth forms have no `method="post"`, so a submit before hydration would put field values in a GET URL. | Parked, TASK-61. |
| SEC-006 (CR-010) | Info | `src/ai/live.ts` is never imported, and extraction is always simulated. | Parked, TASK-62. |
| SEC-007 (CR-011) | Info | The live provider maps errors to `{}`, and the draft route returns 200 when a draft is rejected. Nothing leaks. | Parked, TASK-62. |
| SEC-008 | Info | Roles are enforced on the client only (`permissions.ts`). | Accepted risk: this is a demo with no real users. |

Notes:
1. With live mode off, every POST to these routes returns 503 `live_mode_disabled`. The limits already in place are:
   - a 256 KiB body cap and 20k-character field limits;
   - `max_tokens` of 8192;
   - a 60 s timeout with one retry;
   - Zod validation of the output.
2. `NEXT_PUBLIC_E2E` is inlined as `"0"` in the build, every hook is guarded, and `/e2e-harness` returns `notFound()`.

These controls were checked and produced no finding:
- XSS;
- CSV import: 5 MB cap, Zod validation, all-or-nothing;
- secrets: `.env.local` is gitignored and holds only an unused key;
- the service worker skips `/api` and non-GET requests;
- logging.

## 3. Unified findings register (deduplicated)

Each row is one underlying problem. Where a problem was found in more than one stage, the row takes the strongest severity.

| Canonical | Sources | Severity | Status | Ticket |
|---|---|---|---|---|
| Eval gates below threshold | QA-001, TC-066 | Medium | Known issue, ships | TASK-51 |
| Mobile lab LCP and TBT | QA-004 | Medium (lab, no requirement) | **Ruling R2**; live re-measure 2026-11-03: mobile /queue LCP 3.21 s, TBT 398 ms (Needs improvement) | follow-up (P2) |
| LLM routes unprotected in live mode | SEC-001, CR-009 | Medium (Info while off) | Accepted, live mode off | TASK-62 |
| og.png still pre-redesign | DES-005 (partial) | Medium | **Ruling R1** | — |
| Nav order versus IA §5 | DES-007 | Low | **Ruling R3** | — |
| Parked code-review items | CR-012, CR-013, CR-014, CR-015 | Medium | Parked | TASK-52, TASK-53, TASK-54 |
| Parked code-review items | CR-018, CR-019 | Low | Parked | TASK-55 |
| Diagnostic shown only in dev | DES-013, CR-016 | Low | Parked | TASK-56 |
| Missing security headers | SEC-002 | Low | Parked; ruling R5 | TASK-58 |
| Build does not guard against e2e hooks | SEC-003, CR-017 | Low | Parked; ruling R5 | TASK-59 |
| CSV formula injection | SEC-004 | Low | Parked | TASK-60 |
| Auth forms have no POST method | SEC-005 | Low | Parked | TASK-61 |
| Live provider unused and swallows errors | SEC-006, SEC-007, CR-010, CR-011 | Info | Parked | TASK-62 |
| Roles enforced on the client only | SEC-008 | Info | Accepted | — |
| Chart redundancy | DES-011 | Low | Parked | — |
| Welcome eyebrow copy | DES (copy) | Low | **Ruling R4** | — |
| Fixed and retested | DES-001 to DES-004, DES-006, DES-008, DES-009, DES-010, DES-012; CR-001 to CR-008; QA-002; QA-003 | High to Low | Closed | — |

## 4. Severity summary (open items only)

| Severity | Open | Accepted or known | Parked with ticket |
|---|---|---|---|
| Critical | 0 | — | — |
| High | 0 | — | — |
| Medium | 7 | QA-001, SEC-001 (off) | CR-012, CR-013, CR-014, CR-015; og.png and QA-004 await your ruling |
| Low | 10 | — | SEC-002 to SEC-005, CR-016, CR-018, CR-019, DES-007, DES-011, eyebrow copy |
| Info | 3 | SEC-008 | SEC-006, SEC-007 |

## 5. Open issues and accepted risks

1. **QA-001.** A missed dispute in extraction could let an approver send a reminder on an invoice that is in dispute. The approver sees the email thread before sending. Shipping this was your decision on 2026-11-03.
2. **QA-004.** Simulated mobile LCP is 4.4–4.7 s, in the "Poor" band, and TBT reaches 1.6 s on /queue. Unthrottled, LCP is 0.5–1.2 s. The likely cause is the main-thread render after data loads from IndexedDB. No requirement covers mobile.
   - **Proposal:** ship it as a known P2 issue.
   - **Stage 10 live re-measure (2026-11-03, Lighthouse 13.6.0, https://verilane.tusharpathak.com, lab):** mobile /queue LCP **3.21 s**, TBT **398 ms**; desktop LCP **0.70 s**. Mobile moves from "Poor" to "Needs improvement" on the production CDN build. Still above the 2.5 s "Good" line, so QA-004 stays an open P2 follow-up. Field INP/CWV are not yet available (no RUM enabled).
   - Re-measure against the deployed URL in Stage 10.
   - Open a follow-up for a DevTools trace and a guard on route-JS size.
3. **SEC-001.** This risk is acceptable **only while `VERILANE_LIVE_LLM` is unset in Vercel.** Enabling live mode first requires TASK-62:
   - a rate limit;
   - an origin check;
   - an Anthropic spend cap.
4. **SEC-008.** Roles are enforced only in the browser, which is acceptable for a demo that keeps all data on the user's device.
5. **NFR1 headroom.** Route JS has about 7 KB of headroom left, so any new dependency would break the budget. A guard on route-JS size is recommended.

## 6. Release gates

| Gate | Criterion | Result |
|---|---|---|
| Design | No open Critical or High DES finding; mobile, OG and screen-state gates met | **PASS with condition.** OG image ruling R1 is open. |
| Code quality | No open Critical or High CR finding; typecheck and lint clean | **PASS** |
| Functional test | Critical test cases pass; e2e green; failures logged as QA issues | **PASS with accepted risk** (QA-001) |
| Performance | NFR1 met | **PASS.** Mobile lab result is QA-004. |
| Security | No Critical or High SEC finding | **PASS.** Live mode stays off. |
| **Overall** | | **READY WITH ACCEPTED RISKS** |

No thresholds were lowered to reach these results.

## 7. Pre-deploy checklist (Stage 10)

- [ ] Vercel env: `VERILANE_LIVE_LLM` is **unset** and `ANTHROPIC_API_KEY` is **unset**.
- [ ] Vercel env: `NEXT_PUBLIC_E2E` is **unset**, not `1`.
- [ ] Build command: `pnpm vercel-build` via `vercel.json` (TASK-59; fails the build if `NEXT_PUBLIC_E2E=1`, `VERILANE_LIVE_LLM` or `ANTHROPIC_API_KEY` is set).
- [ ] Security headers and `poweredByHeader: false` (TASK-58, if R5 is approved).
- [ ] `og.png` is regenerated, or kept, according to ruling R1.
- [ ] After deploy, run Lighthouse against verilane.tusharpathak.com: 3 runs on mobile and 3 on desktop.
- [ ] After deploy, check the link preview in LinkedIn Post Inspector and opengraph.xyz.
- [ ] After deploy, check mobile layout at 375 and 768 px on the live URL.

## 8. Rulings needed from you

| # | Item | My recommendation |
|---|---|---|
| R1 | Regenerate `og.png`, which still shows the pre-redesign look | **Regenerate before deploy.** The link preview is the first impression of a public URL. |
| R2 | QA-004 mobile lab performance | **Ship as a known P2 issue** and re-measure on the deployed URL in Stage 10. |
| R3 | DES-007 nav order versus IA §5 | Keep the current order unless IA §5 is binding for you. |
| R4 | Welcome eyebrow copy | Your call. It is cosmetic. |
| R5 | Do SEC-002 (headers) and SEC-003 (build guard) before deploy | **Yes, both.** They are small config changes that harden a public URL. |

### 8.1 Rulings — approved 2026-11-03 ("approve as recommended")

| # | Decision |
|---|---|
| R1 | Regenerate `og.png` in the emerald look before deploy. |
| R2 | QA-004 ships as a known P2 issue; re-measure on the deployed URL in Stage 10. |
| R3 | Keep the current nav order (DES-007 closed as won't-change). |
| R4 | Welcome eyebrow copy stays unchanged (cosmetic; no ticket). |
| R5 | TASK-58 (SEC-002 headers) and TASK-59 (SEC-003 build guard) land before deploy. The Vercel build command becomes `pnpm vercel-build` (`check:deploy-env` → `build` → `check:secrets` → `check:e2e-hooks`), set in `vercel.json`. |

### 8.2 Re-gate after the rulings landed (2026-11-03, HEAD 950d666)

| Item | Commit | Evidence |
|---|---|---|
| R1 og.png (emerald) | a5aa604 | og.spec passes; image is 1200×630 |
| R5 SEC-002 headers | 029cfe9 | `security-headers.test.ts` passes |
| R5 SEC-003 build guard | b5fabbe | `check-deploy-env.test.ts` passes (12/12 across both files); a local `pnpm vercel-build` exits 0 with the secrets and e2e-hooks checks clean (80 files) |
| QA-005 TC-081 timeout under host load | 950d666 | Under heavy host load (load avg ~24), TC-081's ~170 page loads overran the per-test timeout. Fix: the test timeout is now 480 s and `open()` waits 15 s; a TODO tracks trimming the per-control reloads. Passes in 2.9 min once load is normal |
| Full e2e gate (`pnpm build:e2e && pnpm e2e --workers=1`) | 950d666 | **351 passed / 1 skipped / 0 failed** (20.1 min). Typecheck and lint are clean |

§7 items 1–5 are verified locally. Items 6–8 run in Stage 10 against the live URL.

## 8. Stage 10 live results (2026-11-03)

Measured against https://verilane.tusharpathak.com (Vercel production deploy `dpl_4XZRowwkUyxvWDwkcVcUax98kbrS`, main at f30a953).

| Check | Result |
|---|---|
| QA-004 perf re-measure (Lighthouse 13.6.0, lab) | Mobile /queue: LCP **3.21 s**, TBT **398 ms**. Desktop /queue: LCP **0.70 s**. Mobile moves from "Poor" to "Needs improvement". QA-004 stays an open P2 follow-up; field CWV are not collected (no RUM enabled) |
| TASK-63 (invoice detail widened past 375 px) | Fixed in 69b5888. Live re-check: 10/10 horizontal-scroll checks pass at 375 and 768. Regression test: DES-001 loop in `tests/e2e/responsive.spec.ts` now includes `/invoices/INV-A` |
| TASK-64 (/queue stat badge truncates at 375 px) | Logged as a P3 cosmetic follow-up; not a release blocker |
| Link preview (OG) | See HANDOFF.md, Stage 10 |

