// Normalized detection/case record — the stable contract the frontend reads.
// Every source module must emit records through makeRecord().
import { resolvePlace } from './geo.mjs';

export const CATEGORIES = ['human', 'poultry', 'dairy', 'wild_bird', 'mammal'];

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function validDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

/** Normalise a subtype string to a canonical HxNy / Hx token, else null. */
function normalizeSubtype(v) {
  if (!v) return null;
  const m = String(v).toUpperCase().replace(/\s+/g, '').match(/H\d{1,2}(?:N\d{1,2})?/);
  return m ? m[0] : null;
}

/**
 * Build one normalized record from a raw source row.
 * Returns null if the row can't be geolocated or categorized (caller counts skips).
 * @param {{category:string, country:string, admin1?:string, locality?:string,
 *          lat?:number|string, lng?:number|string, date:string, count?:number|null,
 *          subtype?:string, flock_type?:string, species?:string, uid?:string,
 *          source:string, source_url?:string}} raw
 */
export function makeRecord(raw) {
  if (!CATEGORIES.includes(raw.category)) return null;
  const place = resolvePlace({ country: raw.country, admin1: raw.admin1, lat: raw.lat, lng: raw.lng });
  if (!place) return null;
  const date = validDate(raw.date);
  if (!date) return null;

  const count = raw.count == null || Number.isNaN(Number(raw.count))
    ? null : Math.max(0, Math.round(Number(raw.count)));

  // Prefer a source-supplied stable id (e.g. FAO global_id, USDA OBJECTID) so
  // distinct point detections in the same place/date never collapse, and the
  // same event from the same source across runs stays stable.
  const id = raw.uid
    ? `${raw.category}_${slug(raw.uid)}`
    : [
        raw.category, place.country_code || slug(place.country) || 'na',
        place.admin1_code || slug(place.admin1) || 'na',
        slug(raw.locality) || 'na', date, count ?? 'na',
      ].join('_');

  return {
    id,
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
    subtype: normalizeSubtype(raw.subtype),
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
