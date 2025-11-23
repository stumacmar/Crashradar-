// js/config.js
// Global configuration for Economic Crash Radar Pro.
// - Indicator & valuation definitions
// - Thresholds, directions, weights
// - Formatting helpers
//
// These are the single source of truth for:
// - dataService (FRED IDs + transforms)
// - scoring (thresholds, spans, weights)
// - UI modules (labels, tooltips, formatting)

/* ---------------------------------------------------------
   GLOBAL WEIGHTS / CONSTANTS
--------------------------------------------------------- */

export const WARN_MAX = 40;          // Hand-off from "watch" to "danger"
export const MACRO_BLOCK_WEIGHT = 0.7;
export const VALUATION_BLOCK_WEIGHT = 0.3;

/* ---------------------------------------------------------
   FORMAT HELPERS
--------------------------------------------------------- */

const fmtPct1 = v =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toFixed(1) + '%';

const fmtPct1Signed = v =>
  (v == null || !Number.isFinite(v))
    ? '--'
    : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

const fmtPlain1 = v =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toFixed(1);

const fmtPlain2 = v =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toFixed(2);

const fmtK = v =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toFixed(0) + 'k';

const fmtIdx = v =>
  (v == null || !Number.isFinite(v)) ? '--' : v.toFixed(1);

/* ---------------------------------------------------------
   INDICATOR CONFIG (MACRO BLOCK)
--------------------------------------------------------- */
/*
Fields:
- label          UI name
- desc           Short micro-copy for tile
- fromFred       true = auto FRED-backed; false = manual
- fredId         FRED series id (if fromFred)
- transform      'raw' | 'yoy_percent' | 'pct_change_6m' | 'ma4_thousands' | 'manual'
- historyTransform same options as transform; how historyService processes it
- threshold      Pivot level for stress scaling
- direction      'above' | 'below' (which side is worse)
- span           How far beyond threshold to reach max stress (approx)
- buffer         Neutral buffer around threshold before full warning
- tier           1 (leading) | 2 (confirming)
- weight         Composite weight (relative within macro block)
- tooltip        Rich explanation shown on hover
- format         Value formatter
*/

export const INDICATOR_CONFIG = {
  /* ---------------- Tier 1: Leading ------------------- */

  LEI: {
    label: 'Conference Board LEI (6m %Δ)',
    desc: 'Manual input: 6-month percentage change in the US Leading Economic Index.',
    fromFred: false,
    fredId: null,
    transform: 'manual',
    historyTransform: 'raw',
    threshold: -4.1,          // recession-type drag zone
    direction: 'below',
    span: 3,
    buffer: 1.0,
    tier: 1,
    weight: 1.6,
    tooltip:
      'Leading Economic Index, 6-month rate of change. Historically, values below about –4% have lined up with recession regimes.\n\n' +
      'Input the current 6-month %Δ from the latest LEI release.',
    format: fmtPct1Signed,
  },

  YIELD_CURVE: {
    label: 'Yield Curve (10y–3m)',
    desc: '10-year minus 3-month Treasury spread (inverted when negative).',
    fromFred: true,
    fredId: 'T10Y3M',
    transform: 'raw',
    historyTransform: 'raw',
    threshold: 0.0,
    direction: 'below',
    span: 1.5,
    buffer: 0.35,
    tier: 1,
    weight: 1.5,
    tooltip:
      '10-year Treasury yield minus 3-month Treasury yield. Deep and persistent inversions have preceded most post-war US recessions.\n\n' +
      'Stress rises as the curve goes more negative, with extra amplification when inverted.',
    format: fmtPlain2,
  },

  CREDIT_SPREAD: {
    label: 'HY Credit Spread',
    desc: 'ICE BofA US High Yield OAS (%).',
    fromFred: true,
    fredId: 'BAMLH0A0HYM2',
    transform: 'raw',
    historyTransform: 'raw',
    threshold: 5.0,
    direction: 'above',
    span: 3.0,
    buffer: 1.0,
    tier: 1,
    weight: 1.3,
    tooltip:
      'High-yield credit spread (ICE BofA US HY OAS). Spreads tend to blow out into the 6–8%+ region in classic risk-off / recession regimes.\n\n' +
      'Stress accelerates as spreads move above ~5%.',
    format: fmtPct1,
  },

  FINANCIAL_STRESS: {
    label: 'Financial Conditions (NFCI)',
    desc: 'Chicago Fed National Financial Conditions Index.',
    fromFred: true,
    fredId: 'NFCI',
    transform: 'raw',
    historyTransform: 'raw',
    threshold: 0.0,
    direction: 'above',
    span: 0.7,
    buffer: 0.15,
    tier: 1,
    weight: 1.1,
    tooltip:
      'Chicago Fed National Financial Conditions Index (NFCI). Positive values indicate tighter-than-average financial conditions.\n\n' +
      'Stress ramps up as NFCI moves materially above zero.',
    format: fmtPlain2,
  },

  CONSUMER_SENTIMENT: {
    label: 'Consumer Sentiment (UMich)',
    desc: 'University of Michigan sentiment index (level).',
    fromFred: true,
    fredId: 'UMCSENT',
    transform: 'raw',
    historyTransform: 'raw',
    threshold: 70,
    direction: 'below',
    span: 20,
    buffer: 7,
    tier: 1,
    weight: 1.0,
    tooltip:
      'University of Michigan Consumer Sentiment Index. Deep troughs in sentiment have often accompanied or preceded recessions and bear markets.\n\n' +
      'Stress rises as sentiment falls well below typical cycle ranges.',
    format: fmtIdx,
  },

  M2_GROWTH: {
    label: 'M2 Money Supply (YoY%)',
    desc: 'Year-on-year % change in M2 (real liquidity backdrop).',
    fromFred: true,
    fredId: 'M2SL',
    transform: 'yoy_percent',
    historyTransform: 'yoy_percent',
    threshold: 0.0,
    direction: 'below',
    span: 10,
    buffer: 3,
    tier: 1,
    weight: 0.9,
    tooltip:
      'M2 money supply, year-on-year % change. Rapid decelerations or outright contraction in liquidity have tended to coincide with tighter regimes.\n\n' +
      'Stress picks up as M2 growth drops through zero and deeper into negative territory.',
    format: fmtPct1Signed,
  },

  /* ---------------- Tier 2: Confirming ------------------- */

  INDUSTRIAL_PRODUCTION: {
    label: 'Industrial Production (YoY%)',
    desc: 'Year-on-year % change in US industrial production.',
    fromFred: true,
    fredId: 'INDPRO',
    transform: 'yoy_percent',
    historyTransform: 'yoy_percent',
    threshold: 0.0,
    direction: 'below',
    span: 6,
    buffer: 2,
    tier: 2,
    weight: 0.8,
    tooltip:
      'Industrial Production Index, year-on-year % change. Sustained negative readings typically occur in recessionary or near-recession conditions.',
    format: fmtPct1Signed,
  },

  BUILDING_PERMITS: {
    label: 'Building Permits (YoY%)',
    desc: 'Private housing units authorized, YoY % change.',
    fromFred: true,
    fredId: 'PERMIT1',
    transform: 'yoy_percent',
    historyTransform: 'yoy_percent',
    threshold: -5.0,
    direction: 'below',
    span: 20,
    buffer: 5,
    tier: 2,
