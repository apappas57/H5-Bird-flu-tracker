// Era classification: which real-world epidemiological event does a record belong to?
//
// WHY THIS FILE EXISTS
// -------------------
// On 30 July 2026 the news reported Victoria's FIRST H5N1 case. The tracker held
// fourteen Victorian records, so the site appeared to contradict the news. Both were
// right: those fourteen records are three unrelated events.
//
//   1. one current H5N1 clade 2.3.4.4b wild-bird detection (Portland, 30 July 2026)
//   2. twelve RESOLVED H7 poultry outbreaks from 2024 to 2025, a different subtype
//   3. one travel-acquired human case from May 2024, clade 2.3.2.1a, a different
//      lineage again
//
// Adding them together produces a number that is arithmetically correct and
// epidemiologically meaningless. Subtype and date already sat on every record, but the
// front end had to infer the grouping, and inference is where this kind of error is
// born. So the pipeline decides once, here, and stamps the answer onto the record.
//
// TWO DESIGN RULES
// ----------------
// * Every rule is written to fail AWAY from the current incursion. A record we cannot
//   place confidently becomes 'unclassified' rather than being swept into the live
//   count. Understating a live outbreak is visible and fixable; overstating one is a
//   false alarm on a public health page.
// * Nothing is inferred from prose. Only subtype, date, country, category and state,
//   all of which are already normalised by lib/schema.mjs.

/** Boundary: the current Australian incursion. */
const AU_INCURSION_FROM = '2026-06-01';
/** Boundary: the resolved Australian H7 poultry outbreaks. */
const AU_H7_FROM = '2024-05-01';
const AU_H7_TO = '2025-06-30';
/** Boundary: the clade 2.3.4.4b panzootic, conventionally dated from late 2021. */
const PANZOOTIC_FROM = '2021-10-01';

/** Subtype tokens that Australian and Commonwealth reporting uses for the current event. */
const H5_TOKENS = new Set(['H5', 'H5N1']);

/**
 * The era registry. `id` is what gets stamped onto each record; everything else is
 * published once in summary.json so the front end never hard-codes a label or a colour
 * decision.
 *
 * `current` is the single field that decides whether a record may be drawn in the
 * alarm colour. It is a boolean on purpose: the front end must not have to parse a
 * status string to answer "is this live".
 */
