from datetime import date
from pathlib import Path

from src.parsers.html_parser import parse_file

FIXTURES = Path(__file__).parent / "fixtures"


def test_standard_review() -> None:
    reviews = parse_file(FIXTURES / "standard_review.html")
    assert len(reviews) == 1
    r = reviews[0]
    assert r.review_id == "R1STANDARDTEST"
    assert r.asin == "B08HHQWBBZ"
    assert r.reviewer_name == "John Doe"
    assert r.title == "Great product"
    assert "works well" in r.body
    assert r.rating == 4.0
    assert r.date == date(2023, 10, 25)
    assert r.country == "the United States"
    assert r.verified_purchase is True
    assert r.helpful_votes == 0


def test_asin_from_html() -> None:
    reviews = parse_file(FIXTURES / "asin_from_html.html")
    assert len(reviews) == 1
    assert reviews[0].asin == "B0CYR7H7LC"


def test_asin_fallback_from_filename() -> None:
    reviews = parse_file(FIXTURES / "B08HHQWBBZ_fallback.html")
    assert len(reviews) == 1
    assert reviews[0].asin == "B08HHQWBBZ"


def test_non_english_title() -> None:
    reviews = parse_file(FIXTURES / "non_english_title.html")
    assert len(reviews) == 1
    assert reviews[0].title == "Excelente producto"


def test_multi_line_body() -> None:
    reviews = parse_file(FIXTURES / "multi_line_body.html")
    assert len(reviews) == 1
    assert "\n" in reviews[0].body


def test_multi_line_date() -> None:
    reviews = parse_file(FIXTURES / "multi_line_date.html")
    assert len(reviews) == 1
    assert reviews[0].date == date(2023, 10, 25)
    assert reviews[0].country == "the United States"


def test_zero_helpful_votes() -> None:
    reviews = parse_file(FIXTURES / "standard_review.html")
    assert reviews[0].helpful_votes == 0


def test_helpful_votes_number() -> None:
    reviews = parse_file(FIXTURES / "helpful_votes.html")
    assert len(reviews) == 1
    assert reviews[0].helpful_votes == 5


def test_one_helpful_vote() -> None:
    reviews = parse_file(FIXTURES / "one_helpful_vote.html")
    assert len(reviews) == 1
    assert reviews[0].helpful_votes == 1


def test_verified_purchase_true() -> None:
    reviews = parse_file(FIXTURES / "standard_review.html")
    assert reviews[0].verified_purchase is True


def test_verified_purchase_false() -> None:
    reviews = parse_file(FIXTURES / "no_avp_badge.html")
    assert len(reviews) == 1
    assert reviews[0].verified_purchase is False
