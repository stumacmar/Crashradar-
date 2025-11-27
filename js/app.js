// app.js
// ============================================================================
// Main orchestrator for Economic Crash Radar Pro
// ============================================================================
//
// Responsibilities:
//  - Load FRED cache + compute current values
//  - Load full historical per-indicator series
//  - Maintain composite score + history in localStorage
//  - Apply manual inputs + URL parameters
//  - Wire UI renderers (tiles, charts, gauge, audit, exports)
//  - Provide full page lifecycle: initial render → refresh → expand → export
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  computeComposite,
} from './scoring.js';

import {
  loadCurrentIndicatorValues,
  loadProcessedHistory,
} from './dataService.js';

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

// ============================================================================
// CONSTANTS
// ============================================================================

const LOCAL_STORAGE_KEY = 'crashRadarManualInputs_v1';
const HISTORY_KEY = 'crashRadarCompositeHistory_v1';

// ============================================================================
// STATE
// ============================================================================

// Current indicator values
const indicatorValuesByKey = {};
const valuationValuesByKey = {};

// Composite score + history
let compositeScore = null;
let compositeHistory = [];

// Cache metadata
const cacheMeta = {
  generatedAt: null,
  cacheAgeDays: null,
};

// ============================================================================
// LOADING OVERLAY
// ============================================================================

function showLoading(msg = 'Loading…') {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (!overlay || !text) return;
  text.textContent = msg;
  overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
}

// ============================================================================
// LOCAL STORAGE — Manual Inputs
// ============================================================================

function loadManualInputs() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    if (typeof parsed.LEI === 'number') indicatorValuesByKey.LEI = parsed.LEI;
    if (typeof parsed.BUFFETT === 'number') valuationValuesByKey.BUFFETT = parsed.BUFFETT;
    if (typeof parsed.SHILLER_PE === 'number') valuationValuesByKey.SHILLER_PE = parsed.SHILLER_PE;

  } catch (e) {
    console.error('Error loading manual inputs:', e);
  }
}

function saveManualInputs() {
  const payload = {
    LEI: Number.isFinite(indicatorValuesByKey.LEI) ? indicatorValuesByKey.LEI : null,
    BUFFETT: Number.isFinite(valuationValuesByKey.BUFFETT) ? valuationValuesByKey.BUFFETT : null,
    SHILLER_PE: Number.isFinite(valuationValuesByKey.SHILLER_PE) ? valuationValuesByKey.SHILLER_PE : null,
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error('Error saving manual inputs:', e);
  }
}

// ============================================================================
// LOCAL STORAGE — Composite History
// ============================================================================

function loadCompositeHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(x => x && typeof x.date === 'string' && Number.isFinite(x.score))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error('Error loading history:', e);
    return [];
  }
}

function saveCompositeHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(compositeHistory));
  } catch (e) {
    console.error('Error saving history:', e);
  }
}

function recordDailyComposite() {
  if (!Number.isFinite(compositeScore)) return;

  const today = new Date().toISOString().slice(0, 10);
  const idx = compositeHistory.findIndex(x => x.date === today);

  if (idx >= 0) {
    if (compositeHistory[idx].score !== compositeScore) {
      compositeHistory[idx].score = compositeScore;
      saveCompositeHistory();
    }
  } else {
    compositeHistory.push({ date: today, score: compositeScore });
    compositeHistory.sort((a, b) => a.date.localeCompare(b.date));
    saveCompositeHistory();
  }
}

// ============================================================================
// URL PARAMS
// ============================================================================

function applyUrlParams() {
  const params = new URLSearchParams(location.search);

  Object.keys(INDICATOR_CONFIG).forEach(key => {
    const raw = params.get(`i_${key}`);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) indicatorValuesByKey[key] = n;
    }
  });

  Object.keys(VALUATION_CONFIG).forEach(key => {
    const raw = params.get(`v_${key}`);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) valuationValuesByKey[key] = n;
    }
  });
}

// ============================================================================
// LOAD FRED → APPLY INDICATOR VALUES
// ============================================================================

async function loadFredValues() {
  const { valuesByKey, cacheMeta: meta } = await loadCurrentIndicatorValues();

  Object.keys(valuesByKey).forEach(key => {
    indicatorValuesByKey[key] = valuesByKey[key];
  });

  if (meta.generatedAt) cacheMeta.generatedAt = meta.generatedAt;
  if (Number.isFinite(meta.cacheAgeDays)) cacheMeta.cacheAgeDays = meta.cacheAgeDays;

  const badge = document.getElementById('cache-badge');
  if (badge && cacheMeta.generatedAt) {
    badge.textContent = 'FRED cache: ' + cacheMeta.generatedAt;
  }
}

// ============================================================================
// LOAD FULL HISTORICAL SERIES FOR EACH AUTO INDICATOR
// ============================================================================

