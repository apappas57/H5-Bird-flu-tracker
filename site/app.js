/* H5 Bird Flu Tracker, front-end logic. Vanilla JS plus Leaflet, no build step.
 *
 * Two rules run through the whole file and are worth stating once:
 *
 * 1  COLOUR MEANS STRAIN AND ERA, NEVER CATEGORY. Red (--live) is the current
 *    H5N1 clade 2.3.4.4b incursion and nothing else. The only field allowed to
 *    make that decision is record.era_current, which the pipeline stamps on
 *    every record for exactly this reason. Historical H7 poultry and the 2024
 *    travel-acquired human case are grey and outlined, and are labelled in words
 *    as historical, resolved, and a different subtype, so nothing depends on
 *    colour alone.
 *
 * 2  NEWS IS NEVER DATA. coverage_signal is rendered in its own section, as
 *    dated media reports with a link out. It is never mapped, never counted, and
 *    never mixed into a figure.
 *
 * Every number on the page comes from site/data/*.json. Nothing here computes an
 * epidemiological figure of its own, and nothing here invents a coordinate, a
 * date or a confirmation status.
 */
'use strict';

/* ------------------------------------------------------------------ constants */

/* THE VICINITY RING, AND WHY IT IS DRAWN IN TWO MODES
 *
 * One fixed radius for every point, stated in the legend. It is a visual
 * vicinity indicator, NOT a control or restricted area: Australia has declared
 * none for these wild-bird detections. Never vary it between points to imply
 * severity or spread, which would be inventing epidemiology.
 *
 * Two requirements pull against each other here. The ring is the feature the
 * page was asked for, so it has to be visible at the zoom the page opens at.
 * But the Australia view opens at about zoom 4, where one pixel is roughly
 * 8.7 km on the ground, so a true-scale 10 km radius renders at about one pixel
 * and disappears under a six pixel marker. Widening the radius in metres to fix
 * that would put a shape on a public health map that claims a distance no source
 * published, which is worse than showing nothing.
 *
 * So the ring is drawn in one of two honest modes, chosen by what the current
 * zoom can actually show, and the legend and the note under the map both say
 * which mode the reader is looking at:
 *
 *   true scale   Zoomed in far enough that 10 km is at least MIN_AREA_PX on
 *                screen. An L.circle of IMPACT_RADIUS_M, solid hairline. The
 *                shape is 10 km on the ground and the text says so.
 *   locator      Zoomed out beyond that. A fixed-pixel ring, identical on every
 *                detection, drawn dashed so it does not read as a measured area.
 *                The text calls it a locator, states that it is wider than 10 km
 *                on the ground at this zoom, and says to zoom in for true scale.
 *
 * In both modes the radius is the same for every detection, so nothing on the
 * map can be read as severity, spread or risk, and in both modes the ring is
 * drawn only around the current H5N1 incursion. */
const IMPACT_RADIUS_M = 10000;
const IMPACT_RADIUS_TEXT = '10 km';
/* Ring radius in the locator mode, and the threshold for switching to true
 * scale. Well clear of the 6 pixel marker so the ring reads as a ring. */
const MIN_AREA_PX = 15;

/* A detection an authority has announced while confirmatory testing continues.
 * A routine official category in this outbreak: Australian national tallies
 * count confirmed and presumed positive detections together. */
const PRESUMPTIVE_NOTE = 'Presumptive: an authority has reported an initial positive result and '
  + 'confirmatory testing is still under way. Australian national tallies count confirmed and '
  + 'presumed positive detections together.';
/* A null confidence means the source published no status. It does NOT mean the
 * detection is unconfirmed, and must never be rendered as though it did. */
const UNSTATED_NOTE = 'The source did not publish a confirmation status for this record. '
  + 'That is not the same as unconfirmed.';

const REGION_VIEW = {
  global: { center: [10, 20], zoom: 2, bounds: null },
  us: { bounds: [[24.4, -125], [49.4, -66.9]] },
  au: { bounds: [[-44, 112], [-10, 154]] },
};
const REGION_KEYS = ['au', 'global', 'us'];
const REGION_COUNTRY = { au: 'Australia', us: 'United States' };
/* Plain words for the region, for a spoken announcement. The buttons carry the
 * letterspaced uppercase label; read aloud, uppercase is unreliable. */
const REGION_WORD = { au: 'Australia', global: 'World', us: 'United States' };

const SUBTYPE_FILTERS = [
  { key: 'all', label: 'All strains' },
  { key: 'H5N1', label: 'H5N1' },
  { key: 'H7', label: 'H7' },
];

const state = {
  all: [],
  summary: null,
  region: 'au',
  category: 'all',
  subtype: 'all',
  timeframe: 0,
  includeHistorical: false,
  search: '',
  sortKey: 'date',
  sortDir: -1,
  shown: 50,
  /* The records currently on the map. Held so a zoom change can redraw the
   * rings and their legend without refiltering. */
  mapped: [],
  /* Nothing is announced to a screen reader during the first paint: the page is
   * arriving, not changing. Set true once boot has finished. */
  announce: false,
};

let map, markerLayer, areaLayer;

/* Leaflet options take colour values, not CSS custom properties, so the tokens
 * are read once from the stylesheet instead of being duplicated here. */
let PALETTE = { live: '#C8102E', ink: '#101010', ink2: '#4A4A4A', ink3: '#8C8C8C', paper: '#FFFFFF' };
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  PALETTE = {
    live: pick('--live', PALETTE.live),
    ink: pick('--ink', PALETTE.ink),
    ink2: pick('--ink-2', PALETTE.ink2),
    ink3: pick('--ink-3', PALETTE.ink3),
    paper: pick('--paper', PALETTE.paper),
  };
}

/* -------------------------------------------------------------------- helpers */

const $ = (s) => document.querySelector(s);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Every URL on this page arrives from outside: WOAH notifications through the
 * FAO feed, Google News RSS headlines, agency pages. escapeHtml stops an
 * attribute breakout but does not restrict the scheme, so an escaped
 * javascript: value would still render as a live link. Same guard as safeUrl()
 * in history.js: http and https only. Anything else returns an empty string and
 * the caller renders plain text instead of a link. */
function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/* Link where the URL survives safeUrl, plain escaped text where it does not. */
function linkHtml(url, text) {
  const href = safeUrl(url);
  return href
    ? '<a href="' + escapeHtml(href) + '" rel="noopener">' + escapeHtml(text) + '</a>'
    : escapeHtml(text);
}

/* Same, for the source lists, where the name carries a class either way so the
 * row keeps its layout when a source publishes no usable URL. */
function namedLinkHtml(url, text, cls) {
  const href = safeUrl(url);
  return href
    ? '<a class="' + cls + '" href="' + escapeHtml(href) + '" rel="noopener">' + escapeHtml(text) + '</a>'
    : '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
}

/* Sibling spans in a flex row are separated visually by a gap, which gives a
 * screen reader nothing: it reads the strings run together. A real stop in the
 * text layer, hidden from view, is the separation. */
const READ_SEP = '<span class="visually-hidden">. </span>';

/* Compact form for large figures. Returns an empty string for a missing value:
 * the caller decides what "not published" should read as, so no placeholder
 * glyph is ever invented here. Anything printed in a figure slot goes through
 * fmtFig instead, so a missing number never renders as a blank space. */
function fmtNum(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}

/* A figure slot, a table cell or a count. A blank space cannot be told apart
 * from a zero or from a rendering fault, so a missing value says so in words. */
const NOT_PUBLISHED = 'not published';
function fmtFig(n) {
  const t = fmtNum(n);
  return t === '' ? NOT_PUBLISHED : t;
}

