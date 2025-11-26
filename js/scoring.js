// scoring.js
// Restores the missing exports required by uiIndicators.js, app.js, and uiCharts.js

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT
} from './config.js';

/* -------------------------------------------------------
   1. scaleIndicator (CRITICAL – REQUIRED BY uiIndicators/app)
--------------------------------------------------------- */
export function scaleIndicator(key, value, cfg) {
  if (!Number.isFinite(value)) return null;

  const thr = cfg.threshold;
  const span = cfg.span || 1;

  if (thr == null) return null;

  // Direction: is lower worse, or higher worse?
  let raw;

  if (cfg.direction === 'below') {
    raw = ((thr - value) / span) * 100;
  } else {
    raw = ((value - thr) / span) * 100;
  }

  return Math.max(0, Math.min(100, raw));
}

/* -------------------------------------------------------
   2. valuationStress (REQUIRED BY valuation tiles)
--------------------------------------------------------- */
export function valuationStress(key, v) {
  if (!Number.isFinite(v)) return null;

  if (key === 'BUFFETT') {
    return Math.max(0, Math.min(100, ((v - 100) / 100) * 100));
  }

  if (key === 'SHILLER_PE') {
    return Math.max(0, Math.min(100, ((v - 20) / 20) * 100));
  }

  return Math.max(0, Math.min(100, v));
}

/* -------------------------------------------------------
   3. Stress Verdict Label
--------------------------------------------------------- */
export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return '--';
  if (s < 33) return 'Low';
  if (s < 66) return 'Elevated';
  return 'High';
}

/* -------------------------------------------------------
   4. Composite Calculator (uses block weights)
--------------------------------------------------------- */
export function computeComposite(indVals, valVals) {
  let macroSum = 0, macroW = 0;
  let valSum = 0, valW = 0;

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indVals[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const s = scaleIndicator(key, v, cfg);
    if (s == null) continue;

    macroSum += s * cfg.weight;
    macroW += cfg.weight;
  }

  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valVals[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const s = valuationStress(key, v);
    if (s == null) continue;

    valSum += s * cfg.weight;
    valW += cfg.weight;
  }

  const macroComponent = macroW ? macroSum / macroW : 0;
  const valComponent = valW ? valSum / valW : 0;

  const composite =
    macroComponent * MACRO_BLOCK_WEIGHT +
    valComponent * VALUATION_BLOCK_WEIGHT;

  return Math.max(0, Math.min(100, composite));
}
