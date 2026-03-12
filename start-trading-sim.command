#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
URL="http://localhost:3000"
ADMIN_URL="http://localhost:3000/admin"

cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    open -a "Google Chrome" "$URL"
    open -a "Google Chrome" "$ADMIN_URL"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

nohup npm start > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

for _ in {1..30}; do
  if curl -s "$URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

open -a "Google Chrome" "$URL"
open -a "Google Chrome" "$ADMIN_URL"
