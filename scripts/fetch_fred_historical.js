// scripts/fetch_fred_historical.js
// Builds data/fred_historical_cache.json with full history for all required FRED series.
// Output schema matches what index.html v7 expects:
//
// {
//   "generated_at": "...",
//   "series": {
//     "<ID>": {
//       "id": "<ID>",
//       "last_updated": "<ISO timestamp>",
//       "observations": [ { "date": "YYYY-MM-DD", "value": "<string>" }, ... ],
//       "value": <latest-number-or-null>
//     },
//     ...
//   }
// }

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const FRED_API_KEY = process.env.FRED_API_KEY;

// The series actually used in your v7 dashboard
const SERIES_IDS = [
  'T10Y3M',          // Yield curve 10y-3m
  'BAMLH0A0HYM2',   // HY OAS
  'NFCI',           // Chicago Fed financial conditions
  'UMCSENT',        // UMich sentiment
  'M2SL',           // M2 money stock (level; we convert to YoY in index)
  'INDPRO',         // Industrial Production (index; YoY in index)
  'PERMIT',         // Building permits
  'ICSA',           // Initial claims
  'SAHMREALTIME'    // Sahm Rule
];

if (!FRED_API_KEY) {
  console.error('ERROR: FRED_API_KEY environment variable is not set.');
  process.exit(1);
}

async function fetchSeriesObservations(seriesId) {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', FRED_API_KEY);
  url.searchParams.set('file_type', 'json');
  // Start far enough back for all series
  url.searchParams.set('observation_start', '1950-01-01');
  // For safety, allow a large limit
  url.searchParams.set('limit', '100000');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FRED HTTP ${res.status} for ${seriesId}`);
  }

  const json = await res.json();
  if (!json.observations || !Array.isArray(json.observations)) {
    throw new Error(`Unexpected response for ${seriesId}: no observations array`);
  }

  // FRED returns value as string; keep that, but also compute latest numeric value
  const observations = json.observations.map(o => ({
    date: o.date,
    value: o.value
  }));

  let latestNumeric = null;
  for (let i = observations.length - 1; i >= 0; i--) {
    const v = parseFloat(observations[i].value);
    if (Number.isFinite(v)) {
      latestNumeric = v;
      break;
    }
  }

  return {
    id: seriesId,
    last_updated: new Date().toISOString(),
    observations,
    value: latestNumeric
  };
}

async function main() {
  console.log('Fetching full historical FRED data for Crash Radar…');

  const out = {
    generated_at: new Date().toISOString(),
    series: {}
  };

  for (const id of SERIES_IDS) {
    try {
      console.log(`→ Fetching ${id} …`);
      const seriesData = await fetchSeriesObservations(id);
      out.series[id] = seriesData;
      console.log(`   OK ${id}: ${seriesData.observations.length} points, latest value = ${seriesData.value}`);
    } catch (err) {
      console.error(`   ERROR fetching ${id}:`, err.message);
    }
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outPath = path.join(dataDir, 'fred_historical_cache.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`Done. Wrote historical cache to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error in fetch_fred_historical.js:', err);
  process.exit(1);
});
