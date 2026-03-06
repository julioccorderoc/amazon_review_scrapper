# LOCALES.md — Locale Registry Guide

The locale registry (`locales.js`) centralises all Amazon-UI-language-specific knowledge.
Adding support for a new language is a single self-contained addition to one file.

---

## Registry Shape

Each entry in `ARS_LOCALES` describes one Amazon UI language:

| Field | Type | Description |
|---|---|---|
| `code` | `string` | BCP-47 language code prefix. Matched prefix-style against `document.documentElement.lang` (e.g. `"es"` matches `"es"`, `"es-US"`, `"es-419"`). |
| `datePatterns` | `RegExp[]` | Patterns tried in order against the review date element text. Each must capture **country in group 1** and **date string in group 2**. |
| `monthMap` | `Object\|null` | Maps localised month names (lowercase) to English equivalents. Set `null` when `new Date(dateStr)` works natively. |
| `helpfulPatterns` | `Array<{re, parse}>` | `re` matches the helpful-vote text; `parse(match)` returns the vote count as an integer. |

---

## How to Add a New Locale

### Step 1 — Find the date pattern

1. Open an Amazon product reviews page with Chrome's language set to the target language (Settings → Languages).
2. Right-click a review's date line and Inspect. The element has `data-hook="review-date"`. Copy its full text content, for example:

   ```text
   Beoordeeld in Nederland op 15 oktober 2023   (Dutch)
   ```

3. Write a regex capturing country in group 1 and the date string in group 2:

   ```js
   /Beoordeeld in (.+?) op (.+)/
   ```

4. If Amazon might use multiple verbs for the same locale (as with Spanish), add each as a separate entry in `datePatterns`. Put the most specific pattern first.

### Step 2 — Determine whether a monthMap is needed

Run this in a browser console:

```js
new Date("15 oktober 2023").toString()
```

- **`Invalid Date`** → you need a `monthMap`.
- **A valid date** → set `monthMap: null`.

To build the map, look up all 12 month names for the locale and translate them to English:

```js
monthMap: {
  januari: "January", februari: "February", maart: "March", april: "April",
  mei: "May", juni: "June", juli: "July", augustus: "August",
  september: "September", oktober: "October", november: "November", december: "December",
},
```

Keys must be **lowercase**; the extractor lowercases the captured month name before lookup.

### Step 3 — Find the helpful-vote pattern

1. Inspect a review that has helpful votes. The element has `data-hook="helpful-vote-statement"`. Copy its text, e.g.:

   ```text
   15 mensen vonden dit nuttig
   1 persoon vond dit nuttig
   ```

2. Write `re` and `parse` for each form (plural and singular):

   ```js
   helpfulPatterns: [
     { re: /^(\d+)\s+mensen/i,   parse: (m) => parseInt(m[1], 10) },
     { re: /^(\d+)\s+persoon/i,  parse: (m) => parseInt(m[1], 10) },
   ],
   ```

3. If the singular form uses a word instead of "1" (like Spanish `"una"`), handle it in `parse`:

   ```js
   parse: (m) => m[1].toLowerCase() === "een" ? 1 : parseInt(m[1], 10)
   ```

### Step 4 — Add the entry to `locales.js`

Insert the new object at the **end** of `ARS_LOCALES` (before the closing `]`):

```js
{
  code: "nl",
  datePatterns: [
    /Beoordeeld in (.+?) op (.+)/,
  ],
  monthMap: {
    januari: "January", februari: "February", maart: "March", april: "April",
    mei: "May", juni: "June", juli: "July", augustus: "August",
    september: "September", oktober: "October", november: "November", december: "December",
  },
  helpfulPatterns: [
    { re: /^(\d+)\s+mensen/i,  parse: (m) => parseInt(m[1], 10) },
    { re: /^(\d+)\s+persoon/i, parse: (m) => parseInt(m[1], 10) },
  ],
},
```

### Step 5 — Write the test fixture

1. Create `tests/js/fixtures/nl_standard.html` — a minimal page with one `<li data-hook="review">` containing:
   - A localised rating (`span.a-icon-alt` text or `a-star-N` CSS class)
   - A localised date (`data-hook="review-date"`)
   - A localised helpful-vote line (`data-hook="helpful-vote-statement"`)
   - Set `lang="nl"` on the `<html>` element so auto-detection kicks in.

2. Add a `describe` block in `tests/js/review-extractor.test.js`:

   ```js
   describe("Dutch standard review (nl_standard.html)", () => {
     let result;
     beforeAll(() => { result = run("nl_standard.html"); });

     test("date parsed from Dutch format", () => {
       expect(result.reviews[0].date).toBe("2023-10-15");
     });
     test("country extracted", () => {
       expect(result.reviews[0].country).toBe("Nederland");
     });
     test("helpful_votes parsed", () => {
       expect(result.reviews[0].helpful_votes).toBe(15);
     });
   });
   ```

### Step 6 — Verify

```bash
npm test          # all JS tests must pass
uv run pytest     # all Python tests must pass (no Python changes needed)
```

Then load the extension in Chrome (reload from `chrome://extensions`), navigate to an Amazon product reviews page in Dutch, open DevTools → Console, and confirm:

```logs
[ARS] detected lang=nl → locale=nl
```

---

## How Auto-detection Works (EPIC-017)

At the start of each extraction, `review-extractor.js` reads `document.documentElement.lang`
(e.g. `"es-US"`) and finds the first `ARS_LOCALES` entry whose `code` is a prefix of it (`"es"`).

- **Match found** → only that locale's `datePatterns` and `helpfulPatterns` are tried.
- **No match** → the full waterfall runs: all locales' patterns are tried in registry order.

The detected locale is always logged to the console:

```logs
[ARS] detected lang=es-US → locale=es
[ARS] detected lang=     → locale=waterfall   (page has no lang attribute)
```
