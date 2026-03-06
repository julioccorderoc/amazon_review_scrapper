# Build the standalone Windows server binary.
#
# Prerequisites: uv (https://docs.astral.sh/uv/)
#   Install: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
#
# Run from PowerShell in the project root:
#   .\build-windows.ps1
#
# NOTE: PyInstaller cannot cross-compile. This script must be run on Windows.
#
# Output:
#   dist\amazon-review-scraper.exe   ← standalone binary (no Python needed)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

# ── Preflight ─────────────────────────────────────────────────────────────────
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error @"
Error: 'uv' is not installed.
Install it with:
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
Then open a new PowerShell window and re-run this script.
"@
    exit 1
}

# ── Install / sync deps ───────────────────────────────────────────────────────
Write-Host "-> Syncing dependencies (including pyinstaller)..."
uv sync --group dev

# ── Build binary ─────────────────────────────────────────────────────────────
Write-Host "-> Building binary (this takes ~30-60 s)..."
uv run pyinstaller amazon_review_scraper.spec --clean --noconfirm

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Build complete. Contents of dist\:"
Get-ChildItem dist | Format-Table Name, Length -AutoSize
Write-Host ""
Write-Host "To distribute to coworkers:"
Write-Host "  1. Share dist\amazon-review-scraper.exe"
Write-Host "  2. Coworkers double-click it — a console window opens with the server"
Write-Host "  3. Leave that window open while using the Chrome extension"
Write-Host "  4. Close the window to stop the server"
