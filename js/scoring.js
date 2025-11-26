// js/scoring.js
// -----------------------------------------------------------------------------
// All stress scoring, composite calculation, valuation scoring, risk labels,
// and contributions — unified and exported consistently for all UI modules.
// -----------------------------------------------------------------------------

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
} from './config.js';

// -----------------------------------------------------------------------------
// 1. SCALE INDICATORS  (used by uiIndicators.js)
// -----------------------------------------------------------------------------

/**
 * Convert raw indicator values into a 0–100 stress score.
 * Threshold logic based on indicator direction and pivot.
 */
export function scaleIndicator(key, value, cfg) {
  if (!Number.isFinite(value) || !cfg) return null;

  const thr = cfg.threshold;
  if (!Number.isFinite(thr)) return null;

  // Direction:
  // - "above": values ABOVE threshold are worse
  // - "below": values BELOW threshold are worse
  const direction = cfg.direction || 'above';

  let stress;

  if (direction === 'above') {
    if (value <= thr) stress = 0;
    else stress = Math.min(100, ((value - thr) / Math.abs(thr)) * 100);
  } else {
    if (value >= thr) stress = 0;
    else stress = Math.min(100, ((thr - value) / Math.abs(thr)) * 100);
  }

  return Math.max(0, Math.min(100, stress));
}

// -----------------------------------------------------------------------------
// 2. VALUATION STRESS (used by uiIndicators + uiGauge)
// -----------------------------------------------------------------------------

export function valuationStress(key, value) {
  if (!Number.isFinite(value)) return null;

  if (key === 'BUFFETT') {
    // Danger zone > 200%
    return Math.max(0, Math.min(100, (value / 2)));
  }

  if (key === 'SHILLER_PE') {
    // Approx stress = CAPE * 3
    return Math.max(0, Math.min(100, value * 3));
  }

  // Generic fallback
  return Math.max(0, Math.min(100, value));
}

// -----------------------------------------------------------------------------
// 3. RISK LABELS (used by uiGauge)
// -----------------------------------------------------------------------------

export function stressVerdictLabel(stress) {
  if (stress == null || !Number.isFinite(stress)) return '--';
  if (stress >= 70) return 'High';
  if (stress >= 40) return 'Medium';
  return 'Low';
}

export function derivedRecessionRisk(compositeScore) {
  if (!Number.isFinite(compositeScore)) return '--';
  if (compositeScore >= 70) return 'High';
  if (compositeScore >= 50) return 'Elevated';
  if (compositeScore >= 30) return 'Moderate';
  return 'Low';
}

export function derivedValuationRisk(valuationValuesByKey = {}) {
  const b = valuationValuesByKey.BUFFETT;
  const c = valuationValuesByKey.SHILLER_PE;

  const arr = [];
  if (Number.isFinite(b)) arr.push(valuationStress('BUFFETT', b));
  if (Number.isFinite(c)) arr.push(valuationStress('SHILLER_PE', c));

  if (!arr.length) return '--';

  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;

  if (avg >= 70) return 'High';
  if (avg >= 40) return 'Moderate';
  return 'Low';
}

export function derivedLaborStress(indicatorValuesByKey = {}) {
  const ic = indicatorValuesByKey.ICSA;
  const sahm = indicatorValuesByKey.SAHMREALTIME;

  const arr = [];

  if (Number.isFinite(ic)) {
    const s = Math.min(100, Math.max(0, (ic / 400) * 100));
    arr.push(s);
  }

  if (Number.isFinite(sahm)) {
    const s = Math.min(100, Math.max(0, sahm * 30));
    arr.push(s);
  }

  if (!arr.length) return '--';

  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;

  if (avg >= 70) return 'High';
  if (avg >= 40) return 'Moderate';
  return 'Low';
}

// -----------------------------------------------------------------------------
// 4. COMPOSITE SCORE (used by app.js)
// -----------------------------------------------------------------------------

export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0, macroW = 0;
  let valStress = 0, valW = 0;

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const s = Math.max(0, Math.min(100, v));
    macroStress += s * cfg.weight;
    macroW += cfg.weight;
  }

  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const s = Math.max(0, Math.min(100, v));
    valStress += s * cfg.weight;
    valW += cfg.weight;
  }

  const macroComponent = macroW ? macroStress / macroW : 0;
  const valComponent = valW ? valStress / valW : 0;

  const composite =
    macroComponent * MACRO_BLOCK_WEIGHT +
    valComponent * VALUATION_BLOCK_WEIGHT;

  return Math.min(100, Math.max(0, composite));
}

// -----------------------------------------------------------------------------
// 5. CONTRIBUTION DECOMPOSITION (used by uiGauge)
// -----------------------------------------------------------------------------

export function computeContributions(
  indicatorValuesByKey,
  valuationValuesByKey,
  compositeScore
) {
  if (!Number.isFinite(compositeScore) || compositeScore <= 0) return [];

  const items = [];

  // Macro indicators
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const contrib = (v * cfg.weight) * MACRO_BLOCK_WEIGHT / compositeScore;

    items.push({
      key,
      label: cfg.label,
      block: 'Macro',
      tier: cfg.tier,
      stress: v,
      contrib,
      pctOfComposite: contrib * 100,
    });
  }

  // Valuations
  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const contrib = (v * cfg.weight) * VALUATION_BLOCK_WEIGHT / compositeScore;

    items.push({
      key,
      label: cfg.label,
      block: 'Valuation',
      tier: null,
      stress: v,
      contrib,
      pctOfComposite: contrib * 100,
    });
  }

  items.sort((a, b) => b.contrib - a.contrib);
  return items;
}
