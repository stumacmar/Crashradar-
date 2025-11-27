//
// ============================================================================
// dataService.js
// Fully rebuilt FRED cache + historical loader compatible with app.js
// ============================================================================

import { INDICATOR_CONFIG } from './config.js';

// GitHub Pages paths (exactly what your index expects)
const FRED_CACHE_URL = './data/fred_cache.json';
const FRED_HIST_URL  = './data/fred_historical_cache.json';

// In-memory caches to prevent repeated fetches
let fredCache = null;
let fredHistCache = null;

//
// ============================================================================
// Load fred_cache.json (latest values)
// ============================================================================
export async function loadFredCache() {
  if (fredCache) return fredCache;

  const res = await fetch(FRED_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load fred_cache.json`);

  fredCache = await res.json();
  return fredCache;
}

//
// ============================================================================
// Load fred_historical_cache.json (full series)
// ============================================================================
export async function loadFredHistorical() {
  if (fredHistCache) return fredHistCache;

  const res = await fetch(FRED_HIST_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load fred_historical_cache.json`);

  fredHistCache = await res.json();
  return fredHistCache;
}

//
// ============================================================================
// Extract latest values from fred_cache.json
// ============================================================================
export async function loadCurrentIndicatorValues() {
  const cache = await loadFredCache();

  const valuesByKey = {};
  const meta = {};

  // Extract values for each indicator
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    if (!cfg.fromFred) {
      valuesByKey[key] = null;
      continue;
    }

    const series = cache.series?.[key];
    if (!series || !series.observations || series.observations.length === 0) {
      valuesByKey[key] = null;
      continue;
    }

    // last numeric observation
    let val = null;
    for (let i = series.observations.length - 1; i >= 0; i--) {
      const v = parseFloat(series.observations[i].value);
      if (Number.isFinite(v)) {
        val = v;
        break;
      }
    }

    valuesByKey[key] = val;
  }

  // meta
  meta.generatedAt   = cache.generated_at || null;
  meta.cacheAgeDays  = cache.cache_age_days || null;

  return { valuesByKey, cacheMeta: meta };
}

//
// ============================================================================
// Return cleaned historical series for 1 indicator
// ============================================================================
export async function loadProcessedHistory(cfg) {
  const hist = await loadFredHistorical();

  const series = hist.series?.[cfg.key];
  if (!series || !series.observations) return [];

  return series.observations
    .map(o => {
      const v = parseFloat(o.value);
      return {
        date: o.date,
        value: Number.isFinite(v) ? v : null,
      };
    })
    .filter(x => x.value !== null);
}

//
// ============================================================================
// END OF FILE
// ============================================================================
