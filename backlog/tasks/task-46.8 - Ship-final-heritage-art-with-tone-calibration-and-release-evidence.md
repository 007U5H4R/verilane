---
id: TASK-46.8
title: Ship final heritage art with tone calibration and release evidence
status: Done
assignee: []
created_date: '2026-11-02 16:40'
updated_date: '2026-11-05 09:06'
labels:
  - P1
dependencies:
  - TASK-46.4
  - TASK-46.6
  - TASK-46.7
references:
  - docs/technical-plan-TASK-46.md
  - docs/test-cases-TASK-46.md
parent_task_id: TASK-46
priority: high
type: feature
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TKT-46.08: final swap plus SC4/SC7/CLS/LCP/axe/offline evidence
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Stage 5 (draft at gate, 2026-11-02): docs/technical-plan-TASK-46.md Part B steps 46.8.1-46.8.6 · TC-119-TC-125
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped r4, PR #8 merged to main at 9928bef, prod deploy dpl_9iMmyfbxz2g2FcKJa6mPfonPXDYz verified READY. /, /queue, /settings 200; heritage v2 assets served; 0 runtime errors. TC-081/TC-018/TC-158 e2e flakes investigated as host-load, not regression (TASK-84 filed, provisional, awaiting user confirmation).
<!-- SECTION:NOTES:END -->
