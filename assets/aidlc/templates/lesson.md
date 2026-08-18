# Structured lesson contract

Lessons are canonical task data with task provenance. Project-wide advisory memory is a separate, explicitly approved registry; it never rewrites lifecycle state or project rules.

Required fields: `id`, `taskId`, `areas`, `summary`, `prevention`, `example`, `promotion`, `source`, `recordedAt`.

```sh
node .agents/aidlc/scripts/state.mjs lesson record <task-id> <lesson-id> \
  --area <areas> --summary <summary> --prevention <rule> \
  --example <example> --promotion <status-or-target> --source <artifact-or-evidence>
```

If honest review finds no durable lesson:

```sh
node .agents/aidlc/scripts/state.mjs lesson none <task-id> --reason <reason> --source <source>
```

`lesson search` reads the digest-checked derived index; `lesson rebuild` recreates it from canonical task records. Promote only an existing source lesson with explicit human approval:

```sh
node .agents/aidlc/scripts/state.mjs memory promote <memory-id> \
  --summary <summary> --guidance <actionable-guidance> --area <areas> \
  --phase <phases-or-*> --priority <0-100> --source-task <task-id> \
  --source-lesson <lesson-id> --approved-by <explicit-human-approval>
```

Retirement is also audited: `state.mjs memory retire <memory-id> --reason <reason> --approved-by <explicit-human-approval>`. Context packets load only matching registry entries after project rules and only when budget remains.
