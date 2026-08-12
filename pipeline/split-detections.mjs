#!/usr/bin/env node
// Splits site/data/detections.json into per-region files the site can lazy-load.
// The default Australian view renders a handful of records, so shipping every
// global record on first paint is waste: the split lets app.js fetch only the
// region in view. Buckets mirror the site's region buttons (app.js REGION_*):
//   au  -> country_code AU
//   us  -> country_code US
//   row -> everything else (the global view loads all three)
// detections.json itself is still written whole: the pipeline reads it back as
// the last-good fallback, and older cached pages may still fetch it.
// Run standalone (node pipeline/split-detections.mjs) or from build.mjs, so a
// data refresh always regenerates the split alongside the file it derives from.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = resolve(__dirname, '../site/data');

const REGION_KEYS = ['au', 'us', 'row'];
const regionOf = (r) => (r.country_code === 'AU' ? 'au' : r.country_code === 'US' ? 'us' : 'row');

/** [[minLat, minLng], [maxLat, maxLng]] over the records, or null when empty. */
function boundsOf(recs) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const r of recs) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    if (r.lat < s) s = r.lat;
    if (r.lat > n) n = r.lat;
    if (r.lng < w) w = r.lng;
    if (r.lng > e) e = r.lng;
  }
  return Number.isFinite(s) ? [[s, w], [n, e]] : null;
}

/**
 * Writes detections/{au,us,row}.json plus detections/index.json (per-region
 * count and bounding box, so the loader can sanity-check what it fetched and
 * probe that this build published the split at all). Returns the index.
 */
export function splitDetections(records, dataDir = DEFAULT_DATA_DIR) {
  const outDir = resolve(dataDir, 'detections');
  mkdirSync(outDir, { recursive: true });
  const buckets = { au: [], us: [], row: [] };
  for (const r of records) buckets[regionOf(r)].push(r);
  const index = { total: records.length, default_region: 'au', regions: {} };
  for (const key of REGION_KEYS) {
    writeFileSync(resolve(outDir, key + '.json'), JSON.stringify(buckets[key]));
    index.regions[key] = { count: buckets[key].length, bounds: boundsOf(buckets[key]) };
  }
  writeFileSync(resolve(outDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

// Standalone: re-split the committed detections.json in place.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = resolve(DEFAULT_DATA_DIR, 'detections.json');
  const records = JSON.parse(readFileSync(src, 'utf8'));
  if (!Array.isArray(records)) throw new Error('detections.json is not an array');
  const index = splitDetections(records, DEFAULT_DATA_DIR);
  console.log('[split]', REGION_KEYS.map((k) => `${k}=${index.regions[k].count}`).join(', '),
    `(total ${index.total})`);
}
