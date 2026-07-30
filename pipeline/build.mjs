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
import { reconcileAustralianCurated } from './lib/reconcile.mjs';
import {
  stampEras, australianEraBreakdown, eraCounts, eraDefinitions, CURRENT_AU_ERA,
} from './lib/era.mjs';
import { fetchHumanContext } from './sources/owid-human.mjs';
// The two Australian gap-closers below are deliberately NOT in SOURCES: neither has
// a collect() that yields records, so registering them would put a zero-record entry
// in the site's automated-feed list and read as a broken feed. They are called from
// main() the way fetchHumanContext is, and surfaced separately in the summary.
import { fetchOfficialAuStatus, officialGap, AU_OFFICIAL_SOURCES } from './sources/au-official.mjs';
import { auNewsSignalCheck, NEWS_SIGNAL } from './sources/au-news-signal.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../site/data');
const DETECTIONS = resolve(DATA_DIR, 'detections.json');
const SUMMARY = resolve(DATA_DIR, 'summary.json');
const HISTORY_OUT = resolve(DATA_DIR, 'history.json');
const CURATED = resolve(__dirname, 'curated.json');
const AU_STATUS = resolve(__dirname, 'au-status.json');
const HISTORY_SRC = resolve(__dirname, 'history.json');

const now = new Date().toISOString();
const log = (...a) => console.log('[build]', ...a);

// How many recent Australian headlines are published for readers. The signal module
// retains more than any page should list, so this is the display cap. Publishing them
// changes nothing about what they are: media reports, never detection records.
const MAX_PUBLISHED_HEADLINES = 12;

/** Is this record an Australian one? Both fields are checked; either can be missing. */
const isAustralian = (r) => Boolean(r) && (r.country === 'Australia' || r.country_code === 'AU');

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

/**
 * Merge the curated overlay with a feed of automated records.
 *
 * Curated Australian animal records that the feed now carries are dropped by
 * reconcileAustralianCurated(), so a curated stand-in for the roughly 14-day
 * EMPRES-i lag cannot become a permanent double-count. A feed copy of a curated
 * record (identical id, which is what the last-good fallback contains, since it is
 * the previous run's own output) is removed first so no record can be reported as
 * superseding itself.
 * @param {object[]} curated normalised curated overlay records
 * @param {object[]} feed normalised records from the automated sources or the fallback
 * @returns {{records: object[], dropped: object[], note: string}}
 */
function mergeCurated(curated, feed) {
  const curatedIds = new Set(curated.map((r) => r.id));
  const { records, dropped, note } = reconcileAustralianCurated(
    curated, feed.filter((r) => r && !curatedIds.has(r.id)));
  return { records: dedupe(records), dropped, note };
}

/**
 * Choose the feed this run publishes, and say honestly how current it is.
 *
 * WHY THIS IS REGION-AWARE. A single "did any source return records" test is not safe
 * on an Australia-first tracker. Every Australian record in this pipeline arrives
 * through one upstream, FAO EMPRES-i, which ingests WOAH/WAHIS notifications. The USDA
 * wild-bird feed is United States only and carries no Australian record at all, and it
 * is by far the largest feed, so it succeeds on its own often enough. If EMPRES-i fails
 * while USDA succeeds, a global test stays true, the build calls itself "live", and an
 * Australia-first page publishes zero Australian detections while telling the reader
 * the data is current. That is the worst failure this site has, so Australia is checked
 * on its own here.
 *
 * When the live feeds carry no Australian record, the Australian layer is restored from
 * the last good run and `mode` drops to "partial". Never "live": a layer that failed
 * cannot be described as current. The never-goes-blank guarantee is unchanged, and the
 * curated overlay is merged on top of whatever this returns either way.
 *
 * @param {{results:object[], liveRecords:object[], prev:object[], prevMeta:object}} input
 * @returns {{feed:object[], mode:'live'|'partial'|'stale'|'seed', coverage:object}}
 */
