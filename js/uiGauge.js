// uiGauge.js
// ============================================================================
// Updates:
//   - Composite gauge (value, needle, fill)
//   - Regime label
//   - Recession / valuation / labour panels
//   - Coverage badge + data-quality tile
//   - Alert banner
//   - Insight text
//   - Contribution list
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  derivedRecessionRisk,
  derivedValuationRisk,
  derivedLaborStress,
  computeContributions,
  stressVerdictLabel,
} from './scoring.js';

/* ============================================================================
   Coverage calculation
============================================================================ */

function computeCoverage(indicatorValuesByKey, valuationValuesByKey) {
  const total =
    Object.keys(INDICATOR_CONFIG).length +
    Object.keys(VALUATION_CONFIG).length;

  if (!total) {
    return {
      total: 0,
      used: 0,
      coverageRatio: 0,
    };
  }

  let used = 0;

  Object.keys(INDICATOR_CONFIG).forEach(key => {
    const v = indicatorValuesByKey[key];
    if (Number.isFinite(v)) used++;
  });

  Object.keys(VALUATION_CONFIG).forEach(key => {
    const v = valuationValuesByKey[key];
    if (Number.isFinite(v)) used++;
  });

  return {
    total,
    used,
    coverageRatio: used / total,
  };
}

/* ============================================================================
   Main gauge + tiles + alert
============================================================================ */

export function updateGaugeAndStatus({
  compositeScore,
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  cacheMeta = {},
}) {
  const scoreEl = document.getElementById('composite-score');
  const needle = document.getElementById('needle');
  const fill = document.getElementById('risk-fill');
  const regimeEl = document.getElementById('regime-label');
  const alert = document.getElementById('alert-banner');

  const recessionRiskEl = document.getElementById('recession-risk-display');
  const valuationRiskEl = document.getElementById('valuation-risk-display');
  const laborRiskEl = document.getElementById('labor-risk-display');

  const inputsBadge = document.getElementById('inputs-badge');
  const qualityDisplay = document.getElementById('quality-display');

  if (!scoreEl || !needle || !fill || !regimeEl || !alert ||
      !recessionRiskEl || !valuationRiskEl || !laborRiskEl) {
    return;
  }

  const { cacheAgeDays = null } = cacheMeta;

  const { total, used, coverageRatio } =
    computeCoverage(indicatorValuesByKey, valuationValuesByKey);

  const coveragePct = total ? Math.round(coverageRatio * 100) : null;

  // Inputs badge + tile
  if (inputsBadge) {
    inputsBadge.textContent = `Inputs: ${used}/${total} populated`;
  }
  if (qualityDisplay) {
    qualityDisplay.textContent = total ? `${coveragePct}%` : '--';
  }

  // No composite available
  if (compositeScore == null || !Number.isFinite(compositeScore)) {
    scoreEl.textContent = '--';
    fill.style.width = '0%';
    needle.style.transform = 'translateX(-50%) rotate(0deg)';
    regimeEl.textContent = 'COMPOSITE STRESS — insufficient data';

    recessionRiskEl.textContent = '--';
    valuationRiskEl.textContent = '--';
    laborRiskEl.textContent = '--';

    let msg = 'No composite yet. Check FRED cache and manual LEI / valuation inputs.';

    if (cacheAgeDays != null && cacheAgeDays > 10) {
      msg = `Data warning: FRED cache is ${cacheAgeDays.toFixed(1)} days old. Update fred_cache.json. ${msg}`;
    }

    alert.textContent = msg;
    return;
  }

  /* ------------------------------------------------------------------------
     Composite stress gauge
  ------------------------------------------------------------------------ */

  const v = Math.round(compositeScore);
  scoreEl.textContent = v.toString();
  fill.style.width = `${v}%`;

  const angle = (v / 100) * 360;
  needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;

  let regime;
  if (v <= 30) regime = 'Low stress regime';
  else if (v <= 50) regime = 'Elevated — monitor';
  else if (v <= 70) regime = 'High — defensive bias';
  else regime = 'Critical regime';

  regimeEl.textContent = `COMPOSITE STRESS — ${regime}`;

  /* ------------------------------------------------------------------------
     Risk tiles
  ------------------------------------------------------------------------ */

  const recessionLabel = derivedRecessionRisk(v);
  const valuationLabel = derivedValuationRisk(valuationValuesByKey);
  const laborLabel = derivedLaborStress(indicatorValuesByKey);

  recessionRiskEl.textContent = recessionLabel;
  valuationRiskEl.textContent = valuationLabel;
  laborRiskEl.textContent = laborLabel;

  /* ------------------------------------------------------------------------
     Alert banner logic
  ------------------------------------------------------------------------ */

  let prefix = '';

  if (cacheAgeDays != null && cacheAgeDays > 10) {
    prefix += `Data warning: FRED cache is ${cacheAgeDays.toFixed(1)} days old. Update fred_cache.json. `;
  }

  if (coverageRatio < 0.8) {
    prefix += 'Coverage below 80%. Treat composite as tentative. ';
  }

  if (v >= 70) {
    alert.innerHTML =
      `${prefix}<strong>Critical:</strong> Composite = ${v}. Macro + valuations in historical danger cluster.`;
  } else if (v >= 50) {
    alert.innerHTML =
      `${prefix}<strong>Warning:</strong> Composite = ${v}. Elevated risk — inspect indicator tiles.`;
  } else {
    alert.textContent =
      `${prefix}Composite = ${v}. No classic crash cluster on this configuration; still consider exogenous shocks.`;
  }
}

