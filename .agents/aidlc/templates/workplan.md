---
task_id: <YYYY-MMDD-slug>
title: <short title>
type: feature | bug | refactor | infra
phase: plan
gate: G1_review
status: blocked_on_user
language: vi | en
submodules: [<sub-a>, <sub-b>]
branch: "—"
created_at: <DD-MM-YYYY HH:MM>
---

<!-- `language` inherits from the doc; prose follows it, scaffold + technical tokens stay English -->

# Workplan — <Title> (`<task-id>`)

> **G1 (review):** in **Decisions**, **Scope**, and **Branch isolation** — `- [x]` = approve · `- [ ]` + `> change to ...` = adjust (applied at build, no need to re-plan unless structural) · leave a box blank = undecided. You do NOT have to tick everything: on your GO I build the `[x]` items, apply the `> change` notes, and confirm any blank boxes with you (drop / change / keep) before building.
> **G2 (build):** the **Tasks** boxes track execution — `[ ]` todo · `[~]` in progress · `[x]` done. They start empty at G1 and are filled during build, not by the reviewer.
> Full design: the sibling file `<basename>.md` (same name without `.workplan`) in this task's current status dir — never write a status-qualified path here; it would go stale when the pair moves.

## Context (settled at G0)
- <decision already agreed in chat / G0>

## 🧩 Decisions (Gate G1 — approve before build)
### <Decision group> — Pick ONE (mutually exclusive)
- [ ] A — <recommended> ✅
- [ ] B — <alternative>
### Schema / data
- [ ] <decision to approve>
### Write policy / behavior
- [ ] <decision to approve>

## 🎯 Scope
- [ ] <in-scope item>

## 🚫 Out of scope
- <explicit exclusion>

## 🌿 Branch isolation (Gate G1 — pick one)
- [ ] Create branch `aidlc/<task-id>` in each touched submodule (isolated, independent PR) ✅ recommended when several tasks run in parallel
- [ ] Work directly on the current branch (default, single task)

## 🧩 Tasks (Gate G2 — build execution)
### `<submodule-A>`
- [ ] T01 — <task> (`<path>`)
### `<submodule-B>`
- [ ] T0n — <task> (`<path>`)

## 🔧 Verify
- `<submodule>`: <narrowest test/lint command from repo-map.md>

## 📁 Files touched
| file | change | follow-up (user) |
|------|--------|------------------|
| `<submodule>/...` | <what> | <migration / deploy / —> |