function selectFeed({ results, liveRecords, prev, prevMeta }) {
  const anyLive = results.some((r) => r.status === 'live');
  const liveAu = liveRecords.filter(isAustralian);
  const prevAu = prev.filter(isAustralian);
  const failed = results.filter((r) => r.status !== 'live').map((r) => r.key);
  // Distinct events, not rows: two sources can carry the same Australian record (the
  // Australian and the global FAO pull overlap), and dedupe() runs later.
  const distinct = (list) => new Set(list.map((r) => r.id).filter(Boolean)).size;

  // `lines` is build-log text only, never published: naming it `log` here would shadow
  // the module-level logger.
  const cov = (australia, mode_note, lines) => ({ australia, mode_note, lines });
  let feed, mode, coverage;

  if (anyLive && liveAu.length) {
    feed = liveRecords;
    mode = 'live';
    coverage = cov(
      { status: 'live', live_records: distinct(liveAu), restored_records: 0, note: null },
      null,
      [`mode=live, ${liveRecords.length} records from the live feeds, ${distinct(liveAu)} Australian`]);
  } else if (anyLive && prevAu.length) {
    // Some feeds answered but none of them carried an Australian record. Keep the live
    // global layer and put the last good Australian layer back underneath it.
    feed = [...liveRecords, ...prevAu];
    mode = 'partial';
    coverage = cov(
      {
        status: 'restored_from_last_good',
        live_records: 0,
        restored_records: distinct(prevAu),
        note: 'No Australian record reached this build from the automated feeds, so the Australian'
          + ' detections shown are the last set that did, from the previous successful run.'
          + ' They are not confirmed as current, and any detection notified since then is missing.',
      },
      'The Australian layer of this build is not current. The automated feed that carries Australian'
        + ' detections returned nothing on this run, so the Australian detections shown are the last'
        + ' set that did arrive.',
      [`mode=partial, live feeds returned 0 Australian records`
        + `${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`,
      `restored ${distinct(prevAu)} Australian record(s) from the last good run`]);
  } else if (anyLive) {
    // Nothing Australian live and nothing Australian to fall back on. The curated
    // overlay is merged after this and is the only Australian layer left.
    feed = liveRecords;
    mode = 'partial';
    coverage = cov(
      {
        status: 'unavailable',
        live_records: 0,
        restored_records: 0,
        note: 'No Australian record reached this build from the automated feeds and there was no'
          + ' previous Australian data to fall back on. Only individually sourced curated records'
          + ' are shown for Australia.',
      },
      'The automated feed that carries Australian detections returned nothing on this run, and there'
        + ' was no previous Australian data to fall back on. Only individually sourced curated'
        + ' records are shown for Australia.',
      [`mode=partial, no Australian records live and none in the last good run`
        + `${failed.length ? ` (failed: ${failed.join(', ')})` : ''}`]);
  } else if (prev.length) {
    feed = prev;
    // A previous run that was itself partial or live is cached data now. A previous
    // seed run stays a seed run: there was never live data to go stale.
    mode = (prevMeta.mode === 'live' || prevMeta.mode === 'partial') ? 'stale' : (prevMeta.mode || 'seed');
    coverage = cov(
      {
        status: prevAu.length ? 'last_good' : 'unavailable',
        live_records: 0,
        restored_records: distinct(prevAu),
        note: 'No automated feed answered on this run, so every record shown is from the last good'
          + ' run rather than from a live fetch.',
      },
      'No automated feed answered on this run. Every record shown is from the last good run.',
      [`mode=${mode}, no feed answered, reusing ${prev.length} record(s) from the last good run`]);
  } else {
    feed = [];
    mode = 'seed';
    coverage = cov(
      {
        status: 'unavailable',
        live_records: 0,
        restored_records: 0,
        note: 'No automated feed answered and there is no previous data. Only individually sourced'
          + ' curated records are shown.',
      },
      'No automated feed answered and there is no previous data. Only individually sourced curated'
        + ' records are shown.',
      ['mode=seed, no feed answered and no previous data, curated overlay only']);
  }

  coverage.sources_live = results.filter((r) => r.status === 'live').map((r) => r.key);
  coverage.sources_failed = failed;
  return { feed, mode, coverage };
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Editorial status text, loaded early because it also supplies the fallback
  // values the official collector uses when a government page cannot be parsed.
  const auStatus = loadJson(AU_STATUS, {});
  delete auStatus._comment;

  // 1. curated overlay (always present, always real)
  const curatedRaw = loadJson(CURATED, { records: [] }).records || [];
  const curated = curatedRaw.map(makeRecord).filter(Boolean);
  log(`curated overlay: ${curated.length}/${curatedRaw.length} records`);

  // 2. automated sources (parallel)
  const results = await Promise.all(SOURCES.map(collectSource));
  const liveRecords = results.flatMap((r) => r.records);

  // 3. last-good fallback so a fully-failed run never wipes the map
  const prevRaw = loadJson(DETECTIONS, []);
  const prev = Array.isArray(prevRaw) ? prevRaw.filter(Boolean) : [];
  const prevMeta = loadJson(SUMMARY, {});

  const selection = selectFeed({ results, liveRecords, prev, prevMeta });
  const { feed, mode, coverage } = selection;
  for (const line of coverage.lines) log(`feed: ${line}`);

  // 4. reconcile the overlay against the feed BEFORE anything is counted, and log
  //    the outcome every run. This is a public health count, so a drop is never
  //    silent, whether it happened or not.
  const merged = mergeCurated(curated, feed);
  const records = merged.records;
  log(`reconcile: ${merged.note}`);

  records.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  // 5. era classification, BEFORE anything is counted or published. Each record is
  //    stamped with the real-world event it belongs to, so the front end never has to
  //    infer that Victoria's fourteen records are one current H5N1 detection, twelve
  //    resolved H7 poultry outbreaks and one unrelated 2024 human case. Inference is
  //    where that error was born, so the pipeline decides once, here.
  const eras = stampEras(records);
  log('eras: ' + Object.entries(eras.counts).map(([k, v]) => `${k}=${v}`).join(', '));
  if (eras.unclassified.length) {
    // Never silent. An unclassified record is not counted as part of the live outbreak,
    // so this line is the only way a maintainer learns a rule needs widening.
    log(`eras: ${eras.unclassified.length} unclassified record(s), review pipeline/lib/era.mjs`);
    for (const u of eras.unclassified.slice(0, 10)) log(`  unclassified ${u.id}: ${u.reason}`);
  }

  // Global human-case context (WHO via OWID). Non-fatal if it fails.
  let humanContext = null;
  try {
    humanContext = await fetchHumanContext();
    log(`human context: global cumulative ${humanContext.global_cumulative}, AU ${humanContext.australia}`);
  } catch (e) {
    log(`human context unavailable: ${e.message}`);
  }

  // Commonwealth official position. Deliberately emits no map records: the pages
  // publish place names with no coordinates. Non-fatal, never throws.
  let official = null;
  try {
    official = await fetchOfficialAuStatus({
      // au-status.json is the editorial fallback; parsed values always win.
      defaults: { human_health_risk: auStatus.human_risk },
    });
    log(`au official: total ${official.national_total}`
      + `, states ${Object.keys(official.by_state || {}).length}`
      + `, latest ${official.latest_update?.date || 'n/a'}`
      + `, parsed ${Object.values(official.parsed).filter(Boolean).length}/${Object.keys(official.parsed).length}`);
    for (const e of official.errors) log(`au official error: ${e}`);
    for (const n of official.notes) log(`au official note: ${n}`);
  } catch (e) {
    log(`au official unavailable: ${e.message}`); // belt and braces, it does not throw
  }

  // News early-signal tier: a maintainer-facing gap detector, never map data and
  // never part of any published count. It answers one question, is something being
  // reported that our mapped data does not have. Non-fatal, never throws.
  let newsSignal = null;
  try {
    newsSignal = await auNewsSignalCheck({
      records,
      // Provenance travels with the counts so every gap can cite where the
      // official figure came from.
      officialCounts: official && official.by_state ? {
        counts: official.by_state,
        as_of: official.as_at_text || official.as_at_date,
        source: 'DAFF national H5 bird flu tally',
        source_url: AU_OFFICIAL_SOURCES[1].url,
      } : null,
    });
    log(`au news signal: ${newsSignal.note}`);
  } catch (e) {
    log(`au news signal unavailable: ${e.message}`); // belt and braces, it does not throw
  }

  const summary = buildSummary(records, results, mode, humanContext, auStatus, official, newsSignal, coverage);
  writeFileSync(DETECTIONS, JSON.stringify(records));
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  log(`wrote ${records.length} records, mode=${mode}`
    + `, australia published ${summary.au.total} (${summary.data_coverage.australia.status})`);
  log(`news: ${summary.coverage_signal ? summary.coverage_signal.headlines.length : 0} headline(s) published`
    + ` of ${summary.coverage_signal ? summary.coverage_signal.headlines_checked : 0} retained`);

  // The official comparison, logged with both bases named, because the raw difference
  // between the two totals and the official-basis shortfall are different numbers and
  // conflating them is how a misleading figure gets published.
  const og = summary.official_gap;
  if (og) {
    log(`official gap: official total ${og.official_total}, mapped total ${og.mapped_total}`
      + `, difference ${og.total_difference}`
      + (og.official_breakdown_shortfall == null
        ? '; no usable official per-state breakdown, so no official-basis figure'
        : `; official-basis shortfall ${og.official_breakdown_shortfall}`
          + `, mapped beyond the official breakdown ${og.mapped_beyond_official_breakdown}`));
  }

  // History dataset for the separate history page: the committed global timeline merged
  // with an Australian timeline generated from today's records. Non-fatal like every
  // other source, so a failure here leaves the last committed history.json in place
  // rather than taking the page down.
  try {
    const history = buildHistory(records, summary, auStatus, official);
    writeFileSync(HISTORY_OUT, JSON.stringify(history, null, 2));
    log(`history: ${history.counts.curated} curated + ${history.counts.generated} generated`
      + ` = ${history.counts.total} entries, ${history.counts.citations} citations`);
  } catch (e) {
    log(`history unavailable, keeping last committed file: ${e.message}`);
  }

  log(`sources live: ${results.filter((r) => r.status === 'live').map((r) => r.key).join(', ') || 'none'}`);
}

