from datetime import date, datetime, timezone

import pytest

from src.models.review import Review


@pytest.fixture
def sample_review() -> Review:
    return Review(
        review_id="R1SAMPLE001",
        asin="B08HHQWBBZ",
        reviewer_name="Alice",
        title="Good",
        body="Works as expected.",
        rating=4.0,
        date=date(2023, 10, 25),
        country="the United States",
        verified_purchase=True,
        helpful_votes=0,
        scraped_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


@pytest.fixture
def another_review(sample_review: Review) -> Review:
    return sample_review.model_copy(update={"review_id": "R1SAMPLE002"})
