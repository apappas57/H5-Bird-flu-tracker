# Stream A: Data Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Commonwealth's record-level H5 events spreadsheet the Australian backbone of the tracker, place every record from a committed gazetteer cache with stated precision, publish the official totals, series and milestones with their sources, and add a fetch-free `--verify` mode.

**Architecture:** Three new DAFF source modules (spreadsheet, latest-data page, CVO statements) feed the existing normalise, era-stamp, split pipeline. Placement is a pure function over a committed cache (`pipeline/geo/au-localities.json`) that a resolver fills from the FSDF place-names API with Nominatim as fallback. New summary blocks are built by pure functions in `pipeline/lib/summary-au.mjs` and wired into `build.mjs`. FAO Australian records stay as a second layer (`layer: "woah"`), never merged with the official layer.

**Tech Stack:** Node 20+ (ES modules, `node:test`), one runtime dependency `fflate@0.8.3` (zip reading for the XLSX), built-in `fetch`, built-in `zlib`. No framework.

**Spec:** `docs/superpowers/specs/2026-09-30-map-first-rebuild-design.md`, sections 3.1 to 3.6, 4.1 (the `--verify` mode), and the A row of section 8.

## Global Constraints

- Node `>=20`; the pipeline stays runnable with `node pipeline/build.mjs` after one `npm ci` (spec 2: no framework, no runtime build step).
- Every request to `agriculture.gov.au` uses the browser User-Agent in `pipeline/lib/daff.mjs` and a 30 s timeout; the raw responses are saved as fixtures for offline tests (spec 3.1).
- No geocoding from prose. Only the structured `Locality` field is placed; precision is always stated; a record is never dropped for want of coordinates (spec 3.3).
- Counts on different bases are never merged (spec 2). The official layer and the WOAH layer are separate records with a `layer` field.
- Every rule fails away from the live outbreak: unknown species class is published as `wild_bird` with `species_class: "unverified"` and a warning; unmatched jurisdiction maps to Other Territories with a warning; placement falls back to LGA, then state, never to nothing (spec 3.2, 3.3).
- `--verify` fetches nothing, exits 1 on invalid data (spec 4.1).
- No em dashes in any file this plan creates or edits.
- Interface produced for stream B (exact names): `summary.json` gains `freshness`, `official_au`, `official_series`, `milestones`, `placement_stats`, `au_layers` (shapes in Task 7); `detections/au.json` holds official records first (with `layer`, `record_id`, `record_class`, `lga`, `locality`, `precision`, `date_basis`, `first_seen`, `withdrawn?`, `species_scientific`, `species_class`, `admin1_note?`, `dataset_url`, `placement_source?`) then FAO records with `layer: "woah"`.
- Interface produced for stream E: `node pipeline/build.mjs --verify` exits 0 or 1 without network.

---

## File structure

| File | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json` | `fflate` dependency; `npm test` runs `node --test pipeline/test/`. |
| `pipeline/test/fixtures/` | Today's raw DAFF responses: `H5_bird_flu_events.xlsx`, `latest-data.html`, `H5-bird-flu-updates.json`. |
| `pipeline/lib/xlsx.mjs` | Read the first sheet of an XLSX into rows of strings. Excel serial date conversion. |
| `pipeline/lib/daff.mjs` | Shared DAFF constants and helpers: URLs, browser headers, `textOf`, `num`, `toIsoDate`, jurisdiction map. |
| `pipeline/lib/http.mjs` | Add `getBuffer` and `getJson` beside the existing `getText`. |
| `pipeline/sources/daff-events.mjs` | Spreadsheet rows to records (pure `parseDaffEvents`), plus the collector that fetches, places and returns records. |
| `pipeline/lib/gazetteer.mjs` | Cache key, feature ranking, FSDF and Nominatim resolvers, `resolveMissing`, pure `placeRecords`. |
| `pipeline/geo/au-localities.json` | Committed placement cache, sorted keys. |
| `pipeline/species/mammals.json` | Scientific-name prefixes that mean `mammal`. |
| `pipeline/sources/daff-latest.mjs` | Latest-data page to `official_au`. |
| `pipeline/sources/daff-updates.mjs` | CVO statements node to `official_series` and `milestones`. |
| `pipeline/lib/summary-au.mjs` | Pure builders: `buildAuLayers`, `buildFreshness`, `buildPlacementStats`, `restoreLayer`. |
| `pipeline/lib/schema.mjs` | `makeRecord` passes the new optional fields through. |
| `pipeline/sources/index.mjs`, `pipeline/build.mjs` | Register the source; per-layer restore; new summary blocks; `--verify`. |
| `pipeline/verify.mjs` | `verifyData(dir)` used by `--verify`. |
| `pipeline/au-status.json`, `pipeline/curated.json` | Shrunk to what a parser cannot produce. |
| `docs/DATA_SOURCES.md`, `README.md` | Rewritten for the new backbone. |

---

### Task 1: Test harness, dependency, fixtures

**Files:**
- Modify: `package.json`
- Create: `package-lock.json` (by `npm install`)
- Create: `pipeline/test/fixtures/H5_bird_flu_events.xlsx`, `pipeline/test/fixtures/latest-data.html`, `pipeline/test/fixtures/H5-bird-flu-updates.json`
- Create: `pipeline/test/harness.test.mjs`

**Interfaces:**
- Produces: `npm test` runs every `*.test.mjs` under `pipeline/test/`; `fixture(name)` helper returns a path.

- [ ] **Step 1: Add the dependency and the test script**

Run: `cd ~/dev/h5-bird-flu-tracker && npm install --save-exact fflate@0.8.3 --no-audit --no-fund`
Expected: `package-lock.json` created, `node_modules/fflate` present.

Edit `package.json` so `scripts` reads:

```json
  "scripts": {
    "build": "node pipeline/build.mjs",
    "verify": "node pipeline/build.mjs --verify",
    "serve": "node pipeline/serve.mjs",
    "test": "node --test"
  },