function niceDate(s) {
  if (!s) return '';
  const d = new Date(String(s) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function niceStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const plural = (n, one, many) => (Number(n) === 1 ? one : many);

function sentence(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/* --------------------------------------------------------------- era helpers */

function eraDefs() {
  const s = state.summary;
  return (s && s.eras && Array.isArray(s.eras.definitions)) ? s.eras.definitions : [];
}
function eraDef(id) {
  return eraDefs().find((d) => d.id === id) || null;
}
/* Labels always come from the data, never from a hard-coded era name. */
function eraShort(r) {
  const d = eraDef(r && r.era);
  return d ? d.short_label : 'Not classified';
}
function eraLabel(r) {
  const d = eraDef(r && r.era);
  return d ? d.label : 'Not classified';
}
function isLive(r) {
  return !!(r && r.era_current === true);
}
function eraClass(r, base) {
  return base + (isLive(r) ? '--live' : '--historical');
}
function auEras() {
  const s = state.summary;
  return (s && s.au_eras) || null;
}
function auEraNational(id) {
  const ae = auEras();
  if (!ae || !Array.isArray(ae.national)) return null;
  return ae.national.find((n) => n.era === id) || null;
}

/* --------------------------------------------------- category marks (icons.js)
 * icons.js exposes the raw geometry on a shared 16 by 16 grid. The SVG is built
 * here so it carries the stylesheet's .icon class, which supplies fill, stroke,
 * stroke width and joins. Colour is inherited from the surrounding text: these
 * marks never set a colour, because on this site colour means strain, not
 * category, so every mark must be legible in plain black on white.
 */
function catShape(key) {
  const I = window.Icons;
  if (!I) return null;
  return Object.prototype.hasOwnProperty.call(I.SHAPES, key) ? I.SHAPES[key] : I.FALLBACK;
}
function catLabel(key) {
  const I = window.Icons;
  return I ? I.label(key) : String(key || '');
}
function catName(key) {
  const I = window.Icons;
  return I ? I.name(key) : String(key || '');
}
function catNote(key) {
  const I = window.Icons;
  return I ? I.note(key) : '';
}
function catMark(key, opts) {
  const o = opts || {};
  const shape = catShape(key);
  if (!shape) return '';
  const grid = (window.Icons && window.Icons.GRID) || 16;
  const cls = 'icon' + (o.className ? ' ' + o.className : '');
  const a11y = o.labelled
    ? ' role="img" aria-label="' + escapeHtml(o.name || catName(key)) + '"'
    : ' aria-hidden="true"';
  const body = (shape.paths || []).map((d) => '<path d="' + d + '"/>').join('')
    + (shape.rects || []).map((r) => '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w
      + '" height="' + r.h + '" fill="currentColor" stroke="none"/>').join('');
  return '<svg class="' + cls + '" viewBox="0 0 ' + grid + ' ' + grid + '"'
    + ' focusable="false"' + a11y + '>' + body + '</svg>';
}
/* Mark plus its own visible text. The mark is decorative, the text carries the
 * meaning, so a screen reader hears the category exactly once. */
function catCell(key) {
  return '<span class="icon-label">' + catMark(key) + '<span>' + escapeHtml(catLabel(key)) + '</span></span>';
}

/* ------------------------------------------------------------------ filtering */

/* opts.ignoreEra and opts.ignoreCategory let the empty state explain which
 * filter is responsible instead of just saying "no results". */
function matches(r, opts) {
  const o = opts || {};
  const country = REGION_COUNTRY[state.region];
  if (country && r.country !== country) return false;
  if (!o.ignoreEra && !state.includeHistorical && !r.era_current) return false;
  if (!o.ignoreCategory && state.category !== 'all' && r.category !== state.category) return false;
  if (state.subtype !== 'all') {
    if (state.subtype === 'H7') {
      if (!(r.subtype && String(r.subtype).startsWith('H7'))) return false;
    } else if (r.subtype !== state.subtype) return false;
  }
  if (state.timeframe > 0 && r.date < daysAgo(state.timeframe)) return false;
  return true;
}

function inView(opts) {
  return state.all.filter((r) => matches(r, opts));
}

/* Search is a search of the table, not of the map, so typing never redraws
 * thousands of markers. */
function searched(recs) {
  const q = state.search.trim().toLowerCase();
  if (!q) return recs;
  return recs.filter((r) => {
    const hay = [r.country, r.admin1, r.locality, r.species, r.subtype, r.source, eraShort(r), catLabel(r.category)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const recs = inView();
  state.mapped = recs;
  renderViewFigures(recs);
  renderMarkers(recs);
  renderLegend(recs);
  renderMapNote();
  renderList(searched(recs));
}

/* ------------------------------------------------------- figures without cards */

function figureHtml(f) {
  return '<div class="figure' + (f.cls ? ' ' + f.cls : '') + '">'
    + '<span class="figure__num">' + escapeHtml(f.num) + '</span>'
    + '<span class="figure__label">' + escapeHtml(f.label) + '</span>'
    + (f.note ? '<span class="figure__note">' + escapeHtml(f.note) + '</span>' : '')
    + '</div>';
}

/* ------------------------------------------------------- 3  current situation */

function renderSituation() {
  const s = state.summary;
  const st = (s && s.status) || null;
  const ae = auEras();
  const body = $('#situationBody');
  /* Fail in words, never in silence. Leaving the heading reading "Loading the
   * current situation" would tell a reader the page is still working when it has
   * finished and has nothing to say. */
  if (!st || !ae) {
    $('#situationTitle').textContent = 'Current situation could not be read';
    const which = [!st ? 'the situation summary' : '', !ae ? 'the Australian event breakdown' : '']
      .filter(Boolean).join(' and ');
    body.innerHTML = '<p class="quiet">This build of the data did not include ' + escapeHtml(which)
      + ', so nothing is stated here rather than stating something unverified. The map and the table below are '
      + 'built from the detections file and are unaffected. Feed status is listed under '
      + '<a href="#sources">data sources</a>.</p>';
    return;
  }

  $('#situationTitle').textContent = st.headline || 'Current situation, Australia';

  const parts = [];

  /* Lede and the standing positions. The risk level is a word, not a colour.
   * The modifier class is picked from a known set rather than interpolated from
   * the data, so a stray value cannot invent a class name. */
  const risk = String(st.human_risk || 'unknown').toLowerCase();
  const RISK_CLASS = { low: 'sb-risk-low', moderate: 'sb-risk-moderate', elevated: 'sb-risk-elevated', high: 'sb-risk-high' };
  const riskCls = RISK_CLASS[risk] || '';
  const tags = ['<span class="sb-risk' + (riskCls ? ' ' + riskCls : '') + '">Human risk: '
    + escapeHtml(risk) + '</span>'];
  const poultry = s.official_au && s.official_au.positions && s.official_au.positions.poultry_detections;
  if (poultry && poultry.value === false) {
    tags.push('<span class="tag tag--official">No detections in poultry</span>');
  } else if (poultry && poultry.value === true) {
    tags.push('<span class="tag tag--live">Detections in poultry</span>');
  }
  parts.push('<div class="stack stack--sm">'
    + '<p class="lede">' + escapeHtml(st.summary || '') + '</p>'
    + '<div class="row row--center">' + tags.join('') + '</div>'
    + '</div>');

  /* The 29 July local transmission development. A change in kind, not in count,
   * so it is set as a marked block with the Chief Veterinary Officer's own
   * words rather than folded into the summary paragraph. */
  const lt = st.local_transmission;
  if (lt && (lt.note || lt.quote)) {
    const bits = ['<p class="label label--ink">Latest development, ' + escapeHtml(niceDate(lt.date)) + '</p>'];
    if (lt.note) bits.push('<p>' + escapeHtml(lt.note) + '</p>');
    if (lt.quote) {
      bits.push('<blockquote class="quote">&ldquo;' + escapeHtml(lt.quote) + '&rdquo;'
        + (lt.attributed_to ? '<span class="quote__attr">' + escapeHtml(lt.attributed_to) + '</span>' : '')
        + '</blockquote>');
    }
    if (lt.containment_note) bits.push('<p class="quiet">' + escapeHtml(lt.containment_note) + '</p>');
    if (lt.source) {
      bits.push('<p class="footnote">Source: ' + linkHtml(lt.source_url, lt.source) + '</p>');
    }
    parts.push('<div class="stack stack--sm">' + bits.join('') + '</div>');
  }

  /* The figures row. Every live figure here describes the current incursion, so
   * red on all of them would mark nothing: the reader already knows what they
   * are reading. The count of current detections is the one figure that gets the
   * alarm colour, and the rest of the row sits in ink, which is what "spend the
   * boldness in one place" means in practice. The historical figure keeps its
   * grey treatment and its different-lineage label, because there red against
   * grey is a real distinction. */
  const gap = s.official_gap;
  const figs = [];
  figs.push({
    cls: 'figure--live',
    num: fmtFig(ae.current_records),
    label: 'H5N1 detections mapped here',
    note: (gap && gap.behind)
      /* Plain text: figureHtml escapes the note, so an entity would show as
       * literal characters here. */
      ? 'Current incursion, clade 2.3.4.4b. The national count published by the Commonwealth is higher, see below.'
      : 'Current incursion, clade 2.3.4.4b.',
  });
  figs.push({
    num: fmtFig(ae.current_states),
    label: plural(ae.current_states, 'State with a current detection', 'States with a current detection'),
    note: (ae.current_state_list || []).join(', '),
  });
  const fd = st.first_detection || {};
  if (st.days_since_first_detection != null) {
    figs.push({
      num: fmtFig(st.days_since_first_detection),
      label: 'Days since the first detection',
      note: fd.date ? niceDate(fd.date) + ', ' + [fd.species, fd.place].filter(Boolean).join(', ') + '.' : '',
    });
  }
  const humanEra = auEraNational('au_human_2024');
  if (humanEra) {
    figs.push({
      cls: 'figure--historical',
      num: fmtFig(humanEra.records),
      label: plural(humanEra.records, 'Human case in Australia, all time', 'Human cases in Australia, all time'),
      note: 'May 2024, acquired overseas, ' + humanEra.strain + '. A different lineage, not part of this event.',
    });
  }
  parts.push('<div class="figures">' + figs.map(figureHtml).join('') + '</div>');

  /* States, current incursion only. Where a state also holds historical records
   * the row says so in words, which is the fix for reading "14 detections in
   * Victoria" as fourteen current cases. */
  const current = auEraNational(ae.current_era);
  if (current && current.state_counts) {
    const order = (ae.state_order || []).filter((n) => current.state_counts[n] != null);
    const rows = order.map((name) => {
      const bs = (ae.by_state || {})[name] || {};
      const hist = (bs.eras || []).filter((e) => !e.current).map((e) => e.phrase);
      const note = hist.length
        ? '<span class="state-note">Also in this state’s record, and not part of this event: '
          + escapeHtml(hist.join('. ')) + '.</span>'
        : '';
      /* Every row on this list is a current detection, which the heading and the
       * footnote both say, so a red count on every row would discriminate
       * nothing. The counts sit in ink. */
      return '<li class="state-row">'
        + '<span class="state-name">' + escapeHtml(name) + '</span>'
        + '<span class="state-count">' + escapeHtml(fmtFig(current.state_counts[name])) + '</span>'
        + note + '</li>';
    });
    parts.push('<div class="stack stack--sm">'
      + '<p class="label">Current H5N1 detections by state</p>'
      + '<ul class="state-list">' + rows.join('') + '</ul>'
      + '<p class="footnote">Counts on this list are current H5N1 clade 2.3.4.4b detections only.</p>'
      + '</div>');
  }

  parts.push(historicalDiscloseHtml());
  body.innerHTML = parts.join('');
}

/* Every Australian record, split by the event it belongs to. Opt in, closed by
 * default, and it never presents a combined per-state total: there is no such
 * figure in the data, on purpose. */
function historicalDiscloseHtml() {
  const ae = auEras();
  if (!ae || !Array.isArray(ae.national) || !ae.national.length) return '';

  const breakdown = ae.national.map((n) => {
    const bits = [n.strain, sentence(n.status)];
    if (!n.current && n.first_date) {
      bits.push(niceDate(n.first_date) + (n.last_date && n.last_date !== n.first_date ? ' to ' + niceDate(n.last_date) : ''));
    }
    return '<li class="breakdown__item breakdown__item--' + (n.current ? 'live' : 'historical') + '">'
      + '<span class="breakdown__num">' + escapeHtml(fmtFig(n.records)) + '</span>'
      + '<span class="breakdown__text"><strong>' + escapeHtml(n.short_label) + '</strong>. '
      + escapeHtml(bits.filter(Boolean).join('. ')) + '.</span></li>';
  }).join('');

  const states = Object.keys(ae.by_state || {})
    .filter((k) => (ae.by_state[k].historical_records || 0) > 0)
    .map((k) => ae.by_state[k])
    .map((bs) => '<div class="dl-row"><dt class="dl-key">' + escapeHtml(bs.state) + '</dt>'
      + '<dd class="dl-val">' + escapeHtml(bs.sentence) + '</dd></div>')
    .join('');

  const defs = ae.national.map((n) => {
    const d = eraDef(n.era);
    if (!d) return '';
    return '<div class="dl-row"><dt class="dl-key">' + escapeHtml(d.short_label) + '</dt>'
      + '<dd class="dl-val">' + escapeHtml(d.summary) + '</dd></div>';
  }).join('');

  return '<details class="disclose">'
    + '<summary>Every Australian record, split by event</summary>'
    + '<div class="disclose__body">'
    + (ae.note ? '<p class="quiet">' + escapeHtml(ae.note) + '</p>' : '')
    + '<ul class="breakdown">' + breakdown + '</ul>'
    + (states ? '<p class="label">States holding records from more than one event</p><dl class="dl">' + states + '</dl>' : '')
    + (defs ? '<p class="label">What each event is</p><dl class="dl">' + defs + '</dl>' : '')
    + '</div></details>';
}

/* ------------------------------------------- 4  official count versus mapped
 * The two figures measure different things. The map follows WOAH notifications,
 * which FAO EMPRES-i ingests about two weeks behind, and the Commonwealth counts
 * from its own updates. Publishing both and naming the lag is the honest
 * presentation. Three outcomes are rendered: behind, level, and unknown. "Up to
 * date" is never claimed when the official figure could not be read.
 */
function renderOfficialGap() {
  const s = state.summary;
  const el = $('#officialGap');
  const gap = s && s.official_gap;
  if (!gap) { el.hidden = true; return; }
  const off = (s && s.official_au) || {};
  const phrasing = off.national_total_phrasing ? ' (' + escapeHtml(off.national_total_phrasing) + ')' : '';
  const asAt = off.as_at_text ? ' as at ' + escapeHtml(off.as_at_text)
    : (off.as_at_date ? ' as at ' + niceDate(off.as_at_date) : '');
  const mappedFig = '<div class="og-fig"><span class="og-num">' + escapeHtml(fmtFig(gap.mapped_total)) + '</span>'
    + '<span class="og-lbl">individually mapped here'
    + '<span class="og-sub">automated WOAH feed plus curated firsts</span></span></div>';

  const src = (off.sources || [])[1] || (off.sources || [])[0] || null;
  const stamp = off.latest_update && off.latest_update.date
    ? ' Latest Commonwealth statement: ' + niceDate(off.latest_update.date) + '.' : '';
  const srcLine = src
    ? '<p class="og-src">Official figure: ' + linkHtml(src.url, src.name) + '.' + stamp + '</p>'
    : '';

  /* This section exists to compare two figures. With no mapped total there is
   * nothing to compare, so it says that rather than printing a sentence with a
   * hole in it. */
  if (gap.mapped_total == null) {
    el.hidden = false;
    el.innerHTML = '<h3 class="og-title">Official count and mapped count</h3>'
      + '<p class="og-note">The number of detections mapped here was not published in the data on this run, so the two '
      + 'figures cannot be compared. Quote the official figure and check it directly.</p>' + srcLine;
    return;
  }

  let figs, note;
  if (gap.official_total == null) {
    /* Unknown, not level. Never imply agreement from a failed read. */
    figs = mappedFig;
    note = 'The national count published by the Commonwealth could not be read on this run, so only the '
      + fmtNum(gap.mapped_total) + ' individually mapped detections are shown. Check the official figure directly.';
  } else {
    const official = '<div class="og-fig"><span class="og-num">' + fmtNum(gap.official_total) + '</span>'
      + '<span class="og-lbl">Commonwealth national count'
      + '<span class="og-sub">' + (asAt ? asAt.replace(/^ /, '') : 'official tally') + '</span></span></div>';
    // official_breakdown_shortfall is the ONLY official-basis figure: summed per state with no
    // netting. total_difference (28 - 18) nets our curated first-of-state records against that
    // shortfall, so it is the gap between two published figures and must never be presented as
    // "detections this site is missing". The identity the pipeline guarantees is
    // official_breakdown_total - mapped_breakdown_total == shortfall - mapped_beyond, so showing
    // the shortfall and naming what we carry beyond the breakdown explains the arithmetic instead
    // of hiding it.
    const shortfall = Number.isFinite(gap.official_breakdown_shortfall)
      ? gap.official_breakdown_shortfall : null;
    const diff = (gap.comparison === 'behind' && shortfall)
      ? '<div class="og-fig og-diff"><span class="og-num">' + fmtNum(shortfall) + '</span>'
        + '<span class="og-lbl">behind the official breakdown'
        + '<span class="og-sub">reporting lag in the automated feed, not a disagreement about the facts</span></span></div>'
      : '';
    figs = official + mappedFig + diff;

    const where = gap.official_breakdown_shortfall_by_state || {};
    const whereList = Object.keys(where)
      .map(function (s) { return escapeHtml(s) + ' ' + fmtNum(where[s]); }).join(', ');

    note = 'The Commonwealth reports ' + fmtNum(gap.official_total) + ' detections' + phrasing + asAt + '. '
      + 'This map shows ' + fmtNum(gap.mapped_total) + ' detections placed individually. ';
    // Gated on comparison, never on a figure being falsy: a missing or zero difference is not
    // evidence that the two counts agree.
    if (gap.comparison === 'behind') {
      note += 'Against the official per-state breakdown this map is behind by ' + fmtNum(shortfall)
        + (whereList ? ', in ' + whereList : '')
        + '. The automated feed follows WOAH notifications, which arrive after Commonwealth updates. '
        + 'The official figure is the one to quote.';
    } else if (gap.comparison === 'ahead') {
      note += 'This map currently carries more than the official per-state breakdown, because a '
        + 'first-of-state detection has been announced and added here before the national tally '
        + 'absorbed it. The official figure is still the one to quote.';
    } else if (gap.comparison === 'level') {
      note += 'The two figures agree.';
    } else {
      note += 'The two figures are on different bases and cannot be compared on this run.';
    }
  }

  const extra = [];
  if (gap.missing_states && gap.missing_states.length) {
    extra.push('In the official breakdown but not yet on our map: ' + escapeHtml(gap.missing_states.join(', ')) + '.');
  }
  const mappedOnly = (gap.mapped_only_states && gap.mapped_only_states.length)
    ? gap.mapped_only_states
    : (gap.mapped_states || []).filter((x) => !(gap.official_states || []).includes(x));
  if (mappedOnly.length && (gap.official_states || []).length) {
    extra.push('On our map but not yet in the official per-state breakdown: ' + escapeHtml(mappedOnly.join(', '))
      + '. A state announcement can precede the federal tally by hours.');
  }

  el.hidden = false;
  el.innerHTML = '<h3 class="og-title">Official count and mapped count</h3>'
    + '<div class="og-figs">' + figs + '</div>'
    + '<p class="og-note">' + note + (extra.length ? ' ' + extra.join(' ') : '') + '</p>'
    + srcLine + newsLeadHtml(s);
}

/* At most one quiet, hedged line about media reporting. Only news-only leads for
 * a state with nothing mapped, and only when the signal is not weak: gaps the
 * official tally already shows are stated by the figures above, and a single
 * weak heuristic match is too thin to put in front of a reader. Nothing here is
 * mapped or counted anywhere on the page. */
function newsLeadHtml(s) {
  const cs = s && s.coverage_signal;
  const leads = ((cs && cs.gaps) || []).filter((g) => g.reported_by === 'news'
    && !g.mapped_count && (g.news_confidence === 'high' || g.news_confidence === 'medium'));
  if (!leads.length) return '';
  const states = leads.map((g) => escapeHtml(g.state)).join(', ');
  const cites = leads.flatMap((g) => (g.citations || []).filter((c) => c.kind === 'news').slice(0, 2))
    .map((c) => linkHtml(c.url, outletShort(c.outlet) || 'report'));
  return '<p class="og-lead"><span class="og-lead-tag">Media reporting</span> News outlets are reporting detections in '
    + states + '. Nothing about them has reached the official sources this map is built from, so they are not mapped '
    + 'and not counted in any figure on this page. Treat them as reports to check, not as confirmed detections.'
    + (cites.length ? ' Reported by: ' + cites.join(', ') + '.' : '') + '</p>';
}

/* The Commonwealth's own latest statement and standing positions, quoted rather
 * than paraphrased, with the earlier statements available but folded away. */
function renderOfficialStatement() {
  const s = state.summary;
  const off = s && s.official_au;
  const el = $('#officialStatement');
  if (!off || !off.ok) { el.hidden = true; return; }

  const parts = [];
  const lu = off.latest_update;
  if (lu && lu.text) {
    parts.push('<div class="stack stack--sm">'
      + '<p class="label label--ink">Latest Commonwealth statement, ' + escapeHtml(lu.date_text || niceDate(lu.date)) + '</p>'
      + '<blockquote class="quote">&ldquo;' + escapeHtml(lu.text) + '&rdquo;'
      + (lu.attribution ? '<span class="quote__attr">' + escapeHtml(lu.attribution) + '</span>' : '')
      + '</blockquote></div>');
  }

  const P = off.positions || {};
  const rows = [];
  const evidence = [];
  const addPos = (key, label, value) => {
    const p = P[key];
    if (!p || p.value == null) return;
    rows.push('<div class="dl-row"><dt class="dl-key">' + escapeHtml(label) + '</dt>'
      + '<dd class="dl-val">' + escapeHtml(value(p.value)) + '</dd></div>');
    if (p.evidence && !evidence.includes(p.evidence)) evidence.push(p.evidence);
  };
  addPos('poultry_detections', 'In poultry', (v) => (v ? 'Detections reported' : 'No detections reported'));
  addPos('mass_mortality', 'Mass mortality', (v) => (v ? 'Reported' : 'No evidence reported'));
  addPos('human_health_risk', 'Human health risk', (v) => sentence(String(v)));
  if (rows.length) {
    parts.push('<div class="stack stack--sm">'
      + '<p class="label">The Commonwealth’s stated position</p>'
      + '<dl class="dl">' + rows.join('') + '</dl>'
      + (evidence.length
        ? '<p class="footnote">In the update’s own words: &ldquo;' + escapeHtml(evidence.join(' ')) + '&rdquo;</p>'
        : '')
      + '</div>');
  }

  const earlier = (off.recent_updates || []).filter((u) => !lu || u.date !== lu.date || u.text !== lu.text);
  if (earlier.length) {
    const items = earlier.map((u) => '<div class="dl-row">'
      + '<dt class="dl-key">' + escapeHtml(u.date_text || niceDate(u.date)) + '</dt>'
      + '<dd class="dl-val">' + escapeHtml(u.text)
      + (u.attribution ? ' <span class="quiet">' + escapeHtml(u.attribution) + '</span>' : '')
      + '</dd></div>').join('');
    parts.push('<details class="disclose"><summary>Earlier Commonwealth statements</summary>'
      + '<div class="disclose__body"><dl class="dl">' + items + '</dl>'
      + '<p class="footnote">Statements are published as dated updates, so a figure quoted inside an older '
      + 'statement is the total at that date, not today’s total.</p></div></details>');
  }

  el.hidden = parts.length === 0;
  el.innerHTML = parts.join('');
}

/* ------------------------------------------------------------------- 5  map */

function initMap() {
  /* preferCanvas keeps the large United States wild-bird layer smooth. */
  map = L.map('map', { worldCopyJump: true, minZoom: 2, preferCanvas: true }).setView([-27, 134], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 12,
  }).addTo(map);
  /* Areas first, markers second, so a point is never hidden by its own circle. */
  areaLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  /* Which ring mode is honest depends on the zoom, so a zoom that crosses the
   * threshold redraws the rings and the two pieces of text that describe them. */
  map.on('zoomend', onZoomEnd);
}

/* Metres per screen pixel at a latitude, for the 256 pixel Web Mercator tile
 * scheme Leaflet uses. Used only to decide which ring mode a zoom can show
 * honestly, so a fraction of a percent either way changes nothing. */
function metresPerPixel(lat, zoom) {
  return 40075016.686 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, zoom));
}

/* One mode for the whole view, decided at the centre of the map, because two
 * different ring meanings on one screen would be unreadable. */
function trueScaleVisible() {
  if (!map) return false;
  const c = map.getCenter();
  return (IMPACT_RADIUS_M / metresPerPixel(c.lat, map.getZoom())) >= MIN_AREA_PX;
}

/* Deterministic offset so records sitting on one coordinate do not perfectly
 * stack. Applied ONLY to exact coordinate collisions, and kept to about a
 * kilometre for source-supplied points: a public health map has to show a
 * detection where the source put it. Applying this to every point moved
 * Australian coastal detections 60 to 130 km, which put Portland in Bass Strait.
 * Centroid-level records keep a wider spread because they are only ever as
 * precise as the centroid to begin with. The hash is made positive before it is
 * scaled, so the offset is bounded by half the scale in each direction. */
const JITTER = { point: 0.02, admin1: 0.7, country: 3.2 };
function jitter(id, scale) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const m = Math.abs(h);
  const a = (m % 1000) / 1000;
  const b = ((m >> 10) % 1000) / 1000;
  return [(a - 0.5) * scale, (b - 0.5) * scale];
}
const coordKey = (r) => Number(r.lat).toFixed(4) + ',' + Number(r.lng).toFixed(4);

/* Marker size encodes the number of animals affected where a source published
 * one, which is the only quantity on the map that varies. The vicinity radius
 * never does. */
function markerRadius(r) {
  if (r.count && r.count > 0) return Math.min(22, 5 + 3.2 * Math.log10(r.count + 1));
  return 6;
}

/* Rings are drawn on the Australian view. The world view holds thousands of
 * points from the global panzootic, and a ring on each would cover the map
 * rather than locate anything. */
function showAreas() {
  return state.region === 'au';
}
/* No ring where a record resolves only to a state or region: a ring around a
 * centroid would imply a precision the source never published. */
function hasPlace(r) {
  return r.level === 'point';
}
/* Only the current incursion carries a vicinity ring. A ring around a resolved
 * 2024 to 2025 H7 poultry site would draw a live-looking zone on a closed event
 * of a different subtype, and the same goes for the unrelated 2024 human case. */
function hasArea(r) {
  return isLive(r) && hasPlace(r);
}

/* Where each record was drawn, kept so the rings can be redrawn on a zoom change
 * at exactly the coordinates their markers were given. */
let placed = [];
let areaModeTrue = null;

function placements(recs) {
  const stacked = new Map();
  for (const r of recs) {
    const k = coordKey(r);
    stacked.set(k, (stacked.get(k) || 0) + 1);
  }
  /* Draw larger first so dense points sit on top. */
  const ordered = [...recs].sort((a, b) => markerRadius(b) - markerRadius(a));
  return ordered.map((r) => {
    const [dy, dx] = stacked.get(coordKey(r)) > 1
      ? jitter(r.id, JITTER[r.level] != null ? JITTER[r.level] : JITTER.point)
      : [0, 0];
    return { r: r, at: [r.lat + dy, r.lng + dx] };
  });
}

/* The vicinity rings. See the note on IMPACT_RADIUS_M for why there are two
 * modes and why neither of them fakes a distance. */
function drawAreas() {
  areaLayer.clearLayers();
  areaModeTrue = trueScaleVisible();
  if (!showAreas()) return;
  for (const p of placed) {
    if (!hasArea(p.r)) continue;
    const style = {
      color: PALETTE.live,
      weight: 1,
      opacity: 0.55,
      fillColor: PALETTE.live,
      fillOpacity: 0.08,
      interactive: false,
    };
    if (areaModeTrue) {
      /* True to scale: metres on the ground, so it grows as the reader zooms. */
      style.radius = IMPACT_RADIUS_M;
      L.circle(p.at, style).addTo(areaLayer);
    } else {
      /* Locator: a fixed size in screen pixels, dashed so it does not read as a
       * measured area, identical on every detection. The legend and the map note
       * both say it is wider than the true radius at this zoom. */
      style.radius = MIN_AREA_PX;
      style.dashArray = '2 3';
      L.circleMarker(p.at, style).addTo(areaLayer);
    }
  }
}

function renderMarkers(recs) {
  markerLayer.clearLayers();
  placed = placements(recs);
  /* Rings first, then every marker, so a point is never hidden by a ring. */
  drawAreas();

  for (const p of placed) {
    const r = p.r;
    /* Live is a solid red disc, historical is a hollow grey ring. Fill against
     * outline is a shape difference, so the two survive with colour removed. */
    L.circleMarker(p.at, isLive(r)
      ? { radius: markerRadius(r), color: PALETTE.live, weight: 1, fillColor: PALETTE.live, fillOpacity: 0.9 }
      : { radius: markerRadius(r), color: PALETTE.ink2, weight: 1.4, fillColor: PALETTE.paper, fillOpacity: 1 })
      .bindPopup(popupHtml(r)).addTo(markerLayer);
  }
}

/* A zoom that crosses the threshold changes what the ring means, so the ring,
 * the legend and the note under the map all change together. */
function onZoomEnd() {
  const now = trueScaleVisible();
  if (now === areaModeTrue) return;
  areaModeTrue = now;
  /* Nothing to restate on a view that draws no rings. */
  if (!showAreas()) return;
  /* Markers are redrawn with the rings rather than after them, so the rings stay
   * underneath the points they belong to. Only the Australian view reaches this,
   * where the marker count is small. */
  renderMarkers(state.mapped);
  renderLegend(state.mapped);
  renderMapNote();
}

/* Why a record has no ring, where the absence could otherwise read as an
 * omission. Static text, so nothing here needs escaping. */
function placementNoteHtml(r) {
  if (!hasPlace(r)) {
    return '<p class="popup__row">Placed at the centre of the state or region: the source published no specific '
      + 'location' + (showAreas() ? ', so no vicinity ring is drawn' : '') + '.</p>';
  }
  if (showAreas() && !hasArea(r)) {
    return '<p class="popup__row">No vicinity ring: rings mark the current H5N1 incursion only, and this record '
      + 'belongs to a separate event.</p>';
  }
  return '';
}

function popupHtml(r) {
  const where = [r.locality, r.admin1, r.country].filter(Boolean).join(', ');
  const rows = [
    '<p class="popup__row popup__where">' + escapeHtml(where || r.country) + '</p>',
    '<p class="popup__row">' + escapeHtml(niceDate(r.date)) + '</p>',
    '<p class="popup__row">' + catCell(r.category) + '</p>',
    '<p class="popup__row">Strain: ' + strainTag(r) + ' ' + statusTag(r) + '</p>',
    r.species ? '<p class="popup__row"><i>' + escapeHtml(r.species) + '</i></p>' : '',
    r.flock_type ? '<p class="popup__row">' + escapeHtml(r.flock_type) + '</p>' : '',
    r.count ? '<p class="popup__row">' + escapeHtml(fmtNum(r.count)) + ' affected</p>' : '',
    placementNoteHtml(r),
    '<p class="popup__row">Source: ' + linkHtml(r.source_url, r.source) + '</p>',
  ].join('');
  return '<p class="popup__title">' + escapeHtml(eraShort(r)) + '</p>' + rows;
}

function focusRegion(region) {
  const v = REGION_VIEW[region];
  if (!v) return;
  if (v.bounds) map.fitBounds(v.bounds, { padding: [20, 20] });
  else map.setView(v.center, v.zoom);
}

/* The legend names the events actually in view rather than assuming the
 * Australian ones. On the global view the red points are the global panzootic,
 * not the Australian incursion, and the grey ones include records whose subtype
 * the source never published, which are not "resolved". Saying either of those
 * wrongly would be worse than saying nothing. */
function renderLegend(recs) {
  const live = [];
  const historical = [];
  const seen = new Set();
  for (const r of recs) {
    if (seen.has(r.era)) continue;
    seen.add(r.era);
    (isLive(r) ? live : historical).push(eraShort(r));
  }
  live.sort();
  historical.sort();

  const rows = [];
  if (live.length) {
    rows.push('<span class="legend__row"><span class="legend__mark legend__mark--live"></span>'
      + 'Solid red: ' + escapeHtml(live.join(', ')) + '</span>');
  }
  if (historical.length) {
    rows.push('<span class="legend__row"><span class="legend__mark legend__mark--historical"></span>'
      + 'Outlined grey: ' + escapeHtml(historical.join(', ')) + '</span>');
  }
  const trueScale = trueScaleVisible();
  if (showAreas()) {
    rows.push('<span class="legend__row"><span class="legend__mark legend__mark--area"></span>'
      + (trueScale
        ? 'Shaded ring: ' + IMPACT_RADIUS_TEXT + ' around each current H5N1 detection, true to scale at this zoom'
        : 'Dashed ring: locator around each current H5N1 detection, a fixed size on screen, not a distance')
      + '</span>');
  }

  /* The note describes the ring the reader is actually looking at, and never
   * claims a scale the shape on screen does not have. */
  const ringCommon = ' The ring is the same around every detection and never varies with severity, spread or risk. '
    + 'Rings are drawn around the current H5N1 incursion only, never around the resolved 2024 to 2025 H7 poultry '
    + 'outbreaks or the unrelated 2024 human case, and none is drawn where a record resolves only to a state or region.';
  const note = showAreas()
    ? (trueScale
      ? 'The shaded ring is a fixed ' + IMPACT_RADIUS_TEXT + ' radius drawn true to scale at this zoom.' + ringCommon
      : 'At this zoom ' + IMPACT_RADIUS_TEXT + ' would be about a pixel across, smaller than the marker, so the ring is '
        + 'drawn dashed at a fixed size on screen instead: it locates the detection and covers more than '
        + IMPACT_RADIUS_TEXT + ' of ground. Zoom in and it becomes the true ' + IMPACT_RADIUS_TEXT + ' radius.'
        + ringCommon)
      + ' Marker size reflects the number of animals affected where a source published one.'
    : 'Vicinity rings are drawn on the Australia view. The world view holds thousands of points, where a ring on each '
      + 'would cover the map rather than locate anything. Marker size reflects the number of animals affected where a '
      + 'source published one.';
  $('#legend').innerHTML = '<p class="legend__title">Legend</p>' + rows.join('')
    + '<p class="legend__note">' + note + '</p>';
}

function renderMapNote() {
  /* Two things have to be said, in this order: that the ring is not an official
   * area, and exactly what the ring on screen right now represents. */
  const notControl = '<strong>Not a control area.</strong> The rings are a visual vicinity indicator only. They are not '
    + 'official control or restricted areas, and no control or restricted areas have been declared for these '
    + 'Australian wild-bird detections. The ring is the same around every current detection and never varies with '
    + 'severity, spread or risk, so overlapping rings mean detections close together and nothing more.';
  const scale = trueScaleVisible()
    ? ' At this zoom each ring is drawn true to scale, a ' + IMPACT_RADIUS_TEXT + ' radius around the reported point.'
    : ' At this zoom a true ' + IMPACT_RADIUS_TEXT + ' radius would be about a pixel wide and invisible under the '
      + 'marker, so each ring is drawn dashed at a fixed size on screen. In that form it marks where the detection is, '
      + 'covers more ground than ' + IMPACT_RADIUS_TEXT + ', and is not a distance you can read off the map. Zoom in '
      + 'and the rings become the true ' + IMPACT_RADIUS_TEXT + ' radius.';
  const note = showAreas()
    ? notControl + scale
    : 'Each point sits where its source placed it. Vicinity rings are drawn on the Australia view only: the world view '
      + 'holds thousands of points, where a ring on each would cover the map rather than locate anything.';
  $('#mapNote').innerHTML = note + ' Every mapped detection also appears in the table below, which is reachable by '
    + 'keyboard.';
}

function renderCategoryKey() {
  const I = window.Icons;
  if (!I) return;
  $('#categoryKey').innerHTML = I.KEYS.map((k) => '<li class="key__item">' + catMark(k)
    + '<span class="key__text"><strong>' + escapeHtml(catLabel(k)) + '</strong>. ' + escapeHtml(catNote(k))
    + '</span></li>').join('');
}

/* --------------------------------------------------- figures for what is in view */

function renderViewFigures(recs) {
  const byEra = new Map();
  const byCat = new Map();
  const places = new Set();
  for (const r of recs) {
    const e = byEra.get(r.era) || { records: 0, live: isLive(r), era: r.era };
    e.records += 1;
    byEra.set(r.era, e);
    byCat.set(r.category, (byCat.get(r.category) || 0) + 1);
    if (state.region === 'global') places.add(r.country);
    else if (r.admin1) places.add(r.admin1);
  }

  const eras = [...byEra.values()].sort((a, b) => (Number(b.live) - Number(a.live)) || (b.records - a.records));
  /* Red separates events from each other. With one event in view there is
   * nothing to separate it from, so the figure sits in ink and the label does
   * the work. */
  const mixedEra = eras.length > 1;
  const figs = eras.map((e) => {
    const d = eraDef(e.era);
    return {
      cls: mixedEra ? (e.live ? 'figure--live' : 'figure--historical') : '',
      num: fmtFig(e.records),
      label: d ? d.short_label : 'Not classified',
      note: d ? d.strain + (d.status && d.status !== 'ongoing' ? ', ' + d.status : '') : '',
    };
  });
  figs.push({
    cls: 'figure--aside',
    num: fmtFig(places.size),
    label: state.region === 'global' ? 'Countries in view' : 'States or regions in view',
  });

  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    '<span class="icon-label">' + catMark(k) + '<span>' + escapeHtml(catLabel(k)) + ' <strong>'
    + escapeHtml(fmtFig(n)) + '</strong></span></span>');

  const html = ['<p class="label">On the map now</p>'];
  if (!recs.length) {
    html.push('<p class="quiet">Nothing matches the current filters, so the map is empty.</p>');
  } else {
    html.push('<div class="figures figures--sm">' + figs.map(figureHtml).join('') + '</div>');
    if (cats.length) html.push('<div class="row small">' + cats.join('') + '</div>');
    if (eras.length > 1) {
      html.push('<p class="footnote">These are separate events and are never added together. Only the events marked '
        + 'as current describe the live outbreak.</p>');
    }
  }
  $('#viewFigures').innerHTML = html.join('');
}

/* ----------------------------------------------------------- 6  cases table */

/* mixedEra decides whether the Event column exists at all. In a view of one
 * event it repeats the same value on every row, which is noise the view itself
 * has already stated, so it is dropped and the event is said once under the
 * table instead. */
function columns(mixedEra) {
  const cols = [
    { key: 'date', label: 'Date', sort: 'date' },
  ];
  if (mixedEra) cols.push({ key: 'event', label: 'Event', sort: 'era' });
  cols.push(
    { key: 'category', label: 'Type', sort: 'category' },
    { key: 'subtype', label: 'Strain', sort: 'subtype' },
    { key: 'status', label: 'Status', sort: 'confidence' }
  );
  if (state.region !== 'au') cols.push({ key: 'country', label: 'Country', sort: 'country' });
  cols.push(
    { key: 'admin1', label: state.region === 'au' ? 'State' : 'State or region', sort: 'admin1' },
    { key: 'locality', label: 'Place', sort: 'locality' },
    { key: 'species', label: 'Species', sort: 'species', wrap: true },
    { key: 'count', label: 'Affected', sort: 'count', num: true },
    { key: 'source', label: 'Source', wrap: true }
  );
  return cols;
}

/* The strain badge. In a popup, one record at a time, the era colour is worth
 * spending: it says at a glance whether this point belongs to the live event.
 * In the table it would repeat down a whole column, and the row edge already
 * carries the era where events are mixed, so there it is a neutral badge and the
 * subtype text carries the meaning. */
function strainTag(r, plain) {
  if (!r.subtype) return '<span class="muted">not stated</span>';
  const cls = plain ? 'strain' : 'strain ' + eraClass(r, 'strain');
  return '<span class="' + cls + '">' + escapeHtml(r.subtype) + '</span>';
}

function statusTag(r) {
  if (r.confidence === 'presumptive') {
    return '<span class="conf conf--presumptive" title="' + escapeHtml(PRESUMPTIVE_NOTE) + '">presumptive</span>';
  }
  if (r.confidence === 'confirmed') return '<span class="tag tag--official">confirmed</span>';
  return '<span class="muted" title="' + escapeHtml(UNSTATED_NOTE) + '">not stated</span>';
}

/* The Event cell exists only where events are mixed, and there the row's left
 * edge already carries era in colour. So the cell is words, not a red badge: the
 * label is what a reader needs and it survives with colour removed. */
function eventCell(r) {
  return '<span title="' + escapeHtml(eraLabel(r)) + '">' + escapeHtml(eraShort(r)) + '</span>';
}

const CONF_RANK = { confirmed: '1', presumptive: '2' };
function sortValue(r, key) {
  switch (key) {
    case 'date': return r.date || '';
    case 'era': return (r.era_current ? '0' : '1') + eraShort(r).toLowerCase();
    case 'category': return catLabel(r.category).toLowerCase();
    case 'confidence': return CONF_RANK[r.confidence] || '3';
    case 'count': return r.count == null ? -1 : Number(r.count);
    default: {
      const v = r[key];
      return v == null ? '' : String(v).toLowerCase();
    }
  }
}

function cellHtml(r, key) {
  switch (key) {
    case 'date': return '<time datetime="' + escapeHtml(r.date) + '">' + escapeHtml(niceDate(r.date)) + '</time>';
    case 'event': return eventCell(r);
    case 'category': return catCell(r.category);
    case 'subtype': return strainTag(r, true);
    case 'status': return statusTag(r);
    case 'country': return escapeHtml(r.country);
    case 'admin1': return r.admin1 ? escapeHtml(r.admin1) : '<span class="muted">not stated</span>';
    case 'locality': return r.locality ? escapeHtml(r.locality) : '<span class="muted">not stated</span>';
    case 'species': return r.species ? '<i>' + escapeHtml(r.species) + '</i>' : '<span class="muted">not stated</span>';
    case 'count': return r.count ? escapeHtml(fmtNum(r.count)) : '<span class="muted">not stated</span>';
    case 'source': return linkHtml(r.source_url, r.source);
    default: return '';
  }
}

function renderThead(cols) {
  /* aria-sort only. The stylesheet draws the indicator, so no glyph is ever
   * injected into the heading text. */
  $('#thead').innerHTML = '<tr>' + cols.map((c) => {
    const attrs = ['scope="col"'];
    /* tabindex makes a sortable header reachable without a mouse. The element
     * stays a th, so it keeps its column-header semantics and its aria-sort. */
    if (c.sort) attrs.push('data-sort="' + c.sort + '"', 'tabindex="0"');
    if (c.num) attrs.push('class="num"');
    /* Every sortable column carries aria-sort, not just the active one. Without
     * the explicit "none" the other eight columns are silent, so a screen reader
     * user cannot tell a sortable column from a fixed one. */
    if (c.sort) {
      attrs.push('aria-sort="' + (state.sortKey === c.sort
        ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none') + '"');
    }
    return '<th ' + attrs.join(' ') + '>' + escapeHtml(c.label) + '</th>';
  }).join('') + '</tr>';
}

function renderList(rows) {
  /* Two different questions, judged on every matching record rather than on the
   * first page.
   *
   * mixedEra: does the view hold more than one event? If not, an Event column
   * would repeat one value down every row, so it is dropped and the event is
   * stated once under the table instead.
   *
   * mixedLive: does the view hold both current and non-current records? The red
   * row edge means "this row is the live incursion", so it only carries
   * information when some row is not. The world view holds two current events at
   * once, which is why this is a separate test from mixedEra. */
  const eraIds = new Set(rows.map((r) => r.era));
  const mixedEra = eraIds.size > 1;
  const mixedLive = rows.some(isLive) && rows.some((r) => !isLive(r));
  const cols = columns(mixedEra);
  renderThead(cols);

  const sorted = [...rows].sort((a, b) => {
    const x = sortValue(a, state.sortKey);
    const y = sortValue(b, state.sortKey);
    if (x < y) return -state.sortDir;
    if (x > y) return state.sortDir;
    /* Stable, readable tie-break: newest first, then id. */
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });

  const slice = sorted.slice(0, state.shown);
  $('#tbody').innerHTML = slice.length
    ? slice.map((r) => {
      /* The red left edge says "current incursion", so it is only drawn where
       * some row is not. In an all-current view every row would carry the same
       * red rule, which marks nothing and was most of the red on the page. */
      const rowCls = mixedLive ? (isLive(r) ? 'is-live' : 'is-historical') : '';
      return '<tr' + (rowCls ? ' class="' + rowCls + '"' : '') + '>'
        + cols.map((c) => {
          const cls = [c.num ? 'num' : '', c.wrap ? 'td-wrap' : ''].filter(Boolean).join(' ');
          /* data-label carries the column name onto the cell so the stacked
           * small-screen layout can restore it via CSS generated content. It
           * matters that this is emitted here rather than inferred in CSS:
           * columns() is variable (9, 10 or 11 cells depending on mixedEra and
           * region), so cell position cannot identify a column, and keying the
           * labels off thead sort keys instead would silently mislabel every
           * row the moment a sort key were renamed. */
          return '<td data-label="' + escapeHtml(c.label) + '"'
            + (cls ? ' class="' + cls + '"' : '') + '>' + cellHtml(r, c.key) + '</td>';
        }).join('') + '</tr>';
    }).join('')
    : '<tr><td class="table-empty" colspan="' + cols.length + '">' + emptyMessage() + '</td></tr>';

  /* The search narrows the table only, never the map, so the status line says
   * which of the two it is counting. */
  const scope = state.search ? 'matching that search' : 'in view';
  const countText = slice.length
    ? 'Showing ' + slice.length + ' of ' + sorted.length + ' ' + plural(sorted.length, 'record', 'records') + ' ' + scope
    : 'No records ' + scope;
  $('#listCount').textContent = countText;
  $('#showMore').hidden = state.shown >= sorted.length;

  /* With the Event column dropped, the event is stated once, in words, so the
   * table never leaves a reader to assume which event these rows belong to. */
  const single = (!mixedEra && rows.length) ? eraLabel(rows[0]) : '';
  renderListFoot(single);

  /* The sort state is part of the announcement because without it a repeat sort
   * on the same column produces byte-identical live-region text, and a screen
   * reader will not re-announce unchanged content, so reversing the direction
   * would be silent. */
  announce(countText + '. Sorted by ' + sortSummary(mixedEra) + '. Filters: ' + filterSummary() + '.');
}

/* The active sort, in the same words the column header uses. */
function sortSummary(mixedEra) {
  const col = columns(mixedEra).find((c) => c.sort === state.sortKey);
  const label = col ? col.label : state.sortKey;
  return label + ', ' + (state.sortDir === 1 ? 'ascending' : 'descending');
}

/* --------------------------------------------------- announcing a view change
 * Filtering, the historical tick, the timeframe, the search and sorting all
 * rewrite the table and the counts with no visible transition, which tells a
 * screen reader nothing at all. index.html carries no live region and this file
 * does not edit that file, so the region is created here and kept off screen
 * with the stylesheet's existing .visually-hidden.
 */
let liveRegion = null;
function ensureLiveRegion() {
  if (liveRegion) return liveRegion;
  /* If the markup ever gains its own region with this id, that one is used and
   * no second one is created. */
  const existing = $('#viewAnnounce');
  if (existing) {
    liveRegion = existing;
    return liveRegion;
  }
  liveRegion = document.createElement('p');
  liveRegion.id = 'viewAnnounce';
  liveRegion.className = 'visually-hidden';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/* Nothing is announced during the first paint: the page is arriving, not
 * changing, and the heading structure already carries it. */
function announce(text) {
  if (!state.announce) return;
  ensureLiveRegion().textContent = text;
}

/* The filters in force, in the same words the controls use. */
function filterSummary() {
  const bits = [];
  bits.push(REGION_WORD[state.region] || state.region);
  bits.push(state.includeHistorical ? 'current and historical events' : 'current event only');
  if (state.category !== 'all') bits.push(catLabel(state.category));
  if (state.subtype !== 'all') bits.push('strain ' + state.subtype);
  if (state.timeframe > 0) bits.push('last ' + state.timeframe + ' days');
  const q = state.search.trim();
  if (q) bits.push('search ' + q);
  return bits.join(', ');
}

/* An empty table says which filter emptied it, so a reader is never left
 * guessing whether the data is missing or hidden. */
function emptyMessage() {
  /* The count has to run through the same search the table just ran, otherwise
   * the hint would offer a number that has nothing to do with what was typed. */
  const relaxedEra = state.includeHistorical ? 0 : searched(inView({ ignoreEra: true })).length;
  if (relaxedEra > 0) {
    return 'Nothing in the current event matches these filters. There '
      + plural(relaxedEra, 'is ' + relaxedEra + ' historical or other record', 'are ' + relaxedEra
        + ' historical or other records')
      + ' that would match. Tick &ldquo;Include historical and other records&rdquo; above to show '
      + plural(relaxedEra, 'it', 'them') + '.';
  }
  if (state.search) return 'No records match that search.';
  return 'No records match these filters.';
}

function renderListFoot(singleEvent) {
  const lead = singleEvent
    ? 'Every row in this table belongs to one event: ' + escapeHtml(singleEvent) + '. '
    : '';
  $('#listFoot').innerHTML = lead
    + 'A record marked <span class="conf conf--presumptive">presumptive</span> is one an '
    + 'authority has reported as an initial positive while confirmatory testing continues. It is a normal official '
    + 'category in this outbreak: Australian national tallies count confirmed and presumed positive detections '
    + 'together. <span class="muted">not stated</span> means the source published no confirmation status, which is '
    + 'not the same as unconfirmed.';
}

/* -------------------------------------------------------------- 7  news list */

/* Outlet names arrive from a news feed and can carry a long publisher suffix,
 * separated by a dash. The leading name is kept for display, and the link still
 * goes to the source. The dashes are written as escapes so no dash character
 * sits in this file. */
function outletShort(name) {
  return String(name || '').split(/\s+[\u2013\u2014-]\s+/)[0].trim();
}

function newsItems() {
  const cs = state.summary && state.summary.coverage_signal;
  if (!cs) return [];
  const out = [];
  const seen = new Set();
  const push = (c) => {
    if (!c || !c.title) return;
    const key = c.url || c.title;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ date: c.date || '', outlet: c.outlet || '', title: c.title, url: c.url || '' });
  };
  /* Preferred shape if the pipeline publishes the retained headline list. */
  if (Array.isArray(cs.headlines)) cs.headlines.forEach(push);
  /* Otherwise the news citations attached to each coverage gap. */
  (cs.gaps || []).forEach((g) => (g.citations || []).filter((c) => c.kind === 'news').forEach(push));
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function renderNews() {
  const cs = state.summary && state.summary.coverage_signal;
  const items = newsItems();
  $('#newsList').innerHTML = items.map((n) => {
    /* Headline and URL both arrive from Google News RSS, so the URL goes through
     * safeUrl and a headline without a usable link stays as plain text. */
    const title = linkHtml(n.url, n.title);
    return '<li class="news-item">'
      + '<p class="news-item__date">' + (n.date
        ? '<time datetime="' + escapeHtml(n.date) + '">' + escapeHtml(niceDate(n.date)) + '</time>'
        : 'date not stated') + '</p>'
      + '<div class="news-item__body">'
      + (n.outlet ? '<p class="news-item__outlet">' + escapeHtml(outletShort(n.outlet)) + '</p>' : '')
      + '<p class="news-item__title">' + title + '</p>'
      + '</div></li>';
  }).join('');

  const foot = [];
  if (!items.length) {
    foot.push('No Australian reports were retained on the latest run. This section lists only coverage the feed kept, '
      + 'so an empty list means no qualifying report, not an absence of detections.');
  }
  if (cs && cs.name) {
    /* The feed name is stored with a descriptive suffix after a colon. The
     * leading name reads better in a sentence. */
    foot.push('Collected by ' + escapeHtml(String(cs.name).split(':')[0].trim()) + ', an automated feed used only to '
      + 'flag gaps for checking against a primary source. It never contributes to a count on this site.');
  }
  $('#newsFoot').innerHTML = foot.join(' ');
}

/* ------------------------------------------------------- 8  sources and meta */

function srcBadgeClass(status) {
  if (status === 'live') return 'src-badge--live';
  if (status === 'error') return 'src-badge--error';
  if (status === 'empty') return 'src-badge--empty';
  return 'src-badge--seed';
}

function renderSources() {
  const s = state.summary;
  const sources = (s && s.sources) || [];
  const live = sources.filter((x) => x.status === 'live').length;

  if (s && s.mode === 'live') {
    $('#sourceStatus').textContent = live + ' automated agency ' + plural(live, 'feed', 'feeds')
      + ' syncing. Data refreshes daily.';
  } else if (s && s.mode) {
    $('#sourceStatus').textContent = 'The automated agency feeds have not completed a sync on this run. The map is '
      + 'showing curated, individually sourced events.';
  } else {
    /* No mode recorded is not the same as a failed sync, so it is not reported as
     * one. Each feed still carries its own status below. */
    $('#sourceStatus').textContent = 'This build did not record whether the automated feeds synced, so read each '
      + 'feed status below rather than treating the page as up to date.';
  }

  $('#sourceList').innerHTML = sources.map((x) => {
    /* A feed with no record count is a feed that published none, not a feed with
     * zero mapped records, so the two read differently. */
    const count = fmtNum(x.records) === ''
      ? 'mapped record count not published'
      : fmtNum(x.records) + ' mapped ' + plural(x.records, 'record', 'records');
    return '<li class="source-item">'
      + '<span class="src-badge ' + srcBadgeClass(x.status) + '">' + escapeHtml(x.status) + '</span>' + READ_SEP
      + namedLinkHtml(x.homepage, x.name, 'source-name') + READ_SEP
      + '<span class="source-meta">' + escapeHtml(x.region) + ', ' + escapeHtml(count) + '</span>' + READ_SEP
      + (x.note ? '<span class="source-note">' + escapeHtml(x.note) + '</span>' : '')
      + '</li>';
  }).join('');

  /* Record-less sources are listed separately, because the list above carries a
   * record count per feed and a zero there would read as a broken feed. */
  $('#contextSourceList').innerHTML = ((s && s.context_sources) || []).map((x) => {
    const signal = x.kind === 'signal';
    return '<li class="source-item">'
      + '<span class="src-badge ' + (signal ? 'src-badge--signal' : 'src-badge--official') + '">'
      + (signal ? 'signal' : 'official') + '</span>' + READ_SEP
      + namedLinkHtml(x.url, x.name, 'source-name') + READ_SEP
      + '<span class="source-note">' + (signal
        ? 'Media coverage, used as an early signal for maintainers. Never mapped and never counted.'
        : 'Official position and national count. Publishes place names without coordinates, so it informs the '
          + 'counts and adds no points to the map.') + '</span>'
      + '</li>';
  }).join('');

  $('#referenceList').innerHTML = ((s && s.references) || []).map((x) => '<li class="source-item">'
    + '<span class="src-badge src-badge--seed">ref</span>' + READ_SEP
    + namedLinkHtml(x.url, x.name, 'source-name')
    + '</li>').join('');
}

/* summary.json and detections.json are two files from the same build, fetched
 * separately and cacheable separately. A partial deploy, or a CDN serving one of
 * them from an older build, leaves the page stating counts from one file above a
 * table built from the other. Presenting both silently would put two
 * contradictory numbers in front of a reader with nothing to say which is wrong,
 * so the counts are reconciled against the records actually loaded and any skew
 * is stated. Returns a sentence fragment, or null when the two agree.
 */
function dataSkew() {
  const s = state.summary;
  const ae = auEras();
  if (!s || !ae || !Array.isArray(ae.national) || !Array.isArray(state.all)) return null;

  const counted = new Map();
  const statesSeen = new Map();
  for (const r of state.all) {
    if (r.country !== 'Australia') continue;
    counted.set(r.era, (counted.get(r.era) || 0) + 1);
    if (!statesSeen.has(r.era)) statesSeen.set(r.era, new Set());
    if (r.admin1) statesSeen.get(r.era).add(r.admin1);
  }

  const diffs = [];
  for (const n of ae.national) {
    if (n.records == null) continue;
    const have = counted.get(n.era) || 0;
    if (Number(n.records) !== have) {
      /* The fragment is placed in the banner as HTML, so the one piece of data in
       * it is escaped here. */
      diffs.push(escapeHtml(n.short_label) + ', summary says ' + fmtFig(n.records)
        + ' and the detections file holds ' + have);
    }
  }
  const currentHave = counted.get(ae.current_era) || 0;
  if (ae.current_records != null && Number(ae.current_records) !== currentHave) {
    diffs.push('the headline count of current detections says ' + fmtFig(ae.current_records)
      + ' and the detections file holds ' + currentHave);
  }
  const currentStates = (statesSeen.get(ae.current_era) || new Set()).size;
  if (ae.current_states != null && Number(ae.current_states) !== currentStates) {
    diffs.push('the count of states with a current detection says ' + fmtFig(ae.current_states)
      + ' and the detections file holds ' + currentStates);
  }
  return diffs.length ? diffs.join('; ') : null;
}

function renderMeta() {
  const s = state.summary;
  if (!s) return;
  const upd = niceStamp(s.generated_at);
  $('#updated').textContent = upd ? 'Updated ' + upd : '';
  $('#footUpdated').textContent = upd ? 'Last data refresh: ' + upd + '.' : '';

  /* The badge names a known mode or it says nothing. Printing the word
   * "undefined" in a data-freshness badge is worse than an absent badge, and the
   * mode is never interpolated into a class name it might not be. */
  /* 'partial' means some feeds answered but the Australian layer did not, so the
   * Australian records shown are last-good. It is a distinct state from 'stale',
   * where nothing refreshed, and it must not read as 'live'. */
  const MODE_TEXT = {
    live: 'Live data', partial: 'Cached Australian data',
    stale: 'Cached data', seed: 'Preview data',
  };
  const badge = $('#modeBadge');
  const knownMode = s.mode && Object.prototype.hasOwnProperty.call(MODE_TEXT, s.mode);
  badge.hidden = !knownMode;
  badge.className = 'mode-badge' + (knownMode ? ' ' + s.mode : '');
  badge.textContent = knownMode ? MODE_TEXT[s.mode] : '';

  const meta = [];
  if (s.latest_event) meta.push('<span>Latest reported detection: ' + escapeHtml(niceDate(s.latest_event)) + '</span>');
  const off = s.official_au;
  if (off && off.ok && off.national_total != null) {
    meta.push('<span>Commonwealth national count: ' + escapeHtml(fmtFig(off.national_total))
      + (off.as_at_text ? ', as at ' + escapeHtml(off.as_at_text) : '') + '</span>');
  }
  /* A flex gap separates these visually and not at all in the text layer, so a
   * stop goes between them. */
  $('#heroMeta').innerHTML = meta.join(READ_SEP);

  /* Data-plumbing notices, and the two-file skew check. Never the live-incursion
   * treatment: none of this is about the outbreak. */
  const notices = [];
  if (!s.mode) {
    notices.push('<strong>Data freshness unknown.</strong> This build did not record whether the data is live, cached '
      + 'or preview, so nothing here should be read as current until the next refresh. See '
      + '<a href="#sources">data sources</a>.');
  } else if (s.mode !== 'live') {
    /* The pipeline publishes mode_note: a sentence that names which layer is stale,
     * null when the run is fully current. Prefer it, because the old blanket
     * "Preview data ... finishing their first sync" text is false for 'partial'
     * (feeds answered, the Australian layer did not) and for 'stale' (nothing
     * refreshed at all). Fall back to per-mode wording, never to the seed wording. */
    var MODE_NOTICE = {
      partial: '<strong>Cached Australian data.</strong> Some feeds answered on this run but the Australian layer did '
        + 'not, so the Australian detections shown are the last good copy rather than a fresh one.',
      stale: '<strong>Cached data.</strong> No feed refreshed on this run, so everything shown is the last good copy.',
      seed: '<strong>Preview data.</strong> Verified curated events are shown while the automated feeds finish their '
        + 'first sync.',
    };
    notices.push((s.mode_note ? '<strong>Data is not fully current.</strong> ' + escapeHtml(s.mode_note)
      : (MODE_NOTICE[s.mode] || '<strong>Data is not fully current.</strong> Treat the figures as provisional.'))
      + ' See <a href="#sources">data sources</a>.');
  }
  const skew = dataSkew();
  if (skew) {
    notices.push('<strong>The two data files disagree.</strong> The figures on this page are read from summary.json and '
      + 'the map and table are built from detections.json. On this load they do not match: ' + skew + '. That normally '
      + 'means one of the two files is from an earlier build, so treat the figures as unreliable until the next '
      + 'refresh, and check the official sources directly.');
  }
  if (notices.length) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = '<div class="wrap">' + notices.map((n) => '<p>' + n + '</p>').join('') + '</div>';
  }

  /* The live incursion gets the red rule, and only it. */
  const lt = s.status && s.status.local_transmission;
  if (lt && lt.status === 'suggested') {
    const lb = $('#liveBanner');
    lb.hidden = false;
    lb.innerHTML = '<div class="wrap"><p><strong>Local transmission suggested.</strong> On '
      + escapeHtml(niceDate(lt.date)) + ' the Australian Chief Veterinary Officer said the evidence suggests some local '
      + 'transmission has now occurred between ' + escapeHtml(lt.where || 'resident wild birds')
      + '. <a href="#situation">Read the statement</a>.</p></div>';
  }

  const caveats = (s.status && s.status.caveats) || [];
  if (caveats.length) {
    $('#notesList').innerHTML = caveats.map((c) => '<li>' + escapeHtml(c) + '</li>').join('');
  }
}

/* ------------------------------------------------------------------ controls */

function buildControls() {
  const I = window.Icons;

  /* Region: plain uppercase letterspaced text. No flags, no globes, no icons. */
  $('#regionBtns').innerHTML = REGION_KEYS.map((k) => {
    const on = state.region === k;
    return '<button type="button" class="ctl ctl--caps' + (on ? ' is-active' : '') + '" data-region="' + k + '"'
      + ' aria-pressed="' + on + '" aria-label="' + escapeHtml(I ? I.regionName(k) : k) + '">'
      + escapeHtml(I ? I.regionLabel(k) : String(k).toUpperCase()) + '</button>';
  }).join('');

  const cats = [{ key: 'all', label: 'All types', mark: '' }].concat((I ? I.KEYS : []).map((k) => (
    { key: k, label: catLabel(k), mark: catMark(k) }
  )));
  $('#categoryBtns').innerHTML = cats.map((c) => {
    const on = state.category === c.key;
    return '<button type="button" class="ctl' + (on ? ' is-active' : '') + '" data-cat="' + escapeHtml(c.key) + '"'
      + ' aria-pressed="' + on + '">' + c.mark + escapeHtml(c.label) + '</button>';
  }).join('');

  $('#subtypeBtns').innerHTML = SUBTYPE_FILTERS.map((f) => {
    const on = state.subtype === f.key;
    return '<button type="button" class="ctl' + (on ? ' is-active' : '') + '" data-sub="' + escapeHtml(f.key) + '"'
      + ' aria-pressed="' + on + '">' + escapeHtml(f.label) + '</button>';
  }).join('');

  /* The label is used as published. Lowercasing it turned H5N1 into "h5n1", and
   * a subtype name is capitalised in every official source and everywhere else on
   * this site. */
  const cur = eraDef(state.summary && state.summary.eras && state.summary.eras.current_au_era);
  $('#eraNote').textContent = 'Off: ' + (cur ? cur.short_label : 'the current event')
    + ' only. On: adds resolved H7 poultry outbreaks from 2024 to 2025, the unrelated 2024 human case, and records '
    + 'whose subtype the source did not publish.';
}

function setPressed(container, btn) {
  document.querySelectorAll(container + ' .ctl').forEach((c) => {
    c.classList.remove('is-active');
    c.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('is-active');
  btn.setAttribute('aria-pressed', 'true');
}

function sortBy(key) {
  if (state.sortKey === key) state.sortDir *= -1;
  else {
    state.sortKey = key;
    state.sortDir = (key === 'date' || key === 'count') ? -1 : 1;
  }
  /* renderList rebuilds the thead via innerHTML, which destroys the very header
   * the keyboard user is standing on and drops focus to <body>. Sorting a table
   * by keyboard should leave you where you were, so put focus back on the same
   * column after the rebuild. Guarded on the header having had focus, so a mouse
   * click does not steal focus into the table. */
  const wasFocused = document.activeElement
    && document.activeElement.closest && document.activeElement.closest('#thead');
  renderList(searched(inView()));
  if (wasFocused) {
    const th = document.querySelector('#thead th[data-sort="' + key + '"]');
    if (th) th.focus({ preventScroll: true });
  }
}

function wire() {
  $('#regionBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]');
    if (!b) return;
    state.region = b.dataset.region;
    state.shown = 50;
    setPressed('#regionBtns', b);
    focusRegion(state.region);
    render();
  });

  $('#categoryBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.category = b.dataset.cat;
    state.shown = 50;
    setPressed('#categoryBtns', b);
    render();
  });

  $('#subtypeBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]');
    if (!b) return;
    state.subtype = b.dataset.sub;
    state.shown = 50;
    setPressed('#subtypeBtns', b);
    render();
  });

  $('#includeHistorical').addEventListener('change', (e) => {
    state.includeHistorical = e.target.checked;
    state.shown = 50;
    render();
  });

  $('#timeframe').addEventListener('change', (e) => {
    state.timeframe = Number(e.target.value);
    state.shown = 50;
    render();
  });

  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    state.shown = 50;
    renderList(searched(inView()));
  });

  $('#showMore').addEventListener('click', () => {
    state.shown += 50;
    renderList(searched(inView()));
  });

  /* Headers are delegated because the thead is rebuilt whenever the columns
   * change. Enter and Space sort, so the table is fully keyboard operable. */
  const thead = $('#thead');
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) sortBy(th.dataset.sort);
  });
  thead.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    e.preventDefault();
    sortBy(th.dataset.sort);
  });
}

/* ---------------------------------------------------------------------- boot */

async function boot() {
  readPalette();
  initMap();
  wire();
  ensureLiveRegion();
  try {
    const [sum, det] = await Promise.all([
      fetch('data/summary.json').then((r) => r.json()),
      fetch('data/detections.json').then((r) => r.json()),
    ]);
    state.summary = sum;
    state.all = Array.isArray(det) ? det : [];
    buildControls();
    renderCategoryKey();
    renderMeta();
    renderSituation();
    renderOfficialGap();
    renderOfficialStatement();
    renderNews();
    renderSources();
    render();
    focusRegion(state.region);
    /* From here on a view change is a change, so it is announced. */
    state.announce = true;
  } catch (err) {
    $('#updated').textContent = 'Could not load data.';
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = '<div class="wrap"><p><strong>Data did not load.</strong> Please try again shortly. Nothing on this '
      + 'page should be read as current until it does.</p></div>';
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', boot);
