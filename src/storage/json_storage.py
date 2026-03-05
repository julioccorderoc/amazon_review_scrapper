import json
from datetime import datetime, timezone
from pathlib import Path

from src.models.review import Review

OUTPUT_DIR = Path("output")


def output_path(asin: str) -> Path:
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    return OUTPUT_DIR / f"{asin}_{ts}.json"


def latest_output(asin: str) -> Path | None:
    """Return the most recent output file for a given ASIN, or None."""
    files = sorted(OUTPUT_DIR.glob(f"{asin}_*.json"), reverse=True)
    return files[0] if files else None


def save_reviews(reviews: list[Review], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [r.model_dump(mode="json") for r in reviews]
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_reviews(path: Path) -> list[Review]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [Review.model_validate(r) for r in payload]