```

`node --test` with no paths uses Node's default discovery (`**/*.test.{js,mjs,cjs}` and `**/test/**`,
excluding `node_modules`), so the `site/test/` and `birds-src/test/` suites that streams B and D add
are picked up without anyone editing this line again.

Confirm `.gitignore` contains `node_modules/` (add the line if it does not).

- [ ] **Step 2: Capture the fixtures from the live sources (residential IP)**

```bash
cd ~/dev/h5-bird-flu-tracker && mkdir -p pipeline/test/fixtures
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
curl -sS -m 40 -A "$UA" -o pipeline/test/fixtures/H5_bird_flu_events.xlsx "https://www.agriculture.gov.au/sites/default/files/documents/H5_bird_flu_events.xlsx"
curl -sS -m 40 -A "$UA" -o pipeline/test/fixtures/latest-data.html "https://www.agriculture.gov.au/campaigns/birdflu/latest-data"
curl -sS -m 40 -A "$UA" -o pipeline/test/fixtures/H5-bird-flu-updates.json "https://www.agriculture.gov.au/about/news/H5-bird-flu-updates?_format=json"
ls -la pipeline/test/fixtures/
```

Expected: three files, roughly 120 KB, 44 KB and 142 KB. If the spreadsheet's sheet name has moved past `H5 bird flu 2026-09-29` the test values in Tasks 2 to 6 must be re-read from the new fixture (the assertions below are true for the 29 September dataset; if the department has published a newer file, capture it, then update the numbers in the tests from the file, not from memory).

- [ ] **Step 3: Write the harness test**

```js
// pipeline/test/harness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const fixture = (name) => path.join(FIXTURES, name);

test('fixtures are present', () => {
  for (const f of ['H5_bird_flu_events.xlsx', 'latest-data.html', 'H5-bird-flu-updates.json']) {
    assert.ok(fs.statSync(fixture(f)).size > 10_000, `${f} looks empty`);
  }
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore pipeline/test/harness.test.mjs pipeline/test/fixtures/
git commit -m "test: node:test harness, fflate dependency, DAFF fixtures captured 30 Sep 2026"
```

---

### Task 2: XLSX reader

**Files:**
- Create: `pipeline/lib/xlsx.mjs`
- Test: `pipeline/test/xlsx.test.mjs`

**Interfaces:**
- Produces: `readFirstSheet(bytes: Uint8Array | Buffer) -> { sheetName: string, rows: string[][] }` (rows padded to the header width; cell values are raw strings: shared strings resolved, numbers as their text, error cells as their text such as `#N/A`); `excelSerialToISO(serial: string | number) -> "YYYY-MM-DD"`; `colIndex("B2") -> 1`.

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/xlsx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './harness.test.mjs';
import { readFirstSheet, excelSerialToISO, colIndex } from '../lib/xlsx.mjs';

const HEADERS = ['Record id', 'Date sampled', 'Jurisdiction', 'Local government area', 'Locality', 'Common name', 'Scientific name'];

test('colIndex converts cell references', () => {
  assert.equal(colIndex('A1'), 0);
  assert.equal(colIndex('B2'), 1);
  assert.equal(colIndex('G669'), 6);
  assert.equal(colIndex('AA3'), 26);
});

test('excelSerialToISO uses the 1900 epoch', () => {
  assert.equal(excelSerialToISO(45658), '2025-01-01');
  assert.equal(excelSerialToISO('46188'), '2026-06-15');
});

test('readFirstSheet reads the DAFF spreadsheet', () => {
  const sheet = readFirstSheet(fs.readFileSync(fixture('H5_bird_flu_events.xlsx')));
  assert.equal(sheet.sheetName, 'H5 bird flu 2026-09-29');
  assert.equal(sheet.rows.length, 669);
  assert.deepEqual(sheet.rows[0], HEADERS);
  assert.equal(sheet.rows[1][0], 'WA-WB-001');
  assert.equal(excelSerialToISO(sheet.rows[1][1]), '2026-06-15');
  assert.equal(sheet.rows[1][2], 'WA');
  assert.equal(sheet.rows[1][5], 'Brown Skua');
  assert.equal(sheet.rows[3][1], '#N/A');
  for (const row of sheet.rows) assert.equal(row.length, 7);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/xlsx.test.mjs`
Expected: fails with `Cannot find module '.../pipeline/lib/xlsx.mjs'`.

- [ ] **Step 3: Write the reader**

```js
// pipeline/lib/xlsx.mjs
// Minimal XLSX reader: first sheet only, values as strings. The DAFF events
// file is a plain Excel export (shared strings, numeric date serials, #N/A
// error cells), which is all this needs to understand.
import { unzipSync, strFromU8 } from 'fflate';

export function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`[\\s<]${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

export function colIndex(ref) {
  let n = 0;
  for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Excel's 1900 date system: serial 1 is 1900-01-01, with the phantom 29 Feb 1900,
// so the epoch that makes the arithmetic right is 1899-12-30.
export function excelSerialToISO(serial) {
  const days = Math.round(Number(serial));
  return new Date(Date.UTC(1899, 11, 30) + days * 86400000).toISOString().slice(0, 10);
}

export function readFirstSheet(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const text = (p) => {
    if (!files[p]) throw new Error(`xlsx: missing ${p}`);
    return strFromU8(files[p]);
  };
  const sheetTag = text('xl/workbook.xml').match(/<sheet\b[^>]*>/);
  if (!sheetTag) throw new Error('xlsx: workbook has no sheets');
  const sheetName = attr(sheetTag[0], 'name');
  const rid = attr(sheetTag[0], 'r:id');
  const rel = [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0]).find((t) => attr(t, 'Id') === rid);
  if (!rel) throw new Error(`xlsx: no relationship for ${rid}`);
  const sheetPath = 'xl/' + attr(rel, 'Target').replace(/^\/?(xl\/)?/, '');

  const shared = files['xl/sharedStrings.xml']
    ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map((m) => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    : [];

  const rows = [];
  for (const row of text(sheetPath).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = `<c${c[1]}>`;
      const inner = c[2] || '';
      const ref = attr(head, 'r');
      const type = attr(head, 't');
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      let value = '';
      if (type === 's') value = shared[Number(v?.[1])] ?? '';
      else if (type === 'inlineStr') value = decodeXml(t?.[1] ?? '');
      else value = decodeXml(v?.[1] ?? '');
      cells[colIndex(ref)] = value;
    }
    rows.push(cells);
  }
  const width = rows[0]?.length || 0;
  return { sheetName, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test pipeline/test/xlsx.test.mjs`
Expected: `# pass 3`. If the sheet row count differs, the department has published a newer file: re-read the numbers from the fixture (Task 1 Step 2) rather than loosening the test.

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/xlsx.mjs pipeline/test/xlsx.test.mjs
git commit -m "feat(pipeline): minimal XLSX reader for the DAFF events spreadsheet"
```

---

### Task 3: Shared DAFF helpers and the spreadsheet parser

**Files:**
- Create: `pipeline/lib/daff.mjs`
- Create: `pipeline/species/mammals.json`
- Create: `pipeline/sources/daff-events.mjs` (the pure parser now; the collector is added in Task 7)
- Test: `pipeline/test/daff-events.test.mjs`

**Interfaces:**
- Produces from `daff.mjs`: `DATASET_URL`, `LATEST_URL`, `UPDATES_URL`, `UPDATES_JSON_URL`, `DAFF_HEADERS`, `JURISDICTIONS` (code to `[name, code]`), `textOf(html)`, `num("54,551") -> 54551`, `toIsoDate("28 August 2026") -> "2026-08-28"`.
- Produces from `daff-events.mjs`: `parseDatasetDate(sheetName) -> "YYYY-MM-DD" | null`; `classify(recordClass, scientific, mammals) -> { category, species_class }`; `parseDaffEvents(sheet, { previous, datasetDate, mammals, today }) -> { records, withdrawn, warnings, stats }` where each record is the raw object Task 7 passes to `makeRecord`.

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/daff-events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './harness.test.mjs';
import { readFirstSheet } from '../lib/xlsx.mjs';
import { num, toIsoDate, textOf, JURISDICTIONS } from '../lib/daff.mjs';
import { parseDatasetDate, classify, parseDaffEvents } from '../sources/daff-events.mjs';

const mammals = JSON.parse(fs.readFileSync(new URL('../species/mammals.json', import.meta.url), 'utf8'));
const sheet = readFirstSheet(fs.readFileSync(fixture('H5_bird_flu_events.xlsx')));

test('daff helpers', () => {
  assert.equal(num('54,551'), 54551);
  assert.equal(toIsoDate('28 August 2026'), '2026-08-28');
  assert.equal(toIsoDate('9 August 2026'), '2026-08-09');
  assert.equal(textOf('<p>a&nbsp;<b>b</b></p>\n<p>c</p>'), 'a b c');
  assert.deepEqual(JURISDICTIONS.OTHER, ['Other Territories', 'OT']);
});

test('dataset date comes from the sheet name', () => {
  assert.equal(parseDatasetDate('H5 bird flu 2026-09-29'), '2026-09-29');
  assert.equal(parseDatasetDate('Sheet1'), null);
});

test('classify fails away from the live outbreak', () => {
  assert.deepEqual(classify('WB', 'Thalasseus bergii', mammals), { category: 'wild_bird', species_class: 'Aves' });
  assert.deepEqual(classify('WM', 'Neophoca cinerea', mammals), { category: 'mammal', species_class: 'Mammalia' });
  assert.deepEqual(classify('FM', 'Vulpes vulpes', mammals), { category: 'mammal', species_class: 'Mammalia' });
  assert.deepEqual(classify('WB', 'Arctocephalus forsteri', mammals), { category: 'mammal', species_class: 'Mammalia' });
  assert.deepEqual(classify('ZZ', 'Unknown thing', mammals), { category: 'wild_bird', species_class: 'unverified' });
});

test('parseDaffEvents turns the fixture into 668 records', () => {
  const out = parseDaffEvents(sheet, { previous: [], datasetDate: '2026-09-29', mammals, today: '2026-09-30' });
  assert.equal(out.records.length, 668);
  assert.equal(out.withdrawn.length, 0);
  assert.equal(out.stats.rows, 668);
  const first = out.records[0];
  assert.equal(first.id, 'daff-wa-wb-001');
  assert.equal(first.layer, 'official');
  assert.equal(first.record_id, 'WA-WB-001');
  assert.equal(first.record_class, 'WB');
  assert.equal(first.category, 'wild_bird');
  assert.equal(first.admin1, 'Western Australia');
  assert.equal(first.admin1_code, 'WA');
  assert.equal(first.lga, 'Esperance');
  assert.equal(first.locality, 'Esperance');
  assert.equal(first.date, '2026-06-15');
  assert.equal(first.date_basis, 'sampled');
  assert.equal(first.first_seen, '2026-09-29');
  assert.equal(first.subtype, 'H5');
  assert.equal(first.confidence, 'confirmed');
  assert.equal(first.species, 'Brown Skua');
  assert.equal(first.species_scientific, 'Stercorarius antarcticus');
  assert.equal(first.count, 1);
  const na = out.records.find((r) => r.record_id === 'SA-WB-001');
  assert.equal(na.date, '2026-09-29');
  assert.equal(na.date_basis, 'first_seen');
  assert.equal(out.records.filter((r) => r.date_basis === 'first_seen').length, 134);
  const jbt = out.records.find((r) => r.record_id === 'Other-WB-001');
  assert.equal(jbt.admin1, 'Other Territories');
  assert.equal(jbt.admin1_code, 'OT');
  assert.equal(jbt.admin1_note, 'Jervis Bay Territory (Commonwealth jurisdiction)');
  assert.equal(jbt.locality, 'Jervis Bay');
  assert.equal(out.records.filter((r) => r.category === 'mammal').length >= 3, true);
  assert.equal(out.warnings.length, 0);
});

test('first_seen is kept from the previous snapshot and withdrawals are retained for 30 days', () => {
  const previous = [
    { record_id: 'WA-WB-001', first_seen: '2026-06-20' },
    { record_id: 'XX-WB-999', first_seen: '2026-07-01', locality: 'Nowhere', admin1_code: 'WA' },
    { record_id: 'XX-WB-998', first_seen: '2026-07-01', withdrawn: '2026-08-01' },
  ];
  const out = parseDaffEvents(sheet, { previous, datasetDate: '2026-09-29', mammals, today: '2026-09-30' });
  assert.equal(out.records[0].first_seen, '2026-06-20');
  assert.equal(out.withdrawn.length, 1);
  assert.equal(out.withdrawn[0].record_id, 'XX-WB-999');
  assert.equal(out.withdrawn[0].withdrawn, '2026-09-29');
});

test('a changed header fails loudly', () => {
  const bad = { sheetName: sheet.sheetName, rows: [['Record', ...sheet.rows[0].slice(1)], ...sheet.rows.slice(1)] };
  assert.throws(() => parseDaffEvents(bad, { previous: [], datasetDate: '2026-09-29', mammals }), /column 0/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/daff-events.test.mjs`
Expected: fails on the missing modules.

- [ ] **Step 3: Write the shared helpers**

```js
// pipeline/lib/daff.mjs
// Shared constants and helpers for the three Commonwealth (DAFF) sources.
export const DATASET_URL = 'https://www.agriculture.gov.au/sites/default/files/documents/H5_bird_flu_events.xlsx';
export const LATEST_URL = 'https://www.agriculture.gov.au/campaigns/birdflu/latest-data';
export const UPDATES_URL = 'https://www.agriculture.gov.au/about/news/H5-bird-flu-updates';
export const UPDATES_JSON_URL = UPDATES_URL + '?_format=json';

// agriculture.gov.au answers a browser immediately and tar-pits a bot UA, and
// it blocks cloud egress entirely (GitHub Actions, Vercel). These headers are
// the working set; the pipeline is expected to run from a residential IP.
export const DAFF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36',
  Accept: '*/*',
};

export const JURISDICTIONS = {
  WA: ['Western Australia', 'WA'],
  SA: ['South Australia', 'SA'],
  NSW: ['New South Wales', 'NSW'],
  QLD: ['Queensland', 'QLD'],
  VIC: ['Victoria', 'VIC'],
  TAS: ['Tasmania', 'TAS'],
  NT: ['Northern Territory', 'NT'],
  ACT: ['Australian Capital Territory', 'ACT'],
  OTHER: ['Other Territories', 'OT'],
};

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12 };

export const num = (s) => Number(String(s).replace(/[^\d.-]/g, ''));

