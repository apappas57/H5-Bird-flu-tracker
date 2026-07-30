// Reconcile the hand-curated overlay against the automated feeds for Australia.
//
// Why this exists: pipeline/curated.json warns in its own comment that Australian
// animal detections must NOT be curated there, because FAO EMPRES-i will later carry
// the same event and the tracker would double-count. That rule has to bend when an
// Australian first-of-state detection is announced, because EMPRES-i ingests
// WOAH/WAHIS notifications and lags them by roughly 14 days: on 30 July 2026 the
// Commonwealth was reporting 28 detections across 4 states while the FAO-only
// pipeline showed 16 across 3, and Agriculture Victoria's first Victorian detection
// (greater crested tern, Portland, announced 30 July 2026) would not have appeared
// for a fortnight.
//
// dedupe() in lib/schema.mjs cannot catch the eventual overlap: it keys on id, and a
// curated record's composite id can never equal a FAO record's `fao-<global_id>` id.
// So this module matches on the real-world event instead: category, state, a date
// window, and a locality or species signal. When a pipeline source starts carrying an
// event, the curated copy is dropped and the pipeline copy is kept, because the
// pipeline copy is the one that keeps being maintained automatically.
//
// THE TRADE-OFF, stated once and applied everywhere below: this is a public health
// count. Dropping a genuinely distinct detection understates an outbreak, which is
// worse than briefly showing one duplicate that a human can spot and fix. Every rule
// here therefore fails toward KEEPING both records whenever the signal is weak, and
// nothing is ever dropped silently: the caller gets a note to log.

// Only these curated records are ever eligible to be dropped.
//   - human is excluded because the curated human cases are deliberately curated
//     (EMPRES-i human data is unreliable, see the curated.json comment) and must
//     survive regardless of what the feeds say;
//   - poultry and dairy are excluded because nothing curates them for Australia;
//   - non-Australian records are excluded because this lag problem is Australia-only
//     and the global layer is a 90-day context window, not a reconciled history.
const RECONCILABLE_CATEGORIES = new Set(['wild_bird', 'mammal']);

// Fields a curated record may pass to the pipeline record that supersedes it, and
// only where the pipeline record leaves them empty. Kept to things an official
// announcement establishes and a bulk feed does not publish:
//   confidence  whether an authority called the result confirmed or presumptive
//   source_url  the specific announcement, versus the feed's generic homepage
// Do NOT add coordinates, dates, species or counts here. Those are exactly the
// fields the automated feed is better at, and inheriting them would let a
// hand-typed value outlive the source it was standing in for.
const INHERITED_FROM_CURATED = ['confidence', 'source_url'];

// Date window, asymmetric on purpose.
//
// FAO carries observation_date, the day the bird was sampled. A curated record carries
// the official announcement date, which lands after lab work: Victoria's tern was
// reported by a member of the public on 27 or 28 July 2026 and announced on 30 July,
// and ACDP confirmation can add more days on top. So a pipeline record up to 14 days
// BEFORE the announcement is plausibly the same event, which also matches the observed
// EMPRES-i publication lag.
//
// Forward tolerance stays small. A pipeline observation dated after an announcement
// usually means a later, separate bird. Detections days apart at the same beach are
// distinct events in this outbreak (both SA and WA produced runs of them), so widening
// either bound would start deleting real detections. Too tight fails to dedupe, which
// costs one visible duplicate; too loose deletes a real case, which corrupts the count.
const WINDOW_DAYS_BEFORE = 14;
const WINDOW_DAYS_AFTER = 3;

// Species words that carry no discriminating signal here. Every Australian detection to
// date is a wild seabird in a coastal location, so matching on these would make any two
// records look like one event.
const GENERIC_SPECIES_WORDS = new Set([
  'wild', 'domestic', 'captive', 'bird', 'birds', 'seabird', 'seabirds', 'avian',
  'influenza', 'unspecified', 'unknown', 'species', 'spp', 'other', 'marine', 'sea',
  'coastal', 'first', 'presumptive', 'confirmed',
]);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

