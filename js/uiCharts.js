// js/uiCharts.js
// Chart.js wiring for:
// - Composite history chart (with regime bands)
// - Risk radar chart
// - Indicator history charts + stats
//
// This is a modular extraction of:
// - compositeRegimeBands
// - renderCompositeHistoryChart
// - renderRiskRadarChart
// - loadAndRenderIndicatorHistory
// - renderIndicatorHistory
// - updateHistoryStats
// - getPeriodSubset
// - renderNoHistoryMessage
//
// Business logic (transforms, stats) is delegated to historyService.js
// and scoring.js. Visual behaviour and thresholds mirror the original.

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  valuationStress,
  scaleIndicator,
} from './scoring.js';

import {
  loadProcessedHistory,
  getPeriodSubset,
  computeHistoryStats,
} from './historyService.js';

// Local state: chart instances and which indicator is expanded.
const charts = {
  compositeHistory: null,
  radar: null,
};
const indicatorCharts = Object.create(null);
let expandedIndicator = null;

/* ---------- Loading overlay (same UX as original) ---------- */

function showLoading(message = 'Loading data...') {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (!overlay || !text) return;
  text.textContent = message;
  overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
}

/* ---------- Composite regime bands plugin (unchanged) ---------- */

const compositeRegimeBands = {
  id: 'compositeRegimeBands',
  beforeDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales || !scales.y) return;
    const yScale = scales.y;

    const ranges = [
      { min: 0,  max: 30, color: 'rgba(30,194,139,0.10)' },   // low
      { min: 30, max: 50, color: 'rgba(255,194,71,0.10)' },   // elevated
      { min: 50, max: 70, color: 'rgba(255,96,112,0.10)' },   // high
      { min: 70, max: 100, color: 'rgba(255,96,112,0.18)' },  // critical
    ];

    ctx.save();
    ranges.forEach(r => {
      const yTop = yScale.getPixelForValue(r.max);
      const yBottom = yScale.getPixelForValue(r.min);
      ctx.fillStyle = r.color;
      ctx.fillRect(
        chartArea.left,
        yTop,
        chartArea.right - chartArea.left,
        yBottom - yTop,
      );
    });
    ctx.restore();
  },
};

/* ---------- Composite history chart ---------- */

/**
 * Render/update the composite history chart.
 *
 * @param {Array<{date:string, score:number}>} compositeHistory
 * @param {number|null} compositeScore
 */
export function updateCompositeHistoryChart(compositeHistory, compositeScore) {
  const canvas = document.getElementById('composite-history');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (charts.compositeHistory) {
    charts.compositeHistory.destroy();
    charts.compositeHistory = null;
  }

  let data = Array.isArray(compositeHistory)
    ? compositeHistory.slice()
    : [];

  if ((!data || !data.length) && Number.isFinite(compositeScore)) {
    const today = new Date().toISOString().slice(0, 10);
    data = [{ date: today, score: compositeScore }];
  }

  if (!data || !data.length) {
    charts.compositeHistory = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      plugins: [compositeRegimeBands],
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Composite Stress History (no data yet)',
            color: '#e8eeff',
            font: { size: 11 },
          },
        },
      },
    });
    return;
  }

  const labels = data.map(d => {
    const dt = new Date(d.date);
    if (isNaN(dt)) return d.date;
    return dt.toLocaleDateString('en-GB', {
      month: 'short',
      year: '2-digit',
    });
  });

  const values = data.map(d => d.score);

  charts.compositeHistory = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Composite Stress',
          data: values,
          borderColor: '#6b9eff',
          backgroundColor: 'rgba(107,158,255,0.14)',
          tension: 0.32,
          fill: true,
          pointRadius: 2,
        },
      ],
    },
    plugins: [compositeRegimeBands],
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: '#e8eeff',
            font: { size: 9 },
          },
        },
        title: {
          display: true,
          text: 'Composite Stress History',
          color: '#e8eeff',
          font: { size: 11 },
        },
        tooltip: {
          backgroundColor: 'rgba(18,24,43,0.9)',
          titleColor: '#e8eeff',
          bodyColor: '#e8eeff',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 4,
          displayColors: false,
          callbacks: {
            label: (ctxTooltip) =>
              `Composite: ${ctxTooltip.parsed.y.toFixed(1)} / 100`,
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: '#8b96b0',
            font: { size: 8 },
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        x: {
          ticks: {
            color: '#8b96b0',
            font: { size: 8 },
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    },
  });
}

/* ---------- Risk radar chart ---------- */

/**
 * Render/update the radar chart using current stresses.
 *
 * @param {Object<string, number|null>} indicatorValuesByKey
 * @param {Object<string, number|null>} valuationValuesByKey
 */
