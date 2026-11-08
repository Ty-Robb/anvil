# Verdict format

Each reviewer returns one JSON object per lens. `anvil.mjs record` validates it.

```json
{
  "lens": "durability",
  "sha": "3f2c9a1d7e5b4c6a8f0e1d2c3b4a5968778695a4",
  "reviewer": "fresh-context Claude Code subagent; Codex cross-check",
  "model": "claude; codex",
  "verdict": "request_changes",
  "score": 62,
  "summary": "Revoking access to one project deletes unsaved drafts for other projects.",
  "findings": [
    {
      "severity": "blocker",
      "status": "open",
      "file": "src/drafts/recovery.ts",
      "line": 131,
      "scenario": "Remove a member from project A; their unsaved draft for project B is deleted.",
      "evidence": "test/recovery-scope.test.ts fails on the current head: expected project B's draft to survive."
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `lens` | An id from `lenses.json`. |
| `sha` | The full 40-character head commit the reviewer read. |
| `verdict` | `accept`, `request_changes` or `not_relevant`. |
| `score` | 0 to 100; omit for `not_relevant`. |
| `findings[].severity` | `blocker`, `should_fix` or `nit`. Only blockers and should-fix findings affect the gate. |
| `findings[].status` | `open`, `fixed` (with the regression test named in `evidence`) or `dismissed` (with `reason`). |
| `findings[].scenario` | A concrete, reachable sequence of events, not a category of risk. |
| `findings[].evidence` | A failing test, a command and its output, or a cited line with the path that reaches it. |

An `accept` verdict cannot contain open blocker or should-fix findings. Speculative concerns go in the summary, not in `findings`.