export const ERAS = [
  {
    id: 'au_h5n1_2026',
    scope: 'australia',
    current: true,
    status: 'ongoing',
    label: 'Current H5N1 incursion, clade 2.3.4.4b, from June 2026',
    short_label: 'Current H5N1 incursion',
    strain: 'H5N1 clade 2.3.4.4b',
    summary: 'The event this tracker follows. High pathogenicity H5N1 in Australian wild birds, first detected in June 2026 and still developing.',
    rule: 'country is Australia, subtype is H5 or H5N1, date on or after 2026-06-01.',
    justification: 'Australia\'s first H5N1 detection in a wild bird was notified to WOAH on 20 June 2026 (brown skua near Esperance, Western Australia). The 1 June boundary sits in the empty gap between the last H7 poultry event in this dataset (22 February 2025) and that first detection, so it cannot pull an earlier event in. H5 and H5N1 are both accepted because Australian official reporting uses them interchangeably for this event: the Commonwealth page is titled "H5 bird flu updates" and counts "confirmed or presumed positive" H5 detections, and Australia has had no other H5 avian influenza. Every category is eligible, not just wild birds, because a poultry or human case arising from this incursion would belong to it.',
  },
  {
    id: 'au_h7_poultry_2024_2025',
    scope: 'australia',
    current: false,
    status: 'resolved',
    label: 'Resolved H7 poultry outbreaks, 2024 to 2025',
    short_label: 'Resolved H7 poultry, 2024 to 2025',
    strain: 'H7 (H7N3, H7N8, H7N9)',
    summary: 'A different subtype in commercial poultry, unrelated to H5N1. These responses are finished and the sites were released. They are shown for historical completeness only.',
    rule: 'country is Australia, subtype begins with H7, category is poultry, date between 2024-05-01 and 2025-06-30.',
    justification: 'The outbreaks ran from May 2024 (Meredith, Victoria) and the most recent event in this dataset is 22 February 2025 (Euroa, Victoria). The window closes at 30 June 2025 so a late notification of the same event still lands here rather than in the current incursion. H7 is a different haemagglutinin subtype from H5: it is not the panzootic lineage, it did not arrive with migratory seabirds, and counting the two together is the specific error this classification exists to prevent.',
  },
  {
    id: 'au_human_2024',
    scope: 'australia',
    current: false,
    status: 'historical',
    label: 'Travel-acquired human case, 2024, a different lineage',
    short_label: 'Unrelated human case, 2024',
    strain: 'H5N1 clade 2.3.2.1a',
    summary: 'Australia\'s only human H5N1 case: acquired overseas in India in May 2024, clade 2.3.2.1a, and the person recovered. A different lineage from the clade 2.3.4.4b virus in Australian wild birds, and not part of the current event.',
    rule: 'country is Australia, category is human, date on or after 2024-01-01 and before 2026-06-01.',
    justification: 'Separated by date rather than by clade because clade is not a field on the record schema, only free-text species notes carry it, and parsing prose is exactly what this module refuses to do. The date rule is sufficient and safe: the current incursion rule is evaluated first, so any Australian human case dated from June 2026 onward is assigned to the incursion instead of here.',
  },
  {
    id: 'global_h5_panzootic',
    scope: 'global',
    current: true,
    status: 'ongoing',
    label: 'Global H5 clade 2.3.4.4b panzootic, from late 2021',
    short_label: 'Global H5 panzootic',
    strain: 'H5, largely H5N1 clade 2.3.4.4b',
    summary: 'The worldwide H5 panzootic outside Australia: wild birds, poultry, and mammals including United States dairy cattle. Context for the Australian event, not part of its count.',
    rule: 'country is not Australia, subtype is H5 or H5N1, date on or after 2021-10-01.',
    justification: 'Late 2021 is the conventional start of the clade 2.3.4.4b panzootic and is when the virus reached North America. Records typed only "H5" are included because that is how United States wild-bird surveillance reports a detection, and during this period an untyped H5 in that surveillance stream is overwhelmingly this lineage. This bucket is deliberately coarse: it is context, and no Australian figure is derived from it.',
  },
  {
    id: 'other_subtype',
    scope: 'any',
    current: false,
    status: 'other',
    label: 'Other avian influenza subtype',
    short_label: 'Other subtype',
    strain: 'not H5',
    summary: 'Detections of a subtype other than H5, for example H7 or H5N2 outside the cases handled above. A separate virus, listed so the record is not silently dropped.',
    rule: 'a subtype is stated, it is not H5 or H5N1, and no earlier rule matched.',
    justification: 'Catches North American H7 wild-bird detections and the 2024 Mexican H5N2 human case. Grouping them as "other subtype" is honest: they are real records of a different virus, and the alternative of leaving them unlabelled invites the reader to assume they belong to the H5 event.',
  },
  {
    id: 'pre_panzootic',
    scope: 'any',
    current: false,
    status: 'historical',
    label: 'Earlier event, before the clade 2.3.4.4b panzootic',
    short_label: 'Before 2021',
    strain: 'various',
    summary: 'An avian influenza event dated before October 2021, so before the clade 2.3.4.4b panzootic.',
    rule: 'date is before 2021-10-01 and no earlier rule matched.',
    justification: 'A structural bucket. The live feeds only reach back to 2024, so this is normally empty; it exists so that widening a source window can never quietly file a 2015 event as current.',
  },
  {
    id: 'subtype_unstated',
    scope: 'any',
    current: false,
    status: 'unknown',
    label: 'Subtype not published by the source',
    short_label: 'Subtype not published',
    strain: 'not stated',
    summary: 'The source published the event without a subtype. It cannot be attributed to a strain-defined event, so it is counted separately rather than assumed.',
    rule: 'subtype is null. Evaluated before every other rule.',
    justification: 'The largest single reason a record cannot be placed. FAO EMPRES-i reports a generic "Influenza - Avian" disease field, so many non-Australian events arrive untyped. Assuming H5 for those would inflate the panzootic; assuming they are Australian incursion cases would inflate the live count. Both are refused. Note the consequence and accept it deliberately: if the Australian subtype rules in pipeline/sources/fao-empresi.mjs ever stopped assigning H5N1, Australian detections would land here and the current count would fall rather than rise. Understating is the safe direction and it is loud in the build log.',
  },
  {
    id: 'unclassified',
    scope: 'any',
    current: false,
    status: 'unknown',
    label: 'Not classified',
    short_label: 'Not classified',
    strain: 'unknown',
    summary: 'No documented rule fits this record. It is never counted as part of the current incursion. A non-zero count here is a prompt to review the rules, not a data error to hide.',
    rule: 'nothing above matched.',
    justification: 'The honest fallback. Forcing a residual record into the nearest era is how a live outbreak count silently becomes wrong.',
  },
];

