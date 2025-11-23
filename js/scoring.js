///////////////////////////////////////////////////////////////
// scoring.js — V22
// Pure scoring logic for Economic Crash Radar Pro.
// Fully consistent with config.js — exports guaranteed.
///////////////////////////////////////////////////////////////

import {
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
  WARN_MAX,
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

///////////////////////////////////////////////////////////////
// 1. SCALE INDICATOR (0–100)
///////////////////////////////////////////////////////////////

export function scaleIndicator(key, value, cfg = INDICATOR_CONFIG[key]) {
  if (!cfg || !Number.isFinite(value)) return null;

  const t = cfg.threshold;
  const dir = cfg.direction;
  const span = cfg.span || Math.max(1, Math.abs(t) * 0.5);
  const buffer = cfg.buffer || span * 0.5;

  let stress = 0;

  if (dir === 'below') {
    const safeCut = t + buffer;
    if (value >= safeCut) {
      stress = 0;
    } else if (value >= t) {
      stress = ((safeCut - value) / buffer) * WARN_MAX;
    } else {
      const frac = Math.min(1, Math.max(0, (t - value) / span));
      stress = WARN_MAX + frac * (100 - WARN_MAX);
    }
  }

  else if (dir === 'above') {
    const safeCut = t - buffer;
    if (value <= safeCut) {
      stress = 0;
    } else if (value <= t) {
      stress = ((value - safeCut) / buffer) * WARN_MAX;
    } else {
      const frac = Math.min(1, Math.max(0, (value - t) / span));
      stress = WARN_MAX + frac * (100 - WARN_MAX);
    }
  }

  // Amplifiers
  if (key === 'YIELD_CURVE' && value <= 0) {
    stress = Math.min(100, stress * 1.2);
  }
  if (key === 'SAHM_RULE' && value >= 0.5) {
    stress = Math.min(100, stress * 1.3);
  }

  return Math.min(100, Math.max(0, stress));
}

///////////////////////////////////////////////////////////////
// 2. VALUATION STRESS
///////////////////////////////////////////////////////////////

export function valuationStress(key, val) {
  if (!Number.isFinite(val)) return null;

  let s = 0;

  if (key === 'BUFFETT') {
    if (val <= 120) s = 0;
    else if (val <= 150) s = ((val - 120) / 30) * 40;
    else if (val <= 200) s = 40 + ((val - 150) / 50) * 60;
    else s = 100;
  }

  if (key === 'SHILLER_PE') {
    if (val <= 22) s = 0;
    else if (val <= 30) s = ((val - 22) / 8) * 40;
    else if (val <= 40) s = 40 + ((val - 30) / 10) * 60;
    else s = 100;
  }

  return Math.min(100, Math.max(0, s));
}

///////////////////////////////////////////////////////////////
// 3. DERIVED LABELS
///////////////////////////////////////////////////////////////

export function stressVerdictLabel(s) {
  if (!Number.isFinite(s)) return '--';
  if (s < 20) return 'Calm';
  if (s < 40) return 'Watch';
  if (s < 70) return 'Stressed';
  return 'Critical';
}

export function derivedRecessionRisk(c) {
  if (c == null) return '--';
  if (c < 20) return '<10%';
  if (c < 35) return '10–25%';
  if (c < 50) return '25–40%';
  if (c < 65) return '40–60%';
  if (c < 80) return '60–75%';
  return '75–90%';
}

export function derivedValuationRisk(valuationValuesByKey) {
  let sum = 0, w = 0;
  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    const s = valuationStress(key, v);
    if (Number.isFinite(s) && cfg.weight) {
      sum += s * cfg.weight;
      w += cfg.weight;
    }
  }
  if (!w) return '--';
  const v = Math.round(sum / w);
  if (v < 33) return 'Low';
  if (v < 66) return 'Moderate';
  return 'High';
}

export function derivedLaborStress(indicatorValuesByKey) {
  const claims = indicatorValuesByKey.INITIAL_CLAIMS;
  const sahm = indicatorValuesByKey.SAHM_RULE;

  if (!Number.isFinite(claims) || !Number.isFinite(sahm)) return '--';

  const cs = Math.min(100, Math.max(0, (claims - 250) * 0.5));
  const ss = Math.min(100, Math.max(0, sahm * 200));
  const avg = (cs + ss) / 2;

  if (avg < 30) return 'Low';
  if (avg < 60) return 'Moderate';
  return 'High';
}

///////////////////////////////////////////////////////////////
// 4. COMPOSITE SCORE
///////////////////////////////////////////////////////////////

export function computeCompositeParts(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0, macroW = 0;
  let valStress = 0, valW = 0;

  const macroDetails = [];
  const valDetails = [];

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const v = indicatorValuesByKey[key];
    const s = scaleIndicator(key, v, cfg);
    if (Number.isFinite(s) && cfg.weight) {
      macroStress += s * cfg.weight;
      macroW += cfg.weight;
      macroDetails.push({ key, label: cfg.label, stress: s, weight: cfg.weight, tier: cfg.tier });
    }
  }

  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const v = valuationValuesByKey[key];
    const s = valuationStress(key, v);
    if (Number.isFinite(s) && cfg.weight) {
      valStress += s * cfg.weight;
      valW += cfg.weight;
      valDetails.push({ key, label: cfg.label, stress: s, weight: cfg.weight });
    }
  }

  return { macroStress, macroW, macroDetails, valStress, valW, valDetails };
}

export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  const { macroStress, macroW, valStress, valW } =
    computeCompositeParts(indicatorValuesByKey, valuationValuesByKey);

  if (!macroW && !valW) return null;

  const macroComponent = macroW ? (macroStress / macroW) : null;
  const valComponent = valW ? (valStress / valW) : null;

  let composite;
  if (macroComponent !== null && valComponent !== null) {
    composite = macroComponent * MACRO_BLOCK_WEIGHT +
                valComponent * VALUATION_BLOCK_WEIGHT;
  } else if (macroComponent !== null) {
    composite = macroComponent;
  } else {
    composite = valComponent;
  }

  return Math.min(100, Math.max(0, composite));
}

///////////////////////////////////////////////////////////////
// 5. CONTRIBUTIONS LIST
///////////////////////////////////////////////////////////////

export function computeContributions(indicatorValuesByKey, valuationValuesByKey, compositeScore) {
  if (!Number.isFinite(compositeScore) || compositeScore <= 0) return [];

  const { macroW, macroDetails, valW, valDetails } =
    computeCompositeParts(indicatorValuesByKey, valuationValuesByKey);

  const items = [];

  if (macroW) {
    for (const d of macroDetails) {
      const contrib = (d.stress * d.weight / macroW) * MACRO_BLOCK_WEIGHT;
      if (contrib > 0) {
        items.push({
          label: d.label,
          contrib,
          block: 'Macro',
          tier: d.tier === 1 ? 'Tier 1' : 'Tier 2',
          stress: d.stress,
          pctOfComposite: (contrib / compositeScore) * 100,
        });
      }
    }
  }

  if (valW) {
    for (const d of valDetails) {
      const contrib = (d.stress * d.weight / valW) * VALUATION_BLOCK_WEIGHT;
      if (contrib > 0) {
        items.push({
          label: d.label,
          contrib,
          block: 'Valuation',
          tier: '',
          stress: d.stress,
          pctOfComposite: (contrib / compositeScore) * 100,
        });
      }
    }
  }

  return items.sort((a, b) => b.contrib - a.contrib);
}
