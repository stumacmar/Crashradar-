// uiIndicators.js
// ============================================================================
// Builds Tier 1 / Tier 2 macro indicator tiles and valuation tiles.
// Handles:
//   - Auto indicator tiles (FRED-based) with expandable history sections
//   - Manual indicator inputs (LEI) and manual valuations (Buffett & CAPE)
//   - Tooltip display on hover
//   - Calls: onManualChange(key, newValue) and onExpandIndicator(key)
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  scaleIndicator,
  valuationStress,
  stressVerdictLabel,
} from './scoring.js';

/* ============================================================================
   TOOLTIP HANDLERS
============================================================================ */

function showTooltip(content, x, y) {
  const tooltip = document.getElementById('indicator-tooltip');
  if (!tooltip) return;
  tooltip.innerHTML = content;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.classList.add('active');
}

function hideTooltip() {
  const tooltip = document.getElementById('indicator-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('active');
}

/* ============================================================================
   FORMATTER
============================================================================ */

function formatByConfig(value, cfg) {
  if (!Number.isFinite(value)) return '--';

  switch (cfg.format) {
    case 'pct1':   return value.toFixed(1) + '%';
    case 'pct0':   return value.toFixed(0) + '%';
    case 'plain0': return value.toFixed(0);
    case 'plain1': return value.toFixed(1);
    case 'plain2': return value.toFixed(2);
    default:       return String(value);
  }
}

/* ============================================================================
   INDICATOR TILE BUILDER
============================================================================ */

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
  const valText = hasVal ? formatByConfig(currentValue, cfg) : '--';

  const thrText =
    cfg.threshold != null
      ? `Threshold pivot: ${formatByConfig(cfg.threshold, cfg)} ` +
        (cfg.direction === 'below' ? '(worse below)' : '(worse above)')
      : '';

  const stressText =
    s != null ? `Stress: ${Math.round(s)}/100` : 'Stress: --';

  const verdictText =
    s != null ? `Verdict: ${stressVerdictLabel(s)}` : 'Verdict: --';

  const srcLabel = cfg.fromFred ? 'Auto from FRED cache' : 'Manual input';
  const srcClass = cfg.fromFred ? 'data-source-auto' : 'data-source-manual';

  const tooltipHtml = cfg.tooltip
    ? `${cfg.tooltip}
       <div style="margin-top:4px;font-size:0.65rem;color:#8b96b0;">
         Source: ${cfg.fromFred ? 'FRED (' + (cfg.fredId || 'series') + ')' : 'Manual input'}
       </div>`
    : null;

  // Manual input (LEI only)
  let manualInputHtml = '';
  if (!cfg.fromFred && key === 'LEI') {
    manualInputHtml = `
      <div class="manual-input-row">
        <span>Set latest 6m %Δ for LEI:</span>
        <input class="manual-input" type="number" step="0.1"
               data-ind-key="${key}" ${hasVal ? `value="${currentValue}"` : ''}>
      </div>
    `;
  }

  // Expandable history section (FRED indicators only)
  const historyHtml = cfg.fromFred
    ? `
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
    `
    : '';

  // Construct tile
  const div = document.createElement('div');
  div.className = cls;
  div.setAttribute('data-ind-card', key);

  div.innerHTML = `
    <div class="indicator-header">
      <div class="indicator-name">${cfg.label}</div>
      <div class="indicator-value" data-ind-value="${key}">${valText}</div>
    </div>

    <div class="indicator-threshold">${thrText}</div>
    <div class="indicator-threshold" data-ind-stress="${key}">${stressText}</div>
    <div class="indicator-threshold" data-ind-verdict="${key}">${verdictText}</div>
    <div class="indicator-threshold">${cfg.description || ''}</div>

    <div class="data-source-indicator">
      <span class="data-source-dot ${srcClass}"></span>
      <span class="source-tag">${srcLabel}</span>
    </div>

    ${manualInputHtml}
    ${historyHtml}
  `;

  // Expand on tile click (FRED only)
  if (cfg.fromFred) {
    div.addEventListener('click', e => {
      if (
        e.target.closest('.manual-input') ||
        e.target.closest('.history-period-selector') ||
        e.target.closest('.history-chart-container')
      ) return;

      if (typeof onExpandIndicator === 'function') {
        onExpandIndicator(key);
      }
    });
  }

  // Tooltip handling
  if (tooltipHtml) {
    div.addEventListener('mouseenter', e => {
      showTooltip(tooltipHtml, e.pageX + 10, e.pageY + 10);
    });
    div.addEventListener('mousemove', e => {
      showTooltip(tooltipHtml, e.pageX + 10, e.pageY + 10);
    });
    div.addEventListener('mouseleave', hideTooltip);
  }

  // Manual LEI input binding
  if (!cfg.fromFred && key === 'LEI') {
    const input = div.querySelector('.manual-input[data-ind-key]');
    if (input && typeof onManualChange === 'function') {
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        onManualChange(key, Number.isFinite(v) ? v : null);
      });
    }
  }

  return div;
}

