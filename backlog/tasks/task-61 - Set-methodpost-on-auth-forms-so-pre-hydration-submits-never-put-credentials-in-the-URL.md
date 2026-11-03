---
id: TASK-61
title: >-
  Set method=post on auth forms so pre-hydration submits never put credentials
  in the URL
status: To Do
assignee: []
created_date: '2026-11-03 08:38'
labels:
  - P3
dependencies: []
priority: low
type: bug
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SEC-005: AuthForms.tsx:98,152 forms lack method; a submit before hydration does a GET with fields in the query
<!-- SECTION:DESCRIPTION:END -->
