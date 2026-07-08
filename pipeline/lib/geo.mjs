// Shared geography reference + resolver for the pipeline.
// Single source of truth lives under site/assets/ so the frontend and the
// pipeline can never drift apart.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const asset = (p) => resolve(__dirname, '../../site/assets/', p);

/** US states: name -> {code,lat,lng} */
export const US_STATES = JSON.parse(readFileSync(asset('us-states-centroids.json'), 'utf8'));
/** AU states/territories: name -> {code,lat,lng} */
export const AU_STATES = JSON.parse(readFileSync(asset('au-states-centroids.json'), 'utf8'));
/** Countries: name -> {iso2,lat,lng} */
export const COUNTRIES = JSON.parse(readFileSync(asset('countries-meta.json'), 'utf8'));

// ---- country-name normalization ----------------------------------------
const COUNTRY_ALIASES = {
  'usa': 'United States', 'us': 'United States', 'u.s.': 'United States',
  'u.s.a.': 'United States', 'united states of america': 'United States',
  'uk': 'United Kingdom', 'great britain': 'United Kingdom',
  'united kingdom of great britain and northern ireland': 'United Kingdom',
  'south korea': 'South Korea', 'republic of korea': 'South Korea',
  'korea (republic of)': 'South Korea', 'korea, republic of': 'South Korea',
  'north korea': 'North Korea', 'russia': 'Russia',
  'russian federation': 'Russia', 'czechia': 'Czech Republic',
  'viet nam': 'Vietnam', 'turkiye': 'Turkey', 'türkiye': 'Turkey',
  // Long-form / WOAH-FAO variants seen in the EMPRES-i feed.
  'netherlands (kingdom of the)': 'Netherlands', 'the netherlands': 'Netherlands',
  'iran (islamic republic of)': 'Iran', 'moldova (republic of)': 'Moldova',
  'bolivia (plurinational state of)': 'Bolivia', 'venezuela (bolivarian republic of)': 'Venezuela',
  'tanzania, united republic of': 'Tanzania', 'united republic of tanzania': 'Tanzania',
  'lao people\'s democratic republic': 'Laos', "côte d'ivoire": 'Ivory Coast',
  'hong kong sar': 'Hong Kong', 'taiwan (province of china)': 'Taiwan',
};
const COUNTRY_LOOKUP = {};
for (const name of Object.keys(COUNTRIES)) COUNTRY_LOOKUP[name.toLowerCase()] = name;
for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) COUNTRY_LOOKUP[alias] = name;

export function canonicalCountry(input) {
  if (!input) return null;
  return COUNTRY_LOOKUP[String(input).trim().toLowerCase()] || null;
}

// ---- US / AU state normalization ---------------------------------------
function buildStateLookup(table, extra = {}) {
  const lut = {};
  for (const [name, meta] of Object.entries(table)) {
    lut[name.toLowerCase()] = name;
    lut[meta.code.toLowerCase()] = name;
  }
  for (const [k, v] of Object.entries(extra)) lut[k] = v;
  return lut;
}
const US_LOOKUP = buildStateLookup(US_STATES, {
  'washington dc': 'District of Columbia', 'washington d.c.': 'District of Columbia',
  'd.c.': 'District of Columbia',
});
const AU_LOOKUP = buildStateLookup(AU_STATES);

export function canonicalUsState(input) {
  return input ? (US_LOOKUP[String(input).trim().toLowerCase()] || null) : null;
}
export function canonicalAuState(input) {
  return input ? (AU_LOOKUP[String(input).trim().toLowerCase()] || null) : null;
}

const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/** Validate source-supplied coordinates; reject the (0,0) "unknown" sentinel. */
function validCoords(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const la = Number(lat), lo = Number(lng);
  if (!inRange(la, -90, 90) || !inRange(lo, -180, 180)) return null;
  if (la === 0 && lo === 0) return null;
  return { lat: la, lng: lo };
}

/**
 * Resolve a place to map coordinates + canonical labels.
 *
 * Priority:
 *   1. If the source supplies valid lat/lng, use them (level 'point') and keep
 *      the record even when the country string does not canonicalise (the
 *      EMPRES-i feed occasionally puts a locality in the country field).
 *   2. Otherwise fall back to the admin1 (US/AU state) or country centroid.
 *
 * @param {{country?:string, admin1?:string, lat?:number|string, lng?:number|string}} place
 * @returns {null | {country:string|null, country_code:string|null, admin1:string|null,
 *                   admin1_code:string|null, lat:number, lng:number,
 *                   level:'point'|'admin1'|'country'}}
 */
export function resolvePlace({ country, admin1, lat, lng } = {}) {
  const c = canonicalCountry(country);
  const coords = validCoords(lat, lng);

  // Best-effort canonical labels (used at every level).
  let admin1Name = null, admin1Code = null, countryCode = null;
  if (c === 'United States') {
    countryCode = 'US';
    const s = canonicalUsState(admin1);
    if (s) { admin1Name = s; admin1Code = US_STATES[s].code; }
  } else if (c === 'Australia') {
    countryCode = 'AU';
    const s = canonicalAuState(admin1);
    if (s) { admin1Name = s; admin1Code = AU_STATES[s].code; }
  } else if (c && COUNTRIES[c]) {
    countryCode = COUNTRIES[c].iso2;
  }

  // 1. Precise coordinates from the source.
  if (coords) {
    return {
      country: c || (country ? String(country).trim() : null),
      country_code: countryCode,
      admin1: admin1Name || (admin1 ? String(admin1).trim() : null),
      admin1_code: admin1Code,
      lat: coords.lat, lng: coords.lng, level: 'point',
    };
  }

  // 2. No coords: need a known country to place a centroid.
  if (!c) return null;
  if (c === 'United States' && admin1Name) {
    const m = US_STATES[admin1Name];
    return { country: c, country_code: 'US', admin1: admin1Name, admin1_code: m.code,
             lat: m.lat, lng: m.lng, level: 'admin1' };
  }
  if (c === 'Australia' && admin1Name) {
    const m = AU_STATES[admin1Name];
    return { country: c, country_code: 'AU', admin1: admin1Name, admin1_code: m.code,
             lat: m.lat, lng: m.lng, level: 'admin1' };
  }
  const cm = COUNTRIES[c];
  if (!cm) return null;
  return { country: c, country_code: cm.iso2, admin1: admin1 || null,
           admin1_code: null, lat: cm.lat, lng: cm.lng, level: 'country' };
}
