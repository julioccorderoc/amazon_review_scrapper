#!/usr/bin/env bash
set -euo pipefail

if ! command -v uv &>/dev/null; then
  echo "Error: 'uv' is not installed."
  echo "Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

cd "$(dirname "$0")"
echo "Starting Amazon Review Scraper server on http://localhost:8765 ..."
exec uv run main.py serve
