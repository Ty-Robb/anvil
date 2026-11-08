#!/usr/bin/env bash
# Link the Anvil skill and reviewer profiles into Claude Code, Codex and ~/.agents.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill="$here/skills/anvil"
link() {
  mkdir -p "$(dirname "$2")"
  if [ -e "$2" ] && [ ! -L "$2" ]; then echo "skip $2 (exists and is not a link)"; return; fi
  ln -sfn "$1" "$2"
  echo "linked $2"
}
link "$skill" "$HOME/.claude/skills/anvil"
link "$skill/agents/claude/anvil-reviewer.md" "$HOME/.claude/agents/anvil-reviewer.md"
link "$skill" "$HOME/.codex/skills/anvil"
link "$skill/agents/codex/anvil_reviewer.toml" "$HOME/.codex/agents/anvil_reviewer.toml"
link "$skill" "$HOME/.agents/skills/anvil"
command -v gh >/dev/null || echo "note: install and sign in to the GitHub CLI (gh auth login)"