/**
 * The recent Australian headlines published for readers: date, outlet, headline, link.
 *
 * Alex asked for recent Australia-specific news as one of the four things this site
 * shows, so the retained list is published rather than only counted. The boundary is
 * absolute and unchanged: these are media reports, they are never detection records,
 * they are never mapped, and they are counted in no figure anywhere in this summary.
 *
 * An item without a date, a headline and a link is dropped, because a reader cannot
 * check a headline they cannot open or place in time.
 */
function publishedHeadlines(newsSignal) {
  const items = Array.isArray(newsSignal && newsSignal.headlines) ? newsSignal.headlines : [];
  return items
    .filter((h) => h && h.title && h.url && /^\d{4}-\d{2}-\d{2}$/.test(String(h.date || '')))
    .map((h) => ({
      date: h.date,
      outlet: h.outlet || null,
      // House style bans em dashes in anything this site renders, including data. The
      // substitution changes punctuation only, never a word, and the link goes to the
      // publisher's own wording.
      // The em dash is written as an escape so no dash character sits in this file.
      title: String(h.title).replace(/\s*\u2014\s*/g, ', ').replace(/\s+/g, ' ').trim(),
      url: h.url,
    }))
    // Newest first. Day precision only, and sort is stable, so same-day items keep the
    // feed's own newest-first timestamp order.
    .sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1)))
    .slice(0, MAX_PUBLISHED_HEADLINES);
}

