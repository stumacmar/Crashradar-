// js/historyService.js
// Loads historical series from fred_cache.json and produces:
// - Normalised indicator histories
// - Period subsets (3M, 6M, 12M, Max)
// - Summary statistics (current, 3M/6M/12M % change)

import { INDICATOR_CONFIG } from './config.js';

// Path to cache
const CACHE_PATH = './data/fred_cache.json';

// ------------------------------------------------------------
// Internal utility: load the entire cache.JSON as an object
// ------------------------------------------------------------
async function loadCache() {
  const res = await fetch(CACHE_PATH);
  if (!res.ok) throw new Error(`Failed to load ${CACHE_PATH}`);
  return res.json();
}

// ------------------------------------------------------------
// Find the key inside fred_cache.json that matches a FRED ID
// ------------------------------------------------------------
function findSeries(cache, fredId) {
  if (!cache) return null;

  // Exact match first
  if (cache[fredId]) return cache[fredId];

  // Some IDs inside your cache are stored under slightly different names
  // → try case-insensitive / loose match
  const lower = fredId.toLowerCase();
  for (const key of Object.keys(cache)) {
    if (key.toLowerCase() === lower) return cache[key];
  }
  return null;
}

// ------------------------------------------------------------
// Transform raw series into the correct format
// Supported transforms:
//   raw
//   yoy_percent
//   ma4_thousands
// ------------------------------------------------------------
function applyTransform(series, cfg) {
  const transform = cfg.transform || 'raw';

  // Convert to [{date, value}]
  const base = series.map(d => ({
    date: d.date,
    value: Number(d.value)
  })).filter(d => Number.isFinite(d.value));

  if (transform === 'raw') {
    return base;
  }

  if (transform === 'yoy_percent') {
    const map = [];
    for (let i = 12; i < base.length; i++) {
      const prev = base[i - 12].value;
      const cur = base[i].value;
      if (prev > 0 && isFinite(cur)) {
        map.push({
          date: base[i].date,
          value: ((cur - prev) / prev) * 100
        });
      }
    }
    return map;
  }

  if (transform === 'ma4_thousands') {
    const out = [];
    for (let i = 3; i < base.length; i++) {
      const avg = (
        base[i].value +
        base[i - 1].value +
        base[i - 2].value +
        base[i - 3].value
      ) / 4;
      out.push({
        date: base[i].date,
        value: avg / 1000
      });
    }
    return out;
  }

  return base;
}

// ------------------------------------------------------------
// MAIN: loadProcessedHistory(cfg)
// Returns [{date,value}...]
// ------------------------------------------------------------
export async function loadProcessedHistory(cfg) {
  if (!cfg || !cfg.fromFred || !cfg.fredId) return [];

  const cache = await loadCache();
  const series = findSeries(cache, cfg.fredId);
  if (!series || !Array.isArray(series)) return [];

  return applyTransform(series, cfg);
}

// ------------------------------------------------------------
// Filter history by period: "3M", "6M", "12M", "MAX"
// ------------------------------------------------------------
export function getPeriodSubset(history, period = '12M') {
  if (!history || !history.length) return [];

  if (period === 'MAX') return history;

  const months = {
    '3M': 3,
    '6M': 6,
    '12M': 12
  }[period];

  if (!months) return history;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return history.filter(d => {
    const dt = new Date(d.date);
    return dt >= cutoff;
  });
}

// ------------------------------------------------------------
// computeHistoryStats(history)
// Returns:
//   current
//   threeChangePct
//   sixChangePct
//   twelveChangePct
// ------------------------------------------------------------
export function computeHistoryStats(history) {
  if (!history || history.length < 2) return null;

  const last = history[history.length - 1];
  const current = last.value;

  function pctChange(months) {
    const cutoff = new Date(last.date);
    cutoff.setMonth(cutoff.getMonth() - months);

    let closest = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const dt = new Date(history[i].date);
      if (dt <= cutoff) {
        closest = history[i].value;
        break;
      }
    }
    if (closest === null || closest === 0) return null;
    return ((current - closest) / closest) * 100;
  }

  return {
    current,
    threeChangePct: pctChange(3),
    sixChangePct: pctChange(6),
    twelveChangePct: pctChange(12)
  };
}
