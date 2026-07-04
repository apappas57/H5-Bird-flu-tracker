#!/usr/bin/env node
// Curation validator/appender (Agentic OS v0) — NO paid API key.
//
// The "intelligence" (finding events, reading bulletins) is done by a Claude Code
// session on your existing subscription — see agents/curation-task.md. That session
// writes a proposals file (an array of raw record rows) and runs this script, which
// enforces the guardrails deterministically: schema-validate, force provenance,
// de-duplicate, cap, and append to pipeline/curated.json. A human still merges the PR.
//
// Usage:  node agents/curate.mjs <proposals.json>
// proposals.json = [ { category, country, admin1?, locality?, date, subtype?,
//                      pathogenicity?, count?, species?, source, source_url }, ... ]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeRecord } from '../pipeline/lib/schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CURATED = resolve(__dirname, '../pipeline/curated.json');
const DETECTIONS = resolve(__dirname, '../site/data/detections.json');
const OUT_DIR = resolve(__dirname, 'out');
const MAX_NEW = Number(process.env.CURATE_MAX_NEW || 25);

// Loose id ignores the trailing count segment so the same event reported with and
// without a figure is still caught as a duplicate.
const looseId = (id) => id.split('_').slice(0, -1).join('_');

function existingIds() {
  const full = new Set(), loose = new Set();
  const add = (id) => { full.add(id); loose.add(looseId(id)); };
  try {
    for (const r of JSON.parse(readFileSync(CURATED, 'utf8')).records || []) {
      const rec = makeRecord(r); if (rec) add(rec.id);
    }
  } catch { /* ignore */ }
  try {
    for (const r of JSON.parse(readFileSync(DETECTIONS, 'utf8'))) if (r?.id) add(r.id);
  } catch { /* ignore */ }
  return { full, loose };
}

// Write curated.json one record per line so agent PRs show minimal, reviewable diffs.
function writeCurated(doc) {
  const recs = (doc.records || []).map((r) => '    ' + JSON.stringify(r)).join(',\n');
  writeFileSync(CURATED, `{\n  "_comment": ${JSON.stringify(doc._comment || '')},\n  "records": [\n${recs}\n  ]\n}\n`);
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node agents/curate.mjs <proposals.json>'); process.exit(2); }

  let rows;
  try { rows = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')); }
  catch (e) { console.error(`cannot read proposals: ${e.message}`); process.exit(2); }
  if (!Array.isArray(rows)) { console.error('proposals must be a JSON array'); process.exit(2); }

  const seen = existingIds();
  const accepted = [], rejected = [], batch = new Set();
  for (const row of rows) {
    if (accepted.length >= MAX_NEW) { rejected.push({ row, reason: 'over cap' }); continue; }
    if (!row || !row.source_url) { rejected.push({ row, reason: 'missing source_url' }); continue; }
    const rec = makeRecord({ ...row, disease: row.disease || 'Avian influenza' });
    if (!rec) { rejected.push({ row, reason: 'failed schema validation (geo/date/category)' }); continue; }
    const lid = looseId(rec.id);
    if (seen.full.has(rec.id) || seen.loose.has(lid) || batch.has(lid)) {
      rejected.push({ row, reason: 'duplicate' }); continue;
    }
    batch.add(lid);
    accepted.push({ ...row, disease: row.disease || 'Avian influenza' });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  if (accepted.length) {
    const doc = JSON.parse(readFileSync(CURATED, 'utf8'));
    doc.records.push(...accepted);
    writeCurated(doc);
  }

  const summary = [`Assisted curation: **${accepted.length}** new record(s), ${rejected.length} rejected.\n`]
    .concat(accepted.map((r) => {
      const where = [r.locality, r.admin1, r.country].filter(Boolean).join(', ');
      return `- **${r.date} · ${r.category} · ${r.subtype || '?'}** — ${where} — [source](${r.source_url})`;
    }))
    .concat(rejected.length ? ['\n<details><summary>Rejected</summary>\n'].concat(
      rejected.map((x) => `- ${x.reason}: ${JSON.stringify(x.row).slice(0, 160)}`), ['</details>']) : [])
    .join('\n');
  writeFileSync(resolve(OUT_DIR, 'summary.md'), summary + '\n');
  console.log(`[curate] accepted ${accepted.length}, rejected ${rejected.length}. Wrote curated.json + agents/out/summary.md`);
}

main();
