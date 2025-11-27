// scoring.js
// ============================================================================
// Stress scoring, valuation scoring, risk interpretation, composite scoring,
// and contribution decomposition for Economic Crash Radar Pro.
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
} from './config.js';

// ============================================================================
// 1. INDICATOR STRESS NORMALISATION
// ----------------------------------------------------------------------------
// scaleIndicator() maps an indicator's current numeric value into 0–100 stress.
// Uses threshold, direction, and span parameters from config.
// ============================================================================

export function scaleIndicator(key, value, cfg = {}) {
  if (!Number.isFinite(value)) return null;

  const t = cfg.threshold;

  // No threshold defined → fallback = magnitude scaling
  if (t == null) {
    return Math.min(100, Math.max(0, Math.abs(value)));
  }

  const span = Number.isFinite(cfg.span) ? cfg.span : 1;

  // WORSE BELOW threshold
  if (cfg.direction === 'below') {
    if (value <= t) return 100;
    const diff = (value - t) / span; // positive = safer
    const stress = (1 - diff) * 100;
    return Math.min(100, Math.max(0, stress));
  }

  // WORSE ABOVE threshold
  if (cfg.direction === 'above') {
    if (value >= t) return 100;
    const diff = (t - value) / span; // positive = more stress
    const stress = diff * 100;
    return Math.min(100, Math.max(0, stress));
  }

  // Fallback
  return null;
}

// ============================================================================
// 2. VALUATION STRESS
// ----------------------------------------------------------------------------
// Simple linear mappings with danger cliffs.
// ============================================================================

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

  // Fallback
  return Math.min(100, Math.max(0, v));
}

// ============================================================================
// 3. STRESS VERDICT LABEL
// ----------------------------------------------------------------------------
// Converts stress score 0–100 → textual category
// ============================================================================

export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return 'UNKNOWN';
  if (s >= 66) return 'DANGER';
  if (s >= 33) return 'ELEVATED';
  return 'CALM';
}

// ============================================================================
// 4. DERIVED RISK TILES
// ----------------------------------------------------------------------------
// Recession risk, valuation risk, labour stress
// ============================================================================

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

export function derivedLaborStress(indicatorValuesByKey = {}) {
  const claims = indicatorValuesByKey.INITIAL_CLAIMS; // already MA4k
  const sahm   = indicatorValuesByKey.SAHM_RULE;

  let s = 0;

  if (Number.isFinite(claims)) {
    // Claims: roughly >250k is bad → scale directly as stress cap 100
    s = Math.max(s, Math.min(100, (claims / 250) * 100));
  }

  if (Number.isFinite(sahm)) {
    // Sahm > 0.5 triggers recessions → scale strongly
    s = Math.max(s, Math.min(100, sahm * 200));
  }

  return Math.min(100, Math.max(0, s));
}

// ============================================================================
// 5. COMPOSITE SCORING
// ----------------------------------------------------------------------------
// Weighted average: macro block (65%) + valuation block (35%)
// ============================================================================

export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  let macroSum = 0;
  let macroW = 0;
  let valSum = 0;
  let valW = 0;

  // Macro indicators
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    if (!Number.isFinite(v)) continue;

    const s = scaleIndicator(key, v, cfg);
    if (!Number.isFinite(s) || !cfg.weight) continue;

    macroSum += s * cfg.weight;
    macroW += cfg.weight;
  }

  // Valuations
  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    if (!Number.isFinite(v)) continue;

    const s = valuationStress(key, v);
    if (!Number.isFinite(s) || !cfg.weight) continue;

    valSum += s * cfg.weight;
    valW += cfg.weight;
  }

  const macroComponent = macroW ? macroSum / macroW : 0;
  const valComponent   = valW ? valSum / valW : 0;

  const composite =
    macroComponent * MACRO_BLOCK_WEIGHT +
    valComponent * VALUATION_BLOCK_WEIGHT;

  return Math.min(100, Math.max(0, composite));
}

// ============================================================================
// 6. CONTRIBUTION BREAKDOWN
// ----------------------------------------------------------------------------
// Produces ranked list of contributing indicators & valuations
// Used in UI: "What's Driving the Score?"
// ============================================================================

export function computeContributions(
  indicatorValuesByKey,
  valuationValuesByKey,
  compositeScore,
) {
  if (!Number.isFinite(compositeScore) || compositeScore <= 0) {
    return [];
  }

  const out = [];

  // Macro indicators
  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const value = indicatorValuesByKey[key];
    if (!Number.isFinite(value)) continue;

    const stress = scaleIndicator(key, value, cfg);
    if (!Number.isFinite(stress)) continue;

    const contrib = (stress / compositeScore) * 10;

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

  // Valuations
  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const value = valuationValuesByKey[key];
    if (!Number.isFinite(value)) continue;

    const stress = valuationStress(key, value);
    if (!Number.isFinite(stress)) continue;

    const contrib = (stress / compositeScore) * 10;

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

  // Sort by contribution descending
  return out.sort((a, b) => b.contrib - a.contrib);
}
