// js/historyService.js
// Historical series processing for indicators (YoY, 6m%, MA4, etc.)

import { loadFredCache, getSeries } from './dataService.js';

/**
 * YoY % growth from a level series (12-month look-back).
 * Mirrors original calculateYoYGrowth.
 */
function calculateYoYGrowth(observations) {
  const result = [];
  for (let i = 12; i < observations.length; i++) {
    const current = parseFloat(observations[i].value);
    const yearAgo = parseFloat(observations[i - 12].value);
    if (!isNaN(current) && !isNaN(yearAgo) && yearAgo !== 0) {
      const growth = ((current - yearAgo) / yearAgo) * 100;
      result.push({ date: observations[i].date, value: growth });
    }
  }
  return result;
}

/**
 * Rolling % change over N months.
 * Mirrors original calculateRollingPercentChange.
 */
function calculateRollingPercentChange(observations, months) {
  const result = [];
  for (let i = months; i < observations.length; i++) {
    const current = parseFloat(observations[i].value);
    const periodAgo = parseFloat(observations[i - months].value);
    if (!isNaN(current) && !isNaN(periodAgo) && periodAgo !== 0) {
      const change = ((current - periodAgo) / periodAgo) * 100;
      result.push({ date: observations[i].date, value: change });
    }
  }
  return result;
}

/**
 * Moving average over N periods, expressed in thousands.
 * Mirrors original calculateMovingAverage (ICSA).
 */
function calculateMovingAverage(observations, periods) {
  const result = [];
  for (let i = periods - 1; i < observations.length; i++) {
    let sum = 0, count = 0;
    for (let j = 0; j < periods; j++) {
      const value = parseFloat(observations[i - j].value);
      if (!isNaN(value)) {
        sum += value;
        count++;
      }
    }
    if (count === periods) {
      result.push({
        date: observations[i].date,
        value: sum / periods / 1000, // thousands
      });
    }
  }
  return result;
}

// Internal cache: fredId -> processed history [{ date, value }]
const historyCache = Object.create(null);

/**
 * Core processor: apply indicator.historyTransform to a FRED series.
 * This is a direct generalisation of the old loadHistoricalData switch.
 */
function processHistoryForIndicator(indicatorCfg, seriesObj) {
  if (!seriesObj || !Array.isArray(seriesObj.observations)) return null;

  const obs = seriesObj.observations;
  if (!obs.length) return [];

  const transform = indicatorCfg.historyTransform || 'raw';

  if (transform === 'yoy_percent') {
    return calculateYoYGrowth(obs);
  }

  if (transform === 'pct_change_6m') {
    return calculateRollingPercentChange(obs, 6);
  }

  if (transform === 'ma4_thousands') {
    return calculateMovingAverage(obs, 4);
  }

  // 'raw' or unknown: just map numeric values with defensive filtering.
  return obs
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => !isNaN(o.value));
}

/**
 * Load and cache processed historical data for a FRED-backed indicator.
 *
 * Returns: [{ date: 'YYYY-MM-DD', value: number }, ...] or null on error.
 */
export async function loadProcessedHistory(indicatorCfg) {
  if (!indicatorCfg || !indicatorCfg.fromFred || !indicatorCfg.fredId) return null;

  const fredId = indicatorCfg.fredId;

  if (historyCache[fredId]) return historyCache[fredId];

  try {
    await loadFredCache();
    const seriesObj = getSeries(fredId);
    if (!seriesObj || !Array.isArray(seriesObj.observations)) {
      console.warn(`No historical data found for ${fredId}`);
      historyCache[fredId] = [];
      return historyCache[fredId];
    }

    const processed = processHistoryForIndicator(indicatorCfg, seriesObj) || [];
    historyCache[fredId] = processed;
    return processed;
  } catch (err) {
    console.error(`Error loading historical data for ${fredId}:`, err);
    historyCache[fredId] = null;
    return null;
  }
}

/**
 * Period subset logic: '12M', '5Y', 'MAX'.
 * Identical semantics to original getPeriodSubset implementation.
 */
export function getPeriodSubset(historyData, period) {
  if (!Array.isArray(historyData) || historyData.length === 0) return [];

  if (period === 'MAX') return historyData.slice();

  const lastEntry = historyData[historyData.length - 1];
  const lastDate = new Date(lastEntry.date);
  if (isNaN(lastDate)) {
    // Fallback: last 12 points
    return historyData.slice(-12);
  }

  const yearsBack = period === '5Y' ? 5 : 1;
  const cutoff = new Date(lastDate);
  cutoff.setFullYear(cutoff.getFullYear() - yearsBack);

  const subset = historyData.filter(d => {
    const dt = new Date(d.date);
    return !isNaN(dt) && dt >= cutoff;
  });

  if (subset.length >= 3) return subset;

  const fallbackCount = Math.min(12, historyData.length);
  return historyData.slice(-fallbackCount);
}

/**
 * Compute history stats exactly like your original updateHistoryStats:
 * - current
 * - 3-step change (%)
 * - 6-step change (%)
 * - 12-step change (%)
 *
 * NOTE: "3M/6M/12M" here are *index steps* as before, not calendar-aware.
 */
export function computeHistoryStats(historyData) {
  if (!Array.isArray(historyData) || historyData.length === 0) return null;

  const values = historyData
    .map(item => item.value)
    .filter(v => Number.isFinite(v));

  if (!values.length) return null;

  const current = values[values.length - 1];
  const threeAgo = values.length >= 4 ? values[values.length - 4] : null;
  const sixAgo = values.length >= 7 ? values[values.length - 7] : null;
  const twelveAgo = values.length >= 13 ? values[values.length - 13] : null;

  const pct = (now, then) => {
    if (then === null || !Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
    return ((now - then) / Math.abs(then)) * 100;
  };

  const threeChangePct = pct(current, threeAgo);
  const sixChangePct = pct(current, sixAgo);
  const twelveChangePct = pct(current, twelveAgo);

  return {
    current,
    threeChangePct,
    sixChangePct,
    twelveChangePct,
  };
}
