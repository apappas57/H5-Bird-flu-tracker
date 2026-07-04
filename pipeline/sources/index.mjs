// Registry of automated data sources.
//
// Each entry points at an AUTHORITATIVE page and adaptively extracts its
// embedded data file or table (see generic.mjs). URLs below are the official
// landing pages; if an agency changes its embedded data path, the collector
// still tries the on-page table and, failing that, the run falls back to the
// last committed data + the curated overlay so the site never goes blank.
//
// NOTE: these scrapers can only be exercised from an environment with outbound
// access to cdc.gov / aphis.usda.gov / agriculture.gov.au (i.e. GitHub Actions,
// not the restricted dev sandbox). See docs/DATA_SOURCES.md for the
// verification checklist to run after the first CI execution.
import { tabularSource } from './generic.mjs';

export const SOURCES = [
  // USDA APHIS is the authoritative US source (CDC merely republishes it) and
  // hosts direct CSVs at /sites/default/files/hpai-*.csv — confirmed live in CI.
  tabularSource({
    key: 'us-poultry',
    name: 'USDA APHIS — Poultry (commercial & backyard)',
    region: 'United States',
    category: 'poultry',
    country: 'United States',
    defaultSubtype: 'H5N1',       // current US HPAI panzootic; overridden if the feed has a subtype column
    defaultPathogenicity: 'HPAI',
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks',
    // Poultry data sits behind a Tableau dashboard (no embedded CSV on the page),
    // so try the likely direct-CSV names that match the other APHIS feeds.
    dataUrls: [
      'https://www.aphis.usda.gov/sites/default/files/hpai-commercial-backyard.csv',
      'https://www.aphis.usda.gov/sites/default/files/hpai-poultry.csv',
      'https://www.aphis.usda.gov/sites/default/files/hpai-commercial-and-backyard-flocks.csv',
      'https://www.aphis.usda.gov/sites/default/files/hpai-flocks.csv',
      'https://www.aphis.usda.gov/sites/default/files/hpai-commercial-backyard-flocks.csv',
    ],
    fields: {
      admin1: ['state'], locality: ['county'],
      date: ['outbreak date', 'confirmed', 'date'],
      count: ['flock size', 'birds', 'size', 'affected'],
      flock_type: ['flock type', 'production', 'type'],
    },
  }),
  tabularSource({
    key: 'us-wild-birds',
    name: 'USDA APHIS — Wild birds',
    region: 'United States',
    category: 'wild_bird',
    country: 'United States',
    defaultSubtype: 'H5N1',
    defaultPathogenicity: 'HPAI',
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/wild-birds',
    dataUrls: [
      'https://www.aphis.usda.gov/sites/default/files/hpai-wild-birds.csv',
    ],
    fields: {
      admin1: ['state'], locality: ['county'],
      date: ['collection', 'date'], species: ['species', 'bird'],
    },
  }),
  tabularSource({
    key: 'us-dairy',
    name: 'USDA APHIS — Dairy cattle / livestock',
    region: 'United States',
    category: 'dairy',
    country: 'United States',
    defaultSubtype: 'H5N1',
    defaultPathogenicity: 'HPAI',
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/livestock',
    dataUrls: [
      'https://www.aphis.usda.gov/sites/default/files/hpai-dairy-herds.csv',
      'https://www.aphis.usda.gov/sites/default/files/hpai-livestock.csv',
    ],
    fields: { admin1: ['state'], locality: ['county'], date: ['confirmed', 'date'] },
  }),
  tabularSource({
    key: 'us-mammals',
    name: 'USDA APHIS — Mammals',
    region: 'United States',
    category: 'mammal',
    country: 'United States',
    defaultSubtype: 'H5N1',
    defaultPathogenicity: 'HPAI',
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/mammals',
    dataUrls: [
      'https://www.aphis.usda.gov/sites/default/files/hpai-mammals.csv', // confirmed live
    ],
    fields: {
      admin1: ['state'], locality: ['county'],
      date: ['collection', 'date'], species: ['species'],
    },
  }),
  tabularSource({
    key: 'au-avian-influenza',
    name: 'Agriculture Victoria / DAFF — Australia avian influenza',
    region: 'Australia',
    category: 'poultry',
    country: 'Australia',
    homepage: 'https://www.agriculture.gov.au/biosecurity-trade/pests-diseases-weeds/animal/avian-influenza',
    // This page blocks automated fetches; fail fast and let the curated overlay
    // (WHO/agency bulletins) carry Australian events rather than slow every run.
    timeoutMs: 15000,
    retries: 0,
    fields: { admin1: ['state', 'region'], locality: ['location', 'property'], date: ['date'] },
  }),

  // ---- Phase 3: global deterministic coverage (multi-country, multi-host) ----
  // FAO EMPRES-i is the best global animal-disease event source. It carries a host
  // column, so `categoryFrom` maps each row to our host category. The exact
  // machine-readable export URL must be confirmed from a CI runner (the dev sandbox
  // can't reach FAO); until then this fails safe and the curated overlay carries
  // global events. WOAH/WAHIS needs a dedicated API client (its query API is POST-based)
  // — tracked as Phase 3b; see docs/DATA_SOURCES.md.
  tabularSource({
    key: 'fao-empres-global',
    name: 'FAO EMPRES-i — global avian influenza (all strains)',
    region: 'Global',
    category: 'wild_bird',            // fallback when a host column is absent
    categoryFrom: ['species type', 'host', 'animal type', 'species'],
    homepage: 'https://empres-i.apps.fao.org/',
    dataUrls: [
      'https://empres-i.apps.fao.org/api/v1/events?disease=Influenza%20-%20Avian&format=csv',
    ],
    fields: {
      country: ['country'], admin1: ['admin', 'region', 'province', 'state'],
      locality: ['locality', 'location'], date: ['observation date', 'reporting date', 'date'],
      subtype: ['serotype', 'subtype'], species: ['species'], count: ['cases', 'deaths', 'affected'],
    },
    defaultPathogenicity: 'HPAI',
    timeoutMs: 30000,
    retries: 1,
  }),
];

// Authoritative references for the curated overlay (see pipeline/curated.json).
export const CURATED_REFERENCES = [
  { name: 'WHO — Cumulative human cases of avian influenza A(H5N1)',
    url: 'https://www.who.int/publications/m/item/cumulative-number-of-confirmed-human-cases-for-avian-influenza-a(h5n1)-reported-to-who' },
  { name: 'WOAH/WAHIS — World Animal Health Information System',
    url: 'https://wahis.woah.org/' },
  { name: 'CDC — Global H5N1 human case summary',
    url: 'https://www.cdc.gov/bird-flu/spotlights/' },
  { name: 'Wildlife Health Australia — Avian influenza',
    url: 'https://wildlifehealthaustralia.com.au/Our-Work/Avian-Influenza' },
];