async function loadHistoricalSeries() {
  const tasks = Object.entries(INDICATOR_CONFIG)
    .filter(([_, cfg]) => cfg.fromFred)
    .map(async ([key, cfg]) => {
      const hist = await loadProcessedHistory(cfg);
      if (!hist || hist.length === 0) return;

      cfg.historySeries = {
        dates: hist.map(x => x.date),
        values: hist.map(x => x.value),
      };
    });

  await Promise.all(tasks);
}

// ============================================================================
// RECOMPUTE + RENDER UI
// ============================================================================

function computeAndRenderAll() {
  compositeScore = computeComposite(indicatorValuesByKey, valuationValuesByKey);
  recordDailyComposite();

  updateGaugeAndStatus({
    compositeScore,
    indicatorValuesByKey,
    valuationValuesByKey,
    cacheMeta,
  });

  syncValuationSummary(valuationValuesByKey);
  updateInsightText({ compositeScore, valuationValuesByKey });
  updateContributions({
    compositeScore,
    indicatorValuesByKey,
    valuationValuesByKey,
  });

  updateCompositeHistoryChart(compositeHistory, compositeScore);
  updateRiskRadarChart(indicatorValuesByKey, valuationValuesByKey);

  updateDataAudit({
    indicatorValuesByKey,
    valuationValuesByKey,
    cacheMeta,
  });
}

function renderTiles() {
  renderMacroIndicators({
    indicatorValuesByKey,
    onManualChange: (key, v) => {
      indicatorValuesByKey[key] = Number.isFinite(v) ? v : null;
      saveManualInputs();
      computeAndRenderAll();
    },
    onExpandIndicator: key => toggleIndicatorExpansion(key),
  });

  renderValuationIndicators({
    valuationValuesByKey,
    onManualChange: (key, v) => {
      valuationValuesByKey[key] = Number.isFinite(v) ? v : null;
      saveManualInputs();
      computeAndRenderAll();
    },
  });
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

function wireButtons() {
  document.getElementById('refresh-data')?.addEventListener('click', async () => {
    showLoading('Refreshing FRED data…');
    try {
      await loadFredValues();
      await loadHistoricalSeries();
      renderTiles();
      computeAndRenderAll();
    } catch (e) {
      console.error('Refresh error:', e);
      alert('Failed to refresh FRED data.');
    } finally {
      hideLoading();
    }
  });

  document.getElementById('reset-inputs')?.addEventListener('click', () => {
    if (!confirm('Reset manual LEI / Buffett / CAPE inputs?')) return;

    Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
      if (!cfg.fromFred) indicatorValuesByKey[key] = null;
    });

    Object.keys(VALUATION_CONFIG).forEach(key => {
      valuationValuesByKey[key] = null;
    });

    localStorage.removeItem(LOCAL_STORAGE_KEY);

    renderTiles();
    computeAndRenderAll();
  });

  document.getElementById('show-help')?.addEventListener('click', () => {
    alert(
`Economic Crash Radar Pro

This dashboard blends:
• Leading macro indicators
• Confirming indicators
• Valuation gauges
• Composite stress history
• Labour stress
• Data quality + staleness audit`
    );
  });

  // Exports
  document.getElementById('export-csv')?.addEventListener('click', () =>
    exportToCSV({ indicatorValuesByKey, valuationValuesByKey, compositeScore })
  );

  document.getElementById('export-pdf')?.addEventListener('click', () =>
    exportToPDF()
  );

  document.getElementById('export-snapshot')?.addEventListener('click', () =>
    saveSnapshot({ indicatorValuesByKey, valuationValuesByKey, compositeScore })
  );

  document.getElementById('share-link')?.addEventListener('click', () =>
    shareLink({ indicatorValuesByKey, valuationValuesByKey })
  );
}

function wireGlobalClicks() {
  document.addEventListener('click', e => {
    handleHistoryPeriodClick(e);
  });
}

// ============================================================================
// INITIALISE APP
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Init all keys to null
  Object.keys(INDICATOR_CONFIG).forEach(k => (indicatorValuesByKey[k] = null));
  Object.keys(VALUATION_CONFIG).forEach(k => (valuationValuesByKey[k] = null));

  compositeHistory = loadCompositeHistory();

  loadManualInputs();
  applyUrlParams();

  renderTiles();
  computeAndRenderAll();

  showLoading('Loading FRED data…');

  try {
    await loadFredValues();
    await loadHistoricalSeries();
    renderTiles();
    computeAndRenderAll();
  } catch (e) {
    console.error('Init load error:', e);
    alert('Could not load fred_cache.json or historical data.');
  } finally {
    hideLoading();
  }

  wireButtons();
  wireGlobalClicks();
});
