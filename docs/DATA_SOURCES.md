# Data sources and verification

This tracker aggregates **official and authoritative** avian influenza detections into one normalised
schema, with an Australia-first focus. This document explains how each source is fetched, the strain
(subtype) rules, the caveats, and a checklist to run after a deploy.

All sources below are free and need no API key. Sources 1 to 4 were verified live on 8 July 2026.
The Australian Commonwealth sources (5 and 6) and the news early-signal tier (7) were added and
verified live on **30 July 2026**; the probe results for every endpoint tested that day, including
the ones that did not work, are recorded in "Endpoint probe results" below.

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
notable animal anchors. Australian animal detections are normally left to FAO EMPRES-i, which carries
them without hand work.

The one exception is a **nationally significant first**, such as a state's first detection. FAO lags
(see "Reporting lag" below), so waiting for it means the tracker misses the event on the day the
country hears about it. Victoria's first detection is curated for that reason: greater crested tern
(*Thalasseus bergii*), Portland, announced by Agriculture Victoria on 30 July 2026, marked
`"confidence": "presumptive"`. Reconciliation (below) removes the curated copy once the automated
feed carries the same event, so the exception cannot become a permanent double-count.

### 5. Australian Commonwealth H5 bird flu updates (official tally)

```
https://www.agriculture.gov.au/about/news/H5-bird-flu-updates
```

Dated statements from the Australian Chief Veterinary Officer, published same-day, itemising new
detections, poultry status, human-health risk and CCEAD advice. This is the source that closes the
gap FAO leaves open.