const ERA_BY_ID = new Map(ERAS.map((e) => [e.id, e]));

/** Era ids that describe the Australian record set, in display order. */
export const AU_ERA_ORDER = [
  'au_h5n1_2026',
  'au_h7_poultry_2024_2025',
  'au_human_2024',
  'other_subtype',
  'subtype_unstated',
  'pre_panzootic',
  'global_h5_panzootic',
  'unclassified',
];

/** The one era that may be drawn in the alarm colour on the Australian view. */
export const CURRENT_AU_ERA = 'au_h5n1_2026';

const isH5 = (s) => H5_TOKENS.has(s);
const isH7 = (s) => typeof s === 'string' && s.startsWith('H7');

/**
 * Classify one normalised record into exactly one era.
 *
 * Rules are evaluated in order and the first match wins. Order matters: the
 * subtype-unstated guard runs first so no strain-defined era can be assigned without a
 * stated strain, and the Australian incursion rule runs before the Australian human and
 * H7 rules so a future incursion-linked human or poultry case is filed as current.
 *
 * @param {object} r a record from lib/schema.mjs makeRecord()
 * @returns {{era: string, reason: string}} era id plus a short human-readable reason
 */
export function classifyEra(r) {
  if (!r || typeof r !== 'object') return { era: 'unclassified', reason: 'not a record' };
  const { subtype, date, country, category } = r;

  if (!subtype) {
    return { era: 'subtype_unstated', reason: 'the source published no subtype' };
  }
  if (!date) {
    return { era: 'unclassified', reason: 'no valid date' };
  }

  const au = country === 'Australia';

  if (au && isH5(subtype) && date >= AU_INCURSION_FROM) {
    return { era: 'au_h5n1_2026', reason: `Australian ${subtype} detection dated ${date}, on or after ${AU_INCURSION_FROM}` };
  }
  if (au && isH7(subtype) && category === 'poultry' && date >= AU_H7_FROM && date <= AU_H7_TO) {
    return { era: 'au_h7_poultry_2024_2025', reason: `Australian ${subtype} poultry event dated ${date}, inside the ${AU_H7_FROM} to ${AU_H7_TO} outbreak window` };
  }
  if (au && category === 'human' && date >= '2024-01-01' && date < AU_INCURSION_FROM) {
    return { era: 'au_human_2024', reason: `Australian human case dated ${date}, before the 2026 incursion` };
  }
  if (date < PANZOOTIC_FROM) {
    return { era: 'pre_panzootic', reason: `dated ${date}, before the panzootic boundary ${PANZOOTIC_FROM}` };
  }
  if (!au && isH5(subtype)) {
    return { era: 'global_h5_panzootic', reason: `non-Australian ${subtype} detection dated ${date}` };
  }
  if (!isH5(subtype)) {
    return { era: 'other_subtype', reason: `subtype ${subtype} is not H5` };
  }
  return {
    era: 'unclassified',
    reason: `${country} ${subtype} ${category} dated ${date} matches no documented rule`,
  };
}

