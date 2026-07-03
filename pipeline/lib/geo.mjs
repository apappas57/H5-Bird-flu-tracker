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
  'south korea': 'South Korea', 'republic of korea': 'South Korea',
  'north korea': 'North Korea', 'russia': 'Russia',
  'russian federation': 'Russia', 'czechia': 'Czech Republic',
  'viet nam': 'Vietnam', 'turkiye': 'Turkey',
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

/**
 * Resolve a place to map coordinates + canonical labels.
 * @param {{country?:string, admin1?:string}} place
 * @returns {null | {country:string, country_code:string|null, admin1:string|null,
 *                   admin1_code:string|null, lat:number, lng:number, level:'admin1'|'country'}}
 */
export function resolvePlace({ country, admin1 } = {}) {
  const c = canonicalCountry(country);
  if (!c) return null;

  if (c === 'United States') {
    const s = canonicalUsState(admin1);
    if (s) {
      const m = US_STATES[s];
      return { country: c, country_code: 'US', admin1: s, admin1_code: m.code,
               lat: m.lat, lng: m.lng, level: 'admin1' };
    }
  }
  if (c === 'Australia') {
    const s = canonicalAuState(admin1);
    if (s) {
      const m = AU_STATES[s];
      return { country: c, country_code: 'AU', admin1: s, admin1_code: m.code,
               lat: m.lat, lng: m.lng, level: 'admin1' };
    }
  }
  const cm = COUNTRIES[c];
  if (!cm) return null;
  return { country: c, country_code: cm.iso2, admin1: admin1 || null,
           admin1_code: null, lat: cm.lat, lng: cm.lng, level: 'country' };
}
