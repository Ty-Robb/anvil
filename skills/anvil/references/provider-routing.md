# Provider routing

Anvil uses whichever of these the operator has signed in to. It never asks for API keys and never uses an account the operator did not sign in to.

| Runtime | How a fresh reviewer runs | Profile |
| --- | --- | --- |
| Claude Code | A subagent with no inherited context (`Agent`, general-purpose), or `claude -p` headless | `agents/claude/anvil-reviewer.md` |
| Codex | A spawned agent, or `codex exec` headless | `agents/codex/anvil_reviewer.toml` |
| T3 Code | The native subagent for the current provider; `delegate_task` for the other provider | Either profile |

## Which provider reviews which lens

- The provider running the session reviews every lens.
- Correctness, security, durability and concurrency also get a pass from the other provider when it is signed in. If it is not, say so in the verdict's `reviewer` field; the lens can still pass on one review.
- Verification of a blocking finding uses a fresh reviewer, preferably on the provider that did not raise it.

## Limits

Subscriptions have usage limits. When a reviewer fails on a limit, stop that lens, record nothing for it, leave the check pending, and tell the operator which lenses remain and when to retry. Do not fall back to another account or an API key.
