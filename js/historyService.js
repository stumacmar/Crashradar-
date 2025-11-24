import { INDICATOR_CONFIG } from './config.js';

const CACHE_PATH = 'data/fred_cache.json';

/**
 * Load entire FRED cache.
 */
async function loadCache() {
  const res = await fetch(CACHE_PATH);
  if (!res.ok) throw new Error(`Failed to load ${CACHE_PATH}`);
  return res.json();
}

/**
 * Get a FRED series from cache.series
 */
export function findSeries(cache, fredId) {
  if (!cache?.series) return null;

  if (cache.series[fredId]) return cache.series[fredId];

  const lower = fredId.toLowerCase();
  for (const key of Object.keys(cache.series)) {
    if (key.toLowerCase() === lower) return cache.series[key];
  }
  return null;
}

/**
 * Apply transforms to raw observation array.
 */
function applyTransform(seriesObj, cfg) {
  const obs = seriesObj?.observations || [];
  const base = obs
    .map(o => ({ date: o.date, value: Number(o.value) }))
    .filter(o => Number.isFinite(o.value));

  switch (cfg.transform) {
    case 'raw':
      return base;

    case 'yoy_percent': {
      const out = [];
      for (let i = 12; i < base.length; i++) {
        const prev = base[i - 12].value;
        if (prev === 0) continue;
        const v = ((base[i].value - prev) / prev) * 100;
        out.push({ date: base[i].date, value: v });
      }
      return out;
    }

    case 'ma4_thousands': {
      const out = [];
      for (let i = 3; i < base.length; i++) {
        const avg =
          (base[i].value +
            base[i - 1].value +
            base[i - 2].value +
            base[i - 3].value) /
          4;
        out.push({ date: base[i].date, value: avg / 1000 });
      }
      return out;
    }

    default:
      return base;
  }
}

/**
 * Main: processed history
 */
export async function loadProcessedHistory(cfg) {
  if (!cfg.fromFred || !cfg.fredId) return [];

  const cache = await loadCache();
  const series = findSeries(cache, cfg.fredId);
  if (!series) return [];

  return applyTransform(series, cfg);
}

/**
 * Get period subset (3M, 6M, 12M, MAX)
 */
export function getPeriodSubset(history, period) {
  if (!history.length) return [];

  if (period === 'MAX') return history;

  const months = period === '3M' ? 3 : period === '6M' ? 6 : 12;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return history.filter(h => new Date(h.date) >= cutoff);
}

/**
 * Stats on transformed data
 */
export function computeHistoryStats(history) {
  if (history.length < 2) return null;

  const last = history[history.length - 1];
  const lastVal = last.value;

  function pctChange(months) {
    const cutoff = new Date(last.date);
    cutoff.setMonth(cutoff.getMonth() - months);

    let baseline = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const d = new Date(history[i].date);
      if (d <= cutoff) {
        baseline = history[i].value;
        break;
      }
    }
    if (!Number.isFinite(baseline) || baseline === 0) return null;

    return ((lastVal - baseline) / baseline) * 100;
  }

  return {
    current: lastVal,
    threeChangePct: pctChange(3),
    sixChangePct: pctChange(6),
    twelveChangePct: pctChange(12)
  };
}
