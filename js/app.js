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
  computeCompositeScore,
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
  if (!isNaN(genDate)) {
    const now = new Date();
    let ageDays = (now - genDate) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) ageDays = null;
    cacheMeta.cacheAgeDays = ageDays;
  } else {
    cacheMeta.cacheAgeDays = null;
  }

  const cacheBadge = document.getElementById('cache-badge');
  if (cacheBadge) {
    cacheBadge.textContent = 'FRED cache: ' + gen;
  }

  // Logging same as original (for console debug only).
  ['T10Y3M', 'BAMLH0A0HYM2', 'UMCSENT', 'M2SL', 'NFCI', 'ICSA', 'SAHMREALTIME', 'INDPRO', 'PERMIT']
    .forEach(id => {
      const s = series[id];
      let v = null;
      if (s) {
        if (Array.isArray(s.observations) && s.observations.length) {
          v = Number(s.observations[s.observations.length - 1].value);
        } else if (typeof s.value !== 'undefined') {
          v = Number(s.value);
        }
      }
      if (Number.isFinite(v)) {
        console.log(`✅ ${id} loaded from fred_cache.json:`, v);
      } else {
        console.warn(`⚠️ ${id} missing or invalid in fred_cache.json`);
      }
    });

  return fredCache;
}

// Helpers mirroring original loadFromFredCache internals
function lastVal(seriesMap, id) {
  const s = seriesMap[id];
  if (!s) return null;
  if (Array.isArray(s.observations) && s.observations.length) {
    for (let i = s.observations.length - 1; i >= 0; i--) {
      const v = Number(s.observations[i].value);
      if (Number.isFinite(v)) return v;
    }
    return null;
  }
  if (typeof s.value !== 'undefined') {
    const v = Number(s.value);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function obsMonthsBack(seriesMap, id, months) {
  const s = seriesMap[id];
  if (
    !s ||
    !Array.isArray(s.observations) ||
    !s.observations.length
  ) {
    return null;
  }
  const last = s.observations[s.observations.length - 1];
  const lastDate = new Date(last.date);
  if (isNaN(lastDate)) return null;
  const target = new Date(lastDate);
  target.setMonth(target.getMonth() - months);
  let candidate = null;
  for (let i = 0; i < s.observations.length; i++) {
    const o = s.observations[i];
    const d = new Date(o.date);
    if (isNaN(d)) continue;
    if (d <= target) candidate = o;
    else break;
  }
  return candidate;
}

function rollingAvgLastN(seriesMap, id, n) {
  const s = seriesMap[id];
  if (
    !s ||
    !Array.isArray(s.observations) ||
    s.observations.length < n
  ) {
    return null;
  }
  const slice = s.observations.slice(-n);
  const vals = slice
    .map(o => Number(o.value))
    .filter(v => Number.isFinite(v));
  if (vals.length < n) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return sum / n;
}

function pctChange(nv, ov) {
  const n = Number(nv);
  const o = Number(ov);
  if (!Number.isFinite(n) || !Number.isFinite(o) || o === 0) {
    return null;
  }
  return ((n - o) / o) * 100;
}

/**
 * Apply FRED cache to auto (fromFred) indicators.
 * This mirrors the original branch logic:
 * - M2SL -> M2_GROWTH YoY (%)
 * - INDPRO YoY (%)
 * - PERMIT 6m % change
 * - ICSA 4-week moving average in thousands
 * - Others: last valid numeric observation
 */
async function applyFredToIndicators(forceReload = false) {
  const cache = await loadFredCache(forceReload);
  const series = cache.series || {};

  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.fromFred || !cfg.fredId) return;

    const fredId = cfg.fredId;

    if (fredId === 'M2SL') {
      const lvlNow = lastVal(series, 'M2SL');
      const back = obsMonthsBack(series, 'M2SL', 12);
      if (lvlNow != null && back && back.value != null) {
        const pc = pctChange(lvlNow, back.value);
        if (pc != null) indicatorValuesByKey[key] = pc;
      }
      return;
    }

    if (fredId === 'INDPRO') {
      const lvlNow = lastVal(series, 'INDPRO');
      const back = obsMonthsBack(series, 'INDPRO', 12);
      if (lvlNow != null && back && back.value != null) {
        const pc = pctChange(lvlNow, back.value);
        if (pc != null) indicatorValuesByKey[key] = pc;
      }
      return;
    }

    if (fredId === 'PERMIT') {
      const nowVal = lastVal(series, 'PERMIT');
      const back = obsMonthsBack(series, 'PERMIT', 6);
      if (nowVal != null && back && back.value != null) {
        const pc = pctChange(nowVal, back.value);
        if (pc != null) indicatorValuesByKey[key] = pc;
      }
      return;
    }

    if (fredId === 'ICSA') {
      const avg = rollingAvgLastN(series, 'ICSA', 4);
      if (avg != null) {
        indicatorValuesByKey[key] = avg / 1000; // thousands
      }
      return;
    }

    // Default: last numeric value
    const v = lastVal(series, fredId);
    if (v != null) {
      indicatorValuesByKey[key] = v;
    }
  });
}

// -----------------------------------------------------------------------------
// Core recompute + render pipeline
// -----------------------------------------------------------------------------

function recomputeComposite() {
  compositeScore = computeCompositeScore(
    indicatorValuesByKey,
    valuationValuesByKey,
  );
}

