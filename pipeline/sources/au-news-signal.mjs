// Australian news EARLY-SIGNAL GAP DETECTOR. This is deliberately NOT a data source.
//
// READ THIS BEFORE CHANGING ANYTHING HERE.
//
// Why it exists: on 30 July 2026 Agriculture Victoria announced Australia's first
// Victorian H5 detection (a greater crested tern at Portland) at 11:18am. It was in
// Google News within hours. The Commonwealth national tally, timestamped 11:30am the
// same day, still read "WA 10, SA 15, NSW 2, QLD 1" with no Victoria, and FAO
// EMPRES-i (our only automated Australian feed, which ingests WOAH/WAHIS
// notifications) would not carry it for roughly two weeks. So news is by a wide
// margin the fastest signal available to this pipeline.
//
// Why it must never become a data source: news is media, not an official animal
// health notification. Headlines get species, locations, counts and confirmation
// status wrong, they rarely give coordinates, and a public health tracker that plots
// newspaper headlines as data destroys the credibility that makes it worth running.
//
// So this module:
//   - NEVER calls makeRecord() and never returns records. It cannot reach the map.
//   - NEVER contributes to headline statistics (detection counts, states affected).
//   - Answers exactly one operational question: is something being reported that our
//     mapped data does not have?
//
// Its output is a maintainer-facing gap alert, and at most a clearly-labelled
// "reported, awaiting official confirmation" note for readers. Every gap is a LEAD TO
// VERIFY against a primary source, never a fact. The heuristics below will produce
// false positives; that is accepted, because a false lead costs a maintainer two
// minutes and a missed state costs the site its reason to exist.
//
// It is registered outside SOURCES (it has no collect() that yields records). It never
// throws: every failure path returns an empty result with a note, so the build still
// succeeds and the site still renders.
//
// Feed (keyless, verified live 30 July 2026, HTTP 200 XML):
//   https://news.google.com/rss/search?q=<query>&hl=en-AU&gl=AU&ceid=AU:en
import { getText } from '../lib/http.mjs';
import { canonicalAuState, AU_STATES } from '../lib/geo.mjs';

/** Descriptor for build.mjs. `kind` is load-bearing: it is not a data source. */
export const NEWS_SIGNAL = {
  key: 'au-news-signal',
  kind: 'gap-detector',
  name: 'Google News (Australia): early-signal gap detector',
  region: 'Australia',
  homepage: 'https://news.google.com/',
};

/** Attach to anything shown to readers. Media reports are leads, not confirmations. */
export const LEAD_DISCLAIMER =
  'Reported in the media and not yet in our mapped data. A lead awaiting official '
  + 'confirmation, not a confirmed detection.';

const FEED = 'https://news.google.com/rss/search';
const BASE_QUERY = '"bird flu" OR "avian influenza" Australia';

// The current H5 incursion begins June 2026 (WOAH first-case notification, 20 June
// 2026). Mapped records before this are the resolved 2024-25 H7 poultry outbreaks and
// must never be counted as current-incursion coverage.
const INCURSION_START = '2026-06-01';

// Official per-state tallies and our mapped records count on different bases: the
// Commonwealth counts "confirmed or presumed positive" events at its own confirmation
// timing, we count source-published events. A difference of one is routine noise, so
// only flag a shortfall from two upwards.
const MATERIAL_SHORTFALL = 2;

const DEFAULT_DAYS = 14;
const MAX_HEADLINES = 40;      // full de-duplicated list returned to the caller
const MAX_STATE_HEADLINES = 5; // citations kept per state
const WINDOW = 70;             // chars either side of a state mention we read for context

// ---- state mentions -------------------------------------------------------
// Two forms per state: the full name (plus the demonym, since headlines write
// "Victorian" and "Queenslanders"), and the abbreviation.
//
// Abbreviations are matched CASE-SENSITIVELY and only in headlines that contain some
// lowercase text. Bare "SA", "WA", "ACT", "NT" and "TAS" collide with ordinary words,
// and wire copy like "AUSTRALIA AGRICULTURE MINISTER: H5 BIRD FLU SPREADING LOCALLY"
// arrives fully upper-cased, where any collision becomes a match.
const STATE_MATCHERS = {
  'New South Wales': { full: /\bNew South Wales\b/gi, abbr: /\bNSW\b/g },
  'Victoria': { full: /\bVictoria(?:ns?)?\b/gi, abbr: /\bVIC\b/g },
  'Queensland': { full: /\bQueensland(?:ers?)?\b/gi, abbr: /\bQld\b/gi },
  'South Australia': { full: /\bSouth Australia(?:ns?)?\b/gi, abbr: /\bSA\b/g },
  'Western Australia': { full: /\bWestern Australia(?:ns?)?\b/gi, abbr: /\bWA\b/g },
  'Tasmania': { full: /\bTasmania(?:ns?)?\b/gi, abbr: /\bTas\b/g },
  'Northern Territory': { full: /\bNorthern Territory\b/gi, abbr: /\bNT\b/g },
  'Australian Capital Territory': { full: /\bAustralian Capital Territory\b/gi, abbr: /\bACT\b/g },
};

