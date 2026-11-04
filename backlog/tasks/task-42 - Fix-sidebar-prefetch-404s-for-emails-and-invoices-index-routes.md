---
id: TASK-42
title: Fix sidebar prefetch 404s for /emails and /invoices index routes
status: Done
assignee: []
created_date: '2026-11-02 12:20'
updated_date: '2026-11-03 18:03'
labels:
  - P2
dependencies: []
priority: medium
type: bug
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NavItems links /emails and /invoices which have no index page; console 404s fail 16 existing e2e specs
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified live 2026-11-03 on d7144cb (verilane.tusharpathak.com): guest at 1440, hovered every nav link on /queue, / and /disputes — zero 4xx/5xx responses, zero console errors. /emails and /invoices exist and prefetch cleanly.
<!-- SECTION:FINAL_SUMMARY:END -->
