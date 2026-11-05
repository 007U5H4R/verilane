---
id: TASK-84
title: 'Re-run TC-081, TC-018, TC-158 on a quiet host after r4'
status: To Do
assignee: []
created_date: '2026-11-05 09:00'
labels:
  - P2
dependencies: []
priority: medium
type: chore
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
r4 (TASK-81) shipped with these 3 e2e tests failing under confirmed host contention (load avg 8->25->41 during the run); TC-018 passed clean solo, TC-081/TC-158 are documented load-sensitive timing tests unrelated to the heritage-art diff. Confirm they pass on an idle host or CI runner; if TC-158 fails clean, investigate its 1000ms/5000ms readiness-timing tolerance for real.
<!-- SECTION:DESCRIPTION:END -->
