// FAO EMPRES-i+ (Global Animal Disease Information System) collector.
//
// This is the tracker's primary automated feed. It is free, needs no API key,
// returns CSV with real coordinates, updates within days, and includes
// Australia. Critically, EMPRES-i ingests WOAH/WAHIS notifications, so it
// already carries Australia's official avian-influenza events, which the
// Australian government sites only publish as un-scrapeable HTML/PDF.
//
// Endpoint (a BigQuery-backed CSV wrapper; params come from the published
// parameterised SQL file itself):
//   https://api.data.apps.fao.org/api/v2/bigquery?sql_url=<sql>&start_date=...
//     &end_date=...&diagnosis_status=all&animal_type=all
//     &disease=Influenza - Avian&country=<Australia|all>
//
// Columns returned:
//   global_id, disease, lat, lon, locality, country, region, location,
//   observation_date, report_date, display_date, animal_type_list,
//   species_overview_list, diagnosis_status, humans_affected, humans_deaths,
//   diagnosis_source
import { getText } from '../lib/http.mjs';
import { parseCsv } from '../lib/parse.mjs';
import { makeRecord } from '../lib/schema.mjs';
import { canonicalAuState, AU_STATES } from '../lib/geo.mjs';

const SQL_URL = 'https://data.apps.fao.org/catalog/dataset/96641600-b15c-493e-8e8d-6c22f145a960/resource/2fc21534-05da-4c58-b773-93a0f28bd1f6/download/avian-influenza-parameterized-query.sql';
const API = 'https://api.data.apps.fao.org/api/v2/bigquery';
const HOMEPAGE = 'https://empres-i.apps.fao.org/';

const ymd = (d) => d.toISOString().slice(0, 10);

function buildUrl({ country, startDate, endDate }) {
  // sql_url is passed raw (matches the proven-working request); the disease
  // string must be the exact label or the query returns zero rows.
  return `${API}?sql_url=${SQL_URL}`
    + `&start_date=${startDate}&end_date=${endDate}`
    + `&diagnosis_status=all&animal_type=all`
    + `&disease=${encodeURIComponent('Influenza - Avian')}`
    + `&country=${encodeURIComponent(country)}`;
}

// ---- classification -------------------------------------------------------

/** Map EMPRES-i animal_type + species text to one of the tracker categories. */
function classify(animalType, species) {
  const a = animalType.toLowerCase();
  const s = species.toLowerCase();
  if (!a && !s) return null; // unclassifiable (this is how EMPRES-i encodes human-only rows)
  if (/environment/.test(a) || /environmental/.test(s)) return null; // not an animal detection
  // human-only rows are handled by the curated overlay + OWID, not here
  if ((/human/.test(a) || /\bhuman\b/.test(s)) && !/(bird|poultry|chicken|duck|goose|turkey|mammal|cattle)/.test(s)) return null;
  if (/(cattle|bovine|dairy|\bcow\b|calf|heifer)/.test(s)) return 'dairy';
  if (/(seal|sea lion|sealion|otter|\bfox\b|\bcat\b|\bcats\b|feline|\bdog\b|canine|dolphin|whale|porpoise|pig|swine|boar|mink|marten|skunk|raccoon|\bbear\b|tiger|lion|leopard|puma|cougar|bobcat|\bgoat\b|sheep|ferret|rodent|mouse|\brat\b|opossum|possum|mammal|pinniped|cetacean|primate)/.test(s)) return 'mammal';
  if (/(domestic|captive|backyard|commercial|village)/.test(a)) return 'poultry';
  return 'wild_bird'; // wild or unspecified birds
}

/** Strip the "Wild - " / "Domestic - " prefixes (species can be pipe-separated). */
function cleanSpecies(s) {
  if (!s) return null;
  const t = s.replace(/(^|\|)\s*(wild|domestic|captive)\s*-\s*/gi, '$1 ')
    .replace(/\s*\|\s*/g, ' | ').trim();
  return t || null;
}

/** Tidy EMPRES-i locality strings (drop outbreak/premises id and numeric prefixes). */
function cleanLocality(s) {
  if (!s) return null;
  let t = s.replace(/^OB_\d+\s*-\s*IP\d+\s*-\s*/i, '').replace(/^\d{4,}\s*/, '').trim();
  const parts = t.split(/\s*-\s*/);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) t = parts[0];
  return t || null;
}

// ---- Australian state attribution ----------------------------------------
// EMPRES-i has no clean state field for Australia, but it does give coordinates
// (and sometimes the state name in `locality`). We attribute a state so the
// "states affected" headline works; the map itself uses the precise coords.

