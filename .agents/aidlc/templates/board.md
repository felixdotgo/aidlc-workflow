# AI-DLC BOARD

> Single source of truth for **in-flight** AI-DLC tasks. Both humans and AI read/edit this file directly (Edit tool). It is loaded every turn (Claude Code injects it via hook; other tools read it at turn start) — keep it lean: in-flight tasks ONLY.
> Each task = exactly one row; the `id` column is the unique key. Deep detail lives in `doc`, NOT duplicated here. Column enums + update conventions: `.agents/aidlc/conventions.md §8`. Done tasks are moved to `ARCHIVE.md` by the wrap phase — never left here.

| id | title | phase | gate | status | branch | submodules | doc |
|----|-------|-------|------|--------|--------|------------|-----|

_No tasks in flight._
