from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, Field


class Review(BaseModel):
    review_id: str
    asin: str
    reviewer_name: str
    title: str
    body: str
    rating: Annotated[float, Field(ge=1.0, le=5.0)]
    date: date
    country: str
    verified_purchase: bool
    helpful_votes: Annotated[int, Field(ge=0)] = 0
    scraped_at: datetime