function auStateFromText(loc) {
  if (!loc) return null;
  const direct = canonicalAuState(loc);
  if (direct) return direct;
  const low = loc.toLowerCase();
  for (const name of Object.keys(AU_STATES)) {
    if (low.includes(name.toLowerCase())) return name;
  }
  const m = low.match(/\b(nsw|vic|qld|tas|nt|act)\b/); // omit bare sa/wa (too collision-prone in free text)
  return m ? canonicalAuState(m[1]) : null;
}

/** Approximate lat/lng -> Australian state/territory (good enough for coastal detections). */
function auStateFromCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lng < 129) return 'Western Australia';
  if (lng < 138) return lat > -26 ? 'Northern Territory' : 'South Australia';
  if (lng < 141) {
    if (lat <= -26) return 'South Australia';
    return lng >= 140 ? 'Queensland' : 'Northern Territory';
  }
  // lng >= 141 (eastern states)
  if (lat > -29) return 'Queensland';
  if (lng >= 148.7 && lng <= 149.4 && lat <= -35.1 && lat >= -35.95) return 'Australian Capital Territory';
  if (lat < -39.2) return 'Tasmania';
  if (lat <= -34 && lng < 150.1) return 'Victoria';
  return 'New South Wales';
}

/**
 * Documented, sourced subtype rule for Australia (EMPRES-i's disease field is
 * the generic "Influenza - Avian" with no subtype). See docs/DATA_SOURCES.md.
 *   - Poultry, 2024-05..2025-06: the resolved H7 (H7N3/N8/N9) outbreaks.
 *   - Wild bird / mammal from June 2026: H5N1 clade 2.3.4.4b (the incursion the
 *     WOAH first-case notification of 20 June 2026 describes; sampling/observation
 *     dates for the cluster run from mid-June, so the window opens on 1 June).
 *     Australia had no other wild-bird avian influenza in 2026, so this is safe.
 *   - Otherwise unknown (null -> shown as "subtype pending").
 */
function auSubtype(category, date) {
  if (!date) return null;
  if (category === 'poultry' && date >= '2024-05-01' && date <= '2025-06-30') return 'H7';
  if ((category === 'wild_bird' || category === 'mammal') && date >= '2026-06-01') return 'H5N1';
  return null;
}

function rowToRecord(row, cfg) {
  const g = (k) => (row[k] ?? '').trim();
  const category = classify(g('animal_type_list'), g('species_overview_list'));
  if (!category) return null;

  const country = g('country');
  // US wild birds are covered in higher resolution (with real subtype) by the
  // USDA ArcGIS source, so the global feed skips them to avoid double-counting.
  if (cfg.excludeUsWildBird && category === 'wild_bird' && /united states/i.test(country)) return null;

  const date = g('observation_date') || g('report_date') || g('display_date');
  const lat = g('lat'), lng = g('lon');
  const isAU = /^australia$/i.test(country) || cfg.country === 'Australia';

  let admin1 = null, subtype = null;
  if (isAU) {
    admin1 = auStateFromText(g('locality')) || auStateFromCoords(Number(lat), Number(lng));
    subtype = auSubtype(category, date.slice(0, 10));
  }

  return makeRecord({
    category,
    country: country || cfg.country,
    admin1,
    locality: cleanLocality(g('locality')),
    lat,
    lng,
    date,
    subtype,
    species: cleanSpecies(g('species_overview_list')),
    uid: `fao-${g('global_id')}`,
    source: cfg.name,
    source_url: HOMEPAGE,
  });
}

/**
 * Build a FAO EMPRES-i source.
 * @param {{key:string, name:string, region:string, country:string,
 *          startDate?:string, days?:number}} cfg
 *   Provide startDate (fixed) OR days (lookback window). country is an exact
 *   EMPRES-i country name, or "all" for the global feed.
 */
export function faoSource(cfg) {
  return {
    key: cfg.key,
    name: cfg.name,
    region: cfg.region,
    homepage: HOMEPAGE,
    async collect() {
      const endDate = ymd(new Date());
      const startDate = cfg.startDate
        || ymd(new Date(Date.now() - (cfg.days || 365) * 86400000));
      const url = buildUrl({ country: cfg.country, startDate, endDate });
      const csv = await getText(url, { timeoutMs: 60000, retries: 2 });
      const rows = parseCsv(csv);
      const records = [];
      let skipped = 0;
      for (const row of rows) {
        const rec = rowToRecord(row, cfg);
        if (rec) records.push(rec); else skipped++;
      }
      return {
        records,
        note: `fao(${cfg.country}) ${startDate}..${endDate}: ${rows.length} rows -> ${records.length} records (${skipped} skipped)`,
      };
    },
  };
}
