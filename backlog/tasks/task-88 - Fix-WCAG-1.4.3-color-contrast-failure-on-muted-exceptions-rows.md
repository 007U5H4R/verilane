---
id: TASK-88
title: Fix WCAG 1.4.3 color-contrast failure on muted /exceptions rows
status: Done
assignee: []
created_date: '2026-11-09 07:57'
updated_date: '2026-11-09 08:25'
labels:
  - P1
dependencies: []
priority: high
type: bug
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opacity-60 on disputed/closed exception rows (ExceptionCards.tsx:84) pushes text/badges below 4.5:1 contrast in both themes; found by TC-75.49 axe scan during TASK-79.9 release-evidence prep.
<!-- SECTION:DESCRIPTION:END -->
