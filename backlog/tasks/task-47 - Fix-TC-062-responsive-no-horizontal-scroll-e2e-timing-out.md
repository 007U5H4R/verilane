---
id: TASK-47
title: Fix TC-062 responsive no-horizontal-scroll e2e timing out
status: Done
assignee: []
created_date: '2026-11-02 14:47'
updated_date: '2026-11-02 16:41'
labels:
  - P2
dependencies: []
priority: medium
type: bug
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TC-062 hits the 30s test timeout in both chromium projects, so horizontal-scroll regressions go unchecked
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Splitting TC-062 per route exposed a real overflow the timeout had hidden: /invoices @1280 scrollWidth 1288. The sr-only 'Investigate' header span (position:absolute) had no positioned ancestor, so it escaped the table's xl:overflow-x-auto scroller and widened the document. Fix: 'relative' on the InvoicesTable wrapper.
<!-- SECTION:NOTES:END -->
