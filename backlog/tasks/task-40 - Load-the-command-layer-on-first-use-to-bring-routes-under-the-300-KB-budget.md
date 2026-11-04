---
id: TASK-40
title: Load the command layer on first use to bring routes under the 300 KB budget
status: Done
assignee: []
created_date: '2026-11-02 09:18'
updated_date: '2026-11-03 17:19'
labels:
  - P1
dependencies: []
priority: high
type: enhancement
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Six routes exceed the 300 KB first-load budget after the TASK-38 merges; commands.ts and zod load on every page
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified 2026-11-03: a fresh pnpm build on main d7144cb plus route-budget puts all 18 routes at or under 300 KB gzip (largest /settings 294.8 KB).
<!-- SECTION:FINAL_SUMMARY:END -->
