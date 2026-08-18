# AI-DLC · Index

Generate compact repository and specification manifests at `.agents/data/index/repo-map.md` and `.agents/data/index/specs-index.md` without assuming a particular stack or repository layout.

1. Resolve configured topology profiles and discovery roots.
2. Detect areas from project markers and local profile rules. Built-in topologies are generic, single repository, workspace/monorepo, and git submodules.
3. Index configured spec roots plus relevant README, docs, and API descriptions. Read only titles and short leading sections.
4. Record each area, stack marker, narrow verification command, spec document, keywords, and one-line summary.
5. Write only the two canonical manifests under `.agents/data/index/`; never create `.aidlc/index/` or write discovery indexes into `.agents/data/state/`.
6. Keep manifests small and deterministic; report unknown stacks rather than guessing.

Indexing is maintenance and never creates a task. Stack, Docker, screen-code, runtime, and domain discovery belong in local profiles/rules, not this phase contract.
