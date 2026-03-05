from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, Field


class Review(BaseModel):
    """A single Amazon customer review."""

    review_id: str
    product_asin: str
    reviewer_name: str
    reviewer_profile_url: str | None = None
    title: str
    body: str
    rating: Annotated[float, Field(ge=1.0, le=5.0)]
    date: date
    country: str
    verified_purchase: bool
    helpful_votes: Annotated[int, Field(ge=0)] = 0
    scraped_at: datetime
    source_file: str


class ProductReviews(BaseModel):
    """All scraped reviews for a single product (ASIN)."""

    asin: str
    reviews: list[Review] = Field(default_factory=list)
    processed_files: list[str] = Field(default_factory=list)

    def add_reviews(self, new_reviews: list[Review], source_file: str) -> int:
        """Add reviews from a source file, skipping duplicates.

        Returns the number of reviews actually added.
        """
        if source_file in self.processed_files:
            return 0

        existing_ids = {r.review_id for r in self.reviews}
        to_add = [r for r in new_reviews if r.review_id not in existing_ids]
        self.reviews.extend(to_add)
        self.processed_files.append(source_file)
        return len(to_add)

    @property
    def rating_breakdown(self) -> dict[int, int]:
        """Count of reviews per star rating (1–5)."""
        breakdown: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for review in self.reviews:
            star = round(review.rating)
            breakdown[star] = breakdown.get(star, 0) + 1
        return breakdown


class ReviewsDB(BaseModel):
    """Top-level store for all products and their reviews."""

    products: dict[str, ProductReviews] = Field(default_factory=dict)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    def get_or_create_product(self, asin: str) -> ProductReviews:
        if asin not in self.products:
            self.products[asin] = ProductReviews(asin=asin)
        return self.products[asin]
