// js/scoring.js
// ------------------------------------------------------------
// Pure scoring logic for Economic Crash Radar Pro.
// All maths mirror the original model:
//
// - scaleIndicator:    0–100 stress from raw indicator reading
// - valuationStress:   0–100 stress from valuations
// - computeComposite:  macro + valuation blend
// - derived*():        human-readable labels
// - computeContributions: "What's driving the score?" list
// ------------------------------------------------------------

import {
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
  WARN_MAX,
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

/**
 * Map a single indicator reading into a 0–100 stress score.
 *
 * @param {string} key - indicator key (e.g. 'YIELD_CURVE')
 * @param {number} value - current indicator value
 * @param {object} cfg - indicator config from INDICATOR_CONFIG[key]
 * @returns {number|null} 0–100 stress or null if not computable
 */
export function scaleIndicator(key, value, cfg = INDICATOR_CONFIG[key]) {
  if (!cfg || !Number.isFinite(value)) return null;

  const t = cfg.threshold;
  const dir = cfg.direction;
  const span = (cfg.span && cfg.span > 0)
    ? cfg.span
    : Math.max(1, Math.abs(t) * 0.5);

  const buffer = (cfg.buffer && cfg.buffer > 0)
    ? cfg.buffer
    : span * 0.5;

  let stress = 0;

  if (dir === 'below') {
    const safeCut = t + buffer;
    if (value >= safeCut) {
      stress = 0;
    } else if (value >= t) {
      const frac = (safeCut - value) / buffer;
      stress = frac * WARN_MAX;
    } else {
      const frac = Math.max(0, Math.min(1, (t - value) / span));
      stress = WARN_MAX + frac * (100 - WARN_MAX);
    }
  } else if (dir === 'above') {
    const safeCut = t - buffer;
    if (value <= safeCut) {
      stress = 0;
    } else if (value <= t) {
      const frac = (value - safeCut) / buffer;
      stress = frac * WARN_MAX;
    } else {
      const frac = Math.max(0, Math.min(1, (value - t) / span));
      stress = WARN_MAX + frac * (100 - WARN_MAX);
    }
  } else {
    return null;
  }

  // Amplifiers (unchanged from your original spec)
  if (key === 'YIELD_CURVE' && value <= 0) {
    stress = Math.min(100, stress * 1.2);
  }
  if (key === 'SAHM_RULE' && value >= 0.5) {
    stress = Math.min(100, stress * 1.3);
  }

  if (!Number.isFinite(stress)) return null;
  if (stress < 0) stress = 0;
  if (stress > 100) stress = 100;
  return stress;
}

/**
 * Valuation stress curve (Buffett + Shiller).
 *
 * @param {string} key - 'BUFFETT' or 'SHILLER_PE'
 * @param {number} val - current value
 * @returns {number|null} 0–100 stress
 */
export function valuationStress(key, val) {
  if (!Number.isFinite(val)) return null;
  let s = 0;

  if (key === 'BUFFETT') {
    if (val <= 120) {
      s = 0;
    } else if (val <= 150) {
      const frac = (val - 120) / (150 - 120);
      s = frac * 40;
    } else if (val <= 200) {
      const frac = (val - 150) / (200 - 150);
      s = 40 + frac * 60;
    } else {
      s = 100;
    }
  } else if (key === 'SHILLER_PE') {
    if (val <= 22) {
      s = 0;
    } else if (val <= 30) {
      const frac = (val - 22) / (30 - 22);
      s = frac * 40;
    } else if (val <= 40) {
      const frac = (val - 30) / (40 - 30);
      s = 40 + frac * 60;
    } else {
      s = 100;
    }
  } else {
    return null;
  }

  if (s < 0) s = 0;
  if (s > 100) s = 100;
  return s;
}

/**
 * Map a 0–100 stress score to a qualitative label.
 */
export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return '--';
  if (s < 20) return 'Calm';
  if (s < 40) return 'Watch';
  if (s < 70) return 'Stressed';
  return 'Critical';
}

/**
 * Compute macro & valuation block stats and per-indicator details.
 *
 * @param {Object<string, number|null>} indicatorValuesByKey
 * @param {Object<string, number|null>} valuationValuesByKey
 */
export function computeCompositeParts(
  indicatorValuesByKey,
  valuationValuesByKey,
) {
  let macroStress = 0;
  let macroTotalWeight = 0;
  const macroDetails = [];

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    const current = indicatorValuesByKey[key];
    const s = scaleIndicator(key, current, cfg);
    if (s !== null && Number.isFinite(s) && cfg.weight) {
      macroStress += s * cfg.weight;
      macroTotalWeight += cfg.weight;
      macroDetails.push({
        key,
        label: cfg.label,
        stress: s,
        weight: cfg.weight,
        tier: cfg.tier,
      });
    }
  });

  let valStress = 0;
  let valTotalWeight = 0;
  const valDetails = [];

  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];
    const s = valuationStress(key, current);
    if (s !== null && Number.isFinite(s) && cfg.weight) {
      valStress += s * cfg.weight;
      valTotalWeight += cfg.weight;
      valDetails.push({
        key,
        label: cfg.label,
        stress: s,
        weight: cfg.weight,
        tier: null,
      });
    }
  });

  return {
    macroStress,
    macroTotalWeight,
    macroDetails,
    valStress,
    valTotalWeight,
    valDetails,
  };
}

