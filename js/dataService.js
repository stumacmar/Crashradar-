// js/dataService.js
// FRED cache loader + current value computation for indicators.

import { INDICATOR_CONFIG } from './config.js';

const FRED_CACHE_URL = 'data/fred_cache.json';

let fredCache = null;
let cacheAgeDays = null;
let cacheGeneratedAtText = null;

/**
 * Internal: compute latest numeric value from a FRED series object.
 */
function lastVal(seriesObj) {
  if (!seriesObj) return null;

  if (Array.isArray(seriesObj.observations) && seriesObj.observations.length) {
    for (let i = seriesObj.observations.length - 1; i >= 0; i--) {
      const v = Number(seriesObj.observations[i].value);
      if (Number.isFinite(v)) return v;
    }
    return null;
  }

  if (typeof seriesObj.value !== 'undefined') {
    const v = Number(seriesObj.value);
    return Number.isFinite(v) ? v : null;
  }

  return null;
}

/**
 * Internal: find observation approximately N months back from the last point.
 * Mirrors original obsMonthsBack behaviour.
 */
function obsMonthsBack(seriesObj, months) {
  if (!seriesObj || !Array.isArray(seriesObj.observations) || !seriesObj.observations.length) return null;

  const obs = seriesObj.observations;
  const last = obs[obs.length - 1];
  const lastDate = new Date(last.date);
  if (isNaN(lastDate)) return null;

  const target = new Date(lastDate);
  target.setMonth(target.getMonth() - months);

  let candidate = null;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const d = new Date(o.date);
    if (isNaN(d)) continue;
    if (d <= target) candidate = o;
    else break;
  }
  return candidate;
}

/**
 * Internal: rolling average of last N observations.
 */
function rollingAvgLastN(seriesObj, n) {
  if (!seriesObj || !Array.isArray(seriesObj.observations) || seriesObj.observations.length < n) return null;
  const obs = seriesObj.observations.slice(-n);
  const vals = obs.map(o => Number(o.value)).filter(v => Number.isFinite(v));
  if (vals.length < n) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return sum / n;
}

/**
 * Internal: percentage change helper ((new - old)/old * 100).
 */
function pctChange(nv, ov) {
  const n = Number(nv);
  const o = Number(ov);
  if (!Number.isFinite(n) || !Number.isFinite(o) || o === 0) return null;
  return ((n - o) / o) * 100;
}

/**
 * Load fred_cache.json once and cache it.
 * Computes cacheAgeDays as in the original implementation.
 */
export async function loadFredCache() {
  if (fredCache) return fredCache;

  const res = await fetch(FRED_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`FRED cache HTTP error: ${res.status}`);
  }

  fredCache = await res.json();

  const gen = fredCache.generated_at || null;
  cacheGeneratedAtText = gen || 'loaded';

  if (gen) {
    const genDate = new Date(gen);
    if (!isNaN(genDate)) {
      const now = new Date();
      const diffMs = now - genDate;
      const days = diffMs / (1000 * 60 * 60 * 24);
      cacheAgeDays = days >= 0 ? days : null;
    } else {
      cacheAgeDays = null;
    }
  } else {
    cacheAgeDays = null;
  }

  return fredCache;
}

/**
 * Get high-level metadata about the FRED cache.
 */
export function getCacheMeta() {
  return {
    cacheAgeDays,
    generatedAt: cacheGeneratedAtText,
  };
}

/**
 * Get raw FRED series object by id.
 */
export function getSeries(fredId) {
  if (!fredCache || !fredCache.series) return null;
  return fredCache.series[fredId] || null;
}

/**
 * Get observations array for a series (may be empty array).
 */
export function getSeriesObservations(fredId) {
  const seriesObj = getSeries(fredId);
  if (!seriesObj || !Array.isArray(seriesObj.observations)) return [];
  return seriesObj.observations;
}

/**
 * Get the latest numeric value (raw) for a series.
 */
export function getLatestNumeric(fredId) {
  const seriesObj = getSeries(fredId);
  return lastVal(seriesObj);
}

/**
 * Compute the "current" value for a configured indicator, using the same
 * transformation rules as the monolithic version.
 *
 * - transform === 'raw'          → last raw value
 * - transform === 'yoy_percent'  → YoY % using 12-month look-back
 * - transform === 'pct_change_6m'→ 6-month % change
 * - transform === 'ma4_thousands'→ 4-week MA, scaled to thousands
 * - transform === 'manual'       → never computed from FRED (null here)
 */
export function computeCurrentForIndicator(indCfg) {
  if (!indCfg || !indCfg.fromFred || !indCfg.fredId) return null;

  const seriesObj = getSeries(indCfg.fredId);
  if (!seriesObj) return null;

  const transform = indCfg.transform || 'raw';

  if (transform === 'raw') {
    return lastVal(seriesObj);
  }

  if (transform === 'yoy_percent') {
    const lvlNow = lastVal(seriesObj);
    const back = obsMonthsBack(seriesObj, 12);
    if (lvlNow != null && back && back.value != null) {
      const pc = pctChange(lvlNow, back.value);
      return pc != null ? pc : null;
    }
    return null;
  }

  if (transform === 'pct_change_6m') {
    const nowVal = lastVal(seriesObj);
    const back = obsMonthsBack(seriesObj, 6);
    if (nowVal != null && back && back.value != null) {
      const pc = pctChange(nowVal, back.value);
      return pc != null ? pc : null;
    }
    return null;
  }

  if (transform === 'ma4_thousands') {
    const avg = rollingAvgLastN(seriesObj, 4);
    if (avg != null) return avg / 1000;
    return null;
  }

  // Manual or unknown transform → do not derive from FRED.
  return null;
}

/**
 * Bulk load: compute current values for all FRED-based indicators.
 *
 * Returns:
 * {
 *   valuesByKey: { [indicatorKey]: number | null },
 *   cacheMeta: { cacheAgeDays, generatedAt }
 * }
 */
export async function loadCurrentIndicatorValues() {
  await loadFredCache();

  const valuesByKey = {};

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.fromFred || !cfg.fredId) {
      valuesByKey[key] = null;
      return;
    }
    const val = computeCurrentForIndicator(cfg);
    valuesByKey[key] = Number.isFinite(val) ? val : null;
  });

  return {
    valuesByKey,
    cacheMeta: getCacheMeta(),
  };
}
