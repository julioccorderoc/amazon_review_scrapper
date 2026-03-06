// Locale registry for the Amazon Review Scraper extension.
// Injected by executeScript before review-extractor.js, so this file must assign
// to a var (not const/let) to make ARS_LOCALES available as a page-level global.
//
// Each entry describes one Amazon UI language. Fields:
//   code:            BCP-47 language code prefix — matched against document.documentElement.lang
//   datePatterns:    RegExp[] — each must capture (country, dateStr) in groups 1 and 2
//   monthMap:        Object|null — local month name → English month name; null when new Date(s) works natively
//   helpfulPatterns: Array<{re, parse}> — re captures vote count in group 1; parse(match) returns integer
//
// See src/extension/LOCALES.md for the full guide on adding a new locale.

var ARS_LOCALES = [
  {
    code: "en",
    datePatterns: [
      /Reviewed in (.+?) on (.+)/,
    ],
    monthMap: null, // new Date("October 15, 2023") works natively
    helpfulPatterns: [
      // "5 people found this helpful" / "One person found this helpful"
      {
        re: /^(\d+|[Oo]ne)\s+(?:people?|person)\s+found/i,
        parse: (m) => m[1].toLowerCase() === "one" ? 1 : parseInt(m[1], 10),
      },
    ],
  },
  {
    code: "es",
    datePatterns: [
      // Explicit known verbs — preferred; catches the vast majority of cases
      /(?:Revisado|Reseñado|Calificado|Valorado|Evaluado|Opinado) en (.+?) el (.+)/i,
      // Generic catch-all for any other Spanish verb Amazon might use
      /\w+ en (.+?) el (\d.+)/,
    ],
    monthMap: {
      enero: "January", febrero: "February", marzo: "March", abril: "April",
      mayo: "May", junio: "June", julio: "July", agosto: "August",
      septiembre: "September", octubre: "October", noviembre: "November", diciembre: "December",
    },
    helpfulPatterns: [
      // "A 4 personas les resultó útil" / "A una persona le resultó útil"
      {
        re: /A\s+(\d+|una)\s+persona/i,
        parse: (m) => m[1].toLowerCase() === "una" ? 1 : parseInt(m[1], 10),
      },
    ],
  },
  {
    code: "pt",
    datePatterns: [
      /Avaliado n[oa] (.+?) em (.+)/,
    ],
    monthMap: {
      janeiro: "January", fevereiro: "February", março: "March", abril: "April",
      maio: "May", junho: "June", julho: "July", agosto: "August",
      setembro: "September", outubro: "October", novembro: "November", dezembro: "December",
    },
    helpfulPatterns: [
      // "12 pessoas acharam isso útil"
      {
        re: /^(\d+)\s+pessoa/i,
        parse: (m) => parseInt(m[1], 10),
      },
    ],
  },
  {
    code: "fr",
    datePatterns: [
      /Évalué en (.+?) le (.+)/,
    ],
    monthMap: null,
    helpfulPatterns: [
      // "12 personnes ont trouvé cela utile"
      {
        re: /^(\d+)\s+personne/i,
        parse: (m) => parseInt(m[1], 10),
      },
    ],
  },
  {
    code: "de",
    datePatterns: [
      /Rezensiert in (.+?) am (.+)/,
    ],
    monthMap: null,
    helpfulPatterns: [],
  },
  {
    code: "it",
    datePatterns: [
      /Recensito in (.+?) il (.+)/,
    ],
    monthMap: null,
    helpfulPatterns: [],
  },
];
