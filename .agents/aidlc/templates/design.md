<!-- Append the block below to the task doc, right under the `<!-- DESIGN -->` marker. -->
<!-- Also bump the doc frontmatter: phase: plan · gate: G1_review. -->
<!-- Prose follows the doc's `language`; scaffold + technical tokens (paths/class/route/enum/cmd) stay English. -->
<!-- The task breakdown lives in the workplan (templates/workplan.md → the sibling <…>.workplan.md file), NOT here. -->

## Design

### 🧩 Solution per submodule
- `<submodule>`: <approach; layer/file; reuse pattern with path>

### 📌 Spec traceability
<!-- One row per enumeration / value-set / count / quantified rule the design relies on. Quote the spec VERBATIM — the design must match the quote (values AND count). A row not backed by any spec states its actual source instead (e.g. `code-derived <path>` · `user decision`); no spec indexed for the whole task → a single `none indexed` row. Code↔spec conflicts are not resolved here — route them to the workplan's 🧩 Decisions. -->
| design element | spec source (file:line / rule ID) | verbatim quote |
|----------------|-----------------------------------|----------------|
| <enum / value-set / count / rule> | <path:line · BR-… / none indexed> | <exact spec text> |

### 🔗 Cross-service contracts
- <shared API/contract/event between submodules, request/response shape>

### ⚠️ Risks / edge cases
- <risk, empty/error/loading states, migration, backwards-compat>