export function toIsoDate(text) {
  const m = String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

export function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Seed the mammal list**

```json
[
  "Arctocephalus",
  "Neophoca",
  "Mirounga",
  "Hydrurga",
  "Leptonychotes",
  "Lobodon",
  "Vulpes",
  "Felis",
  "Canis",
  "Rattus",
  "Mus musculus",
  "Trichosurus",
  "Pteropus"
]
```

Save as `pipeline/species/mammals.json`. Then confirm every mammal in the fixture is covered:

Run: `node -e "import('./pipeline/lib/xlsx.mjs').then(({readFirstSheet})=>{const s=readFirstSheet(require('fs').readFileSync('pipeline/test/fixtures/H5_bird_flu_events.xlsx'));const m=new Set(s.rows.slice(1).filter(r=>r[0].split('-')[1]!=='WB').map(r=>r[6]));console.log([...m])})"`
Expected: names such as `Arctocephalus pusillus doriferus`, `Neophoca cinerea`, `Arctocephalus forsteri`, `Vulpes vulpes`, each starting with a prefix in the list. Add any that is not.

- [ ] **Step 5: Write the parser**

```js
// pipeline/sources/daff-events.mjs
// The Commonwealth's record-level H5 bird flu events spreadsheet: the
// Australian backbone. One row per confirmed wildlife event. Pure parser here;
// the collector (fetch + placement) is at the bottom and added in Task 7.
import { excelSerialToISO } from '../lib/xlsx.mjs';
import { DATASET_URL, LATEST_URL, JURISDICTIONS } from '../lib/daff.mjs';

export const HEADERS = ['Record id', 'Date sampled', 'Jurisdiction', 'Local government area', 'Locality', 'Common name', 'Scientific name'];
export const RETENTION_DAYS = 30;

export function parseDatasetDate(sheetName) {
  const m = String(sheetName || '').match(/(\d{4}-\d{2}-\d{2})\s*$/);
  return m ? m[1] : null;
}

export function classify(recordClass, scientific, mammals) {
  const cls = String(recordClass || '').toUpperCase();
  const sci = String(scientific || '').toLowerCase();
  const isMammal = mammals.some((prefix) => sci.startsWith(prefix.toLowerCase()));
  if (cls === 'WM' || cls === 'FM' || isMammal) return { category: 'mammal', species_class: 'Mammalia' };
  if (cls === 'WB') return { category: 'wild_bird', species_class: 'Aves' };
  return { category: 'wild_bird', species_class: 'unverified' };
}

function jurisdictionOf(raw, warnings, recordId) {
  const key = String(raw || '').trim().toUpperCase();
  if (JURISDICTIONS[key]) return { pair: JURISDICTIONS[key], other: key === 'OTHER' };
  warnings.push(`unknown jurisdiction "${raw}" for ${recordId}; mapped to Other Territories`);
  return { pair: JURISDICTIONS.OTHER, other: true };
}

export function parseDaffEvents(sheet, { previous = [], datasetDate, mammals = [], today } = {}) {
  const [header, ...body] = sheet.rows;
  HEADERS.forEach((h, i) => {
    if (String(header[i] || '').trim() !== h) {
      throw new Error(`daff-events: column ${i} is "${header[i]}", expected "${h}"`);
    }
  });
  const prevById = new Map(previous.filter((r) => r.record_id).map((r) => [r.record_id, r]));
  const seen = new Set();
  const records = [];
  const warnings = [];

  for (const raw of body) {
    const [recordId, dateRaw, jur, lga, locality, common, scientific] = raw.map((c) => String(c ?? '').trim());
    if (!recordId) continue;
    const recordClass = recordId.split('-')[1] || '';
    const { pair, other } = jurisdictionOf(jur, warnings, recordId);
    const prev = prevById.get(recordId);
    const firstSeen = prev?.first_seen || datasetDate;

    let date;
    let dateBasis;
    if (/^\d+(\.\d+)?$/.test(dateRaw)) { date = excelSerialToISO(dateRaw); dateBasis = 'sampled'; }
    else if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) { date = dateRaw.slice(0, 10); dateBasis = 'sampled'; }
    else { date = firstSeen; dateBasis = 'first_seen'; }

    const { category, species_class } = classify(recordClass, scientific, mammals);
    if (species_class === 'unverified') warnings.push(`unverified species class for ${recordId}: ${common} (${scientific})`);

    records.push({
      id: `daff-${recordId.toLowerCase()}`,
      layer: 'official',
      record_id: recordId,
      record_class: recordClass,
      category,
      country: 'Australia',
      country_code: 'AU',
      admin1: pair[0],
      admin1_code: pair[1],
      admin1_note: other ? 'Jervis Bay Territory (Commonwealth jurisdiction)' : undefined,
      lga,
      locality,
      lat: null,
      lng: null,
      level: null,
      precision: null,
      date,
      date_basis: dateBasis,
      first_seen: firstSeen,
      count: 1,
      subtype: 'H5',
      confidence: 'confirmed',
      species: common,
      species_scientific: scientific,
      species_class,
      source: 'DAFF: H5 bird flu events dataset',
      source_url: LATEST_URL,
      dataset_url: DATASET_URL,
    });
    seen.add(recordId);
  }

  const withdrawn = [];
  const ref = Date.parse(today || datasetDate);
  for (const [rid, prev] of prevById) {
    if (seen.has(rid)) continue;
    const since = prev.withdrawn || datasetDate;
    if ((ref - Date.parse(since)) / 86400000 <= RETENTION_DAYS) withdrawn.push({ ...prev, withdrawn: since });
  }

  return {
    records,
    withdrawn,
    warnings,
    stats: { rows: body.filter((r) => String(r[0] || '').trim()).length, records: records.length, withdrawn: withdrawn.length },
  };
}
```

- [ ] **Step 6: Run the tests**

Run: `node --test pipeline/test/daff-events.test.mjs`
Expected: `# pass 6`. The mammal count assertion (`>= 3`) reflects the four mammal species in the 29 September file.

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/daff.mjs pipeline/species/mammals.json pipeline/sources/daff-events.mjs pipeline/test/daff-events.test.mjs
git commit -m "feat(pipeline): parse the DAFF events spreadsheet into official-layer records"
```

---

### Task 4: Gazetteer placement

**Files:**
- Create: `pipeline/lib/gazetteer.mjs`
- Create: `pipeline/geo/au-localities.json` (starts as `{}`)
- Modify: `pipeline/lib/http.mjs` (add `getJson`, `getBuffer`)
- Test: `pipeline/test/gazetteer.test.mjs`

**Interfaces:**
- Consumes: `site/assets/au-states-centroids.json` (`{"Victoria": {"code":"VIC","lat":-36.85,"lng":144.3}, ...}`).
- Produces: `normaliseName`, `cacheKey(stateCode, locality)`, `chooseFsdfDoc(docs, name)`, `fetchFsdf(name, stateCode, getJson)`, `fetchNominatim(name, stateName, getJson)`, `resolveMissing(records, cache, deps)`, `placeRecords(records, cache, stateCentroids) -> { records, stats }`, `loadStateCentroids(path)`, `loadCache(path)`, `saveCache(path, cache)`.
- Produces in `http.mjs`: `getJson(url, opts)` (parses `getText`) and `getBuffer(url, opts) -> Uint8Array` (same timeout and retry loop as `getText`).

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/gazetteer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseName, cacheKey, chooseFsdfDoc, parseLocation, placeRecords, resolveMissing, loadStateCentroids,
} from '../lib/gazetteer.mjs';

const centroids = loadStateCentroids(new URL('../../site/assets/au-states-centroids.json', import.meta.url));

const rec = (over) => ({ layer: 'official', admin1: 'South Australia', admin1_code: 'SA', lga: 'Alexandrina', locality: 'Port Elliot', lat: null, lng: null, precision: null, level: null, ...over });

test('normaliseName and cacheKey', () => {
  assert.equal(normaliseName('  Mt Gambier '), 'mount gambier');
  assert.equal(normaliseName("D'Estrees Bay"), 'd estrees bay');
  assert.equal(cacheKey('SA', 'Port Elliot'), 'SA|port elliot');
});

test('state centroids include the Jervis Bay Territory', () => {
  assert.equal(centroids['Victoria'].code, 'VIC');
  assert.ok(Math.abs(centroids['Other Territories'].lat + 35.14) < 0.01);
});

test('chooseFsdfDoc prefers an exact-name LOCALITY over PORT and TOWN SITE', () => {
  const docs = [
    { name: 'Port Elliot', feature: 'PORT', authority: 'SA', location: '138.6961135 -35.53561433' },
    { name: 'Port Elliot', feature: 'TOWN SITE', authority: 'SA', location: '138.6801342 -35.53311666' },
    { name: 'Port Elliot', feature: 'LOCALITY', authority: 'SA', location: '138.6801342 -35.53311666' },
    { name: 'Port Elliot Bay', feature: 'BAY', authority: 'SA', location: '138.7 -35.54' },
  ];
  assert.equal(chooseFsdfDoc(docs, 'Port Elliot').feature, 'LOCALITY');
  assert.equal(chooseFsdfDoc(docs, 'Somewhere Else'), null);
  assert.deepEqual(parseLocation(docs[0]), { lng: 138.6961135, lat: -35.53561433 });
});

test('placeRecords: locality, then LGA mean, then state, never unplaced', () => {
  const cache = { 'SA|port elliot': { lat: -35.533, lng: 138.68, precision: 'locality', source: 'fsdf' } };
  const records = [
    rec({ id: 'a' }),
    rec({ id: 'b', locality: 'Unknown Beach' }),
    rec({ id: 'c', locality: 'Unknown Cove', lga: 'Nowhere Council' }),
    { id: 'd', layer: 'woah', lat: -30, lng: 140 },
  ];
  const { records: out, stats } = placeRecords(records, cache, centroids);
  assert.deepEqual([out[0].lat, out[0].lng, out[0].precision, out[0].level], [-35.533, 138.68, 'locality', 'locality']);
  assert.deepEqual([out[1].lat, out[1].lng, out[1].precision, out[1].level], [-35.533, 138.68, 'lga', 'lga']);
  assert.deepEqual([out[2].lat, out[2].lng, out[2].precision, out[2].level], [centroids['South Australia'].lat, centroids['South Australia'].lng, 'state', 'admin1']);
  assert.deepEqual([out[3].lat, out[3].lng], [-30, 140]);
  assert.deepEqual(stats, { locality: 1, lga: 1, state: 1, unplaced: 0 });
});

test('resolveMissing fills the cache from FSDF, then Nominatim, and records misses', async () => {
  const calls = [];
  const getJson = async (url) => {
    calls.push(url);
    if (url.includes('placenames.fsdf.org.au')) {
      if (url.includes('Port%20Elliot')) return { response: { docs: [{ name: 'Port Elliot', feature: 'LOCALITY', authority: 'SA', recordId: 'SA_1', location: '138.68 -35.533' }] } };
      return { response: { docs: [] } };
    }
    if (url.includes('nominatim')) {
      if (url.includes('Parkdale')) return [{ lat: '-37.99', lon: '145.07', place_id: 42, type: 'suburb' }];
      return [];
    }
    throw new Error('unexpected ' + url);
  };
  const cache = {};
  const records = [rec({ locality: 'Port Elliot' }), rec({ admin1: 'Victoria', admin1_code: 'VIC', locality: 'Parkdale' }), rec({ locality: 'Nowhere Cove' })];
  await resolveMissing(records, cache, { getJson, sleep: async () => {}, now: new Date('2026-09-30T00:00:00Z') });
  assert.equal(cache['SA|port elliot'].source, 'fsdf');
  assert.equal(cache['SA|port elliot'].source_id, 'SA_1');
  assert.equal(cache['VIC|parkdale'].source, 'nominatim');
  assert.equal(cache['VIC|parkdale'].lat, -37.99);
  assert.equal(cache['SA|nowhere cove'].miss, true);
  assert.equal(cache['SA|nowhere cove'].resolved_at, '2026-09-30');
  await resolveMissing(records, cache, { getJson, sleep: async () => {}, now: new Date('2026-09-30T00:00:00Z') });
  assert.equal(calls.filter((u) => u.includes('Port%20Elliot')).length, 1, 'cached hits are not refetched');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/gazetteer.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Add `getJson` and `getBuffer` to `http.mjs`**

Read `pipeline/lib/http.mjs` first. Beside the existing `getText`, add:

```js
export async function getJson(url, opts = {}) {
  return JSON.parse(await getText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } }));
}

