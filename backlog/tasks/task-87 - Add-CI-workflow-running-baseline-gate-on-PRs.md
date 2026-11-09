---
id: TASK-87
title: Add CI workflow running baseline gate on PRs
status: Done
assignee: []
created_date: '2026-11-05 11:14'
updated_date: '2026-11-05 14:23'
labels:
  - P2
dependencies: []
priority: medium
type: chore
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No .github/workflows exists; PRs merge without automated checks. Add a GitHub Actions workflow running typecheck/lint/test/perf/eval on PR to main, as a required check. Exclude e2e (36min, host-load flakes).
<!-- SECTION:DESCRIPTION:END -->
