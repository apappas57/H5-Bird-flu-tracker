# H5 Bird Flu Tracker

A simple, public-interest website that shows where **H5 avian influenza (H5N1, "bird flu")**
is being detected — worldwide, with a focus on the **United States** and **Australia** — on a
map and in a plain-language list. Built for the general public: no jargon, no login, fast to load.

> **Function over fanciness.** It's a static website (no server to run or pay for) whose data is
> refreshed automatically once a day by a small Node.js pipeline running in GitHub Actions.

---

## What it shows

- **A world map** with a coloured dot for each detection, plus light shading over "impacted areas"
  (countries with recent activity). Zoom presets for Global / United States / Australia.
- **Headline numbers** — human cases, poultry outbreaks, dairy-cattle herds, wild-bird and mammal
  detections, and how many countries are affected — that respond to the filters.
- **A searchable, sortable list** of individual detections with date, place, species/type, size,
  and a link to the source.
- Five detection categories, colour-coded with a **colour-blind-safe palette**:
  🟥 People · 🟧 Poultry · 🟦 Dairy cattle · 🟩 Wild birds · 🟪 Mammals.

## Architecture (why it's simple and robust)

```
 ┌─────────────────────────┐      daily (GitHub Actions, full internet)
 │  pipeline/build.mjs      │  ── fetches ──▶ CDC · USDA APHIS · WHO · WOAH · AU agencies
 │  + curated overlay       │
 └─────────────┬───────────┘
               │ writes normalized JSON
               ▼
   site/data/detections.json   site/data/summary.json
               │
               ▼
 ┌─────────────────────────┐
 │  static site (site/)     │  Leaflet map + vanilla JS, no build step, no framework
 │  deployed to GitHub Pages│
 └─────────────────────────┘
```

- **No API keys, no paid services.** Map tiles are OpenStreetMap; Leaflet is vendored locally.
- **Never goes blank.** If a source is unreachable on a given day, the run falls back to the last
  committed data plus a hand-curated overlay of well-documented events.
- **Transparent.** Every run records per-source status (`live` / `empty` / `error`) in
  `summary.json`, shown on the page under "Data sources", and refreshed data is committed to git so
  you get a full history.

## Data sources

Authoritative, machine-readable feeds (fetched in `pipeline/sources/`):

| Region | Category | Source |
| --- | --- | --- |
| USA | Poultry | [CDC / USDA — commercial & backyard flocks](https://www.cdc.gov/bird-flu/situation-summary/data-map-commercial.html) |
| USA | Wild birds | [CDC / USDA — wild birds](https://www.cdc.gov/bird-flu/situation-summary/data-map-wild-birds.html) |
| USA | Dairy cattle | [USDA APHIS — livestock](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/hpai-confirmed-cases-livestock) |
| USA | Mammals | [USDA APHIS — mammals](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/mammals) |
| Australia | Poultry / all | [DAFF — avian influenza](https://www.agriculture.gov.au/biosecurity-trade/pests-diseases-weeds/animal/avian-influenza) · [Agriculture Victoria](https://agriculture.vic.gov.au/biosecurity/animal-diseases/poultry-diseases/avian-influenza) |
| Global | Human | [WHO — cumulative H5N1 human cases](https://www.who.int/emergencies/disease-outbreak-news) |
| Global | Animal | [WOAH / WAHIS](https://wahis.woah.org/) |

See **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)** for the exact fetch strategy and the
**verification checklist** to run after the first deploy.

## Local development

```bash
node pipeline/build.mjs   # refresh site/data/*.json (uses curated overlay if offline)
npm run serve             # preview at http://localhost:8080
```

No dependencies to install — the pipeline uses Node's built-in `fetch` (Node 20+).

## Deploy (one-time setup)

1. Push this repo to GitHub (`apappas57/h5-bird-flu-tracker`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. The [`Refresh data & deploy`](.github/workflows/deploy.yml) workflow then runs on every push to
   `main`, once a day on a schedule, and on manual dispatch. Your site appears at
   `https://apappas57.github.io/h5-bird-flu-tracker/`.

### Custom domain — birdflutracker.org

The `site/CNAME` file is already set to `birdflutracker.org`. To finish, add these DNS records at
your registrar and set the domain under **Settings → Pages → Custom domain**:

| Type | Host / name | Value |
| --- | --- | --- |
| A | `@` (apex) | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `apappas57.github.io.` |

After DNS propagates (minutes to a few hours), tick **Enforce HTTPS** in Settings → Pages. That's it —
no code changes; the site serves at both `https://birdflutracker.org` and `https://www.birdflutracker.org`.

## Disclaimer

Not medical advice. Figures are aggregated from public reports and may lag or be revised by the
source agencies. For current risk guidance, consult the CDC, WHO, or your national/state health
department. If you keep birds or livestock, report sick or dead animals to your local agriculture
authority.

## License

MIT. Map data © OpenStreetMap contributors. Source data © the respective agencies.
