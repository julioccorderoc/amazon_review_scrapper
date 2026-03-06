"use strict";

const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const { resolve } = require("path");

// Load the extractor script once — it is re-eval'd per test so each run gets a clean DOM.
const SCRIPT = readFileSync(
  resolve(__dirname, "../../src/extension/review-extractor.js"),
  "utf8"
);
const FIXTURE_DIR = resolve(__dirname, "fixtures");

/**
 * Evaluate review-extractor.js inside a JSDOM environment built from a fixture file.
 * @param {string} file        - filename inside tests/js/fixtures/
 * @param {string} [url]       - page URL (determines pathname + ASIN extraction)
 */
function run(file, url = "https://www.amazon.com/product-reviews/B08HHQWBBZ/") {
  const html = readFileSync(resolve(FIXTURE_DIR, file), "utf8");
  const dom = new JSDOM(html, { url, runScripts: "dangerously" });
  return dom.window.eval(SCRIPT);
}

// ── English standard review ───────────────────────────────────────────────────

describe("English standard review (en_standard.html)", () => {
  let result;
  beforeAll(() => { result = run("en_standard.html"); });

  test("returns exactly one review", () => {
    expect(result.reviews).toHaveLength(1);
  });
  test("asin extracted from URL", () => {
    expect(result.asin).toBe("B08HHQWBBZ");
  });
  test("review_id", () => {
    expect(result.reviews[0].review_id).toBe("RSTANDARDEN01");
  });
  test("reviewer_name", () => {
    expect(result.reviews[0].reviewer_name).toBe("John Doe");
  });
  test("rating from span.a-icon-alt text", () => {
    expect(result.reviews[0].rating).toBe(4.0);
  });
  test("title (first non-hidden direct-child span)", () => {
    expect(result.reviews[0].title).toBe("Great product");
  });
  test("body", () => {
    expect(result.reviews[0].body).toBe("This product works well.");
  });
  test("date parsed to ISO format", () => {
    expect(result.reviews[0].date).toBe("2023-10-25");
  });
  test("country", () => {
    expect(result.reviews[0].country).toBe("the United States");
  });
  test("verified_purchase true", () => {
    expect(result.reviews[0].verified_purchase).toBe(true);
  });
  test("helpful_votes (5 people)", () => {
    expect(result.reviews[0].helpful_votes).toBe(5);
  });
  test("hasCaptcha false", () => {
    expect(result.hasCaptcha).toBe(false);
  });
  test("isWrongPage false", () => {
    expect(result.isWrongPage).toBe(false);
  });
});

// ── Spanish standard review ───────────────────────────────────────────────────

describe("Spanish standard review (es_standard.html)", () => {
  let result;
  beforeAll(() => { result = run("es_standard.html"); });

  test("returns exactly one review", () => {
    expect(result.reviews).toHaveLength(1);
  });
  test("rating from '3.0 de 5 estrellas' (dot decimal, no comma)", () => {
    expect(result.reviews[0].rating).toBe(3.0);
  });
  test("date parsed from Spanish 'Calificado en … el 7 de febrero de 2026'", () => {
    expect(result.reviews[0].date).toBe("2026-02-07");
  });
  test("country extracted from Spanish date string", () => {
    expect(result.reviews[0].country).toBe("Estados Unidos");
  });
  test("helpful_votes from 'A 4 personas les resultó útil'", () => {
    expect(result.reviews[0].helpful_votes).toBe(4);
  });
  test("verified_purchase true", () => {
    expect(result.reviews[0].verified_purchase).toBe(true);
  });
});

// ── Rating CSS class fallback ─────────────────────────────────────────────────

describe("Rating CSS class fallback (en_css_rating_fallback.html)", () => {
  let result;
  beforeAll(() => { result = run("en_css_rating_fallback.html"); });

  test("returns exactly one review", () => {
    expect(result.reviews).toHaveLength(1);
  });
  test("rating comes from a-star-4 CSS class when no span.a-icon-alt", () => {
    expect(result.reviews[0].rating).toBe(4.0);
  });
  test("verified_purchase false (no avp-badge)", () => {
    expect(result.reviews[0].verified_purchase).toBe(false);
  });
});

// ── helpful_votes edge cases ──────────────────────────────────────────────────

describe("helpful_votes = 0 when element absent (en_no_helpful.html)", () => {
  let result;
  beforeAll(() => { result = run("en_no_helpful.html"); });

  test("returns exactly one review", () => {
    expect(result.reviews).toHaveLength(1);
  });
  test("helpful_votes is 0", () => {
    expect(result.reviews[0].helpful_votes).toBe(0);
  });
});

describe("helpful_votes = 1 for 'One person found this helpful' (en_helpful_one.html)", () => {
  let result;
  beforeAll(() => { result = run("en_helpful_one.html"); });

  test("helpful_votes is 1", () => {
    expect(result.reviews[0].helpful_votes).toBe(1);
  });
});

describe("helpful_votes = 1 for Spanish 'A una persona le resultó útil' (es_helpful_una.html)", () => {
  let result;
  beforeAll(() => { result = run("es_helpful_una.html"); });

  test("helpful_votes is 1", () => {
    expect(result.reviews[0].helpful_votes).toBe(1);
  });
  test("date parsed from 'Revisado en los Estados Unidos el 10 de marzo de 2024'", () => {
    expect(result.reviews[0].date).toBe("2024-03-10");
  });
  test("country from Revisado pattern", () => {
    expect(result.reviews[0].country).toBe("los Estados Unidos");
  });
});

// ── Detection flags ───────────────────────────────────────────────────────────

describe("hasCaptcha detection (captcha.html)", () => {
  let result;
  beforeAll(() => { result = run("captcha.html"); });

  test("reviews is empty", () => {
    expect(result.reviews).toHaveLength(0);
  });
  test("hasCaptcha is true", () => {
    expect(result.hasCaptcha).toBe(true);
  });
});

describe("isWrongPage detection (non-product-reviews URL)", () => {
  let result;
  beforeAll(() => {
    result = run("en_standard.html", "https://www.amazon.com/");
  });

  test("isWrongPage is true when URL has no /product-reviews/ path", () => {
    expect(result.isWrongPage).toBe(true);
  });
  test("asin is null when URL has no /product-reviews/ path", () => {
    expect(result.asin).toBeNull();
  });
});

// ── Skipped review cases ──────────────────────────────────────────────────────

describe("Review skipped when li has no id (no_review_id.html)", () => {
  let result;
  beforeAll(() => { result = run("no_review_id.html"); });

  test("reviews is empty", () => {
    expect(result.reviews).toHaveLength(0);
  });
});

describe("Review skipped when no .a-profile-name (no_reviewer_name.html)", () => {
  let result;
  beforeAll(() => { result = run("no_reviewer_name.html"); });

  test("reviews is empty", () => {
    expect(result.reviews).toHaveLength(0);
  });
});
