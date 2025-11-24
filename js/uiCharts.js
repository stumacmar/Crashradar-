import {
  loadProcessedHistory,
  getPeriodSubset,
  computeHistoryStats
} from './historyService.js';

import {
  INDICATOR_CONFIG
} from './config.js';

let indicatorCharts = {};
let expandedIndicator = null;

/**
 * Use subset for stats (fix for insane % numbers)
 */
function updateStats(key, cfg, subset) {
  const stats = computeHistoryStats(subset);
  const el = document.querySelector(
    `[data-ind-card="${key}"] .history-stats`
  );

  if (!stats) {
    el.innerHTML = `<div class="no-data-message">No historical statistics</div>`;
    return;
  }

  const fmt = x => (Number.isFinite(x) ? x.toFixed(1) + '%' : '--');

  el.innerHTML = `
    <div class="history-stat"><strong>Current:</strong> ${stats.current.toFixed(2)}</div>
    <div class="history-stat"><strong>3M:</strong> ${fmt(stats.threeChangePct)}</div>
    <div class="history-stat"><strong>6M:</strong> ${fmt(stats.sixChangePct)}</div>
    <div class="history-stat"><strong>12M:</strong> ${fmt(stats.twelveChangePct)}</div>
  `;
}

/**
 * Main renderer for indicator history
 */
async function renderHistory(key, cfg, period = '12M') {
  const history = await loadProcessedHistory(cfg);
  const subset = getPeriodSubset(history, period);

  const canvas = document.querySelector(
    `[data-ind-card="${key}"] .history-chart`
  );

  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (indicatorCharts[key]) {
    indicatorCharts[key].destroy();
  }

  if (!subset.length) {
    canvas.parentElement.innerHTML =
      `<div class="no-data-message">No historical data</div>`;
    return;
  }

  const labels = subset.map(d => d.date);
  const values = subset.map(d => d.value);

  indicatorCharts[key] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: '#6b9eff',
          backgroundColor: 'rgba(107,158,255,0.2)',
          tension: 0.3,
          pointRadius: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 0 } },
        y: { beginAtZero: false }
      }
    }
  });

  updateStats(key, cfg, subset);
}

/**
 * Toggle expansion
 */
export async function toggleIndicatorExpansion(key) {
  if (expandedIndicator === key) {
    const prev = document.querySelector(
      `[data-ind-card="${key}"]`
    );
    if (prev) prev.classList.remove('expanded');
    expandedIndicator = null;
    return;
  }

  if (expandedIndicator) {
    const prev = document.querySelector(
      `[data-ind-card="${expandedIndicator}"]`
    );
    if (prev) prev.classList.remove('expanded');
  }

  const card = document.querySelector(`[data-ind-card="${key}"]`);
  if (!card) return;

  expandedIndicator = key;
  card.classList.add('expanded');

  const cfg = INDICATOR_CONFIG[key];
  if (!cfg?.fromFred) return;

  await renderHistory(key, cfg, '12M');
}