function refreshAllUI() {
  // 1) Composite score
  recomputeComposite();
  recordCompositeHistory();

  // 2) Gauge + sidebar tiles + insight + contributions
  updateGaugeAndStatus({
    compositeScore,
    indicatorValuesByKey,
    valuationValuesByKey,
    cacheMeta,
  });

  syncValuationSummary(valuationValuesByKey);
  updateInsightText({
    compositeScore,
    valuationValuesByKey,
  });

  updateContributions({
    compositeScore,
    indicatorValuesByKey,
    valuationValuesByKey,
  });

  // 3) Charts
  updateCompositeHistoryChart(compositeHistory, compositeScore);
  updateRiskRadarChart(
    indicatorValuesByKey,
    valuationValuesByKey,
  );

  // 4) Audit / data quality
  updateDataAudit({
    indicatorValuesByKey,
    valuationValuesByKey,
    cacheMeta,
  });
}

function renderAllTiles() {
  renderMacroIndicators({
    indicatorValuesByKey,
    onManualChange: (key, value) => {
      indicatorValuesByKey[key] =
        Number.isFinite(value) ? value : null;
      saveManualInputsToStorage();
      refreshAllUI();
    },
    onExpandIndicator: key => {
      toggleIndicatorExpansion(key);
    },
  });

  renderValuationIndicators({
    valuationValuesByKey,
    onManualChange: (key, value) => {
      valuationValuesByKey[key] =
        Number.isFinite(value) ? value : null;
      saveManualInputsToStorage();
      refreshAllUI();
    },
  });
}

// -----------------------------------------------------------------------------
// Button handlers
// -----------------------------------------------------------------------------

function handleRefreshData() {
  showLoading('Loading FRED data...');
  applyFredToIndicators(true)
    .then(() => {
      renderAllTiles();
      refreshAllUI();
    })
    .catch(err => {
      console.error('Refresh error:', err);
      // Even on error, try to render using whatever we have.
      renderAllTiles();
      refreshAllUI();
    })
    .finally(() => {
      hideLoading();
    });
}

function handleResetInputs() {
  if (
    !confirm(
      'Reset all manual inputs (LEI / Buffett / CAPE)?',
    )
  ) {
    return;
  }

  // Clear only manual indicators and valuations.
  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    if (!cfg.fromFred) {
      indicatorValuesByKey[key] = null;
    }
  });

  Object.keys(VALUATION_CONFIG).forEach(key => {
    valuationValuesByKey[key] = null;
  });

  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (err) {
    console.error('Error clearing manual inputs:', err);
  }

  renderAllTiles();
  refreshAllUI();
}

function handleShowHelp() {
  const helpContent = `
Economic Crash Radar Pro

Macro indicators (10):
- Tier 1 (Leading): LEI, Yield Curve, Credit Spread, Financial Stress, Consumer Sentiment, M2 Growth
- Tier 2 (Confirming): Industrial Production, Building Permits, Initial Claims, Sahm Rule

Valuation indicators (2):
- Buffett Indicator (Market Cap / GDP)
- Shiller CAPE (cyclically adjusted P/E)

How to use:
1. Ensure FRED data is loaded (most tiles auto).
2. Manually input LEI 6m %Δ, Buffett, and CAPE.
3. Monitor the composite score and tile stress levels.
4. Click any FRED-based tile to expand history.
5. Use 12M / 5Y / MAX buttons to change lookback.

Interpretation:
- 0–30: Low stress
- 30–50: Elevated – monitor
- 50–70: High – defensive bias
- 70–100: Critical – historical danger zone
  `;
  alert(helpContent);
}

function wireButtons() {
  const refreshBtn = document.getElementById('refresh-data');
  const resetBtn = document.getElementById('reset-inputs');
  const helpBtn = document.getElementById('show-help');
  const csvBtn = document.getElementById('export-csv');
  const pdfBtn = document.getElementById('export-pdf');
  const snapshotBtn = document.getElementById('export-snapshot');
  const shareBtn = document.getElementById('share-link');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefreshData);
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', handleResetInputs);
  }
  if (helpBtn) {
    helpBtn.addEventListener('click', handleShowHelp);
  }
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      exportToCSV({
        indicatorValuesByKey,
        valuationValuesByKey,
        compositeScore,
      });
    });
  }
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      exportToPDF();
    });
  }
  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      saveSnapshot({
        indicatorValuesByKey,
        valuationValuesByKey,
        compositeScore,
      });
    });
  }
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareLink({
        indicatorValuesByKey,
        valuationValuesByKey,
      });
    });
  }
}

// -----------------------------------------------------------------------------
// Global event wiring
// -----------------------------------------------------------------------------

function wireGlobalEvents() {
  // History period buttons (12M / 5Y / MAX)
  document.addEventListener('click', e => {
    handleHistoryPeriodClick(e);
  });
}

// -----------------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // 1) Initialise indicatorValuesByKey / valuationValuesByKey with nulls.
  Object.keys(INDICATOR_CONFIG).forEach(key => {
    if (!(key in indicatorValuesByKey)) {
      indicatorValuesByKey[key] = null;
    }
  });
  Object.keys(VALUATION_CONFIG).forEach(key => {
    if (!(key in valuationValuesByKey)) {
      valuationValuesByKey[key] = null;
    }
  });

  // 2) Load composite history.
  compositeHistory = loadCompositeHistoryFromStorage();

  // 3) Local manual inputs (LEI, Buffett, CAPE).
  loadManualInputsFromStorage();

  // 4) URL params override.
  applyUrlParams();

  // 5) First render of tiles with whatever we have so far.
  renderAllTiles();

  // 6) Initial FRED load and full refresh.
  showLoading('Loading FRED data...');
  applyFredToIndicators(false)
    .then(() => {
      renderAllTiles();
      refreshAllUI();
    })
    .catch(err => {
      console.error('Init error:', err);
      // Fall back to whatever we have (manual + URL).
      refreshAllUI();
    })
    .finally(() => {
      hideLoading();
    });

  // 7) Wire buttons + global events.
  wireButtons();
  wireGlobalEvents();
});