// Same timeout and retry policy as getText, for binary responses (the XLSX).
export async function getBuffer(url, { timeoutMs = 30000, retries = 3, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: '*/*', ...headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}
```

(`UA` is the module's existing User-Agent constant; use its real name.)

- [ ] **Step 4: Write the gazetteer module**

```js
// pipeline/lib/gazetteer.mjs
// Placement for records that carry a place NAME and no coordinates (the DAFF
// events spreadsheet). A lookup, never a guess: every placement records its
// precision and its source, and a name that cannot be placed falls back to the
// LGA, then the state, and is never dropped.
import fs from 'node:fs';

export const FSDF_SELECT = 'https://api.placenames.fsdf.org.au/select';
export const FSDF_HEADERS = { Origin: 'https://placenames.fsdf.org.au', Referer: 'https://placenames.fsdf.org.au/', Accept: 'application/json' };
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_HEADERS = { 'User-Agent': 'birdflutracker.org pipeline (https://github.com/apappas57/H5-Bird-flu-tracker)' };
export const MISS_RETRY_DAYS = 30;

// Populated-place features first; a beach or island named the same as a town
// is a worse placement than the town, but far better than the state centroid.
export const FEATURE_RANK = ['LOCALITY', 'TOWN SITE', 'POPULATION CENTRE', 'SETTLEMENT', 'NEIGHBOURHOOD', 'SUBURB',
  'ISLAND', 'BAY', 'BEACH', 'POINT', 'CAPE', 'HEADLAND', 'PARK', 'CONSERVATION PARK', 'NATIONAL PARK', 'LAKE', 'RESERVE'];

const JBT = { code: 'OT', lat: -35.14, lng: 150.69 };

export function normaliseName(s) {
  return String(s || '').toLowerCase()
    .replace(/\bmt\.?\s/g, 'mount ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const cacheKey = (stateCode, locality) => `${stateCode}|${normaliseName(locality)}`;

const rank = (feature) => {
  const i = FEATURE_RANK.indexOf(String(feature || '').toUpperCase());
  return i === -1 ? FEATURE_RANK.length : i;
};

export function parseLocation(doc) {
  const parts = String(doc?.location || doc?.ll || '').trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lng, lat } : null;
}

export function chooseFsdfDoc(docs, name) {
  const wanted = normaliseName(name);
  const exact = (docs || []).filter((d) => normaliseName(d.name) === wanted && parseLocation(d));
  if (!exact.length) return null;
  exact.sort((a, b) => rank(a.feature) - rank(b.feature));
  return exact[0];
}

export async function fetchFsdf(name, stateCode, getJson) {
  const q = `name:"${String(name).replace(/"/g, '')}" AND authority:${stateCode}`;
  const json = await getJson(`${FSDF_SELECT}?q=${encodeURIComponent(q)}&rows=20`, { headers: FSDF_HEADERS });
  const doc = chooseFsdfDoc(json?.response?.docs, name);
  const loc = doc && parseLocation(doc);
  return loc ? { ...loc, precision: 'locality', source: 'fsdf', source_id: doc.recordId || null, feature: doc.feature || null } : null;
}

export async function fetchNominatim(name, stateName, getJson) {
  const q = `${name}, ${stateName}, Australia`;
  const arr = await getJson(`${NOMINATIM}?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`, { headers: NOMINATIM_HEADERS });
  const hit = Array.isArray(arr) && arr[0];
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), precision: 'locality', source: 'nominatim', source_id: String(hit.place_id), feature: hit.type || null };
}

const daysBetween = (isoDate, now) => (now.getTime() - Date.parse(isoDate)) / 86400000;

export async function resolveMissing(records, cache, { getJson, sleep, now = new Date(), log = () => {} }) {
  const today = now.toISOString().slice(0, 10);
  const todo = new Map();
  for (const r of records) {
    if (r.layer !== 'official' || !r.locality) continue;
    const key = cacheKey(r.admin1_code, r.locality);
    const c = cache[key];
    if (!c || (c.miss && daysBetween(c.resolved_at, now) > MISS_RETRY_DAYS)) todo.set(key, r);
  }
  for (const [key, r] of todo) {
    let hit = null;
    if (r.admin1_code !== 'OT') {
      try { hit = await fetchFsdf(r.locality, r.admin1_code, getJson); } catch (err) { log(`fsdf ${key}: ${err.message}`); }
    }
    if (!hit) {
      await sleep(1100);
      const stateName = r.admin1_code === 'OT' ? 'Jervis Bay Territory' : r.admin1;
      try { hit = await fetchNominatim(r.locality, stateName, getJson); } catch (err) { log(`nominatim ${key}: ${err.message}`); }
    }
    cache[key] = hit ? { ...hit, resolved_at: today } : { miss: true, resolved_at: today };
    log(`${hit ? 'placed' : 'MISS'} ${key}${hit ? ` via ${hit.source} (${hit.feature || 'n/a'})` : ''}`);
  }
  return cache;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function placeRecords(records, cache, stateCentroids) {
  const out = records.map((r) => ({ ...r }));
  const official = out.filter((r) => r.layer === 'official');
  for (const r of official) {
    const c = cache[cacheKey(r.admin1_code, r.locality)];
    if (c && !c.miss) { r.lat = c.lat; r.lng = c.lng; r.precision = 'locality'; r.level = 'locality'; r.placement_source = c.source; }
  }
  const byLga = new Map();
  for (const r of official) {
    if (r.precision !== 'locality') continue;
    const k = `${r.admin1_code}|${normaliseName(r.lga)}`;
    if (!byLga.has(k)) byLga.set(k, []);
    byLga.get(k).push(r);
  }
  for (const r of official) {
    if (r.precision) continue;
    const g = byLga.get(`${r.admin1_code}|${normaliseName(r.lga)}`);
    if (g?.length) { r.lat = mean(g.map((x) => x.lat)); r.lng = mean(g.map((x) => x.lng)); r.precision = 'lga'; r.level = 'lga'; r.placement_source = 'lga-mean'; }
  }
  for (const r of official) {
    if (r.precision) continue;
    const c = stateCentroids[r.admin1];
    if (c) { r.lat = c.lat; r.lng = c.lng; r.precision = 'state'; r.level = 'admin1'; r.placement_source = 'state-centroid'; }
  }
  const stats = { locality: 0, lga: 0, state: 0, unplaced: 0 };
  for (const r of official) { if (r.precision) stats[r.precision]++; else stats.unplaced++; }
  return { records: out, stats };
}

export function loadStateCentroids(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  const out = {};
  for (const [name, v] of Object.entries(raw)) {
    out[name] = Array.isArray(v) ? { code: null, lat: v[0], lng: v[1] } : { code: v.code || null, lat: v.lat ?? v.latitude, lng: v.lng ?? v.lon ?? v.longitude };
  }
  out['Other Territories'] = out['Other Territories'] || JBT;
  return out;
}

export function loadCache(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return {}; }
}

export function saveCache(path, cache) {
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
}
```

- [ ] **Step 5: Create the empty cache and run the tests**

Run: `mkdir -p pipeline/geo && echo '{}' > pipeline/geo/au-localities.json && node --test pipeline/test/gazetteer.test.mjs`
Expected: `# pass 5`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/gazetteer.mjs pipeline/lib/http.mjs pipeline/geo/au-localities.json pipeline/test/gazetteer.test.mjs
git commit -m "feat(pipeline): gazetteer placement with stated precision and a committed cache"
```

---

### Task 5: The latest-data page parser

**Files:**
- Create: `pipeline/sources/daff-latest.mjs`
- Test: `pipeline/test/daff-latest.test.mjs`

**Interfaces:**
- Produces: `parseLatestData(html, fetchedAt) -> official_au` with keys `ok, fetched_at, as_at, as_at_text, national_total, hotline_reports, by_jurisdiction, by_jurisdiction_total, source_url, dataset_url`; `collectLatest(getText) -> official_au` (async, fetches with `DAFF_HEADERS`).

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/daff-latest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './harness.test.mjs';
import { parseLatestData } from '../sources/daff-latest.mjs';

const html = fs.readFileSync(fixture('latest-data.html'), 'utf8');

test('parseLatestData reads the national total, the breakdown, the hotline count and the as-at stamp', () => {
  const o = parseLatestData(html, '2026-09-30T09:00:00.000Z');
  assert.equal(o.ok, true);
  assert.equal(o.national_total, 668);
  assert.deepEqual(o.by_jurisdiction, { WA: 10, SA: 321, NSW: 68, QLD: 2, VIC: 221, TAS: 45, OT: 1 });
  assert.equal(o.by_jurisdiction_total, 668);
  assert.equal(o.hotline_reports, 54551);
  assert.equal(o.as_at, '2026-09-29T16:00:00+10:00');
  assert.equal(o.as_at_text, '4pm AEST, 29 September 2026');
  assert.equal(o.fetched_at, '2026-09-30T09:00:00.000Z');
  assert.match(o.source_url, /latest-data$/);
  assert.match(o.dataset_url, /H5_bird_flu_events\.xlsx$/);
});

test('a restructured page yields ok:false and nulls, never a stale number', () => {
  const o = parseLatestData('<html><body><p>Nothing here</p></body></html>', '2026-09-30T09:00:00.000Z');
  assert.equal(o.ok, false);
  assert.equal(o.national_total, null);
  assert.deepEqual(o.by_jurisdiction, {});
  assert.equal(o.as_at, null);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/daff-latest.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the parser**

```js
// pipeline/sources/daff-latest.mjs
// The Commonwealth's "Latest data" page: national total, per-jurisdiction
// counts, hotline reports and the "As of" stamp. Prose, not a dataset, so it
// feeds figures and never map points.
import { LATEST_URL, DATASET_URL, DAFF_HEADERS, JURISDICTIONS, textOf, num, toIsoDate } from '../lib/daff.mjs';

const ZONES = { AEST: '+10:00', AEDT: '+11:00', ACST: '+09:30', ACDT: '+10:30', AWST: '+08:00' };

export function parseAsAt(clock, zone, dateText) {
  const iso = toIsoDate(dateText);
  const m = String(clock).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/);
  const off = ZONES[String(zone).toUpperCase()];
  if (!iso || !m || !off) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'p') h += 12;
  return `${iso}T${String(h).padStart(2, '0')}:${m[2] || '00'}:00${off}`;
}

