// USDA APHIS wild-bird HPAI surveillance (United States).
//
// Enriches the US picture with real subtype (H5 / H7) and county-level points.
// This replaces the old CDC "data-map" pages, which CDC deprecated on
// 7 July 2025 (it stopped hosting USDA animal data), which is why the previous
// pipeline's US feeds returned HTTP 403.
//
// Public ArcGIS FeatureServer, no auth. The full layer is ~174k surveillance
// samples; we query only actual H5/H7 detections in the recent window.
import { getJson } from '../lib/http.mjs';
import { makeRecord } from '../lib/schema.mjs';

const LAYER = 'https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/VS_Avian_Influenza_Wild_Bird_Surveillance_Dashboard_data_view_feature_layer_/FeatureServer/0/query';
const HOMEPAGE = 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/wild-bird-surveillance-dashboard';
const PAGE = 1000;
const DAYS = 365;

const ymd = (d) => d.toISOString().slice(0, 10);
const isDetected = (v) => /^detected$/i.test(String(v || '').trim());

function subtypeOf(a) {
  if (isDetected(a.Final_H5)) return 'H5';
  if (isDetected(a.Final_H7)) return 'H7';
  return null;
}

export function usdaWildBirdSource(cfg = {}) {
  const name = cfg.name || 'USDA APHIS: wild birds';
  return {
    key: cfg.key || 'us-wild-birds',
    name,
    region: cfg.region || 'United States',
    homepage: HOMEPAGE,
    async collect() {
      const cutoff = ymd(new Date(Date.now() - DAYS * 86400000));
      const where = `(Final_H5='Detected' OR Final_H7='Detected') AND Date_Collected >= timestamp '${cutoff} 00:00:00'`;
      const feats = [];
      let offset = 0;
      for (let guard = 0; guard < 40; guard++) {
        const url = `${LAYER}?where=${encodeURIComponent(where)}`
          + `&outFields=*&returnGeometry=true&outSR=4326&f=json`
          + `&orderByFields=OBJECTID&resultRecordCount=${PAGE}&resultOffset=${offset}`;
        const j = await getJson(url, { timeoutMs: 60000, retries: 2 });
        const page = j.features || [];
        feats.push(...page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      const records = [];
      for (const f of feats) {
        const a = f.attributes || {};
        const geom = f.geometry || {};
        const rec = makeRecord({
          category: 'wild_bird',
          country: 'United States',
          admin1: a.State,
          locality: a.County || a.Watershed || null,
          lat: geom.y,
          lng: geom.x,
          date: a.Date_Collected ? new Date(a.Date_Collected).toISOString().slice(0, 10) : null,
          subtype: subtypeOf(a),
          uid: `usda-${a.OBJECTID}`,
          source: name,
          source_url: HOMEPAGE,
        });
        if (rec) records.push(rec);
      }
      return { records, note: `usda wild-bird: ${feats.length} features -> ${records.length} records (H5/H7, ${DAYS}d)` };
    },
  };
}
