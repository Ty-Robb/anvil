# Refresh a review after the PR changed

1. **Find what is stale.** Run `node <skill>/scripts/anvil.mjs stale --pr <N>`. Each lens is `current` (verdict at the head), `review` (never reviewed) or `rerun` (newest verdict predates the head), with the files changed since that verdict.
2. **Re-collect context** for the new head with `anvil.mjs context --pr <N>`.
3. **Rerun, don't relabel.** Every `rerun` and `review` lens needs a new verdict at the head. A reviewer may conclude quickly that the changed files cannot affect its lens, but it must look at the diff since its last verdict and say so in the summary. Never copy an old verdict to the new SHA.
4. **Narrow the brief.** Give the reviewer the previous verdict, the files changed since it, and the diff for those files, and ask it to confirm earlier findings are resolved and nothing new was introduced. Run a full-scope review instead when the changes touch the lens's core concern.
5. **Record, gate and post** as in `review-pr.md` steps 7 and 8.
6. **Stop the loop.** If successive rounds keep finding new edge cases in the same subsystem, step back and question the design before patching again. Report the pattern to the operator with the evidence.
