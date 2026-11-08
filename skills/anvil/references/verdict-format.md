# Verdict format

Each reviewer returns one JSON object per lens. `anvil.mjs record` validates it.

```json
{
  "lens": "durability",
  "sha": "1e4cd308325d00a27a6e4647ff962886036b1fa7",
  "reviewer": "fresh-context Claude Code subagent; Codex cross-check",
  "model": "claude-opus-5-5; gpt-6.1-sol",
  "verdict": "request_changes",
  "score": 62,
  "summary": "Plan withdrawal deletes other plans' device drafts.",
  "findings": [
    {
      "severity": "blocker",
      "status": "open",
      "file": "plugins/courses/src/teaching.mjs",
      "line": 131,
      "scenario": "Revoke a co-teacher from plan A; their unsaved draft for plan B is deleted.",
      "evidence": "test/teaching-recovery-scope.test.ts fails on the current head: expected beta recovery to survive."
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
