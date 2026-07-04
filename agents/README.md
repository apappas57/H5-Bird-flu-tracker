# Agentic OS

The automated data-operations layer for Bird Flu Tracker. Design & phasing live in
[`../docs/BLUEPRINT.md`](../docs/BLUEPRINT.md) §3.

**Two rules:**
1. Agents *propose* via pull requests; they never publish. The deterministic
   `pipeline/build.mjs` stays the single publisher, and a human merges every agent PR.
2. **No paid API key / no metered billing.** Two tiers, both effectively free:
   - **Structured feeds → deterministic parsers** (`pipeline/sources/*`). No LLM, no cost.
   - **Unstructured bulletins → Claude Code on your existing subscription** — a scheduled
     Claude Code session does the research, not a per-token API key.

## v0 — Assisted curation (no API key)

The "intelligence" is a **Claude Code session** (scheduled as a Routine, or you just ask in a
session) that follows [`curation-task.md`](curation-task.md): it researches newly reported
avian-flu events with WebSearch, writes candidate rows to `agents/proposals.json`, and runs the
**deterministic guardrail script**:

```
node agents/curate.mjs agents/proposals.json
```

`curate.mjs` schema-validates every row, **forces a real `source_url`**, de-duplicates against
existing data, caps the batch (`CURATE_MAX_NEW`, default 25), and appends survivors to
`pipeline/curated.json` + writes `agents/out/summary.md`. The session then opens a **PR for you to
review and merge**. Vercel redeploys on merge.

### Why this is cheaper than an API key
The extraction runs on the Claude subscription you already pay a flat rate for — there's no
per-token Anthropic API bill and no `ANTHROPIC_API_KEY` secret to manage. The guardrails
(validation, provenance, dedupe, cap, PR-only) live in `curate.mjs`, so they hold no matter what
drove the proposals.

### Scheduling it
Set up a recurring Claude Code Routine whose prompt says *"follow agents/curation-task.md and open
a curation PR."* Manage/pause it like any Routine. Or just run it on demand by asking in a session.

### Roadmap (see blueprint)
- v1: source-discovery allowlist + normalization for new official feeds; geo-cache; anomaly issues.
- v2: cross-source auto-merge for high-confidence records; add provenance (`sources[]`, `confidence`).
