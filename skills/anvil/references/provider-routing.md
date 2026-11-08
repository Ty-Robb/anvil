# Provider routing

Anvil reviews with whatever the operator already has: their own signed-in Claude, Codex or other subscriptions. It never asks for API keys, never pools accounts, and never uses an account the operator did not sign in to.

## Find what is available

- **Inside T3 Code, Orca or another orchestrator:** use the host's own list of providers, because the host may hold sign-ins the CLIs on `PATH` do not (T3 Code runs Codex under its own login). In T3 Code, call `orchestrator_capabilities` once and treat each provider it reports as available; launch the current provider's reviewers natively and the others with `delegate_task`.
- **Anywhere else:** run `node scripts/anvil.mjs providers`. It runs only sign-in status commands, never a model call, and reports each tool as `signed-in`, `signed-out`, `installed` (no status command, so sign-in is unknown) or `absent`. Treat only `signed-in` as available.

## Plan the mix

Run `node scripts/anvil.mjs plan` (or apply the same rule to the host's provider list):

- Lenses are spread across the available providers in turn, so each family reviews part of the PR.
- Correctness, security, durability and concurrency also get a second reviewer from a different model family whenever one is available.
- With one provider, every lens is reviewed by it once; note in each verdict's `reviewer` field that no cross-check was available.
- Verification of a blocking finding uses a fresh reviewer, preferably from the family that did not raise it.

## Running a reviewer headless

| Tool | Read-only review command |
| --- | --- |
| Claude Code | `claude -p "<brief>" --permission-mode plan --output-format json` |
| Codex | `codex exec --sandbox read-only -o <verdict.json> "<brief>"` |

Each brief is self-contained: goal, repository path, head SHA, lens question and focus, and the verdict format. Profiles for subagent use are in `agents/`.

## Limits

When a reviewer stops on a usage limit, record nothing for that lens, leave the check pending, and tell the operator which lenses remain and when to retry. Do not switch to another account or an API key.
