# Australia-first Bird Flu Tracker: design spec

**Date:** 8 July 2026
**Status:** approved, in build
**Owner:** Alex Pappas (apappas57)

## Goal

Take the existing H5 Bird Flu Tracker from a US/global-first prototype to an
**Australia-first** public tracker of avian influenza that:

- pulls **accurate, ongoing data from free official/authoritative sources**, automated daily;
- centres on **Australia** while keeping the wider world as context;
- covers **all avian influenza with H5N1 highlighted** (H5N1 is the headline; the 2024 to 2025 H7 poultry outbreaks are shown as historical context);
- is **open-source ready** to share publicly on LinkedIn;
- ships **live on birdflutracker.org today**.

Non-medical, public-interest, calm and factual (never alarmist). Human risk is currently low and the site must say so clearly.

## Why now (verified situation, 8 July 2026)

- **20 June 2026:** first detection of HPAI H5N1 clade 2.3.4.4b in Australian wild birds, a brown skua near Esperance, WA, confirmed by CSIRO ACDP and notified to WOAH. Australia's run as the last H5N1-free continent has ended.
- **As of today:** 7 wild-bird (migratory seabird) detections across WA (5), SA (1) and NSW (1). **Zero poultry detections.** No mass mortality.
- **Human risk: low.** Australia's only human case remains a single travel-acquired case from May 2024 (clade 2.3.2.1a, a different lineage, unrelated to the 2026 wildlife incursion).
- **2024 to 2025 H7 poultry outbreaks are resolved:** H7N3/N8/N9 across VIC/NSW/ACT (2024) plus a Euroa VIC H7N8 cluster (Feb 2025); Australia self-declared HPAI-free in poultry (WOAH standards) mid-2025.
- **Caveat to state honestly:** a possible earlier sub-Antarctic incursion at Heard Island (late 2025) means "first detection" must be qualified as "in Australian wild birds" with a footnote.

Australian conventions to honour: "High Pathogenicity Avian Influenza" (not "Highly Pathogenic"), `-ise` spelling, and the **Emergency Animal Disease Hotline 1800 675 888** featured for reporting sick or dead birds.

## Data sources (verified live, 8 July 2026)

Ranked by role. Every endpoint below returned HTTP 200 from the build environment and was inspected.

| Role | Source | Access | Notes |
| --- | --- | --- | --- |
| **Primary backbone** | FAO EMPRES-i+ (Global Animal Disease Information System) | Free, no auth, CSV via BigQuery wrapper | Global incl. Australia, real lat/long, near-real-time (days). Ingests WOAH/WAHIS notifications, so it already carries Australia's official events that the AU government sites publish only as un-scrapeable HTML. |
| **US enrichment** | USDA APHIS wild-bird ArcGIS FeatureServer | Free, no auth, Esri JSON | US wild birds with `Final_H5`/`Final_H7` subtype and county points. Replaces the CDC feeds, which CDC deprecated on 7 July 2025 (this is why the old pipeline 403s). |
| **Human context** | Our World in Data H5N1 CSV | Free, no auth, CSV | WHO cumulative human cases by entity (incl. Australia). Used as a context statistic, not map points. |
| **Curated overlay** | WOAH notifications, WHO DON, PIRSA/DAFF bulletins | Manual, sourced | A small, slow-changing set of human-case anchors plus the Heard Island footnote. |
| **News (stretch)** | CIDRAP RSS | Free, no auth, RSS | Optional "latest news" ticker. |

**Rejected as pipeline dependencies:** WHA/eWHIS (login-gated), outbreak.gov.au / agriculture.gov.au / state dept pages (HTML/PDF only, bot-protected), WOAH WAHIS direct API (gated), data.gov.au (no relevant dataset today). These become cross-check or future inputs, not blockers, because FAO EMPRES-i already aggregates their WOAH notifications.

### FAO EMPRES-i+ endpoint

```
https://api.data.apps.fao.org/api/v2/bigquery
  ?sql_url=https://data.apps.fao.org/catalog/dataset/96641600-b15c-493e-8e8d-6c22f145a960/resource/2fc21534-05da-4c58-b773-93a0f28bd1f6/download/avian-influenza-parameterized-query.sql
  &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  &diagnosis_status=all&animal_type=all
  &disease=Influenza%20-%20Avian        (exact string, required)
  &country=Australia                     (exact name, or "all")
```

Returned columns: `global_id, disease, lat, lon, locality, country, region, location, observation_date, report_date, display_date, animal_type_list, species_overview_list, diagnosis_status, humans_affected, humans_deaths, diagnosis_source`.

Two pulls: `country=Australia` from 2024-01-01 (full AU history, ~26 rows) and `country=all` for the last 365 days (world context, ~1,600 rows/year). Volume is small enough for a static JSON file.

## Architecture

Unchanged in shape (this is a good design already), extended at the source and schema layers.

```
pipeline/build.mjs  (daily via GitHub Actions + Vercel deploy hook)
  |
  |-- sources/  (parallel, fault-tolerant; each returns {records, note})
  |     fao-empresi.mjs   [NEW]  AU (2024->) + world (365d), point geo, subtype rule
  |     usda-wildbird.mjs [NEW]  US wild birds via ArcGIS, real H5/H7 subtype
  |     owid-human.mjs    [NEW]  global human-case context stat
  |     (dead CDC adapters removed)
  |
  |-- curated.json  (human-case anchors + Heard Island footnote, subtype-tagged)
  |-- au-status.json (editorial current-status facts + sources + risk level + hotline)
  |
  v  normalize (schema.mjs: + subtype, + point-level geo) -> dedupe -> sort
site/data/detections.json + summary.json
  |
  v
site/  (static Leaflet + vanilla JS, Audubon/Flyway identity preserved)
  AU-first: default region AU, AU headline stats, status banner, subtype highlight, AU terminology
  |
  v
Vercel -> birdflutracker.org, daily refresh
```

