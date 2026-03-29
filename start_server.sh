#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR"

SERVER_HOST="127.0.0.1"
SERVER_PORT="5600"
SERVER_DB_PATH="$ROOT_DIR/backend/data/shadowhunters.db"

CONFIG_FILE="$ROOT_DIR/server.env"
if [ -f "$CONFIG_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      ''|\#*)
        continue
        ;;
      HOST)
        SERVER_HOST="$(printf '%s' "$value" | tr -d '\r')"
        ;;
      PORT)
        SERVER_PORT="$(printf '%s' "$value" | tr -d '\r')"
        ;;
      DB_PATH)
        SERVER_DB_PATH="$(printf '%s' "$value" | tr -d '\r')"
        ;;
    esac
  done < "$CONFIG_FILE"
fi

export SHADOWHUNTERS_DB_PATH="$SERVER_DB_PATH"

if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  PYTHON="$ROOT_DIR/.venv/bin/python"
elif [ -x "$ROOT_DIR/.venv/Scripts/python.exe" ]; then
  PYTHON="$ROOT_DIR/.venv/Scripts/python.exe"
else
  PYTHON="python3"
fi

echo "Starting ShadowHunters server..."
echo "Using Python: $PYTHON"
echo "Host: $SERVER_HOST"
echo "Port: $SERVER_PORT"
echo "DB Path: $SHADOWHUNTERS_DB_PATH"

exec "$PYTHON" main.py serve --host "$SERVER_HOST" --port "$SERVER_PORT" "$@"
