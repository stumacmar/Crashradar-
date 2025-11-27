// uiCharts.js
// ============================================================================
// Handles:
//   1. Composite history line chart
//   2. Radar chart (normalised stress)
//   3. Expanded indicator tile history rendering
//   4. History-period selector logic (12M / 5Y / MAX)
//
// IMPORTANT:
// - This module NEVER reads raw FRED data.
// - It uses the processed series that app.js attaches to INDICATOR_CONFIG[key].historySeries:
//       { dates: [...], values: [...] }
// ============================================================================

import { INDICATOR_CONFIG } from './config.js';

// Cached Chart.js instances
let compositeChart = null;
let radarChart = null;
const historyCharts = {};   // per-indicator chart instance cache

/* ============================================================================
   1. Composite Stress — main line chart
============================================================================ */

export function updateCompositeHistoryChart(history = []) {
  const ctx = document.getElementById('composite-history');
  if (!ctx) return;

  const labels = history.map(d => d.date);
  const values = history.map(d => d.score);

  if (compositeChart) compositeChart.destroy();

  compositeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Composite Stress',
        data: values,
        borderWidth: 2,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { min: 0, max: 100 }
      }
    }
  });
}

/* ============================================================================
   2. Radar Chart — normalised macro stress
============================================================================ */

export function updateRiskRadarChart(indicatorValuesByKey, valuationValuesByKey) {
  const ctx = document.getElementById('risk-radar');
  if (!ctx) return;

  const labels = [];
  const data = [];

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    labels.push(cfg.label);
    const v = indicatorValuesByKey[key];
    data.push(Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);
  });

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Normalised Stress',
        data,
        borderWidth: 2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        r: { min: 0, max: 100 }
      }
    }
  });
}

/* ============================================================================
   3. Expand indicator tile + render mini history chart
============================================================================ */

export function toggleIndicatorExpansion(key) {
  const card = document.querySelector(`[data-ind-card="${key}"]`);
  if (!card) return;

  const expanded = card.classList.toggle('expanded');
  if (!expanded) return;

  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.historySeries) return;

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  const { dates, values } = cfg.historySeries;

  if (historyCharts[key]) historyCharts[key].destroy();

  historyCharts[key] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: `${cfg.label} history`,
        data: values,
        borderWidth: 1,
        tension: 0.2
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { display: true } }
    }
  });
}

/* ============================================================================
   4. History period selector (12M / 5Y / MAX)
============================================================================ */

export function handleHistoryPeriodClick(e) {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  const period = btn.dataset.period;
  const card = btn.closest('[data-history-key]');
  if (!card) return;

  const key = card.dataset.historyKey;
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.historySeries) return;

  const allDates = cfg.historySeries.dates;
  const allValues = cfg.historySeries.values;

  let dates = allDates;
  let values = allValues;

  // Determine period window
  if (period !== 'MAX') {
    const cutoffDays =
      period === '12M' ? 365 :
      period === '5Y'  ? 365 * 5 :
      null;

    if (cutoffDays) {
      const start = Math.max(0, dates.length - cutoffDays);
      dates = dates.slice(start);
      values = values.slice(start);
    }
  }

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  if (historyCharts[key]) historyCharts[key].destroy();

  historyCharts[key] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: `${cfg.label} history`,
        data: values,
        borderWidth: 1,
        tension: 0.2
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { display: true } }
    }
  });

  // Activate button highlight
  card.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