export function updateRiskRadarChart(
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
) {
  const canvas = document.getElementById('risk-radar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (charts.radar) {
    charts.radar.destroy();
    charts.radar = null;
  }

  const labels = [];
  const data = [];

  // Per-indicator stresses
  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    const current = indicatorValuesByKey[key];
    const s = scaleIndicator(key, current, cfg);
    if (s != null) {
      labels.push(cfg.label);
      data.push(Math.round(s));
    }
  });

  // Combined valuation stress
  let vSum = 0;
  let vW = 0;
  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];
    const s = valuationStress(key, current);
    if (s != null && cfg.weight) {
      vSum += s * cfg.weight;
      vW += cfg.weight;
    }
  });
  if (vW) {
    labels.push('Valuations (Buffett + CAPE)');
    data.push(Math.round(vSum / vW));
  }

  if (!labels.length) {
    // No data yet: draw a simple message
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8b96b0';
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Radar will render once indicators are populated.',
      canvas.width / 2,
      canvas.height / 2,
    );
    return;
  }

  charts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Normalized Stress (0–100)',
          data,
          borderColor: '#6b9eff',
          backgroundColor: 'rgba(107,158,255,0.18)',
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          angleLines: { color: 'rgba(255,255,255,0.05)' },
          grid: { color: 'rgba(255,255,255,0.09)' },
          suggestedMin: 0,
          suggestedMax: 100,
          ticks: { display: false },
          pointLabels: {
            color: '#8b96b0',
            font: { size: 7 },
          },
        },
      },
    },
  });
}

/* ---------- Indicator history charts ---------- */

function renderNoHistoryMessage(key) {
  const container = document.querySelector(
    `[data-ind-card="${key}"] .history-chart-container`,
  );
  if (container) {
    container.innerHTML =
      '<div class="no-data-message">Historical data not available</div>';
  }

  const statsEl = document.querySelector(
    `[data-ind-card="${key}"] .history-stats`,
  );
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="no-data-message">No historical statistics</div>';
  }
}

/**
 * Render a single indicator history chart for a given subset and period.
 *
 * @param {string} key - indicator key
 * @param {object} cfg - INDICATOR_CONFIG[key]
 * @param {Array<{date:string, value:number}>} historyData
 * @param {string} period - '12M'|'5Y'|'MAX'
 */
function renderIndicatorHistory(key, cfg, historyData, period) {
  if (!historyData || !historyData.length) {
    renderNoHistoryMessage(key);
    return;
  }

  const subset = getPeriodSubset(historyData, period);
  if (!subset || !subset.length) {
    renderNoHistoryMessage(key);
    return;
  }

  const canvas = document.querySelector(
    `[data-ind-card="${key}"] .history-chart`,
  );
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Destroy previous chart if any.
  if (indicatorCharts[key]) {
    indicatorCharts[key].destroy();
    delete indicatorCharts[key];
  }

  const labels = subset.map(item => {
    const date = new Date(item.date);
    return isNaN(date)
      ? item.date
      : date.toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        });
  });

  const values = subset
    .map(item => item.value)
    .filter(v => Number.isFinite(v));

  if (!values.length) {
    renderNoHistoryMessage(key);
    return;
  }

  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  if (!isFinite(minVal) || !isFinite(maxVal)) {
    renderNoHistoryMessage(key);
    return;
  }

  // Autoscale with padding, like original.
  if (Math.abs(maxVal - minVal) < 1e-6) {
    const center = minVal;
    minVal = center - 1;
    maxVal = center + 1;
  } else {
    const span = maxVal - minVal;
    const pad = span * 0.15;
    minVal -= pad;
    maxVal += pad;
  }

  const roundTo = (value, step) => Math.round(value / step) * step;
  const step = (maxVal - minVal) > 10 ? 1 : 0.5;
  minVal = roundTo(minVal, step);
  maxVal = roundTo(maxVal, step);

  // Line colour based on stress at latest subset point.
  let lineColor = '#6b9eff';
  const latestVal = subset[subset.length - 1].value;
  const approxStress = scaleIndicator(key, latestVal, cfg);
  if (approxStress != null) {
    if (approxStress >= 66) lineColor = '#ff6070';
    else if (approxStress >= 33) lineColor = '#ffc247';
    else lineColor = '#1ec28b';
  }

  indicatorCharts[key] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: cfg.label,
          data: subset.map(d => d.value),
          borderColor: lineColor,
          backgroundColor: lineColor + '20',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: lineColor,
          pointBorderColor: '#12182b',
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18,24,43,0.9)',
          titleColor: '#e8eeff',
          bodyColor: '#e8eeff',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 4,
          displayColors: false,
          callbacks: {
            label(context) {
              const value = context.parsed.y;
              return cfg.format ? cfg.format(value) : value;
            },
          },
        },
      },
      scales: {
        y: {
          min: minVal,
          max: maxVal,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#8b96b0',
            font: { size: 9 },
          },
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: {
            color: '#8b96b0',
            font: { size: 9 },
          },
        },
      },
    },
  });
}

/**
 * Update the history stats box for a given indicator.
 *
 * @param {string} key
 * @param {object} cfg
 * @param {Array<{date:string, value:number}>} historyData
 */
