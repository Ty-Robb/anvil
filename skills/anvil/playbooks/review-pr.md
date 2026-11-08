# Review a pull request

1. **Restate the goal.** Read the PR description and tell the operator, in one or two sentences, what the PR is meant to achieve. Every reviewer brief opens with it.
2. **Collect context.** Run `node <skill>/scripts/anvil.mjs context --pr <N>`. Use the printed directory's `context.json` and `diff.patch` as the single source for every brief, so all lenses review the same commit.
3. **Plan the lenses.** Find available providers and run `anvil.mjs plan` (inside T3 Code or another orchestrator, apply the plan rule to the host's provider list; see `references/provider-routing.md`). Then run `anvil.mjs lenses`. For each lens, decide from the changed files whether it applies. A lens that cannot apply (for example Interface when no user surface changes) still gets a verdict: `not_relevant` with a one-line reason.
4. **Run one fresh reviewer per applicable lens.** Brief each with: the goal, the repository path, the head SHA, the lens question and focus, the verdict format (`references/verdict-format.md`), and these rules: review only, change nothing, cite evidence, label anything unreproduced as speculative. Run independent lenses in parallel when the runtime allows. Route providers per `references/provider-routing.md`.
5. **Cross-check blocking lenses.** Where the plan assigns a second reviewer from another model family, run it with the same brief. Merge their findings into one verdict per lens, recording both reviewers.
6. **Verify every blocking finding.** Reproduce it, or have a fresh verifier try to. Confirmed: keep it open. Not reproduced: mark it `dismissed` with the reason, or downgrade it to speculative and non-blocking.
7. **Record.** Save each lens verdict as JSON and run `anvil.mjs record --pr <N> --file <verdict.json>`. The command rejects verdicts for any commit other than the head.
8. **Gate and post.** Run `anvil.mjs gate --pr <N> --post`. Report the state, the open findings with their evidence, and what would turn the check green.
9. **Fixing findings.** If you are also the author, fix confirmed findings with regression tests, push, and follow `refresh.md`. Never mark a finding fixed without the test that proves it.