// A detection-like claim. "detected in X", "X records its first case", "confirmed in X".
const STRONG_RE = /\b(?:detect(?:ed|s|ion|ions)|confirm(?:ed|s|ation)|records? (?:its |their )?(?:own )?first|tests? positive|tested positive|first case|first detection|reached|reaches)\b/i;
// Weaker but still detection-shaped. "cases", "outbreak", "found at", "suspected".
// "discovered" earns its place here: 30 July 2026 headlines ran "Deadly bird flu strain
// discovered in Victoria for first time" with no other detection verb.
const MODERATE_RE = /\b(?:cases?|outbreak|positive|suspected|presumptive|discover(?:ed|s|y)|found (?:at|on|in|near)|spread(?:s|ing)? (?:to|into)|arrived in|lands? (?:in|on))\b/i;
// "first" anywhere near the mention is exactly the event we most need to catch.
const FIRST_RE = /\bfirst\b/i;
// Anticipation, not detection. This is the "Victorian farmers watch nervously as bird
// flu spreads in SA" class, which must not become a Victorian gap.
const ANTICIPATORY_RE = /\b(?:watch\w*|looming|looms?|loom|braces?|bracing|prepar\w*|urged?|urges|warn\w*|monitor\w*|fear\w*|nervous\w*|alert|risks?|threat\w*|could|might|may|plans?|ready|await\w*|poised|concern\w*|worr\w*|expect\w*|if)\b/i;
// The 2024-25 H7 poultry outbreaks (Victoria, NSW) and any other retrospective. These
// must never raise a gap for the current H5 incursion.
const HISTORICAL_RE = /\bH7(?:N\d)?\b|\b202[45]\b|last year|previous outbreak|earlier outbreak|egg shortage/i;
// A detection reported somewhere else. Heard Island is explicitly out of scope for this
// tracker (see docs/DATA_SOURCES.md caveats).
const FOREIGN_RE = /\b(?:new zealand|nz|united states|u\.s\.|usa|america|cambodia|united kingdom|britain|europe|antarctic\w*|heard island|south africa|japan|indonesia|vietnam|china|india|chile|peru)\b/i;

// ---- XML helpers ----------------------------------------------------------

const CODE_POINT_MAX = 0x10ffff;

function safeChar(n) {
  return Number.isFinite(n) && n > 0 && n <= CODE_POINT_MAX ? String.fromCodePoint(n) : ' ';
}

/** Decode RSS text: CDATA, numeric entities, then named ones (&amp; last, so
 *  "&amp;lt;" cannot double-decode into a live tag). */
function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeXml(m[1]) : '';
};

/**
 * Remove the trailing " - Outlet Name" that Google News appends to every title.
 * Required, not cosmetic: outlet names contain state names and abbreviations
 * ("InDaily South Australia", "The Standard | Warrnambool, VIC"), so matching states
 * against the raw title invents detections out of bylines.
 */
