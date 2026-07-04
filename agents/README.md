# Agentic OS

The automated data-operations layer for Bird Flu Tracker. Design & phasing live in
[`../docs/BLUEPRINT.md`](../docs/BLUEPRINT.md) §3.

**Core rule:** agents *propose* via pull requests; they never publish. The deterministic
`pipeline/build.mjs` stays the single publisher, and a human merges every agent PR.

## v0 — Assisted curation (`curate.mjs`)

The first agent. It reads official public bulletins (WHO Disease Outbreak News, WOAH/WAHIS,
CDC), asks the model to extract discrete avian-influenza events **grounded in the page text**
(each must carry a verbatim evidence quote), validates every candidate against the record
schema, drops duplicates, caps the batch, and appends the survivors to
`pipeline/curated.json`. The [`curate.yml`](../.github/workflows/curate.yml) workflow then
opens a **PR for you to review and merge**.

### Guardrails
- Only text-grounded events; the model must quote its evidence, and is told never to invent
  dates/subtypes/counts.
- `source_url` is forced to the bulletin page — never model-generated.
- Every record passes `makeRecord()` (geo + date + category validation) or is dropped.
- De-duplicated against existing curated + published records.
- Hard cap (`CURATE_MAX_NEW`, default 25) per run.
- Opens a PR only; **no auto-merge**, no writes to `site/data/*`.
- No API key → clean no-op (never fails the build).

### Enable it
1. Create an Anthropic API key.
2. Repo → **Settings → Secrets and variables → Actions** → add `ANTHROPIC_API_KEY`.
3. Repo → **Actions → "Assisted curation" → Run workflow** (or wait for the weekly run).
4. Review the opened PR — check each event against its source link and evidence quote — then
   merge. Vercel redeploys with the new records.

### Config (env)
- `ANTHROPIC_API_KEY` — required to run.
- `CURATE_MODEL` — default `claude-sonnet-5` (use `claude-haiku-4-5-20251001` to cut cost).
- `CURATE_MAX_NEW` — max new records per run (default 25).

### Roadmap (see blueprint)
- v1: source-discovery allowlist + normalization for new official feeds; geo-cache; anomaly issues.
- v2: cross-source auto-merge for high-confidence records; add provenance (`sources[]`, `confidence`).
