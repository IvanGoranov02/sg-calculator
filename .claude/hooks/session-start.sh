#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code on the web environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SKILL_DIR="$HOME/.claude/skills/banana"
BANANA_DIR="/tmp/banana-claude"

# Install banana-claude skill if not already present
if [ ! -d "$SKILL_DIR" ]; then
  echo "[banana-setup] Installing banana-claude skill..."
  rm -rf "$BANANA_DIR"
  git clone --depth=1 https://github.com/AgriciDaniel/banana-claude.git "$BANANA_DIR"
  mkdir -p "$SKILL_DIR"
  cp -r "$BANANA_DIR/skills/banana/"* "$SKILL_DIR/"
  chmod +x "$SKILL_DIR/scripts/"*.py 2>/dev/null || true
  mkdir -p "$HOME/.banana/presets"
  echo "[banana-setup] Skill installed to $SKILL_DIR"
fi

# Configure MCP server if API key is available
if [ -n "${GOOGLE_AI_API_KEY:-}" ]; then
  echo "[banana-setup] Configuring MCP server with API key..."
  python3 "$SKILL_DIR/scripts/setup_mcp.py" --key "$GOOGLE_AI_API_KEY"
fi

echo "[banana-setup] Done."
