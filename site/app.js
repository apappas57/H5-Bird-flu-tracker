/* H5 Bird Flu Tracker — front-end logic (vanilla JS + Leaflet). */
'use strict';

// Hand-tinted "Flyway" palette — kept hue- & lightness-distinct.
// Must stay in sync with the --c-* custom properties in styles.css.
const CATEGORY = {
  human:     { label: 'People',       color: '#A8322A' }, // carmine
  poultry:   { label: 'Poultry',      color: '#C6891F' }, // ochre
  dairy:     { label: 'Dairy cattle', color: '#3F6B82' }, // slate
  wild_bird: { label: 'Wild birds',   color: '#5E7A3A' }, // verdant
  mammal:    { label: 'Mammals',      color: '#7E579B' }, // amethyst
};
// geojson country name -> our canonical name (only where they differ)
const GEO_NAME_FIX = { 'United States of America': 'United States' };

const REGION_VIEW = {
  global: { center: [20, 5], zoom: 2, bounds: null },
  us:     { bounds: [[24.4, -125], [49.4, -66.9]] },
  au:     { bounds: [[-44, 112], [-10, 154]] },
};

const state = {
  all: [], summary: null,
  region: 'au', category: 'all', subtype: 'all', timeframe: 0, search: '',
  sortKey: 'date', sortDir: -1, shown: 50,
};

let map, markerLayer, countryLayer, countsByCountry = {};

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K';
  return String(n);
}
function niceDate(s) {
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
// deterministic small jitter so co-located markers don't perfectly stack
function jitter(id, scale) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = (h % 1000) / 1000, b = ((h >> 10) % 1000) / 1000;
  return [(a - 0.5) * scale, (b - 0.5) * scale];
}