/** Whole days from date a to date b (negative when b is earlier). Null if unparseable. */
function dayDelta(a, b) {
  const ta = Date.parse(String(a || '').slice(0, 10));
  const tb = Date.parse(String(b || '').slice(0, 10));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

/** Is this a record we are allowed to reconcile at all (Australian animal detection)? */
function isReconcilableAu(r) {
  if (!r) return false;
  const isAu = r.country_code === 'AU' || r.country === 'Australia';
  return isAu && RECONCILABLE_CATEGORIES.has(r.category);
}

/**
 * Do two locality strings plausibly name one place?
 * Token-subset rather than substring: FAO localities are often a longer form of the
 * official place name ("Portland" vs "Portland Bay"), but raw substring matching would
 * also fire on unrelated names that share a prefix. At least one shared token must be
 * long enough that the overlap is not accidental.
 */
function localityMatch(a, b) {
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const longSet = new Set(long);
  if (!short.every((w) => longSet.has(w))) return false;
  return short.some((w) => w.length >= 4);
}

/**
 * Do two species strings share a distinctive word?
 * This is the weakest signal we accept, used only when one side has no locality at all.
 * "Greater crested tern" and "Crested tern (Thalasseus bergii)" share "crested" and
 * "tern"; a tern and a petrel share nothing.
 */
function speciesSignal(a, b) {
  const sa = words(a).filter((w) => w.length >= 4 && !GENERIC_SPECIES_WORDS.has(w));
  const sb = new Set(words(b).filter((w) => w.length >= 4 && !GENERIC_SPECIES_WORDS.has(w)));
  if (!sa.length || !sb.size) return false;
  return sa.some((w) => sb.has(w));
}

/** Would these two records be the same real-world detection reported twice? */
function sameEvent(cur, pipe) {
  if (cur.category !== pipe.category) return false;

  // State must be known on both sides and equal. An unknown state is not a match, it is
  // missing evidence, so both records stay.
  const s1 = cur.admin1_code || cur.admin1;
  const s2 = pipe.admin1_code || pipe.admin1;
  if (!s1 || !s2 || norm(s1) !== norm(s2)) return false;

  const delta = dayDelta(cur.date, pipe.date);
  if (delta === null || delta > WINDOW_DAYS_AFTER || delta < -WINDOW_DAYS_BEFORE) return false;

  // Two different named subtypes are two different events, never one reported twice.
  // A null subtype on either side is unknown, not a mismatch.
  if (cur.subtype && pipe.subtype && cur.subtype !== pipe.subtype) return false;

  // Locality is the strongest discriminator available. If both sides name a place and
  // the places differ, treat them as distinct detections even when everything else
  // lines up: same-state, different-beach detections are the normal pattern here, so a
  // species match must not be allowed to override a locality mismatch.
  if (cur.locality && pipe.locality) return localityMatch(cur.locality, pipe.locality);

  // Only one side names a place, so fall back to the species signal. Nothing weaker
  // than this is ever enough to drop a record.
  return speciesSignal(cur.species, pipe.species);
}

/**
 * Remove curated Australian animal records that an automated source now carries.
 *
 * Human records and non-Australian records are never dropped. Only the curated copy is
 * ever removed: pipeline records are returned untouched, because they are the ones the
 * daily build keeps refreshing.
 *
 * @param {object[]} curated  normalised records from the curated overlay
 * @param {object[]} pipeline normalised records from the automated sources
 * @returns {{records: object[], dropped: object[], note: string}}
 *   records: kept curated records followed by every pipeline record, ready for dedupe().
 *   dropped: one plain descriptor per removed curated record, for logging or auditing.
 *   note: one short line naming what was dropped and what superseded it. A silent drop
 *         on a public health count is unacceptable, so the caller must log this.
 */
export function reconcileAustralianCurated(curated = [], pipeline = []) {
  const curatedList = (Array.isArray(curated) ? curated : []).filter(Boolean);
  const pipelineList = (Array.isArray(pipeline) ? pipeline : []).filter(Boolean);
  const candidates = pipelineList.filter(isReconcilableAu);

  // One pipeline record can supersede at most one curated record, so two curated
  // detections never collapse into a single feed row.
  const claimed = new Set();
  const kept = [];
  const dropped = [];

  for (const rec of curatedList) {
    if (!isReconcilableAu(rec)) { kept.push(rec); continue; }

    // Closest date wins among the plausible matches; ties keep feed order.
    let best = null, bestGap = Infinity;
    for (const pipe of candidates) {
      if (claimed.has(pipe.id)) continue;
      if (!sameEvent(rec, pipe)) continue;
      const gap = Math.abs(dayDelta(rec.date, pipe.date) ?? Infinity);
      if (gap < bestGap) { best = pipe; bestGap = gap; }
    }

    if (!best) { kept.push(rec); continue; }
    claimed.add(best.id);

    // Carry hand-verified metadata across before the curated copy is dropped.
    //
    // This exists because of a real regression, observed on 31 July 2026. Victoria's
    // first detection was curated on 30 July with confidence 'presumptive', because
    // Agriculture Victoria announced it while confirmatory sequencing at CSIRO ACDP
    // was still under way. Overnight, FAO caught up and carried the same event, so
    // this function correctly superseded the curated copy. But the FAO record has no
    // confidence field, so the site silently went from "presumptive, confirmatory
    // testing under way" to stating no status at all, with nothing having actually
    // changed about the case. The rendered caveat still said the record was shown as
    // presumptive, so the page then contradicted its own data.
    //
    // Only fields the pipeline record does not itself provide are inherited, so the
    // automated feed always wins where it has an opinion. This is deliberately NOT a
    // general merge: it is limited to fields an official announcement can establish
    // and a bulk feed does not publish. Inclusion in the Commonwealth tally is not
    // evidence of confirmation either, because that tally counts confirmed and
    // presumed positive detections together, so nothing here may quietly upgrade a
    // presumptive record to confirmed.
    const inherited = [];
    for (const field of INHERITED_FROM_CURATED) {
      if (rec[field] != null && best[field] == null) {
        best[field] = rec[field];
        inherited.push(field);
      }
    }

    dropped.push({
      id: rec.id,
      category: rec.category,
      admin1: rec.admin1 || null,
      locality: rec.locality || null,
      date: rec.date,
      matched_id: best.id,
      matched_date: best.date,
      matched_source: best.source,
      inherited,
    });
  }

  const note = dropped.length
    ? `superseded ${dropped.length} curated AU record(s): ` + dropped.map((d) =>
        `${d.category} ${d.admin1 || 'unknown state'} ${d.locality || 'unnamed locality'} `
        + `${d.date} -> ${d.matched_source} ${d.matched_date}`).join('; ')
    : 'no curated AU records superseded';

  return { records: [...kept, ...pipelineList], dropped, note };
}
