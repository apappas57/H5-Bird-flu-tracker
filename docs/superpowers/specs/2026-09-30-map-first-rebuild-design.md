# Australian Bird Flu Tracker: map-first rebuild

_Design spec, 30 September 2026. Approved in principle by Alex the same evening (approach 2 plus the
date scrubber, live three.js birds at "quiet" restraint, pipeline moved off cloud IPs)._

## 1. Why this rebuild

The tracker deployed every day for two months with a green workflow while its data was silently wrong:

- `agriculture.gov.au` tar-pits requests from GitHub Actions and Vercel build containers (every fetch
  aborts on timeout; the same pages load in 0.1 s from a residential IP). The official count sat at
  52 (as at 1 August) for 60 days while the mapped count grew to 393, so the page showed the official
  figure *below* the mapped one, the exact inversion its own copy says cannot happen.
- On 30 September FAO's endpoint returned 502 to the cloud. The "never goes blank" fallback restored
  the last *committed* `detections.json`, which the refresh job deliberately never commits, so the
  live map rolled back to the 1 August snapshot (25 points).
- The Commonwealth restructured its pages. Per-state counts moved to `/campaigns/birdflu/latest-data`,
  which now publishes **668 confirmed events** (as at 4 pm AEST 29 September 2026) and a record-level
  spreadsheet, `H5_bird_flu_events.xlsx`, with a stable record id, date sampled, state, LGA, locality
  and species for every event. The site had never used it.
- The hand-written status file was last edited on 1 August and still says "five mainland states".

An emergency patch shipped at 19:28 AEST on 30 September (commit `5e0ebc6`): the pipeline was run from
a residential IP and every data file committed. The live site now reads 393 mapped, 6 states, official
231 (statement of 11 September). This spec replaces the design that allowed the failure, and rebuilds
the page around the map.

Alex's brief, verbatim in spirit: use real data sources, be verifiably accurate, reduce the text and
complexity so the page is the map with slight information, fix the sloppy wording, make it a special
site, and add tasteful 3D birds built in Blender.

## 2. Goals and non-goals

Goals

1. Australian data comes from the official record-level dataset, and every marker links to its record.
2. Freshness is a first-class fact on the page, and a failure is alerted the same day, from the outcome
   (the live site) rather than a job's exit code.
3. The map is the page. One compact panel, a filter bar, a date scrubber, a record drawer, a footer
   strip. Everything explanatory moves to `/about`.
4. Copy is short, declarative and dated. Every number carries its basis and its as-at date.
5. Four species of the outbreak exist as Blender-built 3D birds, rendered live with three.js, used in
   exactly two quiet places, with still and animated-image fallbacks.
6. The site measures its own visits.

Non-goals

- No framework, no runtime build step, no server. The site stays static HTML, CSS and JS on Vercel.
- No ambient flock, no birds anchored to map coordinates, no 3D map of Australia. The data map stays
  the accurate Leaflet map.
- No geocoding from prose. Only structured locality fields are placed, and placement precision is
  always stated.
- No merging of counts measured on different bases into one number.
- The `/history` page keeps its content; it gets the shared header and the copy pass, nothing more.

## 3. Data backbone

### 3.1 Sources after the rebuild

| Key | Source | Role | Fetched from |
| --- | --- | --- | --- |
| `daff-events` | `https://www.agriculture.gov.au/sites/default/files/documents/H5_bird_flu_events.xlsx` | **Australian backbone.** One record per confirmed wildlife event. | Residential IP only |
| `daff-latest` | `https://www.agriculture.gov.au/campaigns/birdflu/latest-data` | National total, per-jurisdiction counts, hotline reports, "As of" stamp | Residential IP only |
| `daff-updates` | `https://www.agriculture.gov.au/about/news/H5-bird-flu-updates` (HTML, and `?_format=json` for the Drupal node with `changed` and `body`) | Dated CVO statements: the official cumulative series and the "first detection in X" milestones | Residential IP only |
| `fao-au` | FAO EMPRES-i+ (unchanged) | WOAH-notified Australian events with coordinates. A separate, toggleable layer and a cross-check. Never mixed into the official count. | Any |
| `fao-world` | FAO EMPRES-i+ 90-day world (unchanged) | World context layer | Any |
| `us-wild-birds` | USDA APHIS ArcGIS (unchanged) | US wild birds | Any |
| `owid-human` | Our World in Data (unchanged) | Global human-case figure | Any |
| `au-news-signal` | Google News RSS (unchanged) | Maintainer gap detector. Never mapped, never counted. | Any |
| curated | `pipeline/curated.json` | Human cases only. The Australian first-of-state animal records are deleted: the official dataset carries them same-day. | n/a |

