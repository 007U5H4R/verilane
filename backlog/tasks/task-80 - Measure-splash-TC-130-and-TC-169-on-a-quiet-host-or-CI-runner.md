---
id: TASK-80
title: Measure splash TC-130 and TC-169 on a quiet host or CI runner
status: To Do
assignee: []
created_date: '2026-11-05 07:35'
labels:
  - P2
dependencies: []
priority: medium
type: task
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two runs under load 12-35 failed (TC-130 delta 212-439ms, TC-169 INP 264ms) and a 90-min idle gate never cleared (ambient load ~6.7 from other Chrome/Claude processes), so the perf gate is unmeasured, not proven failing.
<!-- SECTION:DESCRIPTION:END -->
