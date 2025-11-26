// js/uiCharts.js
// ------------------------------------------------------------
// Renders:
// 1. Composite History Line Chart
// 2. Risk Radar Chart
// 3. Handles indicator tile expansion + history charts
// 4. Handles history-period click events
// ------------------------------------------------------------

import { INDICATOR_CONFIG } from './config.js';

// Cached Chart.js instances
let compositeChart = null;
let radarChart = null;
const historyCharts = {};   // per-indicator mini-charts

/* ------------------------------------------------------------
   1. Composite History — main line chart
------------------------------------------------------------ */
export function updateCompositeHistoryChart(history = [], latest = null) {
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
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100 }
      }
    }
  });
}

/* ------------------------------------------------------------
   2. Radar Chart — normalised indicator stress
------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   3. Expand indicator tile + render per-indicator history
------------------------------------------------------------ */
export function toggleIndicatorExpansion(key) {
  const card = document.querySelector(`[data-ind-card="${key}"]`);
  if (!card) return;

  const expanded = card.classList.toggle('expanded');
  if (!expanded) return;

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.historySeries) return;

  const { dates, values } = cfg.historySeries;

  if (historyCharts[key]) historyCharts[key].destroy();

  historyCharts[key] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: cfg.label + ' history',
        data: values,
        borderWidth: 1,
        tension: 0.15
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { display: true } }
    }
  });
}

/* ------------------------------------------------------------
   4. Handle history period buttons (12M / 5Y / MAX)
------------------------------------------------------------ */
export function handleHistoryPeriodClick(e) {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  const period = btn.dataset.period;
  const card = btn.closest('[data-history-key]');
  if (!card) return;

  const key = card.dataset.historyKey;
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.historySeries) return;

  let { dates, values } = cfg.historySeries;

  const cutoff = {
    '12M': 365,
    '5Y': 365 * 5,
    'MAX': null,
  }[period];

  if (cutoff) {
    const start = dates.length - cutoff;
    dates = dates.slice(start);
    values = values.slice(start);
  }

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  if (historyCharts[key]) historyCharts[key].destroy();

  historyCharts[key] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: cfg.label + ' history',
        data: values,
        borderWidth: 1,
        tension: 0.15
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { display: true } }
    }
  });
}