/**
 * Compute composite stress (0–100) from current values.
 */
export function computeComposite(
  indicatorValuesByKey,
  valuationValuesByKey,
) {
  const parts = computeCompositeParts(indicatorValuesByKey, valuationValuesByKey);
  const {
    macroStress,
    macroTotalWeight,
    valStress,
    valTotalWeight,
  } = parts;

  if (macroTotalWeight === 0 && valTotalWeight === 0) return null;

  const macroComponent = macroTotalWeight > 0
    ? (macroStress / macroTotalWeight)
    : null;

  const valComponent = valTotalWeight > 0
    ? (valStress / valTotalWeight)
    : null;

  let composite = null;
  if (macroComponent !== null && valComponent !== null) {
    composite = macroComponent * MACRO_BLOCK_WEIGHT +
                valComponent * VALUATION_BLOCK_WEIGHT;
  } else if (macroComponent !== null) {
    composite = macroComponent;
  } else {
    composite = valComponent;
  }

  if (!Number.isFinite(composite)) return null;
  if (composite < 0) composite = 0;
  if (composite > 100) composite = 100;
  return composite;
}

/**
 * Bucket composite into 12–18m recession probability band.
 */
export function derivedRecessionRisk(c) {
  if (c == null) return '--';
  if (c < 20) return '<10%';
  if (c < 35) return '10–25%';
  if (c < 50) return '25–40%';
  if (c < 65) return '40–60%';
  if (c < 80) return '60–75%';
  return '75–90%';
}

/**
 * Compute valuation risk label from current valuations.
 */
export function derivedValuationRisk(valuationValuesByKey) {
  let sum = 0;
  let w = 0;

  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];
    const s = valuationStress(key, current);
    if (s != null && cfg.weight) {
      sum += s * cfg.weight;
      w += cfg.weight;
    }
  });

  if (!w) return '--';
  const sc = Math.round(sum / w);
  if (sc < 33) return 'Low';
  if (sc < 66) return 'Moderate';
  return 'High';
}

/**
 * Labour market stress label using Initial Claims + Sahm Rule.
 */
export function derivedLaborStress(indicatorValuesByKey) {
  const claimsK = indicatorValuesByKey.INITIAL_CLAIMS;
  const sahm = indicatorValuesByKey.SAHM_RULE;

  if (!Number.isFinite(claimsK) || !Number.isFinite(sahm)) return '--';

  const cs = Math.max(0, Math.min(100, (claimsK - 250) * 0.5));
  const ss = Math.max(0, Math.min(100, sahm * 200));
  const avg = (cs + ss) / 2;

  if (avg < 30) return 'Low';
  if (avg < 60) return 'Moderate';
  return 'High';
}

/**
 * Compute contribution breakdown for "What's Driving the Score?".
 *
 * Each item:
 * {
 *   label,
 *   contrib,          // points contribution to composite (0–100 scale)
 *   block,            // 'Macro' | 'Valuation'
 *   tier,             // 'Tier 1' | 'Tier 2' | ''
 *   stress,           // 0–100
 *   pctOfComposite,   // % share of composite
 * }
 */
export function computeContributions(
  indicatorValuesByKey,
  valuationValuesByKey,
  compositeScore,
) {
  if (!Number.isFinite(compositeScore) || compositeScore <= 0) return [];

  const parts = computeCompositeParts(indicatorValuesByKey, valuationValuesByKey);
  const {
    macroTotalWeight,
    macroDetails,
    valTotalWeight,
    valDetails,
  } = parts;

  const hasMacro = macroTotalWeight > 0;
  const hasVal = valTotalWeight > 0;

  let macroBlockWeight = 0;
  let valBlockWeight = 0;

  if (hasMacro && hasVal) {
    macroBlockWeight = MACRO_BLOCK_WEIGHT;
    valBlockWeight = VALUATION_BLOCK_WEIGHT;
  } else if (hasMacro) {
    macroBlockWeight = 1;
  } else if (hasVal) {
    valBlockWeight = 1;
  }

  const items = [];

  if (hasMacro && macroBlockWeight > 0) {
    macroDetails.forEach(d => {
      if (!Number.isFinite(d.stress) || !d.weight) return;
      const contribPoints = (d.stress * d.weight / macroTotalWeight) * macroBlockWeight;
      if (!Number.isFinite(contribPoints) || contribPoints <= 0) return;

      items.push({
        label: d.label,
        contrib: contribPoints,
        block: 'Macro',
        tier: d.tier === 1 ? 'Tier 1' : (d.tier === 2 ? 'Tier 2' : ''),
        stress: d.stress,
      });
    });
  }

  if (hasVal && valBlockWeight > 0) {
    valDetails.forEach(d => {
      if (!Number.isFinite(d.stress) || !d.weight) return;
      const contribPoints = (d.stress * d.weight / valTotalWeight) * valBlockWeight;
      if (!Number.isFinite(contribPoints) || contribPoints <= 0) return;

      items.push({
        label: d.label,
        contrib: contribPoints,
        block: 'Valuation',
        tier: '',
        stress: d.stress,
      });
    });
  }

  const withShares = items.map(item => ({
    ...item,
    pctOfComposite: (item.contrib / compositeScore) * 100,
  }));

  withShares.sort((a, b) => b.contrib - a.contrib);

  return withShares;
}
