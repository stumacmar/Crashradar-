/* ------------------------------------------------------------
   scoring.js — COMPLETE + WORKING
------------------------------------------------------------ */

import {
  MACRO_BLOCK_WEIGHT,
  VALUATION_BLOCK_WEIGHT,
  WARN_MAX,
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

/* ------------------------------------------------------------
   SCALE INDICATOR (CRITICAL)
------------------------------------------------------------ */

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
  }

  else if (dir === 'above') {
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
  }

  else return null;

  // amplifiers
  if (key === 'YIELD_CURVE' && value <= 0) {
    stress = Math.min(100, stress * 1.2);
  }
  if (key === 'SAHM_RULE' && value >= 0.5) {
    stress = Math.min(100, stress * 1.3);
  }

  return Math.max(0, Math.min(100, stress));
}

/* ------------------------------------------------------------
   VALUATIONS
------------------------------------------------------------ */

export function valuationStress(key, val) {
  if (!Number.isFinite(val)) return null;

  let s = 0;

  if (key === 'BUFFETT') {
    if (val <= 120) s = 0;
    else if (val <= 150) s = ((val - 120) / 30) * 40;
    else if (val <= 200) s = 40 + ((val - 150) / 50) * 60;
    else s = 100;
  }

  else if (key === 'SHILLER_PE') {
    if (val <= 22) s = 0;
    else if (val <= 30) s = ((val - 22) / 8) * 40;
    else if (val <= 40) s = 40 + ((val - 30) / 10) * 60;
    else s = 100;
  }

  return Math.max(0, Math.min(100, s));
}

/* ------------------------------------------------------------
   LABOUR STRESS (CRITICAL MISSING FUNCTION)
------------------------------------------------------------ */

export function derivedLaborStress(indicatorValuesByKey) {
  const claims = indicatorValuesByKey.INITIAL_CLAIMS;
  const sahm = indicatorValuesByKey.SAHM_RULE;

  if (!Number.isFinite(claims) || !Number.isFinite(sahm)) return '--';

  const cs = Math.max(0, Math.min(100, (claims - 250) * 0.5));
  const ss = Math.max(0, Math.min(100, sahm * 200));

  const avg = (cs + ss) / 2;

  if (avg < 30) return 'Low';
  if (avg < 60) return 'Moderate';
  return 'High';
}

/* ------------------------------------------------------------
   COMPOSITE CALCULATION
------------------------------------------------------------ */

function computeCompositeParts(indicatorValuesByKey, valuationValuesByKey) {
  let macroStress = 0;
  let macroTotalWeight = 0;
  const macroDetails = [];

  for (const [key, cfg] of Object.entries(INDICATOR_CONFIG)) {
    const val = indicatorValuesByKey[key];
    const s = scaleIndicator(key, val, cfg);
    if (s !== null && Number.isFinite(s) && cfg.weight) {
      macroStress += s * cfg.weight;
      macroTotalWeight += cfg.weight;
      macroDetails.push({ key, label: cfg.label, stress: s, weight: cfg.weight });
    }
  }

  let valStress = 0;
  let valTotalWeight = 0;
  const valDetails = [];

  for (const [key, cfg] of Object.entries(VALUATION_CONFIG)) {
    const val = valuationValuesByKey[key];
    const s = valuationStress(key, val);
    if (s !== null && Number.isFinite(s) && cfg.weight) {
      valStress += s * cfg.weight;
      valTotalWeight += cfg.weight;
      valDetails.push({ key, label: cfg.label, stress: s, weight: cfg.weight });
    }
  }

  return {
    macroStress, macroTotalWeight, macroDetails,
    valStress, valTotalWeight, valDetails
  };
}

export function computeComposite(indicatorValuesByKey, valuationValuesByKey) {
  const parts = computeCompositeParts(indicatorValuesByKey, valuationValuesByKey);

  const macroComponent = parts.macroTotalWeight
    ? parts.macroStress / parts.macroTotalWeight
    : null;

  const valComponent = parts.valTotalWeight
    ? parts.valStress / parts.valTotalWeight
    : null;

  let composite = null;

  if (macroComponent !== null && valComponent !== null) {
    composite = macroComponent * MACRO_BLOCK_WEIGHT +
                valComponent * VALUATION_BLOCK_WEIGHT;
  } else {
    composite = macroComponent ?? valComponent;
  }

  return Number.isFinite(composite)
    ? Math.max(0, Math.min(100, composite))
    : null;
}

/* ------------------------------------------------------------
   RECESSION RISK LABEL
------------------------------------------------------------ */

export function derivedRecessionRisk(c) {
  if (c == null) return '--';
  if (c < 20) return '<10%';
  if (c < 35) return '10–25%';
  if (c < 50) return '25–40%';
  if (c < 65) return '40–60%';
  if (c < 80) return '60–75%';
  return '75–90%';
}
