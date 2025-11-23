// js/uiIndicators.js
// Builds Tier 1 / Tier 2 indicator tiles and valuation tiles,
// including manual input wiring and indicator hover tooltips.
//
// It does NOT mutate global state. Instead:
// - It reads values from indicatorValuesByKey / valuationValuesByKey.
// - It calls onManualChange(key, newValue|null) when LEI/BUFFETT/SHILLER_PE inputs change.
// - It calls onExpandIndicator(key) when a FRED-based indicator tile is clicked.

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  scaleIndicator,
  valuationStress,
  stressVerdictLabel,
} from './scoring.js';

/* ---------- Value formatting ---------- */

function formatValue(cfg, value) {
  if (!Number.isFinite(value)) return '--';
  const fmt = cfg && cfg.format;

  switch (fmt) {
    case 'pct1':
      return value.toFixed(1) + '%';
    case 'pct0':
      return value.toFixed(0) + '%';
    case 'plain0':
      return value.toFixed(0);
    case 'plain1':
      return value.toFixed(1);
    case 'plain2':
      return value.toFixed(2);
    default:
      return value.toString();
  }
}

/* ---------- Tooltip helpers ---------- */

function showTooltip(content, x, y) {
  const tooltip = document.getElementById('indicator-tooltip');
  if (!tooltip) return;
  tooltip.innerHTML = content;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('active');
}

function hideTooltip() {
  const tooltip = document.getElementById('indicator-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('active');
}

/* ---------- Indicator tile builder ---------- */

function buildIndicatorElement(
  key,
  cfg,
  currentValue,
  onManualChange,
  onExpandIndicator,
) {
  const s = scaleIndicator(key, currentValue, cfg);
  let cls = 'indicator';
  if (s != null) {
    if (s >= 66) cls += ' danger';
    else if (s >= 33) cls += ' warning';
  }

  const hasVal = Number.isFinite(currentValue);
  const valText = hasVal
    ? formatValue(cfg, currentValue)
    : '--';

  const thrText =
    cfg.threshold != null
      ? 'Threshold pivot: ' +
        formatValue(cfg, cfg.threshold) +
        (cfg.direction === 'below'
          ? ' (worse below)'
          : ' (worse above)')
      : '';

  const stressText =
    s != null
      ? 'Stress: ' + Math.round(s) + '/100'
      : 'Stress: --';

  const verdictText =
    s != null
      ? 'Verdict: ' + stressVerdictLabel(s)
      : 'Verdict: --';

  const src = cfg.fromFred ? 'Auto from FRED cache' : 'Manual input';
  const srcClass = cfg.fromFred ? 'data-source-auto' : 'data-source-manual';

  const tooltipHtml = cfg.tooltip
    ? cfg.tooltip +
      '<div style="margin-top:4px;font-size:0.65rem;color:#8b96b0;">Source: ' +
      (cfg.fromFred
        ? 'FRED (' + (cfg.fredId || 'series') + ')'
        : 'Manual input') +
      '</div>'
    : null;

  let manual = '';
  if (!cfg.fromFred && key === 'LEI') {
    manual =
      '<div class="manual-input-row">' +
        '<span>Set latest 6m %Δ for LEI:</span>' +
        `<input class="manual-input" type="number" step="0.1" data-ind-key="${key}"` +
        (hasVal ? ` value="${currentValue}"` : '') +
        '>' +
      '</div>';
  }

  const historySection = cfg.fromFred ? `
    <div class="indicator-history" data-history-key="${key}">
      <div class="history-period-selector">
        <button class="period-btn active" data-period="12M">12M</button>
        <button class="period-btn" data-period="5Y">5Y</button>
        <button class="period-btn" data-period="MAX">MAX</button>
      </div>
      <div class="history-chart-container">
        <canvas class="history-chart"></canvas>
      </div>
      <div class="history-stats"></div>
    </div>
  ` : '';

  const div = document.createElement('div');
  div.className = cls;
  div.setAttribute('data-ind-card', key);

  div.innerHTML =
    '<div class="indicator-header">' +
      '<div class="indicator-name">' + cfg.label + '</div>' +
      `<div class="indicator-value" data-ind-value="${key}">${valText}</div>` +
    '</div>' +
    `<div class="indicator-th
