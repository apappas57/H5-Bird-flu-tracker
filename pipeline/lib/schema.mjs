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
 * Normalise an official confidence label to 'confirmed' or 'presumptive', else null.
 *
 * Officials use this distinction routinely in the 2026 Australian incursion, so the
 * tracker has to be able to express it or it publishes preliminary results as settled
 * fact. The Commonwealth counts in the category "confirmed or presumed positive"
 * (agriculture.gov.au H5 bird flu updates); several Western Australian cases are
 * presumed positive because sequencing could not be determined and DPIRD treats them
 * as positive precautionarily; Victoria's first case was announced on 30 July 2026
 * with confirmatory testing still running at CSIRO ACDP, Geelong.
 *
 * Rules, all of which fail toward the weaker claim:
 *   - a hedge word anywhere wins, so a mixed phrase resolves to 'presumptive';
 *   - "suspect" and "unconfirmed" return null, not 'presumptive': samples sent with no
 *     positive result yet is a weaker statement than a positive result that sequencing
 *     could not fully type, and we will not upgrade it;
 *   - anything unrecognised returns null, which is exactly what every existing source
 *     emits today (the field is optional and absence means "not stated").
 */
function normalizeConfidence(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (/presum|probable|provisional/.test(s)) return 'presumptive';
  if (/unconfirmed|not confirmed|suspect|pending|awaiting/.test(s)) return null;
  if (/confirm/.test(s)) return 'confirmed';
  return null;
}

/**
 * Build one normalized record from a raw source row.
 * Returns null if the row can't be geolocated or categorized (caller counts skips).
 * @param {{category:string, country:string, admin1?:string, locality?:string,
 *          lat?:number|string, lng?:number|string, date:string, count?:number|null,
 *          subtype?:string, flock_type?:string, species?:string, uid?:string,
 *          confidence?:string, source:string, source_url?:string}} raw
 *   confidence is optional: 'confirmed' | 'presumptive' | anything else (-> null).
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
    // null means the source did not state it, NOT that the detection is unconfirmed.
    confidence: normalizeConfidence(raw.confidence),
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
