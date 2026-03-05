from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from src.models.review import Review


def _base(**overrides) -> dict:
    base = {
        "review_id": "RTEST",
        "asin": "B08HHQWBBZ",
        "reviewer_name": "Tester",
        "title": "Test",
        "body": "Test body.",
        "rating": 4.0,
        "date": date(2024, 1, 1),
        "country": "the United States",
        "verified_purchase": False,
        "helpful_votes": 0,
        "scraped_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
    }
    base.update(overrides)
    return base


def test_rating_rejects_below_1():
    with pytest.raises(ValidationError):
        Review(**_base(rating=0.9))


def test_rating_rejects_above_5():
    with pytest.raises(ValidationError):
        Review(**_base(rating=5.1))


def test_rating_accepts_boundaries():
    r1 = Review(**_base(rating=1.0))
    r5 = Review(**_base(rating=5.0))
    assert r1.rating == 1.0
    assert r5.rating == 5.0


def test_helpful_votes_rejects_negative():
    with pytest.raises(ValidationError):
        Review(**_base(helpful_votes=-1))


def test_helpful_votes_accepts_zero():
    r = Review(**_base(helpful_votes=0))
    assert r.helpful_votes == 0
