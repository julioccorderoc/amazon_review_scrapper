import re
from datetime import date, datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from src.models.review import Review

# ASIN embedded in /product-reviews/ links inside the HTML body (full-page saves)
_ASIN_RE = re.compile(r"/product-reviews/([A-Z0-9]{10})")

# ASIN at the start of the filename (fragment saves where ASIN isn't in the HTML)
_ASIN_FILENAME_RE = re.compile(r"^([A-Z0-9]{10})[^A-Z0-9]")

# Matches: "637 people found this helpful" or "One person found this helpful"
_HELPFUL_RE = re.compile(r"^(\d+|[Oo]ne)\s+(?:people?|person)\s+found", re.IGNORECASE)

# Matches: "Reviewed in United States on October 25, 2023"
_DATE_RE = re.compile(r"Reviewed in (.+?) on (.+)")


def _extract_asin(html: str, filename: str) -> str | None:
    """Extract ASIN from HTML content first, fall back to filename."""
    m = _ASIN_RE.search(html)
    if m:
        return m.group(1)
    m = _ASIN_FILENAME_RE.match(filename)
    return m.group(1) if m else None


def _normalize(text: str) -> str:
    """Collapse any whitespace (including newlines) into a single space."""
    return re.sub(r"\s+", " ", text).strip()


def _text(tag: Tag, selector: str) -> str:
    el = tag.select_one(selector)
    return _normalize(el.get_text()) if el else ""


def parse_file(path: Path) -> list[Review]:
    """Parse a single raw HTML file and return its reviews.

    The ASIN is extracted from the HTML content — no filename convention required.
    """
    html = path.read_text(encoding="utf-8")

    asin = _extract_asin(html, path.name)
    if not asin:
        raise ValueError(f"Could not extract ASIN from '{path.name}'")

    soup = BeautifulSoup(html, "lxml")
    scraped_at = datetime.now(tz=timezone.utc)

    return [
        review
        for li in soup.select('li[data-hook="review"]')
        if (review := _parse_review_li(li, asin, scraped_at))
    ]


def _parse_review_li(li: Tag, asin: str, scraped_at: datetime) -> Review | None:
    review_id = li.get("id", "").strip()
    if not review_id:
        return None

    reviewer_name = _text(li, ".a-profile-name")
    rating = _parse_rating(li)
    title = _parse_title(li)
    body = _parse_body(li)
    review_date, country = _parse_date(li)
    verified_purchase = li.select_one('[data-hook="avp-badge"]') is not None
    helpful_votes = _parse_helpful_votes(li)

    if not all([reviewer_name, title, body, review_date]):
        return None

    return Review(
        review_id=review_id,
        asin=asin,
        reviewer_name=reviewer_name,
        title=title,
        body=body,
        rating=rating,
        date=review_date,
        country=country,
        verified_purchase=verified_purchase,
        helpful_votes=helpful_votes,
        scraped_at=scraped_at,
    )


def _parse_rating(li: Tag) -> float:
    alt = li.select_one('[data-hook="review-star-rating"] span.a-icon-alt')
    if alt:
        m = re.search(r"([\d.]+)\s+out of", _normalize(alt.get_text()))
        if m:
            return float(m.group(1))
    # Fallback: read star count from CSS class (e.g. a-star-1 → 1.0)
    star_tag = li.select_one('[data-hook="review-star-rating"]')
    if star_tag:
        for css_class in star_tag.get("class", []):
            m = re.match(r"a-star-(\d)", css_class)
            if m:
                return float(m.group(1))
    return 1.0


def _parse_title(li: Tag) -> str:
    # Select the first visible, non-empty span inside the title anchor
    for span in li.select('[data-hook="review-title"] span:not(.aok-hidden)'):
        text = _normalize(span.get_text())
        if text:
            return text
    return ""


def _parse_body(li: Tag) -> str:
    el = li.select_one('[data-hook="review-body"] span')
    if not el:
        el = li.select_one('[data-hook="review-body"]')
    return el.get_text(separator="\n", strip=True) if el else ""


def _parse_date(li: Tag) -> tuple[date | None, str]:
    el = li.select_one('[data-hook="review-date"]')
    if not el:
        return None, ""
    text = _normalize(el.get_text())
    m = _DATE_RE.search(text)
    if not m:
        return None, ""
    country = _normalize(m.group(1))
    date_str = _normalize(m.group(2))
    try:
        return datetime.strptime(date_str, "%B %d, %Y").date(), country
    except ValueError:
        return None, country


def _parse_helpful_votes(li: Tag) -> int:
    el = li.select_one('[data-hook="helpful-vote-statement"]')
    if not el:
        return 0
    m = _HELPFUL_RE.match(_normalize(el.get_text()))
    if not m:
        return 0
    raw = m.group(1)
    return 1 if raw.lower() == "one" else int(raw)
