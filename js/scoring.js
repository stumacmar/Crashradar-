import {
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
  INDICATOR_CONFIG,
  VALUATION_CONFIG
} from './config.js';

/**
 * Indicator scorer unchanged (your original logic is fine)
 * Only composite logic needed correction.
 */
export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0,
    macroW = 0;
  let valStress = 0,
    valW = 0;

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    // Very light normalisation
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
