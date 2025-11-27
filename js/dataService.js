// dataService.js
// ============================================================================
// Loads FRED cache, normalises observation arrays, extracts latest values,
// computes freshness (days old), and provides unified access for the app.
// ============================================================================

import { INDICATOR_CONFIG } from './config.js';

const FRED_CACHE_URL = 'data/fred_cache.json';
const FRED_HISTORICAL_URL = 'data/fred_historical_cache.json';

let fredCache = null;
let fredHistoricalCache = null;

// ============================================================================
// 1. LOAD FRED CACHE (CURRENT SNAPSHOT)
// ============================================================================

export async function loadFredCache() {
  if (fredCache) return fredCache;

  const res = await fetch(FRED_CACHE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${FRED_CACHE_URL}`);

  const json = await res.json();

  fredCache = normaliseCache(json);
  return fredCache;
}

// ============================================================================
// 2. LOAD HISTORICAL FRED CACHE (FULL HISTORY FOR CHARTS)
// ============================================================================

export async function loadFredHistoricalCache() {
  if (fredHistoricalCache) return fredHistoricalCache;

  const res = await fetch(FRED_HISTORICAL_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${FRED_HISTORICAL_URL}`);

  const json = await res.json();

  fredHistoricalCache = normaliseHistoricalCache(json);
  return fredHistoricalCache;
}

// ============================================================================
// 3. NORMALISERS
// ============================================================================

function normaliseCache(raw) {
  if (!raw || !raw.series) return { generated_at: null, series: {} };

  const out = { generated_at: raw.generated_at, series: {} };

  for (const [id, s] of Object.entries(raw.series)) {
    if (!s || !Array.isArray(s.observations)) continue;

    const observations = s.observations.map(o => ({
      date: o.date,
      value: Number.isFinite(o.value) ? o.value : null,
    }));

    let latest = null;
    for (let i = observations.length - 1; i >= 0; i--) {
      if (Number.isFinite(observations[i].value)) {
        latest = observations[i].value;
        break;
      }
    }

    out.series[id] = {
      id,
      last_updated: s.last_updated || null,
      observations,
      latest,
    };
  }

  return out;
}

function normaliseHistoricalCache(raw) {
  if (!raw || !raw.series) return { generated_at: null, series: {} };

  const out = { generated_at: raw.generated_at, series: {} };

  for (const [id, s] of Object.entries(raw.series)) {
    if (!s || !Array.isArray(s.observations)) continue;

    const observations = s.observations.map(o => ({
      date: o.date,
      value: parseFloat(o.value),
    }));

    let latest = null;
    for (let i = observations.length - 1; i >= 0; i--) {
      const v = observations[i].value;
      if (Number.isFinite(v)) {
        latest = v;
        break;
      }
    }

    out.series[id] = {
      id,
      last_updated: s.last_updated || null,
      observations,
      latest,
    };
  }

  return out;
}

// ============================================================================
// 4. HELPER — ACCESS A SERIES FROM CACHE
// ============================================================================

export function getSeriesCurrent(id) {
  if (!fredCache || !fredCache.series[id]) return null;
  return fredCache.series[id];
}

export function getSeriesHistorical(id) {
  if (!fredHistoricalCache || !fredHistoricalCache.series[id]) return null;
  return fredHistoricalCache.series[id];
}

// ============================================================================
// 5. COMPUTE INDICATOR DERIVED VALUES
// ============================================================================

export function computeIndicatorValues() {
  const out = {};

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    if (!cfg.fromFred) {
      out[key] = null;
      continue;
    }

    const s = getSeriesCurrent(cfg.fredId);
    if (!s) {
      out[key] = null;
      continue;
    }

    // Simple case — direct latest value
    if (!cfg.transform) {
      out[key] = Number.isFinite(s.latest) ? s.latest : null;
      continue;
    }

    // Transform: YoY, MoM, 6m delta, 4w MA, etc.
    out[key] = applyTransform(cfg.transform, s.observations);
  }

  return out;
}

// ============================================================================
// 6. TRANSFORM DISPATCHER
// ============================================================================

function applyTransform(name, obs) {
  if (!Array.isArray(obs) || obs.length === 0) return null;

  switch (name) {
    case 'yoy':
      return yoy(obs);
    case 'mom':
      return mom(obs);
    case 'yoy_pct':
      return yoyPct(obs);
    case 'six_month_delta_pct':
      return sixMonthDeltaPct(obs);
    case 'ma_4wk':
      return ma4wk(obs);
    default:
      return null;
  }
}

// ============================================================================
// 7. TRANSFORM FUNCTIONS
// ============================================================================

function latestN(obs, n) {
  const arr = [];
  for (let i = obs.length - 1; i >= 0 && arr.length < n; i--) {
    const v = obs[i].value;
    if (Number.isFinite(v)) arr.push(v);
  }
  return arr.reverse();
}

function yoy(obs) {
  if (obs.length < 13) return null;

  let latest = null;
  let old = null;

  for (let i = obs.length - 1; i >= 0; i--) {
    if (Number.isFinite(obs[i].value)) {
      latest = obs[i].value;
      break;
    }
  }

  for (let i = obs.length - 13; i >= 0; i--) {
    if (Number.isFinite(obs[i].value)) {
      old = obs[i].value;
      break;
    }
  }

  if (!Number.isFinite(latest) || !Number.isFinite(old)) return null;

  return ((latest / old) - 1) * 100;
}

function mom(obs) {
  if (obs.length < 2) return null;

  const last2 = latestN(obs, 2);
  if (last2.length < 2) return null;

  const prev = last2[0];
  const curr = last2[1];
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return null;

  return (curr - prev);
}

function yoyPct(obs) {
  const y = yoy(obs);
  return Number.isFinite(y) ? y : null;
}

function sixMonthDeltaPct(obs) {
  if (obs.length < 7) return null;

  let latest = null;
  let old = null;

  for (let i = obs.length - 1; i >= 0; i--) {
    if (Number.isFinite(obs[i].value)) {
      latest = obs[i].value;
      break;
    }
  }

  for (let i = obs.length - 7; i >= 0; i--) {
    if (Number.isFinite(obs[i].value)) {
      old = obs[i].value;
      break;
    }
  }

  if (!Number.isFinite(latest) || !Number.isFinite(old)) return null;

  return ((latest / old) - 1) * 100;
}

function ma4wk(obs) {
  const vals = latestN(obs, 4);
  if (vals.length < 4) return null;

  const sum = vals.reduce((a, b) => a + b, 0);
  return sum / 4;
}

// ============================================================================
// 8. FRESHNESS CALCULATOR
// ============================================================================

export function computeCacheMeta(rawGeneratedAt) {
  if (!rawGeneratedAt) return { cacheAgeDays: null };

  const t0 = new Date(rawGeneratedAt).getTime();
  if (!Number.isFinite(t0)) return { cacheAgeDays: null };

  const now = Date.now();
  const diff = now - t0;
  return { cacheAgeDays: diff / (1000 * 3600 * 24) };
}

// ============================================================================
// 9. EXPORT RAW DATA SNAPSHOT
// ============================================================================

export function exportRawSnapshot() {
  return {
    fredCache,
    fredHistoricalCache,
  };
}
