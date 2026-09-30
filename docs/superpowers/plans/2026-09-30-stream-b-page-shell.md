# Map-first page shell and copy (stream B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the tracker's front end as a map-first shell (full-viewport map, one compact panel, filter bar, date scrubber, record drawer, footer strip), move every explanatory paragraph to a new `/about`, and lift the shared helpers and generated copy into one tested module.

**Architecture:** Three static pages served from `site/`, no framework and no bundler. `site/lib.js` is a classic script that publishes one object on `globalThis` and holds every shared helper plus the generated copy templates, so the sentences that carry a number and its basis are unit-tested rather than typed into three files. `site/app.js` keeps the hard-won Leaflet geometry, loaders and filter pipeline and is rewritten around the panel, the filter bar, the scrubber and the drawer. `site/about.js` renders the counting bases, sources, placement, eras and milestones from `summary.json`. `site/history.js` loses its private helpers to `lib.js` and changes in no other way.

**Tech Stack:** HTML, CSS custom properties, ES2018 vanilla JS as classic scripts, vendored Leaflet 1.9, `node:test` for unit tests, `/sitecheck` as the multi-viewport QA gate, Playwright CLI for the Open Graph card and for the few behaviours the harness cannot judge, Vercel static hosting with `cleanUrls`.

**Spec:** `docs/superpowers/specs/2026-09-30-map-first-rebuild-design.md` (this plan covers sections 5.1 to 5.6, the copy rules in 5.3, the two page-side items in 4.3, the OG card in 5.4, and the front-end half of section 7)

## Global Constraints

- **No em dashes anywhere**, in code, comments, copy or commit messages. Commas, colons and full stops only. Dates read `29 Sep 2026` in the UI and ISO in data.
- **No framework, no bundler, no runtime build step** for this stream. Every script is a classic `<script src>`, except the one dynamic `import('./birds.js')` in Task 10.
- **No inline scripts and no inline `style` attributes.** The CSP is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; font-src 'self' data:; connect-src 'self'`. An inline `<script>`, an inline `style=` or a remote script breaks the page in production and cannot be caught locally, because `pipeline/serve.mjs` sends no CSP header.
- **Files this stream may edit.** Create: `site/lib.js`, `site/about.html`, `site/about.js`, `site/og.html`, `site/og.css`, `site/og.js`, `site/sitemap.xml`, `site/test/lib.test.mjs`, `site/test/fixtures/summary.new.json`. Modify: `site/index.html`, `site/history.html`, `site/app.js`, `site/history.js`, `site/icons.js`, `site/styles.css`, `site/assets/img/og-card.png` (overwrite), `site/assets/img/CREDITS.md`. Anything else, stop and ask.
- **Everything under `site/` is published.** `site/og.html` therefore carries `<meta name="robots" content="noindex">` and is absent from the sitemap. `site/test/**` is served as plain text and leaks nothing; stream E owns `vercel.json` and may exclude it later.
- **Document links and asset URLs are root relative** (`/`, `/about`, `/history`, `/styles.css`, `/assets/...`). **Data fetches stay page relative** (`data/summary.json`), unchanged from today, because all three pages are served at depth 0 and the existing loader code is on the keep list. Never link to `about.html` or `history.html`: `cleanUrls` answers those with a 308 to the extensionless path, verified live on 30 Sep 2026, so an internal `.html` link costs every reader a redirect.
- **The canonical host is `https://www.birdflutracker.org/`.** Verified 30 Sep 2026: the apex 308-redirects to `www`, and `www` answers 200. Every `<link rel="canonical">`, `og:url` and sitemap entry uses the `www` host. The pages currently point at the apex, which is a defect this stream fixes.
- **Every new `summary.json` field is read defensively.** Stream A publishes `freshness`, `official_au` (new shape), `official_series`, `milestones`, `placement_stats` and `au_layers` in parallel with this stream, so each page must render correctly against the data committed today, which has none of them. A missing block says so in words. A missing number never renders as a blank, a dash or a zero.
- **Safety copy is static markup on every page, never rendered by JS**: the hotline, "do not touch or move sick or dead birds" and "not medical advice". A JS failure must not be able to remove a safety line.
- **Colour law, amended.** Carmine (`--live`) means the live outbreak on the map, and a data-freshness alarm in the panel. Nothing else. Precision and layer are also carried by shape, so colour never carries meaning alone. See the flagged conflict below.
- **Word budget.** Under 120 words visible on `/` before any interaction, excluding figures and labels. Task 13 counts them.
- **Accessibility floor.** Every control is a native element (`button`, `select`, `input[type=range]`, `input[type=checkbox]`). The global `:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }` at `site/styles.css:156` already covers focus, so no task adds a focus style. Tap targets stay at the existing 44px minimum below 940px.
- **Commit steps** are written for whoever drives the plan. Per the repo's working rules a subagent stops at its commit step and hands the parent the exact staged file list. The commit messages below show the subject line only; the executing session appends the attribution lines its own instructions supply.

## Verified corrections to the spec

Checked against the files on 30 Sep 2026. Use these, not the spec's numbers.

1. **`styles.css` drop range.** The spec says drop "the news and sources lists (1286-1361)". Lines 1333 to 1359 are section 17 (`.notes-list`, `.disclaimer`, `.footnote`, `.callout`), which the new footer strip and `/about` both use, and lines 1314 to 1331 are the sources list, which `/about` now needs. **Drop only section 15, the news list, lines 1285 to 1312.** Keep sections 16 and 17.
2. **`styles.css` block boundaries.** Section 19 (`.sb-*`, `.og-*`) is lines 1406 to 1496, not 1407 to 1498. Section 20 (legacy aliases) is 1498 to 1513, not 1499 to 1515.
3. **`icons.js` duplicate builder.** The two builders are `mark()` at `site/icons.js:206` and `catMark()` at `site/app.js:278`, not both in `icons.js`. `Icons.withLabel()` at `site/icons.js:235` is also dead and emits `.cat`, `.cat-mark` and `.cat-text`, none of which the stylesheet defines, so it renders unstyled. Task 2 deletes both.
4. **`app.js` drop ranges are correct as written** in spec 5.6, all ten of them, verified line by line.
5. **Local preview does not implement `cleanUrls`.** `pipeline/serve.mjs` maps a directory to `index.html` and nothing else, so `/about` 404s locally. Local checks open `/index.html`, `/about.html` and `/history.html` directly; the extensionless nav links are verified on the preview deployment. Teaching `serve.mjs` extensionless resolution is a one-line change in `pipeline/`, which is stream A's allowlist, so this plan does not make it.

## Flagged spec conflict, and the decision taken

Spec 5.2 spends carmine on data freshness twice: the stale line "in carmine when the canary thresholds are crossed", and "a run that fell back shows a carmine banner at the top of the panel". Spec 5.4 says "Carmine means the live outbreak and nothing else", which is also the standing invariant in `site/styles.css:56` and the header comment of `site/app.js`.

**Decision: follow 5.2.** The failure this rebuild exists to fix is stale data presented as current, and the spec author allocated the alarm colour to it deliberately in two separate subsections. Marks are squares and rings on the map; the freshness line is a sentence in the panel, so the two cannot be confused. The colour law in Global Constraints is amended to say so out loud, and `/about#marks` states it for the reader. Raise it with Alex if he wants 5.4 to win instead: the change is then one CSS class and one line of `/about` copy.

## Interfaces this stream consumes from other streams

Named here once so no task repeats them.

- **Stream A, `site/data/summary.json`** gains `freshness` `{generated_at, run_host, dataset_date, as_at, sources:{key:{status:"ok"|"error"|"restored", fetched_at, records, note}}}`; `official_au` `{ok, fetched_at, as_at, as_at_text, national_total, hotline_reports, by_jurisdiction:{WA,SA,NSW,QLD,VIC,TAS,OT}, by_jurisdiction_total, dataset_rows, dataset_matches_total, source_url, dataset_url}`; `official_series` `[{date,total,url}]` ascending; `milestones` `[{date,text,url}]`; `placement_stats` `{locality,lga,state,unplaced}`; `au_layers` `{official:{records,current_era,jurisdictions,jurisdiction_list,latest_sampled,latest_sampled_locality,species_top:[{name,count}]}, woah:{records,latest}}`. Existing keys (`au`, `eras`, `au_eras`, `status`, `human_context`, `totals`, `by_category`, `sources`, `context_sources`, `references`, `coverage_signal`) stay.
- **Stream A, `site/data/detections/au.json`** holds official records first (`id, layer:"official", record_id, record_class, category, country, admin1, admin1_code, admin1_note?, lga, locality, lat, lng, level, precision:"locality"|"lga"|"state", date, date_basis:"sampled"|"first_seen", first_seen, withdrawn?, subtype:"H5", confidence:"confirmed", species, species_scientific, species_class?, source, source_url, era, era_current`) then FAO records with `layer:"woah"` and today's field set. `index.json`, `us.json` and `row.json` keep their shape.
- **Stream A, `package.json`** gains the `test` script. This plan's verification runs `node --test site/test/` directly so it does not wait on that, and Task 14 also runs `npm test` once the script exists.
- **Stream D, `site/birds.js`**, an ES module exporting `flight(hostElement) -> Promise`, `figure(canvasElement, speciesSlug) -> {dispose()}` and `speciesSlug(commonName) -> string`. Every device, motion and memory gate lives inside it. `app.js` checks `sessionStorage.getItem('birds-flight')` before calling `flight` and sets it after, and does nothing else. Task 10 adds exactly two call sites, both guarded so the page works when the import fails.
- **Stream C, `site/assets/birds/greater-crested-tern.png`**, the ink tern still used by the OG card in Task 12.

---

### Task 1: `site/lib.js`, the shared helpers and the generated copy

The one place a date is formatted, a URL is trusted, or a sentence with a number in it is built. `app.js` has `niceDate`, `history.js` has `formatDay` and `formatStamp`, and the two disagree: one prints `29 Sep 2026` through `toLocaleDateString`, the other `29 September 2026` from a fixed array. One formatter replaces all three.

Intl is not used for the date, on purpose: `en-AU` and `en-GB` both render September as `Sept`, and the copy rule fixes the form as `29 Sep 2026`. Intl **is** used for the eastern Australian wall clock, because the department publishes in AEST and the nightly run is scheduled in it, and a hand-rolled offset would be wrong for eight months of the year.

**Files:**
- Create: `site/lib.js`
- Create: `site/test/lib.test.mjs`
- Create: `site/test/fixtures/summary.new.json`

**Interfaces:**
- Consumes: nothing. This is the first task.
- Produces: `globalThis.Lib` with `$(sel, scope)`, `esc(s)`, `safeUrl(u)`, `linkHtml(url, text)`, `plural(n, one, many)`, `isIsoDay(s)`, `fmtDay(iso)`, `fmtMonthYear(iso)`, `fmtStampAu(iso)`, `fmtTimeAu(iso)`, `auZoneLabel(raw)`, `dayIndex(iso)`, `isoDay(n)`, `daysBetween(a, b)`, `citationsHtml(cits)`, `freshnessLine(freshness, officialAu, nowMs)`, `panelHeadline(summary, layer, eraStartIso)`, `placementSentence(record)`. Tasks 3, 5, 6, 7, 8, 9 and 11 all use it.

- [ ] **Step 1: Write the failing test**

Create `site/test/lib.test.mjs`:

```js
/* Unit tests for site/lib.js.
 *
 * lib.js is a classic browser script: it has no import and no export, and it
 * publishes one object on globalThis. A side-effect import runs it here exactly
 * as a <script src> would in the browser, so the tests exercise the shipped file
 * rather than a node-only copy of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../lib.js');
const Lib = globalThis.Lib;

const NEW_SUMMARY = JSON.parse(
  readFileSync(new URL('./fixtures/summary.new.json', import.meta.url), 'utf8')
);

test('esc escapes the five characters that can break out of markup', () => {
  assert.equal(Lib.esc('<a href="x">&\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(Lib.esc(null), '');
  assert.equal(Lib.esc(0), '0');
});

test('safeUrl passes http and https and rejects every other scheme', () => {
  assert.equal(Lib.safeUrl('https://www.agriculture.gov.au/x'), 'https://www.agriculture.gov.au/x');
  assert.equal(Lib.safeUrl('http://example.org'), 'http://example.org');
  assert.equal(Lib.safeUrl('javascript:alert(1)'), '');
  assert.equal(Lib.safeUrl('data:text/html,x'), '');
  assert.equal(Lib.safeUrl(null), '');
});

test('linkHtml falls back to escaped text when the URL is unusable', () => {
  assert.equal(Lib.linkHtml('https://example.org', 'Source'),
    '<a href="https://example.org" rel="noopener">Source</a>');
  assert.equal(Lib.linkHtml('javascript:x', 'Source'), 'Source');
});

test('plural picks the singular only for exactly one', () => {
  assert.equal(Lib.plural(1, 'event', 'events'), 'event');
  assert.equal(Lib.plural(0, 'event', 'events'), 'events');
  assert.equal(Lib.plural(668, 'event', 'events'), 'events');
});

test('fmtDay prints the one UI date form and nothing else', () => {
  assert.equal(Lib.fmtDay('2026-09-29'), '29 Sep 2026');
  assert.equal(Lib.fmtDay('2026-06-01'), '1 Jun 2026');
  assert.equal(Lib.fmtDay(''), '');
  assert.equal(Lib.fmtDay('not a date'), '');
  assert.equal(Lib.fmtDay('2026-09-29T14:00:00Z'), '');
});

test('fmtMonthYear names the month in full for a sentence', () => {
  assert.equal(Lib.fmtMonthYear('2026-06-20'), 'June 2026');
  assert.equal(Lib.fmtMonthYear('bad'), '');
});

test('auZoneLabel normalises whatever the engine returns for the zone', () => {
  assert.equal(Lib.auZoneLabel('AEST'), 'AEST');
  assert.equal(Lib.auZoneLabel('AEDT'), 'AEDT');
  assert.equal(Lib.auZoneLabel('GMT+10'), 'AEST');
  assert.equal(Lib.auZoneLabel('GMT+11'), 'AEDT');
  assert.equal(Lib.auZoneLabel('UTC'), 'UTC');
});

test('fmtStampAu prints the eastern Australian wall clock across the DST boundary', () => {
  assert.equal(Lib.fmtStampAu('2026-09-30T09:28:33.831Z'), '30 Sep 2026, 19:28 AEST');
  assert.equal(Lib.fmtStampAu('2026-10-06T08:45:00.000Z'), '6 Oct 2026, 19:45 AEDT');
  assert.equal(Lib.fmtStampAu(''), '');
  assert.equal(Lib.fmtStampAu('not a stamp'), '');
});

test('fmtTimeAu prints the time and its zone with no date', () => {
  assert.equal(Lib.fmtTimeAu('2026-09-30T09:28:33.831Z'), '19:28 AEST');
});

test('day arithmetic is whole UTC days, so no reader timezone shifts a count', () => {
  assert.equal(Lib.isoDay(Lib.dayIndex('2026-09-29')), '2026-09-29');
  assert.equal(Lib.daysBetween('2026-06-15', '2026-09-29'), 106);
  assert.equal(Lib.daysBetween('2026-09-29', '2026-06-15'), -106);
  assert.equal(Lib.isoDay(Lib.dayIndex('2026-06-15') + 106), '2026-09-29');
});

test('freshnessLine reports the run as fresh when it is', () => {
  const r = Lib.freshnessLine(
    { generated_at: '2026-09-30T09:28:33.831Z' },
    { as_at: '2026-09-29T06:00:00Z' },
    Date.parse('2026-09-30T12:00:00Z')
  );
  assert.equal(r.kind, 'ok');
  assert.equal(r.text, 'Data checked today at 19:28 AEST.');
});

test('freshnessLine reports a run older than 36 hours as stale, in days', () => {
  const r = Lib.freshnessLine(
    { generated_at: '2026-09-27T09:28:00Z' },
    { as_at: '2026-09-27T06:00:00Z' },
    Date.parse('2026-09-30T12:00:00Z')
  );
  assert.equal(r.kind, 'stale');
  assert.equal(r.text, 'Data last updated 3 days ago.');
});

test('freshnessLine names an old official figure behind a fresh run', () => {
  const r = Lib.freshnessLine(
    { generated_at: '2026-09-30T09:28:33.831Z' },
    { as_at: '2026-09-25T06:00:00Z' },
    Date.parse('2026-09-30T12:00:00Z')
  );
  assert.equal(r.kind, 'official-stale');
  assert.equal(r.text, 'Official figure from 25 Sep 2026; the department has not published since.');
});

test('freshnessLine says so when the build recorded no run time', () => {
  const r = Lib.freshnessLine({}, {}, Date.parse('2026-09-30T12:00:00Z'));
  assert.equal(r.kind, 'unknown');
  assert.match(r.text, /did not record when it ran/);
});

test('panelHeadline generates the official sentence from data', () => {
  assert.equal(
    Lib.panelHeadline(NEW_SUMMARY, 'official', '2026-06-20'),
    'H5 bird flu has been confirmed in 668 wild animals across 7 jurisdictions since June 2026.'
  );
});

test('panelHeadline drops the since clause when no era start is known', () => {
  assert.equal(
    Lib.panelHeadline(NEW_SUMMARY, 'official', null),
    'H5 bird flu has been confirmed in 668 wild animals across 7 jurisdictions.'
  );
});

test('panelHeadline states the basis for the other two layers', () => {
  assert.equal(
    Lib.panelHeadline(NEW_SUMMARY, 'woah', '2026-06-20'),
    'WOAH has been notified of 393 H5 events in Australia since June 2026.'
  );
  assert.equal(
    Lib.panelHeadline(NEW_SUMMARY, 'world', '2026-06-20'),
    'The world layer shows H5 events notified to WOAH in the last 90 days, outside Australia.'
  );
});

test('panelHeadline refuses to state a count the build did not publish', () => {
  const r = Lib.panelHeadline({ au_layers: {}, official_au: {} }, 'official', '2026-06-20');
  assert.match(r, /were not published in this build/);
  assert.doesNotMatch(r, /\d/);
});

test('placementSentence states the precision in words for every case', () => {
  assert.match(Lib.placementSentence({ precision: 'locality' }), /^Placed at the locality centroid/);
  assert.match(Lib.placementSentence({ precision: 'lga' }), /local government area/);
  assert.match(Lib.placementSentence({ precision: 'state' }), /centre of the jurisdiction/);
  assert.match(Lib.placementSentence({ level: 'admin1' }), /no specific location/);
  assert.match(Lib.placementSentence({ level: 'point' }), /coordinates the source published/);
});

test('citationsHtml never hides an unsourced entry', () => {
  assert.match(Lib.citationsHtml([]), /Unsourced/);
  assert.match(Lib.citationsHtml(null), /Unsourced/);
  assert.equal(
    Lib.citationsHtml([{ publisher: 'DAFF', title: 'Latest data', url: 'https://example.org' }]),
    '<p class="cite">DAFF, <a href="https://example.org" rel="noopener">Latest data</a></p>'
  );
  const two = Lib.citationsHtml([
    { publisher: 'DAFF', title: 'A', url: 'https://example.org/a' },
    { publisher: 'WOAH', title: 'B', url: 'https://example.org/b' },
  ]);
  assert.match(two, /^<ul class="cite-list"/);
  assert.equal((two.match(/<li>/g) || []).length, 2);
});

test('citationsHtml marks a citation with no usable link rather than dropping it', () => {
  const html = Lib.citationsHtml([{ publisher: 'DAFF', title: 'A', url: 'javascript:x' }]);
  assert.match(html, /no link published/);
  assert.doesNotMatch(html, /<a /);
});

test('no generated sentence contains an em dash or an en dash', () => {
  const strings = [
    Lib.panelHeadline(NEW_SUMMARY, 'official', '2026-06-20'),
    Lib.panelHeadline(NEW_SUMMARY, 'woah', '2026-06-20'),
    Lib.panelHeadline(NEW_SUMMARY, 'world', '2026-06-20'),
    Lib.freshnessLine({ generated_at: '2026-09-27T09:28:00Z' }, {}, Date.parse('2026-09-30T12:00:00Z')).text,
    Lib.placementSentence({ precision: 'locality' }),
    Lib.placementSentence({ precision: 'lga' }),
    Lib.placementSentence({ precision: 'state' }),
    Lib.citationsHtml([]),
  ];
  for (const s of strings) assert.doesNotMatch(s, /[\u2013\u2014]/);
});
```

- [ ] **Step 2: Write the fixture the tests read**

Create `site/test/fixtures/summary.new.json`. A minimal, hand-written example of stream A's contract, carrying only the keys the copy templates touch. It exists so the templates are tested against the new shape before stream A lands, and so a later change to that shape fails here rather than in the browser.

```json
{
  "generated_at": "2026-09-30T09:28:33.831Z",
  "freshness": {
    "generated_at": "2026-09-30T09:28:33.831Z",
    "run_host": "residential",
    "dataset_date": "2026-09-29",
    "as_at": "2026-09-29T06:00:00Z",
    "sources": {
      "daff-events": { "status": "ok", "fetched_at": "2026-09-30T09:20:00Z", "records": 668, "note": "668 data rows" },
      "daff-latest": { "status": "ok", "fetched_at": "2026-09-30T09:21:00Z", "records": 7, "note": "per jurisdiction" },
      "daff-updates": { "status": "ok", "fetched_at": "2026-09-30T09:22:00Z", "records": 14, "note": "dated statements" },
      "fao-au": { "status": "ok", "fetched_at": "2026-09-30T09:24:00Z", "records": 393, "note": "" },
      "fao-world": { "status": "ok", "fetched_at": "2026-09-30T09:25:00Z", "records": 2095, "note": "90 day window" }
    }
  },
  "official_au": {
    "ok": true,
    "fetched_at": "2026-09-30T09:21:00Z",
    "as_at": "2026-09-29T06:00:00Z",
    "as_at_text": "4 pm AEST, 29 September 2026",
    "national_total": 668,
    "hotline_reports": 1420,
    "by_jurisdiction": { "WA": 233, "SA": 191, "NSW": 96, "QLD": 62, "VIC": 58, "TAS": 26, "OT": 2 },
    "by_jurisdiction_total": 668,
    "dataset_rows": 668,
    "dataset_matches_total": true,
    "source_url": "https://www.agriculture.gov.au/campaigns/birdflu/latest-data",
    "dataset_url": "https://www.agriculture.gov.au/sites/default/files/documents/H5_bird_flu_events.xlsx"
  },
  "official_series": [
    { "date": "2026-09-11", "total": 231, "url": "https://www.agriculture.gov.au/about/news/H5-bird-flu-updates#s-2026-09-11" },
    { "date": "2026-09-25", "total": 604, "url": "https://www.agriculture.gov.au/about/news/H5-bird-flu-updates#s-2026-09-25" }
  ],
  "milestones": [
    { "date": "2026-06-20", "text": "This is the first detection of H5 bird flu in Australia.", "url": "https://www.agriculture.gov.au/about/news/H5-bird-flu-updates#s-2026-06-20" }
  ],
  "placement_stats": { "locality": 631, "lga": 33, "state": 4, "unplaced": 0 },
  "au_layers": {
    "official": {
      "records": 668,
      "current_era": "au_h5n1_2026",
      "jurisdictions": 7,
      "jurisdiction_list": ["Western Australia", "South Australia", "New South Wales", "Queensland", "Victoria", "Tasmania", "Other Territories"],
      "latest_sampled": "2026-09-27",
      "latest_sampled_locality": "Point Lowly, South Australia",
      "species_top": [
        { "name": "Greater crested tern", "count": 214 },
        { "name": "Silver gull", "count": 121 },
        { "name": "Australian pelican", "count": 64 },
        { "name": "Southern giant petrel", "count": 41 },
        { "name": "Brown skua", "count": 33 },
        { "name": "Pacific gull", "count": 28 },
        { "name": "Little penguin", "count": 19 }
      ]
    },
    "woah": { "records": 393, "latest": "2026-09-22" }
  },
  "eras": {
    "current_au_era": "au_h5n1_2026",
    "definitions": [
      {
        "id": "au_h5n1_2026",
        "current": true,
        "status": "ongoing",
        "label": "Current H5N1 incursion, clade 2.3.4.4b, from June 2026",
        "short_label": "Current H5N1 incursion",
        "strain": "H5N1 clade 2.3.4.4b",
        "summary": "The event this tracker follows. High pathogenicity H5N1 in Australian wild birds, first detected in June 2026 and still developing."
      },
      {
        "id": "au_h7_2024",
        "current": false,
        "status": "resolved",
        "label": "H7 poultry outbreaks, 2024 to 2025",
        "short_label": "H7 poultry outbreaks",
        "strain": "H7",
        "summary": "Separate high pathogenicity H7 outbreaks in Australian poultry, declared resolved. A different subtype, never added to the H5 figures."
      }
    ]
  }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node --test site/test/lib.test.mjs`
Expected: FAIL. Every test errors, because `site/lib.js` does not exist yet, so the side-effect import throws `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Write `site/lib.js`**

Create `site/lib.js`:

```js
/* Shared helpers for the three pages of this site, and the generated copy.
 *
 * Two things live here and nothing else does.
 *
 * 1  THE HELPERS THE PAGES SHARE. app.js, about.js and history.js each had their
 *    own escape, URL guard and date formatter, and the date formatters
 *    disagreed: one printed "29 Sep 2026" through toLocaleDateString and the
 *    other "29 September 2026" from a fixed array, so the same date read two
 *    ways on two pages of one site. There is one of each here now.
 *
 * 2  THE GENERATED SENTENCES. Every sentence on the site that carries a number
 *    also has to carry that number's basis and its as-at date, which is a design
 *    rule that is easy to break by hand and impossible to test by hand. The
 *    templates are functions here, and site/test/lib.test.mjs asserts their
 *    exact output, including that none of them contains a dash.
 *
 * Loaded as a classic script, so there is no import and no export: the module
 * publishes one object, globalThis.Lib. node:test runs the same file through a
 * side-effect import, which works because a script with no export is still a
 * valid ES module, so the tests exercise the shipped file rather than a copy.
 *
 * No Intl for a date. en-AU and en-GB both render September as "Sept", and the
 * copy rule fixes the UI form as "29 Sep 2026", so month names come from a fixed
 * array. Intl IS used for the eastern Australian wall clock, because the
 * department publishes in AEST and the nightly run is scheduled in it, and a
 * hand-rolled offset would be wrong for the eight months of the year that are
 * not AEST.
 */
'use strict';