function updateHistoryStatsUI(key, cfg, historyData) {
  const stats = computeHistoryStats(historyData);
  if (!stats) {
    const statsContainer = document.querySelector(
      `[data-ind-card="${key}"] .history-stats`,
    );
    if (statsContainer) {
      statsContainer.innerHTML =
        '<div class="no-data-message">No historical statistics</div>';
    }
    return;
  }

  const { current, threeChangePct, sixChangePct, twelveChangePct } = stats;

  const statsContainer = document.querySelector(
    `[data-ind-card="${key}"] .history-stats`,
  );
  if (!statsContainer) return;

  const formatVal = (v) => (cfg.format ? cfg.format(v) : v.toFixed(2));
  const col = (val) => (val !== null && val >= 0 ? '#1ec28b' : '#ff6070');

  statsContainer.innerHTML = `
    <div class="history-stat">
      <div class="history-stat-label">Current</div>
      <div class="history-stat-value">${formatVal(current)}</div>
    </div>
    <div class="history-stat">
      <div class="history-stat-label">3M Change</div>
      <div class="history-stat-value" style="color:${col(threeChangePct)}">
        ${threeChangePct !== null ? threeChangePct.toFixed(1) + '%' : '--'}
      </div>
    </div>
    <div class="history-stat">
      <div class="history-stat-label">6M Change</div>
      <div class="history-stat-value" style="color:${col(sixChangePct)}">
        ${sixChangePct !== null ? sixChangePct.toFixed(1) + '%' : '--'}
      </div>
    </div>
    <div class="history-stat">
      <div class="history-stat-label">12M Change</div>
      <div class="history-stat-value" style="color:${col(twelveChangePct)}">
        ${twelveChangePct !== null ? twelveChangePct.toFixed(1) + '%' : '--'}
      </div>
    </div>
  `;
}

/**
 * Expand/collapse an indicator tile and load its history.
 * Called from app.js when uiIndicators signals a tile click.
 *
 * @param {string} key - indicator key
 */
export async function toggleIndicatorExpansion(key) {
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg) return;

  const element = document.querySelector(
    `[data-ind-card="${key}"]`,
  );
  if (!element) return;

  // Collapse same tile → reset.
  if (expandedIndicator === key) {
    element.classList.remove('expanded');
    expandedIndicator = null;
    if (indicatorCharts[key]) {
      indicatorCharts[key].destroy();
      delete indicatorCharts[key];
    }
    return;
  }

  // Collapse previous expanded, if any.
  if (expandedIndicator) {
    const prev = document.querySelector(
      `[data-ind-card="${expandedIndicator}"]`,
    );
    if (prev) prev.classList.remove('expanded');
    if (indicatorCharts[expandedIndicator]) {
      indicatorCharts[expandedIndicator].destroy();
      delete indicatorCharts[expandedIndicator];
    }
  }

  element.classList.add('expanded');
  expandedIndicator = key;

  if (!cfg.fromFred || !cfg.fredId) {
    renderNoHistoryMessage(key);
    return;
  }

  showLoading(`Loading historical data for ${cfg.label}...`);
  try {
    const history = await loadProcessedHistory(cfg);
    if (history && history.length > 0) {
      renderIndicatorHistory(key, cfg, history, '12M');
      updateHistoryStatsUI(key, cfg, history);

      // Set default active button to 12M
      const selector = `[data-ind-card="${key}"] .history-period-selector`;
      const selectorEl = document.querySelector(selector);
      if (selectorEl) {
        selectorEl.querySelectorAll('.period-btn').forEach(btn => {
          btn.classList.toggle(
            'active',
            btn.getAttribute('data-period') === '12M',
          );
        });
      }
    } else {
      renderNoHistoryMessage(key);
    }
  } catch (err) {
    console.error(`Error loading historical data for ${key}:`, err);
    renderNoHistoryMessage(key);
  } finally {
    hideLoading();
  }
}

/**
 * Handle clicks on history period buttons (event delegation).
 * To be wired from app.js:
 *
 * document.addEventListener('click', (e) => {
 *   uiCharts.handleHistoryPeriodClick(e);
 * });
 */
export async function handleHistoryPeriodClick(event) {
  const btn = event.target.closest('.period-btn');
  if (!btn) return;

  const card = btn.closest('[data-ind-card]');
  if (!card) return;

  const key = card.getAttribute('data-ind-card');
  const cfg = INDICATOR_CONFIG[key];
  if (!cfg || !cfg.fromFred || !cfg.fredId) return;

  const period = btn.getAttribute('data-period') || '12M';

  try {
    const history = await loadProcessedHistory(cfg);
    if (!history || !history.length) {
      renderNoHistoryMessage(key);
      return;
    }

    // Update button active states
    const group = btn.parentElement;
    if (group) {
      group.querySelectorAll('.period-btn').forEach(b =>
        b.classList.remove('active'),
      );
    }
    btn.classList.add('active');

    renderIndicatorHistory(key, cfg, history, period);
    updateHistoryStatsUI(key, cfg, history);
  } catch (err) {
    console.error(`Error changing history period for ${key}:`, err);
    renderNoHistoryMessage(key);
  }
}
