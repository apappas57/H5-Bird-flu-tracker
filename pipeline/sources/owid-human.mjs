// Our World in Data: H5N1 human cases (WHO data, republished as CSV).
//
// Used for a global human-case context statistic, not as map points (the data
// is monthly counts by country, not geolocated events). Individual notable
// human cases live in the curated overlay instead.
import { getText } from '../lib/http.mjs';
import { parseCsv } from '../lib/parse.mjs';

const CSV = 'https://ourworldindata.org/grapher/h5n1-flu-reported-cases.csv';
const SRC = 'https://ourworldindata.org/grapher/h5n1-flu-reported-cases';
const COL = 'Human cases with highly pathogenic avian influenza A/H5N1 (monthly)';

/**
 * @returns {Promise<{global_cumulative:number, australia:number,
 *   latest_case_month:string|null, source:string, source_url:string}>}
 */
export async function fetchHumanContext() {
  const rows = parseCsv(await getText(CSV, { timeoutMs: 45000, retries: 2 }));
  let world = null, countriesSum = 0, australia = 0, latest = '';
  for (const r of rows) {
    const n = Number(r[COL]) || 0;
    const ent = (r.Entity || '').trim();
    const code = (r.Code || '').trim();
    const day = (r.Day || '').trim();
    if (code === 'OWID_WRL' || ent === 'World') {
      world = (world || 0) + n;
    } else if (/^[A-Z]{3}$/.test(code)) { // real country ISO3 (excludes OWID_ aggregates)
      countriesSum += n;
      if (code === 'AUS') australia += n;
    }
    if (n > 0 && day > latest) latest = day;
  }
  return {
    global_cumulative: world != null ? world : countriesSum,
    australia,
    latest_case_month: latest || null,
    source: 'WHO via Our World in Data',
    source_url: SRC,
  };
}
