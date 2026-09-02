#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing %s. Copy .env.example to .env and fill in the connection settings.\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SSH_KEY:?SSH_KEY must be set in .env}"
: "${REMOTE_HOST:?REMOTE_HOST must be set in .env}"
: "${REMOTE_PORT:?REMOTE_PORT must be set in .env}"
REMOTE_COMFYUI="${REMOTE_COMFYUI:-/workspace/runpod-slim/ComfyUI}"
REMOTE_NODE_DIR="${REMOTE_NODE_DIR:-$REMOTE_COMFYUI/custom_nodes/AdbComfyUiPlayer}"
REMOTE_RESTART_COMMAND="${REMOTE_RESTART_COMMAND:-pid=\$(pgrep -f '^/workspace/runpod-slim/ComfyUI/.venv-cu128/bin/python main.py' | head -n 1); if [ -n \$pid ]; then kill \$pid; tail --pid=\$pid -f /dev/null; fi; cd '$REMOTE_COMFYUI'; nohup .venv-cu128/bin/python main.py --listen 0.0.0.0 --port 8188 --enable-cors-header </dev/null >>/tmp/comfyui.log 2>&1 &}"

SSH=(ssh -p "$REMOTE_PORT" -i "$SSH_KEY")

"${SSH[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_NODE_DIR'"
tar -C "$SCRIPT_DIR" -cf - __init__.py adb_music_player.py |
  "${SSH[@]}" "$REMOTE_HOST" "tar --no-same-owner -C '$REMOTE_NODE_DIR' -xf -"

printf 'Uploaded ComfyUI node to %s:%s\n' "$REMOTE_HOST" "$REMOTE_NODE_DIR"
"${SSH[@]}" "$REMOTE_HOST" "$REMOTE_RESTART_COMMAND"
printf 'Restarted ComfyUI on %s\n' "$REMOTE_HOST"
