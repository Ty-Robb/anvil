# Fix until the check is green

Use when the operator asks Anvil to fix a PR, or to "loop until it's done". The loop ends when `anvil/review` is `success` at the PR head, or at a stop condition below. Never end it by relabelling a verdict.

1. **Review or refresh.** If the head has no verdicts, run `review-pr.md`; otherwise run `refresh.md`. Post the gate.
2. **Collect the work.** List every open blocker and should-fix finding at the head. Group findings that share a root cause; fix the cause once.
3. **Reproduce first.** For each group, write or adopt a test that fails on the current head for the reason the finding gives. A finding you cannot reproduce goes back to its lens reviewer as `dismissed` with the reason, not into the code.
4. **Fix the root cause.** Make the smallest change that makes the reproduction pass without weakening another guard. Run the focused tests for every file you touched, then the repository's affected checks.
5. **Commit and push** the fixes for this round as one commit that names the findings it resolves.
6. **Refresh.** Run `refresh.md` for every lens whose files changed, with fresh reviewers. Each previously open finding must come back `fixed` (citing its regression test) or still `open`.
7. **Repeat** from step 2 until the gate is `success`.

## Stop conditions

Stop the loop, post the gate, and report to the operator when:

- **A decision is theirs.** A finding needs a product, scope, spending, credential or authorization decision. Say exactly what to decide and continue any independent fixes first.
- **A usage limit is hit.** Leave affected lenses pending and say when to resume. Do not change accounts or use API keys.
- **The same subsystem fails three rounds running.** New edge cases keep appearing in the same area. Stop patching, write down the shared premise the fixes rely on, propose a redesign, and ask before building it.
- **The PR moved underneath you.** Someone else pushed to the branch. Re-collect context and start the round again rather than committing over their work.

## Report each round

One short line per round: findings fixed, findings dismissed with reasons, lenses refreshed, gate state. At the end, the final gate, the commits pushed and anything left for the operator.