/* ============================================================================
   Valuation summary box
============================================================================ */

export function syncValuationSummary(valuationValuesByKey = {}) {
  const buffett = valuationValuesByKey.BUFFETT;
  const cape = valuationValuesByKey.SHILLER_PE;

  const bEl = document.getElementById('current-buffett-label');
  const cEl = document.getElementById('current-cape-label');

  if (bEl) {
    bEl.textContent = Number.isFinite(buffett)
      ? `Buffett: ${buffett.toFixed(1)}%`
      : 'Buffett: --';
  }

  if (cEl) {
    cEl.textContent = Number.isFinite(cape)
      ? `CAPE: ${cape.toFixed(1)}`
      : 'CAPE: --';
  }
}

/* ============================================================================
   Insight text (Interpretation)
============================================================================ */

export function updateInsightText({
  compositeScore,
  valuationValuesByKey = {},
}) {
  const el = document.getElementById('insight-text');
  if (!el) return;

  const c = compositeScore;
  const vRisk = derivedValuationRisk(valuationValuesByKey);

  if (!Number.isFinite(c)) {
    el.textContent =
      'No composite yet. Ensure fred_cache.json is fresh and LEI / Buffett / CAPE are populated.';
  } else if (c >= 70 && vRisk === 'High') {
    el.textContent =
      'Macro + valuations both extreme: configuration consistent with major drawdown regimes.';
  } else if (c >= 50 && vRisk !== 'Low') {
    el.textContent =
      'Elevated macro stress with stretched valuations: risk-reward skewed left.';
  } else if (c < 40 && vRisk === 'High') {
    el.textContent =
      'Macro relatively okay but valuations rich: vulnerable to shocks or policy error.';
  } else if (c < 40 && vRisk === 'Low') {
    el.textContent =
      'Macro and valuations both moderate vs history: no classic crash cluster here.';
  } else {
    el.textContent =
      'Mixed configuration. Use radar and tiles to see what drives the score.';
  }
}

/* ============================================================================
   Contribution list
============================================================================ */

export function updateContributions({
  compositeScore,
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
}) {
  const container = document.getElementById('contrib-list');
  if (!container) return;

  container.innerHTML = '';

  if (!Number.isFinite(compositeScore) || compositeScore <= 0) {
    container.innerHTML =
      '<div class="contrib-placeholder">Populate indicators and valuations to see which ones drive the composite.</div>';
    return;
  }

  const items = computeContributions(
    indicatorValuesByKey,
    valuationValuesByKey,
    compositeScore,
  );

  if (!items.length) {
    container.innerHTML =
      '<div class="contrib-placeholder">No valid contributions yet. Check data coverage and manual inputs.</div>';
    return;
  }

  const top = items.slice(0, 5);

  top.forEach(item => {
    const verdict = stressVerdictLabel(item.stress);

    const row = document.createElement('div');
    row.className = 'contrib-item';

    row.innerHTML = `
      <div class="contrib-main">
        <span class="contrib-name">${item.label}</span>
        <span class="contrib-points">+${item.contrib.toFixed(1)} pts</span>
      </div>
      <div class="contrib-meta">
        <span class="contrib-tag">${item.block}${item.tier ? ' · ' + item.tier : ''}</span>
        <span class="contrib-tag contrib-tag-${verdict.toLowerCase()}">${verdict}</span>
        <span class="contrib-tag contrib-tag-share">${item.pctOfComposite.toFixed(0)}% of composite</span>
      </div>
    `;

    container.appendChild(row);
  });
}
