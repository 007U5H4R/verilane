---
id: TASK-83
title: 'Generate Next route types before typecheck in test:all'
status: To Do
assignee: []
created_date: '2026-11-05 08:10'
labels:
  - P3
dependencies: []
priority: low
type: bug
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a fresh clone or worktree with no .next, pnpm typecheck fails with TS2304 LayoutProps because tsc runs before next typegen; found at the r4 gate
<!-- SECTION:DESCRIPTION:END -->