export function parseLatestData(html, fetchedAt) {
  const t = textOf(html);
  const total = t.match(/Australia has ([\d,]+) confirmed events/i);
  const asAt = t.match(/As of (\d{1,2}(?::\d{2})?\s*[ap]m) (AEST|AEDT|ACST|ACDT|AWST),?\s*(\d{1,2} [A-Za-z]+ \d{4})/i);
  const hotline = t.match(/([\d,]+)\s+Hotline reports/i);
  const by = {};
  for (const [name, code] of Object.values(JURISDICTIONS)) {
    const m = t.match(new RegExp(`(\\d[\\d,]*) in ${name}\\b`, 'i'));
    if (m) by[code] = num(m[1]);
  }
  const byTotal = Object.values(by).reduce((a, b) => a + b, 0);
  return {
    ok: Boolean(total),
    fetched_at: fetchedAt,
    as_at: asAt ? parseAsAt(asAt[1], asAt[2], asAt[3]) : null,
    as_at_text: asAt ? `${asAt[1].replace(/\s+/g, '')} ${asAt[2].toUpperCase()}, ${asAt[3]}` : null,
    national_total: total ? num(total[1]) : null,
    hotline_reports: hotline ? num(hotline[1]) : null,
    by_jurisdiction: by,
    by_jurisdiction_total: byTotal,
    source_url: LATEST_URL,
    dataset_url: DATASET_URL,
  };
}

