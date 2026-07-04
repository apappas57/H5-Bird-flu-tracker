# Project status / handoff

_Snapshot for picking the project back up. Delete once merged & deployed._

## Where things are

- **Branch:** `claude/h5-flu-tracker-website-joihfc` — all work committed & pushed.
- **PR:** [#1](https://github.com/apappas57/H5-Bird-flu-tracker/pull/1) (→ `main`), CI green.
- **Hosting:** **Vercel** (config in `vercel.json`). GitHub Pages workflow removed.
- **Domain:** `birdflutracker.org` bought. Re-point DNS at Vercel (A `@` → 76.76.21.21,
  CNAME `www` → cname.vercel-dns.com) and add the domain in the Vercel dashboard.

## What works (verified in CI against live sources)

The pipeline pulls **real USDA APHIS data** — ~9,000 live records, `mode=live`:

| Feed | Status |
| --- | --- |
| USDA APHIS — Wild birds | ✅ live (~19k rows) |
| USDA APHIS — Mammals | ✅ live (~800) |
| USDA APHIS — Dairy/livestock | ✅ live (~116) |
| USDA APHIS — Poultry | ⚠️ pending correct CSV filename (Tableau-backed page, no CSV link) |
| Australia (DAFF) | ⚠️ page blocks bots — covered by the curated overlay |

## Open items

1. **Poultry feed** — find the real direct-CSV filename. Working APHIS files follow
   `https://www.aphis.usda.gov/sites/default/files/hpai-<slug>.csv`
   (confirmed: `hpai-wild-birds.csv`, `hpai-mammals.csv`, `hpai-livestock.csv`).
   Candidates are already listed in `pipeline/sources/index.mjs` (`us-poultry.dataUrls`);
   check the latest CI "build" log to see if one hit. If not, open the
   [commercial-backyard-flocks page](https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks),
   inspect the Tableau/network requests for the data file, and add its URL.
2. **Merge PR #1**, then import the repo at **vercel.com/new** → Deploy (reads `vercel.json`).
3. Add the custom domain in Vercel (Settings → Domains) and re-point DNS at Vercel.
4. Create a Vercel Deploy Hook and add its URL as the GitHub secret `VERCEL_DEPLOY_HOOK_URL`
   so `refresh.yml` can trigger the daily rebuild.

## Run it locally (on the laptop)

```bash
git clone https://github.com/apappas57/H5-Bird-flu-tracker.git
cd H5-Bird-flu-tracker
git checkout claude/h5-flu-tracker-website-joihfc
node pipeline/build.mjs     # refresh data (needs internet to reach APHIS; else uses curated seed)
npm run serve               # preview at http://localhost:8080
```

## Map of the code

- `site/` — the website (static). `index.html`, `styles.css`, `app.js`; data in `site/data/`;
  bundled map assets in `site/assets/`.
- `pipeline/` — the data engine. `build.mjs` orchestrates; `sources/` has the feeds;
  `lib/` has geo/http/parse/schema helpers; `curated.json` is the hand-maintained overlay.
- `.github/workflows/` — `ci.yml` (validate on PR) and `deploy.yml` (daily refresh + Pages deploy).
- `docs/DATA_SOURCES.md` — source details + verification checklist.
