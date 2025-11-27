// config.js
// ============================================================================
// Central configuration for Economic Crash Radar Pro (Full Historical Mode)
// ============================================================================

// ---------------------------------------------------------------------------
// INDICATOR CONFIG
// ---------------------------------------------------------------------------
// Every indicator MUST have:
// - label
// - fromFred (true/false)
// - either fredId OR manual input
// - format: pct1 | pct0 | plain0 | plain1 | plain2
// - threshold: numerical pivot level
// - direction: "above" = worse above threshold, "below" = worse below threshold
// - span: scaling range around threshold for stress calc
// - tier: 1 or 2 (leading/confirming)
// - weight: macro weight for composite
// - description: short explanation

export const INDICATOR_CONFIG = {

  // -------------------------------------------------------------------------
  // TIER 1 — LEADING INDICATORS
  // -------------------------------------------------------------------------

  YIELD_CURVE: {
    label: "Yield Curve (10Y–3M, %)",
    fromFred: true,
    fredId: "T10Y3M",
    format: "pct1",
    threshold: 0.0,
    direction: "below",
    span: 1.0,
    tier: 1,
    weight: 1.0,
    description: "Treasury 10-year minus 3-month spread."
  },

  CREDIT_SPREAD: {
    label: "High Yield Credit Spread (%)",
    fromFred: true,
    fredId: "BAMLH0A0HYM2",
    format: "pct1",
    threshold: 5.0,
    direction: "above",
    span: 3.0,
    tier: 1,
    weight: 1.0,
    description: "ICE BofA US High Yield OAS."
  },

  CONSUMER_SENTIMENT: {
    label: "Consumer Sentiment (UMich)",
    fromFred: true,
    fredId: "UMCSENT",
    format: "plain0",
    threshold: 80,
    direction: "below",
    span: 20,
    tier: 1,
    weight: 1.0,
    description: "University of Michigan consumer sentiment."
  },

  M2_GROWTH: {
    label: "M2 Money Supply YoY (%)",
    fromFred: true,
    fredId: "M2SL",
    transform: "yoy_percent",
    format: "pct1",
    threshold: 0,
    direction: "below",
    span: 5,
    tier: 1,
    weight: 1.0,
    description: "YoY change in M2 money supply."
  },

  LEI: {
    label: "Leading Economic Index (6m %Δ)",
    fromFred: false,
    format: "pct1",
    threshold: -4.1,
    direction: "below",
    span: 3.0,
    tier: 1,
    weight: 1.0,
    description: "Six-month percentage change in the Conference Board LEI."
  },

  // -------------------------------------------------------------------------
  // TIER 2 — CONFIRMING INDICATORS
  // -------------------------------------------------------------------------

  FIN_STRESS: {
    label: "Financial Stress (NFCI)",
    fromFred: true,
    fredId: "NFCI",
    format: "plain2",
    threshold: 0.0,
    direction: "above",
    span: 0.5,
    tier: 2,
    weight: 1.0,
    description: "Chicago Fed National Financial Conditions Index."
  },

  INITIAL_CLAIMS: {
    label: "Initial Claims (ICSA, 4w MA, thousands)",
    fromFred: true,
    fredId: "ICSA",
    transform: "ma4_thousands",
    format: "plain1",
    threshold: 250,
    direction: "above",
    span: 100,
    tier: 2,
    weight: 1.0,
    description: "Initial jobless claims, 4-week moving average."
  },

  SAHM_RULE: {
    label: "Sahm Rule (%)",
    fromFred: true,
    fredId: "SAHMREALTIME",
    format: "plain1",
    threshold: 0.5,
    direction: "above",
    span: 0.5,
    tier: 2,
    weight: 1.0,
    description: "Sahm Rule recession indicator."
  },

  INDUSTRIAL_PRODUCTION: {
    label: "Industrial Production YoY (%)",
    fromFred: true,
    fredId: "INDPRO",
    transform: "yoy_percent",
    format: "pct1",
    threshold: 0,
    direction: "below",
    span: 5,
    tier: 2,
    weight: 1.0,
    description: "YoY change in industrial production."
  },

  BUILDING_PERMITS: {
    label: "Building Permits YoY (%)",
    fromFred: true,
    fredId: "PERMIT",
    transform: "yoy_percent",
    format: "pct1",
    threshold: 0,
    direction: "below",
    span: 5,
    tier: 2,
    weight: 1.0,
    description: "US building permits, YoY."
  }
};


// ---------------------------------------------------------------------------
// VALUATION CONFIG
// ---------------------------------------------------------------------------

export const VALUATION_CONFIG = {
  BUFFETT: {
    label: "Buffett Indicator (Mkt Cap / GDP, %)",
    weight: 1.0,
    format: "pct0",
    danger: "> 200%",
    tooltip: "Total US market cap divided by GDP."
  },

  SHILLER_PE: {
    label: "Shiller CAPE (x)",
    weight: 1.0,
    format: "plain1",
    danger: "> 30",
    tooltip: "Cyclically adjusted P/E ratio."
  }
};


// ---------------------------------------------------------------------------
// COMPOSITE WEIGHTS
// ---------------------------------------------------------------------------

export const MACRO_BLOCK_WEIGHT = 0.65;
export const VALUATION_BLOCK_WEIGHT = 0.35;

// ---------------------------------------------------------------------------
// WARN MAX — turn amber at ~40
// ---------------------------------------------------------------------------

export const WARN_MAX = 40;
