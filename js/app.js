// js/app.js
// Central orchestrator for Economic Crash Radar Pro.
//
// Responsibilities:
// - Runtime state for indicators, valuations, composite score, cacheMeta.
// - Load FRED cache (via dataService) and compute auto indicator values.
// - Apply manual inputs (LEI, Buffett, CAPE) with localStorage persistence.
// - Maintain composite history in localStorage.
// - Read URL params for i_KEY / v_KEY overrides.
// - Wire all UI modules and button handlers.

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  computeComposite,
} from './scoring.js';

import {
  renderMacroIndicators,
  renderValuationIndicators,
} from './uiIndicators.js';

import {
  updateGaugeAndStatus,
  syncValuationSummary,
  updateInsightText,
  updateContributions,
} from './uiGauge.js';

import {
  updateCompositeHistoryChart,
  updateRiskRadarChart,
  toggleIndicatorExpansion,
  handleHistoryPeriodClick,
} from './uiCharts.js';

import {
  updateDataAudit,
} from './uiAudit.js';

import {
  exportToCSV,
  exportToPDF,
  saveSnapshot,
  shareLink,
} from './exports.js';

import {
  loadCurrentIndicatorValues,
} from './dataService.js';

// -----------------------------------------------------------------------------
// Constants / keys
// -----------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = 'crashRadarManualInputs_v1';
const COMPOSITE_HISTORY_KEY = 'crashRadarCompositeHistory_v1';

// -----------------------------------------------------------------------------
// App state
// -----------------------------------------------------------------------------

// indicatorValuesByKey: e.g. { LEI: -4.1, YIELD_CURVE: -0.5, ... }
const indicatorValuesByKey = {};
// valuationValuesByKey: e.g. { BUFFETT: 195, SHILLER_PE: 32 }
const valuationValuesByKey = {};

// Composite + history
let compositeScore = null;
let compositeHistory = [];

// FRED cache metadata (actual cache lives in dataService)
const cacheMeta = {
  generatedAt: null,   // string or null
  cacheAgeDays: null,  // number or null
};

// -----------------------------------------------------------------------------
// Loading overlay
// -----------------------------------------------------------------------------

function showLoading(message = 'Loading data...') {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (!overlay || !text) return;
  text.textContent = message;
  overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
}

// -----------------------------------------------------------------------------
// LocalStorage: manual inputs
// -----------------------------------------------------------------------------

function loadManualInputsFromStorage() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Error loading manual inputs from localStorage:', err);
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;

  if (typeof parsed.LEI === 'number') {
    indicatorValuesByKey.LEI = parsed.LEI;
  }
  if (typeof parsed.BUFFETT === 'number') {
    valuationValuesByKey.BUFFETT = parsed.BUFFETT;
  }
  if (typeof parsed.SHILLER_PE === 'number') {
    valuationValuesByKey.SHILLER_PE = parsed.SHILLER_PE;
  }
}

function saveManualInputsToStorage() {
  const payload = {
    LEI: Number.isFinite(indicatorValuesByKey.LEI)
      ? indicatorValuesByKey.LEI
      : null,
    BUFFETT: Number.isFinite(valuationValuesByKey.BUFFETT)
      ? valuationValuesByKey.BUFFETT
      : null,
    SHILLER_PE: Number.isFinite(valuationValuesByKey.SHILLER_PE)
      ? valuationValuesByKey.SHILLER_PE
      : null,
  };
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Error saving manual inputs to localStorage:', err);
  }
}

// -----------------------------------------------------------------------------
// LocalStorage: composite history
// -----------------------------------------------------------------------------

function loadCompositeHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(COMPOSITE_HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        d =>
          d &&
          typeof d.date === 'string' &&
          Number.isFinite(d.score),
      )
      .sort((a, b) => a.date.locale
