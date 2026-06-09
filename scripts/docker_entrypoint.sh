#!/bin/sh
set -eu

CHROMA_PATH="${CHROMA_DIR:-/app/chroma_db_qwen_06b}"

if [ ! -d "$CHROMA_PATH" ] || [ -z "$(find "$CHROMA_PATH" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
  echo "[docker] Chroma DB not found at $CHROMA_PATH. Running ingest..."
  python Ingest.py --md data/MLN111_Chapter2.md --db "$CHROMA_PATH"
fi

exec python -m uvicorn App:app --host 0.0.0.0 --port 8000
