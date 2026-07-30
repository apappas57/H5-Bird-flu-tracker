// Australian Commonwealth official status (agriculture.gov.au).
//
// WHY this exists: FAO EMPRES-i is the tracker's only Australian map source and
// it ingests WOAH/WAHIS notifications, which lag. On 30 July 2026 the map showed
// 16 detections across 3 states while the Commonwealth reported 28 across 4, and
// Victoria's first detection was announced that morning and not mapped at all.
// This collector reads the official numbers straight from the Commonwealth so
// the site can state the authoritative count and show how far behind the mapped
// points are. Making the undercount visible is the point.
//
// WHY it emits no map records: these two pages are prose. They name places
// ("Port Lincoln, Eyre Peninsula", "Moreton Island", "Southend") and publish no
// coordinates. Geocoding a place name by guessing would put wrong dots on a
// public health map, so this module returns a status object only. Map points
// keep coming from sources that publish real coordinates.
//
// Pages read (both verified HTTP 200 on 30 July 2026):
//   /about/news/H5-bird-flu-updates
//       Dated Chief Veterinary Officer statements, newest first, same-day.
//       Carries the running national total and the per-event narrative.
//   /campaigns/birdflu   (birdflu.gov.au redirects here)
//       National tally with an AEST timestamp plus the per-state breakdown.
//
// WHY a browser User-Agent: probed 30 July 2026, agriculture.gov.au hangs until
// timeout for the pipeline's default bot User-Agent and answers 200 immediately
// for a normal browser one. getText() accepts headers, so the shared helper is
// left untouched.
import { getText } from '../lib/http.mjs';
import { AU_STATES, canonicalAuState } from '../lib/geo.mjs';

// Canonical tracker state names and codes, so a breakdown parsed here always
// matches the names the rest of the pipeline uses. Iteration order is the
// standard Australian ordering that AU_STATES is already in.
const AU_STATE_NAMES = Object.keys(AU_STATES);
const AU_STATE_CODES = Object.fromEntries(
  Object.entries(AU_STATES).map(([name, meta]) => [name, meta.code]));

const UPDATES_URL = 'https://www.agriculture.gov.au/about/news/H5-bird-flu-updates';
const CAMPAIGN_URL = 'https://www.agriculture.gov.au/campaigns/birdflu';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Citable sources for this collector, for the site's "Data sources" list. */
export const AU_OFFICIAL_SOURCES = [
  { name: 'DAFF: H5 bird flu updates (Chief Veterinary Officer statements)', url: UPDATES_URL },
  { name: 'DAFF: national H5 bird flu tally (birdflu.gov.au)', url: CAMPAIGN_URL },
];

// Newest first, capped so the site shows a digestible recent history.
const MAX_UPDATES = 6;
const MAX_TEXT = 400;

// ---- html to text ---------------------------------------------------------

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  ndash: '\u2013', mdash: '\u2014', hellip: '...', middot: '·', deg: '°',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
}

/**
 * Reduce a government page to normalised plain text, one logical block per line.
 * Chrome/nav/footer is stripped first so its dates and headings cannot be
 * mistaken for content.
 * @param {string} html
 * @returns {string}
 */