/** How many days back the news query covered, read from the query itself. Null if unknown. */
function windowDays(newsSignal) {
  const q = newsSignal && newsSignal.signal ? String(newsSignal.signal.query || '') : '';
  const m = /when:(\d+)d/.exec(q);
  return m ? Number(m[1]) : null;
}

function buildSummary(records, results, mode, humanContext, auStatus = {}, official = null, newsSignal = null, coverage = null) {
  // Era breakdowns are computed from the stamped records, so every figure below and
  // every figure the front end prints come from the same classification.
  const auEras = australianEraBreakdown(records);
  const byCategory = {}, byCountry = {}, regions = { Global: records.length };
  const usStates = new Set(), auStates = new Set(), countries = new Set();
  let poultryBirds = 0, latest = '';

  // Australia-first roll-up.
  const au = { total: 0, wild_bird: 0, poultry: 0, dairy: 0, mammal: 0, human: 0, h5n1: 0, h7: 0, h5n1_wild: 0 };
  const auH5N1States = new Set(); // states in the current H5N1 wild-bird/mammal incursion
  // Per-state counts on exactly the same basis as au.h5n1_wild below, so the official
  // comparison can be done state by state without a second, differently-defined rule.
  const auH5N1StateCounts = {};
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
        if (r.admin1) {
          auH5N1States.add(r.admin1);
          auH5N1StateCounts[r.admin1] = (auH5N1StateCounts[r.admin1] || 0) + 1;
        }
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
    // The current-incursion figures, restated here from au_eras so the safe number sits
    // where the front end already looks. Note the trap this avoids: h5n1_detections
    // above is 19 because it also counts the unrelated May 2024 travel-acquired human
    // case, which is H5N1 but a different lineage (clade 2.3.2.1a). Use these fields,
    // or au_eras, for anything describing the live outbreak.
    current_era: CURRENT_AU_ERA,
    current_era_detections: auEras.current_records,
    current_era_states: auEras.current_states,
    current_era_state_list: auEras.current_state_list,
    first_detection_date: firstDate,
    days_since_first_detection: daysSince,
    latest_detection: auLatest || null,
  };

  const cov = coverage || {};
  const covAu = cov.australia || {};

  return {
    generated_at: now,
    latest_event: latest || null,
    mode,
    // One printable sentence when this run is not fully current, null when it is. It
    // names the layer that is stale rather than describing the whole page as preview
    // data, because those are different situations for a reader.
    mode_note: cov.mode_note || null,
    // Which regional layer this run actually received, so "live" can never be a claim
    // about a layer that failed. Australia is called out on its own: every Australian
    // record arrives through one upstream, and the largest feed here is United States
    // only, so a global success test can hide a total loss of Australian data.
    data_coverage: {
      australia: {
        status: covAu.status || 'unknown',
        live_records: covAu.live_records ?? null,
        restored_records: covAu.restored_records ?? null,
        published_records: au.total,
        published_current_era: auEras.current_records,
        note: covAu.note || null,
      },
      sources_live: cov.sources_live || [],
      sources_failed: cov.sources_failed || [],
    },
    // Australia is the focus; the world block is context.
    au: auBlock,
    // Which real-world event each record belongs to. `definitions` carries the rule and
    // the justification for every era, so the page can show its own working, and
    // `current_au_era` names the single era that may be presented as live.
    eras: {
      version: 1,
      current_au_era: CURRENT_AU_ERA,
      definitions: eraDefinitions(),
      by_era: eraCounts(records),
    },
    // Australian counts split by era, nationally and per state, with a ready-to-print
    // sentence for each state. There is deliberately no combined per-state total: a bare
    // "14 detections in Victoria" is the bug this block exists to make impossible.
    au_eras: auEras,
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
    // The Commonwealth's own position, published alongside ours rather than merged
    // into it. The mapped points follow WOAH notification (which FAO EMPRES-i
    // ingests, about 14 days behind), the official count follows the Commonwealth's
    // own updates, so the two figures are different measurements and both are shown.
    official_au: official || null,
    // The comparison the front end states without recomputing anything: official
    // total, our mapped total, the difference between those two published figures,
    // and the one official-basis figure that can be computed honestly, which is the
    // per-state shortfall against the official breakdown. h5n1_wild is the comparable
    // figure, NOT au.total, because the official count covers only the current H5
    // wild-seabird incursion and au.total also holds the resolved 2024-25 H7
    // poultry outbreaks.
    official_gap: official ? officialGap({
      status: official,
      mappedTotal: au.h5n1_wild,
      mappedStates: [...auH5N1States],
      mappedByState: auH5N1StateCounts,
    }) : null,
    // Australian media reporting. Two jobs, one feed. For readers, `headlines` is the
    // recent-news list the site shows, as news: dated, attributed, linked out. For
    // maintainers, `gaps` flags something reported that our mapped data does not have.
    // Neither is ever mapped, and neither is counted in any figure above. Every gap is
    // a lead to verify against a primary source rather than a fact, and it is kept in
    // the JSON even when the page stays silent about it, so a gap is never invisible to
    // whoever maintains this.
    coverage_signal: newsSignal ? {
      key: newsSignal.key,
      kind: newsSignal.kind,
      name: newsSignal.name,
      homepage: newsSignal.homepage,
      ok: newsSignal.ok,
      note: newsSignal.note,
      disclaimer: newsSignal.disclaimer,
      headlines_checked: newsSignal.headlines.length,
      // The reader-facing list, newest first and capped for display. News only.
      headlines: publishedHeadlines(newsSignal),
      // The search window the headlines came from, so an empty list can be read as
      // "nothing in the last N days" rather than as an unexplained blank.
      headlines_window_days: windowDays(newsSignal),
      mapped_by_state: newsSignal.mapped_by_state,
      gaps: newsSignal.gaps,
    } : null,
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
    // Sources that inform the page without producing map records. Kept out of
    // `sources` on purpose: that list carries a record count per feed, and a
    // record-less entry there would read as a feed that has broken.
    context_sources: [
      ...AU_OFFICIAL_SOURCES.map((s) => ({ ...s, kind: 'official' })),
      { name: NEWS_SIGNAL.name, url: NEWS_SIGNAL.homepage, kind: 'signal' },
    ],
    references: CURATED_REFERENCES,
  };
}

