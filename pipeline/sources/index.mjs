// Registry of automated data sources for the Australia-first tracker.
//
// Primary backbone: FAO EMPRES-i+ (free, no key, CSV with coordinates, includes
// Australia, near-real-time). It ingests WOAH/WAHIS notifications, so it already
// carries the Australian official events that the AU government sites publish
// only as un-scrapeable HTML/PDF.
//
//   - fao-au    : full Australian history (from 2024), all avian influenza.
//   - fao-world : recent global activity for context (excludes US wild birds,
//                 which the USDA source covers in higher resolution).
//   - us-wild-birds : USDA APHIS wild-bird HPAI detections with real subtype.
//
// Any source failing on a given day falls back to the last committed data plus
// the curated overlay (pipeline/curated.json), so the site never goes blank.
import { faoSource } from './fao-empresi.mjs';
import { usdaWildBirdSource } from './usda-wildbird.mjs';

export const SOURCES = [
  faoSource({
    key: 'fao-au',
    name: 'FAO EMPRES-i+: Australia (WOAH/WAHIS)',
    region: 'Australia',
    country: 'Australia',
    startDate: '2024-01-01',
  }),
  faoSource({
    key: 'fao-world',
    name: 'FAO EMPRES-i+: global context',
    region: 'Global',
    country: 'all',
    days: 90,
    excludeUsWildBird: true,
  }),
  usdaWildBirdSource({
    key: 'us-wild-birds',
    name: 'USDA APHIS: US wild birds',
    region: 'United States',
  }),
];

// Authoritative references for the curated overlay (see pipeline/curated.json)
// and shown on the page under "Data sources".
export const CURATED_REFERENCES = [
  { name: 'WOAH: Australia notifies first H5N1 in a wild bird (20 Jun 2026)',
    url: 'https://www.woah.org/en/australia-notifies-first-case-of-high-pathogenicity-avian-influenza-h5n1-in-a-wild-bird/' },
  { name: 'DAFF / outbreak.gov.au: national avian influenza situation',
    url: 'https://www.outbreak.gov.au/emerging-risks/high-pathogenicity-avian-influenza' },
  { name: 'Wildlife Health Australia: H5 bird flu',
    url: 'https://wildlifehealthaustralia.com.au/Resource-Centre/H5-bird-flu' },
  { name: 'WHO: cumulative human cases of avian influenza A(H5N1)',
    url: 'https://www.who.int/publications/m/item/cumulative-number-of-confirmed-human-cases-for-avian-influenza-a(h5n1)-reported-to-who' },
  { name: 'Our World in Data: H5N1 human cases',
    url: 'https://ourworldindata.org/grapher/h5n1-flu-reported-cases' },
];
