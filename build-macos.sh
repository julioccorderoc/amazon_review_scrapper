#!/usr/bin/env bash
# Build the standalone macOS server binary.
#
# Prerequisites: uv (https://docs.astral.sh/uv/)
# Run from the project root or double-click in Finder.
#
# Output:
#   dist/amazon-review-scraper          ← standalone binary (no Python needed)
#   dist/Amazon Review Scraper Server.command  ← double-click launcher for coworkers

set -euo pipefail
cd "$(dirname "$0")"

# ── Preflight ────────────────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  echo "Error: 'uv' is not installed."
  echo "Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

# ── Install / sync deps ───────────────────────────────────────────────────────
echo "→ Syncing dependencies (including pyinstaller)…"
uv sync --group dev

# ── Build binary ─────────────────────────────────────────────────────────────
echo "→ Building binary (this takes ~30–60 s)…"
uv run pyinstaller amazon_review_scraper.spec --clean --noconfirm

# ── Create .command launcher ──────────────────────────────────────────────────
# .command files open in Terminal.app when double-clicked on macOS.
LAUNCHER="dist/Amazon Review Scraper Server.command"

cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/usr/bin/env bash
# Double-click this file to start the Amazon Review Scraper server.
# A Terminal window will open and stay open while the server is running.
# Close the window (or press Ctrl+C) to stop the server.
cd "$(dirname "$0")"
./amazon-review-scraper
LAUNCHER_EOF

chmod +x "$LAUNCHER"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "✓ Build complete. Contents of dist/:"
ls -lh dist/
echo ""
echo "To distribute to coworkers:"
echo "  1. Zip the contents of dist/  (both files)"
echo "  2. Coworkers unzip, then double-click 'Amazon Review Scraper Server.command'"
echo "  3. A Terminal window opens — leave it running while using the Chrome extension"
