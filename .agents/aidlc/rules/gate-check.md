# Gate-check command (AI-DLC · project rule)

> Project-specific executable for the gate self-check. The generic contract lives in `conventions.md §3`.

## Command

```sh
node .agents/aidlc/scripts/gate-check.mjs <task-id>
```

The command is offline and dependency-free. Exit `0` means no structural error; exit `1` means at least one `ERROR`.

## Caveats

- Semantic correctness, prose language, spec interpretation and code quality remain LLM/human-reviewed.
- AI agents may run this gate checker. It is unrelated to workflow upgrade, which agents must never run.
