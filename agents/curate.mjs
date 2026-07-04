#!/usr/bin/env node
// Assisted-curation agent (Agentic OS v0).
// Reads official avian-influenza bulletins, uses the model to extract discrete
// events grounded in the text, validates each against the record schema, dedupes
// against what we already have, and appends candidates to pipeline/curated.json.
// It NEVER publishes: a GitHub Action opens a PR with the diff for human review.
//
// Guardrails: only text-grounded events (model must quote evidence); source_url is
// forced to the bulletin page (not model-generated); every record is schema-validated;
// duplicates are dropped; a hard cap limits blast radius; no key -> clean no-op.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getText } from '../pipeline/lib/http.mjs';
import { makeRecord } from '../pipeline/lib/schema.mjs';
import { extractWithTool } from './lib/anthropic.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CURATED = resolve(__dirname, '../pipeline/curated.json');
const DETECTIONS = resolve(__dirname, '../site/data/detections.json');
const OUT_DIR = resolve(__dirname, 'out');

const MODEL = process.env.CURATE_MODEL || 'claude-sonnet-5';
const MAX_NEW = Number(process.env.CURATE_MAX_NEW || 25);

// Official, public bulletin pages to curate from. Add more over time.
const SOURCES = [
  { name: 'WHO Disease Outbreak News', url: 'https://www.who.int/emergencies/disease-outbreak-news' },
  { name: 'WOAH / WAHIS', url: 'https://wahis.woah.org/' },
  { name: 'CDC Bird Flu spotlights', url: 'https://www.cdc.gov/bird-flu/spotlights/' },
];

const TOOL = {
  name: 'report_avian_flu_events',
  description: 'Report discrete avian influenza (bird flu) events found ONLY in the provided text. Do not infer, guess, or add events the text does not explicitly support. Omit any field you are unsure about. Never invent dates or numbers.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['human', 'poultry', 'dairy', 'wild_bird', 'mammal'], description: 'the HOST affected' },
            country: { type: 'string' },
            admin1: { type: 'string', description: 'state/province/region if stated' },
            locality: { type: 'string', description: 'county/city if stated' },
            date: { type: 'string', description: 'reported/confirmation date as YYYY-MM-DD' },
            subtype: { type: 'string', description: 'e.g. H5N1, H7N8 — only if explicitly stated' },
            pathogenicity: { type: 'string', enum: ['HPAI', 'LPAI'] },
            count: { type: 'number', description: 'animals/birds affected, only if a number is stated' },
            species: { type: 'string' },
            evidence: { type: 'string', description: 'short verbatim quote from the text supporting this exact event' },
          },
          required: ['category', 'country', 'date', 'evidence'],
        },
      },
    },
    required: ['events'],
  },
};

const SYSTEM = `You extract structured avian-influenza surveillance events from official public-health/animal-health bulletins for a public tracker. Rules:
- Extract ONLY events explicitly described in the provided text. If the text is a navigation/index page with no concrete events, return an empty list.
- Every event MUST include a short verbatim "evidence" quote from the text.
- Never fabricate or approximate dates, subtypes, or counts. Omit fields the text does not state.
- Prefer the most specific location and the reported/confirmation date.
- One event per distinct detection/outbreak/human case.`;

const stripHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();

function existingIds() {
  const ids = new Set();
  const add = (rows, isCurated) => {
    for (const r of rows) {
      const rec = isCurated ? makeRecord(r) : r;
      if (rec && rec.id) ids.add(rec.id);
    }
  };
  try { add(JSON.parse(readFileSync(CURATED, 'utf8')).records || [], true); } catch { /* ignore */ }
  try { add(JSON.parse(readFileSync(DETECTIONS, 'utf8')), false); } catch { /* ignore */ }
  return ids;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[curate] ANTHROPIC_API_KEY not set — skipping (add it as a repo secret to enable). No changes made.');
    return;
  }
  const seen = existingIds();
  const proposals = [];
  const runIds = new Set();

  for (const src of SOURCES) {
    let text;
    try { text = stripHtml(await getText(src.url, { timeoutMs: 30000, retries: 1 })).slice(0, 16000); }
    catch (e) { console.log(`[curate] fetch failed ${src.name}: ${e.message}`); continue; }
    if (text.length < 200) { console.log(`[curate] ${src.name}: too little text, skipping`); continue; }

    let out;
    try {
      out = await extractWithTool({
        model: MODEL, system: SYSTEM, tool: TOOL,
        prompt: `SOURCE: ${src.name} (${src.url})\n\nTEXT:\n${text}\n\nExtract the avian influenza events.`,
      });
    } catch (e) { console.log(`[curate] model error ${src.name}: ${e.message}`); continue; }

    for (const ev of (out?.events || [])) {
      const raw = {
        category: ev.category, country: ev.country, admin1: ev.admin1, locality: ev.locality,
        date: ev.date, subtype: ev.subtype, pathogenicity: ev.pathogenicity,
        count: ev.count, species: ev.species,
        disease: 'Avian influenza',
        source: `${src.name} (assisted curation)`,
        source_url: src.url,   // forced to the bulletin page — never model-generated
      };
      const rec = makeRecord(raw);            // schema validation (geo + date + category)
      if (!rec) continue;
      if (seen.has(rec.id) || runIds.has(rec.id)) continue;
      runIds.add(rec.id);
      proposals.push({ raw, evidence: String(ev.evidence || '').slice(0, 300), id: rec.id });
      if (proposals.length >= MAX_NEW) break;
    }
    if (proposals.length >= MAX_NEW) break;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  if (!proposals.length) {
    console.log('[curate] no new events found.');
    writeFileSync(resolve(OUT_DIR, 'summary.md'), 'Assisted curation run found **no new events**.\n');
    return;
  }

  // append to curated.json (human reviews the PR before it publishes)
  const doc = JSON.parse(readFileSync(CURATED, 'utf8'));
  doc.records.push(...proposals.map((p) => p.raw));
  writeFileSync(CURATED, JSON.stringify(doc, null, 2) + '\n');

  const body = [`Assisted curation proposes **${proposals.length}** new record(s) for review:\n`]
    .concat(proposals.map((p) => {
      const r = p.raw;
      const where = [r.locality, r.admin1, r.country].filter(Boolean).join(', ');
      return `- **${r.date} · ${r.category} · ${r.subtype || '?'}** — ${where}\n  - source: ${r.source_url}\n  - evidence: “${p.evidence}”`;
    }))
    .join('\n');
  writeFileSync(resolve(OUT_DIR, 'summary.md'), body + '\n');
  console.log(`[curate] proposed ${proposals.length} new record(s); wrote curated.json + out/summary.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