### Schema changes (`pipeline/lib/schema.mjs`, `pipeline/lib/geo.mjs`)

- Add **`subtype`** to the record contract: e.g. `"H5N1"`, `"H7"`, `"H5"`, or `null` ("subtype pending"). Backward-compatible (existing records get `null`).
- Add **point-level geo**: if a source supplies `lat`/`lng`, use them directly with `level: "point"`; otherwise fall back to the existing admin1/country centroid resolution. This fixes the current problem where every AU point stacks on a state centroid.
- Make resolution resilient: a record with coordinates is kept even when its country string does not canonicalise (FAO occasionally puts a locality in the country field). Extend country aliases ("United States of America", "Netherlands (Kingdom of the)", "Viet Nam", etc.).

### Category mapping (FAO `animal_type_list` + species)

- `Wild` + bird species -> `wild_bird`
- domestic poultry -> `poultry`
- cattle / dairy -> `dairy`
- other mammals -> `mammal`
- human rows are **not** emitted from FAO (unreliable); human cases come from the curated overlay, human totals from OWID.

### Subtype rule for Australia (documented and sourced)

FAO's `disease` field is generic ("Influenza - Avian") with no subtype. Australia's subtype is assigned by an explicit, auditable rule in the adapter, matching the verified record:

- AU **poultry** events 2024-05 to 2025-06 -> `H7` (the resolved 2024 to 2025 H7 outbreaks).
- AU **wild-bird / mammal** HPAI events on/after 2026-06-20 -> `H5N1` (clade 2.3.4.4b per WOAH, 20 June 2026).
- otherwise `null` (subtype pending).

Global (non-AU) records keep `subtype: null`; the H5N1 highlight is an Australia-focused feature. USDA US records carry their real `Final_H5`/`Final_H7` subtype.

### Error handling (existing pattern, kept)

Per-source try/catch; each reports `live` / `empty` / `error` with a note in `summary.json`. Merge order: live sources + curated overlay; if all sources fail, fall back to last-committed data + curated; never blank. New sources plug into the same contract.

## Site changes (Audubon/Flyway identity preserved)

- **Default region = Australia.** Map opens on Australia; region chips reordered (Australia, United States, Global). The "down the flyway" identity stays and actually fits better now (the virus arrived via the Southern Ocean flyway).
- **AU-first headline stats:** wild-bird detections, states affected, days since first detection, poultry detections (currently 0), human cases; world context secondary.
- **Current-status banner:** calm, sourced, one-glance summary ("H5N1 clade 2.3.4.4b first detected in Australian wild birds 20 June 2026; N detections across WA/SA/NSW; no poultry detections; human risk low"), with source links.
- **Subtype:** H5N1 visually highlighted; H7 shown as historical; subtype column in the list and a subtype filter.
- **AU language:** "High Pathogenicity Avian Influenza", `-ise` spelling, EAD Hotline 1800 675 888 and report-sick-birds guidance prominent.
- **Metadata:** title, description, OG, canonical updated for AU-first.
- Colour-blind-safe category palette retained.

## Open-source readiness

- Rewrite `README.md` (AU-first framing, methodology, verified source table, run + deploy instructions, contributing note).
- Rewrite `docs/DATA_SOURCES.md` (verified endpoints, the subtype rule, caveats incl. Heard Island and WA's un-itemised cases).
- Add `LICENSE` (MIT). Attributions: FAO (CC BY), USDA (US public domain), OWID (CC BY), map data (c) OpenStreetMap contributors.
- Refresh the stale `docs/STATUS.md`.

## Scope for today

**MVP (must ship):** schema + geo changes; FAO adapter (AU + world); USDA wild-bird fix; OWID context; trimmed curated overlay + AU status; AU-first summary; site re-centre; docs + LICENSE; deploy to birdflutracker.org with daily refresh.

**Stretch (only if time allows):** CIDRAP news ticker; bundled AU gazetteer for name-only sources; opportunistic pollers for the NSW ArcGIS layer and data.gov.au; CONTRIBUTING + issue templates.

## Testing / verification

- Run `node pipeline/build.mjs` locally; confirm `mode: live`, AU rows present with real coordinates, world context present, summary correct, no double-counting of AU detections.
- Validate `detections.json` / `summary.json` shape.
- Browser-verify (via subagent, to keep context clean): AU default view, status banner, point-level markers, subtype highlight, list/search, mobile layout.
- Pre-deploy checklist: build, brand, forms/links, mobile.
- Deploy, verify live, point DNS, confirm daily refresh wiring.

## Risks and mitigations

- **FAO endpoint shape changes:** adapter fails soft to last-committed + curated; per-source status is visible on the page.
- **FAO country-field quirks:** coordinates-first resolution keeps records mappable regardless.
- **Subtype mislabelling:** rule is explicit, sourced, and easy to edit; global records stay `null` rather than guessing.
- **Over-claiming "first detection":** qualified wording + Heard Island footnote.
- **Alarmism:** banner leads with "human risk low" and links to authorities.
