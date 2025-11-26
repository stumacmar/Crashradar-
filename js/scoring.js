// scoring.js
// ------------------------------------------------------------
// All scoring functions for indicators, valuations,
// composite score, and derived risk tiles.
// ------------------------------------------------------------

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT
} from './config.js';

/* ------------------------------------------------------------
   Indicator stress normalisation
------------------------------------------------------------ */

export function scaleIndicator(key, value, cfg = {}) {
  if (!Number.isFinite(value)) return null;

  const t = cfg.threshold;
  if (t == null) {
    return Math.min(100, Math.max(0, Math.abs(value)));
  }

  if (cfg.direction === 'below') {
    if (value <= t) return 100;
    const diff = t - value;
    return Math.min(100, Math.max(0, (Math.abs(diff) / Math.abs(t)) * 100));
  } else {
    if (value >= t) return 100;
    const diff = value - t;
    return Math.min(100, Math.max(0, (Math.abs(diff) / Math.abs(t)) * 100));
  }
}

/* ------------------------------------------------------------
   Valuation stress
------------------------------------------------------------ */

export function valuationStress(key, v) {
  if (!Number.isFinite(v)) return null;

  if (key === 'BUFFETT') {
    if (v >= 200) return 100;
    return Math.min(100, (v / 200) * 100);
  }

  if (key === 'SHILLER_PE') {
    if (v >= 30) return 100;
    return Math.min(100, (v / 30) * 100);
  }

  return Math.min(100, Math.max(0, v));
}

/* ------------------------------------------------------------
   Stress verdict label
------------------------------------------------------------ */

export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return 'UNKNOWN';
  if (s >= 66) return 'DANGER';
  if (s >= 33) return 'ELEVATED';
  return 'CALM';
}

/* ------------------------------------------------------------
   Derived tiles (Recession / Valuation / Labor)
------------------------------------------------------------ */

export function derivedRecessionRisk(compositeScore) {
  if (!Number.isFinite(compositeScore)) return '--';
  if (compositeScore >= 70) return 'High';
  if (compositeScore >= 50) return 'Elevated';
  return 'Low';
}

export function derivedValuationRisk(valuationValuesByKey = {}) {
  const b = valuationValuesByKey.BUFFETT;
  const c = valuationValuesByKey.SHILLER_PE;

  let s = 0;
  if (Number.isFinite(b)) s = Math.max(s, valuationStress('BUFFETT', b));
  if (Number.isFinite(c)) s = Math.max(s, valuationStress('SHILLER_PE', c));

  if (s >= 66) return 'High';
  if (s >= 33) return 'Elevated';
  return 'Low';
}

/* ------------------------------------------------------------
   MISSING EXPORT THAT CAUSED THE CRASH
   Labor market stress tile
------------------------------------------------------------ */

export function derivedLaborStress(indicatorValuesByKey = {}) {
  const claims = indicatorValuesByKey.ICSA;
  const sahm = indicatorValuesByKey.SAHMREALTIME;

  let s = 0;

  if (Number.isFinite(claims)) {
    // Treat rising claims as stress
    s = Math.max(s, Math.min(100, claims));
  }

  if (Number.isFinite(sahm)) {
    // Sahm Rule typically 0.5+ = recession trigger
    s = Math.max(s, Math.min(100, sahm * 25));
  }

  return s;
}

/* ------------------------------------------------------------
   Composite scoring (macro + valuation blocks)
------------------------------------------------------------ */

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

/* ------------------------------------------------------------
   Contribution breakdown list
------------------------------------------------------------ */

export function computeContributions(
  indicatorValuesByKey,
  valuationValuesByKey,
  compositeScore,
) {
  if (!Number.isFinite(compositeScore)) return [];

  const out = [];

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const stress = Math.max(0, Math.min(100, v));
    const contrib = (stress * cfg.weight) / compositeScore * 10;

    out.push({
      key,
      label: cfg.label,
      contrib,
      stress,
      block: 'Macro',
      tier: cfg.tier || null,
      pctOfComposite: (stress / compositeScore) * 100,
    });
  }

  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    if (!Number.isFinite(v) || !cfg.weight) continue;

    const stress = valuationStress(key, v);
    const contrib = (stress * cfg.weight) / compositeScore * 10;

    out.push({
      key,
      label: cfg.label,
      contrib,
      stress,
      block: 'Valuation',
      tier: null,
      pctOfComposite: (stress / compositeScore) * 100,
    });
  }

  return out.sort((a, b) => b.contrib - a.contrib);
}
