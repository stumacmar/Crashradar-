// js/config.js
// Central configuration for Economic Crash Radar Pro:
// - Global scoring weights
// - Indicator definitions
// - Valuation definitions

// -----------------------------
// Global scoring weights
// -----------------------------
export const MACRO_BLOCK_WEIGHT = 0.7;
export const VALUATION_BLOCK_WEIGHT = 0.3;
export const WARN_MAX = 60;

// -----------------------------
// Macro indicators
// -----------------------------
export const INDICATOR_CONFIG = {
  // -----------------------------
  // TIER 1 – LEADING
  // -----------------------------
  LEI: {
    key: 'LEI',
    tier: 1,
    label: 'Leading Economic Index (6m %Δ)',
    description: 'Six-month percentage change in the Conference Board LEI.',
    fromFred: false,         // manual
    fredId: null,
    transform: 'manual',
    direction: 'below',
    threshold: -4.1,
    span: 3,
    weight: 1.4,
    format: 'pct1',
    tooltip:
      'LEI six-month change. Sustained readings below about –4% have preceded every post-war US recession.',
  },

  YIELD_CURVE: {
    key: 'YIELD_CURVE',
    tier: 1,
    label: 'Yield Curve (10Y–3M, %)',
    description: 'Treasury 10-year minus 3-month spread.',
    fromFred: true,
    fredId: 'T10Y3M',
    transform: 'raw',
    direction: 'below',
    threshold: 0.0,
    span: 1.0,
    weight: 1.3,
    format: 'pct1',
    tooltip:
      '10-year minus 3-month Treasury spread. Deep, persistent inversion has preceded every modern US recession.',
  },

  CREDIT_SPREAD: {
    key: 'CREDIT_SPREAD',
    tier: 1,
    label: 'High Yield Credit Spread (%)',
    description: 'BAML US High Yield OAS.',
    fromFred: true,
    fredId: 'BAMLH0A0HYM2',
    transform: 'raw',
    direction: 'above',
    threshold: 5.0,
    span: 3.0,
    weight: 1.2,
    format: 'pct1',
    tooltip:
      'Option-adjusted spread between high-yield corporates and Treasuries. Spikes above ~5–6% have coincided with stress episodes.',
  },

  FIN_STRESS: {
    key: 'FIN_STRESS',
    tier: 1,
    label: 'Financial Stress (NFCI)',
    description: 'Chicago Fed National Financial Conditions Index.',
    fromFred: true,
    fredId: 'NFCI',
    transform: 'raw',
    direction: 'above',
    threshold: 0.0,
    span: 0.5,
    weight: 1.0,
    format: 'plain2',
    tooltip:
      'Chicago Fed NFCI. Positive values indicate tighter-than-average financial conditions; negatives are easier-than-average.',
  },

  SENTIMENT: {
    key: 'SENTIMENT',
    tier: 1,
    label: 'Consumer Sentiment (UMich)',
    description: 'University of Michigan consumer sentiment index.',
    fromFred: true,
    fredId: 'UMCSENT',
    transform: 'raw',
    direction: 'below',
    threshold: 80,
    span: 20,
    weight: 0.9,
    format: 'plain0',
    tooltip:
      'UMichigan consumer sentiment. Deep, persistent lows have aligned with recessions and severe slowdowns.',
  },

  M2_GROWTH: {
    key: 'M2_GROWTH',
    tier: 1,
    label: 'Real Money Growth (M2 YoY, %)',
    description: 'Year-on-year change in broad money, proxying liquidity.',
    fromFred: true,
    fredId: 'M2SL',
    transform: 'yoy_percent',
    direction: 'below',
    threshold: 0.0,
    span: 5.0,
    weight: 1.0,
    format: 'pct1',
    tooltip:
      'Approximate broad money growth. Very weak or negative real money growth often coincides with tight liquidity and rising crash risk.',
  },

  // -----------------------------
  // TIER 2 – CONFIRMING
  // -----------------------------
  INDUSTRIAL_PROD: {
    key: 'INDUSTRIAL_PROD',
    tier: 2,
    label: 'Industrial Production YoY (%)',
    description: 'Year-on-year growth in real industrial output.',
    fromFred: true,
    fredId: 'INDPRO',
    transform: 'yoy_percent',
    direction: 'below',
    threshold: 0.0,
    span: 4.0,
    weight: 0.9,
    format: 'pct1',
    tooltip:
      'Industrial production growth. Sustained contractions have historically coincided with recession phases.',
  },

  BUILDING_PERMITS: {
    key: 'BUILDING_PERMITS',
    tier: 2,
    label: 'Building Permits YoY (%)',
    description: 'Total US building permits, year-on-year percent.',
    fromFred: true,
    fredId: 'PERMIT',
    transform: 'yoy_percent',
    direction: 'below',
    threshold: 0.0,
    span: 20.0,
    weight: 0.8,
    format: 'pct1',
    tooltip:
      'Residential building permits. Housing turns are classic early-cycle indicators; sustained declines often precede downturns.',
  },

  INITIAL_CLAIMS: {
    key: 'INITIAL_CLAIMS',
    tier: 2,
    label: 'Initial Claims (4-wk MA, k)',
    description: '4-week moving average of initial jobless claims.',
    fromFred: true,
    fredId: 'ICSA',
    transform: 'ma4_thousands',
    direction: 'above',
    threshold: 300,
    span: 80,
    weight: 0.8,
    format: 'plain0',
    tooltip:
      'Weekly initial unemployment claims smoothed over four weeks. Sustained climbs from cycle lows are a classic labour stress signal.',
  },

  SAHM_RULE: {
    key: 'SAHM_RULE',
    tier: 2,
    label: 'Sahm Rule (%)',
    description: 'Increase in unemployment over its 12-month low.',
    fromFred: true,
    fredId: 'SAHMREALTIME',
    transform: 'raw',
    direction: 'above',
    threshold: 0.5,
    span: 0.7,
    weight: 1.0,
    format: 'pct1',
    tooltip:
      'Sahm Rule recession indicator. Increases of ~0.5–0.8pp above the recent low have historically coincided with recession onset.',
  },
};

// -----------------------------
// Valuation indicators
// -----------------------------
export const VALUATION_CONFIG = {
  BUFFETT: {
    key: 'BUFFETT',
    label: 'Buffett Indicator (Mkt Cap / GDP, %)',
    description:
      'Total US market capitalisation vs. GDP – very high readings imply rich valuations.',
    weight: 0.6,
    format: 'pct0',
    transform: 'manual',
    direction: 'above',
    threshold: 180,
    span: 40,
    tooltip:
      'Market cap-to-GDP ratio. Levels above ~180–200% have corresponded to some of the most expensive markets in history.',
  },

  SHILLER_PE: {
    key: 'SHILLER_PE',
    label: 'Shiller CAPE (x)',
    description:
      'Cyclically adjusted P/E for US equities vs. long-run norms.',
    weight: 0.6,
    format: 'plain1',
    transform: 'manual',
    direction: 'above',
    threshold: 30,
    span: 8,
    tooltip:
      'Shiller CAPE. Elevated CAPE doesn’t time crashes by itself, but it raises downside severity when macro stress appears.',
  },
};
