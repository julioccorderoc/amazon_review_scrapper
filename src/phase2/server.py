import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

from src.parsers.html_parser import parse_html
from src.storage.json_storage import OUTPUT_DIR, upsert_reviews

logger = logging.getLogger("ars.ingest")

app = FastAPI(title="Amazon Review Ingest Server")


@app.post("/ingest")
async def ingest(request: Request) -> dict:
    """Receive raw Amazon review page HTML, parse it, and upsert into storage.

    Returns JSON: {"asin": str | None, "added": int, "total": int}
    """
    html = (await request.body()).decode("utf-8", errors="replace")
    logger.info("ingest: html_len=%d", len(html))
    try:
        reviews = parse_html(html)
    except ValueError as exc:
        logger.warning("ingest: parse error — %s — snippet: %r", exc, html[:400])
        raise HTTPException(status_code=422, detail=str(exc))
    logger.info("ingest: reviews_found=%d", len(reviews))
    if not reviews:
        logger.warning("ingest: no reviews parsed — snippet: %r", html[:400])
        return {"asin": None, "added": 0, "total": 0}
    asin = reviews[0].asin
    first_ids = [r.review_id for r in reviews[:3]]
    logger.info("ingest: asin=%s first_ids=%s", asin, first_ids)
    added, total = upsert_reviews(reviews, asin)
    logger.info("ingest: added=%d total=%d", added, total)
    return {"asin": asin, "added": added, "total": total}


@app.get("/output/{asin}")
async def get_output(asin: str) -> FileResponse:
    """Serve the aggregated JSON file for an ASIN as a file download."""
    path = OUTPUT_DIR / f"{asin}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No data found for ASIN {asin}")
    return FileResponse(
        path=str(path),
        media_type="application/json",
        filename=f"{asin}.json",
        headers={"Content-Disposition": f'attachment; filename="{asin}.json"'},
    )
