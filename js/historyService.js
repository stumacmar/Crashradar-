// ============================================================================
// historyService.js
// Full historical series loader (clean, modern, no conflicts)
// ============================================================================
//
// Purpose:
//   Provide *optional* access to historical series for any indicator,
//   pulling only from fred_historical_cache.json.
//
//   This does NOT override dataService.js and does NOT interfere with app.js.
//   app.js does NOT import from here unless YOU explicitly choose to.
// ============================================================================

import { INDICATOR_CONFIG } from './config.js';

// Path to your GitHub Pages historical cache
const HIST_CACHE_URL = './data/fred_historical_cache.json';

// Internal cache so repeated calls don't re-fetch
let histCache = null;

// ============================================================================
// Load the entire historical cache file
// ============================================================================
async function loadHistoricalCache() {
  if (histCache) return histCache;

  const res = await fetch(HIST_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`historyService: Failed to load fred_historical_cache.json`);
  }

  histCache = await res.json();
  return histCache;
}

// ============================================================================
// Utility — clean a raw series: convert to structure of {date, value}
// ============================================================================
function normaliseSeries(observations) {
  if (!Array.isArray(observations)) return [];

  return observations
    .map(o => {
      const v = Number(o.value);
      return {
        date: o.date,
        value: Number.isFinite(v) ? v : null
      };
    })
    .filter(x => x.value !== null);
}

// ============================================================================
// Get historical data by FRED ID (direct)
// ============================================================================
export async function getHistoricalSeriesById(fredId) {
  const cache = await loadHistoricalCache();
  const s = cache.series?.[fredId];

  if (!s || !s.observations) return [];

  return normaliseSeries(s.observations);
}

// ============================================================================
// Get historical series for a config entry:
// e.g., cfg = INDICATOR_CONFIG.YIELD_CURVE
// ============================================================================
export async function getHistoricalSeries(cfg) {
  if (!cfg) return [];

  // If indicator is not from FRED → no history available
  if (!cfg.fromFred) return [];

  const fredId = cfg.fredId;
  if (!fredId) return [];

  return getHistoricalSeriesById(fredId);
}

// ============================================================================
// Optional diagnostic: list all available series
// ============================================================================
export async function listHistoricalSeries() {
  const cache = await loadHistoricalCache();
  return Object.keys(cache.series ?? {});
}

// ============================================================================
// End of file
// ============================================================================
