import re
from datetime import date, datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from src.models.review import Review

# Matches: {ASIN}_{N}-star_{P}-page.html
_FILENAME_RE = re.compile(r"^([A-Z0-9]+)_(\d)-star_(\d+)-page\.html$")

# Matches: "637 people found this helpful" or "One person found this helpful"
_HELPFUL_RE = re.compile(r"^(\d+|[Oo]ne)\s+people?\s+found", re.IGNORECASE)

# Matches: "Reviewed in United States on October 25, 2023"
_DATE_RE = re.compile(r"Reviewed in (.+?) on (.+)")


def parse_file(path: Path) -> list[Review]:
    """Parse a single raw HTML file and return its reviews.

    The filename must match: {ASIN}_{N}-star_{P}-page.html
    """
    match = _FILENAME_RE.match(path.name)
    if not match:
        raise ValueError(
            f"Filename '{path.name}' does not match expected pattern "
            "{ASIN}_{N}-star_{P}-page.html"
        )
    asin = match.group(1)

    html = path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "lxml")

    reviews: list[Review] = []
    scraped_at = datetime.now(tz=timezone.utc)

    for li in soup.find_all("li", attrs={"data-hook": "review"}):
        review = _parse_review_li(li, asin, scraped_at)
        if review:
            reviews.append(review)

    return reviews


def _parse_review_li(li: Tag, asin: str, scraped_at: datetime) -> Review | None:
    review_id = li.get("id", "").strip()
    if not review_id:
        return None

    reviewer_name = _text(li, attrs={"class": "a-profile-name"})
    rating = _parse_rating(li)
    title = _parse_title(li)
    body = _parse_body(li)
    review_date, country = _parse_date(li)
    verified_purchase = li.find(attrs={"data-hook": "avp-badge"}) is not None
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


def _text(tag: Tag, **kwargs) -> str:
    found = tag.find(**kwargs)
    return found.get_text(strip=True) if found else ""


def _parse_rating(li: Tag) -> float:
    star_tag = li.find(attrs={"data-hook": "review-star-rating"})
    if not star_tag:
        alt = li.find("span", class_="a-icon-alt")
        if alt:
            m = re.search(r"([\d.]+)\s+out of", alt.get_text())
            return float(m.group(1)) if m else 1.0
        return 1.0
    alt = star_tag.find("span", class_="a-icon-alt")
    if alt:
        m = re.search(r"([\d.]+)\s+out of", alt.get_text())
        return float(m.group(1)) if m else 1.0
    for css_class in star_tag.get("class", []):
        m = re.match(r"a-star-(\d)", css_class)
        if m:
            return float(m.group(1))
    return 1.0


def _parse_title(li: Tag) -> str:
    title_tag = li.find(attrs={"data-hook": "review-title"})
    if not title_tag:
        return ""
    spans = title_tag.find_all("span", recursive=False)
    if spans:
        return spans[-1].get_text(strip=True)
    for child in title_tag.children:
        if hasattr(child, "get_text"):
            text = child.get_text(strip=True)
            if text:
                return text
    return title_tag.get_text(strip=True)


def _parse_body(li: Tag) -> str:
    body_tag = li.find(attrs={"data-hook": "review-body"})
    if not body_tag:
        return ""
    inner = body_tag.find("span")
    target = inner if inner else body_tag
    return target.get_text(separator="\n", strip=True)


def _parse_date(li: Tag) -> tuple[date | None, str]:
    date_tag = li.find(attrs={"data-hook": "review-date"})
    if not date_tag:
        return None, ""
    text = date_tag.get_text(strip=True)
    m = _DATE_RE.search(text)
    if not m:
        return None, ""
    country = m.group(1).strip()
    date_str = m.group(2).strip()
    try:
        parsed = datetime.strptime(date_str, "%B %d, %Y").date()
    except ValueError:
        return None, country
    return parsed, country


def _parse_helpful_votes(li: Tag) -> int:
    vote_tag = li.find(attrs={"data-hook": "helpful-vote-statement"})
    if not vote_tag:
        return 0
    text = vote_tag.get_text(strip=True)
    m = _HELPFUL_RE.match(text)
    if not m:
        return 0
    raw = m.group(1)
    if raw.lower() == "one":
        return 1
    return int(raw)
