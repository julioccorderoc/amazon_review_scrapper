import argparse
import sys
from pathlib import Path

from src.parsers.html_parser import parse_file
from src.storage.json_storage import latest_output, load_reviews, output_path, save_reviews

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
        unique = _dedup(reviews)
        path = output_path(asin)
        save_reviews(unique, path)
        print(f"  saved  {len(unique)} reviews → {path}")


def cmd_show(args: argparse.Namespace) -> None:
    asin = args.asin.upper()
    path = latest_output(asin)
    if not path:
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


def cmd_export(args: argparse.Namespace) -> None:
    asin = args.asin.upper()
    path = latest_output(asin)
    if not path:
        print(f"No output found for ASIN {asin}. Run `parse` first.", file=sys.stderr)
        sys.exit(1)

    for review in load_reviews(path):
        print(review.model_dump_json())


def _dedup(reviews: list) -> list:
    seen: set[str] = set()
    unique = []
    for r in reviews:
        if r.review_id not in seen:
            seen.add(r.review_id)
            unique.append(r)
    return unique


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

    p_export = sub.add_parser("export", help="Dump reviews as JSONL (stdout)")
    p_export.add_argument("--asin", required=True, metavar="ASIN")
    p_export.set_defaults(func=cmd_export)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
