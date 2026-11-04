---
id: TASK-72
title: 'Make test:all pass with the accepted eval known reds'
status: To Do
assignee: []
created_date: '2026-11-04 00:59'
labels:
  - P2
dependencies: []
priority: medium
type: chore
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test:all stops at eval on the 8 accepted held-out failures (EXE23/EXE33), so the steps after it never run in the chain; split eval out or pin the expected-failure set
<!-- SECTION:DESCRIPTION:END -->
