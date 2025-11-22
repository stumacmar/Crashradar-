// js/config.js
// Core configuration for Economic Crash Radar Pro.
// No business logic here – just model parameters and display metadata.

export const MACRO_BLOCK_WEIGHT = 0.70;
export const VALUATION_BLOCK_WEIGHT = 0.30;
export const WARN_MAX = 30;

export const LOCAL_STORAGE_KEYS = {
  manualInputs: 'crashRadarManualInputs_v1',
  compositeHistory: 'crashRadarCompositeHistory_v1',
  snapshots: 'crashRadarSnapshots',
};

// Indicator configuration (no mutable state).
// Keys and semantics are identical to the original INDICATORS object.
export const INDICATOR_CONFIG = {
  LEI: {
    key: 'LEI',
    tier: 1,
    label: 'Conference Board LEI 6m %Δ',
    weight: 0.15,
    threshold: -3.5,
    direction: 'below',
    span: 3.0,
    fromFred: false,
    fredId: null,
    // For current value: manual only.
    transform: 'manual',
    // For history: not available (no FRED series).
    historyTransform: null,
    format: v => v.toFixed(1) + '%',
    desc: 'Manual. 6m % change in LEI. ≤ -3.5% has preceded most post-1960 recessions.',
    tooltip: 'The Conference Board Leading Economic Index (LEI) 6-month percent change. A value ≤ -3.5% has historically preceded most recessions since 1960.',
  },

  YIELD_CURVE: {
    key: 'YIELD_CURVE',
    tier: 1,
    label: 'Yield Curve (10y–3m)',
    weight: 0.12,
    threshold: 0.0,
    direction: 'below',
    span: 1.0,
    fromFred: true,
    fredId: 'T10Y3M',
    transform: 'raw',          // current value = latest spread
    historyTransform: 'raw',
    format: v => v.toFixed(2) + ' pp',
    desc: '10y–3m spread. Inversions (≤0) are classic recession leads.',
    tooltip: '10-year minus 3-month Treasury yield spread. Inversions (≤0) have preceded most US recessions since 1950.',
  },

  CREDIT_SPREAD: {
    key: 'CREDIT_SPREAD',
    tier: 1,
    label: 'HY Credit Spread',
    weight: 0.10,
    threshold: 5.0,
    direction: 'above',
    span: 3.0,
    fromFred: true,
    fredId: 'BAMLH0A0HYM2',
    transform: 'raw',
    historyTransform: 'raw',
    format: v => v.toFixed(2) + ' pp',
    desc: 'US HY OAS. >5% = stress, >8% = crisis-like conditions.',
    tooltip: 'High-yield corporate bond option-adjusted spread. >5% indicates financial stress; >8% signals crisis-like conditions.',
  },

  FIN_STRESS: {
    key: 'FIN_STRESS',
    tier: 1,
    label: 'Financial Stress (NFCI)',
    weight: 0.08,
    threshold: 0.0,
    direction: 'above',
    span: 0.5,
    fromFred: true,
    fredId: 'NFCI',
    transform: 'raw',
    historyTransform: 'raw',
    format: v => v.toFixed(2),
    desc: 'Chicago Fed NFCI. >0 indicates tighter-than-average conditions.',
    tooltip: 'Chicago Fed National Financial Conditions Index. Positive values indicate tighter-than-average financial conditions.',
  },

  CONSUMER_SENTIMENT: {
    key: 'CONSUMER_SENTIMENT',
    tier: 1,
    label: 'UMich Sentiment',
    weight: 0.08,
    threshold: 60.0,
    direction: 'below',
    span: 25.0,
    fromFred: true,
    fredId: 'UMCSENT',
    transform: 'raw',
    historyTransform: 'raw',
    format: v => v.toFixed(1),
    desc: 'Deep pessimism. Sustained <60 readings cluster around recessions.',
    tooltip: 'University of Michigan Consumer Sentiment Index. Sustained readings <60 typically cluster around recessions.',
  },

  M2_GROWTH: {
    key: 'M2_GROWTH',
    tier: 1,
    label: 'M2 Growth YoY',
    weight: 0.08,
    threshold: 0.0,
    direction: 'below',
    span: 6.0,
    fromFred: true,
    fredId: 'M2SL',
    // Current value: YoY % change from level series.
    transform: 'yoy_percent',
    // History: YoY % series.
    historyTransform: 'yoy_percent',
    format: v => v.toFixed(1) + '%',
    desc: 'YoY growth from M2SL. ≤0% is historically rare and restrictive.',
    tooltip: 'Year-over-year M2 money supply growth. ≤0% is historically rare and indicates restrictive monetary conditions.',
  },

  INDUSTRIAL_PRODUCTION: {
    key: 'INDUSTRIAL_PRODUCTION',
    tier: 2,
    label: 'Industrial Production YoY',
    weight: 0.07,
    threshold: 0.0,
    direction: 'below',
    span: 5.0,
    fromFred: true,
    fredId: 'INDPRO',
    transform: 'yoy_percent',
    historyTransform: 'yoy_percent',
    format: v => v.toFixed(1) + '%',
    desc: 'YoY change. Sustained contraction confirms downturn.',
    tooltip: 'Year-over-year industrial production growth. Sustained contraction confirms broader economic downturn.',
  },

  BUILDING_PERMITS: {
    key: 'BUILDING_PERMITS',
    tier: 2,
    label: 'Building Permits 6m %Δ',
    weight: 0.07,
    threshold: -10.0,
    direction: 'below',
    span: 10.0,
    fromFred: true,
    fredId: 'PERMIT',
    // Current value: 6m % change from level.
    transform: 'pct_change_6m',
    historyTransform: 'pct_change_6m',
    format: v => v.toFixed(1) + '%',
    desc: '6m % change. Sharp drops lead housing & broader weakness.',
    tooltip: '6-month percent change in building permits. Sharp drops typically lead housing market weakness and broader economic slowdown.',
  },

  INITIAL_CLAIMS: {
    key: 'INITIAL_CLAIMS',
    tier: 2,
    label: 'Initial Claims 4wk MA (k)',
    weight: 0.08,
    threshold: 325,
    direction: 'above',
    span: 150,
    fromFred: true,
    fredId: 'ICSA',
    // Current value: 4-week moving average, expressed in thousands.
    transform: 'ma4_thousands',
    historyTransform: 'ma4_thousands',
    format: v => Math.round(v) + 'k',
    desc: '4-week avg in thousands. >325k consistent with labor market stress.',
    tooltip: '4-week moving average of initial jobless claims in thousands. >325k is consistent with labor market stress.',
  },

  SAHM_RULE: {
    key: 'SAHM_RULE',
    tier: 2,
    label: 'Sahm Rule (pp)',
    weight: 0.07,
    threshold: 0.50,
    direction: 'above',
    span: 0.5,
    fromFred: true,
    fredId: 'SAHMREALTIME',
    transform: 'raw',
    historyTransform: 'raw',
    format: v => v.toFixed(2),
    desc: '≥0.50 triggers real-time recession signal.',
    tooltip: 'Sahm Rule Recession Indicator. A reading ≥0.50 percentage points triggers a real-time recession signal.',
  },
};

// Valuation configuration (no mutable state).
// Matches original VALUATIONS object.
export const VALUATION_CONFIG = {
  BUFFETT: {
    key: 'BUFFETT',
    label: 'Buffett Indicator (MktCap/GDP)',
    weight: 0.50,
    danger: 200,
    format: v => v.toFixed(1) + '%',
    desc: '>150% stretched; >200% historically extreme.',
    tooltip: 'Total stock market capitalization to GDP ratio. >150% indicates stretched valuations; >200% is historically extreme.',
  },

  SHILLER_PE: {
    key: 'SHILLER_PE',
    label: 'Shiller CAPE',
    weight: 0.50,
    danger: 30,
    format: v => v.toFixed(1),
    desc: '>25 elevated; >30 associated with poor long-run returns.',
    tooltip: 'Cyclically Adjusted Price-to-Earnings ratio. >
