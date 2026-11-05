---
id: TASK-85
title: >-
  Remove merged worktrees and branches and sync stale TASK-45/46 sub-ticket
  statuses
status: Done
assignee: []
created_date: '2026-11-05 09:27'
updated_date: '2026-11-05 09:31'
labels:
  - P3
dependencies: []
priority: low
type: chore
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Merged release and side worktrees and stale In Progress statuses clutter the repo and board
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed 8 merged clean worktrees (e1-46, release-45-46, release-45-46-r2, release-r4, side-45.6/45.7/46.5/46.6) and 12 merged local branches. Kept task-45-splash and task-46-heritage-bg worktrees (whole-branch reviews pending) and stash@{0} (unmerged task/38 e2e WIP that no longer applies cleanly). Synced 45.5/45.6/45.8/46.7 to Done per ledgers and HANDOFF (shipped r2/r3).
<!-- SECTION:NOTES:END -->
