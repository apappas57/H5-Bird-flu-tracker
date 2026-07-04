# Bird Flu Tracker — Platform Blueprint

> Status: living document. Supersedes the six exploratory specs (data-model, platform-os, agentic-os, frontend-ia, coverage, phase1). Where a spec disagreed with the code that actually ships, **the shipped code wins** — several specs were written against a stale mental model and would re-do or regress committed work. This blueprint keeps only what adds user-visible value at low cost.

---

## 1. Vision & guiding principles

**Vision.** Become *the* "Bird Flu Tracker": a public, plain-language surveillance map that follows **all avian influenza** (every strain — H5Nx incl. H5N1 clade 2.3.4.4b, H7Nx, H9N2; HPAI + LPAI), is **extensible toward other zoonotic/emerging diseases**, covers **research fields** as sourced context, and is gradually fed by an **agentic OS** that discovers, ingests, normalizes, geolocates, verifies, and drafts data with minimal human effort.

**Principles (in priority order).**
- **Simplicity & function over fanciness.** No abstraction before the second real instance. The `disease` field is *already* the extensibility seam — don't build registries around one disease.
- **Accurate + every datum sourced.** Every record carries a resolvable `source_url`. Curation is load-bearing and time-sensitive; nothing publishes without provenance.
- **Cheap & serverless.** Static site + git-committed JSON + CI. No DB, queue, vector store, or paid API until a concrete consumer forces it.
- **Never blank the live site.** Deterministic `build.mjs` stays the single publisher, always writing valid output with last-good + curated fallback.
- **Backward compatible.** Additive schema fields with safe defaults; the frontend keys off `id` opaquely.
- **Deterministic-first, agents-second.** Authoritative CSVs don't need an LLM to "verify" them. Agents earn their place only where humans currently hand-curate (PDF/HTML sources).

---

## 2. Target architecture ("the OS")

The system is **already disease-agnostic at the schema level**. The near-term architecture is the current one, made complete — not a refactor.

### 2.1 Module map (what exists today)
```
pipeline/
  build.mjs              # orchestrator: run sources → merge curated → normalize → summary → write
  sources/index.mjs      # source configs (US APHIS CSVs; AU; each sets defaultSubtype/Pathogenicity)
  sources/generic.mjs    # reusable tabular collector (reads subtype/pathogenicity hints + cfg defaults)
  curated.json           # hand-curated WHO/WOAH/CDC/agency overlay (carries per-row subtypes)
  lib/schema.mjs         # makeRecord() — the stable record contract + enums/normalizers
  lib/geo.mjs            # place resolution from bundled centroids
site/
  data/{detections,summary}.json   # generated static API surface
  app.js, index.html, styles.css   # Leaflet map + list + filters
  assets/                          # bundled US/AU/world centroids + geojson
.github/workflows/       # ci.yml (validate on PR), refresh.yml (daily deploy-hook ping)
```

### 2.2 Disease / source registry — the seam, not a rewrite
- **Extensibility already exists** via the `disease` field on every record. A second disease = source configs that emit a different `disease` value + curated rows; no engine change.
- **DEFER** the `registry/diseases/*.json` + `registry/sources/<disease>/*.json` two-registry refactor, the `sources`→`collectors` rename, per-disease/region output sharding, and the `index.json` manifest. Those touch every file for zero user value at one disease. **Trigger to build them: the second real disease/source instance.**
- The one registry-shaped change worth doing *now* is validation, not restructuring: promote the vocabularies to **enums with normalization inside `makeRecord`** (§2.3).

### 2.3 Generalized data model (the record shape — already shipping)
`makeRecord()` (`pipeline/lib/schema.mjs`) emits this today. Host axis (`category`) and pathogen axis (`disease`/`subtype`/`strain`/`pathogenicity`) are **orthogonal** — never conflate them.

```jsonc
{
  "id": "poultry_us_ia_na_2026-05-01_H5N1_120000", // tuple incl. subtype → no cross-strain collision
  "disease": "Avian influenza",   // canonical string; see freeze below
  "subtype": "H5N1",              // HxNx, or null when only "H5" known
  "strain": "H5",                 // broad group derived from subtype: H5 | H7 | H9 | null
  "pathogenicity": "HPAI",        // HPAI | LPAI | null
  "category": "poultry",          // HOST axis: human | poultry | dairy | wild_bird | mammal
  "country": "United States", "country_code": "US",
  "admin1": "Iowa", "admin1_code": "IA", "locality": null,
  "lat": 42.0, "lng": -93.5, "level": "admin1",
  "date": "2026-05-01",
  "count": 120000,
  "flock_type": null, "species": null,
  "source": "USDA APHIS", "source_url": "https://…"
}
```

