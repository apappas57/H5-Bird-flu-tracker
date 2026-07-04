// Normalized detection/case record — the stable contract the frontend reads.
// Every source module must emit records through makeRecord().
import { resolvePlace } from './geo.mjs';

export const CATEGORIES = ['human', 'poultry', 'dairy', 'wild_bird', 'mammal'];

// Canonical disease names. Normalizing here prevents casing/alias variants
// (e.g. "avian_influenza" vs "Avian influenza") from splitting by_disease counts.
const DISEASE_ALIASES = {
  'avian influenza': 'Avian influenza', 'avian_influenza': 'Avian influenza',
  'bird flu': 'Avian influenza', 'ai': 'Avian influenza', 'hpai': 'Avian influenza',
  'lpai': 'Avian influenza', 'influenza a': 'Avian influenza',
};
function normDisease(v) {
  if (!v) return 'Avian influenza';
  const key = String(v).trim().toLowerCase();
  return DISEASE_ALIASES[key] || String(v).trim();
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Normalize an influenza subtype string, e.g. "h5n1" -> "H5N1", "H7" -> "H7". Null if unrecognizable.
function normSubtype(v) {
  if (!v) return null;
  const m = String(v).toUpperCase().match(/H\d{1,2}(N\d{1,2})?/);
  return m ? m[0] : null;
}
// Broad strain group for filtering, derived from subtype (H5, H7, H9, other).
function strainGroup(subtype) {
  if (!subtype) return null;
  const m = subtype.match(/^H(\d{1,2})/);
  if (!m) return null;
  return `H${m[1]}`;
}

function validDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

/**
 * Build one normalized record from a raw source row.
 * Returns null if the row can't be geolocated or categorized (caller counts skips).
 * @param {{category:string, country:string, admin1?:string, locality?:string,
 *          date:string, count?:number|null, flock_type?:string, species?:string,
 *          source:string, source_url?:string}} raw
 */
export function makeRecord(raw) {
  if (!CATEGORIES.includes(raw.category)) return null;
  const place = resolvePlace({ country: raw.country, admin1: raw.admin1 });
  if (!place) return null;
  const date = validDate(raw.date);
  if (!date) return null;

  const count = raw.count == null || Number.isNaN(Number(raw.count))
    ? null : Math.max(0, Math.round(Number(raw.count)));

  const subtype = normSubtype(raw.subtype);
  const strain = strainGroup(subtype);
  const disease = normDisease(raw.disease);
  const pathogenicity = raw.pathogenicity
    ? String(raw.pathogenicity).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || null
    : null;

  const id = [
    raw.category, place.country_code || slug(place.country),
    place.admin1_code || slug(place.admin1) || 'na',
    slug(raw.locality) || 'na', date, subtype || 'na', count ?? 'na',
  ].join('_');

  return {
    id,
    disease,
    subtype,          // e.g. "H5N1", "H7N8", or null
    strain,           // broad group for filtering: "H5", "H7", "H9", or null
    pathogenicity,    // "HPAI" | "LPAI" | null
    category: raw.category,
    country: place.country,
    country_code: place.country_code,
    admin1: place.admin1,
    admin1_code: place.admin1_code,
    locality: raw.locality || null,
    lat: place.lat,
    lng: place.lng,
    level: place.level,
    date,
    count,
    flock_type: raw.flock_type || null,
    species: raw.species || null,
    source: raw.source,
    source_url: raw.source_url || null,
  };
}

/** De-duplicate records by id, keeping the first seen. */
export function dedupe(records) {
  const seen = new Map();
  for (const r of records) if (r && !seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}