export async function collectLatest(getText) {
  const html = await getText(LATEST_URL, { headers: DAFF_HEADERS, timeoutMs: 30000 });
  return parseLatestData(html, new Date().toISOString());
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test pipeline/test/daff-latest.test.mjs`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/sources/daff-latest.mjs pipeline/test/daff-latest.test.mjs
git commit -m "feat(pipeline): parse the DAFF latest-data page into official_au"
```

---

### Task 6: The CVO statements parser (official series and milestones)

**Files:**
- Create: `pipeline/sources/daff-updates.mjs`
- Test: `pipeline/test/daff-updates.test.mjs`

**Interfaces:**
- Produces: `parseUpdates(nodeJson) -> { series: [{date,total,url}] ascending by date and deduplicated by date keeping the largest total, milestones: [{date,text,url}] ascending, changed: "YYYY-MM-DD" | null }`; `collectUpdates(getJson) -> same` (async).

Facts about the page on 30 September 2026, verified: the node's `body[0].value` holds 33 statement blocks separated by `<hr>`; every block except the newest starts with `<p id="28-august"><strong>28 August 2026</strong></p>` (the id is the anchor); the newest block has no date and the node's `changed` value (`2026-09-11T08:42:36+00:00`) is its date. The running total "There have now been N confirmed or presumed positive detections" was last published on 10 August 2026 (231); later statements carry milestones without a total.

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/daff-updates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './harness.test.mjs';
import { parseUpdates } from '../sources/daff-updates.mjs';

const node = JSON.parse(fs.readFileSync(fixture('H5-bird-flu-updates.json'), 'utf8'));

test('the official series is dated by each statement block, not by the page', () => {
  const { series, changed } = parseUpdates(node);
  assert.equal(changed, '2026-09-11');
  const byDate = Object.fromEntries(series.map((p) => [p.date, p.total]));
  assert.equal(byDate['2026-08-10'], 231);
  assert.equal(byDate['2026-08-09'], 220);
  assert.equal(byDate['2026-08-08'], 215, 'two statements on 8 August: the larger total wins');
  assert.equal(byDate['2026-08-07'], 175);
  assert.equal(byDate['2026-09-11'], undefined, 'the newest statement carries no running total');
  assert.ok(series.length >= 15);
  for (let i = 1; i < series.length; i++) assert.ok(series[i].date > series[i - 1].date, 'ascending');
  assert.match(series.find((p) => p.total === 220).url, /#9-august$/);
});

test('milestones are the first-detection sentences with their statement date and anchor', () => {
  const { milestones } = parseUpdates(node);
  const text = (m) => m.text;
  const jbt = milestones.find((m) => /Jervis Bay/.test(text(m)));
  assert.equal(jbt.date, '2026-09-11');
  assert.equal(jbt.url, 'https://www.agriculture.gov.au/about/news/H5-bird-flu-updates');
  const mammal = milestones.find((m) => /mammal species/.test(text(m)));
  assert.equal(mammal.date, '2026-08-23');
  assert.match(mammal.url, /#23-august$/);
  const tas = milestones.find((m) => /Tasmania/.test(text(m)));
  assert.equal(tas.date, '2026-08-14');
  for (const m of milestones) assert.match(m.text, /^First detection of H5 bird flu in /);
  for (let i = 1; i < milestones.length; i++) assert.ok(milestones[i].date >= milestones[i - 1].date);
});

test('an empty node yields empty arrays', () => {
  assert.deepEqual(parseUpdates({}), { series: [], milestones: [], changed: null });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/daff-updates.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the parser**

```js
// pipeline/sources/daff-updates.mjs
// Dated statements from the Australian Chief Veterinary Officer. Two things are
// extracted, each with the date and anchor of the statement that said it: the
// running total ("There have now been N ...") and the firsts ("This is the first
// detection of H5 bird flu in X"). Nothing here becomes a map point.
import { UPDATES_URL, UPDATES_JSON_URL, DAFF_HEADERS, textOf, num, toIsoDate } from '../lib/daff.mjs';

const DATE_HEADING = /<p[^>]*\bid="([^"]+)"[^>]*>\s*<strong>\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*<\/strong>\s*<\/p>/i;
const TOTAL = /There have now been ([\d,]+) confirmed or presumed positive detections/gi;
const FIRST = /This (?:is|marks) the first (?:confirmed |presumed )?detection of H5 bird flu in ([^.]+?)\./gi;

export function parseUpdates(node, { pageUrl = UPDATES_URL } = {}) {
  const body = node?.body?.[0]?.value || '';
  const changed = node?.changed?.[0]?.value ? String(node.changed[0].value).slice(0, 10) : null;
  if (!body) return { series: [], milestones: [], changed };

  const byDate = new Map();
  const milestones = [];
  for (const block of body.split(/<hr\s*\/?>/i)) {
    const heading = block.match(DATE_HEADING);
    const date = heading ? toIsoDate(heading[2]) : changed;
    if (!date) continue;
    const url = heading ? `${pageUrl}#${heading[1]}` : pageUrl;
    const text = textOf(block);
    for (const m of text.matchAll(TOTAL)) {
      const total = num(m[1]);
      const prev = byDate.get(date);
      if (!prev || total > prev.total) byDate.set(date, { date, total, url });
    }
    for (const m of text.matchAll(FIRST)) {
      milestones.push({ date, text: `First detection of H5 bird flu in ${m[1].trim()}`, url });
    }
  }
  const series = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { series, milestones, changed };
}

export async function collectUpdates(getJson) {
  const node = await getJson(UPDATES_JSON_URL, { headers: DAFF_HEADERS, timeoutMs: 30000 });
  return parseUpdates(node);
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test pipeline/test/daff-updates.test.mjs`
Expected: `# pass 3`. If `byDate['2026-08-10']` is not 231, print the block that contains "231" from the fixture and fix the regexes, never the expected value.

- [ ] **Step 5: Commit**

```bash
git add pipeline/sources/daff-updates.mjs pipeline/test/daff-updates.test.mjs
git commit -m "feat(pipeline): official series and milestones from the CVO statements"
```

---

### Task 7: Wire the backbone into the build

**Files:**
- Modify: `pipeline/lib/schema.mjs` (`makeRecord` passthrough)
- Modify: `pipeline/sources/daff-events.mjs` (append the collector)
- Modify: `pipeline/sources/index.mjs` (register `daff-events`; set `layer: 'woah'` on `fao-au`)
- Create: `pipeline/lib/summary-au.mjs`
- Modify: `pipeline/build.mjs`
- Modify: `pipeline/au-status.json`, `pipeline/curated.json`
- Test: `pipeline/test/summary-au.test.mjs`

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces (exact shapes, consumed by streams B and E):

```jsonc
"freshness": {
  "generated_at": "2026-10-01T09:45:12.000Z",
  "run_host": "mac",                    // mac | github | vercel | unknown
  "dataset_date": "2026-09-29",         // sheet name date, or null
  "as_at": "2026-09-29T16:00:00+10:00", // official_au.as_at, or null
  "sources": { "daff-events": { "status": "ok", "fetched_at": "...", "records": 668, "note": "..." },
               "daff-latest": { "status": "ok", ... }, "daff-updates": { ... }, "fao-au": { ... }, "fao-world": { ... }, "us-wild-birds": { ... } }
},
"official_au": { /* Task 5 shape, plus */ "dataset_rows": 668, "dataset_matches_total": true },
"official_series": [ { "date": "2026-07-01", "total": 12, "url": "..." } ],
"milestones": [ { "date": "2026-08-14", "text": "First detection of H5 bird flu in Tasmania", "url": "..." } ],
"placement_stats": { "locality": 640, "lga": 20, "state": 8, "unplaced": 0 },
"au_layers": {
  "official": { "records": 668, "current_era": 668, "withdrawn": 0, "jurisdictions": 7,
                "jurisdiction_list": ["South Australia", "Victoria", "New South Wales", "Tasmania", "Western Australia", "Queensland", "Other Territories"],
                "latest_sampled": "2026-09-26", "latest_sampled_locality": "Parkdale, VIC",
                "species_top": [ { "name": "Greater Crested Tern", "count": 500 } ] },
  "woah": { "records": 393, "latest": "2026-09-22" }
}
```

- [ ] **Step 1: Write the failing tests for the pure builders**

```js
// pipeline/test/summary-au.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuLayers, buildFreshness, restoreLayer, detectRunHost } from '../lib/summary-au.mjs';

const off = (over) => ({ layer: 'official', country_code: 'AU', era_current: true, admin1: 'South Australia', admin1_code: 'SA', date: '2026-09-01', date_basis: 'sampled', locality: 'Robe', species: 'Greater Crested Tern', ...over });
const woah = (over) => ({ layer: 'woah', country_code: 'AU', era_current: true, date: '2026-09-01', ...over });

test('buildAuLayers counts each layer on its own basis', () => {
  const records = [
    off({ id: 'a' }), off({ id: 'b', admin1: 'Victoria', admin1_code: 'VIC', date: '2026-09-26', locality: 'Parkdale' }),
    off({ id: 'c', species: 'Silver Gull', date: '2026-08-01' }), off({ id: 'd', withdrawn: '2026-09-20' }),
    off({ id: 'e', era_current: false, date: '2025-01-01' }),
    woah({ id: 'w1' }), woah({ id: 'w2', date: '2026-09-22' }),
    { id: 'x', layer: 'woah', country_code: 'US', era_current: true, date: '2026-09-29' },
  ];
  const l = buildAuLayers(records);
  assert.equal(l.official.records, 3);
  assert.equal(l.official.current_era, 3);
  assert.equal(l.official.withdrawn, 1);
  assert.equal(l.official.jurisdictions, 2);
  assert.deepEqual(l.official.jurisdiction_list, ['South Australia', 'Victoria']);
  assert.equal(l.official.latest_sampled, '2026-09-26');
  assert.equal(l.official.latest_sampled_locality, 'Parkdale, VIC');
  assert.deepEqual(l.official.species_top, [{ name: 'Greater Crested Tern', count: 2 }, { name: 'Silver Gull', count: 1 }]);
  assert.deepEqual(l.woah, { records: 2, latest: '2026-09-22' });
});

test('buildFreshness records every source and the dataset dates', () => {
  const f = buildFreshness({
    now: new Date('2026-10-01T09:45:12Z'), runHost: 'mac', datasetDate: '2026-09-29', asAt: '2026-09-29T16:00:00+10:00',
    sources: [{ key: 'daff-events', status: 'ok', records: 668, note: 'n', fetched_at: '2026-10-01T09:44:00Z' }, { key: 'fao-au', status: 'error', records: 0, note: 'HTTP 502', fetched_at: null }],
  });
  assert.equal(f.generated_at, '2026-10-01T09:45:12.000Z');
  assert.equal(f.run_host, 'mac');
  assert.equal(f.sources['daff-events'].status, 'ok');
  assert.equal(f.sources['fao-au'].status, 'error');
  assert.equal(f.sources['fao-au'].note, 'HTTP 502');
});

test('detectRunHost reads the environment', () => {
  assert.equal(detectRunHost({ GITHUB_ACTIONS: 'true' }), 'github');
  assert.equal(detectRunHost({ VERCEL: '1' }), 'vercel');
  assert.equal(detectRunHost({ H5_RUN_HOST: 'mac' }), 'mac');
  assert.equal(detectRunHost({}), 'unknown');
});

test('restoreLayer puts the previous layer back when the live one is empty, and marks it', () => {
  const previous = [off({ id: 'a' }), woah({ id: 'w' })];
  const live = [woah({ id: 'w2' })];
  const { records, restored } = restoreLayer(live, previous, 'official');
  assert.equal(restored, 1);
  assert.equal(records.filter((r) => r.layer === 'official').length, 1);
  assert.equal(records.find((r) => r.layer === 'official').restored, true);
  const none = restoreLayer([off({ id: 'b' })], previous, 'official');
  assert.equal(none.restored, 0);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/summary-au.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the pure builders**

```js
// pipeline/lib/summary-au.mjs
// Pure builders for the Australian blocks of summary.json. Each layer is
// counted on its own basis; nothing here adds an official record to a WOAH one.

export function buildAuLayers(records) {
  const au = records.filter((r) => r.country_code === 'AU');
  const official = au.filter((r) => r.layer === 'official' && !r.withdrawn);
  const withdrawn = au.filter((r) => r.layer === 'official' && r.withdrawn).length;
  const current = official.filter((r) => r.era_current);
  const byJur = new Map();
  for (const r of official) byJur.set(r.admin1, (byJur.get(r.admin1) || 0) + 1);
  const jurisdictionList = [...byJur.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const sampled = official.filter((r) => r.date_basis === 'sampled').sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sampled[0] || null;
  const bySpecies = new Map();
  for (const r of official) bySpecies.set(r.species, (bySpecies.get(r.species) || 0) + 1);
  const speciesTop = [...bySpecies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const woah = au.filter((r) => r.layer === 'woah' && r.era_current);
  const woahLatest = woah.map((r) => r.date).sort().at(-1) || null;
  return {
    official: {
      records: official.length,
      current_era: current.length,
      withdrawn,
      jurisdictions: jurisdictionList.length,
      jurisdiction_list: jurisdictionList,
      latest_sampled: latest ? latest.date : null,
      latest_sampled_locality: latest ? `${latest.locality}, ${latest.admin1_code}` : null,
      species_top: speciesTop,
    },
    woah: { records: woah.length, latest: woahLatest },
  };
}

export function detectRunHost(env = process.env) {
  if (env.H5_RUN_HOST) return env.H5_RUN_HOST;
  if (env.GITHUB_ACTIONS) return 'github';
  if (env.VERCEL) return 'vercel';
  return 'unknown';
}

export function buildFreshness({ now = new Date(), runHost, datasetDate = null, asAt = null, sources = [] }) {
  const out = {};
  for (const s of sources) {
    out[s.key] = { status: s.status, fetched_at: s.fetched_at || null, records: s.records || 0, note: s.note || null };
  }
  return { generated_at: now.toISOString(), run_host: runHost, dataset_date: datasetDate, as_at: asAt, sources: out };
}

export function buildPlacementStats(stats) {
  return { locality: stats.locality || 0, lga: stats.lga || 0, state: stats.state || 0, unplaced: stats.unplaced || 0 };
}

// If a layer produced nothing this run, put the previous committed copy of that
// layer back, flagged. Other layers are untouched: a DAFF outage must not erase
// the FAO layer and a FAO outage must not erase the official one.
export function restoreLayer(live, previous, layer) {
  if (live.some((r) => r.layer === layer)) return { records: live, restored: 0 };
  const back = previous.filter((r) => r.layer === layer).map((r) => ({ ...r, restored: true }));
  return { records: [...live, ...back], restored: back.length };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test pipeline/test/summary-au.test.mjs`
Expected: `# pass 4`.

- [ ] **Step 5: Let `makeRecord` pass the new fields through**

Read `pipeline/lib/schema.mjs` around `makeRecord` (line 59 onwards). In the returned object, after the existing fields, add the passthrough block, keeping every existing field as it is:

```js
    // Official-dataset and placement fields (spec 3.2, 3.3). Present only when the
    // source supplies them; the front end reads `layer` to separate the bases.
    ...passthrough(raw, ['layer', 'record_id', 'record_class', 'lga', 'locality', 'precision', 'date_basis',
      'first_seen', 'withdrawn', 'species_scientific', 'species_class', 'admin1_note', 'dataset_url',
      'placement_source', 'restored']),
```

and above `makeRecord` add:

```js
function passthrough(raw, keys) {
  const out = {};
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
  return out;
}
```

Confirm `makeRecord` uses the supplied `country`, `admin1`, `admin1_code`, `lat`, `lng`, `level` when present rather than deriving them from coordinates (read the `place` helper it calls). If it derives `admin1` from coordinates for Australian records, make the supplied `admin1` win: a DAFF record's jurisdiction is authoritative, a state centroid placement is not.

Run: `npm test`
Expected: everything still passes.

- [ ] **Step 6: Append the collector to `daff-events.mjs`**

```js
// ---- collector -------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFirstSheet } from '../lib/xlsx.mjs';
import { getBuffer, getJson } from '../lib/http.mjs';
import { DAFF_HEADERS } from '../lib/daff.mjs';
import { loadCache, saveCache, resolveMissing, placeRecords, loadStateCentroids } from '../lib/gazetteer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_PATH = path.join(ROOT, 'pipeline', 'geo', 'au-localities.json');
const MAMMALS_PATH = path.join(ROOT, 'pipeline', 'species', 'mammals.json');
const CENTROIDS_PATH = path.join(ROOT, 'site', 'assets', 'au-states-centroids.json');
const PREVIOUS_PATH = path.join(ROOT, 'site', 'data', 'detections', 'au.json');

export function readPreviousOfficial() {
  try {
    const all = JSON.parse(fs.readFileSync(PREVIOUS_PATH, 'utf8'));
    return (Array.isArray(all) ? all : all.records || []).filter((r) => r.layer === 'official');
  } catch { return []; }
}

export function daffEventsSource({ key = 'daff-events', log = () => {} } = {}) {
  return {
    key,
    name: 'DAFF: H5 bird flu events dataset',
    region: 'Australia',
    homepage: LATEST_URL,
    async collect() {
      const bytes = await getBuffer(DATASET_URL, { headers: DAFF_HEADERS, timeoutMs: 30000 });
      const sheet = readFirstSheet(bytes);
      const today = new Date().toISOString().slice(0, 10);
      const datasetDate = parseDatasetDate(sheet.sheetName) || today;
      const mammals = JSON.parse(fs.readFileSync(MAMMALS_PATH, 'utf8'));
      const previous = readPreviousOfficial();
      const parsed = parseDaffEvents(sheet, { previous, datasetDate, mammals, today });
      for (const w of parsed.warnings) log(`daff-events warning: ${w}`);

      const cache = loadCache(CACHE_PATH);
      await resolveMissing(parsed.records, cache, { getJson, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: (m) => log(`gazetteer: ${m}`) });
      saveCache(CACHE_PATH, cache);
      const placed = placeRecords([...parsed.records, ...parsed.withdrawn], cache, loadStateCentroids(CENTROIDS_PATH));

      return {
        records: placed.records,
        note: `daff events sheet "${sheet.sheetName}": ${parsed.stats.rows} rows -> ${parsed.stats.records} records, ${parsed.stats.withdrawn} withdrawn; placed ${placed.stats.locality} locality / ${placed.stats.lga} lga / ${placed.stats.state} state / ${placed.stats.unplaced} unplaced`,
        meta: { datasetDate, placement: placed.stats, warnings: parsed.warnings },
      };
    },
  };
}
```

`LATEST_URL`, `DATASET_URL`, `parseDatasetDate` and `parseDaffEvents` are already in this module's scope.

- [ ] **Step 7: Register the source and label the FAO layer**

In `pipeline/sources/index.mjs`, import `daffEventsSource` and add it FIRST in `SOURCES`:

```js
import { daffEventsSource } from './daff-events.mjs';
// ...
export const SOURCES = [
  daffEventsSource({ key: 'daff-events', log: (m) => console.log(`[build] ${m}`) }),
  faoSource({ key: 'fao-au', name: 'FAO EMPRES-i+: Australia (WOAH/WAHIS)', region: 'Australia', country: 'Australia', startDate: '2024-01-01', layer: 'woah' }),
  // fao-world and us-wild-birds unchanged
];
```

In `pipeline/sources/fao-empresi.mjs`, accept `cfg.layer` and set `layer: cfg.layer` on every raw record it builds (only `fao-au` passes it; world records carry no layer). Update the header comment of `index.mjs` to name `daff-events` as the Australian backbone and `fao-au` as the WOAH notification layer.

- [ ] **Step 8: Wire `build.mjs`**

Read `pipeline/build.mjs` end to end first. Make these changes, keeping every existing log line that stream E's plan and the docs rely on (`[build] feed:`, `eras:`, `history:`, `sources live:`):

1. At the top, before anything fetches:

```js
if (process.argv.includes('--verify')) {
  const { verifyData } = await import('./verify.mjs');
  const { ok, problems } = verifyData(new URL('../site/data/', import.meta.url));
  for (const p of problems) console.log(`[verify] ${p}`);
  console.log(`[verify] ${ok ? 'OK' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}
```

(`verify.mjs` is written in Task 8; until then this import fails, which is fine because nothing calls `--verify` before Task 8.)

2. Where the source results are collected (the loop that logs `OK <key>`), also keep `result.meta` and a `fetched_at` timestamp on each result.

3. Replace the whole-layer Australian restore (the block that sets `status: 'restored_from_last_good'`) with two per-layer calls, reading the previous committed `site/data/detections/au.json` once:

```js
import { buildAuLayers, buildFreshness, buildPlacementStats, restoreLayer, detectRunHost } from './lib/summary-au.mjs';
// ...
const previousAu = readPreviousAu();   // the existing "last good" reader, or JSON.parse of site/data/detections/au.json
let auRecords = liveRecords.filter((r) => r.country_code === 'AU');
const restoredOfficial = restoreLayer(auRecords, previousAu, 'official');
const restoredWoah = restoreLayer(restoredOfficial.records, previousAu, 'woah');
auRecords = restoredWoah.records;
log(`restore: official ${restoredOfficial.restored} record(s), woah ${restoredWoah.restored} record(s)`);
```

Keep `data_coverage.australia` but compute it from the official layer: `status` is `live` when `restoredOfficial.restored === 0`, otherwise `restored_from_last_good`, with the existing note text.

4. Replace the old `au official` block (the calls into `pipeline/sources/au-official.mjs`, the `official_au` and `official_gap` summary keys) with:

```js
import { collectLatest } from './sources/daff-latest.mjs';
import { collectUpdates } from './sources/daff-updates.mjs';
import { getText, getJson } from './lib/http.mjs';
// ...
let official = null; let updates = { series: [], milestones: [], changed: null };
const daffStatus = { 'daff-latest': { status: 'ok', fetched_at: null, note: null }, 'daff-updates': { status: 'ok', fetched_at: null, note: null } };
try { official = await collectLatest(getText); daffStatus['daff-latest'].fetched_at = official.fetched_at; if (!official.ok) { daffStatus['daff-latest'] = { status: 'error', fetched_at: official.fetched_at, note: 'page parsed but no national total found' }; } }
catch (err) { daffStatus['daff-latest'] = { status: 'error', fetched_at: null, note: err.message }; }
try { updates = await collectUpdates(getJson); daffStatus['daff-updates'].fetched_at = new Date().toISOString(); }
catch (err) { daffStatus['daff-updates'] = { status: 'error', fetched_at: null, note: err.message }; }
if (!official || !official.ok) {
  const prev = readPreviousSummary();   // JSON.parse of site/data/summary.json, {} on failure
  if (prev.official_au?.ok) { official = { ...prev.official_au, restored: true }; log(`au official: fetch failed, reusing last good as at ${official.as_at}`); }
}
if (official) {
  const rows = allRecords.filter((r) => r.layer === 'official' && !r.withdrawn).length;
  official.dataset_rows = rows;
  official.dataset_matches_total = official.national_total === rows;
  if (!official.dataset_matches_total) log(`au official: dataset rows ${rows} != national total ${official.national_total} (both published)`);
}
log(`au official: total ${official?.national_total ?? 'n/a'} as at ${official?.as_at ?? 'n/a'}, series ${updates.series.length}, milestones ${updates.milestones.length}`);
```

Delete `pipeline/sources/au-official.mjs` and `pipeline/sources/au-news-signal.mjs` only if `build.mjs` no longer imports them after this change; the news signal stays (spec 3.1), so keep that file and its call.

5. Build the new summary blocks and put them in `summary`:

```js
const daffEventsResult = results.find((r) => r.key === 'daff-events');
const placementStats = buildPlacementStats(daffEventsResult?.meta?.placement || { unplaced: allRecords.filter((r) => r.layer === 'official' && r.lat == null).length });
summary.freshness = buildFreshness({
  runHost: detectRunHost(),
  datasetDate: daffEventsResult?.meta?.datasetDate || null,
  asAt: official?.as_at || null,
  sources: [
    ...results.map((r) => ({ key: r.key, status: r.status === 'ok' || r.status === 'live' ? 'ok' : 'error', records: r.records?.length ?? r.records ?? 0, note: r.note, fetched_at: r.fetched_at })),
    { key: 'daff-latest', records: official?.national_total ?? 0, ...daffStatus['daff-latest'] },
    { key: 'daff-updates', records: updates.series.length, ...daffStatus['daff-updates'] },
  ],
});
if (restoredOfficial.restored) summary.freshness.sources['daff-events'] = { ...summary.freshness.sources['daff-events'], status: 'restored' };
summary.official_au = official;
summary.official_series = updates.series;
summary.milestones = updates.milestones;
summary.placement_stats = placementStats;
summary.au_layers = buildAuLayers(allRecords);
```

Use the real variable names in `build.mjs` for `results`, `allRecords` and `summary`; the intent is fixed, the names are whatever the file already uses. Remove `official_gap` from the summary (its job is done by `au_layers` plus `official_au`, and the front end of stream B does not read it).

6. Make the existing `au` block count the official layer only (`records.filter(r => r.country_code === 'AU' && r.layer === 'official' && !r.withdrawn)`), so `au.current_era_detections`, `au.h5n1_detections` and the state lists describe the official basis. The history generator keeps working from it.

7. In the history generator (`buildHistory`), replace the hand-written first-of-state entries with one generated entry per milestone from `updates.milestones` (title = milestone text, `sort_date` = milestone date, citation = milestone url, `certainty: "established"`).

8. `au-status.json`: replace its content with only these keys, keeping the current values and sources for each: `human_risk`, `human_risk_note`, `human_risk_source_url` (use the Australian CDC link from `authorities`), `human_risk_date: "2026-08-01"`, `local_transmission` (unchanged object), `report`, `authorities`, and add `"review_by": "2026-10-31"`. In `build.mjs`, where the status file is read, add:

```js
if (status.review_by && status.review_by < new Date().toISOString().slice(0, 10)) log(`WARN au-status.json review_by ${status.review_by} has passed; review its facts`);
```

The `headline`, `summary`, `first_detection`, `poultry_note` and `caveats` keys are removed here; their content becomes static copy on `/about` (stream B reads this plan's commit and lifts the text).

9. `curated.json`: delete every Australian record whose `category` is not `human` (the Moreton Island and Portland wild-bird records). Keep the human cases.

- [ ] **Step 9: Run the build from the Mac and read the log**

Run: `H5_RUN_HOST=mac node pipeline/build.mjs 2>&1 | grep -E "^\[build\]" | cut -c1-200`
Expected lines (numbers move with the live data): `OK  daff-events: 668 records (... placed N locality / N lga / N state / 0 unplaced)`, `gazetteer: placed SA|port elliot via fsdf (LOCALITY)` for the first run (336 lookups, allow a few minutes at Nominatim's one-per-second pace), `restore: official 0 record(s), woah 0 record(s)`, `eras: au_h5n1_2026=` at least 668 plus the WOAH count, `au official: total 668 as at 2026-09-29T16:00:00+10:00, series 20+, milestones 5+`, no `WARN`, no `unclassified`.

Then: `node -e 'const s=require("./site/data/summary.json");console.log(JSON.stringify({f:s.freshness.sources,o:[s.official_au.national_total,s.official_au.dataset_matches_total],p:s.placement_stats,l:s.au_layers},null,1))'`
Expected: every source `ok`, `dataset_matches_total: true`, `unplaced: 0`, `au_layers.official.records: 668`, `au_layers.woah.records` about 393.

Acceptance for placement (spec 3.3): `placement_stats.locality / 668 >= 0.9`. If lower, list the misses (`grep -n '"miss": true' pipeline/geo/au-localities.json`), and for each, check whether a spelling normalisation (for example an apostrophe or "Mt") would have matched; fix `normaliseName`, delete those miss entries from the cache and re-run. Do not hand-type coordinates into the cache.

- [ ] **Step 10: Run every test and commit**

Run: `npm test`
Expected: all passing.

```bash
git add pipeline/lib/schema.mjs pipeline/sources/daff-events.mjs pipeline/sources/index.mjs pipeline/sources/fao-empresi.mjs pipeline/lib/summary-au.mjs pipeline/build.mjs pipeline/au-status.json pipeline/curated.json pipeline/geo/au-localities.json pipeline/test/summary-au.test.mjs site/data/
git commit -m "feat(pipeline): official DAFF dataset becomes the Australian backbone; per-layer restore; freshness, series, milestones, placement in summary.json"
```

---

### Task 8: `--verify` mode

**Files:**
- Create: `pipeline/verify.mjs`
- Test: `pipeline/test/verify.test.mjs`

**Interfaces:**
- Produces: `verifyData(dirUrl) -> { ok: boolean, problems: string[] }`; `node pipeline/build.mjs --verify` (wired in Task 7) exits 0 or 1 and fetches nothing.

- [ ] **Step 1: Write the failing tests**

```js
// pipeline/test/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyData } from '../verify.mjs';

const DATA = new URL('../../site/data/', import.meta.url);

function copyData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h5-verify-'));
  fs.cpSync(DATA, dir, { recursive: true });
  return dir;
}

test('the committed data verifies', () => {
  const { ok, problems } = verifyData(DATA);
  assert.deepEqual(problems, []);
  assert.equal(ok, true);
});

test('a missing freshness block fails', () => {
  const dir = copyData();
  const p = path.join(dir, 'summary.json');
  const s = JSON.parse(fs.readFileSync(p, 'utf8')); delete s.freshness; fs.writeFileSync(p, JSON.stringify(s));
  const { ok, problems } = verifyData(pathToFileURL(dir + '/'));
  assert.equal(ok, false);
  assert.ok(problems.some((x) => x.includes('freshness')));
});

test('an official record without coordinates or precision fails', () => {
  const dir = copyData();
  const p = path.join(dir, 'detections', 'au.json');
  const au = JSON.parse(fs.readFileSync(p, 'utf8'));
  const list = Array.isArray(au) ? au : au.records;
  const r = list.find((x) => x.layer === 'official'); r.lat = null; r.precision = null;
  fs.writeFileSync(p, JSON.stringify(au));
  const { ok, problems } = verifyData(pathToFileURL(dir + '/'));
  assert.equal(ok, false);
  assert.ok(problems.some((x) => x.includes(r.id)));
});

test('unplaced records in placement_stats fail', () => {
  const dir = copyData();
  const p = path.join(dir, 'summary.json');
  const s = JSON.parse(fs.readFileSync(p, 'utf8')); s.placement_stats.unplaced = 3; fs.writeFileSync(p, JSON.stringify(s));
  assert.equal(verifyData(pathToFileURL(dir + '/')).ok, false);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test pipeline/test/verify.test.mjs`
Expected: fails on the missing module.

- [ ] **Step 3: Write the verifier**

```js
// pipeline/verify.mjs
// Validates the committed site/data/** without touching the network. This is
// what Vercel runs at build time, so a deploy can never regress data: either
// the committed data is sound and is served exactly, or the deploy fails.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_SUMMARY = ['generated_at', 'mode', 'data_coverage', 'au', 'eras', 'freshness', 'official_au', 'official_series', 'milestones', 'placement_stats', 'au_layers', 'totals', 'sources'];

function readJson(dir, name, problems) {
  try { return JSON.parse(fs.readFileSync(new URL(name, dir), 'utf8')); }
  catch (err) { problems.push(`${name}: ${err.message}`); return null; }
}

function checkRecord(r, problems, seen) {
  const where = r?.id || '(no id)';
  if (!r?.id || !r.category || !ISO_DATE.test(r.date || '')) problems.push(`${where}: missing id, category or ISO date`);
  if (seen.has(r?.id)) problems.push(`${where}: duplicate id`); else seen.add(r?.id);
  if (typeof r?.lat !== 'number' || typeof r?.lng !== 'number') problems.push(`${where}: lat/lng not numbers`);
  if (r?.layer === 'official') {
    for (const k of ['record_id', 'precision', 'date_basis', 'first_seen', 'species', 'source_url']) if (!r[k]) problems.push(`${where}: official record missing ${k}`);
    if (!['locality', 'lga', 'state'].includes(r.precision)) problems.push(`${where}: bad precision ${r.precision}`);
  }
}

export function verifyData(dir) {
  const problems = [];
  const summary = readJson(dir, 'summary.json', problems);
  if (summary) {
    for (const k of REQUIRED_SUMMARY) if (summary[k] === undefined) problems.push(`summary.json: missing ${k}`);
    if (summary.freshness && Number.isNaN(Date.parse(summary.freshness.generated_at || ''))) problems.push('summary.json: freshness.generated_at unparseable');
    if (summary.placement_stats?.unplaced) problems.push(`summary.json: ${summary.placement_stats.unplaced} unplaced official record(s)`);
    if (summary.official_au && summary.official_au.ok === false && !summary.official_au.restored) problems.push('summary.json: official_au not ok and not restored');
  }
  const seen = new Set();
  let total = 0;
  for (const name of ['detections/au.json', 'detections/us.json', 'detections/row.json']) {
    const data = readJson(dir, name, problems);
    if (!data) continue;
    const list = Array.isArray(data) ? data : data.records || [];
    for (const r of list) checkRecord(r, problems, seen);
    total += list.length;
    if (name === 'detections/au.json' && !list.some((r) => r.layer === 'official')) problems.push('detections/au.json: no official-layer records');
  }
  const index = readJson(dir, 'detections/index.json', problems);
  if (index && typeof index.total === 'number' && index.total !== total) problems.push(`detections/index.json: total ${index.total} != ${total} records in the region files`);
  const history = readJson(dir, 'history.json', problems);
  if (history) {
    if (!Array.isArray(history.entries) || history.entries.length < 25) problems.push('history.json: fewer than 25 entries');
    if (history.counts?.dropped) problems.push(`history.json: ${history.counts.dropped} entries dropped for want of a citation`);
    for (const e of history.entries || []) {
      if (!(e.citations || []).some((c) => /^https?:\/\//.test(c?.url || ''))) problems.push(`history.json: entry ${e.id} has no cited URL`);
    }
  }
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, problems } = verifyData(new URL('../site/data/', import.meta.url));
  for (const p of problems) console.log(`[verify] ${p}`);
  console.log(`[verify] ${ok ? 'OK' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
}
```

- [ ] **Step 4: Run the tests and the mode**

Run: `node --test pipeline/test/verify.test.mjs && node pipeline/build.mjs --verify; echo "exit $?"`
Expected: `# pass 4`, then `[verify] OK`, `exit 0`. Confirm nothing was fetched: `node pipeline/build.mjs --verify` finishes in under two seconds.

- [ ] **Step 5: Commit**

```bash
git add pipeline/verify.mjs pipeline/test/verify.test.mjs
git commit -m "feat(pipeline): --verify validates committed data without network"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/DATA_SOURCES.md`
- Modify: `README.md` (data sources table, architecture diagram, the "no dependencies" line)

- [ ] **Step 1: Rewrite the Sources section of `docs/DATA_SOURCES.md`**

Replace sections 1 to 7 with a table matching spec 3.1 (keys, URLs, role, "fetched from" column), then subsections: "The official dataset" (columns, `#N/A` dates and `first_seen`, record classes WB/WM/FM, jurisdictions incl. Other Territories, withdrawals), "Placement" (the cache, FSDF query with headers, feature ranking, Nominatim fallback, LGA mean, state centroid, precision on every record, the 90 % acceptance floor), "Official totals, series and milestones" (the three bases, why the running total stops at 231 on 10 August 2026, the `dataset_matches_total` assertion), "The WOAH layer" (unchanged FAO behaviour, `layer: "woah"`, never merged), and "Restore" (per layer). Keep the Eras, Confidence and History sections. Replace the "Endpoint probe results" table with the 30 September 2026 results: `latest-data` 200 from home, timeout from cloud; the spreadsheet 200; `?_format=json` 200; FSDF `/select` 403 without `Origin`/`Referer`, 200 with them; the FSDF S3 bucket `AccessDenied` for listing; `data.gov.au/data/api/3/action/package_show` 200 (the CKAN path has `/data/` in it).

- [ ] **Step 2: Rewrite the verification checklist**

Replace the checklist with:

```markdown
## Verification checklist (after a deploy)

1. `curl -s https://www.birdflutracker.org/data/summary.json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d);console.log(s.freshness.generated_at, s.freshness.run_host, JSON.stringify(Object.fromEntries(Object.entries(s.freshness.sources).map(([k,v])=>[k,v.status]))))})'`
   Every source `ok`; `generated_at` within the last day; `run_host` is `mac` on a normal day.
2. `official_au.national_total` equals `au_layers.official.records` (`dataset_matches_total: true`). If not, the department's page and spreadsheet disagree; both are published, note it.
3. `placement_stats.unplaced` is 0 and `locality` is at least 90 % of `au_layers.official.records`.
4. `official_series` ends where the department stopped publishing a running total (10 August 2026, 231) unless a newer statement carries one.
5. `milestones` includes every "first detection" the updates page lists; open two at random and confirm the anchor lands on the statement.
6. Spot-check three official records: open the record id in the spreadsheet and confirm locality, date sampled and species match the drawer.
7. `node pipeline/build.mjs --verify` on the checked-out commit prints `[verify] OK`.
```

- [ ] **Step 3: Update `README.md`**

In "Data sources", replace the table with spec 3.1's rows (DAFF dataset as primary backbone; FAO as WOAH layer and world context; USDA; OWID; curated human cases). Replace `No dependencies to install` with `One dependency (fflate, for the spreadsheet): run npm ci once.` Update the architecture diagram to show `sources/daff-events.mjs` (backbone, with `lib/gazetteer.mjs`), `sources/daff-latest.mjs`, `sources/daff-updates.mjs`, and the note that Vercel runs `--verify` while the nightly Mac job runs the fetch.

- [ ] **Step 4: Check for em dashes and commit**

Run: `grep -c $'\xe2\x80\x94' docs/DATA_SOURCES.md README.md`
Expected: `0` for both.

```bash
git add docs/DATA_SOURCES.md README.md
git commit -m "docs: data sources, placement and verification for the official backbone"
```

---

### Task 10: First real run, acceptance, hand-off

**Files:**
- Modify: `site/data/**`, `pipeline/geo/au-localities.json` (by the run)

- [ ] **Step 1: Full run and test**

Run: `cd ~/dev/h5-bird-flu-tracker && H5_RUN_HOST=mac node pipeline/build.mjs 2>&1 | grep -E "^\[build\] (OK|ERR|restore|au official|eras|history|sources live|WARN)" && npm test && node pipeline/build.mjs --verify`
Expected: every source `OK`, `restore: official 0`, `au official: total 668` (or the department's current figure) with a series and milestones count, `history:` with the milestone entries and `dropped 0`, tests passing, `[verify] OK`.

- [ ] **Step 2: Acceptance numbers, written into the task report**

Run: `node -e 'const s=require("./site/data/summary.json");const o=s.au_layers.official;console.log({official:o.records,jurisdictions:o.jurisdiction_list,latest:o.latest_sampled,woah:s.au_layers.woah,placement:s.placement_stats,pct_locality:(s.placement_stats.locality/o.records).toFixed(3),official_total:s.official_au.national_total,matches:s.official_au.dataset_matches_total,series:s.official_series.length,milestones:s.milestones.map(m=>m.text)})'`
Expected: `pct_locality >= 0.900`, `matches: true`, `milestones` naming Tasmania, a mammal species, a land mammal, the Jervis Bay Territory and the state firsts the page lists.

- [ ] **Step 3: Commit the data and the cache**

```bash
git add site/data pipeline/geo/au-localities.json
git commit -m "data: first build on the official DAFF backbone"
```

Report to the parent: the acceptance numbers, the count of `miss` entries in the cache with their keys, and any `WARN` lines. The parent pushes; stream E then flips Vercel to `--verify` (its Task 5), which must happen before or with this data commit reaching `main`, because until then Vercel's build still runs the fetching pipeline and will fall back (harmlessly) to this committed data.

---

## Self-review

- Spec 3.1 sources table: Tasks 3, 5, 6, 7 (index registration, FAO `layer`). Curated AU animal records deleted: Task 7 step 8 (9). Raw responses saved as fixtures: Task 1.
- Spec 3.2 parsing rules: sheet name date, jurisdiction map with Other Territories note, record classes and the mammal list, `#N/A` to `first_seen`, withdrawals for 30 days: Task 3. Era stamping unchanged and accepting `H5`: verified (`H5_TOKENS` in `era.mjs`).
- Spec 3.3 placement: cache, FSDF query with headers, feature ranking, Nominatim, LGA mean, state centroid including the Jervis Bay Territory, precision as data, 90 % floor, never unplaced (verify fails otherwise): Tasks 4, 7, 8.
- Spec 3.4 totals, series, milestones, `dataset_matches_total`, `au-status.json` shrink with `review_by`: Tasks 5, 6, 7.
- Spec 3.5 WOAH layer separate: Task 7 (`layer: 'woah'`, `buildAuLayers` per layer, no reconciliation between layers).
- Spec 3.6 published files: Task 7 shapes; `withdrawn` records carried in `au.json` and excluded from counts.
- Spec 4.1 `--verify`: Task 8, per-layer restore: Task 7.
- Names are consistent across tasks: `parseDaffEvents`, `daffEventsSource`, `collectLatest`, `collectUpdates`, `placeRecords`, `resolveMissing`, `buildAuLayers`, `buildFreshness`, `restoreLayer`, `detectRunHost`, `verifyData`; summary keys `freshness`, `official_au`, `official_series`, `milestones`, `placement_stats`, `au_layers`; record fields `layer`, `record_id`, `precision`, `date_basis`, `first_seen`, `withdrawn`.
- Known dependency on reading `build.mjs`'s real variable names in Task 7 step 8: the intent and code are given; the executor substitutes the file's own identifiers for `results`, `allRecords`, `summary`, `liveRecords`, `readPreviousAu`, `readPreviousSummary`, creating the two small readers if they do not exist (`JSON.parse(fs.readFileSync(...))` in a try/catch returning `[]` and `{}`).