The three DAFF sources are fetched with the existing browser User-Agent and a 30 s timeout, and their
raw responses are saved beside the fixtures so a parser regression can be reproduced offline.

### 3.2 The official dataset (`daff-events`)

Observed on 30 September 2026: one sheet named `H5 bird flu 2026-09-29`, 668 data rows, columns
`Record id`, `Date sampled`, `Jurisdiction`, `Local government area`, `Locality`, `Common name`,
`Scientific name`. Every column is filled. `Date sampled` can be the literal `#N/A`. Record ids look
like `SA-WB-011`. Jurisdiction is a state code or `Other` (the page footnote says Other Territories
means the Jervis Bay Territory).

Parsing rules

- Read the first sheet whatever its name. If the sheet name ends in `YYYY-MM-DD`, publish it as
  `dataset_date`. The `latest-data` page's "As of" stamp is published separately as `as_at`.
- A row becomes a record with `source_key: "daff-events"`, `source: "DAFF: H5 bird flu events dataset"`,
  `source_url` set to the `latest-data` page, `record_id` set verbatim, `country: "Australia"`,
  `admin1` from the jurisdiction code (`Other` becomes `Other Territories` with
  `admin1_note: "Jervis Bay Territory (Commonwealth jurisdiction)"`), `lga`, `locality`, `species`
  (common name, with the scientific name in `species_scientific`), `subtype: "H5"`,
  `confidence: "confirmed"` (the page's own wording is "confirmed events"), and `count: 1`.
- `category`: the middle segment of the record id is recorded as `record_class`. `WB` is `wild_bird`.
  Any other class, and any scientific name that matches the committed mammal list
  (`pipeline/species/mammals.json`, seeded from the dataset's distinct names and reviewed by hand),
  is `mammal`. A name in neither list is published as `wild_bird` with `species_class: "unverified"`
  and a build warning, so a new class is visible the day it appears rather than silently miscounted.
- `date`: `Date sampled` when present. When it is `#N/A`, `date` is `first_seen` and `date_basis` is
  `"first_seen"` rather than `"sampled"`. `first_seen` is the `dataset_date` of the first committed
  snapshot that contains the record (derived by diffing against the previous committed `au.json`), so
  on the very first run every record is dated by the snapshot it came from (29 September 2026), never
  by the day the code happened to run. The scrubber and the drawer show the basis. This keeps the
  schema's `date` required while never inventing a sampling date.
- Every record keeps `first_seen` and, once a record disappears from the dataset, is retained for
  30 days with `withdrawn: <date>` and excluded from counts, so a correction by the department is
  visible rather than silently erased.
- Era stamping is unchanged: Australia, subtype H5, dated on or after 2026-06-01 is `au_h5n1_2026`.

### 3.3 Placement: the locality gazetteer

The dataset has no coordinates. Placement is a lookup, never a guess, and its precision is data.

- `pipeline/geo/au-localities.json` is a committed cache keyed `STATE|Locality` (and `STATE|LGA` for
  LGA centroids) holding `{lat, lng, precision, source, source_id}`. Precision is `locality`, `lga` or
  `state`.
- Primary source: the Composite Gazetteer of Australia (FSDF, `placenames.fsdf.org.au`, CC BY 4.0),
  the successor to the retired Geoscience Australia WFS. The implementation plan starts with a task
  that verifies the bulk download format and licence and records the result in `docs/DATA_SOURCES.md`.
  Fallbacks if that verification fails: ABS Suburbs and Localities 2021 centroids, then Nominatim
  (one request per second, only for the handful of new localities per day, cached forever).
- Matching: exact name within the jurisdiction, then the LGA as a disambiguator when a name occurs
  more than once in a state, then a normalised match (case, punctuation, "Mount"/"Mt"). No fuzzy
  matching beyond that: a wrong beach is worse than the LGA centroid.
- A record that cannot be placed at locality precision falls back to the LGA centroid, then the state
  centroid, keeps the record and its precision, and is logged. The build fails if any DAFF record has
  no placement at all, and warns if more than 5 % of records are below locality precision.
- The map draws precision: locality precision is a solid mark, LGA precision a hollow mark, state
  precision a dashed ring at the state centroid. The drawer says it in words ("Placed at the locality
  centroid; the department publishes place names, not coordinates").

### 3.4 Official totals, series and milestones

- `daff-latest` yields `official_au`: `national_total`, `by_jurisdiction`, `hotline_reports`,
  `as_at` (parsed from "As of 4pm AEST, 29 September 2026"), `fetched_at`. The build asserts the
  spreadsheet row count equals `national_total` and the per-jurisdiction sum equals it; a mismatch is
  logged, both figures are published, and the panel shows the dataset count with a footnote.
- `daff-updates` yields `official_series`: every dated statement containing "There have now been N
  confirmed or presumed positive detections" becomes `{date, total, url}` where `url` is the page plus
  the statement's anchor. The series is on a different basis (detections, per statement) from the
  dataset (events, per record). It is published for `/about` and `/history`, labelled by basis, and is
  not drawn on the map page.
- The same page yields `milestones`: sentences of the form "This is the first detection of H5 bird flu
  in <X>" with their statement date and URL. They replace the hand-written firsts in the generated
  half of `history.json`.
- `pipeline/au-status.json` shrinks to the facts a parser cannot produce: `human_risk` with its
  source and date, `local_transmission` with its source and date, the hotline, the authorities list,
  and a `review_by` date. The build warns when `review_by` has passed and the page shows nothing that
  depends on an unreviewed fact. `summary` and `caveats` move to `/about` as static, dated copy.

### 3.5 What the FAO layer becomes

FAO records for Australia stay in the data as a separate layer. They are not reconciled record-to-record
with DAFF records (different id spaces, different bases, different dates). The existing curated-versus-
FAO reconciler stays for human cases. The panel's layer control offers "Official events" (default),
"WOAH notifications" and "World", each with its count. `/about` explains the three bases in one table.

### 3.6 Published files

`site/data/summary.json` gains `official_au` (new shape), `official_series`, `milestones`,
`placement_stats`, `freshness` (`generated_at`, `run_host`, per-source `fetched_at` and `status`,
`dataset_date`, `as_at`). `site/data/detections/au.json` carries the DAFF records first, then FAO AU
records with `layer: "woah"`. Every published record has `source_url` and, for DAFF records,
`record_id`. `history.json` is unchanged in shape.

## 4. Where the pipeline runs, and how we know it ran

### 4.1 Runtime

- A launchd job on Alex's Mac runs nightly at 19:45 AEST (after the department's 5 pm data cut),
  executes `node pipeline/build.mjs`, and if the build succeeded and data changed, commits
  `site/data/**` and pushes `main`. The job's plist, log paths, PATH handling and git identity follow
  the agency-engine conventions recorded in section 4.4.
- The GitHub Actions cron stays as a second attempt from the cloud. It now commits every data file it
  regenerates, not only `summary.json` and `history.json`. If the cloud is blocked that day the build
  falls back and commits nothing new.
- Vercel's build command becomes `node pipeline/build.mjs --verify`: validate the committed data, fetch
  nothing, fail the deploy on invalid data. A deploy can no longer regress data.
- "Last good" is therefore the last successful run, by construction, because every successful run is
  committed. The restore path in `build.mjs` stays as the safety net for a run where every source
  fails, and its note names the date of the data it restored.
- Repository growth: committing `detections.json` daily costs roughly 30 MB a year after git's delta
  compression. Acceptable. Revisit if the repo passes 100 MB (move world and US snapshots out of git).

### 4.2 Freshness canary

A daily canary in agency-engine fetches `https://www.birdflutracker.org/data/summary.json` and alerts
through ntfy when any of these hold: `freshness.generated_at` older than 36 hours; `official_au.as_at`
older than 4 days (the department does not always publish over a weekend); any DAFF source with
status `error` on two consecutive days; the spreadsheet URL
returning anything but 200 on two consecutive days; `placement_stats.unplaced` above zero. State for
the "consecutive days" rule lives in the canary's own state file. The canary is registered so
`doctor.py --full` reports it.

### 4.3 Visits

- Vercel Web Analytics: Alex enables it in the project dashboard; the page adds
  `<script defer src="/_vercel/insights/script.js"></script>`. The script and its beacon are same-origin,
  so the CSP (`script-src 'self'; connect-src 'self'`) needs no change.
- Search Console: register `https://www.birdflutracker.org/` with `gsc_add_site.py` after DNS TXT
  verification. The registrar and DNS host are verified, not assumed, during the plan.
- A `sitemap.xml` listing `/`, `/about` and `/history` is added and submitted.

### 4.4 Ops conventions and file paths

From the read-only survey of `~/Library/LaunchAgents` and `~/agency-engine` on 30 September:

**The nightly refresh job (a).**

- Every agency-engine job runs through the wrapper `~/agency-engine/run_job.sh`
  (`ProgramArguments = [run_job.sh, <label>, <interpreter>, <script>, <args>]`). The wrapper writes
  the heartbeat `data/heartbeats/<label>.json` the doctor reads, and on a non-zero exit fires
  `notify.py durable "INGEST FAILED: <label>"`, adding `--no-push` when the job already pushed its
  own alert. So the job script itself stays plain and portable: no notifier calls, exit non-zero on
  failure.
- Script: `scripts/nightly-refresh.sh` in this repo, so it is versioned with the pipeline (the
  survey suggested `~/dev/groundwork/internal/scripts/h5-build-push.sh`; the repo location wins
  because the script is part of the public project and contains nothing machine-specific). Shape
  copied from `~/.claude/scripts/auto-backup-claude.sh`, the one existing job that pushes: `set -u`,
  a lock file under `~/agency-engine/locks/` because the job commits, `git pull --ff-only` first (the
  cloud cron may have committed), run the build, skip when `git status --porcelain -- site/data` is
  empty, a staged-secret grep guard before commit, `git commit` and `git push origin main`, `exit 1`
  on any failure. A fetch failure during DarkWake (no network) is exit 0 with "no changes"; the canary
  judges the outcome in the morning.
- Plist: `~/Library/LaunchAgents/com.alex.h5-build-push.plist`, label `com.alex.h5-build-push`,
  `RunAtLoad false`, `WorkingDirectory /Users/Alex/dev/h5-bird-flu-tracker`, `StartCalendarInterval`
  `Hour 19, Minute 45` (local time), `EnvironmentVariables` `PATH` set to
  `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin` (no launchd job uses node yet; this is the first,
  so the explicit PATH matters), logs at `~/agency-engine/logs/launchd_h5_build_push.stdout.log` and
  `.stderr.log`. The `git-drift-tripwire` scans only `~/dev/groundwork/clients`, so these automated
  commits will not trip it.
- Binaries: `/usr/local/bin/node` (Homebrew symlink, currently 25.8.1) and `/usr/local/bin/python3`
  for the notifier, both hardcoded as every other job does.
- Git: the remote is HTTPS and pushes authenticate through the macOS keychain credential helper
  (`gh auth status` shows the token in the keyring; there is no GitHub SSH key). Identity comes from
  the global git config. Nothing new to store.

**The freshness canary (b).**

- File: `~/agency-engine/canary_birdflu_freshness.py`, following `canary_contact_form.py`: shebang
  `#!/usr/bin/env python3`, a module docstring naming the silent failure it guards and a `Usage:`
  block, `argparse` with `--dry-run` (probe and print, no record, no alert), `main()` returning 0 or
  1, `sys.exit(main())`.
- Alerting: `from notify import notify_durable` with signature
  `notify_durable(title, message, dedup_key=None, priority="high", tags=None, push=True, job_alert=False)`.
  Dedup is once per calendar day per `dedup_key` (marker files under `data/.ntfy/`), and only a
  delivered push consumes the slot. Use `dedup_key="birdflu-freshness"`.
- Health record: `import ingest_validate as iv; iv.record_run("canary_birdflu_freshness", "birdflu",
  status, ...)` for the `ingest_runs` row, and `db.record_ingest_health("canary_birdflu_freshness",
  "birdflu", success, error)` for the `ingest_health` row that the doctor's `heartbeat_fresh`
  assertion reads. Gather the HTTP results before any database write; never inside a transaction.
  Alerts follow the tested channel order: `logs/alerts.log`, then ntfy, then the macOS banner last.
- State for the consecutive-day rules: `~/agency-engine/data/birdflu_canary_state.json`, plain
  `json.load` and `json.dump`, as `billing_tripwire.py` does with its `_seen.json` file.
- Registration: append two dicts to `REGISTRY` in `~/agency-engine/health_registry.py`, one per
  job (`label "h5-build-push"`, `kind "ingest"`, `schedule "daily 19:45"`; `label
  "birdflu-freshness-canary"`, `kind "canary"`, `schedule "daily 08:30"`; both with `exit_codes
  {0: "healthy", 1: "failure"}` and a heartbeat assertion as `contact-form-canary` has).
  `doctor.py --check-cadence` flags a loaded job that is not in the registry, so registration is not
  optional. The job inventory in `~/.claude/status/operating-cadence.md` gets both rows.
- Plist: `~/Library/LaunchAgents/com.alex.birdflu-freshness-canary.plist`, label
  `com.alex.birdflu-freshness-canary`, through `run_job.sh`, daily 08:30 local (the morning after the
  19:45 run and after the cloud cron), logs at
  `~/agency-engine/logs/launchd_birdflu_freshness_canary.{stdout,stderr}.log`, copied from
  `com.alex.lead-canary.plist`.

**Gotchas that apply** (from the operating-cadence notes): gather every network input before any
`agency.db` write, never inside a transaction; alerts go log, then ntfy, then the detached banner, and
a wrapper must never double-push; jobs that fire during DarkWake can run without network, so the refresh
script treats a fetch failure as "no changes" and lets the canary judge the outcome the next morning.

## 5. The site

### 5.1 Information architecture

| Route | Purpose |
| --- | --- |
| `/` | The map, the panel, the filter bar, the scrubber, the drawer, the footer strip. Nothing else. |
| `/about` | New. The three counting bases in one table, sources and method, placement, eras, caveats (dated), licences, how to report a sick bird, the contact for corrections. |
| `/history` | Existing timeline page, restyled with the shared header and copy pass. |

### 5.2 The map page

The map fills the viewport. The Leaflet map, its marker geometry, jitter, true-scale rings and zoom
handling are kept from the current `app.js` (the hardest-won code in the repo, see section 5.6).

**Panel** (top-left on desktop, max 320 px; a bottom sheet on phones that opens to half height):

1. Site name, and links to About and History.
2. One headline sentence generated from data: "H5 bird flu has been confirmed in 668 wild animals
   across 7 jurisdictions since June 2026." Numbers, not adjectives.
3. Three figures, each with its basis and date in small type: **Confirmed events** (official dataset,
   as at 4 pm 29 Sep); **Jurisdictions affected** (count, with the list on hover or tap); **Latest
   sampled** (date, with the locality).
4. A freshness line: "Data checked 19:45 AEST tonight" in the normal state; "Data last updated 3 days
   ago" in carmine when the canary thresholds are crossed; "Official figure from 29 Sep; the
   department has not published since" when the as-at is old but the run is fresh.
5. "How this is counted" linking to `/about`.

**Filter bar** (below the panel on desktop, a scrollable row above the sheet on phones):

- Layer: Official events (668) · WOAH notifications (393) · World. Single select.
- Timeframe: 30 days · 90 days · Since June 2026 (default).
- Species: chips for the top six species by count, plus "All".
- A small toggle "Show resolved H7 poultry outbreaks (2024 to 2025)", off by default, which adds those
  records in grey and adds a one-line note to the panel.

**Scrubber** (a strip along the bottom edge on desktop, above the sheet on phones):

- A date slider from 15 June 2026 to the dataset date, resting at the dataset date on load so the
  map opens complete. Dragging shows records sampled on or before the date; a play button replays from
  the start at roughly one week per second. A tiny cumulative sparkline of the dataset sits under the
  track. `prefers-reduced-motion` disables play and keeps the slider.
- The scrubber counts what the map shows and nothing else.

On phones the panel, the filter bar and the drawer share one bottom sheet with three states:
collapsed (headline and the three figures), half (filters and the scrubber), expanded (the drawer for
the open record, which replaces the sheet's content until closed). The map is never covered above
half height.

**Drawer** (right edge on desktop, 360 px; the sheet's expanded state on phones), opened by a marker:

- Species in plain English, scientific name in italics, the 3D figure (section 6), locality and LGA
  and jurisdiction, date sampled (or "first published <date>"), the record id linking to the dataset,
  the placement sentence, and for WOAH-layer records the FAO event id and notification date.
- A cluster click lists its records in a compact list; selecting one opens it.
- The drawer is a dialog: focus moves in, Escape closes, the marker regains focus.

**Footer strip**: the hotline in bold, "Not medical advice", "Sources", "GitHub". Nothing else.

**Empty and error states**: a run that fell back shows a carmine banner at the top of the panel naming
the date of the data on screen. A fetch failure in the browser shows the same banner with a retry.

### 5.3 Copy rules

- Every sentence on the map page earns its place. Target: under 120 words visible before any
  interaction, excluding figures and labels.
- Numbers first, then basis, then date. "668 confirmed events, official dataset, as at 29 Sep."
- No hedging paragraphs on the map page. A caveat is one line with a link to its `/about` anchor.
- Plain species names in text; scientific names only in the drawer.
- No em dashes anywhere. Dates as "29 Sep 2026" in the UI and ISO in data.
- The public-health lines that must stay, verbatim in meaning: the hotline, "do not touch or move sick
  or dead birds", "not medical advice", and the current human-risk assessment with its source and date.
- `/about` is written to be read: short sections with anchors, one table for the three bases, and the
  caveats each carrying the date they were last true.

### 5.4 Identity and visuals

- Kept: white paper, ink, one carmine, Source Code Pro. Carmine means the live outbreak and nothing
  else. Birds are ink only.
- Marks: current-era official events are carmine squares sized by precision as in 3.3; WOAH records are
  ink rings; resolved H7 records are grey; world records are small ink dots.
- The hero photograph is retired from the map page (the map is the hero). The tern photo and its
  credit move to `/about`.
- A new Open Graph card is rendered from the map plus one ink tern.

### 5.5 Performance and accessibility

- First load budget 350 KB compressed before tiles: Leaflet, app, styles, `summary.json`, `au.json`.
  World and US data stay lazy (existing split). three.js and the GLBs load after the map is interactive
  and only when the gates in 6.4 pass.
- Lighthouse mobile performance 90 or better on the map page.
- Keyboard: every control reachable; the slider is a native range input; the drawer is a dialog; the
  map's markers are reachable through a "List records" toggle that renders the current view as a real
  table (the existing table code, compacted) for screen readers and for anyone who prefers a list.
- Colour never carries meaning alone: precision and layer are also shape.

### 5.6 What survives from the current front end

From the read-only survey of `site/` on 30 September:

Keep verbatim: `styles.css` tokens (`:root`), the tags, marks and controls sections, the map block
and every Leaflet override (each cites the vendored rule it beats), and the reduced-motion and print
rules. In `app.js`: the helpers and era functions, the filter pipeline (`matches`, `inView`,
`searched`, `render`), the marker geometry (`markerRadius`, `placements`, `jitter`, `drawAreas`,
`trueScaleVisible`, `metresPerPixel`, `onZoomEnd`), the loaders (`fetchJson`, `loadPart`,
`ensureRegionData`, `boot`), and `icons.js` whole.

Adapt: `initMap` (full viewport), `buildControls` (filter bar), `renderLegend` and `renderMapNote`
(one line each, link to `/about`), `columns` and `renderList` (drawer and the list toggle), `render`
(add drawer and scrubber), `popupHtml` (becomes the drawer body).

Drop from the map page: `renderSituation` (356-490), `historicalDiscloseHtml` (495-532),
`renderOfficialGap` (541-650), `newsLeadHtml` (657-669), `renderOfficialStatement` (673-727),
`renderListFoot` (1312-1322), `renderNews` (1353-1382), `renderSources` (1393-1444), and in
`styles.css` the news and sources lists (1286-1361), the `.sb-*` and `.og-*` block (1407-1498) and
the legacy aliases (1499-1515). Their facts become `/about` content generated from `summary.json`
where they are data, and static copy where they are explanation.

Keep despite living among dropped neighbours: `dataSkew` (1454-1490) and the banner half of
`renderMeta` (1492-1578) are correctness, not copy; `renderViewFigures` (1013-1062) becomes the
compact panel; `figureHtml` (346) stays.

Lift into a shared `site/lib.js`: `$`, `esc`, `safeUrl`, `plural`, date formatting (one formatter,
replacing the two that disagree today), and `citationsHtml` from `history.js` (the drawer needs a
citation renderer and `app.js` has none). `history.js` and the new `about.js` import it; `app.js` too.

One cleanup before the rebuild touches markers: `icons.js` has two builders for the same SVG
(`mark()` at 206 is dead; `catMark()` at 278 rebuilds it to attach the `.icon` class). Collapse to one.

## 6. Birds

### 6.1 What they are for

Two appearances, both quiet. One: on first load, after the map is interactive, a single greater crested
tern flies across the map from lower left to upper right over about four seconds, in ink line, and is
gone. Two: in the drawer, the species of the opened record turns slowly on a small canvas and can be
dragged. Nothing else moves. Birds are never anchored to coordinates and never imply a location.

### 6.2 Species

Greater crested tern (*Thalasseus bergii*, the outbreak's dominant species and the local-transmission
species), brown skua (*Stercorarius antarcticus*, the first detection), southern giant petrel
(*Macronectes giganteus*), silver gull (*Chroicocephalus novaehollandiae*). Every other species in the
drawer uses a generic seabird silhouette derived from the tern, labelled as such in the manifest.

### 6.3 Style spec (the acceptance standard for every render)

- Ground is paper white; lines are ink `#101010`, about 1.2 px at 1x; surfaces are flat white; no
  gradients, no shadows, no texture, no colour on any bird. Carmine never touches a bird.
- Simplified forms that stay ornithologically honest: the tern is slender with long narrow wings, a
  forked tail and a black cap read as a filled ink shape; the skua is heavy and broad-winged with white
  wing flashes; the giant petrel has a long tube-nose bill and long straight wings; the silver gull is
  compact with rounded wings. A birder should recognise each at a glance.
- Budgets: 3,000 triangles or fewer per species, one mesh, one material, one armature with a bone chain
  per wing (or three shape keys: glide, down, up). A 24-frame flap cycle at 24 fps, exported as the
  animation `flap`, and a static pose `glide`.
- Asset budgets: GLB 60 KB or less each; WebM loop 150 KB or less; APNG 300 KB or less; PNG still 40 KB
  or less. All bird assets together under 1 MB, all lazy.

### 6.4 Runtime

- `three` and `GLTFLoader` are bundled with esbuild (a dev dependency) into one ES module,
  `site/assets/three/birds.js`, committed. No import map is needed, so the CSP is untouched: the module
  loads from `'self'`, the GLBs are fetched from `'self'`. `npm run bundle` regenerates it, and CI
  checks the committed bundle matches the source.
- The ink look is done in the material: flat white with an inverted-hull outline (a second draw of the
  mesh, back faces, ink colour, scaled by 1.02), no lighting. It matches the Freestyle renders.
- Loading: a deferred `<script type="module">`, started after the map's first render on
  `requestIdleCallback`. Gates, all of which must pass for the flight and the turntable: WebGL 2
  available; `prefers-reduced-motion` not set; `navigator.connection.saveData` not set;
  `navigator.deviceMemory` absent or 4 or more. When a gate fails: reduced motion shows the PNG still
  in the drawer and no flight; no WebGL or a low-end device shows the APNG loop in the drawer and no
  flight. The page never waits on the birds.
- The flight is a transparent canvas over the map container with `pointer-events: none`, removed and
  its renderer disposed when the flight ends. The drawer uses one small renderer instance, reused.
- The flight runs once per session (`sessionStorage`), never on the About or History pages.

### 6.5 The Blender workstream

A directory `blender/` in the repo, driven headless (`blender -b --python`), Blender 4.5 LTS. The
machine has an Intel Iris GPU and little free disk, so every render uses the Workbench engine with
Freestyle line art (a 640 by 480 transparent test frame took 15 s), never Cycles, and intermediate PNG
sequences live in scratch, not in the repo.

Subgoals, each with its own acceptance check:

1. **Style board.** `blender/STYLE.md` restates 6.3 with reference descriptions per species (no
   copyrighted images in the repo) and a contact sheet of three views per species rendered from the
   first models. Accepted when a vision review against the style spec passes and Alex approves the
   silhouettes. This gate comes before any rigging.
2. **Models.** `blender/build_birds.py` builds each species parametrically from `blender/species.json`
   (body, head, bill, wing and tail parameters), so a review note becomes a parameter change, not a
   remodel. Accepted at the triangle budget with a clean manifold check.
3. **Motion.** Wing rig and the 24-frame flap cycle, glide pose. Accepted when a flap contact sheet
   and a WebM loop pass vision review and Alex's second pass.
4. **Export and renders.** `blender/export.py` writes the GLBs; `blender/render.py` writes the still,
   the APNG and the WebM (VP9 with alpha, encoded with ffmpeg from the PNG sequence) into
   `site/assets/birds/`; `blender/manifest.json` lists every asset with size, triangle count, source
   script and licence (all original, released under the repo's MIT licence).
5. **Handover.** The runtime (6.4) consumes the manifest. Integration is accepted when the flight and
   the drawer turntable run on Safari and Chrome on macOS, Safari on iPhone, and Chrome on Android,
   and every gate's fallback is exercised.

## 7. Testing and verification

- `node:test` under `pipeline/test/`, run by `npm test`, on fixtures captured on 30 September 2026
  (`H5_bird_flu_events.xlsx`, `latest-data.html`, `H5-bird-flu-updates.html` and `.json`): the
  spreadsheet parser (columns, `#N/A` dates, `Other` jurisdiction, record classes), the latest-data
  parser (total, per-jurisdiction, as-at), the series and milestone extractors, the gazetteer lookup
  (hit, LGA disambiguation, normalised hit, miss to LGA, miss to state, never unplaced), era stamping
  of DAFF records, `first_seen` and `withdrawn` handling, the row-count assertion, and `--verify`.
- CI runs `npm test`, `node --check` on every script, `build.mjs --verify` on the committed data, and
  the bundle check. CI no longer fetches live sources.
- Front end: a Playwright pass by a subagent on the preview deployment: the panel figures equal
  `summary.json`; each layer, timeframe and species chip changes the marker count as expected; the
  scrubber's count at the dataset date equals the layer count; the drawer opens from a marker and from
  the list, and closes on Escape; the flight runs once and its gates fall back correctly under
  reduced motion and with WebGL disabled; keyboard-only navigation reaches every control.
- Screenshot matrix at 390, 768 and 1280 px by a subagent, reviewed against 5.2 and 5.4.
- Lighthouse mobile on the map page, performance 90 or better.
- Data: the checklist in `docs/DATA_SOURCES.md` is rewritten for the new sources, and its first item is
  the live `freshness` block.
- Rebuild ships to a preview deployment first; Alex reviews on his phone; then `main`.

## 8. Workstreams and dispatch

| Stream | Scope | May edit | Isolation |
| --- | --- | --- | --- |
| A. Data backbone | 3.1 to 3.6, `--verify`, tests | `pipeline/**`, `docs/DATA_SOURCES.md`, `package.json` (scripts and dev deps only) | worktree |
| B. Page shell and copy | 5.1 to 5.6, `/about`, `site/lib.js`, OG card, sitemap | `site/index.html`, `site/about.html`, `site/history.html`, `site/app.js`, `site/about.js`, `site/history.js`, `site/lib.js`, `site/styles.css`, `site/sitemap.xml`, `site/assets/img/**` | worktree |
| C. Blender birds | 6.2, 6.3, 6.5 subgoals 1 to 4 | `blender/**`, `site/assets/birds/**` | worktree |
| D. three.js runtime | 6.4, 6.5 subgoal 5 | `site/assets/three/**`, `site/birds.js`, the two integration points in `site/app.js` named by B | after B and C1 |
| E. Ops | 4.1 to 4.4 | `scripts/nightly-refresh.sh`, `vercel.json`, `.github/workflows/**`, `docs/STATUS.md`, `docs/DATA_SOURCES.md` (checklist section only), and outside the repo: the two plists, `~/agency-engine/canary_birdflu_freshness.py`, `~/agency-engine/health_registry.py` (append only), `~/.claude/status/operating-cadence.md` (two rows) | none (home directory) |

Rules: every agent gets its allowlist in the prompt and stops to ask before touching anything else;
no agent runs git; the parent verifies worktrees with `git worktree list`, inspects `git diff --stat`
on return, and re-runs every claimed verification. Three or more agents in one wave go through
`/swarm-orchestrate`. Streams A, B, C and E start together; D starts when B has a shell and C has an
accepted silhouette GLB; integration and the QA of section 7 follow; then the copy pass on all three
pages together, so the voice is one voice.

## 9. Risks and their answers

| Risk | Answer |
| --- | --- |
| The Composite Gazetteer's bulk download is not what we expect | First task of the plan verifies it; ABS SAL 2021 and Nominatim are the fallbacks; the cache format is source-agnostic. |
| The department changes its pages or the spreadsheet again | Fixture-tested parsers fail loudly; the canary alerts on parse failure and on a missing spreadsheet; the previous day's committed data stays live. |
| The department revises or withdraws records | `withdrawn` handling in 3.2; counts follow the current dataset; the drawer says "withdrawn on <date>" for 30 days. |
| Procedural birds look poor | The silhouette gate in 6.5 comes before rigging; the parametric build makes revision cheap; if a species cannot be made to read, it uses the generic silhouette rather than shipping a bad one. |
| three.js on older phones | Gates in 6.4; image fallbacks; the page never depends on the birds. |
| The Mac is asleep at 19:45 | The GitHub cron is the second attempt; the canary alerts on the outcome; a NAS runner is the escalation path if two misses happen in a month. |
| Repo growth from daily data commits | About 30 MB a year; revisit at 100 MB. |
| Cloud IPs are also blocked for the spreadsheet | Expected; the residential runner is primary and the cloud run simply falls back. |

## 10. Decisions recorded

- Approach 2 (map-first shell) plus the date scrubber. Alex, 30 Sep 2026.
- Live three.js birds in this build, "quiet" restraint (one flight, drawer turntable), no ambient
  flock. Alex, 30 Sep 2026.
- The official DAFF dataset is the Australian backbone; FAO/WOAH is a separate layer; counts on
  different bases are never merged. This spec.
- The pipeline's primary runner is the Mac; Vercel's build becomes verify-only; last-good is the last
  successful run because every successful run is committed. This spec.
- Emergency patch shipped before the rebuild (commit `5e0ebc6`). Alex, 30 Sep 2026.

## 11. Needs Alex

1. Enable Web Analytics on the Vercel project (Analytics tab, Enable).
2. Approve the 19:45 AEST nightly slot, or name another.
3. Two visual passes on the birds: silhouettes, then motion.
4. A phone review of the preview deployment before it goes to `main`.
5. The DNS TXT record for Search Console, once the plan confirms where the domain's DNS lives.
