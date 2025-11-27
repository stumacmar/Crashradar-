// ============================================================================
// dataService.js
// Unified FRED cache loader + historical loader compatible with app.js
// ============================================================================

import { INDICATOR_CONFIG } from './config.js';

// Paths for GitHub Pages
const FRED_CACHE_URL = './data/fred_cache.json';
const FRED_HIST_URL  = './data/fred_historical_cache.json';

// In-memory cache (prevents repeated network hits)
let fredCache = null;
let fredHistCache = null;

// ============================================================================
// Load fred_cache.json (current values only)
// ============================================================================
export async function loadFredCache() {
  if (fredCache) return fredCache;

  const res = await fetch(FRED_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load fred_cache.json`);

  fredCache = await res.json();
  return fredCache;
}

// ============================================================================
// Load fred_historical_cache.json (full time series)
// ============================================================================
async function loadFredHistoricalCache() {
  if (fredHistCache) return fredHistCache;

  const res = await fetch(FRED_HIST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load fred_historical_cache.json`);

  fredHistCache = await res.json();
  return fredHistCache;
}

// ============================================================================
// Extract the most recent numeric value from a FRED series
// ============================================================================
function getLatestNumericValue(series) {
  if (!series?.observations?.length) return null;

  const obs = series.observations;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = Number(obs[i].value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// ============================================================================
// NEW — loadCurrentIndicatorValues()
// Required by app.js
// Reads fred_cache.json and maps values to indicator keys
// ============================================================================
export async function loadCurrentIndicatorValues() {
  const cache = await loadFredCache();
  const valuesByKey = {};
  const now = Date.now();

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    if (!cfg.fromFred) {
      valuesByKey[key] = null;
      continue;
    }

    const series = cache[cfg.seriesId];
    if (!series) {
      valuesByKey[key] = null;
      continue;
    }

    valuesByKey[key] = getLatestNumericValue(series);
  }

  // Cache metadata
  const generatedAt = cache.generatedAt || null;
  let cacheAgeDays = null;

  if (generatedAt) {
    cacheAgeDays = Math.round(
      (now - new Date(generatedAt).getTime()) / 86400000
    );
  }

  return {
    valuesByKey,
    cacheMeta: {
      generatedAt,
      cacheAgeDays,
    }
  };
}

// ============================================================================
// NEW — loadProcessedHistory(cfg)
// Required by app.js
// Returns array: [{date, value}, ...]
// ============================================================================
export async function loadProcessedHistory(cfg) {
  const hist = await loadFredHistoricalCache();
  const series = hist[cfg.seriesId];

  if (!series || !series.observations) return [];

  const out = [];

  for (const row of series.observations) {
    const v = Number(row.value);
    if (!Number.isFinite(v)) continue;

    out.push({
      date: row.date,
      value: v,
    });
  }

  return out;
}

// ============================================================================
// OPTIONAL HELPERS — used by diagnostics/index if needed later
// ============================================================================

// Get full raw series from fred_cache.json
export async function getSeries(seriesId) {
  const cache = await loadFredCache();
  return cache[seriesId] || null;
}

// Return array of numeric {date,value}
export async function getObservationHistory(seriesId) {
  const cache = await loadFredHistoricalCache();
  const series = cache[seriesId];
  if (!series || !series.observations) return [];

  return series.observations
    .map(o => ({
      date: o.date,
      value: Number(o.value),
    }))
    .filter(o => Number.isFinite(o.value));
}
