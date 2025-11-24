// js/historyService.js — FIXED FOR CRASHRADAR V7
// ------------------------------------------------------------
// Corrected to match the REAL fred_cache.json structure:
//
// {
//   "generated_at": "...",
//   "series": {
//       "T10Y3M": {
//           "id": "T10Y3M",
//           "last_updated": "...",
//           "observations": [
//               { "date": "YYYY-MM-DD", "value": "0.52" },
//               ...
//           ]
//       },
//       ...
//   }
// }
//
// This version:
//  - Reads cache.series[fid].observations correctly
//  - Normalises to [{date, value}]
//  - Supports: raw, yoy_percent, ma4_thousands
//  - Provides: loadProcessedHistory, getPeriodSubset, computeHistoryStats
// ------------------------------------------------------------

import { INDICATOR_CONFIG } from './config.js';

const CACHE_PATH = './data/fred_cache.json';

// ------------------------------------------------------------
// Helper: Load entire cache
// ------------------------------------------------------------
async function loadCache() {
  const res = await fetch(CACHE_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${CACHE_PATH}`);
  const json = await res.json();

  // Must have json.series as object
  if (!json || typeof json !== 'object' || !json.series) {
    console.error('Invalid fred_cache.json format:', json);
    throw new Error('fred_cache.json missing "series" object');
  }

  return json.series;       // key → { observations:[] }
}

// ------------------------------------------------------------
// Find the correct series and normalise to [{date, value}, …]
// ------------------------------------------------------------
function findSeriesAsArray(seriesMap, fredId) {
  if (!seriesMap || !fredId) return null;

  // 1. Exact match
  if (seriesMap[fredId]) {
    const obj = seriesMap[fredId];
    if (obj && Array.isArray(obj.observations)) {
      return obj.observations
        .map(o => ({
          date: o.date,
          value: Number(o.value)
        }))
        .filter(d => d.date && Number.isFinite(d.value));
    }
  }

  // 2. Case-insensitive fallback
  const lower = fredId.toLowerCase();
  for (const key of Object.keys(seriesMap)) {
    if (key.toLowerCase() === lower) {
      const obj = seriesMap[key];
      if (obj && Array.isArray(obj.observations)) {
        return obj.observations
          .map(o => ({
            date: o.date,
            value: Number(o.value)
          }))
          .filter(d => d.date && Number.isFinite(d.value));
      }
    }
  }

  return null;
}

// ------------------------------------------------------------
// Transform logic (raw, yoy_percent, ma4_thousands)
// ------------------------------------------------------------
function applyTransform(history, cfg) {
  if (!history || !history.length) return [];

  const t = cfg.transform || 'raw';

  if (t === 'raw') return history.slice();

  if (t === 'yoy_percent') {
    const out = [];
    for (let i = 12; i < history.length; i++) {
      const prev = history[i - 12].value;
      const cur = history[i].value;
      if (prev !== 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
        out.push({
          date: history[i].date,
          value: ((cur - prev) / prev) * 100
        });
      }
    }
    return out;
  }

  if (t === 'ma4_thousands') {
    const out = [];
    for (let i = 3; i < history.length; i++) {
      const a = history[i].value;
      const b = history[i - 1].value;
      const c = history[i - 2].value;
      const d = history[i - 3].value;
      if ([a,b,c,d].every(Number.isFinite)) {
        out.push({
          date: history[i].date,
          value: (a + b + c + d) / 4 / 1000
        });
      }
    }
    return out;
  }

  return history.slice();
}

// ------------------------------------------------------------
// Public: loadProcessedHistory(cfg)
// ------------------------------------------------------------
export async function loadProcessedHistory(cfg) {
  if (!cfg || !cfg.fromFred || !cfg.fredId) return [];

  const seriesMap = await loadCache();
  const rawSeries = findSeriesAsArray(seriesMap, cfg.fredId);
  if (!rawSeries || !rawSeries.length) return [];

  return applyTransform(rawSeries, cfg);
}

// ------------------------------------------------------------
// Public: getPeriodSubset(history, "12M"/"5Y"/"MAX")
// ------------------------------------------------------------
export function getPeriodSubset(history, period = '12M') {
  if (!history || !history.length) return [];

  if (period === 'MAX') return history.slice();

  const months = {
    '12M': 12,
    '5Y': 60,
    '6M': 6,
    '3M': 3,
  }[period];

  if (!months) return history.slice();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return history.filter(d => {
    const dt = new Date(d.date);
    return !isNaN(dt) && dt >= cutoff;
  });
}

// ------------------------------------------------------------
// Public: computeHistoryStats(history)
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
      if (!isNaN(dt) && dt <= cutoff) {
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
    twelveChangePct: pctChange(12),
  };
}
