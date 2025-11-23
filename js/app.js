// js/app.js
// Central orchestrator for Economic Crash Radar Pro.
//
// Responsibilities:
// - Runtime state for indicators, valuations, composite score, cacheMeta.
// - Load FRED cache and compute auto indicator values (same transforms as original).
// - Apply manual inputs (LEI, Buffett, CAPE) with localStorage persistence.
// - Maintain composite history in localStorage.
// - Read URL params for i_KEY / v_KEY overrides.
// - Wire all UI modules and button handlers.
//
// NOTE: All business logic (thresholds, spans, scoring, wording) follows the original index.html.

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

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

// FRED cache + metadata
let fredCache = null;
const cacheMeta = {
  generatedAt: null,   // string or null
  cacheAgeDays: null,  // number or null
};

// -----------------------------------------------------------------------------
// Loading overlay (shared by several modules)
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
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error('Error loading composite history:', err);
    return [];
  }
}

function saveCompositeHistoryToStorage() {
  try {
    localStorage.setItem(
      COMPOSITE_HISTORY_KEY,
      JSON.stringify(compositeHistory),
    );
  } catch (err) {
    console.error('Error saving composite history:', err);
  }
}

function recordCompositeHistory() {
  if (!Number.isFinite(compositeScore)) return;

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  let changed = false;

  const idx = compositeHistory.findIndex(d => d.date === dateStr);
  if (idx >= 0) {
    if (compositeHistory[idx].score !== compositeScore) {
      compositeHistory[idx].score = compositeScore;
      changed = true;
    }
  } else {
    compositeHistory.push({ date: dateStr, score: compositeScore });
    changed = true;
  }

  compositeHistory = compositeHistory
    .filter(
      d =>
        d &&
        typeof d.date === 'string' &&
        Number.isFinite(d.score),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const MAX_POINTS = 730; // ~2 years of daily points
  if (compositeHistory.length > MAX_POINTS) {
    compositeHistory = compositeHistory.slice(
      compositeHistory.length - MAX_POINTS,
    );
    changed = true;
  }

  if (changed) saveCompositeHistoryToStorage();
}

// -----------------------------------------------------------------------------
// URL params
// -----------------------------------------------------------------------------

function applyUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams) return;

  // Indicators: i_KEY
  Object.keys(INDICATOR_CONFIG).forEach(key => {
    const raw = urlParams.get(`i_${key}`);
    if (raw === null) return;
    const num = parseFloat(raw);
    if (Number.isFinite(num)) {
      indicatorValuesByKey[key] = num;
    }
  });

  // Valuations: v_KEY
  Object.keys(VALUATION_CONFIG).forEach(key => {
    const raw = urlParams.get(`v_${key}`);
    if (raw === null) return;
    const num = parseFloat(raw);
    if (Number.isFinite(num)) {
      valuationValuesByKey[key] = num;
    }
  });
}

// -----------------------------------------------------------------------------
// FRED cache loader (same transforms as original loadFromFredCache)
// -----------------------------------------------------------------------------

async function loadFredCache(forceReload = false) {
  if (fredCache && !forceReload) return fredCache;

  const res = await fetch('data/fred_cache.json', {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  const json = await res.json();
  fredCache = json;

  const series = fredCache.series || {};
  const gen = fredCache.generated_at || 'loaded';

  cacheMeta.generatedAt = gen;

  const genDate = new Date(gen);
  if (!isNaN(genDate