function stripOutlet(title, outlet) {
  let t = title;
  if (outlet) {
    const esc = outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[-|]\\s*${esc}\\s*$`, 'i'), '');
  }
  // Fall back to dropping a short final " - X" / " | X" segment when the <source> tag
  // is missing or the suffix was truncated by Google.
  if (t === title) t = t.replace(/\s+[-|]\s+[^-|]{2,60}$/, '');
  return t.trim() || title;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const normTitle = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---- signal scoring -------------------------------------------------------

/** Every position where `state` is named in `text`, honouring the all-caps rule. */
function mentionPositions(text, state) {
  const m = STATE_MATCHERS[state];
  if (!m) return [];
  const out = [];
  const push = (re) => {
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(text))) {
      out.push({ index: hit.index, length: hit[0].length });
      if (hit.index === re.lastIndex) re.lastIndex++; // guard against zero-length loops
    }
  };
  push(m.full);
  if (/[a-z]/.test(text)) push(m.abbr);
  return out;
}

/**
 * Score one state mention on how much it looks like a reported detection IN that state.
 * Returns 0 or less when the context is anticipation, retrospective, or foreign.
 */
function scoreMention(text, { index, length }) {
  const w = text.slice(Math.max(0, index - WINDOW), index + length + WINDOW);
  if (FOREIGN_RE.test(w)) return 0;
  let score = 0;
  if (STRONG_RE.test(w)) score += 3;
  else if (MODERATE_RE.test(w)) score += 2;
  if (score && FIRST_RE.test(w)) score += 1;
  if (ANTICIPATORY_RE.test(w)) score -= 2;
  return score;
}

const QUALIFIES = 3; // minimum mention score treated as a detection-like report

/** Confidence in a news lead: how many independent outlets carried it. */
function newsConfidence(outletCount) {
  if (outletCount >= 3) return 'high';
  return outletCount === 2 ? 'medium' : 'low';
}

// ---- feed collection ------------------------------------------------------

function feedUrl(days) {
  const q = `${BASE_QUERY} when:${days}d`;
  return `${FEED}?q=${encodeURIComponent(q)}&hl=en-AU&gl=AU&ceid=AU:en`;
}

/**
 * Parse the RSS into dated, de-duplicated headlines, newest first.
 * Returns the raw item count too, so a quiet news week (items present, none recent)
 * is distinguishable from a broken feed (no items at all).
 */
function parseItems(xml, days) {
  const cutoff = Date.now() - days * 86400000;
  const chunks = String(xml).split(/<item[\s>]/).slice(1);
  const items = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/)[0];
    const outlet = tag(body, 'source');
    const rawTitle = tag(body, 'title');
    const title = stripOutlet(rawTitle, outlet);
    const url = tag(body, 'link');
    const ts = Date.parse(tag(body, 'pubDate'));
    // A lead without a usable date cannot be verified, so it is not a lead.
    if (!title || !Number.isFinite(ts) || ts < cutoff) continue;
    const key = normTitle(title);
    if (!key || seen.has(key)) continue; // wire copy runs verbatim across outlets
    seen.add(key);
    items.push({ title, outlet: outlet || null, date: ymd(new Date(ts)), ts, url: url || null });
  }
  items.sort((a, b) => b.ts - a.ts); // newest first
  return { items, itemsInFeed: chunks.length };
}

/** Group qualifying mentions by state, keeping the headlines that justified each. */
function statesFromItems(items) {
  const states = {};
  for (const item of items) {
    const historical = HISTORICAL_RE.test(item.title);
    for (const state of Object.keys(STATE_MATCHERS)) {
      const positions = mentionPositions(item.title, state);
      if (!positions.length) continue;
      const score = Math.max(...positions.map((p) => scoreMention(item.title, p)));
      const entry = states[state] || (states[state] = {
        state,
        code: AU_STATES[state]?.code || null,
        mentioned: true,
        detection_signal: false,
        confidence: null,
        headlines: [],
        outlets: [],
      });
      // Retrospectives are recorded as a mention only, never as a signal.
      if (historical || score < QUALIFIES) continue;
      entry.detection_signal = true;
      if (entry.headlines.length < MAX_STATE_HEADLINES) {
        entry.headlines.push({ title: item.title, outlet: item.outlet, date: item.date, url: item.url, score });
      }
      if (item.outlet && !entry.outlets.includes(item.outlet)) entry.outlets.push(item.outlet);
    }
  }
  for (const entry of Object.values(states)) {
    if (entry.detection_signal) entry.confidence = newsConfidence(entry.outlets.length);
  }
  return states;
}

/**
 * Fetch and score the news signal. Never throws.
 * @param {{days?:number, timeoutMs?:number, retries?:number,
 *          fetchText?:(url:string, opts:object)=>Promise<string>}} [opts]
 *   fetchText is a test seam (defaults to lib/http getText) so the non-fatal paths can
 *   be verified against a dead or malformed feed without network games.
 * @returns {Promise<{ok:boolean, fetched_at:string, feed_url:string, query:string,
 *   items:Array<{title:string, outlet:string|null, date:string, url:string|null}>,
 *   states:Object<string,object>, note:string}>}
 */
export async function fetchNewsSignal(opts = {}) {
  const days = Number.isFinite(opts.days) && opts.days > 0 ? Math.floor(opts.days) : DEFAULT_DAYS;
  const url = feedUrl(days);
  const base = {
    ok: false,
    fetched_at: new Date().toISOString(),
    feed_url: url,
    query: `${BASE_QUERY} when:${days}d`,
    items: [],
    items_in_feed: 0,
    states: {},
    note: '',
  };
  try {
    const fetchText = typeof opts.fetchText === 'function' ? opts.fetchText : getText;
    const xml = await fetchText(url, {
      timeoutMs: opts.timeoutMs ?? 30000,
      retries: opts.retries ?? 2,
    });
    const { items, itemsInFeed } = parseItems(xml, days);
    if (!items.length) {
      return {
        ...base,
        items_in_feed: itemsInFeed,
        note: `google news: 0 usable headlines in last ${days}d`
          + ` (${itemsInFeed} items in feed, ${String(xml).length} bytes)`,
      };
    }
    const states = statesFromItems(items);
    const signalled = Object.values(states).filter((s) => s.detection_signal).map((s) => s.code || s.state);
    return {
      ...base,
      ok: true,
      items: items.slice(0, MAX_HEADLINES),
      items_in_feed: itemsInFeed,
      states,
      note: `google news ${days}d: ${items.length} headlines, detection signal in ${signalled.length}`
        + `${signalled.length ? ` (${signalled.join(', ')})` : ''}`,
    };
  } catch (err) {
    // Non-fatal by contract: the build must survive a dead feed.
    return { ...base, note: `google news signal unavailable: ${err?.message || err}` };
  }
}

// ---- gap detection --------------------------------------------------------

/**
 * Accept either a plain map ({"South Australia": 15, QLD: 1}) or a wrapper carrying
 * provenance ({counts:{...}, as_of, source, source_url}). Keys may be state names or
 * codes; anything that does not canonicalise is ignored rather than guessed at.
 */
function normalizeOfficial(official) {
  const meta = { as_of: null, source: null, source_url: null };
  let raw = official;
  if (official && typeof official === 'object' && !Array.isArray(official) && official.counts) {
    raw = official.counts;
    meta.as_of = official.as_of || official.timestamp || null;
    meta.source = official.source || null;
    meta.source_url = official.source_url || official.url || null;
  }
  const counts = {};
  const add = (k, v) => {
    const state = canonicalAuState(k);
    const n = Number(v);
    if (state && Number.isFinite(n) && n >= 0) counts[state] = Math.max(counts[state] || 0, Math.round(n));
  };
  if (Array.isArray(raw)) {
    for (const row of raw) if (row) add(row.state ?? row.admin1 ?? row.name, row.count ?? row.detections ?? row.value);
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) add(k, v);
  }
  return { counts, meta };
}

/**
 * Per-state count of what the map actually shows for the current H5 incursion.
 * Mirrors the summary rule in build.mjs (wild bird or mammal, H5 subtype) and adds the
 * incursion-start floor so the resolved 2024-25 H7 poultry events cannot pad a state.
 * A null subtype is counted: new sources may publish a detection before the subtype is
 * sequenced, and excluding those would manufacture gaps.
 */
export function mappedH5ByState(records = []) {
  const out = {};
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || r.country !== 'Australia') continue;
    if (!r.date || r.date < INCURSION_START) continue;
    if (r.category !== 'wild_bird' && r.category !== 'mammal') continue;
    if (r.subtype && !r.subtype.startsWith('H5')) continue;
    const state = canonicalAuState(r.admin1);
    if (!state) continue;
    out[state] = (out[state] || 0) + 1;
  }
  return out;
}

/**
 * Compare what we map against what news and the official tally say, and return the
 * gaps. Never throws. Every gap is a lead for a human to verify against a primary
 * source, not a fact, and none of it is a data record.
 *
 * @param {{records?:Array<object>, officialCounts?:object|Array<object>|null,
 *          signal?:object|null}} input
 *   records        normalized detection records (post-dedupe) from the build
 *   officialCounts per-state official tally, map or {counts, as_of, source, source_url}
 *   signal         result of fetchNewsSignal()
 * @returns {{generated_at:string, gaps:Array<object>, mapped_by_state:Object<string,number>,
 *   disclaimer:string, note:string}}
 */
export function findCoverageGaps({ records = [], officialCounts = null, signal = null } = {}) {
  const generated_at = new Date().toISOString();
  try {
    const mapped = mappedH5ByState(records);
    const { counts: official, meta } = normalizeOfficial(officialCounts);
    const newsStates = (signal && signal.states) || {};
    const gaps = [];
    const candidates = new Set([...Object.keys(newsStates), ...Object.keys(official)]);

    for (const state of candidates) {
      const code = AU_STATES[state]?.code || null;
      const have = mapped[state] || 0;
      const news = newsStates[state] && newsStates[state].detection_signal ? newsStates[state] : null;
      const officialCount = Object.prototype.hasOwnProperty.call(official, state) ? official[state] : null;
      const officialSaysSome = officialCount != null && officialCount > 0;
      if (!news && !officialSaysSome) continue;

      const shortfall = officialSaysSome ? officialCount - have : 0;
      const missing = have === 0;
      if (!missing && shortfall < MATERIAL_SHORTFALL) continue;

      const citations = [];
      if (officialSaysSome) {
        citations.push({
          kind: 'official',
          title: `Official tally: ${officialCount} detection${officialCount === 1 ? '' : 's'} in ${state}`,
          outlet: meta.source || 'official per-state tally',
          date: meta.as_of || null,
          url: meta.source_url || null,
        });
      }
      for (const h of news ? news.headlines : []) {
        citations.push({ kind: 'news', title: h.title, outlet: h.outlet, date: h.date, url: h.url });
      }

      const reported_by = news && officialSaysSome ? 'news+official' : (news ? 'news' : 'official');
      // The official tally is authoritative on count, so it carries the confidence when
      // present. News-only leads inherit the multi-outlet confidence.
      let confidence;
      if (officialSaysSome) confidence = shortfall >= 4 || missing ? 'high' : 'medium';
      else confidence = news.confidence;

      const detail = missing
        ? `${reported_by === 'official' ? 'The official tally' : 'Recent reporting'} indicates detections in ${state}`
          + `${officialSaysSome ? ` (official count ${officialCount})` : ''}, and our mapped data has none.`
        : `Official count for ${state} is ${officialCount}, our mapped data has ${have}, a shortfall of ${shortfall}.`;

      gaps.push({
        state,
        code,
        kind: missing ? 'missing_state' : 'count_shortfall',
        reported_by,
        mapped_count: have,
        official_count: officialCount,
        official_as_of: officialSaysSome ? meta.as_of : null,
        news_outlets: news ? news.outlets.slice() : [],
        news_confidence: news ? news.confidence : null,
        confidence,
        is_lead: true,
        detail,
        reader_note: LEAD_DISCLAIMER,
        citations,
      });
    }

    // Most actionable first: confidence, then the size of the deficit, then name.
    const rank = { high: 0, medium: 1, low: 2 };
    const deficit = (g) => (g.official_count ?? 0) - g.mapped_count;
    gaps.sort((a, b) => ((rank[a.confidence] ?? 3) - (rank[b.confidence] ?? 3))
      || (deficit(b) - deficit(a))
      || a.state.localeCompare(b.state));

    const note = gaps.length
      ? `${gaps.length} coverage gap${gaps.length === 1 ? '' : 's'}: `
        + gaps.map((g) => `${g.code || g.state} ${g.kind === 'missing_state' ? 'missing' : `short by ${g.official_count - g.mapped_count}`} (${g.confidence})`).join(', ')
      : 'no coverage gaps detected';

    return { generated_at, gaps, mapped_by_state: mapped, disclaimer: LEAD_DISCLAIMER, note };
  } catch (err) {
    // Non-fatal by contract, even on a malformed caller payload.
    return {
      generated_at,
      gaps: [],
      mapped_by_state: {},
      disclaimer: LEAD_DISCLAIMER,
      note: `gap detection unavailable: ${err?.message || err}`,
    };
  }
}

/**
 * Convenience wrapper: fetch the signal, then diff it against the map. Never throws.
 * @param {{records?:Array<object>, officialCounts?:object|null, days?:number,
 *          timeoutMs?:number, retries?:number}} [input]
 * @returns {Promise<{key:string, kind:string, name:string, homepage:string, ok:boolean,
 *   signal:object, gaps:Array<object>, mapped_by_state:Object<string,number>,
 *   headlines:Array<object>, disclaimer:string, note:string}>}
 */
export async function auNewsSignalCheck(input = {}) {
  const signal = await fetchNewsSignal(input);
  const result = findCoverageGaps({
    records: input.records,
    officialCounts: input.officialCounts,
    signal,
  });
  return {
    ...NEWS_SIGNAL,
    ok: signal.ok,
    signal,
    gaps: result.gaps,
    mapped_by_state: result.mapped_by_state,
    headlines: signal.items,
    disclaimer: LEAD_DISCLAIMER,
    note: `${signal.note}; ${result.note}`,
  };
}
