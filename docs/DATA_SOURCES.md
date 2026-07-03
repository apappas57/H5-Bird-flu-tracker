# Data sources & verification

This tracker aggregates **official** H5N1 detections into one normalized schema. This doc explains
how each source is fetched and — importantly — the one-time checklist to run after the first live
deploy, because the automated scrapers can only be exercised from an environment with outbound
access to the agency websites (i.e. GitHub Actions, **not** a restricted dev sandbox).

## How fetching works

Each entry in `pipeline/sources/index.mjs` points at an authoritative **landing page**. The generic
collector (`pipeline/sources/generic.mjs`) then, in order:

1. scans the page for an embedded **JSON** data file and parses it;
2. otherwise scans for an embedded **CSV** and parses it;
3. otherwise parses the first relevant **HTML `<table>`** on the page.

Rows are mapped to the normalized record schema (`pipeline/lib/schema.mjs`) using **case-insensitive
field-name hints**, so minor column renames don't break it. Every row is geolocated via
`pipeline/lib/geo.mjs` (US state, AU state, or country centroid) so it can be placed on the map.

If a source returns nothing or errors, the run keeps the **last committed data** plus the
**curated overlay** (`pipeline/curated.json`) — so the site never goes blank.

## Normalized record schema

```jsonc
{
  "id": "poultry_US_CA_merced_2025-06-12_120000",
  "category": "poultry",          // human | poultry | dairy | wild_bird | mammal
  "country": "United States",
  "country_code": "US",
  "admin1": "California",          // state / province (US & AU resolved to centroids)
  "admin1_code": "CA",
  "locality": "Merced",            // county / city, if provided
  "lat": 36.116, "lng": -119.682,
  "level": "admin1",               // admin1 | country
  "date": "2025-06-12",            // YYYY-MM-DD
  "count": 120000,                 // birds/animals affected, or null
  "flock_type": "Commercial",      // poultry/dairy only
  "species": null,                 // wild bird / mammal species
  "source": "CDC/USDA — Poultry (commercial & backyard)",
  "source_url": "https://…"
}
```

`summary.json` adds headline totals, per-country counts (for the choropleth), and per-source status.

## ✅ Verification checklist (run once, after the first CI deploy)

1. Open the **Actions** tab → the `Refresh data & deploy` run → the *"Fetch latest data"* step log.
2. For each source, confirm it prints `OK <key>: N records (json:… | csv:… | html-table …)`.
3. For any source printing `·· empty` or `ERR`, open its landing page in a browser and check:
   - Has the agency moved the embedded data file? Update the `homepage` URL (or add the direct data
     file URL) in `pipeline/sources/index.mjs`.
   - Did the columns change? Adjust the `fields` hints for that source.
4. Re-run the workflow (**Run workflow** button) and confirm the page badge flips to **Live data**.
5. Spot-check a few map points against the source pages for accuracy.

Because agencies periodically reorganize their sites, budget ~30 minutes for this the first time,
then it's largely maintenance-free. The `sources[]` block on the live page (under "Data sources")
always shows which feeds are currently healthy.

## Curated overlay

`pipeline/curated.json` holds a small set of **well-documented, individually-sourced** events
(e.g. WHO-reported human cases, notable Australian and Antarctic detections). These change slowly
and are merged into every run so the global view always has verified anchor points. Update them from
the references listed in `CURATED_REFERENCES` (`pipeline/sources/index.mjs`):

- WHO — cumulative human cases of A(H5N1)
- WOAH / WAHIS — world animal health information system
- CDC — global H5N1 human case summaries
- Wildlife Health Australia — avian influenza

## Adding a source

1. Add a `tabularSource({...})` entry to `SOURCES` in `pipeline/sources/index.mjs` (or write a custom
   `collect()` that returns `{ records, note }`).
2. Ensure places resolve: US/AU states use the centroid files in `site/assets/`; other countries use
   `countries-meta.json`. Add aliases in `pipeline/lib/geo.mjs` if a source uses unusual names.
3. Run `node pipeline/build.mjs` and confirm the new records appear.