// ---------------------------------------------------------------------------
// History dataset
// ---------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-06-20" -> "20 June 2026". Returns the input unchanged if it is not a date. */
function displayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (iso || null);
}

const idSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** A citation is only a citation if it has a real URL. */
function validCitations(list) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.url === 'string' && /^https?:\/\//.test(c.url))
    .map((c) => ({ publisher: c.publisher || null, title: c.title || null, url: c.url }));
}

/** Turn a record's own source fields into a citation, or nothing if it has no URL. */
function recordCitation(r, title) {
  return validCitations([{ publisher: r.source, title: title || 'Source record', url: r.source_url }]);
}

/**
 * Sentence describing a record's confirmation status, using the schema's own meaning:
 * null means the source did not state one, NOT that the detection is unconfirmed.
 */
function confidenceSentence(r) {
  if (r.confidence === 'presumptive') {
    return 'It is recorded as presumptive: an authority announced the detection while confirmatory testing was still outstanding. Australian official tallies count confirmed and presumed positive detections together.';
  }
  if (r.confidence === 'confirmed') return 'It is recorded as confirmed.';
  return 'The source did not state a confirmation status.';
}

/**
 * The Australian half of the timeline, generated from the live data on every build.
 *
 * This is the half that keeps the history page current without any API spend: the global
 * lineage in pipeline/history.json barely changes and is committed, while these entries
 * are recomputed from today's records. Every generated entry cites the source that
 * published the underlying record, so the "no fact without a source" rule holds for
 * generated entries exactly as it does for curated ones.
 */
