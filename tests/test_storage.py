from pathlib import Path

import pytest

import src.storage.json_storage as storage_module
from src.models.review import Review
from src.storage.json_storage import load_reviews, save_reviews, upsert_reviews


def test_save_and_load(tmp_path: Path, sample_review: Review) -> None:
    path = tmp_path / "test.json"
    save_reviews([sample_review], path)
    loaded = load_reviews(path)
    assert len(loaded) == 1
    assert loaded[0].review_id == sample_review.review_id
    assert loaded[0].rating == sample_review.rating


def test_upsert_fresh_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, sample_review: Review
) -> None:
    monkeypatch.setattr(storage_module, "OUTPUT_DIR", tmp_path)
    added, total = upsert_reviews([sample_review], sample_review.asin)
    assert added == 1
    assert total == 1


def test_upsert_adds_new(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    sample_review: Review,
    another_review: Review,
) -> None:
    monkeypatch.setattr(storage_module, "OUTPUT_DIR", tmp_path)
    upsert_reviews([sample_review], sample_review.asin)
    added, total = upsert_reviews([another_review], sample_review.asin)
    assert added == 1
    assert total == 2


def test_upsert_skips_duplicates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, sample_review: Review
) -> None:
    monkeypatch.setattr(storage_module, "OUTPUT_DIR", tmp_path)
    upsert_reviews([sample_review], sample_review.asin)
    added, total = upsert_reviews([sample_review], sample_review.asin)
    assert added == 0
    assert total == 1


def test_upsert_counts_are_correct(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    sample_review: Review,
    another_review: Review,
) -> None:
    monkeypatch.setattr(storage_module, "OUTPUT_DIR", tmp_path)
    added, total = upsert_reviews([sample_review, another_review], sample_review.asin)
    assert added == 2
    assert total == 2

    # Re-upserting both → no new additions
    added2, total2 = upsert_reviews([sample_review, another_review], sample_review.asin)
    assert added2 == 0
    assert total2 == 2
