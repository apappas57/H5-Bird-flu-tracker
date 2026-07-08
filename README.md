# Australian Bird Flu Tracker

A simple, public-interest website that shows where **avian influenza (bird flu)** is being
detected in **Australia**, with the wider world for context, on a map and in a plain-language list.
Built for the general public: no jargon, no login, fast to load.

**Live:** [birdflutracker.org](https://birdflutracker.org)

> **Function over fanciness.** It is a static website (nothing to run or pay for) whose data is
> refreshed automatically each day by a small Node.js pipeline.

## Why this exists

In **June 2026**, high pathogenicity **H5N1 (clade 2.3.4.4b)** reached Australian wild birds for the
first time, carried down the Southern Ocean flyway by migrating seabirds. Australia had been the last
continent free of the current global panzootic. This tracker follows that unfolding situation using
free, official data, and keeps the world in view so you can see where the virus is coming from.

The risk to the general public is currently **low**. This site is not medical advice; see the
disclaimer below.

## What it shows

- **An Australia-first map** with a coloured point for each detection. H5N1 detections carry a
  carmine ring so the strain of current concern stands out. Region presets for Australia / Global /
  United States.
- **Headline numbers** for Australia: H5N1 wild-bird detections, states affected, days since the
  first detection, the historical H7 poultry outbreaks, human cases, and the global human-case total.
- **A current-status banner** summarising the situation in one glance, with sources.
- **A searchable, sortable list** of individual detections with date, type, **strain** (H5N1 / H7),
  place, and a link to the source.
- Five detection categories, colour-coded with a colour-blind-safe palette:
  People, Poultry, Dairy cattle, Wild birds, Mammals.

## Data sources

All free, no API keys. Verified live on 8 July 2026.

| Role | Source | What it provides |
| --- | --- | --- |
| **Primary backbone** | [FAO EMPRES-i+](https://empres-i.apps.fao.org/) | Global animal disease events including Australia, with coordinates, near-real-time. It ingests WOAH/WAHIS notifications, so it already carries Australia's official events. |
| **US wild birds** | [USDA APHIS wild-bird surveillance](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/wild-bird-surveillance-dashboard) | US wild-bird H5/H7 detections with real subtype and county points. |
| **Human context** | [Our World in Data](https://ourworldindata.org/grapher/h5n1-flu-reported-cases) | WHO global human-case totals, including Australia. |
| **Curated anchors** | WOAH, WHO, CDC bulletins | A small, hand-maintained set of well-documented human cases. |

Australia's own government portals (Wildlife Health Australia, outbreak.gov.au, DAFF, state
departments) publish only as HTML or PDF and block automated access, so they are used as cross-checks
rather than pipeline inputs. FAO EMPRES-i already carries their WOAH notifications. Full detail and
the verification checklist are in **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)**.

## Architecture

```
 pipeline/build.mjs   (daily, GitHub Actions + Vercel deploy hook)
   |
   |-- sources/fao-empresi.mjs   FAO EMPRES-i+ : Australia (2024+) and 90-day world context
   |-- sources/usda-wildbird.mjs USDA APHIS ArcGIS : US wild-bird H5/H7 detections
   |-- sources/owid-human.mjs    Our World in Data : global human-case context
   |-- curated.json              hand-maintained human-case anchors
   |-- au-status.json            editorial current-status facts (sourced)
   |
   v  normalise (subtype + point-level geo) -> dedupe -> sort
 site/data/detections.json  +  site/data/summary.json
   |
   v
 site/  (static Leaflet + vanilla JS, "Flyway" visual identity)  ->  Vercel
```

- **Never goes blank.** If a source is unreachable on a given day, the run falls back to the last
  committed data plus the curated overlay.
- **Transparent.** Every run records per-source status in `summary.json`, shown on the page under
  "Data sources". Refreshed data is committed to git, so there is a full history.
- **Honest about strain.** FAO's feed does not carry a subtype. Australian subtypes are assigned by an
  explicit, sourced rule (see `pipeline/sources/fao-empresi.mjs` and DATA_SOURCES.md): the 2024 to 2025
  poultry outbreaks were H7; the June 2026 wild-bird incursion is H5N1 clade 2.3.4.4b per WOAH.

## Local development

```bash
node pipeline/build.mjs   # refresh site/data/*.json from the live sources
npm run serve             # preview at http://localhost:8080
```

No dependencies to install: the pipeline uses Node's built-in `fetch` (Node 20+).

## Deploy

Hosted on **Vercel** (config in `vercel.json`: build `node pipeline/build.mjs`, output `site/`). Vercel
pulls fresh data at build time. A daily [`refresh.yml`](.github/workflows/refresh.yml) workflow pings a
Vercel deploy hook to rebuild; [`ci.yml`](.github/workflows/ci.yml) validates the pipeline on every PR.

## Contributing

Issues and pull requests are welcome, especially:

- new free, machine-readable, official sources (particularly Australian ones);
- corrections to any detection, strain label, or caveat;
- accessibility and mobile improvements.

Please keep the tone calm and factual, and cite a source for any data change.

## Disclaimer

Not medical advice. Figures are aggregated from public reports and may lag or be revised by the
source agencies. For guidance, consult the [Australian CDC](https://www.cdc.gov.au/diseases/bird-flu-avian-influenza),
[DAFF](https://www.outbreak.gov.au/emerging-risks/high-pathogenicity-avian-influenza), or your state
health department. **To report sick or dead wild birds, call the Emergency Animal Disease Hotline on
1800 675 888.**

## License

[MIT](LICENSE). Map data (c) OpenStreetMap contributors. Source data (c) the respective agencies:
FAO EMPRES-i (CC BY), USDA APHIS (US public domain), WHO via Our World in Data (CC BY).
