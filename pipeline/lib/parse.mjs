// Lightweight, dependency-free HTML/CSV helpers used by source modules.

/** Find absolute data-file URLs (.json/.csv/.xlsx) referenced anywhere in a page. */
export function findDataLinks(html, baseUrl) {
  const links = new Set();
  const re = /["'(]([^"'()\s]+?\.(?:json|csv|xlsx))(?:\?[^"'()\s]*)?["')]/gi;
  let m;
  while ((m = re.exec(html))) {
    try { links.add(new URL(m[1], baseUrl).href); } catch { /* ignore */ }
  }
  return [...links];
}

/** Parse simple CSV text into array of objects keyed by header row. */
export function parseCsv(text) {
  const rows = csvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length && r.some((c) => c !== '')).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

// RFC-4180-ish CSV tokenizer (handles quotes, embedded commas/newlines).
function csvRows(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Extract rows from the first HTML <table> whose header matches `wantHeaders`. */
export function htmlTable(html, wantHeaders = []) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[dh][\s\S]*?>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => stripTags(c[1])));
    if (rows.length < 2) continue;
    const headers = rows[0].map((h) => h.toLowerCase());
    if (wantHeaders.length && !wantHeaders.every((w) => headers.some((h) => h.includes(w)))) continue;
    return rows.slice(1).map((r) => {
      const o = {};
      rows[0].forEach((h, i) => { o[h.trim()] = (r[i] ?? '').trim(); });
      return o;
    });
  }
  return [];
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Coerce messy count strings like "1,234" or "12.3M" to an integer or null. */
export function toCount(v) {
  if (v == null) return null;
  const s = String(v).replace(/[, ]/g, '').trim();
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([kKmM])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]) n *= (/[kK]/.test(m[2]) ? 1e3 : 1e6);
  return Number.isFinite(n) ? Math.round(n) : null;
}