// ---------- data flow ----------
function filtered() {
  const cut = state.timeframe > 0 ? daysAgo(state.timeframe) : '0000-00-00';
  const q = state.search.trim().toLowerCase();
  return state.all.filter((r) => {
    if (state.region === 'us' && r.country !== 'United States') return false;
    if (state.region === 'au' && r.country !== 'Australia') return false;
    if (state.category !== 'all' && r.category !== state.category) return false;
    if (state.subtype !== 'all') {
      if (state.subtype === 'H7') { if (!(r.subtype && r.subtype.startsWith('H7'))) return false; }
      else if (r.subtype !== state.subtype) return false;
    }
    if (r.date < cut) return false;
    if (q) {
      const hay = `${r.country} ${r.admin1 || ''} ${r.locality || ''} ${r.species || ''} ${r.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const recs = filtered();
  renderStats(recs);
  renderMarkers(recs);
  renderChoropleth(recs);
  renderList(recs);
}

// ---------- stats ----------
const statCard = (k) =>
  `<div class="stat ${k.cls}"><div class="val">${fmt(k.val)}</div><div class="lbl">${k.lbl}</div></div>`;

function renderStats(recs) {
  const s = state.summary;
  // Australia: a fixed "current situation" summary drawn from the roll-up,
  // so the headline numbers stay meaningful regardless of the map filters.
  if (state.region === 'au' && s && s.au) {
    const au = s.au, hc = s.human_context || {};
    $('#stats').innerHTML = [
      { cls: 'wild_bird', val: au.h5n1_wild_detections, lbl: 'H5N1 wild-bird detections' },
      { cls: 'geo', val: au.h5n1_states, lbl: 'States affected' },
      { cls: 'human', val: au.days_since_first_detection, lbl: 'Days since first detection' },
      { cls: 'poultry', val: au.poultry, lbl: 'Poultry outbreaks (H7, 2024-25)' },
      { cls: 'human', val: au.human, lbl: 'Human cases (all-time)' },
      { cls: 'geo', val: hc.global_cumulative, lbl: 'Global human cases (WHO)' },
    ].map(statCard).join('');
    return;
  }
  // United States / Global: derive from the records in view.
  const c = { human: 0, poultry: 0, dairy: 0, wild_bird: 0, mammal: 0 };
  const countries = new Set(), admin1s = new Set();
  for (const r of recs) { c[r.category]++; countries.add(r.country); if (r.admin1) admin1s.add(r.admin1); }
  const isUs = state.region === 'us';
  $('#stats').innerHTML = [
    { cls: 'human', val: c.human, lbl: 'Human cases' },
    { cls: 'poultry', val: c.poultry, lbl: 'Poultry outbreaks' },
    { cls: 'dairy', val: c.dairy, lbl: 'Dairy cattle herds' },
    { cls: 'wild_bird', val: c.wild_bird, lbl: 'Wild bird detections' },
    { cls: 'mammal', val: c.mammal, lbl: 'Mammal detections' },
    { cls: 'geo', val: isUs ? admin1s.size : countries.size, lbl: isUs ? 'States affected' : 'Countries affected' },
  ].map(statCard).join('');
}

// ---------- map ----------
function initMap() {
  // preferCanvas keeps thousands of markers smooth (the US wild-bird layer is large)
  map = L.map('map', { worldCopyJump: true, minZoom: 2, preferCanvas: true }).setView([-27, 134], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 12,
  }).addTo(map);
  countryLayer = L.geoJSON(null, { style: choroStyle, onEachFeature: choroFeature }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function markerRadius(r) {
  if (r.count && r.count > 0) return Math.min(22, 5 + 3.2 * Math.log10(r.count + 1));
  return 6;
}
function renderMarkers(recs) {
  markerLayer.clearLayers();
  // draw larger (fewer-count) first so dense points sit on top
  const ordered = [...recs].sort((a, b) => markerRadius(b) - markerRadius(a));
  for (const r of ordered) {
    const [dy, dx] = jitter(r.id, r.level === 'country' ? 3.2 : 0.7);
    const col = (CATEGORY[r.category] || {}).color || '#888';
    const rad = markerRadius(r);
    const at = [r.lat + dy, r.lng + dx];
    // Engraved specimen marker: a translucent watercolour halo (sized by count)
    // beneath a solid core with a fine bistre ink ring — as on the plate map.
    if (rad > 8) {
      L.circleMarker(at, { radius: rad + 6, color: col, weight: 0, fillColor: col, fillOpacity: 0.13 }).addTo(markerLayer);
    }
    // H5N1 gets a carmine alarm ring so the current strain of concern stands out
    if (r.subtype === 'H5N1') {
      L.circleMarker(at, { radius: rad + 3.5, color: '#A8322A', weight: 1.4, fill: false, opacity: 0.92 }).addTo(markerLayer);
    }
    L.circleMarker(at, {
      radius: rad, color: '#241C12', weight: 1, fillColor: col, fillOpacity: 0.88,
    }).bindPopup(popupHtml(r)).addTo(markerLayer);
  }
}
function popupHtml(r) {
  const cat = CATEGORY[r.category] || { label: r.category };
  const where = [r.locality, r.admin1, r.country].filter(Boolean).join(', ');
  const rows = [
    `<div class="popup-row"><strong>${where}</strong></div>`,
    `<div class="popup-row">${niceDate(r.date)}</div>`,
    r.subtype ? `<div class="popup-row">Strain: <strong>${escapeHtml(r.subtype)}</strong></div>` : '',
    r.species ? `<div class="popup-row">${escapeHtml(r.species)}</div>` : '',
    r.flock_type ? `<div class="popup-row">${escapeHtml(r.flock_type)}</div>` : '',
    r.count ? `<div class="popup-row">${fmt(r.count)} affected</div>` : '',
    `<div class="popup-row">Source: ${escapeHtml(r.source)}</div>`,
  ].join('');
  return `<div class="popup-title" style="color:${cat.color || 'inherit'}">${cat.label}</div>${rows}`;
}

// ---------- choropleth (impacted areas) ----------
function renderChoropleth(recs) {
  countsByCountry = {};
  for (const r of recs) countsByCountry[r.country] = (countsByCountry[r.country] || 0) + 1;
  countryLayer.setStyle(choroStyle);
}
function choroStyle(feature) {
  const name = GEO_NAME_FIX[feature.properties.name] || feature.properties.name;
  const n = countsByCountry[name] || 0;
  const op = n === 0 ? 0 : Math.min(0.5, 0.12 + Math.log10(n + 1) * 0.16);
  // sepia ink wash — impacted areas read like a stain spreading across the map
  return { fillColor: '#6B4E2E', fillOpacity: op, color: '#6B4E2E', weight: n ? 0.6 : 0, opacity: n ? 0.4 : 0 };
}
function choroFeature(feature, layer) {
  const name = GEO_NAME_FIX[feature.properties.name] || feature.properties.name;
  layer.on('add', () => {}); // no-op; tooltip bound lazily
  layer.bindTooltip(() => {
    const n = countsByCountry[name] || 0;
    return n ? `${name}: ${n} detection${n > 1 ? 's' : ''}` : name;
  }, { sticky: true });
}

function focusRegion(region) {
  const v = REGION_VIEW[region];
  if (v.bounds) map.fitBounds(v.bounds, { padding: [20, 20] });
  else map.setView(v.center, v.zoom);
}

// ---------- list ----------
function renderList(recs) {
  const sorted = [...recs].sort((a, b) => {
    let x = a[state.sortKey], y = b[state.sortKey];
    if (state.sortKey === 'count') { x = x || -1; y = y || -1; }
    x = x == null ? '' : x; y = y == null ? '' : y;
    if (x < y) return -state.sortDir; if (x > y) return state.sortDir; return 0;
  });
  const slice = sorted.slice(0, state.shown);
  $('#tbody').innerHTML = slice.map(rowHtml).join('') ||
    `<tr><td colspan="8" class="muted" style="padding:22px;text-align:center">No detections match these filters.</td></tr>`;
  $('#listCount').textContent = `showing ${slice.length} of ${sorted.length}`;
  $('#showMore').hidden = state.shown >= sorted.length;
}
function rowHtml(r) {
  const cat = CATEGORY[r.category] || { label: r.category, color: '#888' };
  const src = r.source_url
    ? `<a href="${escapeHtml(r.source_url)}" rel="noopener">${escapeHtml(r.source)}</a>` : escapeHtml(r.source);
  return `<tr>
    <td>${niceDate(r.date)}</td>
    <td><span class="pill" style="background:color-mix(in srgb,${cat.color} 16%,transparent);color:${cat.color}"><span class="dot" style="background:${cat.color}"></span>${cat.label}</span></td>
    <td>${subtypeBadge(r.subtype)}</td>
    <td>${escapeHtml(r.country)}</td>
    <td>${escapeHtml(r.admin1 || '—')}</td>
    <td>${escapeHtml(r.locality || (r.species ? r.species : '—'))}</td>
    <td class="num">${r.count ? fmt(r.count) : '—'}</td>
    <td>${src}</td></tr>`;
}
function subtypeBadge(sub) {
  if (!sub) return '<span class="muted">—</span>';
  const cls = sub === 'H5N1' ? 'h5n1' : (sub.startsWith('H7') ? 'h7' : 'other');
  return `<span class="strain strain-${cls}">${escapeHtml(sub)}</span>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- chrome (legend, sources, banner) ----------
function renderLegend() {
  $('#legend').innerHTML = '<h4>Detection type</h4>' + Object.entries(CATEGORY).map(([, v]) =>
    `<div class="row"><span class="sw" style="background:${v.color}"></span>${v.label}</div>`).join('') +
    '<div class="row muted" style="margin-top:6px;font-size:.72rem">Circle size ≈ animals affected</div>';
}
function renderMeta() {
  const s = state.summary; if (!s) return;
  const upd = s.generated_at ? new Date(s.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  $('#updated').textContent = `Updated ${upd}`;
  $('#footUpdated').textContent = `Last data refresh: ${upd}`;
  const badge = $('#modeBadge');
  badge.hidden = false; badge.className = `mode-badge ${s.mode}`;
  badge.textContent = { live: 'Live data', stale: 'Cached data', seed: 'Preview data' }[s.mode] || s.mode;

  if (s.mode !== 'live') {
    const b = $('#banner'); b.hidden = false;
    b.innerHTML = `<div class="wrap"><strong>Preview mode.</strong> Showing verified curated events while the automated feeds finish their first sync. The full datasets populate automatically once deployed with network access. See <a href="#about">data sources</a>.</div>`;
  }
  // source status list
  const sources = s.sources || [];
  const live = sources.filter((x) => x.status === 'live').length;
  $('#sourceStatus').innerHTML = s.mode === 'live'
    ? `<strong>${live}</strong> automated agency feed${live !== 1 ? 's' : ''} syncing. Data refreshes daily.`
    : `Automated agency feeds have not completed a sync yet. The map currently shows curated, individually-sourced events. Data refreshes daily once deployed.`;
  const refs = s.references || [];
  const srcItems = sources.map((x) =>
    `<li><span class="src-badge ${x.status}">${x.status}</span><a href="${escapeHtml(x.homepage)}" rel="noopener">${escapeHtml(x.name)}</a> <span class="muted small">${x.region}</span></li>`);
  const refItems = refs.map((x) =>
    `<li><span class="src-badge seed">ref</span><a href="${escapeHtml(x.url)}" rel="noopener">${escapeHtml(x.name)}</a></li>`);
  $('#sourceList').innerHTML = srcItems.concat(refItems).join('');
}

// Current-situation banner for Australia, drawn from summary.status.
function renderStatusBanner() {
  const st = state.summary && state.summary.status;
  const el = $('#statusBanner');
  if (!st || !st.headline) { el.hidden = true; return; }
  const fd = st.first_detection || {};
  const figs = [
    { v: st.h5n1_wild_detections, l: 'wild-bird detections' },
    { v: st.h5n1_states, l: 'states affected' },
    { v: st.days_since_first_detection, l: 'days since first detection' },
  ].map((f) => `<div class="sb-fig"><span class="sb-num">${fmt(f.v)}</span><span class="sb-lbl">${f.l}</span></div>`).join('');
  const risk = st.human_risk || 'unknown';
  const src = fd.source_url ? ` <a href="${escapeHtml(fd.source_url)}" rel="noopener">${escapeHtml(fd.source || 'source')}</a>` : '';
  const first = fd.date ? `First detection ${niceDate(fd.date)}: ${escapeHtml(fd.species || '')}, ${escapeHtml(fd.place || '')}.` : '';
  const hotline = (st.report && st.report.hotline) ? ` &middot; ${escapeHtml(st.report.hotline)}` : '';
  el.hidden = false;
  el.innerHTML = `
    <div class="sb-top">
      <div class="sb-lead">
        <p class="sb-headline">${escapeHtml(st.headline)}</p>
        <p class="sb-sum">${escapeHtml(st.summary || '')}</p>
      </div>
      <span class="sb-risk sb-risk-${escapeHtml(risk)}">Human risk: ${escapeHtml(risk)}</span>
    </div>
    <div class="sb-figs">${figs}</div>
    <p class="sb-foot">${first}${src}${hotline}</p>`;
}

// ---------- events ----------
function wire() {
  $('#regionBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]'); if (!b) return;
    state.region = b.dataset.region; state.shown = 50;
    setActive('#regionBtns', b); focusRegion(state.region); render();
  });
  $('#categoryBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.category = b.dataset.cat; state.shown = 50;
    setActive('#categoryBtns', b); render();
  });
  $('#subtypeBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]'); if (!b) return;
    state.subtype = b.dataset.sub; state.shown = 50;
    setActive('#subtypeBtns', b); render();
  });
  $('#timeframe').addEventListener('change', (e) => { state.timeframe = +e.target.value; state.shown = 50; render(); });
  $('#search').addEventListener('input', (e) => { state.search = e.target.value; state.shown = 50; renderList(filtered()); });
  $('#showMore').addEventListener('click', () => { state.shown += 50; renderList(filtered()); });
  document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = (k === 'date' || k === 'count') ? -1 : 1; }
    document.querySelectorAll('th[data-sort]').forEach((t) => { t.removeAttribute('aria-sort'); t.textContent = t.textContent.replace(/[ ▾▴]+$/, ''); });
    th.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
    th.textContent += state.sortDir === 1 ? ' ▴' : ' ▾';
    renderList(filtered());
  }));
}
function setActive(container, btn) {
  document.querySelectorAll(`${container} .chip`).forEach((c) => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
  btn.classList.add('is-active'); btn.setAttribute('aria-pressed', 'true');
}

// ---------- boot ----------
async function boot() {
  initMap(); renderLegend(); wire();
  try {
    const [sum, det, geo] = await Promise.all([
      fetch('data/summary.json').then((r) => r.json()),
      fetch('data/detections.json').then((r) => r.json()),
      fetch('assets/world-countries.geojson').then((r) => r.json()),
    ]);
    state.summary = sum; state.all = det;
    // Preview/cached data can be older than the default 12-month window — show
    // everything so it never looks empty. Live data keeps the recent-first view.
    if (sum.mode !== 'live') { state.timeframe = 0; $('#timeframe').value = '0'; }
    countryLayer.addData(geo);
    renderMeta(); renderStatusBanner(); render(); focusRegion(state.region);
  } catch (err) {
    $('#updated').textContent = 'Could not load data.';
    $('#banner').hidden = false;
    $('#banner').innerHTML = `<div class="wrap">Data failed to load. Please try again shortly.</div>`;
    console.error(err);
  }
}
document.addEventListener('DOMContentLoaded', boot);