**Canonical-vocabulary freeze (settles the four-way spec conflict).** The shipped names are canonical:
- Field for subtype = **`subtype`** (`"H5N1"`), broad group = **`strain`** (`"H5"`), severity = **`pathogenicity`**, taxonomy key = **`disease`**.
- **Kill** `pathogen` (coverage's `pathogen="H5N1"` is wrong — the pathogen is influenza A, H5N1 is the subtype). **Kill** `strain="H5N1.2.3.4.4b"` (platform-os fusing clade into strain breaks the subtype regex + group derivation). `clade` (e.g. `2.3.4.4b`) is a *future* optional string, added only when a source supplies it.
- **`disease` must be normalized.** Today it defaults to the string `"Avian influenza"`, but three specs propose the slug `"avian_influenza"`. Two forms silently split `by_disease` into two buckets → latent double-count. **Add a `DISEASES` enum + normalization in `makeRecord` and pick one canonical form** before anything else. (Recommendation: keep the human-readable `"Avian influenza"` the code already ships, normalize case/whitespace to it.)

### 2.4 Storage & static-API surface — stay git-committed JSON
- **JSON in git is the datastore.** Free, diffable, auditable (every datum's provenance is a PR), CDN-cached by Vercel, zero infra. A DB is unjustified until record counts break git/Vercel limits — **defer**.
- **API = generated static files** at `site/data/{detections,summary}.json`. This *is* the public contract; it costs nothing.
- **Provenance = git history.** No separate audit DB.
- **Defer** per-disease/region sharding, `history.json` snapshots, and a `schema_version` manifest until a real consumer (a second disease, or a trend chart) exists.

---

## 3. The Agentic OS

**Core principle.** The agentic layer *produces* `curated.json`-style records via **PRs**; it never writes `site/data/*`. Deterministic `build.mjs` stays the single publisher and last line of defense. Everything runs in GitHub Actions — no servers, no DB. The artifact is a git commit + PR a human merges.

**Inverted phasing (fixes the biggest agentic-os mistake).** Do **not** start with LLM verification/adjudication over the existing USDA CSVs — those are the single authoritative source, so "cross-source agreement scoring" is vacuous and an LLM "verifying" the primary source only adds a hallucination surface, a recurring API bill, and the project's *first secret* to a pipeline that today has **zero deps and zero secrets**. Start where humans actually hand-curate.

### Agent roles (build only as each phase opens)
- **Assisted Curation (first real agent).** Reads curation-only sources (WHO DONs, ECDC/EFSA PDFs, CDC HTML), drafts `curated.json` rows with citations → opens a PR. **Never auto-merges.**
- **Source-Discovery.** Proposes new *official* feeds → human-approved allowlist. Never auto-ingests unknown domains.
- **Normalization / Geocoding.** Map raw → schema with strict JSON output + validator; reuse bundled centroids first, cache LLM/gazetteer misses to a committed `geo-cache.json` (one-time cost).
- **Research-Summarization.** Plain-language blurbs with inline citations, over *already-verified* records only.
- **Anomaly detection.** Statistical (not LLM) baseline deviation → raises a GitHub issue / optional banner.
- **Publishing/QA.** Runs `build.mjs`, diff-checks vs last-good against delta thresholds, opens the PR.

### Guardrails (mandatory)
- No record without a machine-verifiable `source_url` that QA fetches and confirms resolves.
- All LLM output schema-validated; invalid → dropped + logged, never published.
- **Hard human gate** on anything touching the time-sensitive curated path (the live AU H5N1 wild-bird cluster is *this week's* data — hallucinated dates/counts do the most public-interest damage here).
- Monotonic trust: unverified candidates can only *add*, never mutate/delete verified records. Full `agent_run_id` provenance.
- Deterministic last-good + curated fallback (already exists) if a run degrades.

### Provenance fields — add only when an agent writes them
The record's singular `source`/`source_url` is the current contract. **Defer** the `sources[]` array + `confidence` / `verification` / `first_seen` / `last_confirmed` fields until an agent actually populates them — introducing a parallel provenance shape now forks the contract the frontend reads for consumers that don't exist.

### Phasing
- **v0 (defer until Phase 1+2 shipped):** one Action, Assisted Curation over PDF/HTML sources → human-merged PR. Proves the loop. **No daily cron, no auto-merge, no LLM over CSVs.**
- **v1:** Source-Discovery allowlist + Normalization for 2–3 new official feeds; geo-cache; anomaly issues.
- **v2:** cross-source auto-merge for high-confidence records once calibration is validated; add provenance fields.

---

## 4. Coverage roadmap

Host sectors (`category`) are already modeled: human, poultry, dairy, wild_bird, mammal. Add backyard/captive and environmental (wastewater) as **sub-tags of existing categories**, not new categories.

### 4.1 Avian influenza — full strain coverage (the near-term goal)
Priority: **H5N1 (2.3.4.4b)** → other H5Nx → **H7N9/H7Nx** → **H9N2** → notifiable LPAI H5/H7.

| Source | Format | Access | Verdict |
|---|---|---|---|
| USDA APHIS (wild birds, mammals, dairy) | CSV | public | **scrape (live)** |
| USDA APHIS poultry | Tableau-only | — | **curate** until a CSV/API surfaces |
| WOAH / WAHIS (global animal, all strains) | portal / CSV | attribution | **scrape (semi)** — highest-value global gap-filler |
| FAO EMPRES-i / EMPRES-i+ | CSV/export | public + attr | **scrape** — best global animal coverage |
| WHO (human H5/H7/H9 DONs, risk assessments) | HTML/PDF | public | **curate** |
| CDC (situation, H5 human/wastewater) | HTML/JSON | public | **curate** (some scrapable) |
| ECDC / EFSA (quarterly EU reports) | PDF | public | **curate** |
| Australia DAFF / Outbreak.gov.au / Wildlife Health Australia | HTML | bot-blocked | **curate** (matches reality) |
| Nextstrain avian-flu | JSON | open | scrape — **Phase 3 label layer** |
| GISAID EpiFlu | DB | DAA | **link-out only, never ingest** |

### 4.2 Research fields — sourced context, not new pipelines
Static, curation-only cards (a heading + 2–4 sourced sentences + a "View on map" deep-link that pre-applies filters). No new data ingest. Set: human-case surveillance · mammalian spillover · genomic & clade tracking (link out to Nextstrain/GISAID) · transmission & risk assessment · economic & agricultural impact · vaccines & countermeasures.

### 4.3 Adjacent diseases — defer behind the agentic layer
Expand only where sources mirror the AI pipeline (same agencies, same host-event shape): **mpox** (WHO/CDC/OWID CSVs) and **MERS-CoV** (WHO DONs) are the justified shortlist. **Do not build** rabies, Nipah, Ebola/Marburg, Lassa — high-effort, different shapes, low incremental value — until assisted ingestion exists. The `disease` field is the seam; populate later.

---

## 5. Delivery roadmap

### Phase 0 — Schema-vocabulary freeze (½ day, unblocks everything)
- Add `DISEASES` enum + `disease` normalization in `makeRecord` so casing/whitespace can't split counts (§2.3).
- Confirm canonical fields (`disease`/`subtype`/`strain`/`pathogenicity`); no `pathogen`, no clade-in-strain.
- **Exit:** `by_disease` cannot fork; one short decision recorded here.
- Files: `pipeline/lib/schema.mjs`.

### Phase 1 — Broaden to all avian influenza (THE near-term win, ~½–1 day)
The pipeline is already multi-strain; remaining work is a small pipeline gap + frontend + copy. **Exact change list:**

1. **Source defaults** — `pipeline/sources/index.mjs`: confirm `us-poultry`, `us-wild-birds`, `us-dairy`, `us-mammals` each set `defaultSubtype:'H5N1'`, `defaultPathogenicity:'HPAI'`, and each `fields` map includes `subtype: ['subtype','serotype','strain']` so a real APHIS column wins over the default. Leave `au-avian-influenza` with no default (mixed H7/H5; curated overlay carries subtypes). *(Per critique, defaults are largely already committed — audit, don't re-add.)*
2. **Summary counts** — `pipeline/build.mjs` (~L96–120): add `by_subtype`, `by_strain`, `by_disease` alongside `by_category`/`by_country` (~15 lines). This is a hard dependency for the chips and nobody's built it yet.
3. **Wire the inert strain filter** — `site/app.js`: `#strainBtns` chips exist in HTML but have **no click listener** and the control has one "All" chip. Add chips `All / H5 / H7 / H9 / Other`; add a listener mirroring `#categoryBtns` (~L228) that sets `state.strain`, resets `shown`, `setActive`, `render()`. `filtered()` already guards `state.strain`; records with `strain:null` pass `all`, excluded only when a specific strain is selected.
4. **Surface subtype** — list: add a `Strain` column (`<td>${r.subtype || '—'}</td>`) after Type, bump empty-state `colspan`. Popup: add a subtype·pathogenicity line, truthiness-guarded (H5N2 Mexico human death must be distinguishable from H5N1).
5. **Copy/naming audit** — `site/index.html`, `README.md`: title/`og:title`/`<h1>` already say "Bird Flu Tracker" — grep for stray "H5"/"H5N1" language in meta description, tagline, About paragraph, map aria-labels; broaden to "avian influenza — all strains (H5, H7, H9; HPAI and LPAI)". Fix `repoLink` casing.
6. **Verify** — `node pipeline/build.mjs`, then drive `site/`: chips filter, Strain column populates, popup shows subtype, H7 Australia rows appear under `H7`, selecting a strain never blanks the site when null-subtype data loads.

- **Exit:** live site filters by H5/H7/H9/Other, shows subtype in list + popup, reads "Bird Flu Tracker" throughout; `ci.yml` green; no schema/curated changes required.
- Files: `pipeline/sources/index.mjs`, `pipeline/build.mjs`, `site/app.js`, `site/index.html`, `README.md`.

### Phase 2 — Research section + deep-links (~1 day)
- Add **URL-param filter state** (`?cat=human&strain=H5N1`) first — the research deep-links depend on it.
- Ship the **Research** section as static Markdown-driven cards (§4.2) with "View on map" deep-links. Slim top nav (Map · List · Research · About/Sources/Methods); keep single-page, hash-anchored. Readable without JS.
- Keep marker color on **host category** only; encode strain via filter + popup text (two color encodings would break the colour-blind-safe design).
- **Exit:** research cards render, each deep-link pre-applies filters via URL on load.

### Phase 3 — Global deterministic coverage (needs CI/runner access)
- Stand up **WOAH/WAHIS** + **FAO EMPRES-i** as new `tabular`/`curated` sources (dev sandbox can't reach gov sources — test from CI/Vercel runners). Highest-ROI coverage work; **no LLM needed**.
- **Exit:** global animal AI events (non-US) appear on the map, each sourced.

### Phase 4 — Agentic OS v0 (assisted curation)
- One Action: Assisted Curation over WHO DON / ECDC PDFs → human-merged PR (§3). Human-gated, no cron, no auto-merge.
- **Exit:** at least one curated event lands via an agent-drafted, human-reviewed PR with citations.

### Phase 5+ — Extend (defer until triggered)
- Registry refactor + sharding/manifest (trigger: 2nd disease/source instance).
- Agentic v1/v2, provenance `sources[]`/`confidence`, `clade`/genomic ingest, mpox/MERS, disease selector UI, LPAI live scrapers, colour-by-strain.

**Do NOT build (any phase):** LLM adjudication over single-authoritative-source CSVs; any DB/queue/vector store; auto-merge without human review; the `pathogen="H5N1"` or `strain="H5N1.2.3.4.4b"` field designs; multi-page routing, user accounts, embedded phylogenetic viewers.

---

## 6. Open decisions for the owner

1. **Canonical `disease` value:** keep the shipped human-readable `"Avian influenza"`, or switch to the slug `"avian_influenza"`? (Blueprint recommends keeping shipped; either way, normalize in `makeRecord` — Phase 0.)
2. **Strain chips vocabulary:** the group-based `All / H5 / H7 / H9 / Other` (zero schema change, matches shipped `strain` field) vs. a subtype-level list. Blueprint picks the group form for Phase 1.
3. **Agentic OS timing & budget:** when to start Phase 4, and the acceptable monthly Anthropic API ceiling + which Actions secret holds the key (the project's first secret).
4. **Curation ownership:** who reviews/merges agent-drafted curated PRs, and the SLA — since curated data is time-sensitive and public-facing.
5. **WOAH / FAO attribution & licensing:** confirm attribution terms before ingesting; where attribution text surfaces on the site.
6. **Adjacent-disease appetite:** commit to mpox/MERS as the only near-term non-AI diseases, or hold the line at avian influenza until the agentic layer is proven?
