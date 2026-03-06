// Content script injected by executeScript({ files: ["locales.js", "review-extractor.js"] }).
// Runs inside the live Amazon review tab's browsing context.
// The IIFE's return value is what executeScript resolves with.
// Shape: { asin, reviews[], hasCaptcha, hasLoginWall, isWrongPage, _url, _title }
//
// ARS_LOCALES is provided by locales.js, which is injected first.

(function () {
  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  // ── Date parsing ───────────────────────────────────────────────────────────

  // Parse a date string to a Date object using an optional month name map.
  // monthMap: { localMonthName: "EnglishMonthName" } | null
  // Returns a Date, or null if unparseable.
  function parseLocalizedDate(s, monthMap) {
    let d = new Date(s); // works for English ("October 15, 2023")
    if (!isNaN(d.getTime())) return d;
    if (monthMap) {
      // "15 de octubre de 2023" / "15 de octubre del 2023" / "15 de outubro de 2023"
      const m = s.match(/(\d{1,2})\s+de\s+(\w+)\s+del?\s+(\d{4})/);
      if (m) {
        const month = monthMap[m[2].toLowerCase()];
        if (month) { d = new Date(`${month} ${m[1]}, ${m[3]}`); }
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  // ── Language auto-detection (EPIC-017) ────────────────────────────────────

  const lang = document.documentElement.lang || "";
  const detectedLocale = ARS_LOCALES.find(l => lang.toLowerCase().startsWith(l.code));
  console.log(`[ARS] detected lang=${lang} → locale=${detectedLocale ? detectedLocale.code : "waterfall"}`);

  // Flat entry lists built from all locales — used when auto-detection misses.
  const ALL_DATE_ENTRIES = ARS_LOCALES.flatMap(
    l => l.datePatterns.map(pattern => ({ pattern, monthMap: l.monthMap }))
  );
  const ALL_HELPFUL_PATTERNS = ARS_LOCALES.flatMap(l => l.helpfulPatterns);

  // Active lists: prefer detected locale; fall back to full waterfall.
  const DATE_ENTRIES = detectedLocale
    ? detectedLocale.datePatterns.map(p => ({ pattern: p, monthMap: detectedLocale.monthMap }))
    : ALL_DATE_ENTRIES;
  const HELPFUL_PATTERNS = detectedLocale
    ? detectedLocale.helpfulPatterns
    : ALL_HELPFUL_PATTERNS;

  // ── Extraction ────────────────────────────────────────────────────────────

  const asinMatch = window.location.href.match(/\/product-reviews\/([A-Z0-9]{10})/);
  const asin = asinMatch ? asinMatch[1] : null;
  const scrapedAt = new Date().toISOString();
  const reviews = [];

  for (const li of document.querySelectorAll('li[data-hook="review"]')) {
    const review_id = li.id || "";
    if (!review_id) continue;

    // reviewer_name
    const nameEl = li.querySelector(".a-profile-name");
    const reviewer_name = nameEl ? normalize(nameEl.textContent) : "";
    if (!reviewer_name) continue;

    // rating: prefer span.a-icon-alt text; fallback to CSS class a-star-N
    let rating = 1.0;
    let ratingFromText = false;
    const ratingAltEl = li.querySelector('[data-hook="review-star-rating"] span.a-icon-alt');
    if (ratingAltEl) {
      const ratingText = normalize(ratingAltEl.textContent);
      // English: "4.5 out of 5 stars"
      let rm = ratingText.match(/([\d.]+)\s+out of/);
      if (!rm) {
        // Spanish/Portuguese/Italian: "4,5 de 5 estrellas" / "3.0 de 5 estrellas"
        rm = ratingText.match(/([\d.,]+)\s+de\s+\d/);
      }
      if (rm) {
        rating = parseFloat(rm[1].replace(",", "."));
        ratingFromText = true;
      }
    }
    // CSS class fallback — used when span.a-icon-alt is absent OR when text parsing failed
    if (!ratingFromText) {
      const starEl = li.querySelector('[data-hook="review-star-rating"]');
      if (starEl) {
        for (const cls of starEl.classList) {
          const m = cls.match(/^a-star-(\d)$/);
          if (m) { rating = parseFloat(m[1]); break; }
        }
      }
    }

    // title: first direct-child span (not hidden) with non-empty normalized text
    let title = "";
    for (const span of li.querySelectorAll('[data-hook="review-title"] > span:not(.aok-hidden)')) {
      const t = normalize(span.textContent);
      if (t) { title = t; break; }
    }
    if (!title) continue;

    // body: prefer span inside review-body; fallback to review-body itself
    // Use innerText to preserve line breaks; do NOT normalize
    const bodyEl = li.querySelector('[data-hook="review-body"] span') ||
                   li.querySelector('[data-hook="review-body"]');
    // innerText preserves line breaks in browsers; jsdom doesn't implement it so fall back to textContent
    const body = bodyEl ? (bodyEl.innerText ?? bodyEl.textContent).trim() : "";
    if (!body) continue;

    // date & country — try the detected locale's patterns; fall back to the full waterfall.
    // Amazon renders dates in the browser's language, so a Chrome set to Spanish shows
    // "Calificado en … el 15 de octubre de 2023" instead of "Reviewed in … on October 15, 2023".
    // Date is non-blocking: if no pattern matches, the review is still included with date: null.
    let date = null;
    let country = "";
    const dateEl = li.querySelector('[data-hook="review-date"]');
    if (dateEl) {
      const dateText = normalize(dateEl.textContent);
      for (const { pattern, monthMap } of DATE_ENTRIES) {
        const m = dateText.match(pattern);
        if (m) {
          country = m[1].trim();
          const parsed = parseLocalizedDate(m[2].trim(), monthMap);
          // Store ISO date if parseable; raw text otherwise — never null out the review
          date = parsed ? parsed.toISOString().slice(0, 10) : m[2].trim();
          break;
        }
      }
    }

    // verified_purchase
    const verified_purchase = !!li.querySelector('[data-hook="avp-badge"]');

    // helpful_votes — multi-locale patterns
    let helpful_votes = 0;
    const helpfulEl = li.querySelector('[data-hook="helpful-vote-statement"]');
    if (helpfulEl) {
      const helpText = normalize(helpfulEl.textContent);
      for (const { re, parse } of HELPFUL_PATTERNS) {
        const hm = helpText.match(re);
        if (hm) { helpful_votes = parse(hm); break; }
      }
    }

    reviews.push({
      review_id,
      reviewer_name,
      rating,
      title,
      body,
      date,
      country,
      verified_purchase,
      helpful_votes,
      scraped_at: scrapedAt,
    });
  }

  const bodyText = document.body.textContent;

  const hasCaptcha = reviews.length === 0 &&
    bodyText.includes("Enter the characters you see below");

  // Login wall: Amazon redirected to sign-in, or shows a sign-in gate
  // in-page (e.g. to see more reviews). Checked after review extraction
  // so a partial page that has some reviews + a gate is still counted.
  const hasLoginWall = reviews.length === 0 && (
    !!document.querySelector('#ap_email, #signInSubmit, [name="signIn"]') ||
    bodyText.includes("Sign in to see all reviews") ||
    bodyText.includes("Sign in to see your reviews") ||
    bodyText.includes("to see more reviews")
  );

  // Wrong page: URL no longer points at a product-reviews path.
  // Catches geo-redirects (amazon.com → amazon.co.uk homepage),
  // "page not found", maintenance pages, etc.
  const isWrongPage = !window.location.pathname.includes("/product-reviews/");

  return {
    asin: asin ?? null,
    reviews,
    hasCaptcha,
    hasLoginWall,
    isWrongPage,
    _url: window.location.href,
    _title: document.title,
  };
})();
