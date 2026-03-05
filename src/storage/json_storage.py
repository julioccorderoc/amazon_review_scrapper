import json
from pathlib import Path

from src.models.review import Review

OUTPUT_DIR = Path("output")


def asin_path(asin: str) -> Path:
    return OUTPUT_DIR / f"{asin}.json"


def load_reviews(path: Path) -> list[Review]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [Review.model_validate(r) for r in payload]


def save_reviews(reviews: list[Review], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([r.model_dump(mode="json") for r in reviews], indent=2),
        encoding="utf-8",
    )


def upsert_reviews(new_reviews: list[Review], asin: str) -> tuple[int, int]:
    """Merge new_reviews into the existing file for asin, deduplicating by review_id.

    Returns (added, total) — how many were new vs. the total after merge.
    """
    path = asin_path(asin)
    existing = load_reviews(path) if path.exists() else []

    existing_ids = {r.review_id for r in existing}
    to_add = [r for r in new_reviews if r.review_id not in existing_ids]

    save_reviews(existing + to_add, path)
    return len(to_add), len(existing) + len(to_add)
