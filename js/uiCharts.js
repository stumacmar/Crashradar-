// js/uiCharts.js
// -----------------------------------------------------------------------------
// Provides:
// - updateCompositeHistoryChart()
// - updateRiskRadarChart()
// - toggleIndicatorExpansion()
// - handleHistoryPeriodClick()
// -----------------------------------------------------------------------------

import { INDICATOR_CONFIG } from './config.js';
import { getSeriesHistory } from './historyService.js';

// -----------------------------------------------------------------------------
// STATE FOR EXPANDED INDICATOR
// -----------------------------------------------------------------------------
let expandedKey = null;

// -----------------------------------------------------------------------------
// COMPOSITE HISTORY CHART
// -----------------------------------------------------------------------------
let compositeChart = null;

export function updateCompositeHistoryChart(history = [], currentScore = null) {
  const ctx = document.getElementById('composite-history');
  if (!ctx) return;

  const labels = history.map(d => d.date);
  const values = history.map(d => d.score);

  if (currentScore != null) {
    labels.push('Now');
    values.push(currentScore);
  }

  if (compositeChart) compositeChart.destroy();

  compositeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Composite Stress',
        data: values,
        tension: 0.25,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 6 } },
        y: { min: 0, max: 100 }
      }
    }
  });
}

// -----------------------------------------------------------------------------
// RISK RADAR CHART
// -----------------------------------------------------------------------------
let radarChart = null;

export function updateRiskRadarChart(indicatorValuesByKey = {}, valuationValuesByKey = {}) {
  const ctx = document.getElementById('risk-radar');
  if (!ctx) return;

  const labels = Object.keys(INDICATOR_CONFIG);
  const values = labels.map(key => {
    const v = indicatorValuesByKey[key];
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  });

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Normalised Stress',
        data: values,
        fill: true,
        tension: 0.1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false }
        }
      }
    }
  });
}

// -----------------------------------------------------------------------------
// INDICATOR EXPANSION (History when clicking tile)
// -----------------------------------------------------------------------------
export function toggleIndicatorExpansion(key) {
  // collapse previous
  if (expandedKey && expandedKey !== key) {
    const prev = document.querySelector(`[data-ind-card="${expandedKey}"]`);
    if (prev) prev.classList.remove('expanded');
  }

  expandedKey = expandedKey === key ? null : key;

  const card = document.querySelector(`[data-ind-card="${key}"]`);
  if (!card) return;

  if (!expandedKey) {
    card.classList.remove('expanded');
    return;
  }

  card.classList.add('expanded');

  // now load history for this indicator
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.fromFred) return;

  const histBox = card.querySelector('.indicator-history');
  if (!histBox) return;

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  const { values, dates } = getSeriesHistory(key, '12M');

  // render chart
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: cfg.label + ' history',
        data: values,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

// -----------------------------------------------------------------------------
// HISTORY PERIOD SWITCHING (12M / 5Y / MAX)
// -----------------------------------------------------------------------------
export function handleHistoryPeriodClick(e) {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  const period = btn.dataset.period;
  if (!period) return;

  const card = btn.closest('.indicator.expanded');
  if (!card) return;

  const key = card.getAttribute('data-ind-card');
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.fromFred) return;

  // update active button state
  card.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const canvas = card.querySelector('.history-chart');
  if (!canvas) return;

  const { values, dates } = getSeriesHistory(key, period);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: cfg.label + ` (${period})`,
        data: values,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}
