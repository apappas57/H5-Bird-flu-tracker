#!/usr/bin/env node
// Orchestrator: pull every source, merge the curated overlay, normalize,
// compute headline stats, and write site/data/{detections,summary}.json.
// Guarantees valid, non-empty output on every run: any source failure falls
// back to the curated overlay plus the last committed data.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SOURCES, CURATED_REFERENCES } from './sources/index.mjs';
import { makeRecord, dedupe } from './lib/schema.mjs';
import { fetchHumanContext } from './sources/owid-human.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../site/data');
const DETECTIONS = resolve(DATA_DIR, 'detections.json');
const SUMMARY = resolve(DATA_DIR, 'summary.json');
const CURATED = resolve(__dirname, 'curated.json');
const AU_STATUS = resolve(__dirname, 'au-status.json');

const now = new Date().toISOString();
const log = (...a) => console.log('[build]', ...a);

function loadJson(p, fallback) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback; }
  catch { return fallback; }
}

async function collectSource(src) {
  const started = Date.now();
  try {
    const { records, note } = await src.collect();
    const ok = records.length > 0;
    log(`${ok ? 'OK ' : '·· '} ${src.key}: ${records.length} records (${note}) ${Date.now() - started}ms`);
    return { key: src.key, name: src.name, region: src.region, homepage: src.homepage,
             status: ok ? 'live' : 'empty', records, note };
  } catch (err) {
    log(`ERR ${src.key}: ${err.message}`);
    return { key: src.key, name: src.name, region: src.region, homepage: src.homepage,
             status: 'error', records: [], note: err.message };
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // 1. curated overlay (always present, always real)
  const curatedRaw = loadJson(CURATED, { records: [] }).records || [];
  const curated = curatedRaw.map(makeRecord).filter(Boolean);
  log(`curated overlay: ${curated.length}/${curatedRaw.length} records`);

  // 2. automated sources (parallel)
  const results = await Promise.all(SOURCES.map(collectSource));
  const liveRecords = results.flatMap((r) => r.records);
  const anyLive = results.some((r) => r.status === 'live');

  // 3. last-good fallback so a fully-failed run never wipes the map
  const prev = loadJson(DETECTIONS, []);
  const prevMeta = loadJson(SUMMARY, {});

  let records, mode;
  if (anyLive) {
    records = dedupe([...curated, ...liveRecords]);
    mode = 'live';
  } else if (Array.isArray(prev) && prev.length) {
    records = dedupe([...curated, ...prev]);
    mode = prevMeta.mode === 'live' ? 'stale' : (prevMeta.mode || 'seed');
  } else {
    records = dedupe(curated);
    mode = 'seed';
  }

  records.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  // Global human-case context (WHO via OWID). Non-fatal if it fails.
  let humanContext = null;
  try {
    humanContext = await fetchHumanContext();
    log(`human context: global cumulative ${humanContext.global_cumulative}, AU ${humanContext.australia}`);
  } catch (e) {
    log(`human context unavailable: ${e.message}`);
  }

  const auStatus = loadJson(AU_STATUS, {});
  delete auStatus._comment;

  const summary = buildSummary(records, results, mode, humanContext, auStatus);
  writeFileSync(DETECTIONS, JSON.stringify(records));
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  log(`wrote ${records.length} records, mode=${mode}`);
  log(`sources live: ${results.filter((r) => r.status === 'live').map((r) => r.key).join(', ') || 'none'}`);
}

function buildSummary(records, results, mode, humanContext, auStatus = {}) {
  const byCategory = {}, byCountry = {}, regions = { Global: records.length };
  const usStates = new Set(), auStates = new Set(), countries = new Set();
  let poultryBirds = 0, latest = '';

  // Australia-first roll-up.
  const au = { total: 0, wild_bird: 0, poultry: 0, dairy: 0, mammal: 0, human: 0, h5n1: 0, h7: 0, h5n1_wild: 0 };
  const auH5N1States = new Set(); // states in the current H5N1 wild-bird/mammal incursion
  let auLatest = '';

  for (const r of records) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    byCountry[r.country] = (byCountry[r.country] || 0) + 1;
    countries.add(r.country);
    if (r.country === 'United States' && r.admin1) usStates.add(r.admin1);
    if (r.country === 'Australia' && r.admin1) auStates.add(r.admin1);
    if (r.category === 'poultry' && r.count) poultryBirds += r.count;
    if (r.date > latest) latest = r.date;
    if (r.country === 'Australia') {
      au.total++;
      au[r.category] = (au[r.category] || 0) + 1;
      if (r.subtype === 'H5N1') au.h5n1++;
      else if (r.subtype && r.subtype.startsWith('H7')) au.h7++;
      if (r.subtype === 'H5N1' && (r.category === 'wild_bird' || r.category === 'mammal')) {
        au.h5n1_wild++;
        if (r.admin1) auH5N1States.add(r.admin1);
      }
      if (r.date > auLatest) auLatest = r.date;
    }
  }
  regions['United States'] = byCountry['United States'] || 0;
  regions['Australia'] = byCountry['Australia'] || 0;

  const firstDate = auStatus?.first_detection?.date || null;
  const daysSince = firstDate
    ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(firstDate)) / 86400000))
    : null;

  const auBlock = {
    total: au.total,
    wild_bird: au.wild_bird,
    poultry: au.poultry,
    dairy: au.dairy,
    mammal: au.mammal,
    human: au.human,
    h5n1_detections: au.h5n1,
    h7_detections: au.h7,
    h5n1_wild_detections: au.h5n1_wild,
    h5n1_states: auH5N1States.size,
    h5n1_state_list: [...auH5N1States],
    states_affected: auStates.size,
    states: [...auStates],
    first_detection_date: firstDate,
    days_since_first_detection: daysSince,
    latest_detection: auLatest || null,
  };

  return {
    generated_at: now,
    latest_event: latest || null,
    mode,
    // Australia is the focus; the world block is context.
    au: auBlock,
    status: {
      ...auStatus,
      h5n1_wild_detections: au.h5n1_wild,
      h5n1_states: auH5N1States.size,
      wild_bird_detections: au.wild_bird,
      poultry_detections: au.poultry,
      states_affected: auStates.size,
      days_since_first_detection: daysSince,
      human_cases_au: au.human,
    },
    human_context: humanContext || null,
    totals: {
      total_events: records.length,
      human_cases: byCategory.human || 0,
      poultry_events: byCategory.poultry || 0,
      poultry_birds_affected: poultryBirds,
      dairy_events: byCategory.dairy || 0,
      wild_bird_events: byCategory.wild_bird || 0,
      mammal_events: byCategory.mammal || 0,
      countries_affected: countries.size,
      us_states_affected: usStates.size,
      au_states_affected: auStates.size,
    },
    by_category: byCategory,
    by_country: byCountry,
    regions,
    sources: results.map((r) => ({
      key: r.key, name: r.name, region: r.region, homepage: r.homepage,
      status: r.status, records: r.records.length, note: r.note,
    })),
    references: CURATED_REFERENCES,
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
