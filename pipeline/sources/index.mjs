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
  tabularSource({
    key: 'us-poultry',
    name: 'CDC/USDA — Poultry (commercial & backyard)',
    region: 'United States',
    category: 'poultry',
    country: 'United States',
    homepage: 'https://www.cdc.gov/bird-flu/situation-summary/data-map-commercial.html',
    fields: {
      admin1: ['state'], locality: ['county'],
      date: ['outbreak date', 'confirmed', 'date'],
      count: ['flock size', 'birds', 'size', 'affected'],
      flock_type: ['flock type', 'production', 'type'],
    },
  }),
  tabularSource({
    key: 'us-wild-birds',
    name: 'CDC/USDA — Wild birds',
    region: 'United States',
    category: 'wild_bird',
    country: 'United States',
    homepage: 'https://www.cdc.gov/bird-flu/situation-summary/data-map-wild-birds.html',
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
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/hpai-confirmed-cases-livestock',
    fields: { admin1: ['state'], locality: ['county'], date: ['confirmed', 'date'] },
  }),
  tabularSource({
    key: 'us-mammals',
    name: 'USDA APHIS — Mammals',
    region: 'United States',
    category: 'mammal',
    country: 'United States',
    homepage: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/mammals',
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
    fields: { admin1: ['state', 'region'], locality: ['location', 'property'], date: ['date'] },
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
