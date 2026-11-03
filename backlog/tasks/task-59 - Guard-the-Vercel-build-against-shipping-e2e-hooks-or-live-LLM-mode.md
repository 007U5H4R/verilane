---
id: TASK-59
title: Guard the Vercel build against shipping e2e hooks or live LLM mode
status: Done
assignee: []
created_date: '2026-11-03 08:38'
updated_date: '2026-11-03 12:35'
labels:
  - P2
dependencies: []
priority: medium
type: task
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SEC-003: Vercel runs only pnpm build; add check:secrets + check:e2e-hooks and fail when VERCEL_ENV=production with NEXT_PUBLIC_E2E=1
<!-- SECTION:DESCRIPTION:END -->
