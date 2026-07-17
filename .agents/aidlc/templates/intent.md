---
task_id: <YYYY-MMDD-slug>
title: <short title>
type: feature | bug | refactor | infra
phase: clarify
gate: G0_confirm
status: blocked_on_user
language: vi | en
submodules: [<sub-a>, <sub-b>]
branch: "—"
created_at: <DD-MM-YYYY HH:MM>
---

<!-- Prose follows `language`; scaffold + technical tokens (paths/class/route/enum/cmd) stay English -->

# <Title>

## 📋 Problem
<2–4 sentences restating the goal in your own words>

## 🗺️ Affected areas
- `<submodule>` — <why> — spec: <path/link from specs-index, or "none indexed">

## 💭 Assumptions
- <assumption you are making>

## ❓ Open questions
1. <question> — *default:* <answer assumed if not specified otherwise>

## 🎯 Scope
**In:** <what this task will do>
**🚫 Out:** <explicit exclusion>

<!-- DESIGN appended by aidlc-plan after G0 is confirmed -->
