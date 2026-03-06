import argparse
import sys
from pathlib import Path

from src.parsers.html_parser import parse_file
from src.storage.json_storage import asin_path, load_reviews, upsert_reviews

RAW_DIR = Path("raw_reviews")


def cmd_parse(args: argparse.Namespace) -> None:
    files = [Path(args.file)] if args.file else sorted(RAW_DIR.glob("*.html"))

    if not files:
        print("No HTML files found.")
        return

    by_asin: dict[str, list] = {}
    for path in files:
        try:
            reviews = parse_file(path)
        except ValueError as e:
            print(f"  error  {path.name}: {e}", file=sys.stderr)
            continue
        asin = reviews[0].asin if reviews else None
        if not asin:
            print(f"  skip   {path.name}: no reviews extracted", file=sys.stderr)
            continue
        by_asin.setdefault(asin, []).extend(reviews)
        print(f"  parsed {path.name}  → {len(reviews)} reviews")

    for asin, reviews in by_asin.items():
        added, total = upsert_reviews(reviews, asin)
        path = asin_path(asin)
        print(f"  saved  {added} new reviews → {path}  (total: {total})")


def cmd_show(args: argparse.Namespace) -> None:
    asin = args.asin.upper()
    path = asin_path(asin)
    if not path.exists():
        print(f"No output found for ASIN {asin}. Run `parse` first.")
        return

    reviews = load_reviews(path)
    breakdown: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in reviews:
        breakdown[round(r.rating)] += 1

    print(f"\nASIN:    {asin}")
    print(f"File:    {path}")
    print(f"Reviews: {len(reviews)}")
    print("\nRating breakdown:")
    for stars in range(5, 0, -1):
        count = breakdown[stars]
        bar = "█" * count
        print(f"  {stars}★  {bar} {count}")


def cmd_list(_args: argparse.Namespace) -> None:
    output_dir = Path("output")
    files = sorted(output_dir.glob("*.json")) if output_dir.exists() else []

    if not files:
        print("No products found. Run `parse` first.")
        return

    print(f"\n{'ASIN':<15} {'Reviews':>7}  File")
    print("-" * 45)
    for f in files:
        asin = f.stem
        try:
            reviews = load_reviews(f)
            breakdown = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            for r in reviews:
                breakdown[round(r.rating)] += 1
            stars_str = "  ".join(
                f"{s}★:{breakdown[s]}" for s in range(5, 0, -1) if breakdown[s]
            )
            print(f"{asin:<15} {len(reviews):>7}  {stars_str}")
        except Exception:
            print(f"{asin:<15}  (unreadable)")


def cmd_serve(_args: argparse.Namespace) -> None:
    import logging

    import uvicorn

    logging.basicConfig(level=logging.INFO)
    print("Starting ingest server on http://localhost:8765 — press Ctrl+C to stop.")
    uvicorn.run("src.phase2.server:app", host="127.0.0.1", port=8765)


def cmd_export(args: argparse.Namespace) -> None:
    asin = args.asin.upper()
    path = asin_path(asin)
    if not path.exists():
        print(f"No output found for ASIN {asin}. Run `parse` first.", file=sys.stderr)
        sys.exit(1)

    for review in load_reviews(path):
        print(review.model_dump_json())


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="main.py",
        description="Amazon review scraper — Phase 1 CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_parse = sub.add_parser("parse", help="Ingest HTML files from raw_reviews/")
    p_parse.add_argument("--file", metavar="PATH", help="Parse a single file")
    p_parse.set_defaults(func=cmd_parse)

    p_show = sub.add_parser("show", help="Print a summary for a product")
    p_show.add_argument("--asin", required=True, metavar="ASIN")
    p_show.set_defaults(func=cmd_show)

    p_list = sub.add_parser("list", help="List all products with review counts")
    p_list.set_defaults(func=cmd_list)

    p_export = sub.add_parser("export", help="Dump reviews as JSONL (stdout)")
    p_export.add_argument("--asin", required=True, metavar="ASIN")
    p_export.set_defaults(func=cmd_export)

    p_serve = sub.add_parser("serve", help="Start the local ingest server on localhost:8765")
    p_serve.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