/* ============================================================================
   VALUATION TILE BUILDER
============================================================================ */

function buildValuationElement(
  key,
  cfg,
  currentValue,
  onManualChange,
) {
  const s = valuationStress(key, currentValue);

  let cls = 'indicator';
  if (s != null) {
    if (s >= 66) cls += ' danger';
    else if (s >= 33) cls += ' warning';
  }

  const hasVal = Number.isFinite(currentValue);
  const valText = hasVal ? formatByConfig(currentValue, cfg) : '--';

  const stressText =
    s != null ? `Stress: ${Math.round(s)}/100` : 'Stress: --';

  const verdictText =
    s != null ? `Verdict: ${stressVerdictLabel(s)}` : 'Verdict: --';

  let dangerLabel = '';
  if (key === 'BUFFETT') dangerLabel = 'Danger band: > 200%';
  else if (key === 'SHILLER_PE') dangerLabel = 'Danger band: > 30';

  const tooltipHtml = cfg.tooltip
    ? `${cfg.tooltip}
       <div style="margin-top:4px;font-size:0.65rem;color:#8b96b0;">
         Source: Manual input
       </div>`
    : null;

  const div = document.createElement('div');
  div.className = cls;
  div.setAttribute('data-val-card', key);

  div.innerHTML = `
    <div class="indicator-header">
      <div class="indicator-name">${cfg.label}</div>
      <div class="indicator-value" data-val-value="${key}">${valText}</div>
    </div>

    <div class="indicator-threshold">${dangerLabel}</div>
    <div class="indicator-threshold" data-val-stress="${key}">${stressText}</div>
    <div class="indicator-threshold" data-val-verdict="${key}">${verdictText}</div>
    <div class="indicator-threshold">${cfg.description || ''}</div>

    <div class="data-source-indicator">
      <span class="data-source-dot data-source-manual"></span>
      <span class="source-tag">Manual input</span>
    </div>

    <div class="manual-input-row">
      <span>Set current reading:</span>
      <input class="manual-input" type="number" step="0.1"
             data-val-key="${key}" ${hasVal ? `value="${currentValue}"` : ''}>
    </div>
  `;

  // Tooltip
  if (tooltipHtml) {
    div.addEventListener('mouseenter', e => {
      showTooltip(tooltipHtml, e.pageX + 10, e.pageY + 10);
    });
    div.addEventListener('mousemove', e => {
      showTooltip(tooltipHtml, e.pageX + 10, e.pageY + 10);
    });
    div.addEventListener('mouseleave', hideTooltip);
  }

  // Manual valuation binding
  const input = div.querySelector('.manual-input[data-val-key]');
  if (input && typeof onManualChange === 'function') {
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      onManualChange(key, Number.isFinite(v) ? v : null);
    });
  }

  return div;
}

/* ============================================================================
   PUBLIC RENDERING FUNCTIONS
============================================================================ */

export function renderMacroIndicators({
  indicatorValuesByKey = {},
  onManualChange,
  onExpandIndicator,
}) {
  const t1 = document.getElementById('tier1-container');
  const t2 = document.getElementById('tier2-container');

  if (!t1 || !t2) return;

  t1.innerHTML = '';
  t2.innerHTML = '';

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    const current = indicatorValuesByKey[key];

    const tile = buildIndicatorElement(
      key,
      cfg,
      current,
      onManualChange,
      onExpandIndicator,
    );

    if (cfg.tier === 1) t1.appendChild(tile);
    else t2.appendChild(tile);
  });
}

export function renderValuationIndicators({
  valuationValuesByKey = {},
  onManualChange,
}) {
  const box = document.getElementById('valuations-container');
  if (!box) return;

  box.innerHTML = '';

  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];

    const tile = buildValuationElement(
      key,
      cfg,
      current,
      onManualChange,
    );

    box.appendChild(tile);
  });
}