function generateAustralianHistory(records, summary, auStatus, official) {
  const out = [];
  const auEras = summary.au_eras || {};

  // 1. First detection in each state, current incursion only. The state holding the
  //    national first is skipped: pipeline/history.json already carries that arrival as
  //    a curated entry with the WOAH notification as its citation.
  const current = records
    .filter((r) => r.country === 'Australia' && r.era === CURRENT_AU_ERA && r.admin1)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const nationalFirstState = current.length ? current[0].admin1 : null;
  const seenStates = new Set(nationalFirstState ? [nationalFirstState] : []);

  for (const r of current) {
    if (seenStates.has(r.admin1)) continue;
    seenStates.add(r.admin1);
    const citations = recordCitation(r, `First ${r.admin1} detection`);
    if (!citations.length) continue; // no source URL, no entry
    const where = [r.species, r.locality].filter(Boolean).join(', ');
    out.push({
      id: `au-first-${idSlug(r.admin1_code || r.admin1)}`,
      sort_date: r.date,
      date_display: displayDate(r.date),
      date_precision: 'day',
      title: `First detection in ${r.admin1}`,
      category: 'australia',
      scope: 'australia',
      certainty: r.confidence === 'presumptive' ? 'preliminary' : 'established',
      body: `The first detection in ${r.admin1} in the current H5N1 incursion, dated ${displayDate(r.date)}.`
        + (where ? ` ${where}.` : '')
        + ` ${confidenceSentence(r)}`,
      citations,
      origin: 'generated',
      generated_from: 'first current-incursion record for this state',
    });
  }

  // 2. Local transmission between resident birds: a change in kind, not just in count.
  const lt = auStatus.local_transmission;
  if (lt && lt.date && lt.note) {
    const citations = validCitations([{ publisher: lt.attributed_to || lt.source, title: lt.source, url: lt.source_url }]);
    if (citations.length) {
      out.push({
        id: 'au-local-transmission',
        sort_date: lt.date,
        date_display: displayDate(lt.date),
        date_precision: 'day',
        title: 'Evidence suggests spread between resident Australian birds',
        category: 'australia',
        scope: 'australia',
        certainty: 'preliminary',
        body: lt.note,
        quote: lt.quote || null,
        quote_attribution: lt.attributed_to || null,
        citations,
        origin: 'generated',
        generated_from: 'pipeline/au-status.json local_transmission',
      });
    }
  }

  // 3. The resolved H7 poultry outbreaks, as one block. Kept visible on purpose: a
  //    reader who remembers the 2024 outbreaks needs to see why they are not in the
  //    current count, rather than finding them missing and assuming the site is wrong.
  const h7 = (auEras.national || []).find((e) => e.era === 'au_h7_poultry_2024_2025');
  if (h7 && h7.records) {
    const h7Records = records.filter((r) => r.country === 'Australia' && r.era === 'au_h7_poultry_2024_2025');
    const seen = new Set();
    const citations = [];
    for (const r of h7Records) {
      const c = recordCitation(r, 'H7 poultry outbreak records')[0];
      if (c && !seen.has(c.url)) { seen.add(c.url); citations.push(c); }
    }
    citations.push({
      publisher: 'Australian Government, outbreak.gov.au',
      title: 'High pathogenicity avian influenza',
      url: 'https://www.outbreak.gov.au/emerging-risks/high-pathogenicity-avian-influenza',
    });
    const states = Object.keys(h7.state_counts || {});
    out.push({
      id: 'au-h7-poultry-records',
      sort_date: h7.first_date,
      date_display: `${displayDate(h7.first_date)} to ${displayDate(h7.last_date)}`,
      date_precision: 'range',
      title: 'The resolved H7 poultry outbreaks held in this dataset',
      category: 'subtype_distinction',
      scope: 'australia',
      certainty: 'established',
      body: `This tracker holds ${h7.records} H7 poultry outbreak records in Australia,`
        + ` dated ${displayDate(h7.first_date)} to ${displayDate(h7.last_date)}`
        + (states.length ? `, in ${states.join(', ')}` : '')
        + '. They were a different subtype from H5N1, they were in commercial poultry rather than wild birds,'
        + ' and they are resolved. They are counted separately from the current incursion everywhere on this site.'
        + ' The dates are reporting dates from the automated feed, not the dates the outbreaks were declared over.',
      citations: validCitations(citations),
      origin: 'generated',
      generated_from: 'records in era au_h7_poultry_2024_2025',
    });
  }

  // 4. The 2024 human case, quoted from how its source described it rather than
  //    re-described here.
  for (const r of records.filter((r) => r.country === 'Australia' && r.era === 'au_human_2024')) {
    const citations = recordCitation(r, 'Human case notification');
    if (!citations.length) continue;
    out.push({
      id: `au-human-${r.date}`,
      sort_date: r.date,
      date_display: displayDate(r.date),
      date_precision: 'day',
      title: 'Australia\'s only human H5N1 case, and why it is separate',
      category: 'human_health',
      scope: 'australia',
      certainty: 'established',
      body: `One human case recorded in ${r.admin1 || 'Australia'}, dated ${displayDate(r.date)}.`
        + (r.species ? ` The source describes it as: ${r.species}.` : '')
        + ' It is a different virus lineage from the clade 2.3.4.4b virus in Australian wild birds,'
        + ' it was acquired overseas, and it is not part of the 2026 event.'
        + ' It is listed separately for that reason, not counted alongside the wild bird detections.',
      citations,
      origin: 'generated',
      generated_from: 'records in era au_human_2024',
    });
  }

  // 5. Where the official national count stands today, next to what this site maps. The
  //    entry that makes the page genuinely daily.
  if (official && official.ok && official.national_total != null) {
    const mapped = summary.official_gap ? summary.official_gap.mapped_total : auEras.current_records;
    const breakdown = Object.entries(official.by_state || {})
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${n}`)
      .join(', ');
    const asAt = official.as_at_text || displayDate(official.as_at_date) || displayDate(official.latest_update?.date);
    out.push({
      id: 'au-official-position',
      sort_date: official.as_at_date || official.latest_update?.date || new Date().toISOString().slice(0, 10),
      date_display: asAt || 'Current',
      date_precision: 'day',
      title: 'Where the official national count stands',
      category: 'australia',
      scope: 'australia',
      certainty: 'established',
      body: `As at ${asAt}, the Australian Government reported ${official.national_total}`
        + ` ${official.national_total_phrasing || 'confirmed or presumed positive'} detections of H5 bird flu in Australia`
        + (breakdown ? ` (${breakdown})` : '')
        + `. This site individually maps ${mapped} current detections, which is not a subset of that tally:`
        + ' the two figures are different measurements, and each can hold an event the other does not yet.'
        + ' The mapped points follow WOAH notification, which lags by about a fortnight, and the official count follows'
        + ' the Commonwealth\'s own updates. Both are published rather than reconciled into one.',
      citations: validCitations(AU_OFFICIAL_SOURCES.map((s) => ({ publisher: 'Australian Government Department of Agriculture, Fisheries and Forestry', title: s.name, url: s.url }))),
      origin: 'generated',
      generated_from: 'live Commonwealth tally',
    });
  }

  return out;
}

/**
 * Merge the committed global history with the generated Australian timeline and return
 * the dataset for site/data/history.json.
 *
 * Every entry is required to carry at least one citation with a real URL. An entry that
 * does not is dropped and logged, because the whole value of this page is that no fact
 * appears on it without a source.
 */
function buildHistory(records, summary, auStatus = {}, official = null) {
  const src = loadJson(HISTORY_SRC, null);
  if (!src || !Array.isArray(src.entries) || src.entries.length === 0) {
    throw new Error('pipeline/history.json is missing or empty');
  }

  const dropped = [];
  const keep = (e) => {
    const citations = validCitations(e.citations);
    if (!citations.length) { dropped.push(e.id || e.title); return null; }
    return { ...e, citations };
  };

  const curated = src.entries
    .map((e) => keep({ ...e, origin: 'curated' }))
    .filter(Boolean);
  const generated = generateAustralianHistory(records, summary, auStatus, official)
    .map(keep)
    .filter(Boolean);

  for (const d of dropped) log(`history: dropped entry with no usable citation: ${d}`);

  const entries = [...curated, ...generated].sort((a, b) => {
    if (a.sort_date !== b.sort_date) return a.sort_date < b.sort_date ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });

  const byCategory = {};
  let citations = 0;
  for (const e of entries) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    citations += e.citations.length;
  }

  return {
    generated_at: now,
    version: src.version || 1,
    curated_updated: src.curated_updated || null,
    entries_order: 'ascending by sort_date, oldest first',
    // Stated rather than smoothed away. Different authorities date the same event
    // differently, so a few entries around June 2026 sit within days of each other in an
    // order that looks odd until you know why. Silently shifting a date to make a
    // timeline read neatly would be inventing one.
    date_note: 'Dates come from the source that published each entry, and sources use different date bases: observation date, report date, WOAH notification date, or the date a state announced a result. Entries within a few days of each other may therefore not be in the order events actually happened, and the WOAH notification of Australia\'s first case (20 June 2026) carries a later date than some individual detections in the automated feed.',
    note:'A history of the H5N1 lineage. The global entries are hand-curated and committed to the repository, because the historical record barely changes; the Australian entries are generated from this tracker\'s live data on every build. Every entry carries at least one citation with a URL, and an entry without one is dropped rather than published. Where a figure is approximate, ranged, preliminary or disputed, the entry says so instead of presenting a clean number.',
    certainty_levels: src.certainty_levels || [],
    categories: src.categories || [],
    counts: {
      total: entries.length,
      curated: curated.length,
      generated: generated.length,
      dropped: dropped.length,
      citations,
      by_category: byCategory,
    },
    entries,
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
