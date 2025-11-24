import { INDICATOR_CONFIG } from './config.js';

const FRED_CACHE_URL = 'data/fred_cache.json';

let fredCache = null;

/**
 * Load fred_cache.json once.
 */
export async function loadFredCache() {
  if (fredCache) return fredCache;

  const res = await fetch(FRED_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${FRED_CACHE_URL}`);

  fredCache = await res.json();
  return fredCache;
}

/**
 * Helper: latest numeric value in a series.
 */
function latest(series) {
  if (!series?.observations?.length) return null;

  const obs = series.observations;
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = Number(obs[i].value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * YoY %: (new - old)/old * 100
 */
function yoy(series, monthsBack = 12) {
  if (!series?.observations?.length) return null;

  const obs = series.observations;
  const last = obs[obs.length - 1];
  const lastVal = Number(last.value);
  if (!Number.isFinite(lastVal)) return null;

  const lastDate = new Date(last.date);
  const target = new Date(lastDate);
  target.setMonth(target.getMonth() - monthsBack);

  let base = null;
  for (let i = obs.length - 1; i >= 0; i--) {
    const d = new Date(obs[i].date);
    if (d <= target) {
      base = Number(obs[i].value);
      break;
    }
  }

  if (!Number.isFinite(base) || base === 0) return null;
  return ((lastVal - base) / base) * 100;
}

/**
 * 4-week MA (scaled to thousands for claims)
 */
function ma4k(series) {
  if (!series?.observations?.length) return null;
  const obs = series.observations.slice(-4);
  if (obs.length < 4) return null;

  const nums = obs.map(o => Number(o.value)).filter(x => Number.isFinite(x));
  if (nums.length < 4) return null;

  const avg = nums.reduce((a, b) => a + b, 0) / 4;
  return avg / 1000;
}

/**
 * Public: get series by FRED ID from cache.series
 */
export function getSeries(fredId) {
  if (!fredCache?.series) return null;
  return fredCache.series[fredId] || null;
}

/**
 * Compute current numeric value for any indicator.
 */
export function computeCurrentForIndicator(cfg) {
  if (!cfg.fromFred || !cfg.fredId) return null;

  const series = getSeries(cfg.fredId);
  if (!series) return null;

  switch (cfg.transform) {
    case 'raw':
      return latest(series);
    case 'yoy_percent':
      return yoy(series, 12);
    case 'pct_change_6m':
      return yoy(series, 6);
    case 'ma4_thousands':
      return ma4k(series);
    default:
      return latest(series);
  }
}

/**
 * Bulk load all indicator values.
 */
export async function loadCurrentIndicatorValues() {
  await loadFredCache();

  const valuesByKey = {};

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.fromFred) {
      valuesByKey[key] = null;
      return;
    }
    const v = computeCurrentForIndicator(cfg);
    valuesByKey[key] = Number.isFinite(v) ? v : null;
  });

  return {
    valuesByKey,
    cacheMeta: {
      generatedAt: fredCache?.generated_at || null,
      cacheAgeDays: null // optional (not required for correctness)
    }
  };
}
