from fastapi import FastAPI, HTTPException, Request

from src.parsers.html_parser import parse_html
from src.storage.json_storage import upsert_reviews

app = FastAPI(title="Amazon Review Ingest Server")


@app.post("/ingest")
async def ingest(request: Request) -> dict:
    """Receive raw Amazon review page HTML, parse it, and upsert into storage.

    Returns JSON: {"asin": str | None, "added": int, "total": int}
    """
    html = (await request.body()).decode("utf-8", errors="replace")
    try:
        reviews = parse_html(html)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not reviews:
        return {"asin": None, "added": 0, "total": 0}
    asin = reviews[0].asin
    added, total = upsert_reviews(reviews, asin)
    return {"asin": asin, "added": added, "total": total}
