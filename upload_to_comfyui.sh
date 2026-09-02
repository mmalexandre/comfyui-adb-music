#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_HOST="${REMOTE_HOST:-root@213.173.107.7}"
REMOTE_PORT="${REMOTE_PORT:-29536}"
REMOTE_COMFYUI="${REMOTE_COMFYUI:-/workspace/runpod-slim/ComfyUI}"
REMOTE_NODE_DIR="${REMOTE_NODE_DIR:-$REMOTE_COMFYUI/custom_nodes/AdbComfyUiPlayer}"
REMOTE_RESTART_COMMAND="${REMOTE_RESTART_COMMAND:-pkill -TERM -f '(^|/)[.]venv-cu128/bin/python main.py' || true; while pgrep -f '(^|/)[.]venv-cu128/bin/python main.py' >/dev/null; do sleep 1; done; cd '$REMOTE_COMFYUI'; nohup .venv-cu128/bin/python main.py --listen 0.0.0.0 --port 8188 --enable-cors-header </dev/null >>/tmp/comfyui.log 2>&1 &}"

SSH=(ssh -p "$REMOTE_PORT" -i "$SSH_KEY")

"${SSH[@]}" "$REMOTE_HOST" "command -v rsync >/dev/null 2>&1 || (apt update && apt install -y rsync)"
"${SSH[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_NODE_DIR'"
rsync -av --no-owner --no-group -e "ssh -p $REMOTE_PORT -i $SSH_KEY" \
  "$SCRIPT_DIR/__init__.py" \
  "$SCRIPT_DIR/adb_music_player.py" \
  "$SCRIPT_DIR/web" \
  "$REMOTE_HOST:$REMOTE_NODE_DIR/"

printf 'Uploaded ComfyUI node to %s:%s\n' "$REMOTE_HOST" "$REMOTE_NODE_DIR"
"${SSH[@]}" "$REMOTE_HOST" "$REMOTE_RESTART_COMMAND"
printf 'Restarted ComfyUI on %s\n' "$REMOTE_HOST"
