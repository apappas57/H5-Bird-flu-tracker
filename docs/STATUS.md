# Project status

_Last updated: 8 July 2026._

## Now

Australia-first rebuild. The tracker is centred on Australia, covers all avian influenza with H5N1
highlighted, and pulls live from free official sources:

- **FAO EMPRES-i+** is the automated backbone (Australia from 2024, plus a 90-day global context
  layer). It carries the June 2026 H5N1 wild-bird detections and the 2024 to 2025 H7 poultry history.
- **USDA APHIS** ArcGIS provides US wild-bird detections with real H5/H7 subtype.
- **Our World in Data** provides global human-case context.

The pipeline runs `mode: live`. The schema has a `subtype` field and point-level coordinates. The site
has an Australia default view, a sourced current-status banner, a strain filter and column, and keeps
the "Flyway" (Audubon) visual identity.

See [DATA_SOURCES.md](DATA_SOURCES.md) for endpoints, the subtype rule, and caveats, and
[../docs/superpowers/specs/2026-07-08-australia-first-tracker-design.md](superpowers/specs/2026-07-08-australia-first-tracker-design.md)
for the full design.

## Roadmap (nice to have)

- CIDRAP news ticker (verified free RSS).
- A bundled Australian gazetteer for any future name-only sources.
- Opportunistic pollers for the (currently empty) NSW DPIRD ArcGIS layer and data.gov.au, in case they
  publish structured avian-influenza data.
- Marker clustering for the dense US wild-bird layer.

## Run it locally

```bash
node pipeline/build.mjs   # refresh data from the live sources (Node 20+)
npm run serve             # preview at http://localhost:8080
```