/**
 * Stamp `era` and `era_current` onto every record, in place.
 *
 * `era_current` is duplicated onto the record rather than left to a lookup because it is
 * the field that decides alarm colour versus grey on the map, and that decision must be
 * impossible to get wrong by forgetting a join.
 *
 * @param {object[]} records
 * @returns {{counts: Record<string, number>, unclassified: object[]}}
 */
export function stampEras(records) {
  const counts = {};
  const unclassified = [];
  for (const r of records) {
    const { era, reason } = classifyEra(r);
    r.era = era;
    r.era_current = ERA_BY_ID.get(era)?.current === true;
    counts[era] = (counts[era] || 0) + 1;
    if (era === 'unclassified') unclassified.push({ id: r.id, reason });
  }
  return { counts, unclassified };
}

/** Era definitions, published in summary.json so the front end holds no copy of them. */
export function eraDefinitions() {
  return ERAS.map((e) => ({ ...e }));
}

/**
 * Count phrases, per era. The front end must be able to write a truthful sentence
 * without doing arithmetic or choosing wording, because the wording is the fix: "14
 * detections in Victoria" is the bug, and "1 current H5N1 detection. 12 resolved H7
 * poultry outbreaks, 2024 to 2025. 1 unrelated travel-acquired human case, 2024." is
 * the correction.
 */
function phraseFor(eraId, n) {
  const one = n === 1;
  switch (eraId) {
    case 'au_h5n1_2026':
      return `${n} current H5N1 detection${one ? '' : 's'}`;
    case 'au_h7_poultry_2024_2025':
      return `${n} resolved H7 poultry outbreak${one ? '' : 's'}, 2024 to 2025`;
    case 'au_human_2024':
      return `${n} unrelated travel-acquired human case${one ? '' : 's'}, 2024`;
    case 'global_h5_panzootic':
      return `${n} H5 detection${one ? '' : 's'} in the global panzootic`;
    case 'other_subtype':
      return `${n} detection${one ? '' : 's'} of another subtype`;
    case 'pre_panzootic':
      return `${n} earlier event${one ? '' : 's'}, before October 2021`;
    case 'subtype_unstated':
      return `${n} record${one ? '' : 's'} with no published subtype`;
    default:
      return `${n} unclassified record${one ? '' : 's'}`;
  }
}

function emptyBucket() {
  return {
    records: 0,
    categories: {},
    confidence: { confirmed: 0, presumptive: 0, unstated: 0 },
    first_date: null,
    last_date: null,
    states: {},
  };
}

function addTo(bucket, r) {
  bucket.records++;
  bucket.categories[r.category] = (bucket.categories[r.category] || 0) + 1;
  const c = r.confidence === 'confirmed' ? 'confirmed' : r.confidence === 'presumptive' ? 'presumptive' : 'unstated';
  bucket.confidence[c]++;
  if (!bucket.first_date || r.date < bucket.first_date) bucket.first_date = r.date;
  if (!bucket.last_date || r.date > bucket.last_date) bucket.last_date = r.date;
  if (r.admin1) bucket.states[r.admin1] = (bucket.states[r.admin1] || 0) + 1;
}

function finish(eraId, bucket) {
  const def = ERA_BY_ID.get(eraId);
  return {
    era: eraId,
    label: def?.label || eraId,
    short_label: def?.short_label || eraId,
    strain: def?.strain || null,
    status: def?.status || 'unknown',
    current: def?.current === true,
    records: bucket.records,
    phrase: phraseFor(eraId, bucket.records),
    categories: bucket.categories,
    confidence: bucket.confidence,
    first_date: bucket.first_date,
    last_date: bucket.last_date,
  };
}

const sortEras = (a, b) => AU_ERA_ORDER.indexOf(a) - AU_ERA_ORDER.indexOf(b);