(function (root) {
  /* The department's timezone. Sydney and Melbourne share it, and the IANA zone
   * carries the DST rules so AEST and AEDT are never guessed. */
  var TZ = 'Australia/Sydney';
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MS_DAY = 86400000;
  /* The same two thresholds the freshness canary uses, so the page and the alert
   * cannot disagree about what stale means. See spec 4.2. */
  var STALE_RUN_HOURS = 36;
  var STALE_AS_AT_DAYS = 4;

  function $(sel, scope) { return (scope || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Every URL on this site arrives from outside: agency pages, WOAH
   * notifications through the FAO feed, citation lists. esc stops an attribute
   * breakout but does not restrict the scheme, so an escaped javascript: value
   * would still render as a live link. http and https only; anything else
   * returns an empty string and the caller renders plain text. */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  function linkHtml(url, text) {
    var href = safeUrl(url);
    return href
      ? '<a href="' + esc(href) + '" rel="noopener">' + esc(text) + '</a>'
      : esc(text);
  }

  function plural(n, one, many) { return Number(n) === 1 ? one : many; }

  function isIsoDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  /* "2026-09-29" to "29 Sep 2026". Parsed in UTC so the printed day never shifts
   * with the reader's timezone. A value that is not a plain ISO day returns an
   * empty string: the caller decides what "not published" should read as, so no
   * placeholder is ever invented here. */
  function fmtDay(iso) {
    if (!isIsoDay(iso)) return '';
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.getUTCDate() + ' ' + MONTHS_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* "2026-06-20" to "June 2026", for a sentence that names a month. */
  function fmtMonthYear(iso) {
    if (!isIsoDay(iso)) return '';
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    return MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* Engines disagree on the short zone name: en-AU returns AEST and AEDT, en-GB
   * returns GMT+10 and GMT+11. Normalise to the form the department uses. An
   * unrecognised value is passed through rather than replaced with a guess. */
  function auZoneLabel(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (/^AE[SD]T$/.test(s)) return s;
    if (s === 'GMT+10' || s === 'UTC+10' || s === '+10') return 'AEST';
    if (s === 'GMT+11' || s === 'UTC+11' || s === '+11') return 'AEDT';
    return s;
  }

  /* The wall clock in the department's timezone, as parts. hourCycle h23 rather
   * than hour12 false, because hour12 false prints midnight as 24:00 in some
   * engines. Numeric parts are locale independent, so only the zone name needs
   * normalising. Returns null when Intl has no timezone data. */
  function auParts(date) {
    var out = {};
    try {
      var f = new Intl.DateTimeFormat('en-AU', {
        timeZone: TZ,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        timeZoneName: 'short',
      });
      f.formatToParts(date).forEach(function (p) {
        if (p.type !== 'literal') out[p.type] = p.value;
      });
    } catch (e) {
      return null;
    }
    if (!out.year || !out.hour) return null;
    return out;
  }

  /* "30 Sep 2026, 19:28 AEST". */
  function fmtStampAu(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = auParts(d);
    if (!p) return '';
    return Number(p.day) + ' ' + MONTHS_SHORT[Number(p.month) - 1] + ' ' + p.year
      + ', ' + p.hour + ':' + p.minute + ' ' + auZoneLabel(p.timeZoneName);
  }

  /* "19:28 AEST". */
  function fmtTimeAu(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = auParts(d);
    if (!p) return '';
    return p.hour + ':' + p.minute + ' ' + auZoneLabel(p.timeZoneName);
  }

  /* The ISO day a stamp falls on in the department's timezone, which is not the
   * same day as its UTC date for nine hours of every day. */
  function auIsoDay(date) {
    var p = auParts(date);
    if (!p) return '';
    var mm = String(Number(p.month)).padStart(2, '0');
    var dd = String(Number(p.day)).padStart(2, '0');
    return p.year + '-' + mm + '-' + dd;
  }

  /* Whole days, UTC, so a reader's timezone can never shift a day count. */
  function dayIndex(iso) {
    var t = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
    return isNaN(t) ? NaN : Math.floor(t / MS_DAY);
  }
  function isoDay(n) {
    if (!isFinite(n)) return '';
    return new Date(Number(n) * MS_DAY).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) { return dayIndex(b) - dayIndex(a); }

  /* "today", "yesterday", or the date, in the department's timezone. */
  function relDayPhrase(thenMs, nowMs) {
    var a = auIsoDay(new Date(thenMs));
    var b = auIsoDay(new Date(nowMs));
    if (!a || !b) return '';
    var d = daysBetween(a, b);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    return 'on ' + fmtDay(a);
  }

  /* The panel's freshness line, in the three states spec 5.2 names, plus a
   * fourth for a build that recorded no run time at all. Returns the kind as
   * well as the text, because the kind drives the class: the stale kinds carry
   * the alarm colour and the fresh one does not. */
  function freshnessLine(freshness, officialAu, nowMs) {
    var now = nowMs == null ? Date.now() : Number(nowMs);
    var fr = freshness || {};
    var gen = fr.generated_at ? Date.parse(fr.generated_at) : NaN;
    if (!isFinite(gen)) {
      return {
        kind: 'unknown',
        text: 'This build did not record when it ran, so nothing here should be read as current.',
      };
    }
    var ageHours = (now - gen) / 3600000;
    if (ageHours > STALE_RUN_HOURS) {
      var days = Math.max(1, Math.round(ageHours / 24));
      return {
        kind: 'stale',
        text: 'Data last updated ' + days + ' ' + plural(days, 'day', 'days') + ' ago.',
      };
    }
    var asAt = (officialAu && officialAu.as_at) || null;
    if (asAt) {
      var asAtMs = Date.parse(asAt);
      if (isFinite(asAtMs) && (now - asAtMs) / MS_DAY > STALE_AS_AT_DAYS) {
        return {
          kind: 'official-stale',
          text: 'Official figure from ' + fmtDay(String(asAt).slice(0, 10))
            + '; the department has not published since.',
        };
      }
    }
    var rel = relDayPhrase(gen, now);
    return {
      kind: 'ok',
      text: 'Data checked ' + (rel ? rel + ' at ' : '') + fmtTimeAu(fr.generated_at) + '.',
    };
  }

  /* The panel's one headline sentence, per layer. Numbers, not adjectives, and
   * never a number this build did not publish. eraStartIso is the earliest date
   * on the layer, which app.js reads off the records it loaded rather than
   * parsing a month out of an era label. */
  function panelHeadline(summary, layer, eraStartIso) {
    var s = summary || {};
    var layers = s.au_layers || {};
    var since = isIsoDay(eraStartIso) ? ' since ' + fmtMonthYear(eraStartIso) : '';

    if (layer === 'world') {
      return 'The world layer shows H5 events notified to WOAH in the last 90 days, outside Australia.';
    }
    if (layer === 'woah') {
      var wn = layers.woah && layers.woah.records;
      if (wn == null) {
        return 'The WOAH notification count was not published in this build, so none is stated here.';
      }
      return 'WOAH has been notified of ' + wn + ' H5 ' + plural(wn, 'event', 'events')
        + ' in Australia' + since + '.';
    }
    var off = s.official_au || {};
    var o = layers.official || {};
    var n = off.national_total != null ? off.national_total : o.records;
    var j = o.jurisdictions;
    if (n == null || j == null) {
      return 'The Australian counts were not published in this build, so none is stated here.';
    }
    return 'H5 bird flu has been confirmed in ' + n + ' wild ' + plural(n, 'animal', 'animals')
      + ' across ' + j + ' ' + plural(j, 'jurisdiction', 'jurisdictions') + since + '.';
  }

  /* How a record got onto the map, in words, because precision is data and a
   * reader cannot see it in a coordinate. Static text, so nothing needs
   * escaping. */
  function placementSentence(record) {
    var r = record || {};
    if (r.precision === 'locality') {
      return 'Placed at the locality centroid; the department publishes place names, not coordinates.';
    }
    if (r.precision === 'lga') {
      return 'Placed at the centre of the local government area; the locality could not be matched to a place name.';
    }
    if (r.precision === 'state') {
      return 'Placed at the centre of the jurisdiction; neither the locality nor the local government area could be matched.';
    }
    if (r.level === 'admin1' || r.level === 'country') {
      return 'Placed at the centre of the state or region: the source published no specific location.';
    }
    return 'Placed at the coordinates the source published.';
  }

  /* ----------------------------------------------------------- citations
   * Lifted from history.js, which was the only file that had one. The drawer
   * needs a citation renderer too, and app.js had none. */

  function isObj(x) { return x && typeof x === 'object'; }

  function citationLine(c) {
    var pub = esc(c.publisher || '');
    var text = esc(c.title || c.url || 'source');
    var url = safeUrl(c.url);
    var link = url
      ? '<a href="' + esc(url) + '" rel="noopener">' + text + '</a>'
      : text + ' <span class="quiet">(no link published)</span>';
    return pub ? pub + ', ' + link : link;
  }

  /* No fact without a source. An entry that reaches the page with no citation is
   * labelled, never hidden. */
  function citationsHtml(cits) {
    var list = (Array.isArray(cits) ? cits : []).filter(isObj);
    if (!list.length) {
      return '<p class="cite-caveat"><strong>Unsourced.</strong> This entry reached the page '
        + 'without a citation, which should not happen. Treat it as unverified until a source is '
        + 'attached.</p>';
    }
    if (list.length === 1) {
      /* .cite writes the word "Source: " itself. */
      return '<p class="cite">' + citationLine(list[0]) + '</p>';
    }
    return '<ul class="cite-list" aria-label="Sources for this entry">'
      + list.map(function (c) { return '<li>' + citationLine(c) + '</li>'; }).join('')
      + '</ul>';
  }

  root.Lib = {
    TZ: TZ,
    STALE_RUN_HOURS: STALE_RUN_HOURS,
    STALE_AS_AT_DAYS: STALE_AS_AT_DAYS,
    $: $,
    esc: esc,
    safeUrl: safeUrl,
    linkHtml: linkHtml,
    plural: plural,
    isIsoDay: isIsoDay,
    fmtDay: fmtDay,
    fmtMonthYear: fmtMonthYear,
    fmtStampAu: fmtStampAu,
    fmtTimeAu: fmtTimeAu,
    auZoneLabel: auZoneLabel,
    auIsoDay: auIsoDay,
    dayIndex: dayIndex,
    isoDay: isoDay,
    daysBetween: daysBetween,
    relDayPhrase: relDayPhrase,
    freshnessLine: freshnessLine,
    panelHeadline: panelHeadline,
    placementSentence: placementSentence,
    citationsHtml: citationsHtml,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node --test site/test/lib.test.mjs`
Expected: PASS, 19 tests, 0 fail.

If `fmtStampAu` fails on the zone name, the engine returned something `auZoneLabel` does not know. Print it with `node -e "console.log(new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',timeZoneName:'short'}).formatToParts(new Date('2026-09-30T09:28:33.831Z')))"` and add the observed form to `auZoneLabel`, with a test for it. Do not weaken the assertion.

- [ ] **Step 6: Check the file parses as a classic script**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/lib.js`
Expected: no output, exit 0. This is the check that `lib.js` carries no `import` or `export`, which would make it fail to load from a `<script src>` under the CSP.

- [ ] **Step 7: Commit**

```bash
git add site/lib.js site/test/lib.test.mjs site/test/fixtures/summary.new.json
git commit -m "feat(site): add lib.js, the shared helpers and tested copy templates"
```

---

### Task 2: One icon builder

`site/icons.js:206` has `mark()`, which builds the category SVG with inline `fill`, `stroke` and `stroke-width` attributes and a `mark mark-<key>` class. `site/app.js:278` has `catMark()`, which builds the same SVG again with a `.icon` class and no inline presentation attributes, because `.icon` in the stylesheet supplies all of it. Nothing calls `mark()`. `Icons.withLabel()` at `site/icons.js:235` calls `mark()` and emits `.cat`, `.cat-mark` and `.cat-text`, none of which the stylesheet defines, and nothing calls it either.

One builder, in `icons.js`, where the geometry is. `.mark` in the stylesheet is a CSS square and a different thing entirely, so the builder's default class is `icon`, not `mark`.

**Files:**
- Modify: `site/icons.js:196-241` (replace `mark` and `withLabel`), `site/icons.js:271-289` (the returned object)
- Modify: `site/app.js:278-292` (`catMark` becomes a wrapper)

**Interfaces:**
- Consumes: nothing.
- Produces: `Icons.markSvg(key, opts)` where `opts` is `{className, size, labelled, name}`. `className` defaults to `'icon'`. `size` is optional and omits the `width` and `height` attributes when absent, so CSS sizes the mark. `Icons.mark` and `Icons.withLabel` no longer exist. Task 5 (`/about`) and Task 9 (the drawer and the list) both call `catMark`.

- [ ] **Step 1: Replace both builders in `icons.js` with one**

In `site/icons.js`, replace lines 196 to 241 (the comment block above `mark`, `mark` itself, and the comment block above `withLabel` plus `withLabel`) with:

```js
  /* markSvg(key, opts) returns SVG markup as a string. One builder, because
   * there were two for the same geometry: this one, and a copy in app.js that
   * existed only to attach a different class. The class is now an argument.
   *
   * opts.className  default "icon". The stylesheet's .icon supplies fill,
   *                 stroke, stroke width, caps and joins, so the markup carries
   *                 no presentation attributes and the mark inherits its colour
   *                 from the surrounding text. Colour on this site means strain
   *                 and era, never category, so every mark has to be legible in
   *                 plain black on white. Note that .mark is a CSS square and a
   *                 different thing: do not pass it here.
   * opts.size       pixel size. Omitted by default, which leaves the SVG to be
   *                 sized by its class.
   * opts.labelled   true only when the mark stands alone with no adjacent text.
   *                 Exposes it as role="img" with an accessible name. Default
   *                 false, which renders it aria-hidden so an adjacent text
   *                 label is not announced twice.
   * opts.name       override the accessible name, used with labelled: true
   */
  function markSvg(key, opts) {
    var o = opts || {};
    var shape = shapeFor(key);
    var cls = o.className || 'icon';
    var size = Number(o.size) > 0
      ? ' width="' + Number(o.size) + '" height="' + Number(o.size) + '"'
      : '';
    var a11y = o.labelled
      ? ' role="img" aria-label="' + esc(o.name || nameFor(key)) + '"'
      : ' aria-hidden="true"';

    var body = (shape.paths || []).map(function (d) {
      return '<path d="' + d + '"/>';
    }).join('');
    body += (shape.rects || []).map(function (r) {
      return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h
        + '" fill="currentColor" stroke="none"/>';
    }).join('');

    return '<svg class="' + esc(cls) + '"' + size
      + ' viewBox="0 0 ' + GRID + ' ' + GRID + '"'
      + ' focusable="false"' + a11y + '>' + body + '</svg>';
  }
```

- [ ] **Step 2: Fix the returned object**

In `site/icons.js`, in the returned object (lines 271 to 289 before this task's edits), delete the `mark: mark,` and `withLabel: withLabel,` entries and add `markSvg: markSvg,` in their place. Leave every other entry exactly as it is.

- [ ] **Step 3: Make `app.js` call it**

In `site/app.js`, replace `catMark` (lines 278 to 292) with:

```js
function catMark(key, opts) {
  const I = window.Icons;
  if (!I || !catShape(key)) return '';
  const o = opts || {};
  return I.markSvg(key, {
    className: 'icon' + (o.className ? ' ' + o.className : ''),
    labelled: o.labelled,
    name: o.name || catName(key),
  });
}
```

- [ ] **Step 4: Check both files parse**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/icons.js && node --check site/app.js`
Expected: no output, exit 0.

- [ ] **Step 5: Verify no caller of the deleted functions survives**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && grep -rn "Icons.mark\b\|Icons\.withLabel\|withLabel(" site/ || echo "no stale callers"`
Expected: `no stale callers`. A hit means a call site was missed; fix it before committing.

- [ ] **Step 6: Verify the marks still draw**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
globalThis.window = {};
const src = require('fs').readFileSync('site/icons.js','utf8');
new Function(src)();
const I = globalThis.window.Icons;
const svg = I.markSvg('wild_bird');
console.log(svg);
if (!/class=\"icon\"/.test(svg)) throw new Error('class missing');
if (/width=/.test(svg)) throw new Error('unsized mark should carry no width');
if ((svg.match(/<path/g)||[]).length !== 3) throw new Error('wild_bird has three chevrons');
console.log(I.markSvg('human', { size: 18, labelled: true }));
console.log('ok');
"`
Expected: two SVG strings then `ok`. The first has `class="icon"`, a `viewBox`, three `<path>` elements and no `width`. The second has `width=\"18\"`, `role=\"img\"` and `aria-label=\"Human case\"`.

- [ ] **Step 7: Commit**

```bash
git add site/icons.js site/app.js
git commit -m "refactor(site): collapse the two category mark builders into one"
```

---

### Task 3: The map-first shell, and the amputation in `app.js`

`index.html` becomes the shell spec 5.2 describes, and `app.js` loses the nine renderers spec 5.6 drops. Both halves are one task because they are one change: the moment the markup loses `#situationBody`, `renderSituation` throws on a null element, so the page is broken between the two edits if they are split.

The deliverable is a full-viewport map that draws its markers inside the new shell, with an empty panel. The panel fills in Task 6.

**Files:**
- Modify: `site/index.html` (whole file)
- Modify: `site/app.js`: delete `renderSituation` (356-490), `historicalDiscloseHtml` (495-532), `renderOfficialGap` (541-650), `newsLeadHtml` (657-669), `renderOfficialStatement` (673-727), `renderListFoot` (1312-1322), `newsItems` and `renderNews` (1334-1382), `outletShort` (1330-1332), `srcBadgeClass` and `renderSources` (1386-1444), `renderCategoryKey` (1003-1009); trim `render` (334-342), `renderMeta` (1492-1578), `buildControls` (1582-1615), `wire` (1646-1723) and `boot` (1791-1822)

**Interfaces:**
- Consumes: `globalThis.Lib` from Task 1, `Icons.markSvg` from Task 2.
- Produces: the DOM contract every later task targets. Ids, in document order: `#liveBanner`, `#banner`, `#main`, `#map`, `#sheet`, `#sheetGrip`, `#panel`, `#panelHeadline`, `#panelFigures`, `#panelFreshness`, `#panelNotes`, `#filterBar`, `#layerBtns`, `#timeframe`, `#speciesChips`, `#showH7`, `#listToggle`, `#scrubber`, `#scrubSpark`, `#scrubDate`, `#scrubLabel`, `#scrubPlay`, `#drawer`, `#drawerTitle`, `#drawerClose`, `#drawerBody`, `#mapMeta`, `#listPanel`, `#listCount`, `#search`, `#table`, `#thead`, `#tbody`, `#showMore`. Also the state machine: `#sheet` carries `data-state` of `collapsed`, `half` or `expanded`, which Task 4 styles and Tasks 7 and 9 set.
- Produces for stream E: the page now loads `/_vercel/insights/script.js`, which needs Web Analytics enabled on the Vercel project (spec 11 item 1). Until it is, that request 404s and nothing else breaks.

- [ ] **Step 1: Write the new `index.html`**

Replace the whole of `site/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Australian Bird Flu Tracker: every confirmed H5 bird flu event, mapped</title>
  <meta name="description" content="Every confirmed Australian H5 bird flu event from the Department of Agriculture's own record-level dataset, mapped at its published locality with its record id. The official count, the jurisdictions affected and the latest sampling date, each with its basis and its as-at date." />
  <!-- One deliberate light identity. A viewer in OS dark mode still gets the white page. -->
  <meta name="color-scheme" content="light" />
  <meta name="theme-color" content="#FFFFFF" />
  <!-- Inline mark: white ground, ink hairline frame, one red square. No external request. -->
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23FFFFFF'/%3E%3Crect x='.5' y='.5' width='31' height='31' fill='none' stroke='%23101010'/%3E%3Crect x='10' y='10' width='12' height='12' fill='%23C8102E'/%3E%3C/svg%3E" />
  <link rel="canonical" href="https://www.birdflutracker.org/" />
  <meta property="og:url" content="https://www.birdflutracker.org/" />
  <meta property="og:title" content="Australian Bird Flu Tracker" />
  <meta property="og:description" content="Every confirmed Australian H5 bird flu event, mapped from the department's own dataset. Each figure carries its basis and its as-at date." />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://www.birdflutracker.org/assets/img/og-card.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Australian Bird Flu Tracker. An outline map of Australia with red squares marking confirmed H5 bird flu events, and an ink drawing of a greater crested tern." />
  <meta name="twitter:card" content="summary_large_image" />

  <link rel="stylesheet" href="/assets/fonts/source-code-pro.css" />
  <link rel="stylesheet" href="/assets/leaflet/leaflet.css" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="map-page">
  <a class="skip-link" href="#panelBody">Skip to the data panel</a>

  <!-- The live incursion only. Filled from status.local_transmission. -->
  <div id="liveBanner" class="banner banner--live" hidden></div>
  <!-- Freshness and data plumbing: a run that fell back, a source that errored,
       or a fetch failure in the browser. Filled by app.js from freshness. -->
  <div id="banner" class="banner" role="status" hidden></div>

  <main id="main" class="map-shell">
    <!-- The map is the page. Full bleed, positioned against .map-shell. -->
    <div id="map" role="application" aria-label="Map of confirmed H5 bird flu events in Australia"></div>

    <!-- One wrapper, two layouts. On a desktop #sheet is display: contents, so
         each child positions itself against .map-shell at its own corner. Below
         720px the wrapper becomes the single bottom sheet spec 5.2 describes and
         its children fall back into normal flow, which is why the panel, the
         filters, the scrubber and the drawer are siblings inside one element
         rather than four independent overlays. data-state is the sheet's three
         states and is inert on a desktop. -->
    <div id="sheet" class="sheet" data-state="collapsed">
      <button type="button" id="sheetGrip" class="sheet__grip" aria-expanded="false" aria-controls="sheet">
        <span class="sheet__grip-bar" aria-hidden="true"></span>
        <span id="sheetGripText">Filters and dates</span>
      </button>

      <section id="panel" class="panel" aria-labelledby="panelTitle">
        <header class="panel__head">
          <!-- The page's h1. It reads as the site name because .site-title beats
               the h1 element rule on specificity, so nothing changes visually,
               but the map page is no longer a page with no heading at all. -->
          <h1 class="site-title" id="panelTitle"><a href="/">Australian Bird Flu Tracker</a></h1>
          <nav class="panel__nav" aria-label="Site">
            <a href="/about">About</a>
            <a href="/history">History</a>
          </nav>
        </header>
        <div id="panelBody" class="panel__body">
          <p id="panelHeadline" class="panel__headline">Loading the data</p>
          <div id="panelFigures" class="panel__figures"></div>
          <p id="panelFreshness" class="panel__freshness"></p>
          <p id="panelNotes" class="panel__notes" hidden></p>
          <p class="panel__how"><a href="/about#counting">How this is counted</a></p>
        </div>
      </section>

      <div id="filterBar" class="filterbar" role="group" aria-label="Filters">
        <div class="filterbar__group" role="group" aria-label="Layer">
          <span class="control-label" id="layerLabel">Layer</span>
          <div class="btn-row" id="layerBtns"></div>
        </div>
        <div class="filterbar__group">
          <label class="control-label" for="timeframe">Timeframe</label>
          <select id="timeframe">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="era" selected>Since June 2026</option>
          </select>
        </div>
        <div class="filterbar__group" role="group" aria-label="Species">
          <span class="control-label">Species</span>
          <div class="btn-row" id="speciesChips"></div>
        </div>
        <div class="filterbar__group">
          <label class="check">
            <input type="checkbox" id="showH7" />
            Show resolved H7 poultry outbreaks (2024 to 2025)
          </label>
        </div>
        <div class="filterbar__group">
          <button type="button" id="listToggle" class="ctl" aria-expanded="false" aria-controls="listPanel">
            List records
          </button>
        </div>
      </div>

      <div id="scrubber" class="scrubber">
        <!-- The sparkline is decorative: the slider carries the value and the
             output states it in words, so nothing here is the only way to read
             the date. Built by app.js because its shape is the data. -->
        <svg id="scrubSpark" class="scrubber__spark" viewBox="0 0 100 20" preserveAspectRatio="none"
             focusable="false" aria-hidden="true"></svg>
        <div class="scrubber__row">
          <label class="visually-hidden" for="scrubDate">Show events sampled on or before this date</label>
          <input type="range" id="scrubDate" min="0" max="0" step="1" value="0" />
          <output id="scrubLabel" class="scrubber__label" for="scrubDate"></output>
          <button type="button" id="scrubPlay" class="ctl ctl--sm scrubber__play" aria-pressed="false">
            Play
          </button>
        </div>
      </div>

      <!-- Opened by a marker or by a row of the record list. A dialog, but not a
           modal one: a modal would trap focus away from the map, which is the
           page. Escape closes it and focus returns to whatever opened it. -->
      <aside id="drawer" class="drawer" role="dialog" aria-modal="false"
             aria-labelledby="drawerTitle" tabindex="-1" hidden>
        <div class="drawer__head">
          <h2 id="drawerTitle" class="drawer__title">Record</h2>
          <button type="button" id="drawerClose" class="drawer__close" aria-label="Close this record">Close</button>
        </div>
        <div id="drawerBody" class="drawer__body"></div>
      </aside>
    </div>

    <!-- Two one-line notes: what the marks mean, and what the vicinity ring is
         not. Both link to the section of /about that explains them. -->
    <p id="mapMeta" class="map-meta"></p>

    <!-- The keyboard and screen reader path to the records: the same view the map
         is showing, as a real table. -->
    <section id="listPanel" class="listpanel" aria-labelledby="listTitle" hidden>
      <h2 id="listTitle" class="visually-hidden">Records in the current view</h2>
      <div class="list-head">
        <p class="list-count" id="listCount"></p>
        <div>
          <label class="visually-hidden" for="search">Search these records</label>
          <input type="search" id="search" placeholder="Search place, species, record id" />
        </div>
      </div>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Records, scrollable">
        <table class="table" id="table">
          <caption class="visually-hidden">Records in the current view, filtered by the controls above</caption>
          <thead id="thead"></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      <button type="button" id="showMore" class="show-more" hidden>Show more</button>
    </section>
  </main>

  <footer class="footer-strip">
    <p class="footer-strip__hotline">
      <strong>Sick or dead wild birds: call the Emergency Animal Disease Hotline on 1800&nbsp;675&nbsp;888.</strong>
      Do not touch or move sick or dead birds.
    </p>
    <p class="footer-strip__links">
      <strong>Not medical advice.</strong>
      <a href="/about#sources">Sources</a>
      <a href="https://github.com/apappas57/H5-Bird-flu-tracker" rel="noopener">GitHub</a>
    </p>
  </footer>

  <script src="/assets/leaflet/leaflet.js"></script>
  <script src="/lib.js"></script>
  <script src="/icons.js"></script>
  <script src="/app.js"></script>
  <!-- Vercel Web Analytics. Same origin script, same origin beacon, so the CSP
       needs no change. Spec 4.3. -->
  <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Delete the dropped renderers from `app.js`**

Delete these nine functions and their comment blocks entirely, in descending line order so earlier deletions do not move later ones:

1. `srcBadgeClass` and `renderSources`, and the `/* ---- 8 sources and meta */` banner above them: lines 1384 to 1444.
2. `renderNews`: lines 1353 to 1382.
3. `newsItems`: lines 1334 to 1351.
4. `outletShort` and the comment above it: lines 1326 to 1332.
5. `renderListFoot`: lines 1312 to 1322.
6. `renderCategoryKey`: lines 1003 to 1009.
7. `renderOfficialStatement` and the comment above it: lines 671 to 727.
8. `newsLeadHtml` and the comment above it: lines 652 to 669.
9. `renderOfficialGap` and the section banner above it: lines 534 to 650.
10. `historicalDiscloseHtml` and the comment above it: lines 492 to 532.
11. `renderSituation` and the section banner above it: lines 354 to 490.

Keep `figureHtml` (346 to 352), `dataSkew` (1454 to 1490) and `renderViewFigures` (1013 to 1062): the first two are correctness rather than copy, and the third becomes the panel in Task 6. Keep every helper, every era function, the whole filter pipeline, all of the marker geometry, and all of the loaders.

- [ ] **Step 3: Trim `render`, `renderMeta`, `buildControls`, `wire` and `boot`**

Replace `render` (was lines 334 to 342) with the shell version. The panel, the legend and the list come back in Tasks 6 and 9:

```js
function render() {
  const recs = inView();
  state.mapped = recs;
  renderMarkers(recs);
}
```

Replace `renderMeta` (was 1492 to 1578) with the banner half only, which is the part spec 5.6 says to keep. Everything it wrote into `#updated`, `#footUpdated`, `#modeBadge`, `#heroMeta` and `#notesList` is gone with those elements, and the freshness line replaces the mode badge in Task 6:

```js
/* The data-plumbing banner, and the two-file skew check.
 *
 * summary.json and the detections file are two files from the same build,
 * fetched separately and cacheable separately. A partial deploy, or a CDN
 * serving one of them from an older build, leaves the panel stating counts from
 * one file above a map built from the other. Presenting both silently would put
 * two contradictory numbers in front of a reader with nothing to say which is
 * wrong, so any skew is stated. */
function renderMeta() {
  const s = state.summary;
  if (!s) return;

  const notices = [];
  const skew = dataSkew();
  if (skew) {
    notices.push('<strong>The two data files disagree.</strong> The figures in the panel are read from '
      + 'summary.json and the map is built from the detections file. On this load they do not match: '
      + skew + '. That normally means one of the two files is from an earlier build, so treat the '
      + 'figures as unreliable until the next refresh, and check '
      + '<a href="/about#sources">the official sources</a> directly.');
  }
  if (notices.length) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = notices.map((n) => '<p>' + n + '</p>').join('');
  }

  /* The live incursion gets the red rule, and only it. */
  const lt = s.status && s.status.local_transmission;
  if (lt && lt.status === 'suggested') {
    const lb = $('#liveBanner');
    lb.hidden = false;
    lb.innerHTML = '<p><strong>Local transmission suggested.</strong> On '
      + escapeHtml(niceDate(lt.date)) + ' the Australian Chief Veterinary Officer said the evidence '
      + 'suggests some local transmission has now occurred between '
      + escapeHtml(lt.where || 'resident wild birds')
      + '. <a href="/about#transmission">What that means</a>.</p>';
  }
}
```

Replace `buildControls` (was 1582 to 1615) with an empty shell. Task 7 fills it:

```js
/* The filter bar. Layer, timeframe, species and the H7 toggle are built from the
 * data rather than hard coded, so a layer with no records cannot offer a button
 * that empties the map. */
function buildControls() {
}
```

Replace `wire` (was 1646 to 1723) with the handlers whose elements exist in this task. Sorting stays because the table markup is still there; the region, category and subtype handlers go with their buttons:

```js
function wire() {
  /* Headers are delegated because the thead is rebuilt whenever the columns
   * change. Enter and Space sort, so the table is fully keyboard operable. */
  const thead = $('#thead');
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) sortBy(th.dataset.sort);
  });
  thead.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    e.preventDefault();
    sortBy(th.dataset.sort);
  });

  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.shown = 50;
    renderList(searched(inView()));
  });

  $('#showMore').addEventListener('click', () => {
    state.shown += 50;
    renderList(searched(inView()));
  });
}
```

Replace `boot` (was 1791 to 1822) with:

```js
async function boot() {
  readPalette();
  initMap();
  wire();
  ensureLiveRegion();
  try {
    const [sum] = await Promise.all([
      fetchJson('data/summary.json'),
      ensureRegionData(state.region),
    ]);
    state.summary = sum;
    buildControls();
    renderMeta();
    render();
    focusRegion(state.region);
    /* From here on a view change is a change, so it is announced. */
    state.announce = true;
    /* A capture harness needs something to wait for that means "the data is on
     * screen", otherwise it photographs the loading state and measures the
     * contrast of the word "Loading". Set on both paths, because a failed load
     * is also a finished load and a harness that waits forever reports nothing
     * at all. */
    document.body.dataset.ready = 'true';
  } catch (err) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = '<p><strong>Data did not load.</strong> Nothing on this page should be read as '
      + 'current until it does. <button type="button" id="retryLoad" class="ctl ctl--sm">Try again</button></p>';
    const retry = $('#retryLoad');
    if (retry) retry.addEventListener('click', () => { b.hidden = true; boot(); });
    document.body.dataset.ready = 'failed';
    console.error(err);
  }
}
```

- [ ] **Step 4: Alias `app.js`'s private helpers onto `lib.js`**

Spec 5.6 lifts `$`, `esc`, `safeUrl`, `plural` and the date formatting into `lib.js`. Task 1 created them there; this is where `app.js` stops carrying its own. Replace the helpers block (lines 130 to 218, from the `/* ---- helpers */` banner down to and including `function sentence`) with:

```js
/* -------------------------------------------------------------------- helpers
 * $, escapeHtml, safeUrl, linkHtml, plural and the date formatters now live in
 * site/lib.js, which index.html loads before this file. They were duplicated
 * across app.js and history.js, and the two date formatters disagreed. The
 * aliases keep the call sites in this file unchanged. */

const $ = Lib.$;
const escapeHtml = Lib.esc;
const safeUrl = Lib.safeUrl;
const linkHtml = Lib.linkHtml;
const plural = Lib.plural;
const niceDate = Lib.fmtDay;
const niceStamp = Lib.fmtStampAu;

/* Same, for the source lists, where the name carries a class either way so the
 * row keeps its layout when a source publishes no usable URL. */
function namedLinkHtml(url, text, cls) {
  const href = safeUrl(url);
  return href
    ? '<a class="' + cls + '" href="' + escapeHtml(href) + '" rel="noopener">' + escapeHtml(text) + '</a>'
    : '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
}

/* Sibling spans in a flex row are separated visually by a gap, which gives a
 * screen reader nothing: it reads the strings run together. A real stop in the
 * text layer, hidden from view, is the separation. */
const READ_SEP = '<span class="visually-hidden">. </span>';

/* Compact form for large figures. Returns an empty string for a missing value:
 * the caller decides what "not published" should read as, so no placeholder
 * glyph is ever invented here. Anything printed in a figure slot goes through
 * fmtFig instead, so a missing number never renders as a blank space. */
function fmtNum(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}

/* A figure slot, a table cell or a count. A blank space cannot be told apart
 * from a zero or from a rendering fault, so a missing value says so in words. */
const NOT_PUBLISHED = 'not published';
function fmtFig(n) {
  const t = fmtNum(n);
  return t === '' ? NOT_PUBLISHED : t;
}

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function sentence(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
```

`namedLinkHtml`, `READ_SEP` and `sentence` lose their last callers with the source list and the situation block. Leave them for now and delete whichever the Task 13 sweep proves dead, so this step stays a move and not a cull.

- [ ] **Step 5: Move the zoom control off the panel's corner**

The panel sits top left and Leaflet puts its zoom control there too. Replace the first line of `initMap` (line 733) so the control moves to the top right, which is empty on every layout:

```js
  map = L.map('map', {
    worldCopyJump: true, minZoom: 2, preferCanvas: true, zoomControl: false,
  }).setView([-27, 134], 4);
  L.control.zoom({ position: 'topright' }).addTo(map);
```

- [ ] **Step 6: Check it parses and nothing references a deleted function**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/app.js && \
grep -n "renderSituation\|historicalDiscloseHtml\|renderOfficialGap\|newsLeadHtml\|renderOfficialStatement\|renderListFoot\|renderNews\|newsItems\|outletShort\|renderSources\|srcBadgeClass\|renderCategoryKey" site/app.js || echo "no stale references"
```
Expected: `no stale references`.

- [ ] **Step 7: Check every id `app.js` still touches exists in the markup**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const fs = require('fs');
const app = fs.readFileSync('site/app.js','utf8');
const html = fs.readFileSync('site/index.html','utf8');
const ids = new Set([...app.matchAll(/\\\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
const missing = [...ids].filter(id => !new RegExp('id=\"' + id + '\"').test(html) && id !== 'viewAnnounce' && id !== 'retryLoad');
console.log('ids used:', [...ids].sort().join(', '));
if (missing.length) { console.error('MISSING FROM MARKUP:', missing.join(', ')); process.exit(1); }
console.log('every id resolves');
"
```
Expected: `every id resolves`. `viewAnnounce` and `retryLoad` are created by JS, which is why they are excluded.

- [ ] **Step 8: Load the page and confirm the map draws with a clean console**

Run: `cd /Users/Alex/dev/h5-bird-flu-tracker && node pipeline/serve.mjs` in one terminal, then in another:
```bash
npx playwright screenshot --viewport-size=1280,800 --wait-for-timeout=3000 \
  http://localhost:8080/index.html /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/shell-1280.png
```
Expected: a screenshot showing the Australian map filling the frame with its markers drawn, the unstyled panel markup over it, and the footer strip. It will look wrong: Task 4 is the styling. What must be true now is that the map renders, the markers are on it, and nothing threw.

Then check the console explicitly:
```bash
npx playwright open --viewport-size=1280,800 http://localhost:8080/index.html
```
and read the browser console. Expected: no errors. A `404` on `/_vercel/insights/script.js` is expected locally and in production until stream E enables Web Analytics; it is a failed script load, not a page error.

- [ ] **Step 9: Commit**

```bash
git add site/index.html site/app.js
git commit -m "feat(site): restructure index.html as the map-first shell"
```

---

### Task 4: `site/styles.css`, the map-first layout

Three edits: delete what the dropped renderers used, replace the two id-scoped figure blocks with the panel's, and add one new section for the shell, the sheet, the filter bar, the scrubber, the drawer, the list panel, the footer strip, the precision marks and the `/about` bases table.

Everything spec 5.6 says to keep is kept verbatim: the `:root` tokens, the tags, marks and controls sections, the map block and every Leaflet override with its citation of the vendored rule it beats, and the reduced-motion and print rules.

**Files:**
- Modify: `site/styles.css`: delete 1285-1312 (section 15, news list) and 1406-1513 (sections 19 and 20); delete 1102-1124 (the dead nth-child label counting); replace 441-493 (the `#situationBody` and `#viewFigures` blocks); insert a new section

**Interfaces:**
- Consumes: the ids and classes Task 3 put in `index.html`; the `#sheet[data-state]` machine.
- Produces: the classes Tasks 5, 6, 7, 8, 9, 11 and 12 write into: `.panel__figures .figure`, `.panel__freshness--stale`, `.mk`, `.mk--official`, `.mk--locality`, `.mk--lga`, `.mk--state`, `.mk--resolved`, `.scrubber__spark path`, `.drawer__figure`, `.drawer__row`, `.bases`, `.precision-key`.

- [ ] **Step 1: Delete sections 19 and 20**

Delete `site/styles.css` lines 1406 to 1513 inclusive: the whole of `19 status block and official gap` (`.status-banner`, every `.sb-*`, `.official-gap`, every `.og-*`) and the whole of `20 legacy aliases` (`.pill`, `.dot`, `.hero__plate`, `.logo`). Nothing emits any of them once Task 3 has landed.

Then delete the two now-dead lines inside the responsive block: in the `@media (max-width: 720px)` block, the selector list at line 1532 to 1533 reads

```css
  #situationBody .figures > .figure,
  .og-fig { grid-template-columns: 4ch 1fr; gap: 2px 10px; }
```

Replace those two lines with:

```css
  .panel__figures .figure { grid-template-columns: 4ch 1fr; gap: 2px 10px; }
```

and delete the line `  #viewFigures .figure { max-width: none; }` from the same block.

- [ ] **Step 2: Delete section 15, the news list**

Delete lines 1285 to 1312 inclusive: the `15 news list` banner and `.news-note`, `.news-list`, `.news-item`, `.news-item__date`, `.news-item__body`, `.news-item__title`, `.news-item__outlet`.

Keep section 16 (`.source-*`) and section 17 (`.notes-list`, `.disclaimer`, `.footnote`, `.callout`): `/about` uses the first and the footer strip and `/about` use the second. The spec's stated range overshoots; see Verified corrections.

Then remove the two references to the deleted classes in the responsive and print blocks:
- In `@media (max-width: 720px)`, change `.event, .news-item { grid-template-columns: 1fr; gap: 6px; }` to `.event { grid-template-columns: 1fr; gap: 6px; }` and `.event__date, .news-item__date { letter-spacing: 0.08em; }` to `.event__date { letter-spacing: 0.08em; }`.
- In `@media print`, change `.section, .figure, .event, .news-item, .source-item, #table tbody tr { break-inside: avoid; }` to `.section, .figure, .event, .source-item, #table tbody tr { break-inside: avoid; }`.
- In `@media print`, change the hidden list from `.site-header, .site-nav, .controls, .map-section, .show-more, .toggle-more, .btn, .skip-link, .banner` to `.site-header, .site-nav, .controls, .map-section, .sheet, .filterbar, .scrubber, .drawer, .show-more, .toggle-more, .btn, .skip-link, .banner`.

- [ ] **Step 3: Delete the dead per-cell label counting**

Inside the `@media (max-width: 939px)` table block, delete lines 1102 to 1124: every rule from `/* First cell is the date in every layout. */` through `#table tbody td:nth-last-child(1)::before { content: "Source"; }`. Keep the rule immediately after them,

```css
  /* Preferred source of truth if it ever exists. Last, so it wins. */
  #table tbody td[data-label]::before { content: attr(data-label); }
```

and change its comment to:

```css
  /* app.js emits data-label on every cell, which is the only label source: the
     column set is layer dependent, so a cell's position cannot identify it. */
```

The counting rules were already inert, because `app.js` has emitted `data-label` since `site/app.js:1214`. They are deleted rather than left because the new column sets differ per layer, so if the `data-label` rule ever regressed they would silently print the wrong field name against the wrong value.

- [ ] **Step 4: Replace the two id-scoped figure blocks with the panel's**

Replace `site/styles.css` lines 441 to 493 (the `/* 3 Current situation ... */` block and the `/* 5 What the current filters put on the map ... */` block, both of which target ids that no longer exist) with:

```css
/* The panel's three figures. Not a dashboard row: a number, its label and its
   basis on hairline-separated rows at reading size, because the panel is 320px
   wide and three large numerals in it would be the stat-card rhythm this design
   exists to avoid. The one large numeral on the site is on /about, where the
   three counting bases are set out and a figure has room to be a figure. */
.panel__figures { display: grid; grid-template-columns: 1fr; gap: 0; }
.panel__figures .figure {
  grid-template-columns: 5ch 1fr;
  gap: 2px 12px;
  align-items: baseline;
  border-top: 1px solid var(--rule-2);
  padding: 8px 0;
}
.panel__figures .figure:first-child { border-top: 1px solid var(--rule); }
.panel__figures .figure__num {
  grid-column: 1;
  grid-row: 1;
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0;
  text-align: right;
}
.panel__figures .figure__label { grid-column: 2; grid-row: 1; letter-spacing: 0.1em; }
.panel__figures .figure__note {
  grid-column: 2;
  grid-row: 2;
  max-width: none;
  font-size: 0.6875rem;
}
/* The jurisdiction list behind the second figure. A button rather than a title
   attribute, because a title is unreachable by touch and unreliable to a screen
   reader, and the spec asks for hover or tap. */
.fig-more {
  appearance: none;
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.6875rem;
  color: var(--ink-2);
  text-decoration: underline;
  text-decoration-color: var(--ink-3);
  cursor: pointer;
}
.fig-more:hover { color: var(--ink); }
.fig-more-body { grid-column: 1 / -1; font-size: 0.6875rem; color: var(--ink-2); }
```

- [ ] **Step 5: Add the new section**

Append this to the end of `site/styles.css`, after the print block. It is last so that its shell rules win over the general `#map` rule at line 1149 by source order as well as by specificity:

```css
/* ==========================================================================
   22  the map page: shell, sheet, filter bar, scrubber, drawer, list, footer

   The map fills the viewport and everything else sits on top of it. The page
   does not scroll: each overlay scrolls inside itself, so the map never leaves
   the screen and the reader never loses their place on it.

   Two layouts, one DOM. On a desktop #sheet is display: contents, so the panel,
   the filter bar, the scrubber and the drawer each position themselves against
   .map-shell at their own corner. Below 720px #sheet becomes one bottom sheet
   and its children fall back into normal flow inside it. That is why they are
   siblings in one wrapper rather than four independent overlays: the phone
   layout is a real container and the desktop layout is four corners, and
   display: contents is what lets one tree be both.

   Stacking. Leaflet gives its corner containers z-index 1000 and its controls
   800, so every overlay here sits at 1100 and the zoom control is moved to the
   top right in initMap so it does not sit under the panel.
   ========================================================================== */

/* 100dvh, with 100vh first for anything that does not know dvh: the dynamic
   unit is what stops iOS Safari's collapsing toolbar from cropping the footer
   strip off the bottom of the page. */
body.map-page {
  height: 100vh;
  height: 100dvh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
}
/* A banner is auto height, so it pushes the map down rather than covering it.
   Hidden it contributes nothing. */
body.map-page > .banner { grid-row: auto; }

.map-shell { position: relative; min-height: 0; }
/* Beats the shared #map rule at section 14, which sizes the map for a page that
   scrolls. Two selectors, so it also beats .map. */
.map-page #map, .map-page .map {
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
  border: 0;
}

/* ---- the sheet wrapper and its grip ---- */

.sheet { display: contents; }
.sheet__grip { display: none; }

/* ---- panel ---- */

.panel {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: 12px;
  width: min(320px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  overflow: auto;
  background: var(--paper);
  border: 1px solid var(--ink);
  padding: 12px 14px 14px;
  display: grid;
  gap: 10px;
  align-content: start;
}
.panel__head { display: grid; gap: 4px; }
.panel__nav { display: flex; gap: 14px; flex-wrap: wrap; }
.panel__nav a {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-2);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  padding-bottom: 1px;
}
.panel__nav a:hover { color: var(--ink); border-bottom-color: var(--rule); }
.panel__body { display: grid; gap: 9px; }
.panel__headline {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  max-width: none;
  color: var(--ink);
}
.panel__freshness { font-size: 0.75rem; color: var(--ink-2); max-width: none; }
/* The alarm colour, on the one sentence that says the data is not current. See
   the colour law in the plan header: this and the map marks are the only places
   carmine appears. */
.panel__freshness--stale {
  color: var(--live);
  font-weight: 600;
  border-left: 2px solid var(--live);
  padding-left: 8px;
}
.panel__notes { font-size: 0.6875rem; color: var(--ink-2); max-width: none; }
.panel__how { font-size: 0.6875rem; letter-spacing: 0.04em; max-width: none; }
.panel__how a { color: var(--ink-2); text-decoration-color: var(--ink-3); }
.panel__how a:hover { color: var(--ink); }

/* ---- filter bar ---- */

.filterbar {
  position: absolute;
  z-index: 1100;
  top: 12px;
  left: calc(12px + min(320px, 100% - 24px) + 12px);
  right: 64px;               /* clears the zoom control at the top right */
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: flex-end;
  background: var(--paper);
  border: 1px solid var(--rule);
  padding: 8px 12px;
}
.filterbar__group { display: grid; gap: 5px; align-content: start; min-width: 0; }
.filterbar .control-label { font-size: 0.625rem; }
.filterbar .check { font-size: 0.6875rem; }

/* ---- scrubber ---- */

.scrubber {
  position: absolute;
  z-index: 1100;
  left: 12px;
  right: 12px;
  /* 26px, not 0: the Leaflet attribution sits at the bottom right and is a
     licence obligation, so the scrubber stops above it rather than over it. */
  bottom: 26px;
  background: var(--paper);
  border: 1px solid var(--rule);
  padding: 6px 12px 8px;
  display: grid;
  gap: 2px;
}
.scrubber__spark {
  display: block;
  width: 100%;
  height: 22px;
  overflow: visible;
}
.scrubber__spark path {
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1;
  /* The viewBox is scaled non-uniformly to fill the strip, so without this the
     stroke would be stretched with it. */
  vector-effect: non-scaling-stroke;
}
.scrubber__spark line {
  stroke: var(--live);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.scrubber__row { display: flex; align-items: center; gap: 12px; }
.scrubber__row input[type="range"] { flex: 1 1 auto; min-width: 0; margin: 0; accent-color: var(--ink); }
.scrubber__label {
  flex: none;
  font-size: 0.75rem;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.scrubber__play { flex: none; }
/* Play is motion, so it goes with reduced motion. app.js also refuses to start
   the loop, so the control is hidden and inert rather than hidden and live. */
@media (prefers-reduced-motion: reduce) {
  .scrubber__play { display: none; }
}

/* ---- drawer ---- */

.drawer {
  position: absolute;
  z-index: 1100;
  top: 12px;
  right: 12px;
  width: min(360px, calc(100% - 24px));
  max-height: calc(100% - 96px);
  overflow: auto;
  background: var(--paper);
  border: 1px solid var(--ink);
  padding: 12px 14px 16px;
  display: grid;
  gap: 10px;
  align-content: start;
}
.drawer[hidden] { display: none; }
.drawer__head { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; }
.drawer__title { font-size: 0.9375rem; font-weight: 700; line-height: 1.3; }
.drawer__close {
  appearance: none;
  flex: none;
  border: 1px solid var(--ink-3);
  border-bottom-width: 2px;
  background: var(--paper);
  color: var(--ink-2);
  font: inherit;
  font-size: 0.6875rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  cursor: pointer;
}
.drawer__close:hover { color: var(--ink); border-color: var(--ink); }
.drawer__body { display: grid; gap: 7px; }
.drawer__sci { font-size: 0.8125rem; color: var(--ink-2); }
.drawer__row { font-size: 0.8125rem; color: var(--ink-2); max-width: none; }
.drawer__row strong { color: var(--ink); font-weight: 600; }
.drawer__key {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
  display: block;
}
/* The turntable. Hidden until the birds module reports it mounted, so a device
   that fails a gate gets no empty box. */
.drawer__figure {
  display: block;
  width: 160px;
  height: 160px;
  border: 1px solid var(--rule-2);
}
.drawer__figure[hidden] { display: none; }
/* A cluster: the records sharing one placement, as buttons. */
.drawer__cluster { list-style: none; padding: 0; display: grid; gap: 0; }
.drawer__cluster li { border-top: 1px solid var(--rule-2); }
.drawer__cluster li:first-child { border-top: 1px solid var(--rule); }
.drawer__pick {
  appearance: none;
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  color: var(--ink);
  padding: 8px 0;
  cursor: pointer;
}
.drawer__pick:hover { background: var(--paper-2); }
.drawer__pick .drawer__key { color: var(--ink-2); }

/* ---- the one line of map metadata ---- */

.map-meta {
  position: absolute;
  z-index: 1100;
  left: 12px;
  /* Above the scrubber, whose height is two rows plus its padding. */
  bottom: 96px;
  max-width: min(52ch, calc(100% - 24px));
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.5;
  color: var(--ink-2);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
}
.map-meta a { color: var(--ink-2); text-decoration-color: var(--ink-3); }
.map-meta a:hover { color: var(--ink); }

/* ---- the record list ---- */

.listpanel {
  position: absolute;
  z-index: 1200;                 /* over the scrubber, which it covers */
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70%;
  overflow: auto;
  background: var(--paper);
  border-top: 1px solid var(--ink);
  padding: 14px clamp(12px, 3vw, 22px) 20px;
}
.listpanel[hidden] { display: none; }

/* ---- footer strip ---- */

.footer-strip {
  border-top: 1px solid var(--ink);
  padding: 7px clamp(12px, 3vw, 22px);
  display: flex;
  flex-wrap: wrap;
  gap: 2px 22px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--ink-2);
  background: var(--paper);
}
.footer-strip p { margin: 0; max-width: none; }
.footer-strip__hotline strong { color: var(--ink); }
.footer-strip__links { display: flex; gap: 16px; flex-wrap: wrap; align-items: baseline; }
.footer-strip__links strong { color: var(--ink); }

/* ---- precision marks on the map ---- */

/* Official events are carmine squares whose size is their placement precision:
   a wider mark for a wider uncertainty. Solid at locality precision, hollow at
   LGA, a dashed ring at the jurisdiction centroid. Colour never carries this
   alone: the shape and the fill both change, and the drawer says it in words.
   These are divIcon markers rather than canvas circles, because a square is not
   a circle and because L.Marker is keyboard focusable while a path is not.

   The layer is capped at a few hundred records, so the DOM cost is fine. WOAH
   and world records stay canvas circleMarkers, where the count is thousands. */
.mk { box-sizing: border-box; background: transparent; }
.mk--official { border: 1px solid var(--live); }
.mk--official.mk--locality { background: var(--live); }
.mk--official.mk--lga { background: transparent; }
.mk--official.mk--state { border-radius: 50%; border-style: dashed; background: transparent; }
/* Resolved H7 and the unrelated 2024 human case: grey, never red, and hollow. */
.mk--resolved { border: 1px solid var(--ink-2); background: var(--paper); }
/* Leaflet puts its own classes on a divIcon container. Zero them so the mark is
   only what .mk says it is. */
.leaflet-marker-icon.mk { margin: 0; }

/* ---- /about: the three counting bases, and the precision key ---- */

/* Three columns of monospace do not fit a 390px screen, so below 640px each row
   becomes a labelled block, the same pattern the detections table uses. about.js
   emits data-label on every cell. */
.bases td, .bases th { vertical-align: top; }
.bases .num { white-space: nowrap; }
@media (max-width: 639px) {
  .bases, .bases thead, .bases tbody, .bases tr, .bases th, .bases td { display: block; }
  .bases thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .bases tbody tr { border-top: 1px solid var(--ink); padding: 10px 0 12px; }
  .bases tbody td {
    display: grid;
    grid-template-columns: 12ch 1fr;
    gap: 0 12px;
    align-items: baseline;
    border: 0;
    padding: 3px 0;
  }
  .bases tbody td::before {
    content: attr(data-label);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .bases tbody td.num { text-align: left; }
}

/* The precision key: the same three marks the map draws, at rest, next to what
   each one means. */
.precision-key { list-style: none; padding: 0; display: grid; gap: 9px; }
.precision-key li { display: flex; gap: 10px; align-items: baseline; font-size: 0.8125rem; color: var(--ink-2); }
.precision-key .mk { flex: none; }
.precision-key .mk--locality { width: 10px; height: 10px; }
.precision-key .mk--lga { width: 14px; height: 14px; }
.precision-key .mk--state { width: 18px; height: 18px; }

/* ==========================================================================
   23  the map page below 720px: one bottom sheet, three states

   collapsed  the headline and the three figures
   half       the filters and the scrubber as well
   expanded   the open record, which replaces the sheet's content until closed

   The map is never covered above half height, which is what the max-height on
   each state enforces.
   ========================================================================== */

@media (max-width: 720px) {
  .sheet {
    display: block;
    position: absolute;
    z-index: 1100;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 50%;
    overflow: auto;
    background: var(--paper);
    border-top: 1px solid var(--ink);
  }

  .sheet__grip {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    appearance: none;
    border: 0;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
    color: var(--ink-2);
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 11px 14px 10px;
    cursor: pointer;
    /* Sticky so the grip is reachable while the sheet's content scrolls. */
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .sheet__grip-bar {
    flex: none;
    width: 28px;
    height: 3px;
    background: var(--ink-3);
  }

  /* Every child returns to normal flow inside the sheet. */
  .panel, .filterbar, .scrubber, .drawer {
    position: static;
    inset: auto;
    width: auto;
    max-height: none;
    overflow: visible;
    border: 0;
    border-radius: 0;
    z-index: auto;
  }
  .panel { padding: 12px 14px; }
  .filterbar { border-top: 1px solid var(--rule); padding: 12px 14px; }
  .scrubber { border-top: 1px solid var(--rule); padding: 10px 14px 14px; }
  .drawer { border-top: 1px solid var(--ink); padding: 12px 14px 18px; }

  /* collapsed: the panel only. */
  .sheet[data-state="collapsed"] .filterbar,
  .sheet[data-state="collapsed"] .scrubber { display: none; }
  /* half: the panel, the filters and the scrubber. */
  /* expanded: the drawer replaces the sheet's content. */
  .sheet[data-state="expanded"] .panel,
  .sheet[data-state="expanded"] .filterbar,
  .sheet[data-state="expanded"] .scrubber { display: none; }
  .sheet[data-state="expanded"] .sheet__grip { display: none; }

  /* The map keeps the top half to itself. */
  .map-meta {
    bottom: auto;
    top: 8px;
    left: 8px;
    right: 8px;
    max-width: none;
    font-size: 0.625rem;
  }
  .listpanel { max-height: 78%; padding: 12px 14px 18px; }
  .footer-strip { font-size: 0.6875rem; gap: 2px 14px; padding: 6px 14px; }
  .drawer__figure { width: 120px; height: 120px; }
}

/* The tap-target block at section 21 lists every control that existed before
   this rebuild. These five are new, and WCAG 2.2 SC 2.5.8 does not care that
   they are new. Same 44px floor, same method: padding and min-height grow, the
   type does not. The range input gets a height rather than padding, because a
   slider's target is its track. */
@media (max-width: 939px) {
  /* 11px type at 1.4 is 15.4px; +14 +13 padding +3px borders = 45.4px. */
  .drawer__close { padding: 14px 12px 13px; }
  .row-open { padding: 14px 12px 13px; }
  /* A text button in a figure row: the target is the row, so it gets height
     rather than a border box that would read as a second control. */
  .fig-more { min-height: 44px; display: inline-flex; align-items: center; }
  .sheet__grip { min-height: 44px; }
  #scrubDate { height: 44px; }
}
```

- [ ] **Step 6: Verify the stylesheet has no syntax error and no dangling reference**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const css = require('fs').readFileSync('site/styles.css','utf8');
const open = (css.match(/{/g)||[]).length, close = (css.match(/}/g)||[]).length;
console.log('braces', open, close);
if (open !== close) { console.error('UNBALANCED'); process.exit(1); }
for (const dead of ['.sb-', '.og-', '.news-item', '.news-list', '.news-note', '#situationBody', '#viewFigures', '.status-banner', '.official-gap', '.hero__plate']) {
  if (css.includes(dead)) { console.error('STILL PRESENT:', dead); process.exit(1); }
}
console.log('no dropped selector survives');
"
```
Expected: balanced braces and `no dropped selector survives`.

- [ ] **Step 7: Verify nothing in the site still emits a deleted class**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && grep -rn "sb-risk\|sb-fig\|og-fig\|og-num\|news-item\|status-banner\|official-gap\|hero__plate" site/*.html site/*.js || echo "nothing emits a deleted class"
```
Expected: `nothing emits a deleted class`.

- [ ] **Step 8: Screenshot the shell at the three widths**

With `node pipeline/serve.mjs` running:
```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
for w in 390 768 1280; do
  npx playwright screenshot --viewport-size=$w,844 --wait-for-timeout=3000 \
    http://localhost:8080/index.html $S/shell-$w.png
done
```
Expected, read against spec 5.2: at 1280 the map fills the frame, the panel sits top left at 320px, the filter bar runs along the top to the right of it, the scrubber sits along the bottom above the OpenStreetMap credit, and the footer strip is one line at the very bottom. At 390 the panel is a bottom sheet in its collapsed state covering no more than half the height, and the map holds the top half. At 768 the desktop layout holds but the filter bar wraps to two rows. There is no horizontal scrollbar at any width and the page itself does not scroll.

- [ ] **Step 9: Commit**

```bash
git add site/styles.css
git commit -m "feat(site): map-first layout, sheet states, scrubber and drawer styles"
```

---

### Task 5: `/about`, the page everything explanatory moved to

Every paragraph Task 3 deleted from the map page has a home here, and the parts of it that are data are generated from `summary.json` so the page and the public JSON cannot drift. The static half is the explanation: what a basis is, how placement works, what each caveat was last true on, the licences, and how to report a sick bird.

The caveats are copied from `pipeline/au-status.json` as it stands on 30 Sep 2026, because spec 3.4 moves them out of that file and into static dated copy here. Each keeps its internal dates and gains a review date.

**Files:**
- Create: `site/about.html`
- Create: `site/about.js`

**Interfaces:**
- Consumes: `globalThis.Lib` (Task 1), `Icons.markSvg` (Task 2), the classes Task 4 kept and added (`.bases`, `.precision-key`, `.source-*`, `.dl`, `.figures`, `.callout`, `.footnote`, `.cite`, `.hero__*`).
- Consumes from stream A: `summary.official_au`, `summary.au_layers`, `summary.official_series`, `summary.milestones`, `summary.placement_stats`, `summary.freshness`, and the existing `summary.eras.definitions`, `summary.sources`, `summary.context_sources`, `summary.references`.
- Produces the anchors the rest of the site links to: `#counting`, `#sources`, `#freshness`, `#placement`, `#marks`, `#eras`, `#milestones`, `#caveats`, `#transmission`, `#licences`, `#report`, `#corrections`. Tasks 3, 6, 7, 9, 11 and 13 all link into them, so none may be renamed.

- [ ] **Step 1: Write `site/about.html`**

Create `site/about.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>How this tracker counts, sources and places every H5 bird flu event</title>
  <meta name="description" content="The three different bases Australian H5 bird flu is counted on and why they are never merged, where every figure comes from, how a place name becomes a point on the map, what each mark means, and the caveats with the date each was last true." />
  <meta name="color-scheme" content="light" />
  <meta name="theme-color" content="#FFFFFF" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23FFFFFF'/%3E%3Crect x='.5' y='.5' width='31' height='31' fill='none' stroke='%23101010'/%3E%3Crect x='10' y='10' width='12' height='12' fill='%23C8102E'/%3E%3C/svg%3E" />
  <link rel="canonical" href="https://www.birdflutracker.org/about" />
  <meta property="og:url" content="https://www.birdflutracker.org/about" />
  <meta property="og:title" content="How this tracker counts" />
  <meta property="og:description" content="Three bases, never merged. Where every figure comes from, how a place name becomes a point, and what each caveat was last true on." />
  <meta property="og:type" content="article" />
  <meta property="og:image" content="https://www.birdflutracker.org/assets/img/og-card.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Australian Bird Flu Tracker. An outline map of Australia with red squares marking confirmed H5 bird flu events, and an ink drawing of a greater crested tern." />
  <meta name="twitter:card" content="summary_large_image" />

  <link rel="stylesheet" href="/assets/fonts/source-code-pro.css" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <a class="skip-link" href="#counting">Skip to the counting bases</a>

  <header class="site-header">
    <div class="wrap site-header__inner">
      <div class="stack stack--xs">
        <p class="site-title"><a href="/">Australian Bird Flu Tracker</a></p>
        <p class="site-subtitle">How this tracker counts, sources and places every event.</p>
      </div>
      <nav class="site-nav" aria-label="Site navigation">
        <a href="/">Tracker</a>
        <a href="/about" aria-current="page">About</a>
        <a href="/history">History</a>
      </nav>
    </div>
  </header>

  <!-- Filled by about.js only when the data file does not arrive. -->
  <div id="loadNotice" class="banner" role="status" hidden></div>

  <main class="wrap" id="main">

    <section class="hero stack stack--lg" aria-labelledby="pageTitle">
      <p class="label">About this tracker</p>
      <h1 id="pageTitle">How this tracker counts, and what each number means</h1>
      <p class="lede">
        This is an independent, public interest tracker of H5 bird flu in Australia. Its Australian
        backbone is the Department of Agriculture's own record level dataset, so every mapped event
        carries the department's record id and links back to it.
      </p>
      <p class="quiet" id="aboutStamp"></p>
      <nav class="jump-nav" aria-label="On this page">
        <a class="ctl" href="#counting">Three bases</a>
        <a class="ctl" href="#sources">Sources</a>
        <a class="ctl" href="#placement">Placement</a>
        <a class="ctl" href="#marks">The marks</a>
        <a class="ctl" href="#eras">The events</a>
        <a class="ctl" href="#caveats">Caveats</a>
        <a class="ctl" href="#report">Report a sick bird</a>
      </nav>
    </section>

    <!-- ----------------------------------------------------------------
         The three bases. This is the section the whole site turns on: the
         page used to show the official figure below the mapped one, which
         is exactly the inversion its own copy said could not happen.
         ---------------------------------------------------------------- -->
    <section class="section section--strong" id="counting" aria-labelledby="countingTitle">
      <div class="section__head">
        <p class="label">Three different questions</p>
        <h2 class="section__title" id="countingTitle">Three counting bases, never merged</h2>
        <p class="section__note">
          Australian H5 bird flu is counted three ways by three different publishers, and the three
          answers are all correct. They measure different things, so they are never added together
          and never reconciled into one number.
        </p>
      </div>
      <table class="table bases" id="basesTable">
        <caption class="visually-hidden">The three bases Australian H5 bird flu events are counted on</caption>
        <thead>
          <tr>
            <th scope="col">Basis</th>
            <th scope="col" class="num">Figure</th>
            <th scope="col">What it counts, and as at when</th>
          </tr>
        </thead>
        <tbody id="basesBody"></tbody>
      </table>
      <p class="footnote" id="basesFoot"></p>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="sources" aria-labelledby="sourcesTitle">
      <div class="section__head">
        <h2 class="section__title" id="sourcesTitle">Sources and method</h2>
      </div>
      <div class="prose">
        <p>
          The Australian backbone is <code>H5_bird_flu_events.xlsx</code>, the record level
          spreadsheet the department publishes beside its latest data page. One row is one confirmed
          wildlife event, with a stable record id, the date sampled, the jurisdiction, the local
          government area, the locality and the species. Nothing in the Australian count is
          hand entered.
        </p>
        <p>
          The department's pages answer from an Australian residential connection and time out from
          cloud data centres, so the nightly refresh runs on a machine in Australia and commits
          every data file it regenerates. The deploy then validates the committed data and fetches
          nothing, which is why a deploy can no longer change what the page says.
        </p>
        <p>
          FAO EMPRES i plus carries the events Australia has notified to WOAH, with coordinates.
          They are kept as a separate layer and a cross check. They are never mixed into the
          official count: different id space, different basis, different dates. United States wild
          bird detections come from USDA APHIS and global human case figures from the WHO via Our
          World in Data.
        </p>
        <p>
          An Australian news feed is collected as a gap detector for maintainers. It is never
          mapped, never counted and never shown on the tracker.
        </p>
      </div>
      <p class="source-status" id="sourceStatus"></p>
      <h3>Feeds that produce mapped records</h3>
      <ul class="source-list" id="sourceList"></ul>
      <h3>Sources that inform the page without producing map points</h3>
      <ul class="source-list" id="contextSourceList"></ul>
      <h3>Further reference</h3>
      <ul class="source-list" id="referenceList"></ul>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="freshness" aria-labelledby="freshnessTitle">
      <div class="section__head">
        <h2 class="section__title" id="freshnessTitle">When each source was last read</h2>
        <p class="section__note">
          Freshness is a fact about the data, so it is published with it. A daily check reads this
          block off the live site and alerts if the run is more than 36 hours old, if the official
          figure is more than four days old, or if any departmental source has failed twice running.
        </p>
      </div>
      <table class="table bases" id="freshnessTable">
        <caption class="visually-hidden">Every source, its status and when it was last read</caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Status</th>
            <th scope="col">Last read</th>
            <th scope="col" class="num">Records</th>
          </tr>
        </thead>
        <tbody id="freshnessBody"></tbody>
      </table>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="placement" aria-labelledby="placementTitle">
      <div class="section__head">
        <h2 class="section__title" id="placementTitle">How a place name becomes a point</h2>
      </div>
      <div class="prose">
        <p>
          The department publishes place names, not coordinates. Every point on the map is therefore
          a lookup, never a guess: the locality is matched against a committed gazetteer cache
          within its jurisdiction, with the local government area as the tie breaker where a name
          occurs more than once in a state.
        </p>
        <p>
          A locality that cannot be matched falls back to the centre of its local government area,
          and then to the centre of the jurisdiction. The record keeps its place in the count either
          way, and the precision it was placed at is published with it, shown on the map as a shape
          and stated in the record panel in words. A wrong beach is worse than an honest centroid.
        </p>
      </div>
      <div class="figures figures--sm" id="placementStats" hidden></div>
      <p class="footnote" id="placementFoot"></p>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="marks" aria-labelledby="marksTitle">
      <div class="section__head">
        <h2 class="section__title" id="marksTitle">What each mark on the map means</h2>
        <p class="section__note">
          Colour never carries meaning on its own here. Precision and layer are also shape, so every
          distinction on the map survives in greyscale.
        </p>
      </div>
      <ul class="precision-key">
        <li>
          <span class="mk mk--official mk--locality" aria-hidden="true"></span>
          <span><strong>Solid carmine square.</strong> An official event placed at its locality
          centroid, which is most of them.</span>
        </li>
        <li>
          <span class="mk mk--official mk--lga" aria-hidden="true"></span>
          <span><strong>Hollow carmine square.</strong> Placed at the centre of its local government
          area: the locality could not be matched to a place name.</span>
        </li>
        <li>
          <span class="mk mk--official mk--state" aria-hidden="true"></span>
          <span><strong>Dashed carmine ring.</strong> Placed at the centre of the jurisdiction:
          neither the locality nor the local government area could be matched.</span>
        </li>
        <li>
          <span class="mark mark--round" aria-hidden="true"></span>
          <span><strong>Ink ring.</strong> A WOAH notification, on its own layer. A separate basis,
          never added to the official count.</span>
        </li>
        <li>
          <span class="mark mark--historical" aria-hidden="true"></span>
          <span><strong>Grey outline.</strong> A resolved H7 poultry outbreak from 2024 to 2025, or
          the unrelated 2024 human case. A different subtype or a different lineage, off by default.</span>
        </li>
      </ul>
      <div class="prose">
        <p>
          <strong>The vicinity ring is not a control area.</strong> A 10 km ring is drawn around each
          current event placed at locality precision. It is a visual vicinity indicator and nothing
          more: no control or restricted areas have been declared for these Australian wild bird
          events. It is the same size around every event and never varies with severity, spread or
          risk, so overlapping rings mean events close together and nothing else. Zoomed out, a true
          10 km radius would be about a pixel across, so the ring is drawn dashed at a fixed size on
          screen instead, which covers more ground than 10 km and is not a distance you can read off
          the map. Zoom in and it becomes the true radius.
        </p>
        <p>
          Carmine appears in two places on this site: the marks of the live outbreak, and the one
          sentence in the panel that says the data on screen is not current. Nothing else takes it.
        </p>
      </div>
      <h3>Category marks</h3>
      <ul class="key key--stack" id="categoryKey"></ul>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="eras" aria-labelledby="erasTitle">
      <div class="section__head">
        <h2 class="section__title" id="erasTitle">The separate events in the Australian record</h2>
        <p class="section__note">
          Records are grouped by the event they belong to and are never added together. Only the
          event marked current describes the live outbreak.
        </p>
      </div>
      <dl class="dl" id="eraDefs"></dl>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="milestones" aria-labelledby="milestonesTitle">
      <div class="section__head">
        <h2 class="section__title" id="milestonesTitle">Firsts, as the department announced them</h2>
        <p class="section__note">
          Taken from the dated Chief Veterinary Officer statements, with the statement each came
          from. The full timeline, including the history of the lineage, is on
          <a href="/history">the history page</a>.
        </p>
      </div>
      <ul class="notes-list" id="milestoneList"></ul>
      <h3>The official cumulative series</h3>
      <p class="section__note">
        A different basis from the dataset: these are detections as counted in a statement on the
        day it was published, not events in the current spreadsheet. The two are not comparable and
        are never merged.
      </p>
      <table class="table bases" id="seriesTable">
        <caption class="visually-hidden">Cumulative detections as stated by the department, by statement date</caption>
        <thead>
          <tr>
            <th scope="col">Statement</th>
            <th scope="col" class="num">Detections stated</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody id="seriesBody"></tbody>
      </table>
    </section>

    <!-- ----------------------------------------------------------------
         Static, dated copy. Moved out of pipeline/au-status.json per spec
         3.4: a caveat is an explanation, not a parser output. Each carries
         the dates inside it, and the section carries its review date.
         ---------------------------------------------------------------- -->
    <section class="section" id="caveats" aria-labelledby="caveatsTitle">
      <div class="section__head">
        <h2 class="section__title" id="caveatsTitle">Caveats</h2>
        <p class="section__note">Reviewed 30 Sep 2026. Each was true on that date.</p>
      </div>
      <ul class="notes-list">
        <li>
          Records are grouped by the event they belong to and are never added together. Victoria's
          records, for example, are three separate things: current H5 wild bird events, resolved H7
          poultry outbreaks from 2024 to 2025 of a different subtype, and one unrelated travel
          acquired human case from May 2024 of a different lineage. Only the first group describes
          this outbreak, which is why a news report of a state's first case is correct even where
          this site also holds older records from that state.
        </li>
        <li>
          "First detection" means mainland Australia. H5N1 clade 2.3.4.4b reached sub Antarctic
          Heard Island, an Australian external territory, earlier: the Australian Antarctic Program
          estimates about August 2025 and has since confirmed it in six species there, alongside
          very high southern elephant seal pup mortality. Those are a separate event on a remote
          external territory and are not in the figures on this site.
        </li>
        <li>
          The WOAH layer follows notifications, which are published after an Australian
          announcement, so its count runs behind the official dataset. That is a reporting lag, not
          a disagreement about the facts, and it is why the two are separate layers with separate
          counts rather than one number.
        </li>
        <li>
          Australian national tallies count confirmed and presumed positive detections together,
          which is the department's own wording. The dataset's own label for its rows is "confirmed
          events", and that is the word used here.
        </li>
        <li>
          A record the department revises or withdraws is kept here for 30 days, marked with the
          date it was withdrawn, and excluded from every count. A correction should be visible, not
          silently erased.
        </li>
        <li>
          Not every event is published at the same level of detail. Where the department publishes a
          locality this site places the event at that locality's centroid; where it does not, the
          fallback is stated on the record. See <a href="#placement">placement</a>.
        </li>
      </ul>
      <p class="footnote" id="transmission">
        On 29 July 2026 the Australian Chief Veterinary Officer said the evidence suggests some
        local transmission has occurred between resident wild birds in the South Australian
        cluster. That is a change in kind rather than in count: it does not alter any figure on
        this site, and it is why the tracker carries a separate banner for it.
        Human health risk in Australia is currently assessed as low by Australian authorities.
        Australia's only human H5N1 case is a single travel acquired case from May 2024, a different
        lineage, unrelated to the wildlife events this site tracks. No human to human transmission
        has been reported.
      </p>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="report" aria-labelledby="reportTitle">
      <div class="section__head">
        <h2 class="section__title" id="reportTitle">How to report a sick or dead wild bird</h2>
      </div>
      <p class="callout">
        <strong>Call the Emergency Animal Disease Hotline on 1800&nbsp;675&nbsp;888.</strong>
        Do not touch or move sick or dead birds, and keep pets away from them.
      </p>
      <p class="footnote" id="hotlineReports"></p>
      <ul class="source-list">
        <li class="source-item">
          <a class="source-name" href="https://www.outbreak.gov.au/emerging-risks/high-pathogenicity-avian-influenza" rel="noopener">DAFF, outbreak.gov.au</a>
          <span class="source-note">The Commonwealth's own guidance for the public and for industry.</span>
        </li>
        <li class="source-item">
          <a class="source-name" href="https://wildlifehealthaustralia.com.au/Resource-Centre/H5-bird-flu" rel="noopener">Wildlife Health Australia</a>
          <span class="source-note">Wildlife specific guidance and resources.</span>
        </li>
        <li class="source-item">
          <a class="source-name" href="https://www.cdc.gov.au/diseases/bird-flu-avian-influenza" rel="noopener">Australian CDC</a>
          <span class="source-note">Human health guidance.</span>
        </li>
      </ul>
      <p class="disclaimer">
        <strong>Not medical advice.</strong> Figures here are aggregated from public official reports
        and may lag or be revised by the source agencies. For guidance, consult the sources above or
        your state health department.
      </p>
    </section>

    <!-- ----------------------------------------------------------------
         The hero photograph, retired from the map page. The credit is a
         licence condition of CC BY-SA 4.0 and must stay wherever the image
         appears.
         ---------------------------------------------------------------- -->
    <section class="section" id="licences" aria-labelledby="licencesTitle">
      <div class="section__head">
        <h2 class="section__title" id="licencesTitle">Credits and licences</h2>
      </div>
      <figure class="hero__figure">
        <img class="hero__img" src="/assets/img/tern-hero.jpg" width="1920" height="840" loading="lazy"
             alt="A greater crested tern in flight with its wings raised, photographed side on." />
        <figcaption class="hero__credit">
          Greater crested tern (<i>Thalasseus bergii</i>), the dominant species of this outbreak and
          the species of the South Australian cluster in which the Chief Veterinary Officer reported
          evidence of local transmission. Photograph by
          <a href="https://www.jjharrison.com.au/" rel="noopener">JJ Harrison</a>,
          <a href="https://creativecommons.org/licenses/by-sa/4.0" rel="noopener">CC BY-SA 4.0</a>,
          cropped and converted to greyscale.
        </figcaption>
      </figure>
      <dl class="dl">
        <div class="dl-row">
          <dt class="dl-key">This site</dt>
          <dd class="dl-val">Code and data are MIT licensed. The repository is public:
            <a href="https://github.com/apappas57/H5-Bird-flu-tracker" rel="noopener">source and methodology on GitHub</a>.</dd>
        </div>
        <div class="dl-row">
          <dt class="dl-key">Basemap</dt>
          <dd class="dl-val">Tiles and data &copy; OpenStreetMap contributors, ODbL. Map library:
            Leaflet, BSD 2 clause, vendored.</dd>
        </div>
        <div class="dl-row">
          <dt class="dl-key">Typeface</dt>
          <dd class="dl-val">Source Code Pro, SIL Open Font License 1.1, self hosted.</dd>
        </div>
        <div class="dl-row">
          <dt class="dl-key">Photograph</dt>
          <dd class="dl-val">Greater crested tern by JJ Harrison, CC BY-SA 4.0. The derivative on
            this page is also CC BY-SA 4.0. Full modification notes are in
            <a href="/assets/img/CREDITS.md">assets/img/CREDITS.md</a>.</dd>
        </div>
        <div class="dl-row">
          <dt class="dl-key">Bird drawings</dt>
          <dd class="dl-val">Original models and renders built for this site, released under the
            repository's MIT licence.</dd>
        </div>
      </dl>
    </section>

    <!-- ---------------------------------------------------------------- -->
    <section class="section" id="corrections" aria-labelledby="correctionsTitle">
      <div class="section__head">
        <h2 class="section__title" id="correctionsTitle">Corrections</h2>
      </div>
      <div class="prose">
        <p>
          A figure on this site is only as good as the source next to it. If a number, a place, a
          species or a date is wrong, it is worth telling us about, and so is a source link that has
          moved.
          <a href="https://github.com/apappas57/H5-Bird-flu-tracker/issues" rel="noopener">Open an issue on GitHub</a>.
        </p>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap stack">
      <p class="small">Open data, rebuilt daily. <span id="footStamp"></span></p>
      <p class="small">
        Independent public interest tracker.
        <a href="https://github.com/apappas57/H5-Bird-flu-tracker" rel="noopener">Source and methodology on GitHub</a>.
        Not medical advice.
      </p>
    </div>
  </footer>

  <script src="/lib.js"></script>
  <script src="/icons.js"></script>
  <script src="/about.js"></script>
  <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Sweep the file for dashes and stray non-ASCII characters**

Long copy typed by hand is where an em dash gets in, and the PostToolUse hook does not watch `.html`. Run:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const s = require('fs').readFileSync('site/about.html','utf8');
const bad = [...s.matchAll(/[\u2013\u2014]/g)];
if (bad.length) { console.error('DASH FOUND at index', bad.map(m=>m.index).join(', ')); process.exit(1); }
const nonAscii = [...s.matchAll(/[^\x00-\x7F]/g)];
console.log('non-ascii characters:', nonAscii.length ? [...new Set(nonAscii.map(m=>m[0]))].join(' ') : 'none');
console.log('no dash');
"
```
Expected: `no dash`. Any non-ASCII character reported must be a deliberate one; on this page there should be none, because `&copy;`, `&nbsp;` and the curly quotes are written as entities or as `’` escapes in `about.js`.

- [ ] **Step 3: Write `site/about.js`**

Create `site/about.js`:

```js
/* The /about page.
 *
 * Half of this page is static explanation in about.html. The other half is the
 * same facts the tracker states, generated here from site/data/summary.json so
 * the page and the public JSON cannot drift. Nothing is computed that the data
 * does not already carry: the three bases are three published figures, not one
 * figure presented three ways.
 *
 * Every block degrades in words. A missing key says which block the build did
 * not publish, and never renders as a blank row or a zero. The page is written
 * to be correct against the data as it stands before the new pipeline lands,
 * which means every new key is optional here.
 */
'use strict';

(function () {
  var DATA_URL = 'data/summary.json';
  var NOT_PUBLISHED = 'not published';

  var $ = Lib.$;
  var esc = Lib.esc;
  var linkHtml = Lib.linkHtml;
  var plural = Lib.plural;
  var fmtDay = Lib.fmtDay;

  function num(n) { return n == null || n === '' || Number.isNaN(Number(n)) ? '' : String(Number(n)); }
  function fig(n) { var t = num(n); return t === '' ? NOT_PUBLISHED : t; }

  /* --------------------------------------------------- the three bases */

  function renderBases(s) {
    var off = s.official_au || {};
    var layers = s.au_layers || {};
    var o = layers.official || {};
    var w = layers.woah || {};
    var rows = [];

    /* 1  The dataset. One row per confirmed event, which is the backbone. */
    var datasetDate = (s.freshness && s.freshness.dataset_date) || null;
    rows.push({
      basis: 'Official dataset',
      figure: fig(off.dataset_rows != null ? off.dataset_rows : o.records),
      what: 'One row per confirmed wildlife event in the department’s own record level '
        + 'spreadsheet, each with a record id, the date sampled, the jurisdiction, the local '
        + 'government area, the locality and the species. This is what the map draws.'
        + (datasetDate ? ' Dataset published ' + fmtDay(datasetDate) + '.' : ''),
      url: off.dataset_url || null,
      urlText: 'H5_bird_flu_events.xlsx',
    });

    /* 2  The latest data page's national total, on the same basis as the
     *    dataset but counted by the department rather than by us. The build
     *    asserts the two agree and publishes both either way. */
    rows.push({
      basis: 'Official national total',
      figure: fig(off.national_total),
      what: 'The department’s own national figure for confirmed events, published on its latest '
        + 'data page with an as at stamp.'
        + (off.as_at_text ? ' As at ' + esc(off.as_at_text) + '.' : '')
        + (off.dataset_matches_total === false
          ? ' On this run it does not equal the spreadsheet row count, so both are shown and '
            + 'neither is adjusted to fit the other.'
          : ''),
      url: off.source_url || null,
      urlText: 'Latest data',
      pre: true,
    });

    /* 3  The statements series. A different basis again: detections as counted
     *    in a statement on the day it went out. */
    var series = Array.isArray(s.official_series) ? s.official_series : [];
    var last = series.length ? series[series.length - 1] : null;
    rows.push({
      basis: 'Official statements',
      figure: last ? fig(last.total) : NOT_PUBLISHED,
      what: 'Cumulative confirmed or presumed positive detections as stated in a dated Chief '
        + 'Veterinary Officer statement. Detections per statement, not events per record, so it is '
        + 'not comparable with the two figures above.'
        + (last ? ' Latest statement ' + fmtDay(last.date) + '.' : ''),
      url: last ? last.url : null,
      urlText: 'The statement',
      pre: true,
    });

    /* 4  WOAH notifications: the separate layer and the cross check. */
    rows.push({
      basis: 'WOAH notifications',
      figure: fig(w.records),
      what: 'Australian events notified to WOAH and carried by FAO EMPRES i plus, with '
        + 'coordinates. A separate layer on the map and a cross check on the dataset. Notifications '
        + 'follow an Australian announcement, so this count runs behind the dataset.'
        + (w.latest ? ' Latest notification ' + fmtDay(w.latest) + '.' : ''),
      url: 'https://empres-i.apps.fao.org/',
      urlText: 'FAO EMPRES i plus',
    });

    $('#basesBody').innerHTML = rows.map(function (r) {
      var src = r.url ? '<br /><span class="footnote">' + linkHtml(r.url, r.urlText) + '</span>' : '';
      return '<tr>'
        + '<td data-label="Basis"><strong>' + esc(r.basis) + '</strong></td>'
        + '<td data-label="Figure" class="num">' + esc(r.figure) + '</td>'
        + '<td data-label="What it counts" class="td-wrap">' + r.what + src + '</td>'
        + '</tr>';
    }).join('');

    var foot = ['The four figures above answer four different questions, so a difference between '
      + 'them is not an error and is never netted off.'];
    if (off.dataset_matches_total === false) {
      foot.push('On this run the spreadsheet row count and the published national total disagree. '
        + 'Both are shown. The map draws the spreadsheet, because that is the file with the records '
        + 'in it.');
    }
    if (off.by_jurisdiction_total != null && off.national_total != null
      && Number(off.by_jurisdiction_total) !== Number(off.national_total)) {
      foot.push('The per jurisdiction counts sum to ' + esc(num(off.by_jurisdiction_total))
        + ', which does not equal the published national total of ' + esc(num(off.national_total))
        + '. Both come from the same page.');
    }
    $('#basesFoot').innerHTML = foot.join(' ');
  }

  /* ------------------------------------------------------------ sources */

  function srcBadgeClass(status) {
    if (status === 'live' || status === 'ok') return 'src-badge--live';
    if (status === 'error') return 'src-badge--error';
    if (status === 'empty') return 'src-badge--empty';
    return 'src-badge--seed';
  }

  function renderSources(s) {
    var sources = Array.isArray(s.sources) ? s.sources : [];
    var live = sources.filter(function (x) { return x.status === 'live' || x.status === 'ok'; }).length;
    $('#sourceStatus').textContent = sources.length
      ? live + ' of ' + sources.length + ' automated ' + plural(sources.length, 'feed', 'feeds')
        + ' answered on the latest run. Per source detail is in the table below.'
      : 'This build published no per feed status, so read the freshness table below instead.';

    $('#sourceList').innerHTML = sources.map(function (x) {
      var count = num(x.records) === ''
        ? 'record count not published'
        : num(x.records) + ' mapped ' + plural(x.records, 'record', 'records');
      var name = x.homepage
        ? '<a class="source-name" href="' + esc(Lib.safeUrl(x.homepage)) + '" rel="noopener">' + esc(x.name) + '</a>'
        : '<span class="source-name">' + esc(x.name) + '</span>';
      return '<li class="source-item">'
        + '<span class="src-badge ' + srcBadgeClass(x.status) + '">' + esc(x.status) + '</span>'
        + name
        + '<span class="source-meta">' + esc(x.region || '') + ', ' + esc(count) + '</span>'
        + (x.note ? '<span class="source-note">' + esc(x.note) + '</span>' : '')
        + '</li>';
    }).join('');

    $('#contextSourceList').innerHTML = (Array.isArray(s.context_sources) ? s.context_sources : [])
      .map(function (x) {
        var signal = x.kind === 'signal';
        return '<li class="source-item">'
          + '<span class="src-badge ' + (signal ? 'src-badge--signal' : 'src-badge--official') + '">'
          + (signal ? 'signal' : 'official') + '</span>'
          + '<a class="source-name" href="' + esc(Lib.safeUrl(x.url)) + '" rel="noopener">' + esc(x.name) + '</a>'
          + '<span class="source-note">' + (signal
            ? 'Media coverage, used as a gap detector for maintainers. Never mapped and never counted.'
            : 'Official position and national figures.') + '</span>'
          + '</li>';
      }).join('');

    $('#referenceList').innerHTML = (Array.isArray(s.references) ? s.references : [])
      .map(function (x) {
        return '<li class="source-item">'
          + '<span class="src-badge src-badge--seed">ref</span>'
          + '<a class="source-name" href="' + esc(Lib.safeUrl(x.url)) + '" rel="noopener">' + esc(x.name) + '</a>'
          + '</li>';
      }).join('');
  }

  /* ---------------------------------------------------------- freshness */

  function renderFreshness(s) {
    var fr = s.freshness || null;
    var body = $('#freshnessBody');
    if (!fr || !fr.sources) {
      body.innerHTML = '<tr><td class="table-empty" colspan="4">This build did not publish a '
        + 'freshness block, so there is nothing here to read. That is itself worth knowing: check '
        + 'the official sources directly.</td></tr>';
      return;
    }
    var keys = Object.keys(fr.sources);
    body.innerHTML = keys.map(function (k) {
      var x = fr.sources[k] || {};
      return '<tr>'
        + '<td data-label="Source"><strong>' + esc(k) + '</strong>'
        + (x.note ? '<br /><span class="footnote">' + esc(x.note) + '</span>' : '') + '</td>'
        + '<td data-label="Status"><span class="src-badge ' + srcBadgeClass(x.status) + '">'
        + esc(x.status || 'not stated') + '</span></td>'
        + '<td data-label="Last read">' + esc(Lib.fmtStampAu(x.fetched_at) || NOT_PUBLISHED) + '</td>'
        + '<td data-label="Records" class="num">' + esc(fig(x.records)) + '</td>'
        + '</tr>';
    }).join('');
  }

  /* --------------------------------------------------------- placement */

  function renderPlacement(s) {
    var p = s.placement_stats || null;
    var box = $('#placementStats');
    if (!p) {
      $('#placementFoot').textContent = 'This build did not publish placement statistics, so the '
        + 'split by precision is not stated here. Each record still carries its own precision.';
      return;
    }
    var figs = [
      { num: fig(p.locality), label: 'At a locality centroid' },
      { num: fig(p.lga), label: 'At a local government area centroid' },
      { num: fig(p.state), label: 'At a jurisdiction centroid' },
    ];
    box.innerHTML = figs.map(function (f) {
      return '<div class="figure"><span class="figure__num">' + esc(f.num) + '</span>'
        + '<span class="figure__label">' + esc(f.label) + '</span></div>';
    }).join('');
    box.hidden = false;

    var total = Number(p.locality || 0) + Number(p.lga || 0) + Number(p.state || 0);
    var below = Number(p.lga || 0) + Number(p.state || 0);
    var pct = total ? Math.round((below / total) * 1000) / 10 : 0;
    var bits = [];
    if (total) {
      bits.push(below + ' of ' + total + ' ' + plural(total, 'record', 'records') + ', '
        + pct + ' per cent, sits below locality precision.');
    }
    if (Number(p.unplaced || 0) > 0) {
      bits.push('<strong>' + esc(num(p.unplaced)) + ' ' + plural(p.unplaced, 'record', 'records')
        + ' could not be placed at all and is missing from the map.</strong> That is a build '
        + 'failure, not a data limitation, and the daily check alerts on it.');
    } else {
      bits.push('No record is unplaced: every row in the dataset is on the map.');
    }
    $('#placementFoot').innerHTML = bits.join(' ');
  }

  /* ------------------------------------------------------------- marks */

  function renderCategoryKey() {
    var I = window.Icons;
    if (!I) return;
    $('#categoryKey').innerHTML = I.KEYS.map(function (k) {
      return '<li class="key__item">' + I.markSvg(k)
        + '<span class="key__text"><strong>' + esc(I.label(k)) + '</strong>. '
        + esc(I.note(k)) + '</span></li>';
    }).join('');
  }

  /* -------------------------------------------------------------- eras */

  function renderEras(s) {
    var defs = (s.eras && Array.isArray(s.eras.definitions)) ? s.eras.definitions : [];
    if (!defs.length) {
      $('#eraDefs').innerHTML = '<div class="dl-row"><dt class="dl-key">Not published</dt>'
        + '<dd class="dl-val">This build did not publish the event definitions.</dd></div>';
      return;
    }
    $('#eraDefs').innerHTML = defs.map(function (d) {
      var tag = d.current
        ? '<span class="tag tag--live">current</span>'
        : '<span class="tag">' + esc(d.status || 'not current') + '</span>';
      return '<div class="dl-row">'
        + '<dt class="dl-key">' + esc(d.short_label || d.id) + ' ' + tag + '</dt>'
        + '<dd class="dl-val">' + esc(d.summary || '')
        + (d.strain ? ' <span class="quiet">Strain: ' + esc(d.strain) + '.</span>' : '')
        + '</dd></div>';
    }).join('');
  }

  /* -------------------------------------------- milestones and series */

  function renderMilestones(s) {
    var ms = Array.isArray(s.milestones) ? s.milestones : [];
    $('#milestoneList').innerHTML = ms.length
      ? ms.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
        .map(function (m) {
          return '<li><strong>' + esc(fmtDay(m.date)) + '.</strong> ' + esc(m.text)
            + ' ' + linkHtml(m.url, 'The statement') + '.</li>';
        }).join('')
      : '<li>This build did not publish the milestone list, so no firsts are stated here. The '
        + 'dated statements are linked under sources.</li>';

    var series = Array.isArray(s.official_series) ? s.official_series : [];
    $('#seriesBody').innerHTML = series.length
      ? series.slice().reverse().map(function (x) {
        return '<tr>'
          + '<td data-label="Statement">' + esc(fmtDay(x.date)) + '</td>'
          + '<td data-label="Detections stated" class="num">' + esc(fig(x.total)) + '</td>'
          + '<td data-label="Source">' + linkHtml(x.url, 'The statement') + '</td>'
          + '</tr>';
      }).join('')
      : '<tr><td class="table-empty" colspan="3">This build did not publish the statement series.</td></tr>';
  }

  /* ------------------------------------------------------------- stamp */

  function renderStamp(s) {
    var fr = s.freshness || {};
    var bits = [];
    var gen = Lib.fmtStampAu(fr.generated_at || s.generated_at);
    if (gen) bits.push('Data last built ' + gen);
    if (fr.dataset_date) bits.push('dataset published ' + fmtDay(fr.dataset_date));
    if (fr.run_host) bits.push('run from ' + esc(fr.run_host));
    var line = bits.length ? bits.join(', ') + '.' : '';
    $('#aboutStamp').textContent = line;
    $('#footStamp').textContent = gen ? 'Last data refresh: ' + gen + '.' : '';

    var reports = (s.official_au && s.official_au.hotline_reports) || null;
    $('#hotlineReports').textContent = reports == null
      ? ''
      : 'The department reports ' + num(reports) + ' calls to the hotline on this outbreak'
        + ((s.official_au && s.official_au.as_at_text)
          ? ', as at ' + s.official_au.as_at_text + '.' : '.');
  }

  /* ----------------------------------------------------------- failure */

  function fail(err) {
    var n = $('#loadNotice');
    n.hidden = false;
    n.innerHTML = '<div class="wrap"><p><strong>The generated half of this page did not load.</strong> '
      + 'Everything written above and below stands; the figures, the source list and the freshness '
      + 'table are missing. Read the data file directly at <a href="' + DATA_URL + '">' + DATA_URL
      + '</a>, or go back to the <a href="/">tracker</a>.</p></div>';
    $('#basesBody').innerHTML = '<tr><td class="table-empty" colspan="3">Figures unavailable while '
      + 'the data file is not loading.</td></tr>';
    console.error('summary.json did not load:', err);
  }

  /* -------------------------------------------------------------- boot */

  function boot() {
    /* The marks are static geometry, so they are drawn whether or not the data
     * file arrives. */
    renderCategoryKey();
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (s) {
        if (!s || typeof s !== 'object') throw new Error('unexpected shape');
        renderStamp(s);
        renderBases(s);
        renderSources(s);
        renderFreshness(s);
        renderPlacement(s);
        renderEras(s);
        renderMilestones(s);
      })
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
```

- [ ] **Step 4: Check it parses and every id it touches exists**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/about.js && node -e "
const fs = require('fs');
const js = fs.readFileSync('site/about.js','utf8');
const html = fs.readFileSync('site/about.html','utf8');
const ids = [...new Set([...js.matchAll(/\\\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
const missing = ids.filter(id => !new RegExp('id=\"' + id + '\"').test(html));
console.log('ids used:', ids.sort().join(', '));
if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(1); }
console.log('every id resolves');
"
```
Expected: `every id resolves`.

- [ ] **Step 5: Verify every anchor the rest of the site links to exists**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const html = require('fs').readFileSync('site/about.html','utf8');
const need = ['counting','sources','freshness','placement','marks','eras','milestones','caveats','transmission','licences','report','corrections'];
const missing = need.filter(a => !new RegExp('id=\"' + a + '\"').test(html));
if (missing.length) { console.error('MISSING ANCHORS:', missing.join(', ')); process.exit(1); }
console.log('every anchor exists');
"
```
Expected: `every anchor exists`.

- [ ] **Step 6: Load the page against the data as it stands today**

With `node pipeline/serve.mjs` running:
```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
for w in 390 1280; do
  npx playwright screenshot --viewport-size=$w,1200 --full-page --wait-for-timeout=2500 \
    http://localhost:8080/about.html $S/about-$w.png
done
```
Expected, and this is the point of the check: the committed `summary.json` has no `au_layers`, no `freshness`, no `official_series`, no `milestones` and no `placement_stats`, so those blocks must each say in words that the build did not publish them. Nothing may show a blank cell, a dash or a zero. The bases table must still show the official national total of 231, because `official_au.national_total` exists today. At 390 the three tables must be stacked label blocks with no horizontal scroll.

- [ ] **Step 7: Commit**

```bash
git add site/about.html site/about.js
git commit -m "feat(site): add /about with the three counting bases, sources and placement"
```

---

### Task 6: The panel, the freshness banner, and the two one-line map notes

The panel is the only text on the map page before any interaction, so every sentence in it is generated from data and carries its basis. `renderViewFigures` (spec 5.6: "becomes the compact panel") is the function that changes, and `renderLegend` and `renderMapNote` collapse to one line each.

**Files:**
- Modify: `site/app.js`: add `LAYERS`, extend `state`, add `layerRecords`, `eraStartIso`, `renderPanel`, `renderFreshness`, `renderFallbackBanner`, `renderMapMeta`; replace `renderViewFigures` (1013-1062), `renderLegend` (932-980), `renderMapNote` (982-1001); extend `render` and `boot`

**Interfaces:**
- Consumes: `Lib.panelHeadline`, `Lib.freshnessLine`, `Lib.fmtDay`, `Lib.plural`, `Lib.esc` (Task 1); `#panelHeadline`, `#panelFigures`, `#panelFreshness`, `#panelNotes`, `#banner`, `#mapMeta` (Task 3); `.panel__figures .figure`, `.panel__freshness--stale`, `.fig-more`, `.map-meta` (Task 4); `/about#counting`, `#sources`, `#marks`, `#placement` (Task 5).
- Consumes from stream A: `summary.au_layers`, `summary.official_au`, `summary.freshness`.
- Produces: `state.layer`, `LAYERS`, `layerRecords(layer)` and `eraStartIso()`, which Tasks 7, 8 and 9 all use. `renderPanel(recs)` is called from `render()`.

- [ ] **Step 1: Add the layer model to the state**

In `site/app.js`, replace the `state` object (lines 93 to 111) with:

```js
/* The three layers, and what each one is. A layer is a basis, not a filter:
 * official events and WOAH notifications count different things on different
 * dates from different publishers, so they are never shown together and never
 * added. "world" is the existing global split, which is a 90 day window. */
const LAYERS = [
  { key: 'official', label: 'Official events', region: 'au' },
  { key: 'woah', label: 'WOAH notifications', region: 'au' },
  { key: 'world', label: 'World', region: 'global' },
];

const state = {
  all: [],
  summary: null,
  /* The layer, and the region whose split files it needs. region is kept as its
   * own field because every loader, every map fit and the existing filter
   * pipeline are written against it. */
  layer: 'official',
  region: 'au',
  /* 30, 90 or 'era'. 'era' is the default: the map opens on the whole event. */
  timeframe: 'era',
  /* A species common name, or 'all'. */
  species: 'all',
  /* The resolved H7 poultry outbreaks and the unrelated 2024 human case. Off. */
  showH7: false,
  /* The scrubber's upper bound as an ISO day, or null for "everything". */
  scrubDate: null,
  search: '',
  sortKey: 'date',
  sortDir: -1,
  shown: 50,
  listOpen: false,
  /* The records currently on the map. Held so a zoom change can redraw the
   * rings and their legend without refiltering. */
  mapped: [],
  /* The record the drawer is showing, and what to give focus back to. */
  openRecordId: null,
  returnFocusTo: null,
  /* Nothing is announced to a screen reader during the first paint: the page is
   * arriving, not changing. Set true once boot has finished. */
  announce: false,
};

function layerDef(key) {
  return LAYERS.find((l) => l.key === (key || state.layer)) || LAYERS[0];
}
```

- [ ] **Step 2: Replace the filter predicate**

Replace `matches` (lines 303 to 316) and `searched` (lines 324 to 332) with:

```js
/* Which layer a record belongs to. Records published before the official
 * dataset existed carry no `layer`, so a record without one is treated as
 * belonging to the layer its country puts it in. That keeps the page correct
 * against the data as it stands before the new pipeline lands. */
function recordLayer(r) {
  if (r.layer === 'official' || r.layer === 'woah') return r.layer;
  return r.country === 'Australia' ? 'woah' : 'world';
}

function inLayer(r) {
  if (state.layer === 'world') return r.country !== 'Australia';
  return recordLayer(r) === state.layer;
}

/* A record the department has revised away. Kept in the data for 30 days so the
 * correction is visible rather than silent, and excluded from every count and
 * from the map, which is what "excluded from counts" in the spec means. The
 * panel says how many there are. */
function isWithdrawn(r) { return !!r.withdrawn; }

function inTimeframe(r) {
  if (state.timeframe === 'era') return true;
  return r.date >= daysAgo(Number(state.timeframe));
}

/* opts.ignoreEra, opts.ignoreSpecies, opts.ignoreScrub and opts.ignoreTime let
 * the empty state name the filter that is responsible instead of just saying
 * "no results". */
function matches(r, opts) {
  const o = opts || {};
  if (!inLayer(r)) return false;
  if (isWithdrawn(r)) return false;
  if (!o.ignoreEra && !state.showH7 && !r.era_current) return false;
  if (!o.ignoreSpecies && state.species !== 'all' && r.species !== state.species) return false;
  if (!o.ignoreTime && !inTimeframe(r)) return false;
  if (!o.ignoreScrub && state.scrubDate && r.date > state.scrubDate) return false;
  return true;
}

/* Search narrows the record list only, never the map, so typing never redraws
 * hundreds of markers. The record id is searchable because it is the thing a
 * reader is most likely to arrive with. */
function searched(recs) {
  const q = state.search.trim().toLowerCase();
  if (!q) return recs;
  return recs.filter((r) => {
    const hay = [r.record_id, r.country, r.admin1, r.lga, r.locality, r.species,
      r.species_scientific, r.subtype, r.source, eraShort(r), catLabel(r.category)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/* Every loaded record on a layer, before any filter. The layer counts in the
 * filter bar are counts of the basis, not of the current view, so they cannot
 * move when a reader changes the timeframe. */
function layerRecords(key) {
  const want = key || state.layer;
  if (want === 'world') return state.all.filter((r) => r.country !== 'Australia');
  return state.all.filter((r) => recordLayer(r) === want && !isWithdrawn(r));
}

/* The earliest date on the current layer, for the headline's "since" clause.
 * Read off the records rather than parsed out of an era label, so it corrects
 * itself if the data changes. */
function eraStartIso() {
  let min = null;
  for (const r of layerRecords()) {
    if (!r.era_current) continue;
    if (!Lib.isIsoDay(r.date)) continue;
    if (min === null || r.date < min) min = r.date;
  }
  return min;
}
```

- [ ] **Step 3: Replace `renderViewFigures` with the panel**

Replace `renderViewFigures` and its section banner (lines 1011 to 1062) with:

```js
/* ------------------------------------------------------------- the panel
 * Spec 5.2: one headline sentence, three figures each with its basis and date,
 * a freshness line, and a link to how it is counted. Every number here comes
 * from summary.json and none is computed: the panel states what the publisher
 * published, and the record list below states what is actually on the map.
 */

function renderPanel() {
  const s = state.summary || {};
  const layers = s.au_layers || {};
  const off = s.official_au || {};
  const o = layers.official || {};

  $('#panelHeadline').textContent = Lib.panelHeadline(s, state.layer, eraStartIso());

  const figs = [];
  if (state.layer === 'official') {
    /* 1  The count, and which count it is. Where the spreadsheet row count and
     *    the department's published total disagree, the dataset count is shown
     *    because it is the file the map is drawn from, and the footnote says so
     *    rather than quietly picking one. */
    const mismatch = off.dataset_matches_total === false;
    const shown = mismatch
      ? (off.dataset_rows != null ? off.dataset_rows : o.records)
      : (off.national_total != null ? off.national_total : o.records);
    figs.push({
      num: fmtFig(shown),
      label: 'Confirmed events',
      note: 'Official dataset'
        + (off.as_at_text ? ', as at ' + off.as_at_text : '')
        + (mismatch ? '. The department’s published total is ' + fmtFig(off.national_total)
          + '; both are on /about' : ''),
    });

    /* 2  Jurisdictions, with the list behind a button rather than a title
     *    attribute: a title is unreachable by touch. */
    figs.push({
      num: fmtFig(o.jurisdictions),
      label: Lib.plural(o.jurisdictions, 'Jurisdiction affected', 'Jurisdictions affected'),
      list: Array.isArray(o.jurisdiction_list) ? o.jurisdiction_list : null,
    });

    /* 3  Latest sampled, with where. */
    figs.push({
      num: o.latest_sampled ? Lib.fmtDay(o.latest_sampled) : NOT_PUBLISHED,
      label: 'Latest sampled',
      note: o.latest_sampled_locality || '',
      wide: true,
    });
  } else if (state.layer === 'woah') {
    const w = layers.woah || {};
    figs.push({
      num: fmtFig(w.records),
      label: Lib.plural(w.records, 'Event notified', 'Events notified'),
      note: 'WOAH notifications through FAO EMPRES i plus. A separate basis from the dataset.',
    });
    figs.push({
      num: w.latest ? Lib.fmtDay(w.latest) : NOT_PUBLISHED,
      label: 'Latest notification',
      wide: true,
    });
  } else {
    const n = state.mapped.length;
    figs.push({
      num: fmtFig(n),
      label: Lib.plural(n, 'Event on the map', 'Events on the map'),
      note: 'Outside Australia, last 90 days, from WOAH notifications carried by FAO.',
    });
  }

  $('#panelFigures').innerHTML = figs.map(panelFigureHtml).join('');
  wireFigureLists();
  renderFreshness();
  renderPanelNotes();
}

/* A figure row. This is the old figureHtml with the optional disclosure for the
 * jurisdiction list added. The spec's keep list named figureHtml, but its last
 * caller went with renderViewFigures, and two builders for one piece of markup
 * is the exact duplication Task 2 removed from icons.js. So delete figureHtml
 * (lines 344 to 352, the comment banner and the function) and use this. */
function panelFigureHtml(f) {
  const body = f.list
    ? '<button type="button" class="fig-more" aria-expanded="false">Which ones</button>'
      + '<span class="fig-more-body" hidden>' + escapeHtml(f.list.join(', ')) + '</span>'
    : (f.note ? '<span class="figure__note">' + escapeHtml(f.note) + '</span>' : '');
  return '<div class="figure' + (f.wide ? ' figure--wide' : '') + '">'
    + '<span class="figure__num">' + escapeHtml(f.num) + '</span>'
    + '<span class="figure__label">' + escapeHtml(f.label) + '</span>'
    + body
    + '</div>';
}

function wireFigureLists() {
  document.querySelectorAll('#panelFigures .fig-more').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      const body = btn.nextElementSibling;
      if (body) body.hidden = open;
    });
  });
}

/* The freshness line, in the three states spec 5.2 names. The alarm colour goes
 * on this sentence and on the map marks, and nowhere else on the site. */
function renderFreshness() {
  const s = state.summary || {};
  const el = $('#panelFreshness');
  const r = Lib.freshnessLine(s.freshness, s.official_au, Date.now());
  el.textContent = r.text;
  el.className = 'panel__freshness'
    + (r.kind === 'stale' || r.kind === 'unknown' ? ' panel__freshness--stale' : '');
}

/* At most two one-line notes, and only when they are true: the grey records the
 * H7 toggle added, and any record the department has withdrawn. */
function renderPanelNotes() {
  const notes = [];
  if (state.showH7) {
    notes.push('Grey marks are resolved H7 poultry outbreaks from 2024 to 2025 and one travel '
      + 'acquired human case from 2024. A different subtype or lineage, never added to the figures '
      + 'above.');
  }
  const withdrawn = state.all.filter((r) => isWithdrawn(r) && recordLayer(r) === state.layer).length;
  if (withdrawn) {
    notes.push(withdrawn + ' ' + Lib.plural(withdrawn, 'record has', 'records have')
      + ' been withdrawn by the department and ' + Lib.plural(withdrawn, 'is', 'are')
      + ' not counted or mapped.');
  }
  const el = $('#panelNotes');
  el.hidden = notes.length === 0;
  el.innerHTML = notes.map((n) => escapeHtml(n)).join(' ');
}
```

- [ ] **Step 4: Collapse the legend and the map note to one line each**

Replace `renderLegend` (lines 932 to 980) and `renderMapNote` (982 to 1001) with one function. The long explanations they carried are now the `/about#marks` section, which Task 5 wrote:

```js
/* Two sentences at the edge of the map, and no more. What the marks mean, and
 * what the ring is not. Both link to the section of /about that sets them out
 * in full, which is where the paragraphs that used to be here now live. */
function renderMapMeta() {
  const trueScale = trueScaleVisible();
  const marks = state.layer === 'official'
    ? 'Carmine squares are confirmed events: solid at locality precision, hollow at LGA, a dashed '
      + 'ring at the jurisdiction centroid.'
    : (state.layer === 'woah'
      ? 'Ink rings are events Australia notified to WOAH. A separate basis from the official dataset.'
      : 'Ink dots are events outside Australia notified to WOAH in the last 90 days.');
  const ring = showAreas()
    ? ' Rings are a 10 km vicinity indicator, not a control area, '
      + (trueScale ? 'drawn true to scale at this zoom.' : 'drawn dashed at a fixed screen size at this zoom.')
    : '';
  $('#mapMeta').innerHTML = escapeHtml(marks) + escapeHtml(ring)
    + ' <a href="/about#marks">What the marks mean</a>.';
}
```

Then fix the two call sites in `onZoomEnd` (lines 885 to 887): replace `renderLegend(state.mapped);` and `renderMapNote();` with a single `renderMapMeta();`.

- [ ] **Step 5: Replace the fallback banner half of `renderMeta`**

Add this function directly above `renderMeta`, and add a call to it as the first line inside `renderMeta`:

```js
/* Spec 5.2's error state. A run where a source failed, or where the restore
 * path put yesterday's data on screen, says so at the top of the page and names
 * the date of the data the reader is looking at. This is the failure the whole
 * rebuild exists to make impossible to miss, so it takes the alarm treatment. */
function renderFallbackBanner() {
  const fr = (state.summary && state.summary.freshness) || null;
  const el = $('#banner');
  if (!fr || !fr.sources || typeof fr.sources !== 'object') return;
  const keys = Object.keys(fr.sources);
  const bad = keys.filter((k) => {
    const x = fr.sources[k];
    return x && (x.status === 'error' || x.status === 'restored');
  });
  if (!bad.length) return;
  const restored = bad.filter((k) => fr.sources[k].status === 'restored');
  const dated = fr.dataset_date ? Lib.fmtDay(fr.dataset_date) : '';
  el.hidden = false;
  el.className = 'banner banner--live';
  el.innerHTML = '<p><strong>Not a fresh read.</strong> ' + bad.length + ' of ' + keys.length + ' '
    + Lib.plural(bad.length, 'source', 'sources') + ' did not answer on the last run'
    + (restored.length ? ', so the last good copy was restored' : '')
    + (dated ? '. The Australian records on screen are from ' + escapeHtml(dated) : '')
    + '. <a href="/about#freshness">Which sources, and when each was last read</a>.</p>';
}
```

The banner may already hold the skew notice, so make `renderMeta`'s own notice append rather than overwrite. In `renderMeta`, change the block that writes to `#banner` to:

```js
  if (notices.length) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML += notices.map((n) => '<p>' + n + '</p>').join('');
  }
```

and add `renderFallbackBanner();` as the first statement of `renderMeta` after the `if (!s) return;` guard.

- [ ] **Step 6: Call the panel from `render` and `boot`**

Replace `render` with:

```js
function render() {
  const recs = inView();
  state.mapped = recs;
  renderMarkers(recs);
  renderPanel();
  renderMapMeta();
  if (state.listOpen) renderList(searched(recs));
}
```

`renderPanel` comes after `renderMarkers` because the world layer's figure counts what is on the map, which `renderMarkers` has just set.

In `boot`, no change is needed: `render()` now draws the panel. Confirm the order is `buildControls(); renderMeta(); render(); focusRegion(state.region);`.

- [ ] **Step 7: Add the `figure--wide` rule the panel needs**

In `site/styles.css`, in the `.panel__figures` block Task 4 added, append:

```css
/* A date is not a count: it needs the whole row, not a 5ch numeral column. */
.panel__figures .figure--wide { grid-template-columns: 1fr; }
.panel__figures .figure--wide .figure__num {
  grid-column: 1;
  text-align: left;
  font-size: 0.9375rem;
}
.panel__figures .figure--wide .figure__label { grid-column: 1; grid-row: 2; }
.panel__figures .figure--wide .figure__note { grid-column: 1; grid-row: 3; }
```

- [ ] **Step 8: Verify against both data shapes**

Run `node --check site/app.js`, then with the server running:

```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
npx playwright screenshot --viewport-size=1280,800 --wait-for-timeout=3000 \
  http://localhost:8080/index.html $S/panel-old-data.png
```

Expected against today's committed data, which has no `au_layers` and no `freshness`: the headline reads "The Australian counts were not published in this build, so none is stated here.", the figures show `not published` rather than blanks, and the freshness line reads "This build did not record when it ran" in carmine. That is the honest fallback, and it is what proves the page does not depend on stream A having landed.

Then check the new shape by pointing the page at the fixture. Do not edit `site/data`: serve a copy.

```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
rm -rf $S/preview && cp -R site $S/preview
cp site/test/fixtures/summary.new.json $S/preview/data/summary.json
node -e "
const http=require('http'), fs=require('fs'), path=require('path'), root='$S/preview';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((q,r)=>{
  let p=path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p=path.join(p,'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p = p + '.html';
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});
  r.end(fs.readFileSync(p));
}).listen(8090, ()=>console.log('fixture preview on http://localhost:8090'));
" &
sleep 1
npx playwright screenshot --viewport-size=1280,800 --wait-for-timeout=3000 \
  http://localhost:8090/index.html $S/panel-new-data.png
```

Expected: the headline reads exactly "H5 bird flu has been confirmed in 668 wild animals across 7 jurisdictions since June 2026." (the "since" month comes from the earliest record in the committed `au.json`, so it may differ; what must be true is that the sentence is complete and carries both numbers), the first figure reads 668 with "Official dataset, as at 4 pm AEST, 29 September 2026", the second reads 7 with a "Which ones" button, the third is a date with a locality, and the freshness line is not carmine.

This fixture server also resolves extensionless paths, so it is the right one to use for the `/about` and `/history` link checks in Task 14.

- [ ] **Step 9: Commit**

```bash
git add site/app.js site/styles.css
git commit -m "feat(site): generate the panel, freshness line and map notes from data"
```

---

### Task 7: The filter bar

Four controls, all built from the data so a control can never offer a filter that empties the map: the layer control with its counts, the timeframe, the species chips, and the H7 toggle. Plus the List records toggle, and the bottom sheet's grip.

**Files:**
- Modify: `site/app.js`: replace `buildControls`, extend `wire`, add `setLayer`, `speciesTop`, `setSheetState`; delete `setPressed`'s dead call sites

**Interfaces:**
- Consumes: `LAYERS`, `layerRecords`, `state` (Task 6); `#layerBtns`, `#timeframe`, `#speciesChips`, `#showH7`, `#listToggle`, `#sheet`, `#sheetGrip`, `#sheetGripText` (Task 3); `.filterbar`, `.sheet[data-state]` (Task 4).
- Consumes from stream A: `summary.au_layers.official.species_top`.
- Produces: `setLayer(key)` and `setSheetState(name)`, which Task 9 calls when the drawer opens and closes.

- [ ] **Step 1: Build the controls**

Replace the empty `buildControls` from Task 3 with:

```js
/* The filter bar. Every control is built from the data: a layer with no records
 * is disabled rather than offered, and the species chips are the species that
 * are actually there. The counts on the layer buttons are counts of the basis,
 * not of the current view, so they do not move when the timeframe changes. */
function buildControls() {
  const s = state.summary || {};
  const layers = s.au_layers || {};

  /* Published counts where the build has them, loaded counts where it does not,
   * and no count at all for the world layer, which is a 90 day window rather
   * than a total. */
  const published = {
    official: layers.official && layers.official.records,
    woah: layers.woah && layers.woah.records,
    world: null,
  };
  $('#layerBtns').innerHTML = LAYERS.map((l) => {
    const on = state.layer === l.key;
    const n = published[l.key] != null ? published[l.key]
      : (l.key === 'world' ? null : layerRecords(l.key).length);
    const count = n == null ? '' : ' <span class="ctl__count">' + escapeHtml(fmtNum(n)) + '</span>';
    return '<button type="button" class="ctl' + (on ? ' is-active' : '') + '"'
      + ' data-layer="' + escapeHtml(l.key) + '" aria-pressed="' + on + '">'
      + escapeHtml(l.label) + count + '</button>';
  }).join('');

  $('#timeframe').value = String(state.timeframe);
  buildSpeciesChips();
  $('#showH7').checked = state.showH7;
}

/* The top six species on the layer, plus All. Published where the build has it,
 * counted from the loaded records where it does not, which is also the only way
 * to do it for the WOAH and world layers. */
function speciesTop(limit) {
  const n = limit || 6;
  const s = state.summary || {};
  const published = state.layer === 'official'
    && s.au_layers && s.au_layers.official && s.au_layers.official.species_top;
  if (Array.isArray(published) && published.length) {
    return published.slice(0, n).map((x) => ({ name: x.name, count: x.count }));
  }
  const counts = new Map();
  for (const r of layerRecords()) {
    if (!r.species) continue;
    counts.set(r.species, (counts.get(r.species) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function buildSpeciesChips() {
  const top = speciesTop(6);
  const all = [{ name: 'all', label: 'All species', count: null }]
    .concat(top.map((x) => ({ name: x.name, label: x.name, count: x.count })));
  /* A species the reader picked that has dropped out of the top six stays on
   * the bar, otherwise the active chip would vanish from under them. */
  if (state.species !== 'all' && !top.some((x) => x.name === state.species)) {
    all.push({ name: state.species, label: state.species, count: null });
  }
  $('#speciesChips').innerHTML = all.map((c) => {
    const on = state.species === c.name;
    const count = c.count == null ? '' : ' <span class="ctl__count">' + escapeHtml(fmtNum(c.count)) + '</span>';
    return '<button type="button" class="ctl ctl--sm' + (on ? ' is-active' : '') + '"'
      + ' data-species="' + escapeHtml(c.name) + '" aria-pressed="' + on + '">'
      + escapeHtml(c.label) + count + '</button>';
  }).join('');
}
```

- [ ] **Step 2: Add the layer switch**

Add above `wire`:

```js
/* Switching layer switches basis, so everything downstream of it resets: the
 * species chips are per layer, and a species chosen on one layer usually does
 * not exist on another. The timeframe and the scrubber are kept, because they
 * are questions about time and mean the same thing on every layer. */
function setLayer(key) {
  const def = layerDef(key);
  state.layer = def.key;
  state.region = def.region;
  state.species = 'all';
  state.shown = 50;
  onLayerChanged();
  focusRegion(state.region);
  ensureRegionData(state.region).then(() => {
    buildControls();
    onLayerLoaded();
    render();
  }, (err) => {
    console.error(err);
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML += '<p><strong>Some records did not load.</strong> The view below may be missing '
      + 'records. Try again shortly.</p>';
    buildControls();
    render();
  });
}

/* Two extension points, so a layer switch stays one function while the pieces
 * that have to react to it are added by the tasks that own them. Empty here;
 * the scrubber task and the drawer task each add their own line, and nothing
 * else ever calls them.
 *
 * onLayerChanged runs before the new layer's records are fetched, for anything
 * that must be torn down. onLayerLoaded runs after, for anything whose shape is
 * the new layer's data. */
function onLayerChanged() {
}
function onLayerLoaded() {
}

/* The phone sheet's three states. Inert above 720px, where the CSS puts each
 * child at its own corner. */
const SHEET_TEXT = { collapsed: 'Filters and dates', half: 'Hide filters', expanded: 'Filters and dates' };
function setSheetState(name) {
  const sheet = $('#sheet');
  if (!sheet) return;
  sheet.dataset.state = name;
  const grip = $('#sheetGrip');
  if (grip) grip.setAttribute('aria-expanded', String(name !== 'collapsed'));
  const text = $('#sheetGripText');
  if (text) text.textContent = SHEET_TEXT[name] || SHEET_TEXT.collapsed;
}
```

- [ ] **Step 3: Wire the controls**

Add these handlers to `wire`, above the existing `#thead` block:

```js
  $('#layerBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (!b) return;
    setPressed('#layerBtns', b);
    setLayer(b.dataset.layer);
  });

  $('#speciesChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-species]');
    if (!b) return;
    state.species = b.dataset.species;
    state.shown = 50;
    setPressed('#speciesChips', b);
    render();
  });

  $('#timeframe').addEventListener('change', (e) => {
    /* 'era' stays a string, the day counts become numbers, because inTimeframe
     * tests for the string and arithmetics the rest. */
    state.timeframe = e.target.value === 'era' ? 'era' : Number(e.target.value);
    state.shown = 50;
    render();
  });

  $('#showH7').addEventListener('change', (e) => {
    state.showH7 = e.target.checked;
    state.shown = 50;
    render();
  });

  $('#listToggle').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    state.listOpen = !state.listOpen;
    btn.setAttribute('aria-expanded', String(state.listOpen));
    btn.textContent = state.listOpen ? 'Hide records' : 'List records';
    const panel = $('#listPanel');
    panel.hidden = !state.listOpen;
    if (state.listOpen) {
      renderList(searched(inView()));
      const first = panel.querySelector('#search');
      if (first) first.focus({ preventScroll: true });
    } else {
      btn.focus({ preventScroll: true });
    }
  });

  $('#sheetGrip').addEventListener('click', () => {
    const now = $('#sheet').dataset.state;
    setSheetState(now === 'collapsed' ? 'half' : 'collapsed');
  });
```

`setPressed` at line 1617 is unchanged and still correct: it clears `.is-active` and `aria-pressed` across a container and sets them on one button.

- [ ] **Step 4: Style the counts on a control**

Add to the `.filterbar` block in `site/styles.css`:

```css
/* The count on a layer or species button. Quieter than the label, because the
   label is the choice and the count is the size of it. */
.ctl__count { color: var(--ink-2); font-weight: 400; }
.ctl.is-active .ctl__count { color: var(--ink); }
```

- [ ] **Step 5: Verify every control changes the map**

Run `node --check site/app.js`, then with the fixture server from Task 6 Step 8 running on 8090:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && cat > /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/filters.mjs <<'JS'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto('http://localhost:8090/index.html');
await p.waitForTimeout(2500);
const count = () => p.evaluate(() => document.querySelectorAll('#map .leaflet-marker-icon, #map path.leaflet-interactive').length);
const base = await count();
console.log('official markers', base);
await p.click('[data-layer="woah"]');
await p.waitForTimeout(1500);
console.log('woah markers', await count());
await p.click('[data-layer="official"]');
await p.waitForTimeout(1500);
await p.selectOption('#timeframe', '30');
await p.waitForTimeout(600);
const t30 = await count();
console.log('last 30 days', t30);
if (t30 >= base) throw new Error('timeframe did not reduce the marker count');
await p.selectOption('#timeframe', 'era');
await p.waitForTimeout(600);
const chips = await p.$$('#speciesChips [data-species]');
await chips[1].click();
await p.waitForTimeout(600);
const sp = await count();
console.log('one species', sp);
if (sp >= base) throw new Error('species chip did not reduce the marker count');
await chips[0].click();
await p.waitForTimeout(600);
await p.check('#showH7');
await p.waitForTimeout(600);
console.log('with H7', await count());
if (errors.length) { console.error('CONSOLE ERRORS:', errors.join('\n')); process.exit(1); }
console.log('filters ok, console clean');
await b.close();
JS
node /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/filters.mjs
```

Expected: `filters ok, console clean`, with the WOAH marker count differing from the official one, the 30 day count lower than the era count, and the species count lower again. A thrown error names which control did not work.

- [ ] **Step 6: Check the phone sheet's three states**

```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
npx playwright screenshot --viewport-size=390,844 --wait-for-timeout=2500 \
  http://localhost:8090/index.html $S/sheet-collapsed.png
```

Then open the page at 390 with `npx playwright open --viewport-size=390,844 http://localhost:8090/index.html`, tap the grip, and confirm: collapsed shows the headline and the three figures only; one tap opens half, which adds the filters and the scrubber; the sheet never grows past half the viewport height; the map is visible above it in both states.

- [ ] **Step 7: Commit**

```bash
git add site/app.js site/styles.css
git commit -m "feat(site): build the filter bar from the data, with layer counts"
```

---

### Task 8: The date scrubber

A native range input over the days from 15 June 2026 to the dataset date, resting at the dataset date so the map opens complete. Dragging it filters by sampling date. A cumulative sparkline of the layer sits under the track. Play replays the outbreak at roughly one week per second, and reduced motion removes it.

The scrubber counts what the map shows and nothing else, which is why it filters through the same `matches` predicate every other control uses rather than holding a count of its own.

**Files:**
- Modify: `site/app.js`: add `SCRUB_START`, `scrubBounds`, `buildScrubber`, `setScrub`, `renderSpark`, `startPlay`, `stopPlay`, `prefersReducedMotion`; extend `wire` and `boot`

**Interfaces:**
- Consumes: `Lib.dayIndex`, `Lib.isoDay`, `Lib.fmtDay` (Task 1); `layerRecords`, `state.scrubDate`, `render` (Task 6); `#scrubDate`, `#scrubSpark`, `#scrubLabel`, `#scrubPlay` (Task 3); `.scrubber__spark path`, `.scrubber__spark line` (Task 4).
- Consumes from stream A: `summary.freshness.dataset_date` for the upper bound. Without it the bound is the latest record on the layer, which is correct but a day or two earlier.
- Produces: `buildScrubber()`, called by `boot` and by `setLayer`.

- [ ] **Step 1: Add the scrubber**

Add this block to `site/app.js`, above the controls section:

```js
/* ---------------------------------------------------------- the scrubber
 * Spec 5.2: 15 June 2026 to the dataset date, resting at the dataset date so
 * the map opens complete, filtering by sampling date. The bound is a date, not
 * an index into the records, so a day with no events is still a day the reader
 * can stop on.
 */

const SCRUB_START = '2026-06-15';

let playFrame = null;
let lastPlayValue = null;

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* The two ends of the track, as day indices. The upper end is the dataset date
 * the build published, or the latest record on the layer when it did not. */
function scrubBounds() {
  const fr = (state.summary && state.summary.freshness) || {};
  const recs = layerRecords();
  let latest = null;
  for (const r of recs) {
    if (!Lib.isIsoDay(r.date)) continue;
    if (latest === null || r.date > latest) latest = r.date;
  }
  const endIso = Lib.isIsoDay(fr.dataset_date) && (!latest || fr.dataset_date >= latest)
    ? fr.dataset_date
    : latest;
  if (!endIso) return null;
  let startIdx = Lib.dayIndex(SCRUB_START);
  const endIdx = Lib.dayIndex(endIso);
  /* A layer whose records all predate the fixed start, which is the world
   * layer's 90 day window every time it crosses a year boundary, gets its own
   * earliest record as the start instead of an empty first two thirds. */
  let earliest = null;
  for (const r of recs) {
    if (!Lib.isIsoDay(r.date)) continue;
    if (earliest === null || r.date < earliest) earliest = r.date;
  }
  if (earliest && Lib.dayIndex(earliest) > startIdx) startIdx = Lib.dayIndex(earliest);
  if (!(endIdx > startIdx)) return null;
  return { startIdx, endIdx, endIso };
}

/* Called on boot and whenever the layer changes, because the bounds and the
 * sparkline are both properties of the layer. */
function buildScrubber() {
  stopPlay();
  const el = $('#scrubber');
  const input = $('#scrubDate');
  const b = scrubBounds();
  if (!b) {
    /* No dated records on this layer: a slider with one stop is a control that
     * lies about being a control. */
    el.hidden = true;
    state.scrubDate = null;
    return;
  }
  el.hidden = false;
  input.min = '0';
  input.max = String(b.endIdx - b.startIdx);
  input.step = '1';
  input.value = input.max;
  state.scrubDate = null;
  renderSpark(b, Number(input.max));
  $('#scrubLabel').textContent = Lib.fmtDay(b.endIso);
  const play = $('#scrubPlay');
  if (play) play.hidden = prefersReducedMotion();
}

/* The slider's value is a day offset from the start of the track. At the top of
 * the track the bound is dropped entirely rather than set to the last day, so a
 * record dated after the dataset date, which should not exist but would be a
 * real fact if it did, is never silently hidden by a control at rest. */
function setScrub(value) {
  const b = scrubBounds();
  if (!b) return;
  const v = Math.max(0, Math.min(Number(value), b.endIdx - b.startIdx));
  const input = $('#scrubDate');
  if (Number(input.value) !== v) input.value = String(v);
  const atEnd = v >= b.endIdx - b.startIdx;
  const iso = Lib.isoDay(b.startIdx + v);
  state.scrubDate = atEnd ? null : iso;
  $('#scrubLabel').textContent = Lib.fmtDay(iso);
  renderSpark(b, v);
  render();
}

/* The cumulative count of the layer across the whole track, as one path, with a
 * carmine rule at the reader's position. Decorative: aria-hidden, because the
 * slider carries the value and the output states the date in words. */
function renderSpark(bounds, value) {
  const svg = $('#scrubSpark');
  if (!svg) return;
  const span = bounds.endIdx - bounds.startIdx;
  if (span <= 0) { svg.innerHTML = ''; return; }
  const perDay = new Array(span + 1).fill(0);
  for (const r of layerRecords()) {
    if (!Lib.isIsoDay(r.date)) continue;
    if (!state.showH7 && !r.era_current) continue;
    let i = Lib.dayIndex(r.date) - bounds.startIdx;
    if (i < 0) i = 0;
    if (i > span) continue;
    perDay[i] += 1;
  }
  let run = 0;
  const cum = perDay.map((n) => { run += n; return run; });
  const max = cum[cum.length - 1] || 1;
  /* A point per day would be 100 plus nodes in a 100 unit wide box, which is
   * more precision than the strip can show, so the path is sampled to at most
   * 120 points. */
  const stepSize = Math.max(1, Math.ceil(span / 120));
  const pts = [];
  for (let i = 0; i <= span; i += stepSize) {
    const x = ((i / span) * 100).toFixed(2);
    const y = (19.5 - (cum[i] / max) * 19).toFixed(2);
    pts.push((pts.length ? 'L' : 'M') + x + ' ' + y);
  }
  const lastX = '100';
  const lastY = (19.5 - (cum[span] / max) * 19).toFixed(2);
  pts.push('L' + lastX + ' ' + lastY);
  const at = ((value / span) * 100).toFixed(2);
  svg.innerHTML = '<path d="' + pts.join(' ') + '"/>'
    + '<line x1="' + at + '" y1="0" x2="' + at + '" y2="20"/>';
}

function startPlay() {
  if (prefersReducedMotion()) return;
  const b = scrubBounds();
  if (!b) return;
  const input = $('#scrubDate');
  const max = Number(input.max);
  const from = Number(input.value) >= max ? 0 : Number(input.value);
  const t0 = performance.now();
  lastPlayValue = null;
  $('#scrubPlay').setAttribute('aria-pressed', 'true');
  $('#scrubPlay').textContent = 'Pause';
  const tick = (now) => {
    /* Seven days a second, computed from elapsed time rather than counted in
     * frames, so the replay runs at the same speed on every device. */
    const v = Math.min(max, from + Math.floor(((now - t0) / 1000) * 7));
    /* The map is only redrawn when the day actually changes, which is about
     * seven times a second rather than sixty. */
    if (v !== lastPlayValue) {
      lastPlayValue = v;
      setScrub(v);
    }
    if (v >= max) { stopPlay(); return; }
    playFrame = requestAnimationFrame(tick);
  };
  playFrame = requestAnimationFrame(tick);
}

function stopPlay() {
  if (playFrame !== null) {
    cancelAnimationFrame(playFrame);
    playFrame = null;
  }
  lastPlayValue = null;
  const play = $('#scrubPlay');
  if (play) {
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Play';
  }
}
```

- [ ] **Step 2: Wire it**

Add to `wire`:

```js
  $('#scrubDate').addEventListener('input', (e) => {
    /* A drag is a deliberate stop, so it takes the replay off the road. */
    stopPlay();
    setScrub(e.target.value);
  });

  $('#scrubPlay').addEventListener('click', () => {
    if (playFrame !== null) stopPlay();
    else startPlay();
  });
```

- [ ] **Step 3: Build it on boot, and rebuild it on a layer change**

In `boot`, add `buildScrubber();` immediately after `buildControls();`.

In `onLayerLoaded` (the empty hook Task 7 added), add the one line that is this task's:

```js
function onLayerLoaded() {
  /* The bounds and the sparkline are both properties of the layer. */
  buildScrubber();
}
```

- [ ] **Step 4: Verify the scrubber filters and its count matches the map**

Run `node --check site/app.js`, then with the fixture server running:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && cat > /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/scrub.mjs <<'SCRUBJS'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:8090/index.html');
await p.waitForTimeout(2500);
const count = () => p.evaluate(() => document.querySelectorAll('#map .leaflet-marker-icon, #map path.leaflet-interactive').length);
const max = await p.$eval('#scrubDate', (el) => Number(el.max));
const atEnd = await count();
const labelEnd = await p.$eval('#scrubLabel', (el) => el.textContent);
console.log('at the dataset date:', atEnd, 'marker(s), label', JSON.stringify(labelEnd));
await p.$eval('#scrubDate', (el, v) => {
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, Math.floor(max / 2));
await p.waitForTimeout(800);
const half = await count();
const labelHalf = await p.$eval('#scrubLabel', (el) => el.textContent);
console.log('halfway:', half, 'marker(s), label', JSON.stringify(labelHalf));
if (!(half < atEnd)) throw new Error('the scrubber did not reduce the marker count');
if (labelHalf === labelEnd) throw new Error('the label did not follow the slider');
const sparkPaths = await p.$$eval('#scrubSpark path', (els) => els.length);
const sparkLines = await p.$$eval('#scrubSpark line', (els) => els.length);
if (sparkPaths !== 1 || sparkLines !== 1) throw new Error('the sparkline is not one path and one marker line');
await p.$eval('#scrubDate', (el) => {
  el.value = el.max;
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(800);
if (await count() !== atEnd) throw new Error('returning to the end did not restore the full view');
if (errors.length) { console.error('PAGE ERRORS:', errors.join('\n')); process.exit(1); }
console.log('scrubber ok');
await b.close();
SCRUBJS
node /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/scrub.mjs
```

Expected: `scrubber ok`, with a lower marker count at the halfway stop and a date label that moved.

- [ ] **Step 5: Verify reduced motion removes play and keeps the slider**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await p.goto('http://localhost:8090/index.html');
  await p.waitForTimeout(2500);
  const sliderVisible = await p.isVisible('#scrubDate');
  const playVisible = await p.isVisible('#scrubPlay');
  console.log('slider visible', sliderVisible, '| play visible', playVisible);
  if (!sliderVisible) throw new Error('reduced motion must keep the slider');
  if (playVisible) throw new Error('reduced motion must remove play');
  console.log('reduced motion ok');
  await b.close();
});
"
```
Expected: `reduced motion ok`.

- [ ] **Step 6: Commit**

```bash
git add site/app.js
git commit -m "feat(site): add the date scrubber with a cumulative sparkline"
```

---

### Task 9: The drawer, the cluster list, the precision marks and the record list

`popupHtml` becomes the drawer body, `columns` and `renderList` become the record list and its keyboard path into the drawer, and the official layer's markers become precision-sized squares.

The markers change here rather than in Task 6 because a square is a `divIcon` marker and a `divIcon` marker is keyboard focusable, which is what lets the drawer hand focus back to the thing that opened it.

**Files:**
- Modify: `site/app.js`: replace `renderMarkers` (857-872), `popupHtml` (904-918), `placementNoteHtml` (892-902), `columns` (1070-1089), `cellHtml` (1132-1147), `renderList` (1169-1239), `emptyMessage` (1297-1310), `filterSummary` (1283-1293), `hasPlace` (795-797); add `officialIcon`, `openDrawer`, `openCluster`, `closeDrawer`, `drawerBodyHtml`, `recordById`, `clusterFor`

**Interfaces:**
- Consumes: `Lib.placementSentence`, `Lib.fmtDay`, `Lib.esc`, `Lib.linkHtml` (Task 1); `catMark` (Task 2); `#drawer`, `#drawerTitle`, `#drawerClose`, `#drawerBody`, `#listPanel`, `#table` (Task 3); `.mk--official`, `.mk--locality`, `.mk--lga`, `.mk--state`, `.mk--resolved`, `.drawer__*` (Task 4); `setSheetState` (Task 7).
- Consumes from stream A: `record.precision`, `record.date_basis`, `record.record_id`, `record.lga`, `record.admin1_note`, `record.species_scientific`, `record.withdrawn`, and `official_au.dataset_url` for the record id's link target.
- Produces: `openDrawer(record, returnTo)` and `closeDrawer()`, which Task 10 hooks the species turntable into. `state.openRecordId` is the record the turntable is showing.

- [ ] **Step 1: Draw official events as precision squares**

Replace `renderMarkers` (lines 857 to 872) with:

```js
/* A divIcon marker for the official layer, because a square is not a circle and
 * because L.Marker is keyboard focusable while an SVG path is not, so this is
 * also the map's own tab stop. Size is precision: a wider mark for a wider
 * uncertainty, which is the honest direction for the encoding to run in.
 * The other layers stay canvas circleMarkers, where the count is thousands. */
const MK_SIZE = { locality: 10, lga: 14, state: 18 };

function officialIcon(r) {
  const p = MK_SIZE[r.precision] ? r.precision : 'locality';
  const n = MK_SIZE[p];
  const cls = ['mk', r.era_current ? 'mk--official' : 'mk--resolved', 'mk--' + p].join(' ');
  return L.divIcon({
    className: cls,
    iconSize: [n, n],
    iconAnchor: [n / 2, n / 2],
  });
}

function renderMarkers(recs) {
  markerLayer.clearLayers();
  placed = placements(recs);
  /* Rings first, then every marker, so a point is never hidden by a ring. */
  drawAreas();

  for (const p of placed) {
    const r = p.r;
    let m;
    if (recordLayer(r) === 'official') {
      m = L.marker(p.at, {
        icon: officialIcon(r),
        keyboard: true,
        title: [r.species, r.locality].filter(Boolean).join(', '),
        alt: [r.species, r.locality, r.admin1].filter(Boolean).join(', '),
      });
    } else {
      /* Live is a solid disc, resolved is a hollow ring. Fill against outline is
       * a shape difference, so the two survive with colour removed. */
      m = L.circleMarker(p.at, isLive(r)
        ? { radius: markerRadius(r), color: PALETTE.ink, weight: 1.2, fillColor: PALETTE.paper, fillOpacity: 1 }
        : { radius: markerRadius(r), color: PALETTE.ink2, weight: 1.4, fillColor: PALETTE.paper, fillOpacity: 1 });
    }
    /* A click opens the drawer rather than a popup: the drawer is one panel in
     * one place, which a popup on a marker at the edge of the viewport is not.
     * Where several records share a placement, the click lists them. */
    m.on('click', () => {
      const group = clusterFor(r);
      if (group.length > 1) openCluster(group, p.at);
      else openDrawer(r, null);
    });
    m.addTo(markerLayer);
  }
}

/* The records drawn at the same placement as this one. placements() already
 * knows which coordinates are shared; this answers it from the drawn set so a
 * cluster is exactly what the reader clicked on. */
function clusterFor(r) {
  const key = coordKey(r);
  return placed.filter((p) => coordKey(p.r) === key).map((p) => p.r);
}

function recordById(id) {
  return state.all.find((r) => r.id === id) || null;
}
```

Then update `hasPlace` (lines 795 to 797), because the official records carry `precision` and the FAO records carry `level`:

```js
/* No ring where a record resolves only to an LGA, a state or a region: a ring
 * around a centroid would imply a precision the source never published. */
function hasPlace(r) {
  if (r.precision) return r.precision === 'locality';
  return r.level === 'point';
}
```

- [ ] **Step 2: Turn `popupHtml` into the drawer body**

Replace `placementNoteHtml` (lines 892 to 902) and `popupHtml` (904 to 918) with:

```js
/* ------------------------------------------------------------- the drawer
 * Spec 5.2: species, the 3D figure, where, when and on what basis, the record
 * id linking to the dataset, the placement sentence, and for a WOAH record its
 * own identifiers. A dialog, but deliberately not a modal one: a modal traps
 * focus away from the map, and the map is the page.
 */

/* The species turntable is the birds task's, and it is the last task in this
 * stream. Stubbed here so the drawer is complete on its own and so the two call
 * sites below are written once, in the place that owns the drawer's lifecycle,
 * rather than injected into it later. The birds task replaces both bodies. */
function mountSpeciesFigure() {
}
function disposeSpeciesFigure() {
}

function drawerRow(key, value) {
  if (!value) return '';
  return '<p class="drawer__row"><span class="drawer__key">' + escapeHtml(key) + '</span>'
    + value + '</p>';
}

function drawerBodyHtml(r) {
  const rows = [];

  if (r.species_scientific) {
    rows.push('<p class="drawer__sci"><i>' + escapeHtml(r.species_scientific) + '</i></p>');
  }
  /* The turntable. Hidden until the birds module reports it mounted, so a
   * device that fails a gate gets no empty box rather than a blank square. */
  rows.push('<canvas id="drawerFigure" class="drawer__figure" width="160" height="160" hidden></canvas>');

  if (r.withdrawn) {
    rows.push('<p class="drawer__row"><strong>Withdrawn by the department on '
      + escapeHtml(Lib.fmtDay(r.withdrawn)) + '.</strong> It is kept here for 30 days so the '
      + 'correction is visible, and it is not counted or mapped.</p>');
  }

  const where = [r.locality, r.lga, r.admin1].filter(Boolean).join(', ');
  rows.push(drawerRow('Where', escapeHtml(where || r.country || 'not stated')
    + (r.admin1_note ? ' <span class="quiet">' + escapeHtml(r.admin1_note) + '</span>' : '')));

  /* The date, and what kind of date it is. A record with no sampling date is
   * dated by the snapshot it first appeared in, and saying which is the whole
   * point: the alternative is inventing a sampling date. */
  const basis = r.date_basis === 'first_seen'
    ? 'First published in the dataset'
    : (r.date_basis === 'sampled' ? 'Date sampled' : 'Date reported');
  rows.push(drawerRow(basis, '<time datetime="' + escapeHtml(r.date) + '">'
    + escapeHtml(Lib.fmtDay(r.date)) + '</time>'));

  rows.push(drawerRow('Type', catCell(r.category)));

  if (r.record_id) {
    const ds = (state.summary && state.summary.official_au && state.summary.official_au.dataset_url)
      || r.source_url;
    rows.push(drawerRow('Record id', Lib.linkHtml(ds, r.record_id)
      + ' <span class="quiet">in the department’s dataset</span>'));
  }

  /* A WOAH record carries no departmental record id, so its own identifiers and
   * its notification date are what it is cited by. */
  if (recordLayer(r) === 'woah') {
    rows.push(drawerRow('FAO event reference', escapeHtml(r.id)));
    rows.push(drawerRow('Strain', strainTag(r) + ' ' + statusTag(r)));
    if (r.count) rows.push(drawerRow('Animals affected', escapeHtml(fmtNum(r.count))));
  }

  rows.push('<p class="drawer__row">' + escapeHtml(Lib.placementSentence(r))
    + ' <a href="/about#placement">How placement works</a>.</p>');

  rows.push(drawerRow('Source', Lib.linkHtml(r.source_url, r.source)));

  return rows.filter(Boolean).join('');
}

/* Several records at one placement. Selecting one opens it, and the drawer's
 * back path is the cluster, so a reader never loses the other four. */
function openCluster(group, at) {
  const drawer = $('#drawer');
  state.openRecordId = null;
  disposeSpeciesFigure();
  $('#drawerTitle').textContent = group.length + ' records at this place';
  $('#drawerBody').innerHTML = '<p class="drawer__row">'
    + escapeHtml([group[0].locality, group[0].admin1].filter(Boolean).join(', ') || 'This place')
    + ' has ' + group.length + ' records. Choose one.</p>'
    + '<ul class="drawer__cluster">' + group.map((r) => '<li>'
      + '<button type="button" class="drawer__pick" data-id="' + escapeHtml(r.id) + '">'
      + '<span class="drawer__key">' + escapeHtml(Lib.fmtDay(r.date)) + '</span>'
      + escapeHtml(r.species || 'Species not stated') + '</button></li>').join('')
    + '</ul>';
  showDrawer(null);
}

function openDrawer(r, returnTo) {
  if (!r) return;
  state.openRecordId = r.id;
  $('#drawerTitle').textContent = r.species || 'Record';
  $('#drawerBody').innerHTML = drawerBodyHtml(r);
  showDrawer(returnTo);
  mountSpeciesFigure(r);
}

/* The half both entry points share: reveal it, remember what to give focus back
 * to, move focus in, and on a phone hand the sheet over to its expanded state. */
function showDrawer(returnTo) {
  const drawer = $('#drawer');
  state.returnFocusTo = returnTo || document.activeElement || null;
  drawer.hidden = false;
  setSheetState('expanded');
  const close = $('#drawerClose');
  if (close) close.focus({ preventScroll: true });
  announce($('#drawerTitle').textContent + ' opened.');
}

function closeDrawer() {
  const drawer = $('#drawer');
  if (!drawer || drawer.hidden) return;
  disposeSpeciesFigure();
  drawer.hidden = true;
  state.openRecordId = null;
  if ($('#sheet').dataset.state === 'expanded') setSheetState('half');
  const back = state.returnFocusTo;
  state.returnFocusTo = null;
  /* Focus goes back to whatever opened the drawer: the row button in the record
   * list, or the map itself when it was a marker, because a Leaflet marker is
   * recreated on every render and the old element no longer exists. */
  if (back && document.contains(back) && typeof back.focus === 'function') {
    back.focus({ preventScroll: true });
  } else {
    const m = $('#map');
    if (m) m.focus({ preventScroll: true });
  }
}
```

- [ ] **Step 3: Close the drawer when the layer changes**

A record from the official layer has no meaning on the world layer. In `onLayerChanged` (the empty hook Task 7 added), add the one line that is this task's:

```js
function onLayerChanged() {
  /* An open record belongs to the layer it came from. */
  closeDrawer();
}
```

- [ ] **Step 4: Wire the drawer's own events**

Add to `wire`:

```js
  $('#drawerClose').addEventListener('click', closeDrawer);

  /* Escape closes the drawer from anywhere inside it. The drawer is not modal,
   * so this is the keyboard contract that replaces a focus trap. */
  $('#drawer').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDrawer();
    }
  });

  /* Escape also closes it from the map, which is where focus is after a marker
   * click that was made with the mouse. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#drawer').hidden) return;
    closeDrawer();
  });

  /* Cluster picks are delegated, because the list is rebuilt on every open. */
  $('#drawerBody').addEventListener('click', (e) => {
    const b = e.target.closest('.drawer__pick');
    if (!b) return;
    openDrawer(recordById(b.dataset.id), null);
  });
```

Add `tabindex="0"` handling for the map container so it can take focus back: in `initMap`, after the map is created, add

```js
  /* The map needs to be able to hold focus, because that is where the drawer
   * returns focus to when the thing that opened it was a marker, and a marker
   * is recreated on every render. Leaflet already handles arrow key panning. */
  const mapEl = $('#map');
  if (mapEl && !mapEl.hasAttribute('tabindex')) mapEl.setAttribute('tabindex', '0');
```

- [ ] **Step 5: Make the record list layer aware and give every row a way in**

Replace `columns` (lines 1070 to 1089) with:

```js
/* The column set is the layer's, because the three layers carry different
 * fields: the official dataset has a record id, an LGA and a placement
 * precision and no animal count, and the WOAH layer has the reverse. A column
 * that would repeat one value down every row is not shown; the view has already
 * said it. */
function columns() {
  if (state.layer === 'official') {
    return [
      { key: 'open', label: 'Record' },
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'species', label: 'Species', sort: 'species', wrap: true },
      { key: 'locality', label: 'Place', sort: 'locality' },
      { key: 'lga', label: 'Local government area', sort: 'lga', wrap: true },
      { key: 'admin1', label: 'Jurisdiction', sort: 'admin1' },
      { key: 'precision', label: 'Placed at', sort: 'precision' },
    ];
  }
  if (state.layer === 'woah') {
    return [
      { key: 'open', label: 'Record' },
      { key: 'date', label: 'Date', sort: 'date' },
      { key: 'category', label: 'Type', sort: 'category' },
      { key: 'species', label: 'Species', sort: 'species', wrap: true },
      { key: 'locality', label: 'Place', sort: 'locality' },
      { key: 'admin1', label: 'Jurisdiction', sort: 'admin1' },
      { key: 'subtype', label: 'Strain', sort: 'subtype' },
      { key: 'source', label: 'Source', wrap: true },
    ];
  }
  return [
    { key: 'open', label: 'Record' },
    { key: 'date', label: 'Date', sort: 'date' },
    { key: 'category', label: 'Type', sort: 'category' },
    { key: 'species', label: 'Species', sort: 'species', wrap: true },
    { key: 'country', label: 'Country', sort: 'country' },
    { key: 'locality', label: 'Place', sort: 'locality' },
    { key: 'subtype', label: 'Strain', sort: 'subtype' },
    { key: 'source', label: 'Source', wrap: true },
  ];
}
```

Replace `cellHtml` (lines 1132 to 1147) with:

```js
const PRECISION_WORD = {
  locality: 'Locality centroid',
  lga: 'LGA centroid',
  state: 'Jurisdiction centroid',
};

function cellHtml(r, key) {
  switch (key) {
    /* The keyboard and screen reader path onto the map: every row opens the
     * same drawer a marker click opens. */
    case 'open':
      return '<button type="button" class="drawer__pick row-open" data-open="'
        + escapeHtml(r.id) + '">Open</button>';
    case 'date': return '<time datetime="' + escapeHtml(r.date) + '">'
      + escapeHtml(Lib.fmtDay(r.date)) + '</time>'
      + (r.date_basis === 'first_seen' ? ' <span class="quiet">first published</span>' : '');
    case 'category': return catCell(r.category);
    case 'subtype': return strainTag(r, true);
    case 'country': return escapeHtml(r.country);
    case 'admin1': return r.admin1 ? escapeHtml(r.admin1) : '<span class="muted">not stated</span>';
    case 'lga': return r.lga ? escapeHtml(r.lga) : '<span class="muted">not stated</span>';
    case 'locality': return r.locality ? escapeHtml(r.locality) : '<span class="muted">not stated</span>';
    case 'species': return r.species ? escapeHtml(r.species) : '<span class="muted">not stated</span>';
    case 'precision': return r.precision
      ? escapeHtml(PRECISION_WORD[r.precision] || r.precision)
      : '<span class="muted">not stated</span>';
    case 'source': return Lib.linkHtml(r.source_url, r.source);
    default: return '';
  }
}
```

Add `precision` and `lga` to `sortValue`'s default branch by leaving it alone: both are plain string fields, which the existing `default:` case already handles.

- [ ] **Step 6: Rewrite `renderList` for the new column set**

Replace `renderList` (lines 1169 to 1239) with:

```js
function renderList(rows) {
  /* mixedLive: does the view hold both current and resolved records? The red
   * row edge means "this row is the live event", so it only carries
   * information when some row is not. */
  const mixedLive = rows.some(isLive) && rows.some((r) => !isLive(r));
  const cols = columns();
  renderThead(cols);

  const sorted = [...rows].sort((a, b) => {
    const x = sortValue(a, state.sortKey);
    const y = sortValue(b, state.sortKey);
    if (x < y) return -state.sortDir;
    if (x > y) return state.sortDir;
    /* Stable, readable tie-break: newest first, then id. */
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });

  const slice = sorted.slice(0, state.shown);
  $('#tbody').innerHTML = slice.length
    ? slice.map((r) => {
      const rowCls = mixedLive ? (isLive(r) ? 'is-live' : 'is-historical') : '';
      return '<tr' + (rowCls ? ' class="' + rowCls + '"' : '') + '>'
        + cols.map((c) => {
          const cls = [c.num ? 'num' : '', c.wrap ? 'td-wrap' : ''].filter(Boolean).join(' ');
          /* data-label carries the column name onto the cell so the stacked
           * small-screen layout can restore it. It is emitted here rather than
           * inferred in CSS because the column set is layer dependent, so a
           * cell's position cannot identify a column. */
          return '<td data-label="' + escapeHtml(c.label) + '"'
            + (cls ? ' class="' + cls + '"' : '') + '>' + cellHtml(r, c.key) + '</td>';
        }).join('') + '</tr>';
    }).join('')
    : '<tr><td class="table-empty" colspan="' + cols.length + '">' + emptyMessage() + '</td></tr>';

  const scope = state.search ? 'matching that search' : 'on the map now';
  const countText = slice.length
    ? 'Showing ' + slice.length + ' of ' + sorted.length + ' '
      + Lib.plural(sorted.length, 'record', 'records') + ' ' + scope
    : 'No records ' + scope;
  $('#listCount').textContent = countText;
  $('#showMore').hidden = state.shown >= sorted.length;

  announce(countText + '. Sorted by ' + sortSummary() + '. Filters: ' + filterSummary() + '.');
}

/* The active sort, in the same words the column header uses. */
function sortSummary() {
  const col = columns().find((c) => c.sort === state.sortKey);
  const label = col ? col.label : state.sortKey;
  return label + ', ' + (state.sortDir === 1 ? 'ascending' : 'descending');
}
```

Delete the old `sortSummary(mixedEra)` at lines 1242 to 1246; the version above replaces it.

Replace `filterSummary` (1283 to 1293) with:

```js
/* The filters in force, in the same words the controls use. */
function filterSummary() {
  const bits = [layerDef().label];
  bits.push(state.timeframe === 'era' ? 'since June 2026' : 'last ' + state.timeframe + ' days');
  if (state.species !== 'all') bits.push(state.species);
  if (state.showH7) bits.push('including resolved H7 and other records');
  if (state.scrubDate) bits.push('sampled on or before ' + Lib.fmtDay(state.scrubDate));
  const q = state.search.trim();
  if (q) bits.push('search ' + q);
  return bits.join(', ');
}
```

Replace `emptyMessage` (1297 to 1310) with:

```js
/* An empty list says which filter emptied it, so a reader is never left
 * guessing whether the data is missing or hidden. Each test relaxes exactly one
 * filter and counts what comes back, in the order a reader is most likely to
 * have narrowed things. */
function emptyMessage() {
  if (state.search) {
    const withoutSearch = inView().length;
    if (withoutSearch > 0) {
      return 'No records match that search. Clearing it would show ' + withoutSearch + ' '
        + Lib.plural(withoutSearch, 'record', 'records') + '.';
    }
    return 'No records match that search.';
  }
  if (state.scrubDate) {
    const n = searched(state.all.filter((r) => matches(r, { ignoreScrub: true }))).length;
    if (n > 0) {
      return 'Nothing was sampled on or before ' + escapeHtml(Lib.fmtDay(state.scrubDate))
        + '. Moving the date slider to the right would show ' + n + ' '
        + Lib.plural(n, 'record', 'records') + '.';
    }
  }
  if (state.species !== 'all') {
    const n = searched(state.all.filter((r) => matches(r, { ignoreSpecies: true }))).length;
    if (n > 0) {
      return 'No ' + escapeHtml(state.species) + ' records match these filters. Choosing all '
        + 'species would show ' + n + ' ' + Lib.plural(n, 'record', 'records') + '.';
    }
  }
  if (state.timeframe !== 'era') {
    const n = searched(state.all.filter((r) => matches(r, { ignoreTime: true }))).length;
    if (n > 0) {
      return 'Nothing in the last ' + state.timeframe + ' days. The whole event holds ' + n + ' '
        + Lib.plural(n, 'record', 'records') + '.';
    }
  }
  if (!state.showH7) {
    const n = searched(state.all.filter((r) => matches(r, { ignoreEra: true }))).length;
    if (n > 0) {
      return 'Nothing in the current event matches these filters. There '
        + Lib.plural(n, 'is ' + n + ' resolved or other record', 'are ' + n
          + ' resolved or other records')
        + ' that would match. Tick the H7 box above to show '
        + Lib.plural(n, 'it', 'them') + '.';
    }
  }
  return 'No records match these filters.';
}
```

- [ ] **Step 7: Wire the row buttons**

Add to `wire`:

```js
  /* Delegated, because the tbody is rebuilt on every filter change. The button
   * is passed as the focus target, so Escape returns the reader to the row they
   * opened rather than to the top of the page. */
  $('#tbody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    openDrawer(recordById(b.dataset.open), b);
  });
```

- [ ] **Step 8: Style the row button**

Add to `site/styles.css`, at the end of section 22:

```css
/* The record list's way into the drawer. A real button in a real cell, so the
   table keeps its semantics and the keyboard keeps its path onto the map. */
.row-open {
  padding: 2px 8px;
  border: 1px solid var(--ink-3);
  border-bottom-width: 2px;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-2);
  width: auto;
}
.row-open:hover { color: var(--ink); border-color: var(--ink); background: var(--paper); }
```

- [ ] **Step 9: Verify the drawer, the cluster and the keyboard path**

Run `node --check site/app.js`, then with the fixture server running:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && cat > /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/drawer.mjs <<'DRAWERJS'
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:8090/index.html');
await p.waitForTimeout(2500);

// From a marker.
await p.click('#map .leaflet-marker-icon');
await p.waitForTimeout(500);
if (await p.isHidden('#drawer')) throw new Error('a marker click did not open the drawer');
const title = await p.textContent('#drawerTitle');
console.log('drawer title from a marker:', JSON.stringify(title));
const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
if (focused !== 'drawerClose') throw new Error('focus did not move into the drawer, it is on ' + focused);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
if (await p.isVisible('#drawer')) throw new Error('Escape did not close the drawer');

// From the record list.
await p.click('#listToggle');
await p.waitForTimeout(800);
if (await p.isHidden('#listPanel')) throw new Error('the list toggle did not open the list');
const rows = await p.$$eval('#tbody tr', (els) => els.length);
console.log('rows in the list:', rows);
await p.click('#tbody [data-open]');
await p.waitForTimeout(500);
if (await p.isHidden('#drawer')) throw new Error('a row button did not open the drawer');
const body = await p.textContent('#drawerBody');
for (const want of ['Placed at', 'Source']) {
  if (!body.includes(want)) throw new Error('the drawer body is missing: ' + want);
}
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
const back = await p.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.open);
if (!back) throw new Error('focus did not return to the row button');
console.log('focus returned to the row that opened it');

if (errors.length) { console.error('PAGE ERRORS:', errors.join('\n')); process.exit(1); }
console.log('drawer ok');
await b.close();
DRAWERJS
node /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/drawer.mjs
```

Expected: `drawer ok`. If the marker click hits a cluster, the title will read "N records at this place" and the focus assertions still hold; the body check may then fail, in which case click a cluster row first and re-run, and confirm the cluster list renders one button per record.

- [ ] **Step 10: Commit**

```bash
git add site/app.js site/styles.css
git commit -m "feat(site): add the record drawer, cluster list and precision marks"
```

---

### Task 10: The two birds integration points

Exactly two call sites, both guarded so the page is complete without them. `site/birds.js` is stream D's file and does not exist yet, which is the normal state this task must work in: a failed dynamic import is caught and nothing else happens.

Every device, motion and memory gate lives inside `birds.js`. `app.js` makes one decision only, the once-per-session rule, because that is a property of this page rather than of the module.

**Files:**
- Modify: `site/app.js`: add `maybeFlyBird`, `mountSpeciesFigure`, `disposeSpeciesFigure`; call `maybeFlyBird` from `boot`

**Interfaces:**
- Consumes from stream D: `site/birds.js`, an ES module exporting `flight(hostElement) -> Promise`, `figure(canvasElement, speciesSlug) -> {dispose()}` and `speciesSlug(commonName) -> string`.
- Consumes: `openDrawer` and `closeDrawer` (Task 9), which already call `mountSpeciesFigure(r)` and `disposeSpeciesFigure()`, and `#drawerFigure`, which `drawerBodyHtml` already emits hidden.
- Produces: nothing for another stream. This is the last integration point.

- [ ] **Step 1: Add the two call sites**

Add this block to `site/app.js`, above the boot section:

```js
/* ---------------------------------------------------------------- birds
 * Two appearances, both quiet, both optional. site/birds.js owns every gate:
 * WebGL 2, reduced motion, save-data and device memory, and the image
 * fallbacks. This file decides one thing only, which is that the flight runs
 * once per session, because that is a property of this page.
 *
 * Both call sites are guarded and both are fire and forget. The module is
 * fetched with a dynamic import after the map's first render, so nothing here
 * is on the critical path and a missing or broken birds.js costs the reader
 * nothing at all. There is no await on either path.
 */

/* Integration point one: one tern across the map, once per session, after the
 * map is interactive. */
function maybeFlyBird() {
  let seen = null;
  try {
    seen = sessionStorage.getItem('birds-flight');
  } catch (e) {
    /* Private browsing, or blocked site data. Treat it as seen: a flight the
     * reader cannot opt out of by navigating is worse than no flight. */
    return;
  }
  if (seen) return;
  const host = $('#map');
  if (!host) return;
  const start = () => {
    import('./birds.js').then((birds) => {
      if (!birds || typeof birds.flight !== 'function') return;
      try {
        sessionStorage.setItem('birds-flight', '1');
      } catch (e) { /* nothing to do: the flight simply repeats next load */ }
      return birds.flight(host);
    }).catch((err) => {
      /* Not an error the reader needs. The birds are decoration and the page is
       * complete without them. */
      console.debug('birds: flight unavailable', err);
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1200);
}

/* Integration point two: the species of the open record, turning slowly on the
 * drawer's canvas. One renderer instance, disposed when the drawer closes. */
let speciesFigure = null;

function mountSpeciesFigure(r) {
  disposeSpeciesFigure();
  const canvas = $('#drawerFigure');
  if (!canvas || !r || !r.species) return;
  const wanted = r.id;
  import('./birds.js').then((birds) => {
    if (!birds || typeof birds.figure !== 'function' || typeof birds.speciesSlug !== 'function') return;
    /* The reader may have moved on while the module was loading. */
    if (state.openRecordId !== wanted) return;
    const live = $('#drawerFigure');
    if (!live) return;
    const handle = birds.figure(live, birds.speciesSlug(r.species));
    if (!handle) return;
    speciesFigure = handle;
    live.hidden = false;
  }).catch((err) => {
    console.debug('birds: figure unavailable', err);
  });
}

function disposeSpeciesFigure() {
  if (!speciesFigure) return;
  try {
    if (typeof speciesFigure.dispose === 'function') speciesFigure.dispose();
  } catch (e) {
    console.debug('birds: dispose failed', e);
  }
  speciesFigure = null;
}
```

- [ ] **Step 2: Call the flight from `boot`**

In `boot`, directly after `state.announce = true;`, add:

```js
    maybeFlyBird();
```

It goes last on purpose: after the data has loaded, after the first render, and after the page has declared itself ready.

- [ ] **Step 3: Verify the page is complete with no birds.js**

`site/birds.js` does not exist yet, so this is the failure path and it must be silent to the reader.

Run `node --check site/app.js`, then with the fixture server running:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !/birds\.js/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8090/index.html');
  await p.waitForTimeout(5000);
  const markers = await p.evaluate(() => document.querySelectorAll('#map .leaflet-marker-icon, #map path.leaflet-interactive').length);
  console.log('markers drawn with no birds module:', markers);
  if (!markers) throw new Error('the map is empty');
  await p.click('#map .leaflet-marker-icon');
  await p.waitForTimeout(1200);
  const canvasHidden = await p.evaluate(() => {
    const c = document.getElementById('drawerFigure');
    return c ? c.hidden : 'no canvas';
  });
  console.log('drawer canvas hidden without the module:', canvasHidden);
  if (canvasHidden !== true) throw new Error('the canvas must stay hidden when the module is absent');
  if (errors.length) { console.error('UNEXPECTED ERRORS:', errors.join('\n')); process.exit(1); }
  console.log('birds integration degrades cleanly');
  await b.close();
});
"
```

Expected: `birds integration degrades cleanly`. A failed module fetch logs at `debug` level, which the filter above allows; anything at `error` level that is not the module fetch fails the check.

- [ ] **Step 4: Verify the session rule**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8090/index.html');
  await p.waitForTimeout(4000);
  // The flag is only set once the module resolves, which it cannot yet, so it
  // must still be unset. That is the correct behaviour: a flight that never ran
  // must not be recorded as having run.
  const flag = await p.evaluate(() => { try { return sessionStorage.getItem('birds-flight'); } catch (e) { return 'blocked'; } });
  console.log('birds-flight after a load with no module:', flag);
  if (flag !== null) throw new Error('the session flag must not be set when the flight did not run');
  console.log('session rule ok');
  await b.close();
});
"
```

Expected: `session rule ok`. When stream D lands, re-run this: the flag must then read `1` after the first load and the flight must not repeat on a reload in the same context.

- [ ] **Step 5: Commit**

```bash
git add site/app.js
git commit -m "feat(site): add the two guarded birds integration points"
```

---

### Task 11: `/history` gets the shared header and `lib.js`

The spec is explicit that this page keeps its content: it gets the shared header and the copy pass, nothing more. The copy pass is Task 13. This task is the header, the nav, the analytics tag, and the deletion of the three helpers that now live in `lib.js`.

**Files:**
- Modify: `site/history.html`: head links, the header nav, the two links to the retired `index.html#sources`, the script tags
- Modify: `site/history.js:105-148` (delete `$`, `esc`, `safeUrl`, `formatDay`, `formatStamp`, `plural`), `site/history.js:158-184` (delete `citationLine` and `citationsHtml`)

**Interfaces:**
- Consumes: `globalThis.Lib` (Task 1), `/about#sources` (Task 5).
- Produces: nothing. This is a leaf.

- [ ] **Step 1: Point the head at the canonical host and the new asset paths**

In `site/history.html`, in the head:
- change `<link rel="canonical" href="https://birdflutracker.org/history.html" />` to `<link rel="canonical" href="https://www.birdflutracker.org/history" />`
- change `<meta property="og:url" content="https://birdflutracker.org/history.html" />` to `<meta property="og:url" content="https://www.birdflutracker.org/history" />`
- change `<meta property="og:image" content="https://birdflutracker.org/assets/img/og-card.png" />` to the `www` host
- change `href="assets/fonts/source-code-pro.css"` to `href="/assets/fonts/source-code-pro.css"` and `href="styles.css"` to `href="/styles.css"`
- add `<meta name="theme-color" content="#FFFFFF" />` directly after the `color-scheme` meta, so the three pages match

- [ ] **Step 2: Give it the shared nav**

Replace the `<nav class="site-nav">` block (lines 38 to 42) with:

```html
      <nav class="site-nav" aria-label="Site navigation">
        <a href="/">Tracker</a>
        <a href="/about">About</a>
        <a href="/history" aria-current="page">History</a>
      </nav>
```

and change the site title's link on line 35 from `href="index.html"` to `href="/"`.

- [ ] **Step 3: Repoint every link to a retired target**

`index.html#sources` no longer exists: the sources list is now `/about#sources`. Find every one of them and repoint it:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && grep -n 'index\.html' site/history.html site/history.js
```

Change each hit:
- `index.html#sources` becomes `/about#sources`
- a bare `index.html` becomes `/`

There are hits in the markup near lines 296, 430 and in the notes list near line 249, and in `history.js` inside `renderSubtypeEntries` and `fail`. Re-run the grep after the edits and expect no output.

- [ ] **Step 4: Load `lib.js` before `history.js`**

Replace the script block at the foot of `site/history.html`:

```html
  <script src="/lib.js"></script>
  <script src="/history.js"></script>
  <script defer src="/_vercel/insights/script.js"></script>
```

- [ ] **Step 5: Delete the six helpers and the citation renderer from `history.js`**

In `site/history.js`, delete these and replace them with aliases onto `Lib`. Replace the whole `/* ---- helpers */` block (lines 103 to 148, from the comment banner through `function plural`) with:

```js
  /* ---------------------------------------------------------------- helpers
   * $, esc, safeUrl, plural, the date formatters and the citation renderer all
   * moved to site/lib.js, which is loaded before this file. They were private
   * here and duplicated in app.js, and the two date formatters disagreed. */

  var $ = Lib.$;
  var esc = Lib.esc;
  var plural = Lib.plural;
  var isIsoDay = Lib.isIsoDay;
  var citationsHtml = Lib.citationsHtml;

  /* history.json dates are plain ISO days and full stamps. One formatter each,
   * from lib.js, so a date reads the same here as it does on the tracker. Note
   * that this changes the printed form on this page from "30 July 2026" to
   * "30 Jul 2026" and from a UTC stamp to the eastern Australian wall clock,
   * which is the point: one form across the site. */
  function formatDay(iso) { return Lib.fmtDay(iso); }
  function formatStamp(iso) { return Lib.fmtStampAu(iso); }

  function isObj(x) { return x && typeof x === 'object'; }

  function slug(s) {
    return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function byId(list, key) {
    var out = {};
    (Array.isArray(list) ? list : []).forEach(function (x) {
      if (isObj(x) && x[key || 'id']) out[x[key || 'id']] = x;
    });
    return out;
  }
```

Then delete the `/* ---- citations ---- */` block (lines 158 to 184, `citationLine` and `citationsHtml`) entirely: the alias above supplies it.

The `MONTHS` array at lines 31 to 32 is now unused. Delete it.

- [ ] **Step 6: Verify nothing broke**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/history.js && \
grep -n "MONTHS\|citationLine\|function safeUrl\|function esc\|function formatDay(iso) {$" site/history.js
```
Expected: the only hits are the two one-line `formatDay` and `formatStamp` wrappers. No `MONTHS`, no `citationLine`, no private `esc` or `safeUrl`.

Then load it:
```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
npx playwright screenshot --viewport-size=1280,1400 --full-page --wait-for-timeout=2500 \
  http://localhost:8080/history.html $S/history-1280.png
```
Expected: the timeline renders in full, every era group is present, the citations render as they did before, the nav has three items with History current, and the dates now read in the site's one form. Check the console is clean.

- [ ] **Step 7: Commit**

```bash
git add site/history.html site/history.js
git commit -m "refactor(site): history page takes the shared header and lib.js"
```

---

### Task 12: `sitemap.xml` and the Open Graph card

Two small deliverables from spec 4.3 and 5.4. The card is rendered from a real page rather than drawn by hand, so it regenerates when the data changes.

`site/og.html` draws Australia from the committed `world-countries.geojson` with the official events as carmine squares, plus the ink tern. No map tiles: a tile request makes the render non-deterministic and the current card already has no tiles.

**Files:**
- Create: `site/sitemap.xml`
- Create: `site/og.html`
- Modify: `site/assets/img/og-card.png` (overwrite)
- Modify: `site/assets/img/CREDITS.md` (add the card's entry)

**Interfaces:**
- Consumes from stream C: `site/assets/birds/greater-crested-tern.png`, the ink tern still. **This task is blocked on that file for the tern half only.** If it is not there yet, do Steps 1 to 4, skip Step 5's tern, and leave the existing `og-card.png` in place: the current card is a correct, if plainer, version of the same design. Re-run Step 5 when the still lands.
- Consumes: `site/data/summary.json` and `site/data/detections/au.json` at render time only.
- Produces: `/sitemap.xml`, which stream E submits to Search Console.

- [ ] **Step 1: Write the sitemap**

Create `site/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Three pages, the www host, and no lastmod: the data behind these pages
     changes nightly and the markup does not, so a lastmod taken from either one
     would be a claim about the wrong thing. /og is excluded on purpose: it is a
     render target for the social card, not a page. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.birdflutracker.org/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.birdflutracker.org/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.birdflutracker.org/history</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```

- [ ] **Step 2: Write the card's render page**

Three files, because the CSP forbids an inline script and an inline style: the page, its stylesheet and its drawing code. All three are build-time only, and `og.html` is the only page that loads the other two.

Create `site/og.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <!-- A render target for the social card, not a page. Excluded from the
       sitemap and marked noindex, because cleanUrls serves it at /og. -->
  <meta name="robots" content="noindex, nofollow" />
  <title>Open Graph card</title>
  <link rel="stylesheet" href="/assets/fonts/source-code-pro.css" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/og.css" />
</head>
<body class="og-page">
  <div class="og-card" id="ogCard">
    <div class="og-card__map">
      <svg id="ogMap" viewBox="0 0 600 520" aria-hidden="true" focusable="false"></svg>
      <img class="og-card__bird" id="ogBird" src="/assets/birds/greater-crested-tern.png"
           width="260" height="180" alt="" />
    </div>
    <div class="og-card__text">
      <p class="og-card__eyebrow">birdflutracker.org</p>
      <h1 class="og-card__title">Australian Bird Flu Tracker</h1>
      <p class="og-card__figure"><span id="ogNum">&nbsp;</span> <span id="ogLabel">&nbsp;</span></p>
      <p class="og-card__sub" id="ogSub">&nbsp;</p>
    </div>
  </div>
  <script src="/lib.js"></script>
  <script src="/og.js"></script>
</body>
</html>
```

Create `site/og.css`:

```css
/* The Open Graph card, rendered at 1200 by 630 and screenshotted. Its own file
   so none of it can leak into the site: og.html is the only page that loads it.
   Same ink, same carmine, same typeface as everything else. */
.og-page { margin: 0; background: var(--paper); }
.og-card {
  width: 1200px;
  height: 630px;
  display: grid;
  grid-template-columns: 600px 1fr;
  align-items: center;
  background: var(--paper);
  border: 1px solid var(--ink);
  box-sizing: border-box;
  overflow: hidden;
}
.og-card__map { position: relative; width: 600px; height: 520px; }
#ogMap { width: 600px; height: 520px; display: block; }
#ogMap path.coast { fill: none; stroke: var(--ink-3); stroke-width: 1; stroke-linejoin: round; }
#ogMap rect.event { fill: var(--live); stroke: none; }
.og-card__bird {
  position: absolute;
  top: 8px;
  right: 0;
  width: 260px;
  height: auto;
  /* The still is ink on transparent, so nothing is needed but placement. */
}
.og-card__text { padding: 0 56px 0 8px; display: grid; gap: 10px; align-content: center; }
.og-card__eyebrow {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-2);
  margin: 0;
}
.og-card__title { font-size: 44px; line-height: 1.08; letter-spacing: -0.02em; margin: 0; max-width: 14ch; }
.og-card__figure {
  margin: 8px 0 0;
  font-size: 19px;
  color: var(--ink);
  max-width: none;
}
.og-card__figure #ogNum {
  font-size: 62px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--live);
  display: block;
}
.og-card__sub { margin: 0; font-size: 16px; color: var(--ink-2); max-width: 30ch; }
```

Create `site/og.js`:

```js
/* Draws the Open Graph card. Build time only: og.html is a render target, not a
 * page, and nothing else loads this file.
 *
 * The map is the committed world-countries.geojson projected straight onto the
 * SVG viewBox, not a tile map. A tile request would make the render depend on a
 * third party being up and on a cache, which is the wrong property for an
 * artifact that gets regenerated whenever the figures move.
 */
'use strict';

(function () {
  /* The Australian mainland plus Tasmania, with a little air around it. */
  const BOX = { west: 112, east: 154.5, south: -44.2, north: -9.5 };
  const W = 600;
  const H = 520;

  /* Equirectangular, which is honest at this scale and for this purpose: the
   * card locates events, it is not a map anyone measures off. */
  function project(lng, lat) {
    const x = ((lng - BOX.west) / (BOX.east - BOX.west)) * W;
    const y = ((BOX.north - lat) / (BOX.north - BOX.south)) * H;
    return [x, y];
  }

  function ringPath(ring) {
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      /* Skip anything outside the box: the geojson carries every country. */
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d + 'Z';
  }

  function drawCoast(feature) {
    const geom = feature.geometry;
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    /* Only rings with a point inside the box, so the Cocos and Christmas Island
     * outliers do not stretch the drawing. */
    return polys.map((poly) => poly.map((ring) => {
      const inside = ring.some(([lng, lat]) =>
        lng >= BOX.west && lng <= BOX.east && lat >= BOX.south && lat <= BOX.north);
      return inside ? '<path class="coast" d="' + ringPath(ring) + '"/>' : '';
    }).join('')).join('');
  }

  Promise.all([
    fetch('/assets/world-countries.geojson').then((r) => r.json()),
    fetch('/data/summary.json').then((r) => r.json()),
    fetch('/data/detections/au.json').then((r) => r.json()),
  ]).then(([world, summary, au]) => {
    const feature = world.features.find((f) => f.properties && f.properties.name === 'Australia');
    const svg = document.getElementById('ogMap');
    const events = au.filter((r) => r.era_current && r.lat != null && r.lng != null
      && (r.layer === 'official' || !r.layer));
    const marks = events.map((r) => {
      const [x, y] = project(Number(r.lng), Number(r.lat));
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) return '';
      return '<rect class="event" x="' + (x - 3).toFixed(1) + '" y="' + (y - 3).toFixed(1)
        + '" width="6" height="6"/>';
    }).join('');
    svg.innerHTML = (feature ? drawCoast(feature) : '') + marks;

    const off = summary.official_au || {};
    const layers = (summary.au_layers && summary.au_layers.official) || {};
    const n = off.national_total != null ? off.national_total : layers.records;
    const j = layers.jurisdictions;
    document.getElementById('ogNum').textContent = n == null ? String(events.length) : String(n);
    document.getElementById('ogLabel').textContent = 'confirmed H5 bird flu events';
    const bits = [];
    if (j != null) bits.push('across ' + j + ' ' + Lib.plural(j, 'jurisdiction', 'jurisdictions'));
    if (off.as_at_text) bits.push('official dataset, as at ' + off.as_at_text);
    document.getElementById('ogSub').textContent = bits.join(', ') + '.';

    /* The tern is stream C's still. Where it is not there yet, the card renders
     * without it rather than with a broken image. */
    const bird = document.getElementById('ogBird');
    bird.addEventListener('error', () => { bird.remove(); });

    document.body.dataset.ready = 'true';
  }).catch((err) => {
    console.error('og card', err);
    document.body.dataset.ready = 'failed';
  });
}());
```

- [ ] **Step 3: Check the three new files parse**

Run:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node --check site/og.js && \
node -e "
const x = require('fs').readFileSync('site/sitemap.xml','utf8');
if (!/^<\?xml/.test(x)) throw new Error('no xml declaration');
const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
console.log(locs.join('\n'));
if (locs.length !== 3) throw new Error('expected three urls');
if (locs.some(u => !u.startsWith('https://www.birdflutracker.org/'))) throw new Error('wrong host');
if (locs.some(u => u.endsWith('.html'))) throw new Error('a sitemap must not list a redirecting url');
console.log('sitemap ok');
"
```
Expected: three `www` URLs and `sitemap ok`.

- [ ] **Step 4: Render the card and check its dimensions**

With `node pipeline/serve.mjs` running:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && \
npx playwright screenshot --viewport-size=1200,630 --wait-for-selector='body[data-ready="true"]' \
  --wait-for-timeout=4000 http://localhost:8080/og.html site/assets/img/og-card.png && \
node -e "
const b = require('fs').readFileSync('site/assets/img/og-card.png');
console.log('bytes', b.length, 'size', b.readUInt32BE(16) + 'x' + b.readUInt32BE(20));
if (b.readUInt32BE(16) !== 1200 || b.readUInt32BE(20) !== 630) throw new Error('wrong dimensions');
if (b.length > 400000) throw new Error('card is too heavy for a social preview');
console.log('card ok');
"
```
Expected: `1200x630` and `card ok`. Then open `site/assets/img/og-card.png` and look at it: Australia must be recognisable, the carmine squares must sit on the coast rather than in the sea, the figure must be readable at thumbnail size, and the text must not be clipped.

- [ ] **Step 5: Add the tern, when stream C has shipped it**

Check first:
```bash
ls -la /Users/Alex/dev/h5-bird-flu-tracker/site/assets/birds/greater-crested-tern.png
```
If it is absent, skip this step and leave the card as Step 4 rendered it. If it is there, re-run Step 4's command and confirm the tern sits top right of the map panel in ink, not overlapping the title, and that the file is still under 400 KB.

- [ ] **Step 6: Update the image credits**

Add to `site/assets/img/CREDITS.md`, at the end:

```markdown
## og-card.png

1200 x 630, the Open Graph card. Rendered from `site/og.html` with the Playwright CLI:

```
npx playwright screenshot --viewport-size=1200,630 \
  --wait-for-selector='body[data-ready="true"]' --wait-for-timeout=4000 \
  http://localhost:8080/og.html site/assets/img/og-card.png
```

Everything in it is original work from this repository: the Australian coastline is drawn from the
committed `site/assets/world-countries.geojson` (Natural Earth, public domain), the event marks are
the current H5 records from `site/data/detections/au.json`, and the tern is the ink still from
`site/assets/birds/`, built in Blender for this site and MIT licensed with the rest of the
repository. No third party image is used and no map tiles are requested, so the render is
deterministic and can be repeated offline.

Regenerate it whenever the headline figures move enough to matter, which in practice is monthly
rather than nightly: a social preview is cached by every platform that fetches it.
```

- [ ] **Step 7: Commit**

```bash
git add site/sitemap.xml site/og.html site/og.css site/og.js site/assets/img/og-card.png site/assets/img/CREDITS.md
git commit -m "feat(site): add sitemap.xml and render the OG card from the data"
```

---

### Task 13: The copy pass across all three pages

Spec 8 puts this last on purpose: "then the copy pass on all three pages together, so the voice is one voice." By this point the words exist in six files and were written a task at a time. This task reads them as one document.

It is a checklist, not a rewrite. Where a sentence already passes, leave it alone.

**Files:**
- Modify, as the checks require: `site/index.html`, `site/about.html`, `site/history.html`, `site/app.js`, `site/about.js`, `site/lib.js`

**Interfaces:**
- Consumes: everything Tasks 1 to 12 wrote.
- Produces: nothing new. The exact sentences below are the contract, and Task 14 re-checks them.

- [ ] **Step 1: The sentences that are fixed**

These are the load-bearing strings. Grep for each and confirm it reads exactly this, in this file. Where it does not, fix the file, not the list.

**The panel headline template** (`site/lib.js`, `panelHeadline`). Official layer:
> H5 bird flu has been confirmed in {n} wild {animal/animals} across {j} {jurisdiction/jurisdictions} since {Month Year}.

WOAH layer:
> WOAH has been notified of {n} H5 {event/events} in Australia since {Month Year}.

World layer:
> The world layer shows H5 events notified to WOAH in the last 90 days, outside Australia.

When the build published no count, either Australian layer:
> The Australian counts were not published in this build, so none is stated here.

**The three freshness states** (`site/lib.js`, `freshnessLine`):
> Data checked today at {HH:MM AEST}.
> Data last updated {n} {day/days} ago.
> Official figure from {D Mon YYYY}; the department has not published since.

and the fourth, for a build that recorded no run time:
> This build did not record when it ran, so nothing here should be read as current.

**The placement sentences** (`site/lib.js`, `placementSentence`):
> Placed at the locality centroid; the department publishes place names, not coordinates.
> Placed at the centre of the local government area; the locality could not be matched to a place name.
> Placed at the centre of the jurisdiction; neither the locality nor the local government area could be matched.

**The hotline**, static markup, on all three pages, in bold:
> Sick or dead wild birds: call the Emergency Animal Disease Hotline on 1800 675 888.

followed by:
> Do not touch or move sick or dead birds.

On `/about#report` the hotline is the `.callout` and carries the longer form already written there. On `/history` it is the existing `.callout` near the foot of the page; bring its wording into line with the two above, keeping its "and keep pets away from them".

**Not medical advice**, static markup, on all three pages, the two words in bold at the start of their sentence.

Run the sweep:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && for s in "1800" "Not medical advice" "Do not touch or move sick or dead birds"; do
  echo "--- $s"; grep -rl "$s" site/*.html || echo "  MISSING FROM EVERY PAGE";
done
```
Expected: `1800` and `Not medical advice` each in all three HTML files. `Do not touch or move sick or dead birds` in `index.html` and `about.html`; `history.html` uses "Do not handle sick or dead wild birds, and keep pets away from them", which is the same instruction and may stay, or be brought into line. Decide once and apply it to both.

- [ ] **Step 2: No dashes anywhere**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const fs = require('fs');
const files = ['site/index.html','site/about.html','site/history.html','site/app.js','site/about.js','site/history.js','site/lib.js','site/icons.js','site/styles.css','site/og.html','site/og.js','site/og.css','site/sitemap.xml'];
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  s.split('\n').forEach((line, i) => {
    if (/[\u2014]/.test(line)) { console.error(f + ':' + (i+1) + ' EM DASH: ' + line.trim().slice(0,100)); bad++; }
    if (/[\u2013]/.test(line) && !/outletShort|u2013/.test(line)) { console.error(f + ':' + (i+1) + ' EN DASH: ' + line.trim().slice(0,100)); bad++; }
  });
}
if (bad) process.exit(1);
console.log('no dashes in any of ' + files.length + ' files');
"
```
Expected: `no dashes in any of 13 files`.

- [ ] **Step 3: Under 120 words visible on the map page before any interaction**

Figures and control labels do not count. Everything else does.

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:8090/index.html');
  await p.waitForTimeout(3000);
  const text = await p.evaluate(() => {
    const skip = new Set(['SCRIPT','STYLE']);
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      if (skip.has(n.tagName)) return;
      if (n.hidden || n.closest('[hidden]')) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (n.classList.contains('visually-hidden')) return;
      if (n.classList.contains('skip-link')) return;
      if (n.classList.contains('figure__num') || n.classList.contains('figure__label')) return;
      if (n.classList.contains('control-label')) return;
      if (n.closest('#listPanel') || n.closest('#drawer')) return;
      if (n.closest('.leaflet-control')) return;
      for (const c of n.childNodes) walk(c);
    };
    walk(document.body);
    return out.join(' ');
  });
  const words = text.split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w));
  console.log('visible words:', words.length);
  console.log(words.join(' '));
  if (words.length > 120) { console.error('OVER BUDGET by ' + (words.length - 120)); process.exit(1); }
  console.log('within the 120 word budget');
  await b.close();
});
"
```
Expected: `within the 120 word budget`. Over budget, cut in this order: the map meta line first, then the panel notes, then the footer strip's link labels. Never cut the hotline, the not-medical-advice line or the freshness line.

- [ ] **Step 4: Every number carries its basis and its date**

Read the panel, the drawer and `/about`'s bases table with this question against each figure: could a reader quote this number without knowing what it counts or when it was true? Every one must answer no.

The known shape, for reference:
- Panel figure 1: number, "Confirmed events", "Official dataset, as at {as_at_text}". Passes.
- Panel figure 2: number, "Jurisdictions affected", the list behind a button. Passes: a jurisdiction count needs no date beyond the run's own freshness line.
- Panel figure 3: a date, "Latest sampled", the locality. Passes.
- The drawer's date row: labelled "Date sampled" or "First published in the dataset", never a bare date. Passes.
- `/about`'s bases table: four rows, each with the basis as its own column. Passes.

Fix anything that does not, by adding the basis to the label rather than to a footnote.

- [ ] **Step 5: Plain species names in text, scientific names only in the drawer**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && grep -rn "species_scientific" site/*.js
```
Expected: hits in `app.js` only, inside `drawerBodyHtml` and `searched`. A hit in `about.js` or in the record list means a binomial is appearing outside the drawer; move it.

- [ ] **Step 6: One date form**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && grep -rn "toLocaleDateString\|toLocaleString\|niceDate\|niceStamp" site/*.js
```
Expected: hits only in `app.js` for `niceDate` and `niceStamp`, which the keep list retained. Decide per hit: any that renders a date a reader sees must go through `Lib.fmtDay` or `Lib.fmtStampAu`. If none is left, delete `niceDate` and `niceStamp` from `app.js` entirely and re-run `node --check`.

- [ ] **Step 7: No hedging paragraph on the map page**

Read `index.html` and the strings in `renderPanel`, `renderMapMeta` and `renderPanelNotes` end to end. A caveat on the map page is one line with a link to its `/about` anchor, and never a paragraph. There should be no sentence beginning "It is important to note", "Please be aware", "Bear in mind" or "However, it should be".

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && grep -rni "it is important to note\|please be aware\|bear in mind\|it should be noted\|please note" site/*.html site/*.js || echo "no hedging"
```
Expected: `no hedging`.

- [ ] **Step 8: Commit**

```bash
git add site/index.html site/about.html site/history.html site/app.js site/about.js site/history.js site/lib.js
git commit -m "chore(site): copy pass across the three pages"
```

---

### Task 14: Verification

`/sitecheck` is the gate. It is a deterministic multi-viewport harness that captures every route at 320, 390, 768, 1280 and 1440 and machine-checks rendered-pixel contrast, graphic visibility, horizontal overflow with culprits, broken links and redirect chains, missing anchors, SEO basics, tap targets, console and network errors, and axe-core, with a visual diff against the previous run and a contact-sheet report. It replaces the screenshot matrix and every by-hand check it can make better than a person can.

What it cannot judge is whether a number is the right number and whether an interaction behaves. That is what the short Playwright list at the end is for, and it is short on purpose.

Two runs: the local preview server, and the Vercel preview deployment. Never the production domain: tight polling from this machine's IP trips Vercel's bot challenge and has caused false monitoring alarms before.

**Files:**
- Create: `/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/sitecheck.config.json` (scratchpad, not the repo: the repo root is outside this stream's allowlist)
- Modify: only what a finding sends back to its owning task.

**Interfaces:**
- Consumes: every file this stream touched; `body[data-ready]`, which Task 3's `boot` sets on both paths; the fixture preview server from Task 6 Step 8.
- Consumes from stream E: the Vercel preview URL, and the protection bypass secret if the preview is protected.
- Produces: the pass, or the finding list attributed per task, plus `report.html` for Alex.

- [ ] **Step 1: Every JS file parses, and the unit tests pass**

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && for f in site/*.js site/test/*.mjs; do
  node --check "$f" && echo "ok   $f" || echo "FAIL $f";
done && node --test site/test/
```
Expected: `ok` for every file, and all unit tests pass with 0 fail.

Then, once stream A has added the `test` script to `package.json`:
```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && npm test
```
Expected: the same tests run alongside stream A's pipeline tests. If `npm test` does not pick up `site/test/`, stream A's script is narrower than a bare `node --test`; report it, do not edit `package.json`.

- [ ] **Step 2: Start the preview server the harness will crawl**

`npm run serve` is the wrong target for a link check: `pipeline/serve.mjs` does not implement `cleanUrls`, so it answers `/about` and `/history` with 404 and the harness would report three blockers that are properties of the dev server rather than of the site. Use the fixture preview server from Task 6 Step 8, which resolves extensionless paths the way Vercel does and serves the new-shape `summary.json`, so the harness measures the content the site will actually show rather than a page of "not published".

```bash
S=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad
rm -rf $S/preview && cp -R /Users/Alex/dev/h5-bird-flu-tracker/site $S/preview
cp /Users/Alex/dev/h5-bird-flu-tracker/site/test/fixtures/summary.new.json $S/preview/data/summary.json
node -e "
const http=require('http'), fs=require('fs'), path=require('path'), root='$S/preview';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.xml':'application/xml','.geojson':'application/json'};
http.createServer((q,r)=>{
  let p=path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p=path.join(p,'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p = p + '.html';
  if (!fs.existsSync(p)) { r.writeHead(404,{'content-type':'text/html'}); return r.end('<h1>404</h1>'); }
  r.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});
  r.end(fs.readFileSync(p));
}).listen(8090, ()=>console.log('preview on http://localhost:8090'));
" &
sleep 1 && curl -s -o /dev/null -w "/ %{http_code}\n" http://localhost:8090/ && \
curl -s -o /dev/null -w "/about %{http_code}\n" http://localhost:8090/about && \
curl -s -o /dev/null -w "/history %{http_code}\n" http://localhost:8090/history && \
curl -s -o /dev/null -w "/sitemap.xml %{http_code}\n" http://localhost:8090/sitemap.xml
```
Expected: four 200s. A 404 on `/about` or `/history` means the extensionless fallback is not working and the whole link check would be noise.

- [ ] **Step 3: Write the harness config**

```bash
cat > /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/sitecheck.config.json <<'JSON'
{
  "skipRoutes": ["/og", "/test/*", "/data/*", "/assets/*"],
  "waitForSelector": "body[data-ready]",
  "thresholds": { "diffPercent": 0.5 }
}
JSON
```

Three decisions, each with its reason:
- `skipRoutes` excludes `/og`, which is a render target for the social card and not a page, and the data and asset trees, which are files rather than routes.
- `waitForSelector` is `body[data-ready]`, which Task 3's `boot` sets to `true` on success and `failed` on a load error. Without it the harness photographs the panel reading "Loading the data" and measures the contrast of the wrong text.
- No `ignore` rules. Do not pre-suppress a check before seeing what it says: two findings below are expected, and both deserve a decision rather than a silent exemption.

- [ ] **Step 4: Run the harness against the local preview**

```bash
cd /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad && \
sitecheck http://localhost:8090 --config ./sitecheck.config.json
```

The run lands in `~/Scratch/sitecheck/localhost-8090/<timestamp>/`. Exit code 1 means at least one blocker.

Read it the cheap way, in this order:
1. `summary.json`: `counts.bySeverity`, `counts.byCheck`, then `topIssues`, which is deduped across viewports and carries `route`, `viewports`, `selector`, `message`, `measured` against `threshold` and a `crop` path.
2. Open only the crops of the issues you are about to act on. Do not open `screenshots/`.
3. `issues.md` is the paste-ready list for the report in Step 9.

**Two findings are expected. Neither is a bug in this stream, and each needs a decision rather than an ignore rule:**

- **`contrast` on `.leaflet-control-attribution`.** Vendored Leaflet renders the OpenStreetMap credit at 10px in `--ink-2` on `rgba(255,255,255,0.88)` over greyed map tiles. The credit is a licence obligation so it cannot be removed, and the existing override at `site/styles.css:1257` already lightens its ground. If the harness measures it under 2:1, raise the plate to `rgba(255,255,255,0.95)` in that same rule. Do not ignore it: unreadable attribution is a licence problem as well as a contrast one.
- **`seo`, noindex on `/og`** if the skip does not catch it. That one is correct behaviour and is reported as info, not a failure.

Everything else in `topIssues` is a real finding. Attribute each to the task that owns it and fix it there:

| check | owner |
|---|---|
| contrast, graphic | Task 4 (styles) or Task 5 (`/about` markup) |
| overflow | Task 4 |
| links, http, missing anchors | Task 3, 5 or 11, whichever page holds the bad href |
| images, alt | Task 5 (the tern) or Task 12 (the card) |
| tap | Task 4, the tap-target block |
| seo, h1, title, description, canonical, og | Task 3, 5 or 11 |
| console, requests | Task 6, 7, 8, 9 or 10, whichever emits the error |
| axe | the task that wrote the markup |

- [ ] **Step 5: Fix, then re-run against the baseline**

```bash
cd /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad && \
sitecheck http://localhost:8090 --config ./sitecheck.config.json --baseline last --open
```

A fix is verified when the issue is gone from `topIssues` and `changedSinceBaseline` shows nothing new appeared. Repeat until `counts.bySeverity` has no blockers. `report.html` opens for the visual pass: rows are routes, columns are widths.

Also run the Safari engine once, because the map page leans on `100dvh`, `display: contents` and `:has()`, and all three have WebKit histories:

```bash
cd /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad && \
sitecheck http://localhost:8090 --config ./sitecheck.config.json --viewports phone,1440 --engine both
```

- [ ] **Step 6: Run the harness against the Vercel preview**

The preview is the artifact Alex reviews on his phone (spec 7, spec 11 item 4), and it is the only place `cleanUrls`, the real CSP headers and the real caching apply. The local run cannot test any of those: `pipeline/serve.mjs` sends no CSP header, so an inline script or style that the production CSP would block passes locally in silence.

```bash
# If the preview is protected, the secret lives in Vercel > Settings > Deployment
# Protection > Protection Bypass for Automation, vaulted once by stream E.
BYPASS=$(python3 ~/.claude/scripts/gw-secrets.py show h5-bird-flu-tracker:VERCEL_AUTOMATION_BYPASS_SECRET 2>/dev/null)
cd /private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad && \
if [ -n "$BYPASS" ]; then
  sitecheck "$PREVIEW_URL" --config ./sitecheck.config.json --header "x-vercel-protection-bypass: $BYPASS"
else
  sitecheck "$PREVIEW_URL" --config ./sitecheck.config.json
fi
```

Set `PREVIEW_URL` to the deployment URL the parent supplies. Expected differences from the local run, all of which are correct:
- `/about.html` and `/history.html` answer 308 rather than 200. The `links` check reports a redirect chain only if a page links to one, which Task 13 Step 1 and Task 14 Step 7 both forbid, so a hit here is a real defect.
- Previews are noindex by design; the harness reports that as info.
- `/_vercel/insights/script.js` answers 200 once stream E has enabled Web Analytics, and 404 until then. A 404 there is stream E's, not a blocker for this stream, and Step 9 reports it.

**This is the run that proves the CSP.** Check `counts.byCheck.console` and `counts.byCheck.requests` specifically: a blocked inline script or style surfaces there and nowhere else.

- [ ] **Step 7: The two link checks the harness does not make**

The harness crawls rendered pages. These two read the source, and catch a class of defect a crawl cannot: a link that resolves but costs a redirect, and an anchor emitted from JS rather than markup.

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const fs = require('fs');
const pages = { '/': 'site/index.html', '/about': 'site/about.html', '/history': 'site/history.html' };
const anchors = {};
for (const [route, file] of Object.entries(pages)) {
  const s = fs.readFileSync(file, 'utf8');
  anchors[route] = new Set([...s.matchAll(/id=\"([A-Za-z0-9_-]+)\"/g)].map(m => m[1]));
}
let bad = 0;
for (const [route, file] of Object.entries(pages)) {
  const s = fs.readFileSync(file, 'utf8');
  for (const m of s.matchAll(/href=\"([^\"]+)\"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:)/.test(href)) continue;
    if (href.endsWith('.html')) { console.error(file + ': links to a redirecting .html url: ' + href); bad++; continue; }
    const [path, hash] = href.split('#');
    const target = path === '' ? route : path;
    if (!(target in pages) && !/^\/(assets|data|sitemap)/.test(target)) {
      console.error(file + ': unknown target ' + href); bad++; continue;
    }
    if (hash && (target in pages) && !anchors[target].has(hash)) {
      console.error(file + ': anchor #' + hash + ' does not exist on ' + target); bad++;
    }
  }
}
// The same, for the hrefs app.js and about.js emit as strings.
const js = fs.readFileSync('site/app.js','utf8') + fs.readFileSync('site/about.js','utf8');
for (const m of js.matchAll(/href=\\\\\"(\/[^\\\\\"]*)/g)) {
  const [path, hash] = m[1].split('#');
  const target = path === '' ? '/' : path;
  if (!(target in pages)) { console.error('js emits an unknown target: ' + m[1]); bad++; continue; }
  if (hash && !anchors[target].has(hash)) { console.error('js emits a missing anchor: ' + m[1]); bad++; }
}
if (bad) process.exit(1);
console.log('every internal link resolves to a real page and a real anchor, with no redirect hop');
"
```
Expected: the success line.

- [ ] **Step 8: The checks a harness cannot make**

Everything below is either a claim about whether a number is the right number, or an interaction. Nothing here duplicates a sitecheck check: contrast, overflow, tap targets, links, anchors, SEO, console errors and axe are all Step 4's and are not repeated.

Open `npx playwright open --viewport-size=1280,800 http://localhost:8090/index.html` and tick each only when seen.

**The figures are the published figures** (sitecheck reads pixels, not meaning):
- [ ] The panel's first figure equals `official_au.national_total` in the served `summary.json`, or `dataset_rows` when `dataset_matches_total` is false.
- [ ] The panel's second figure equals `au_layers.official.jurisdictions`, and "Which ones" lists exactly `jurisdiction_list`.
- [ ] The panel's third figure equals `au_layers.official.latest_sampled` and its locality.
- [ ] Each layer button's count matches the layer it selects.

**The filters move the map** (spec 7: "each layer, timeframe and species chip changes the marker count as expected"):
- [ ] Each of the three layer buttons changes the marker count.
- [ ] Each timeframe reduces it, and "Since June 2026" restores it.
- [ ] Each species chip reduces it, and "All species" restores it.
- [ ] The H7 toggle adds grey marks and the one-line panel note, and unticking removes both.

**The scrubber counts what the map shows** (spec 7):
- [ ] At the right-hand end of the track, the record list count equals the layer count for the current filters.
- [ ] Dragging left reduces the markers and the list count together, and the date label follows.
- [ ] Play replays from the start, stops at the end, and dragging the slider stops it.
- [ ] Under reduced motion, Play is gone and the slider still works. Task 8 Step 5 automates this; confirm it passed.

**Drawer focus handling** (spec 7: "the drawer opens from a marker and from the list, and closes on Escape"):
- [ ] Opens from a marker, and from a row of the record list.
- [ ] Escape closes it from both, and focus returns to the row button or to the map, never to the body.
- [ ] A placement holding several records opens the cluster list, and picking one opens that record.
- [ ] Tab alone reaches, in order: skip link, panel heading link, About, History, each layer button, timeframe, each species chip, the H7 box, List records, the scrubber, Play, the map, the footer links. Nothing focusable is invisible.

**The freshness line's three states** (no harness can age data):
- [ ] With the fixture's run fresh, the line is not carmine.
- [ ] Set the fixture's `freshness.generated_at` to three days ago, reload: it reads "Data last updated 3 days ago." in carmine.
- [ ] Set `official_au.as_at` to six days ago with a fresh run: it reads "Official figure from {date}; the department has not published since."

**The birds gates** (stream D):
- [ ] With no `site/birds.js`, the page is complete, the drawer canvas stays hidden, and `sessionStorage` holds no `birds-flight`. Task 10 Steps 3 and 4 automate this; confirm both passed.
- [ ] Once stream D has landed: the flight runs once and not again on reload in the same tab; under reduced motion there is no flight and the drawer shows the still; with WebGL disabled the drawer shows the APNG loop.

- [ ] **Step 9: Performance, which sitecheck does not measure**

Spec 5.5 sets Lighthouse mobile performance at 90 or better and the first load at 350 KB compressed.

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && npx lighthouse http://localhost:8090/index.html \
  --form-factor=mobile --only-categories=performance \
  --output=json --output-path=/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/lh.json \
  --chrome-flags="--headless" --quiet && \
node -e "
const r = require('/private/tmp/claude-502/-Users-Alex/b0f31fd7-7716-4c2d-84bf-ffd2827f3a27/scratchpad/lh.json');
const perf = Math.round(r.categories.performance.score * 100);
console.log('performance', perf);
if (perf < 90) { console.error('BELOW THE SPEC FLOOR of 90'); process.exit(1); }
"
```

Then the budget, which is the first thing to look at when the score is short:

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node -e "
const { gzipSync } = require('zlib');
const fs = require('fs');
const files = ['site/assets/leaflet/leaflet.js','site/assets/leaflet/leaflet.css','site/app.js','site/lib.js','site/icons.js','site/styles.css','site/data/summary.json','site/data/detections/au.json'];
let total = 0;
for (const f of files) {
  const n = gzipSync(fs.readFileSync(f)).length;
  total += n;
  console.log(String(Math.round(n/1024)).padStart(5) + ' KB  ' + f);
}
console.log('------');
console.log(String(Math.round(total/1024)).padStart(5) + ' KB  total compressed');
if (total > 350 * 1024) { console.error('OVER the 350 KB first load budget'); process.exit(1); }
"
```

A local Lighthouse score is necessary and not sufficient: the preview deployment's number is the one that counts, so run it against `PREVIEW_URL` as well once Step 6 has passed.

- [ ] **Step 10: The page survives the data it will actually be served**

The single most important check in this task, because it is the one the old design failed, and the one sitecheck cannot make: the harness crawls the fixture, which has every key. This crawls the committed data, which has almost none of them.

```bash
cd /Users/Alex/dev/h5-bird-flu-tracker && node pipeline/serve.mjs &
sleep 1
node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/birds\.js|_vercel/.test(m.text())) errors.push(m.text()); });
  await p.goto('http://localhost:8080/index.html');
  await p.waitForSelector('body[data-ready]', { timeout: 15000 });
  const markers = await p.evaluate(() => document.querySelectorAll('#map .leaflet-marker-icon, #map path.leaflet-interactive').length);
  const headline = await p.textContent('#panelHeadline');
  const figures = await p.textContent('#panelFigures');
  console.log('markers:', markers);
  console.log('headline:', JSON.stringify(headline));
  console.log('figures:', JSON.stringify(figures.replace(/\s+/g,' ').trim()));
  if (!markers) throw new Error('the map is empty against the committed data');
  if (/undefined|NaN|null/.test(headline + figures)) throw new Error('an unpublished value leaked into the panel');
  if (errors.length) { console.error('ERRORS:', errors.join('\n')); process.exit(1); }
  console.log('the page is honest against data that predates the new pipeline');
  await b.close();
});
"
```
Expected: `the page is honest against data that predates the new pipeline`. The words `undefined`, `NaN` and `null` must appear nowhere a reader can see.

- [ ] **Step 11: Report**

Return a list to the parent, not a file. For each of the fourteen tasks: passed, or the exact check that failed with the file and line that owns it.

Include, from the harness:
- the run directories for both sitecheck runs, so the parent can open `report.html`
- `counts.bySeverity` for each run, and any blocker that was accepted rather than fixed, with the reason
- whether the Safari engine run found anything the Chromium run did not

Name these four explicitly, because each belongs to another stream and the parent needs to know which are still open:
- whether `npm test` picked up `site/test/` (stream A's script)
- whether `site/assets/birds/greater-crested-tern.png` had landed for the OG card (stream C)
- whether `site/birds.js` had landed for the two integration points (stream D)
- whether `/_vercel/insights/script.js` answered 200 on the preview, which is the only thing that tells you Web Analytics is on (stream E, and Alex's item 1 in spec 11)

Do not mark the stream complete while any of those four is outstanding.
---

## What this plan does not cover

Named so the parent can see the seams.

- **Streams A, C, D and E.** Every dependency on them is in an Interfaces block, and Task 14 Step 8 reports on each.
- **`pipeline/serve.mjs` does not implement `cleanUrls`.** Tasks 6, 9 and 14 use a small fixture server in the scratchpad that does, which is also how the new-shape data is served without touching `site/data`. It matters most in Task 14: pointed at `npm run serve`, the harness would report `/about` and `/history` as 404 blockers that are properties of the dev server rather than of the site. The one-line fix to `serve.mjs` belongs to stream A, and would let the harness run against `npm run serve` directly.
- **`sitecheck.config.json` lives in the scratchpad, not the repo.** The harness reads it from the cwd or from `--config`, and the repo root is outside this stream's allowlist. If the config turns out to be worth keeping, adding it at the repo root is a one-line ask to the parent rather than something this stream does on its own.
- **Performance.** `/sitecheck` does not measure it. Lighthouse and the 350 KB first-load budget are Task 14 Step 9, run separately.
- **`package.json`'s `test` script.** Stream A's file. Every test step here runs `node --test` directly.
- **Search Console and the DNS TXT record.** Spec 4.3 and 11 item 5, stream E. This stream produces `sitemap.xml`; submitting it is stream E's.
- **The `www` versus apex decision.** Verified live on 30 Sep 2026: the apex 308s to `www`, so this stream uses `www` everywhere. If stream E ever moves the canonical host, six files change: three `<link rel="canonical">`, three `og:url` and `sitemap.xml`.