The page is **prose, not a dataset**. It names places ("giant petrel at Port Lincoln, Eyre
Peninsula") without coordinates, so it feeds the **official tally** and the reconciliation logic
rather than map points. We do not geocode a place name from prose to create a point: an invented
coordinate on a public health map is worse than a missing one.

### 6. National campaign page (per-state counts)

```
https://www.agriculture.gov.au/campaigns/birdflu      (birdflu.gov.au redirects here)
```

Carries the national total with a per-state breakdown and an AEST timestamp, so the site can show
the **official count** next to the count of individually mapped detections. On 30 July 2026 at
11.30am AEST it read 28 confirmed or presumed positive detections (WA 10, SA 15, NSW 2, QLD 1) while
the FAO-backed map held 16 across 3 states. Showing both numbers, rather than picking one, is the
honest presentation of that gap.

Note on Victoria: Agriculture Victoria announced the Victorian detection at 11.18am on 30 July 2026
and the federal breakdown timestamped 11.30am did not yet include it. The lag is visible at hour
resolution, which is why the two counts are labelled by source.

Agriculture Victoria's own media releases are cited but **not fetched**: `agriculture.vic.gov.au`
returns **HTTP 403 to automated clients** on every path, so no adapter is built against it. A human
reader can open the link; the pipeline cannot.

### 7. News early-signal tier (maintainer gap-detector)

```
https://news.google.com/rss/search?q=<query>&hl=en-AU&gl=AU&ceid=AU:en
```

Keyless RSS. It carried the Victorian case within hours of the announcement, while the Commonwealth
pages had not yet absorbed it and FAO would not have carried it for about a fortnight.

Its boundary is deliberate and firm: news items are **not plotted on the map and not counted in any
figure**. They exist to tell a maintainer "an event is being reported that our official sources do
not carry yet", which is a prompt to go and check the primary source. A headline is not a
notification: it has no coordinates, no confirmation status we can stand behind, and no stable
identity for deduplication. Anything that reaches the map or a count has to come from an official
source or from `curated.json` with a named primary source attached.

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
  "confidence": "presumptive",    // confirmed | presumptive | null (not stated)
  "flock_type": null,
  "species": "Grey petrel (Procellaria cinerea)",
  "source": "FAO EMPRES-i+: Australia (WOAH/WAHIS)",
  "source_url": "https://empres-i.apps.fao.org/",
  "era": "au_h5n1_2026",          // which real-world event this record belongs to
  "era_current": true             // may this record be presented as part of the live outbreak
}
```

`era` and `era_current` are stamped by the pipeline (see "Eras" below). The front end reads
them; it never derives them.

## Eras: which event does a record belong to

On 30 July 2026 the news reported Victoria's **first** H5N1 case while the tracker held
**fourteen** Victorian records. Both were right. Those fourteen records are three unrelated
things:

| What | Count | Subtype | Status |
| --- | --- | --- | --- |
| Current H5N1 clade 2.3.4.4b wild-bird detection (Portland, 30 July 2026) | 1 | H5N1 | ongoing, presumptive |
| H7 poultry outbreaks, 2024 to 2025 (Lethbridge, Meredith, Terang, Euroa) | 12 | H7 | resolved |
| Travel-acquired human case, May 2024, clade 2.3.2.1a | 1 | H5N1, different lineage | recovered |

Adding them together gives a number that is arithmetically correct and epidemiologically
meaningless. Subtype and date were already on every record, but the front end had to infer the
grouping, and inference is where that error is born. So `pipeline/lib/era.mjs` decides once, in
the pipeline, and stamps the answer onto each record.

**The eras.** Every rule, with its justification, is published in
`summary.json` under `eras.definitions`, so the site can show its own working rather than
asking to be trusted.

| Era id | Current | Rule |
| --- | --- | --- |
| `au_h5n1_2026` | **yes** | Australia, subtype H5 or H5N1, date on or after 2026-06-01 |
| `au_h7_poultry_2024_2025` | no | Australia, subtype H7*, category poultry, 2024-05-01 to 2025-06-30 |
| `au_human_2024` | no | Australia, category human, 2024-01-01 to before 2026-06-01 |
| `global_h5_panzootic` | yes (global context) | not Australia, subtype H5 or H5N1, date on or after 2021-10-01 |
| `other_subtype` | no | a subtype is stated and it is not H5 |
| `pre_panzootic` | no | dated before 2021-10-01 |
| `subtype_unstated` | no | subtype is null. Checked first, before any strain-defined rule |
| `unclassified` | no | nothing above matched |

Boundary justifications, in short: 1 June 2026 sits in the empty gap between the last H7
poultry event in the dataset (22 February 2025) and Australia's first H5N1 notification
(20 June 2026), so it cannot pull an earlier event in. H5 and H5N1 both count for Australia
because Commonwealth reporting uses them interchangeably for this event, the campaign page is
titled "H5 bird flu updates", and Australia has had no other H5 avian influenza. All
categories are eligible for the current era, not only wild birds, because a poultry or human
case arising from this incursion would belong to it.

**Two safety properties, both deliberate.**

- Every rule fails **away** from the current incursion. A record that matches nothing becomes
  `unclassified`, never live. Understating an outbreak is visible and fixable; overstating one
  is a false alarm on a public health page. The consequence is accepted knowingly: if the
  Australian subtype rules in `pipeline/sources/fao-empresi.mjs` stopped assigning H5N1,
  Australian detections would fall into `subtype_unstated` and the live count would **drop**,
  not rise. The build logs every era count and every unclassified record.
- `summary.json` publishes `au_eras` with per-state and national counts broken down by era,
  and it deliberately has **no combined per-state total**. A bare "14 detections in Victoria"
  is the bug, so the shape does not offer one to reach for. What a caller gets instead is
  `current_records`, `historical_records`, an ordered `eras` array, and a ready-to-print
  `sentence`:

```
1 current H5N1 detection. 12 resolved H7 poultry outbreaks, 2024 to 2025.
1 unrelated travel-acquired human case, 2024.
```

`au.current_era_detections`, `au.current_era_states` and `au.current_era_state_list` restate
the live figures inside the existing `au` block. Prefer them over `au.h5n1_detections`, which
is 19 rather than 18 because it also counts the unrelated 2024 human case: that case is H5N1
but clade 2.3.2.1a, a different lineage.

## History dataset

`site/data/history.json` feeds the separate history page. It is built from two halves on every
run, and needs no API and no key:

1. **`pipeline/history.json`**, hand-curated and committed. The H5N1 lineage from its 1996
   emergence in Guangdong through the clade 2.3.4.4b panzootic, the mammal spillovers, the
   polar spread and the arrival in Australia, plus the H5-versus-H7 explainer. The global
   record barely changes, so committing it costs nothing to run.
2. **A generated Australian timeline**, recomputed from the live records each build:
   first detection per state in the current era, the local-transmission statement from
   `pipeline/au-status.json`, the resolved H7 poultry block, the 2024 human case, and where the
   official national count stands today versus how many detections this site maps.

Rules enforced in code (`buildHistory` in `pipeline/build.mjs`):

- **No entry without a citation.** An entry whose citations contain no `http(s)` URL is
  **dropped and logged**, not published. Generated entries cite the source that published the
  underlying record.
- Failure is non-fatal. If the curated file is missing or unreadable, the build logs it and
  leaves the last committed `site/data/history.json` in place rather than taking the page down.
- Each entry carries a `certainty` of `established`, `approximate`, `preliminary`, `reported`
  or `contested`. Approximate and disputed figures are stated as ranges or flagged in the body
  instead of being smoothed into a clean number.
- Entries are sorted ascending by `sort_date`. A `date_note` on the dataset states that sources
  use different date bases (observation, report, WOAH notification, state announcement), so
  entries within a few days of each other may not be in the order events happened. Dates are
  never shifted to make the timeline read neatly.

When editing `pipeline/history.json`, prefer an organisation's stable landing page over a deep
link that may rot. A dead citation on a page whose entire purpose is credibility is worse than
a shallower one.

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

## Confidence: confirmed versus presumptive

`confidence` (see `normalizeConfidence` in `pipeline/lib/schema.mjs`) records whether an authority
has fully confirmed a detection. It is optional, and `null` means the source did not state it, which
is what every automated source emits today.

"Presumptive" is not a hedge we invented. It is how this outbreak is officially reported:

- The Commonwealth counts in the category **"confirmed or presumed positive"**, so the official
  national total already mixes both.
- Several Western Australian detections are **presumed positive because sequencing could not be
  determined**, and WA DPIRD treats them as positive as a precaution.
- Victoria's first detection was **announced on 30 July 2026 with confirmatory testing still running
  at the CSIRO Australian Centre for Disease Preparedness in Geelong**, so it is recorded as
  `presumptive`.

The rules fail toward the weaker claim: a hedge word anywhere in a phrase resolves to
`presumptive`, and "suspect", "pending" or "unconfirmed" resolve to `null` rather than being
upgraded. Samples sent with no positive result yet is a weaker statement than a positive result that
sequencing could not fully type, and the field must never make preliminary work look settled.

## Reporting lag and reconciliation

**The lag, measured.** FAO EMPRES-i ingests WOAH/WAHIS notifications, and WOAH notification follows
national announcement. Measured on **30 July 2026**: the Commonwealth reported 28 detections across
4 states while the FAO-only pipeline held 16 across 3, with a latest Australian event of 16 July.
That is a lag of **about 14 days**, and it is the reason the tracker missed Victoria's first
detection on the day it was announced.

**The rule.** `pipeline/lib/reconcile.mjs` exists to let a curated record cover that fortnight
without leaving a duplicate behind. `dedupe()` cannot do it: it keys on `id`, and a curated record's
composite id can never equal a FAO record's id for the same event. Reconciliation matches on the
real-world event instead: same category, same state, a date window of 14 days before to 3 days after
the curated date, no conflicting subtype, and then a locality match (or a species signal when only
one side names a place). When an automated source starts carrying the event, the **curated copy is
dropped and the automated copy is kept**, because the automated copy is the one the daily build keeps
refreshing.

Two safeguards, because this is a public health count:

- Every rule fails toward **keeping both records** when the signal is weak. Briefly showing one
  duplicate that a human can spot is better than deleting a real detection and understating an
  outbreak. Same-state, different-beach detections days apart are the normal pattern in this
  outbreak, so a locality mismatch is never overridden by a species match.
- Nothing is dropped silently. The reconciler returns a note naming what was superseded and by what,
  and the build logs it.

Curated human cases and non-Australian records are never eligible to be dropped.

## Caveats

- "First detection" refers to Australian wild birds. A separate possible incursion at sub-Antarctic
  Heard Island (an external territory) was reported in late 2025 and is not counted here.
- Coordinates follow the source. Most Australian events resolve to a town or region; a few resolve
  only to a state centroid.
- Not every Western Australian detection is itemised in public data.
- The 90-day global window is a context layer, not a complete global history.
- The count of mapped detections can be lower than the official national count, because the mapped
  points follow WOAH notification and the official count follows the Commonwealth's own updates. Both
  figures are published rather than reconciled into one number.
- The Victorian detection is placed at the town of **Portland** (-38.3457, 141.6042) because no beach
  or site name was published. Its find date is not asserted: reports differ on whether the bird was
  found on 27 or 28 July 2026, so the record carries the announcement date, 30 July 2026, consistent
  with the rest of the curated overlay.
- News items are an early-signal tier for maintainers only. They are never mapped and never counted.

## Endpoint probe results

Every endpoint below was probed live on **30 July 2026**. The failures are recorded on purpose, so
nobody spends time re-testing a dead end.

| Endpoint | Result |
| --- | --- |
| `agriculture.gov.au/about/news/H5-bird-flu-updates` | 200, HTML, about 99 KB. Dated CVO statements, itemised, same-day. In use (source 5). |
| `agriculture.gov.au/campaigns/birdflu` (birdflu.gov.au redirects here) | 200, HTML, about 46 KB. National tally, per-state counts, AEST timestamp. In use (source 6). |
| `wildlifehealthaustralia.com.au/Resource-Centre/H5-bird-flu` | 200, HTML, about 123 KB. Reference reading. |
| `outbreak.gov.au/.../high-pathogenicity-avian-influenza` | 200, HTML, but overview only, no situation detail. |
| Google News RSS (`news.google.com/rss/search?q=...&hl=en-AU&gl=AU&ceid=AU:en`) | 200, XML, keyless. Carried the Victorian case same-day. Early-signal tier only (source 7). |
| `agriculture.vic.gov.au` (any path) | **403** to automated clients. Citable for a human reader, not fetchable. Do not build an adapter. |
| `wahis.woah.org/api/v1/pi/event/filtered-list` | **400** on GET; `/pi/getReportList` returns **403** (Cloudflare). Not usable as-is. |
| `data.gov.au/api/3/action/package_search` | **404**. The CKAN API is not at that path. |

## Verification checklist (after a deploy)

1. Open the daily workflow run and confirm each source prints `OK <key>: N records`.
2. Confirm `summary.json` shows `mode: live` and the `au` block has non-zero `h5n1_wild_detections`.
3. Spot-check a few Australian map points against the WOAH notification and state bulletins.
4. If a source prints `empty` or `error`, check whether the endpoint moved and update
   `pipeline/sources/`. The site keeps working on the last committed data until then.
5. Read the reconciliation line in the build log. If it says a curated record was superseded, confirm
   the automated record that replaced it is the same real-world event, then delete the now-redundant
   entry from `pipeline/curated.json`.
6. Compare the mapped Australian count against the official count on the Commonwealth campaign page.
   A gap of up to about two weeks of detections is expected; a gap that keeps growing means a source
   has quietly stopped updating.
7. Read the `eras:` line in the build log. Confirm `au_h5n1_2026` matches the number of current
   detections you expect, and that `unclassified` is absent. Any unclassified record is printed
   with the reason it could not be placed; it is never counted as live, so this line is the only
   place a widening rule announces itself.
8. Confirm the build logged a `history:` line and that no entry was dropped for want of a
   citation. `site/data/history.json` should carry the curated global entries plus the generated
   Australian ones, and `counts.dropped` should be 0.

## Adding a source

1. Write a collector in `pipeline/sources/` that returns `{ records, note }`, mapping rows through
   `makeRecord()` (`pipeline/lib/schema.mjs`). Supply `lat`/`lng` for point-level placement.
2. Register it in `pipeline/sources/index.mjs`.
3. Run `node pipeline/build.mjs` and confirm the new records appear with correct geo and subtype.
