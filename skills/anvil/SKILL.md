---
name: anvil
description: Review a GitHub pull request, and optionally fix it in a loop until green, with independent, lens-by-lens reviewers running on your own Claude and Codex subscriptions, require evidence for every finding, and post the result to the PR as an `anvil/review` commit status. Use for "anvil", "review PR N", "refresh the review", "re-check this PR after the latest push", or "fix PR N until the review passes".
---

# Anvil

Anvil turns a pull request into one GitHub check, `anvil/review`, backed by independent reviews that each answer one question. Reviews run on whichever subscriptions the operator has already signed in to, such as Claude Code and Codex, mixing model families when more than one is available. Nothing runs on GitHub Actions or a hosted service.

Scripts live at `scripts/anvil.mjs` beside this file and need Node 20 or later and an authenticated `gh`. Run them from the repository under review; they store verdicts in `.anvil/` there, which belongs in `.gitignore`.

## Non-negotiables

- **One lens, one fresh reviewer.** Each lens in `references/lenses.json` gets its own reviewer with no prior context, briefed with the lens question and focus, the PR's stated goal, the head commit and the diff. Never review several lenses in one pass, and never give a reviewer your own conclusions.
- **Evidence or it doesn't count.** A blocker or should-fix finding needs a concrete, reachable scenario and evidence: a failing test, a command and its output, or a cited line with the path that reaches it. Anything else is labelled speculative and cannot block.
- **Verify before you trust.** Before acting on a blocking finding, reproduce it yourself or with a second fresh reviewer. Fix confirmed findings with a regression test that fails without the fix; dismiss unconfirmed ones with the reason recorded in the verdict.
- **Use the mix you have.** Find the operator's available providers first (`references/provider-routing.md`), spread the lenses across them, and give correctness, security, durability and concurrency a second reviewer from a different model family whenever one is available. Disagreement is resolved by reproduction, not by vote.
- **Verdicts are tied to a commit.** Every verdict names the full head SHA it reviewed. A push makes earlier verdicts stale; the gate never counts them. Never edit a recorded verdict to claim it covers a newer commit.
- **Never invent an accept.** If a lens was not reviewed at the head, the check stays pending. Do not post success to unblock a merge.
- **The operator's subscriptions, the operator's limits.** Run reviews only on accounts the operator signed in to, on their own machine or self-hosted runner. Never pool or share accounts. Stop and report when a usage limit is hit rather than switching provider silently.

## Commands

```sh
node scripts/anvil.mjs providers                     # signed-in review tools (status commands only, no model calls)
node scripts/anvil.mjs plan                          # which provider reviews which lens
node scripts/anvil.mjs lenses                        # print the lens catalogue
node scripts/anvil.mjs context --pr 42               # write .anvil/pr-42/<sha>/{context.json,diff.patch}
node scripts/anvil.mjs record --pr 42 --file v.json  # validate and store one lens verdict for the head
node scripts/anvil.mjs stale --pr 42                 # lenses to (re)review and files changed since each verdict
node scripts/anvil.mjs gate --pr 42 [--post] [--strict] # aggregate; --post sets the status and updates one PR comment; --strict also blocks on open nits
```

`gate` exits 0 only when every lens has a passing verdict at the head. With `--post` it writes the `anvil/review` commit status (success, failure or pending) and creates or updates a single marked summary comment on the PR.

## Playbooks

- Reviewing a PR for the first time → `playbooks/review-pr.md`.
- The PR changed after a review, or "refresh the review" → `playbooks/refresh.md`.
- "Fix it", "fix the findings" or "loop until it's done" → `playbooks/fix-loop.md`: review, fix with regression tests, push, refresh, and repeat until `anvil/review` is green or a stop condition applies.

## References

- `references/lenses.json`: the lens catalogue. Edit it per repository; keep ids stable because verdict files use them.
- `references/verdict-format.md`: the verdict JSON each reviewer returns.
- `references/provider-routing.md`: which provider and agent profile reviews which lens, and how to handle limits.
