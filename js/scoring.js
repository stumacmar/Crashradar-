// js/scoring.js
// Core scoring logic used by uiIndicators.js, uiGauge.js, uiCharts.js, and app.js.
// Every export below is REQUIRED by the app. There are NO missing bindings.

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT
} from './config.js';

/* ------------------------------------------------------------
   scaleIndicator (REQUIRED BY: uiIndicators.js, app.js)
   Normalises an indicator reading into a 0–100 stress score.
------------------------------------------------------------- */
export function scaleIndicator(key, value, cfg) {
  if (!cfg || !Number.isFinite(value)) return null;

  const thr = cfg.threshold;
  const dir = cfg.direction;      // "above" or "below"
  const span = Number(cfg.span) || 1;

  if (!Number.isFinite(thr)) return null;

  // distance from threshold
  let d = value - thr;

  // if stress worsens below threshold, invert sign
  if (dir === 'below') d = -d;

  // scale proportionally into 0–100
  const raw = (d / span) * 100;

  return Math.max(0, Math.min(100, raw));
}

/* ------------------------------------------------------------
   valuationStress (REQUIRED BY: uiIndicators.js, uiGauge.js)
------------------------------------------------------------- */
export function valuationStress(key, value) {
  if (!Number.isFinite(value)) return null;

  if (key === 'BUFFETT') {
    // 100% → 0 stress, 200% → 100 stress
    const s = ((value - 100) / 100) * 100;
    return Math.max(0, Math.min(100, s));
  }

  if (key === 'SHILLER_PE') {
    // CAPE: 20 → 0 stress, 30 → 100 stress
    const s = ((value - 20) / 10) * 100;
    return Math.max(0, Math.min(100, s));
  }

  return null;
}

/* ------------------------------------------------------------
   stressVerdictLabel (REQUIRED BY: uiIndicators.js, uiGauge.js)
------------------------------------------------------------- */
export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return '--';
  if (s >= 80) return 'CRITICAL';
  if (s >= 60) return 'HIGH';
  if (s >= 40) return 'ELEVATED';
  if (s >= 20) return 'LOW';
  return 'CALM';
}

/* ------------------------------------------------------------
   computeComposite (REQUIRED BY: app.js, uiGauge.js)
   Uses actual stress scores (not raw values).
------------------------------------------------------------- */
export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0;
  let macroW = 0;

  let valStress = 0;
  let valW = 0;

  // MACRO indicators
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v)) continue;

    const s = scaleIndicator(key, v, cfg);
    if (!Number.isFinite(s)) continue;

    const w = Number(cfg.weight) || 1;
    macroStress += s * w;
    macroW += w;
  }

  // VALUATION indicators
  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    if (!Number.isFinite(v)) continue;

    const s = valuationStress(key, v);
    if (!Number.isFinite(s)) continue;

    const w = Number(cfg.weight) || 1;
    valStress += s * w;
    valW += w;
  }

  const macroScore = macroW ? macroStress / macroW : 0;
  const valScore = valW ? valStress / valW : 0;

  const composite =
    macroScore * MACRO_BLOCK_WEIGHT +
    valScore * VALUATION_BLOCK_WEIGHT;

  return Math.max(0, Math.min(100, composite));
}
