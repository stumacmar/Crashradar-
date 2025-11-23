// js/historyService.js
// ------------------------------------------------------------
// Historical data processor for indicators + valuations.
// Converts raw FRED observations → transformed series
// according to config.transform / historyTransform.
// Supports:
//   - raw
//   - yoy_percent
//   - pct_change_6m
//   - ma4_thousands
//
// Provides:
//   getHistoryForIndicator(key, lookback)
//   getHistoryForSeries(fredId, transform, lookback)
//
// Output format:
//   [
//     { date: 'YYYY-MM-DD', value: Number|null },
//     ...
//   ]
// ------------------------------------------------------------

import { INDICATOR_CONFIG } from './config.js';
import { getSeries, loadFredCache } from './dataService.js';

/* ------------------------------------------------------------
   Helpers
------------------------------------------------------------ */

function parseDateSafe(d) {
  const dt = new Date(d);
  return isNaN(dt) ? null : dt;
}

function pctChange(nv, ov) {
  const n = Number(nv);
  const o = Number(ov);
  if (!Number.isFinite(n) || !Number.isFinite(o) || o === 0) return null;
  return ((n - o) / o) * 100;
}

function rollingMA(arr, n) {
  if (!Array.isArray(arr) || arr.length < n) return null;
  const slice = arr.slice(-n);
  const nums = slice.map(o => Number(o.value)).filter(v => Number.isFinite(v));
  if (nums.length < n) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / n;
}

/* ------------------------------------------------------------
   Transform functions
------------------------------------------------------------ */

function transformRaw(obs) {
  const v = Number(obs.value);
  return Number.isFinite(v) ? v : null;
}

function transformYoY(allObs, idx) {
  const now = allObs[idx];
  if (!now) return null;

  const nowDate = parseDateSafe(now.date);
  if (!nowDate) return null;

  const target = new Date(nowDate);
  target.setMonth(target.getMonth() - 12);

  let back = null;
  for (let i = idx - 1; i >= 0; i--) {
    const d = parseDateSafe(allObs[i].date);
    if (!d) continue;
    if (d <= target) {
      back = allObs[i];
      break;
    }
  }

  if (!back) return null;
  return pctChange(now.value, back.value);
}

function transformPct6m(allObs, idx) {
  const now = allObs[idx];
  if (!now) return null;

  const nowDate = parseDateSafe(now.date);
  if (!nowDate) return null;

  const target = new Date(nowDate);
  target.setMonth(target.getMonth() - 6);

  let back = null;
  for (let i = idx - 1; i >= 0; i--) {
    const d = parseDateSafe(allObs[i].date);
    if (!d) continue;
    if (d <= target) {
      back = allObs[i];
      break;
    }
  }

  if (!back) return null;
  return pctChange(now.value, back.value);
}

function transformMA4k(allObs, idx) {
  if (idx < 3) return null;
  const slice = allObs.slice(idx - 3, idx + 1);
  const avg = rollingMA(slice, 4);
  return avg != null ? avg / 1000 : null;
}

/* ------------------------------------------------------------
   Core transformer
------------------------------------------------------------ */

function applyTransform(allObs, transform) {
  if (!Array.isArray(allObs) || !allObs.length) return [];

  return allObs.map((obs, idx) => {
    let value = null;

    switch (transform) {
      case 'raw':
        value = transformRaw(obs);
        break;

      case 'yoy_percent':
        value = transformYoY(allObs, idx);
        break;

      case 'pct_change_6m':
        value = transformPct6m(allObs, idx);
        break;

      case 'ma4_thousands':
        value = transformMA4k(allObs, idx);
        break;

      default:
        value = null;
    }

    return {
      date: obs.date,
      value: Number.isFinite(value) ? value : null,
    };
  });
}

/* ------------------------------------------------------------
   Lookback slicing
------------------------------------------------------------ */

function sliceLookback(data, months) {
  if (!months || !Array.isArray(data) || !data.length) return data;

  const last = data[data.length - 1];
  const lastDate = parseDateSafe(last.date);
  if (!lastDate) return data;

  const minDate = new Date(lastDate);
  minDate.setMonth(minDate.getMonth() - months);

  return data.filter(d => {
    const dt = parseDateSafe(d.date);
    return dt && dt >= minDate;
  });
}

/* ------------------------------------------------------------
   Public API
------------------------------------------------------------ */

/**
 * getHistoryForSeries
 * Apply transform to a raw series from FRED.
 */
export async function getHistoryForSeries(fredId, transform, lookbackMonths) {
  await loadFredCache();
  const series = getSeries(fredId);
  if (!series || !Array.isArray(series.observations)) {
    return [];
  }

  const obs = series.observations;

  const transformed = applyTransform(obs, transform);

  if (lookbackMonths) {
    return sliceLookback(transformed, lookbackMonths);
  }

  return transformed;
}

/**
 * getHistoryForIndicator(key, lookbackMonths)
 * Uses INDICATOR_CONFIG to pick:
 * - fredId
 * - historyTransform
 */
export async function getHistoryForIndicator(key, lookbackMonths) {
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.fromFred || !cfg.fredId) return [];

  const transform = cfg.historyTransform || cfg.transform || 'raw';

  return await getHistoryForSeries(
    cfg.fredId,
    transform,
    lookbackMonths,
  );
}
