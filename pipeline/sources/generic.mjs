// Generic adaptive collector for authoritative "data map" pages.
// Strategy, in order: (1) embedded JSON data file, (2) embedded CSV data file,
// (3) an HTML <table> on the page. Rows are mapped to normalized records via
// case-insensitive field-name hints, so it tolerates minor schema changes.
import { getText, getJson } from '../lib/http.mjs';
import { findDataLinks, parseCsv, htmlTable, toCount } from '../lib/parse.mjs';
import { makeRecord } from '../lib/schema.mjs';

const pick = (row, names) => {
  const keys = Object.keys(row);
  for (const want of names) {
    const k = keys.find((x) => x.toLowerCase().includes(want));
    if (k && row[k] !== '' && row[k] != null) return row[k];
  }
  return null;
};

// Turn an arbitrary JSON payload into an array of flat row objects.
function arrayify(json) {
  if (Array.isArray(json)) return json.map(flatten);
  if (json && Array.isArray(json.features)) {
    return json.features.map((f) => flatten({ ...(f.properties || f.attributes || {}) }));
  }
  for (const v of Object.values(json || {})) {
    if (Array.isArray(v)) return v.map(flatten);
  }
  return [];
}
const flatten = (o) => (o && typeof o === 'object' ? o : {});

export function tabularSource(cfg) {
  const f = cfg.fields || {};
  return {
    key: cfg.key,
    name: cfg.name,
    region: cfg.region,
    category: cfg.category,
    homepage: cfg.homepage,
    async collect() {
      const opts = {};
      if (cfg.timeoutMs != null) opts.timeoutMs = cfg.timeoutMs;
      if (cfg.retries != null) opts.retries = cfg.retries;
      let rows = [];
      let note = '';
      // 1. try direct data-file candidates (fastest, most robust)
      for (const u of cfg.dataUrls || []) {
        try {
          rows = /\.json/i.test(u) ? arrayify(await getJson(u, opts)) : parseCsv(await getText(u, opts));
          if (rows.length) { note = `direct:${u}`; break; }
        } catch { /* try next candidate */ }
      }
      // 2. otherwise scrape the landing page for an embedded data file or table
      if (!rows.length) {
        const html = await getText(cfg.homepage, opts);
        const links = findDataLinks(html, cfg.homepage);
        const jsonLink = links.find((l) => /\.json/i.test(l));
        const csvLink = links.find((l) => /\.csv/i.test(l));
        if (jsonLink) { rows = arrayify(await getJson(jsonLink, opts)); note = `json:${jsonLink}`; }
        else if (csvLink) { rows = parseCsv(await getText(csvLink, opts)); note = `csv:${csvLink}`; }
        else { rows = htmlTable(html, cfg.tableHeaders || []); note = 'html-table'; }
      }

      const records = [];
      for (const row of rows) {
        const rec = makeRecord({
          category: cfg.category,
          country: cfg.country || pick(row, f.country || ['country']) || cfg.defaultCountry,
          admin1: pick(row, f.admin1 || ['state', 'province', 'region']),
          locality: pick(row, f.locality || ['county', 'city', 'location']),
          date: normalizeDate(pick(row, f.date || ['date', 'confirmed', 'reported', 'collection'])),
          count: toCount(pick(row, f.count || ['size', 'affected', 'number', 'birds', 'count'])),
          flock_type: pick(row, f.flock_type || ['production', 'flock type', 'type']),
          species: pick(row, f.species || ['species', 'bird species']),
          source: cfg.name,
          source_url: cfg.homepage,
        });
        if (rec) records.push(rec);
      }
      return { records, note: `${note} (${rows.length} rows -> ${records.length} records)` };
    },
  };
}

// Accept common date formats and coerce to YYYY-MM-DD.
function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    let [, mo, d, y] = mdy;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}
