// js/scoring.js
// Complete scoring + stress system compatible with your UI and app.js

import {
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
  INDICATOR_CONFIG,
  VALUATION_CONFIG
} from './config.js';

/* -----------------------------------------------------------
   1. Indicator stress scoring (Tier 1 & Tier 2)
   ----------------------------------------------------------- */

/**
 * Converts an indicator value into a 0–100 stress score.
 * Direction:
 *   - "below"  → lower values = worse (more stress)
 *   - "above"  → higher values = worse
 */
export function scaleIndicator(key, value, cfg) {
  if (!cfg || !Number.isFinite(value)) return null;

  const thr = cfg.threshold;
  const span = cfg.span || 1;

  if (!Number.isFinite(thr) || !Number.isFinite(span)) return null;

  const direction = cfg.direction || "above";

  let s;

  if (direction === "below") {
    // worse when below threshold
    if (value >= thr) return 0;
    s = ((thr - value) / span) * 100;
  } else {
    // worse when above threshold
    if (value <= thr) return 0;
    s = ((value - thr) / span) * 100;
  }

  return Math.min(100, Math.max(0, s));
}

/* -----------------------------------------------------------
   2. Valuation stress scoring (Buffett / Shiller)
   ----------------------------------------------------------- */

export function valuationStress(key, value) {
  if (!Number.isFinite(value)) return null;

  if (key === "BUFFETT") {
    // 100 stress at 200%
    return Math.max(0, Math.min(100, (value / 200) * 100));
  }

  if (key === "SHILLER_PE") {
    // 100 stress at PE=30
    return Math.max(0, Math.min(100, (value / 30) * 100));
  }

  return null;
}

/* -----------------------------------------------------------
   3. Verdict labels
   ----------------------------------------------------------- */

export function stressVerdictLabel(score) {
  if (!Number.isFinite(score)) return "--";
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Elevated";
  if (score >= 15) return "Watch";
  return "Calm";
}

/* -----------------------------------------------------------
   4. Composite calculation (your original logic)
   ----------------------------------------------------------- */

export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0, macroW = 0;
  let valStress = 0, valW = 0;

  // Macro indicators
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const s = Math.max(0, Math.min(100, v));
    macroStress += s * cfg.weight;
    macroW += cfg.weight;
  }

  // Valuation indicators
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
