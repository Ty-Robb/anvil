# Anvil

Pull request review that runs on the AI subscriptions you already have, mixes model families when you have more than one, and shows up in GitHub as a normal check.

Anvil is an installable agent skill. It splits a review into lenses (correctness, security, durability, concurrency, tests and more), gives each lens to a fresh, read-only reviewer, requires evidence for every finding, and posts the combined result to the PR as the `anvil/review` commit status, plus one summary comment it keeps up to date.

Nothing runs on GitHub Actions or a hosted service, so it works on repositories without Actions minutes. Reviews use the accounts you have signed in to on your own machine or self-hosted runner.

## Install

Requirements: Node 20 or later, the GitHub CLI signed in (`gh auth login`), and at least one signed-in agent: Claude Code or Codex, used directly or through T3 Code.

```sh
git clone <this repository> ~/anvil
~/anvil/install.sh
```

The installer links the skill into `~/.claude/skills`, `~/.codex/skills` and `~/.agents/skills`, and the reviewer profiles into `~/.claude/agents` and `~/.codex/agents`.

## Use

In Claude Code, Codex or T3 Code, from the repository you want reviewed (run `node ~/anvil/skills/anvil/scripts/anvil.mjs providers` to see which of your subscriptions it found):

```text
Use the anvil skill to review PR 42.
Use the anvil skill to refresh the review of PR 42 after my push.
```

Add `.anvil/` to that repository's `.gitignore`; Anvil stores verdicts there.

## How the check works

| State | Meaning |
| --- | --- |
| `success` | Every lens has an accept or not-relevant verdict for the current head commit, with no open blocking findings. |
| `failure` | At least one lens requests changes or has an open blocker or should-fix finding. |
| `pending` | Some lenses have not been reviewed at the current head, including after a new push. |

GitHub only enforces a status as a required check on plans with branch protection. Without it, `anvil/review` is visible on the PR but advisory.

## Design rules

- One lens per reviewer, with fresh context and no shared conclusions.
- A blocking finding needs a reachable scenario and evidence; unconfirmed findings cannot block.
- Lenses are spread across your signed-in providers, and correctness, security, durability and concurrency get a second reviewer from a different model family when one is available.
- Verdicts are tied to a commit; a push makes them stale and the check returns to pending.
- Your subscriptions, your limits: Anvil never pools accounts, asks for API keys, or switches provider silently.

## Development

```sh
npm test
```

## Licence

MIT. See `LICENSE`.