function htmlToText(html) {
  let h = String(html);
  for (const tag of ['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'form', 'aside']) {
    h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  // Block-level boundaries become newlines so headings stay on their own line.
  h = h.replace(/<(?:h[1-6]|p|li|div|br|tr|hr|section|article|time|blockquote|td|th)\b[^>]*>/gi, '\n');
  h = h.replace(/<\/(?:h[1-6]|p|li|div|tr|section|article|time|blockquote|td|th)>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  // Collapse the non-breaking and narrow no-break spaces the CMS emits.
  h = decodeEntities(h).replace(/[   ]/g, ' ');
  // House style bans em dashes in strings the site renders. Extracted text is a
  // verbatim official quote apart from this one punctuation substitution, which
  // changes no words and no meaning. En dashes become hyphens because they carry
  // meaning in ranges such as "2024-25".
  h = h.replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-');
  return h.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** First machine-readable <time datetime="..."> date on the page, or null. */
function firstTimeAttrDate(html) {
  const m = /<time[^>]*\bdatetime="(\d{4}-\d{2}-\d{2})/i.exec(String(html));
  return m ? m[1] : null;
}

// ---- small text utilities -------------------------------------------------

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Parse a date out of free text ("30 July 2026", "30 Jul 2026", "2026-07-30").
 * Returns an ISO date string, or null when nothing plausible is present. Years
 * outside 2020..2100 are rejected so page furniture cannot produce a fake date.
 */
function isoDateFrom(text) {
  if (!text) return null;
  const s = String(text);
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return plausibleIso(iso[1], iso[2], iso[3]);
  const dmy = /\b(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})\b/.exec(s);
  if (dmy) {
    const mm = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (mm) return plausibleIso(dmy[3], mm, dmy[1].padStart(2, '0'));
  }
  const mdy = /\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (mdy) {
    const mm = MONTHS[mdy[1].slice(0, 3).toLowerCase()];
    if (mm) return plausibleIso(mdy[3], mm, mdy[2].padStart(2, '0'));
  }
  return null;
}

function plausibleIso(y, m, d) {
  const iso = `${y}-${m}-${d}`;
  const year = Number(y);
  if (year < 2020 || year > 2100) return null;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Integer from "28" or "1,234"; null when absent or implausible as a count. */
function toInt(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null;
}

/** Split a block of prose into sentences (good enough for display trimming). */
function sentences(text) {
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z(‘“"'])/).map((s) => s.trim()).filter(Boolean);
}

/** First one or two sentences, capped at MAX_TEXT characters on a word break. */
function displayText(body) {
  const parts = sentences(body);
  let out = parts.slice(0, 2).join(' ').trim();
  if (!out) out = String(body).trim();
  if (out.length > MAX_TEXT) {
    out = out.slice(0, MAX_TEXT).replace(/\s+\S*$/, '') + '...';
  }
  return out || null;
}

// ---- national total ------------------------------------------------------
// Two published phrasings, both tolerated, plus a loose catch-all:
//   updates page : "There have now been 28 confirmed or presumed positive
//                   detections of H5 bird flu in Australia."
//   campaign page: "Australia has 28 confirmed detections of H5 bird flu in
//                   wild seabirds."
// The updates page is newest-first, so the first match is the current total.

const TOTAL_PATTERNS = [
  /there\s+have\s+now\s+been\s+([\d,]+)\s+confirmed(?:\s+(?:or|and)\s+presumed[\s-]+positive)?\s+detections/i,
  /australia\s+has\s+([\d,]+)\s+confirmed(?:\s+(?:or|and)\s+presumed[\s-]+positive)?\s+detections/i,
  /\b([\d,]+)\s+confirmed(?:\s+(?:or|and)\s+presumed[\s-]+positive)?\s+detections\s+of\s+H5/i,
];

function parseNationalTotal(text) {
  for (const re of TOTAL_PATTERNS) {
    const m = re.exec(text);
    const n = m && toInt(m[1]);
    if (n != null) {
      return { total: n, phrasing: /presumed/i.test(m[0]) ? 'confirmed or presumed positive' : 'confirmed' };
    }
  }
  return null;
}

// ---- per-state breakdown -------------------------------------------------
// Published today as separate list items ("10 in Western Australia (WA)") that
// can collapse into one run-on sentence, or into table cells, when the page is
// restyled. So the scan is line-agnostic and, importantly, driven FROM the list
// of real states rather than by capturing an arbitrary name and hoping it is a
// state. A generic name capture can swallow the state it was meant to find
// ("Detections in Western Australia - 10" captures the whole phrase), and it can
// also invent a state out of ordinary prose. Searching per known state cannot do
// either. State codes are matched case-sensitively because bare lowercase "sa"
// and "wa" occur inside ordinary words and place names.

/** Shapes the breakdown has appeared in, most specific first, per state. */
function stateCountPatterns(name, code) {
  return [
    // "10 in Western Australia", "10 confirmed detections in Western Australia"
    new RegExp(`(\\d[\\d,]*)\\s+(?:\\w+\\s+){0,3}in\\s+(?:the\\s+)?${name}\\b`, 'i'),
    // "Western Australia (WA): 10", "Western Australia - 10"
    new RegExp(`${name}\\s*(?:\\(${code}\\))?\\s*[:\\-]\\s*(\\d[\\d,]*)\\b`, 'i'),
    // "Western Australia (WA) 10"
    new RegExp(`${name}\\s*\\(${code}\\)\\s*(\\d[\\d,]*)\\b`, 'i'),
    // "10 in WA" (code only, case-sensitive)
    new RegExp(`(\\d[\\d,]*)\\s+(?:\\w+\\s+){0,3}in\\s+${code}\\b`),
  ];
}

function parseStateBreakdown(text) {
  const out = {};
  for (const state of AU_STATE_NAMES) {
    const code = AU_STATE_CODES[state];
    for (const re of stateCountPatterns(state, code)) {
      const m = re.exec(text);
      const n = m && toInt(m[1]);
      if (n != null) { out[state] = n; break; }
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The tally sentence and the 800 characters after it, which is where the
 * official breakdown sits. Null when the page has no tally sentence.
 */
function tallyWindow(text) {
  const m = /\bas\s+(?:of|at)\b/i.exec(text);
  return m ? text.slice(m.index, m.index + 800) : null;
}

const sumCounts = (byState) => Object.values(byState).reduce((a, b) => a + b, 0);

/**
 * Find the per-state breakdown on the campaign page.
 *
 * Anchored pass first: scan only the official tally sentence and what follows
 * it. Accepted as published, without a sum check, because the total legitimately
 * runs ahead of the breakdown (on 30 July 2026 the total absorbed detections the
 * breakdown had not caught up with, which is the whole lag story).
 *
 * Wide pass second, only if the anchored pass found nothing, and only if the
 * numbers add up to the published national total. Ordinary prose on these pages
 * contains sentences like "20 poultry outbreaks in Victoria", which a wide scan
 * will happily read as a breakdown. Requiring the sum to match the total is what
 * stops a stray sentence putting an invented count on a public health page.
 *
 * @returns {{by_state:object|null, note:string|null}}
 */
function findStateBreakdown(text, nationalTotal) {
  const window = tallyWindow(text);
  if (window) {
    const anchored = parseStateBreakdown(window);
    if (anchored) return { by_state: anchored, note: null };
  }
  const wide = parseStateBreakdown(text);
  if (!wide) return { by_state: null, note: null };
  if (nationalTotal != null && sumCounts(wide) === nationalTotal) {
    return { by_state: wide, note: 'state breakdown found outside the tally sentence, accepted because it sums to the national total' };
  }
  return {
    by_state: null,
    note: 'state counts found outside the tally sentence did not sum to the national total, so they were discarded',
  };
}

// ---- "as at" timestamp ---------------------------------------------------
// "As of 11.30am AEST, 30 July 2026 , Australia has 28 confirmed detections..."
// The stray space before the comma is the page's own <time> element markup.

const AS_AT_PATTERNS = [
  /\bas\s+(?:of|at)\s+(.{0,60}?\b(?:AEST|AEDT|AET|ACST|AWST)\b.{0,40}?\d{4})\s*,?\s+australia\b/is,
  /\bas\s+(?:of|at)\s+(.{0,60}?\b(?:AEST|AEDT|AET|ACST|AWST)\b.{0,40}?\d{4})/is,
  /\bas\s+(?:of|at)\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i,
];

function parseAsAt(text) {
  for (const re of AS_AT_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const raw = m[1].replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim().replace(/[,;]$/, '');
    const iso = isoDateFrom(raw);
    if (raw) return { text: raw, date: iso };
  }
  return null;
}

// ---- dated update entries ------------------------------------------------

// The statement list ends at one of these headings. Everything after it is page
// furniture, and the "Related" block carries its own dates that would otherwise
// read as bogus updates.
const UPDATES_END = /^(further information|related|share on facebook|was this page helpful|see more daff news)$/i;
const DATE_HEADING = /^(\d{1,2}\s+[A-Za-z]{3,}\.?\s+\d{4})\s*:?$/;
const ATTRIBUTION = /^attributable to\b/i;

/**
 * Pull the dated statements out of the updates page, newest first as published.
 *
 * The newest statement's date is rendered by the page's own <time> element
 * rather than repeated as a heading in the body, so `pageDate` (read from that
 * element's machine-readable attribute) is the cross-check: if the heading scan
 * finds nothing, pageDate plus the "Attributable to" line still yields the
 * current statement, and if the newest heading disagrees with pageDate the
 * caller is told rather than left with a silently misdated statement.
 *
 * @param {string} text normalised page text
 * @param {string|null} pageDate ISO date from the first <time datetime> attribute
 * @returns {{entries:Array<{date:string, date_text:string, attribution:string|null,
 *   text:string|null, body:string}>, notes:string[]}}
 */
function parseUpdates(text, pageDate) {
  const lines = text.split('\n');
  const end = lines.findIndex((l) => UPDATES_END.test(l));
  const body = (end > 0 ? lines.slice(0, end) : lines);
  const notes = [];

  const raw = [];
  let current = null;
  for (const line of body) {
    const heading = DATE_HEADING.exec(line);
    if (heading) {
      const iso = isoDateFrom(heading[1]);
      if (iso) {
        current = { date: iso, date_text: heading[1], attribution: null, lines: [] };
        raw.push(current);
        continue;
      }
    }
    if (!current) continue;
    if (!current.attribution && ATTRIBUTION.test(line)) {
      current.attribution = line.replace(/:$/, '').trim();
      continue;
    }
    current.lines.push(line);
  }

  // A heading with no prose under it is page furniture, not a statement.
  let entries = raw.filter((e) => e.lines.length);

  // Degraded path: no usable date heading. The statement itself is still on the
  // page, so keep it with the page date rather than losing the current position.
  if (!entries.length && pageDate) {
    const start = body.findIndex((l) => ATTRIBUTION.test(l));
    if (start >= 0 && body.length > start + 1) {
      notes.push('no dated headings found, used the page date for the current statement');
      entries = [{
        date: pageDate,
        date_text: pageDate,
        attribution: body[start].replace(/:$/, '').trim(),
        lines: body.slice(start + 1),
      }];
    }
  }

  if (entries.length && pageDate && entries[0].date !== pageDate) {
    notes.push(`newest statement heading (${entries[0].date}) differs from the page date (${pageDate})`);
  }

  return {
    entries: entries.map((e) => ({
      date: e.date,
      date_text: e.date_text,
      attribution: e.attribution,
      text: displayText(e.lines.join(' ')),
      body: e.lines.join(' '),
    })),
    notes,
  };
}

// ---- standing official positions ----------------------------------------
// Parsed from the CURRENT statement only, never from the archive below it.
// The updates page keeps every past statement, and each one says there are no
// poultry detections. If that ever changes, scanning the whole page would find
// an old reassuring sentence and report the good news forever. So the scan uses
// the newest statement first, then the campaign status page, then gives up.

function findSentence(text, re) {
  for (const s of sentences(String(text).replace(/\n/g, ' '))) {
    if (re.test(s)) return s.trim();
  }
  return null;
}

/** Trim an evidence sentence so it stays displayable in a UI or a log. */
const evidence = (s) => (s && s.length > 240 ? s.slice(0, 240).replace(/\s+\S*$/, '') + '...' : s) || null;

/**
 * Are poultry detections reported? A poultry detection would be the single
 * biggest escalation in this outbreak, so an unreadable page reports "unknown"
 * rather than defaulting to the reassuring answer.
 */
function parsePoultry(text) {
  const negative = findSentence(text, /\bno\b[^.]*\bdetections?\b[^.]*\bpoultry\b/i);
  if (negative) return { value: false, evidence: evidence(negative) };
  const positive = findSentence(text, /\bdetect(?:ed|ion|ions)\b[^.]*\bpoultry\b|\bpoultry\b[^.]*\bdetect(?:ed|ion|ions)\b/i);
  if (positive && !/\b(no|not|without|nil)\b/i.test(positive)) {
    return { value: true, evidence: evidence(positive) };
  }
  return null;
}

/** Is a mass mortality event reported? Polarity is judged per sentence. */
function parseMassMortality(text) {
  const s = findSentence(text, /\bmass mortality\b|\blarge[- ]scale deaths\b|\bmass deaths\b/i);
  if (!s) return null;
  const negated = /\bno\b|\bnot\b|\bnil\b/i.test(s);
  return { value: !negated, evidence: evidence(s) };
}

/** Stated human health risk level, as the source words it. */
function parseHumanRisk(text) {
  const s = findSentence(text, /risk to (?:human health|people|the public|the community)/i);
  if (!s) return null;
  const m = /\b(very low|low|moderate|medium|high|very high)\b/i.exec(s);
  if (!m) return null;
  return { value: m[1].toLowerCase(), evidence: evidence(s) };
}

/**
 * Resolve one position across the candidate texts in priority order, then fall
 * back to a caller-supplied editorial default. Origin is always reported so a
 * silent parse regression is visible instead of invisible.
 */
function resolvePosition(parser, texts, fallback) {
  for (const t of texts) {
    if (!t) continue;
    const hit = parser(t);
    if (hit) return { value: hit.value, origin: 'parsed', evidence: hit.evidence };
  }
  if (fallback !== undefined && fallback !== null) {
    return { value: fallback, origin: 'defaulted', evidence: null };
  }
  return { value: null, origin: 'unknown', evidence: null };
}

// ---- collector -----------------------------------------------------------

function emptyStatus(fetchedAt) {
  return {
    ok: false,
    fetched_at: fetchedAt,
    national_total: null,
    national_total_phrasing: null,
    national_total_source: null,
    by_state: null,
    by_state_total: null,
    by_state_matches_national: null,
    as_at_text: null,
    as_at_date: null,
    latest_update: null,
    recent_updates: [],
    positions: {
      poultry_detections: { value: null, origin: 'unknown', evidence: null },
      mass_mortality: { value: null, origin: 'unknown', evidence: null },
      human_health_risk: { value: null, origin: 'unknown', evidence: null },
    },
    parsed: {
      updates_page: false, campaign_page: false, national_total: false,
      by_state: false, as_at: false, latest_update: false, recent_updates: false,
      poultry_detections: false, mass_mortality: false, human_health_risk: false,
    },
    sources: AU_OFFICIAL_SOURCES,
    // errors: a fetch or parse failed. notes: parsed fine, but something about
    // the page shape is worth flagging (a restyle in progress, for example).
    errors: [],
    notes: [],
  };
}

async function fetchPage(url) {
  return getText(url, {
    timeoutMs: 30000,
    retries: 2,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });
}

/**
 * Read the Commonwealth's official Australian H5 position.
 *
 * Emits NO detection records on purpose: the pages publish place names without
 * coordinates (see the note at the top of this file). Every field is optional
 * and independently parsed, so one page or one regex failing still returns
 * everything else. Never throws.
 *
 * @param {{defaults?: {poultry_detections?: boolean, mass_mortality?: boolean,
 *          human_health_risk?: string}}} [opts]
 *   Editorial fallbacks (for example from pipeline/au-status.json) used only
 *   when a position cannot be parsed. Anything supplied here is reported with
 *   origin "defaulted", never as "parsed".
 * @returns {Promise<object>} status object; check `.ok` and `.parsed`
 */
export async function fetchOfficialAuStatus(opts = {}) {
  const fetchedAt = new Date().toISOString();
  const status = emptyStatus(fetchedAt);
  try {
    const defaults = opts.defaults || {};

    // Both pages are fetched independently so one outage cannot take the other
    // down with it.
    const [updatesRes, campaignRes] = await Promise.allSettled([
      fetchPage(UPDATES_URL),
      fetchPage(CAMPAIGN_URL),
    ]);

    let updatesHtml = null, campaignHtml = null;
    if (updatesRes.status === 'fulfilled') updatesHtml = updatesRes.value;
    else status.errors.push(`updates page: ${updatesRes.reason?.message || updatesRes.reason}`);
    if (campaignRes.status === 'fulfilled') campaignHtml = campaignRes.value;
    else status.errors.push(`campaign page: ${campaignRes.reason?.message || campaignRes.reason}`);

    const updatesText = updatesHtml ? htmlToText(updatesHtml) : null;
    const campaignText = campaignHtml ? htmlToText(campaignHtml) : null;
    status.parsed.updates_page = Boolean(updatesText);
    status.parsed.campaign_page = Boolean(campaignText);

    // 1. dated statements (updates page)
    let updates = [];
    if (updatesText) {
      try {
        const parsedUpdates = parseUpdates(updatesText, firstTimeAttrDate(updatesHtml));
        updates = parsedUpdates.entries;
        status.notes.push(...parsedUpdates.notes);
      } catch (e) {
        status.errors.push(`update entries: ${e.message}`);
      }
    }
    if (updates.length) {
      const [latest] = updates;
      status.latest_update = {
        date: latest.date,
        date_text: latest.date_text,
        attribution: latest.attribution,
        text: latest.text,
      };
      status.recent_updates = updates.slice(0, MAX_UPDATES).map((u) => ({
        date: u.date, date_text: u.date_text, attribution: u.attribution, text: u.text,
      }));
      status.parsed.latest_update = Boolean(latest.date && latest.text);
      status.parsed.recent_updates = true;
    }

    // 2. national total. The CVO statement is preferred because it counts in the
    // official "confirmed or presumed positive" category, which is the category
    // the outbreak is actually reported in.
    for (const [src, text] of [['updates', updatesText], ['campaign', campaignText]]) {
      if (!text || status.national_total != null) continue;
      const hit = parseNationalTotal(text);
      if (hit) {
        status.national_total = hit.total;
        status.national_total_phrasing = hit.phrasing;
        status.national_total_source = src;
      }
    }
    status.parsed.national_total = status.national_total != null;

    // 3. per-state breakdown (campaign page only; the statement prose counts
    // birds per beach, which is not a state breakdown).
    if (campaignText) {
      const found = findStateBreakdown(campaignText, status.national_total);
      if (found.note) status.notes.push(found.note);
      if (found.by_state) {
        status.by_state = found.by_state;
        status.by_state_total = sumCounts(found.by_state);
        status.parsed.by_state = true;
        // Exposed rather than enforced: the total running ahead of the breakdown
        // is the lag the site is meant to show, not an error to hide.
        if (status.national_total != null) {
          status.by_state_matches_national = status.by_state_total === status.national_total;
        }
      }
    }

    // 4. "as at" timestamp
    const asAt = (campaignText && parseAsAt(campaignText)) || (updatesText && parseAsAt(updatesText));
    if (asAt) {
      status.as_at_text = asAt.text;
      status.as_at_date = asAt.date;
      status.parsed.as_at = true;
    }

    // 5. standing positions, current statement first (see note above).
    const positionTexts = [updates[0]?.body || null, campaignText];
    status.positions = {
      poultry_detections: resolvePosition(parsePoultry, positionTexts, defaults.poultry_detections),
      mass_mortality: resolvePosition(parseMassMortality, positionTexts, defaults.mass_mortality),
      human_health_risk: resolvePosition(parseHumanRisk, positionTexts, defaults.human_health_risk),
    };
    for (const k of ['poultry_detections', 'mass_mortality', 'human_health_risk']) {
      status.parsed[k] = status.positions[k].origin === 'parsed';
    }

    status.ok = status.national_total != null;
    return status;
  } catch (err) {
    // Belt and braces: nothing above should throw, and if it does the build
    // still gets a well-formed object.
    status.errors.push(`collector: ${err.message}`);
    return status;
  }
}

/**
 * Compare the official count with what the tracker has actually mapped, so the
 * site can say plainly how the two figures differ. Pure and never throws.
 *
 * TWO BASES, NAMED SEPARATELY, because conflating them is how a misleading figure gets
 * published. The national total counts what the Commonwealth has confirmed or presumed
 * positive on its own timing. The mapped total counts detections this site can place
 * individually, and it includes curated first-of-state records the official tally does
 * not carry yet (Victoria's 30 July 2026 tern, for example). So:
 *
 *   total_difference              the arithmetic difference between the two published
 *                                totals and nothing more. It is NOT the number of
 *                                detections this site is missing: a mapped record the
 *                                official tally does not hold cancels out one it does,
 *                                which understates the real shortfall.
 *   official_breakdown_shortfall the only official-basis figure available. Per state, how
 *                                far the official breakdown runs ahead of what this site
 *                                maps for that state, summed with no netting against
 *                                states where this site is ahead.
 *
 * The two are related by an exact identity, which is why both are published:
 *   official_breakdown_total - mapped_breakdown_total
 *     = official_breakdown_shortfall - mapped_beyond_official_breakdown
 *
 * @param {{status:object, mappedTotal:number, mappedStates?:string[],
 *          mappedByState?:Object<string,number>|null}} args
 *   mappedStates  tracker state names (summary.au.h5n1_state_list).
 *   mappedByState per-state mapped counts on the same basis as mappedTotal. Without it
 *                 no official-basis figure can be computed and those fields stay null.
 * @returns {object} see the keys built at the end of this function
 */
export function officialGap({ status, mappedTotal, mappedStates = [], mappedByState = null }) {
  const official = status && Number.isInteger(status.national_total) ? status.national_total : null;
  const mapped = Number.isFinite(Number(mappedTotal)) ? Number(mappedTotal) : 0;
  const officialByState = status && status.by_state && typeof status.by_state === 'object'
    ? status.by_state : null;
  const officialStates = officialByState ? Object.keys(officialByState) : [];
  const mappedCanonical = (Array.isArray(mappedStates) ? mappedStates : [])
    .map((s) => canonicalAuState(s) || s).filter(Boolean);
  const missingStates = officialStates.filter((s) => !mappedCanonical.includes(s));
  // States we plot that the official per-state breakdown does not carry yet. This is a real
  // state, not an error: Victoria's detection was announced at 11.18am on 30 July 2026 and the
  // federal breakdown timestamped 11.30am did not include it. We are ahead there, not wrong.
  const mappedOnlyStates = officialStates.length
    ? mappedCanonical.filter((s) => !officialStates.includes(s)) : [];

  // The two totals are not on the same basis, so name the comparison explicitly rather than
  // leaving a caller to infer "level" from the absence of "behind". A caller that only checks
  // `behind` would print "level with the official count" while showing two different numbers.
  let comparison = 'unknown';
  if (official != null) {
    if (official > mapped || missingStates.length) comparison = 'behind';
    else if (mapped > official) comparison = 'ahead';
    else comparison = 'level';
  }

  // Per-state mapped counts, canonicalised so they key the same way the official
  // breakdown does. Anything unusable is left out rather than guessed at.
  const mappedCounts = {};
  if (mappedByState && typeof mappedByState === 'object') {
    for (const [k, v] of Object.entries(mappedByState)) {
      const state = canonicalAuState(k);
      const n = Number(v);
      if (state && Number.isFinite(n) && n > 0) {
        mappedCounts[state] = (mappedCounts[state] || 0) + Math.round(n);
      }
    }
  }

  // The official-basis comparison, done state by state. Only possible when the official
  // page published a per-state breakdown AND the caller supplied per-state mapped counts,
  // so both are required and the fields stay null otherwise. No netting: a state where we
  // are ahead is reported on its own line rather than quietly reducing the shortfall.
  let breakdown = null;
  if (officialByState && Object.keys(mappedCounts).length) {
    let shortfall = 0, beyond = 0;
    const shortfallByState = {}, beyondByState = {};
    for (const state of new Set([...officialStates, ...Object.keys(mappedCounts)])) {
      const off = Number(officialByState[state]);
      const offN = Number.isFinite(off) ? off : 0;
      const mapN = mappedCounts[state] || 0;
      if (offN > mapN) { shortfall += offN - mapN; shortfallByState[state] = offN - mapN; }
      else if (mapN > offN) { beyond += mapN - offN; beyondByState[state] = mapN - offN; }
    }
    breakdown = {
      official_breakdown_total: sumCounts(officialByState),
      mapped_breakdown_total: Object.values(mappedCounts).reduce((a, b) => a + b, 0),
      official_breakdown_shortfall: shortfall,
      official_breakdown_shortfall_by_state: shortfallByState,
      mapped_beyond_official_breakdown: beyond,
      mapped_beyond_official_breakdown_by_state: beyondByState,
    };
  }

  return {
    behind: official == null ? null : official > mapped || missingStates.length > 0,
    comparison,
    official_total: official,
    mapped_total: mapped,
    // Signed difference between the two published totals, positive when the official
    // total is the larger. Quote it as the difference between two figures on two bases,
    // never as the number of detections this site is missing.
    total_difference: official == null ? null : official - mapped,
    // Official-basis figures, or null when the official breakdown or the per-state mapped
    // counts were unavailable. See the identity in the doc comment above.
    official_breakdown_total: breakdown ? breakdown.official_breakdown_total
      : (officialByState ? sumCounts(officialByState) : null),
    mapped_breakdown_total: breakdown ? breakdown.mapped_breakdown_total : null,
    official_breakdown_shortfall: breakdown ? breakdown.official_breakdown_shortfall : null,
    official_breakdown_shortfall_by_state: breakdown ? breakdown.official_breakdown_shortfall_by_state : null,
    mapped_beyond_official_breakdown: breakdown ? breakdown.mapped_beyond_official_breakdown : null,
    mapped_beyond_official_breakdown_by_state: breakdown ? breakdown.mapped_beyond_official_breakdown_by_state : null,
    basis_note: 'The Commonwealth national total and the total mapped here are two measurements on'
      + ' two bases. The national total counts what the Commonwealth has confirmed or presumed'
      + ' positive on its own timing. The mapped total counts detections this site can place'
      + ' individually, and it includes curated first-of-state records the official tally does not'
      + ' carry yet, so total_difference is the difference between the two figures and not a count of'
      + ' detections this site is missing. official_breakdown_shortfall is the official-basis figure:'
      + ' per state, how far the official breakdown runs ahead of what this site maps there.',
    // Did the official page's own per-state numbers sum to its own national total? The collector
    // checks this; surfacing it means a caller can say the official breakdown did not reconcile
    // instead of presenting a figure the pipeline itself distrusts.
    by_state_reconciles: status && typeof status.by_state_matches_national === 'boolean'
      ? status.by_state_matches_national : null,
    official_states: officialStates,
    mapped_states: mappedCanonical,
    missing_states: missingStates,
    mapped_only_states: mappedOnlyStates,
  };
}