/**
 * Per-state and national Australian counts, broken down by era.
 *
 * Deliberate omission: there is no `total` on a state. A single undifferentiated
 * Victorian figure of 14 is the exact bug this block exists to make impossible, so the
 * shape does not offer one to reach for. What a caller gets instead is `eras` (an
 * ordered breakdown), `current_records` (the live count, and the only figure the alarm
 * colour may be spent on), `historical_records`, and `sentence` (the whole split, ready
 * to print).
 *
 * @param {object[]} records all records, already stamped by stampEras()
 * @returns {object} the au_eras block
 */
export function australianEraBreakdown(records) {
  const au = records.filter((r) => r.country === 'Australia');

  const national = new Map();
  const perState = new Map();
  const stateCodes = new Map();

  for (const r of au) {
    const era = r.era || 'unclassified';
    if (!national.has(era)) national.set(era, emptyBucket());
    addTo(national.get(era), r);

    const state = r.admin1 || 'Location not stated';
    if (r.admin1 && r.admin1_code) stateCodes.set(state, r.admin1_code);
    if (!perState.has(state)) perState.set(state, new Map());
    const buckets = perState.get(state);
    if (!buckets.has(era)) buckets.set(era, emptyBucket());
    addTo(buckets.get(era), r);
  }

  const nationalList = [...national.keys()].sort(sortEras).map((id) => {
    const out = finish(id, national.get(id));
    out.state_counts = national.get(id).states;
    out.states = Object.keys(national.get(id).states).length;
    return out;
  });

  const byState = {};
  for (const [state, buckets] of perState) {
    const eras = [...buckets.keys()].sort(sortEras).map((id) => finish(id, buckets.get(id)));
    const current = eras.filter((e) => e.current).reduce((n, e) => n + e.records, 0);
    const historical = eras.filter((e) => !e.current).reduce((n, e) => n + e.records, 0);
    byState[state] = {
      state,
      state_code: stateCodes.get(state) || null,
      eras,
      current_records: current,
      historical_records: historical,
      // One line that states the split. Reads "1 current H5N1 detection. 12 resolved H7
      // poultry outbreaks, 2024 to 2025. 1 unrelated travel-acquired human case, 2024."
      sentence: `${eras.map((e) => e.phrase).join('. ')}.`,
    };
  }

  // States ordered by live count first, so the map legend and any list lead with where
  // the current incursion actually is rather than where the resolved outbreaks were.
  const stateOrder = Object.keys(byState).sort((a, b) => {
    const d = byState[b].current_records - byState[a].current_records;
    return d !== 0 ? d : a.localeCompare(b);
  });

  const currentNational = nationalList.find((e) => e.era === CURRENT_AU_ERA);

  return {
    current_era: CURRENT_AU_ERA,
    // The only Australian figure that describes the live event.
    current_records: currentNational ? currentNational.records : 0,
    current_states: currentNational ? currentNational.states : 0,
    current_state_list: currentNational ? Object.keys(currentNational.state_counts) : [],
    national: nationalList,
    by_state: byState,
    state_order: stateOrder,
    note: 'Australian records grouped by the real-world event they belong to. There is intentionally no combined per-state total: the three Victorian groups below are a current H5N1 detection, resolved 2024 to 2025 H7 poultry outbreaks of a different subtype, and one unrelated travel-acquired human case of a different lineage. Adding them together produces a number that means nothing. Only records whose era is marked current describe the live outbreak.',
  };
}

/** Whole-dataset era counts, for the global and United States views. */
export function eraCounts(records) {
  const counts = {};
  for (const r of records) counts[r.era || 'unclassified'] = (counts[r.era || 'unclassified'] || 0) + 1;
  const ordered = {};
  for (const id of ERAS.map((e) => e.id)) if (counts[id]) ordered[id] = counts[id];
  for (const [k, v] of Object.entries(counts)) if (!(k in ordered)) ordered[k] = v;
  return ordered;
}
