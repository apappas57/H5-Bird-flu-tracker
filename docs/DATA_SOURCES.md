# Data sources and verification

This tracker aggregates **official and authoritative** avian influenza detections into one normalised
schema, with an Australia-first focus. This document explains how each source is fetched, the strain
(subtype) rules, the caveats, and a checklist to run after a deploy.

All sources below are free, need no API key, and were verified live on 8 July 2026.

## Sources

### 1. FAO EMPRES-i+ (primary backbone)

The Global Animal Disease Information System. A BigQuery-backed CSV endpoint that returns events with
coordinates, updated within days. It ingests WOAH/WAHIS notifications, so it already carries the
Australian official events that AU government sites publish only as HTML or PDF.

```
https://api.data.apps.fao.org/api/v2/bigquery
  ?sql_url=https://data.apps.fao.org/catalog/dataset/96641600-b15c-493e-8e8d-6c22f145a960/resource/2fc21534-05da-4c58-b773-93a0f28bd1f6/download/avian-influenza-parameterized-query.sql
  &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  &diagnosis_status=all&animal_type=all
  &disease=Influenza%20-%20Avian        (exact string, required, or you get zero rows)
  &country=Australia                     (exact country name, or "all" for global)
```

Columns: `global_id, disease, lat, lon, locality, country, region, location, observation_date,
report_date, display_date, animal_type_list, species_overview_list, diagnosis_status, humans_affected,
humans_deaths, diagnosis_source`.

Two pulls (see `pipeline/sources/index.mjs`):

- `fao-au`: `country=Australia` from 2024-01-01 (the full Australian history).
- `fao-world`: `country=all` for the last 90 days (recent global context; US wild birds are excluded
  here because the USDA source covers them at higher resolution).

Licence: FAO open data (CC BY 4.0). Attribution required.

### 2. USDA APHIS wild-bird surveillance (US)

Public ArcGIS FeatureServer, no auth. Provides US wild-bird detections with real `Final_H5` /
`Final_H7` subtype and county points. The full layer is large (~174k surveillance samples); the
pipeline queries only actual H5/H7 detections in the last 365 days.

```
https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/
  VS_Avian_Influenza_Wild_Bird_Surveillance_Dashboard_data_view_feature_layer_/FeatureServer/0/query
  ?where=(Final_H5='Detected' OR Final_H7='Detected') AND Date_Collected >= timestamp '<cutoff>'
  &outFields=*&returnGeometry=true&outSR=4326&f=json
```

`Date_Collected` is epoch milliseconds; the pipeline converts it to a date. Licence: US federal
government, public domain. This replaces the old CDC "data-map" pages, which CDC **deprecated on
7 July 2025** (it stopped hosting USDA animal data). Those pages now return HTTP 403.

### 3. Our World in Data (global human cases)

WHO human-case data republished as CSV. Used for a global context statistic, not map points (the data
is monthly counts by country, not geolocated events).

```
https://ourworldindata.org/grapher/h5n1-flu-reported-cases.csv
```

Licence: CC BY.

### 4. Curated overlay

`pipeline/curated.json` holds a small set of well-documented, individually-sourced **human cases**
(for example the May 2024 Australian travel-acquired case, and notable US cases) plus a couple of
notable animal anchors. Australian animal detections are **not** curated: they come automatically from
FAO EMPRES-i, so curating them would double-count.

## Normalised record schema

```jsonc
{
  "id": "wild_bird_fao-unfao-hq-50510",
  "category": "wild_bird",        // human | poultry | dairy | wild_bird | mammal
  "country": "Australia",
  "country_code": "AU",
  "admin1": "Western Australia",  // state / territory (derived for AU from coords + text)
  "admin1_code": "WA",
  "locality": "Roses Beach",
  "lat": -33.847, "lng": 121.591,
  "level": "point",               // point | admin1 | country
  "date": "2026-06-20",           // YYYY-MM-DD
  "count": null,                  // animals affected, or null
  "subtype": "H5N1",              // H5N1 | H7 | H5 | ... | null ("pending")
  "flock_type": null,
  "species": "Grey petrel (Procellaria cinerea)",
  "source": "FAO EMPRES-i+ — Australia (WOAH/WAHIS)",
  "source_url": "https://empres-i.apps.fao.org/"
}
```

## Strain (subtype) rules

FAO's `disease` field is the generic "Influenza - Avian" with no subtype. Subtypes are assigned as
follows:

- **USA:** taken directly from USDA's `Final_H5` / `Final_H7` fields.
- **Australia** (documented, sourced rule in `pipeline/sources/fao-empresi.mjs`):
  - poultry, 2024-05 to 2025-06 -> `H7` (the resolved H7N3/N8/N9 outbreaks);
  - wild bird / mammal from June 2026 -> `H5N1` (clade 2.3.4.4b, per the WOAH first-case notification
    of 20 June 2026; Australia had no other wild-bird avian influenza in 2026, so this is safe);
  - otherwise `null`, shown as "pending".
- **Rest of world:** `null` unless the source states it. The H5N1 highlight is an Australia-focused
  feature.

## Caveats

- "First detection" refers to Australian wild birds. A separate possible incursion at sub-Antarctic
  Heard Island (an external territory) was reported in late 2025 and is not counted here.
- Coordinates follow the source. Most Australian events resolve to a town or region; a few resolve
  only to a state centroid.
- Not every Western Australian detection is itemised in public data.
- The 90-day global window is a context layer, not a complete global history.

## Verification checklist (after a deploy)

1. Open the daily workflow run and confirm each source prints `OK <key>: N records`.
2. Confirm `summary.json` shows `mode: live` and the `au` block has non-zero `h5n1_wild_detections`.
3. Spot-check a few Australian map points against the WOAH notification and state bulletins.
4. If a source prints `empty` or `error`, check whether the endpoint moved and update
   `pipeline/sources/`. The site keeps working on the last committed data until then.

## Adding a source

1. Write a collector in `pipeline/sources/` that returns `{ records, note }`, mapping rows through
   `makeRecord()` (`pipeline/lib/schema.mjs`). Supply `lat`/`lng` for point-level placement.
2. Register it in `pipeline/sources/index.mjs`.
3. Run `node pipeline/build.mjs` and confirm the new records appear with correct geo and subtype.
