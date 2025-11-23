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
// FRED: apply current cache values to indicators (via dataService)
// -----------------------------------------------------------------------------

async function applyFredToIndicators() {
  const { valuesByKey, cacheMeta: meta } =
    await loadCurrentIndicatorValues();

  // Merge FRED-backed values into indicatorValuesByKey.
  Object.keys(valuesByKey).forEach(key => {
    indicatorValuesByKey[key] = valuesByKey[key];
  });

  // Update cache metadata.
  if (meta) {
    cacheMeta.generatedAt =
      typeof meta.generatedAt === 'string'
        ? meta.generatedAt
        : cacheMeta.generatedAt;
    cacheMeta.cacheAgeDays =
      Number.isFinite(meta.cacheAgeDays)
        ? meta.cacheAgeDays
        : cacheMeta.cacheAgeDays;
  }

  // Update header badge.
  const cacheBadge = document.getElementById('cache-badge');
  if (cacheBadge && cacheMeta.generatedAt) {
    cacheBadge.textContent = 'FRED cache: ' + cacheMeta.generatedAt;
  }
}

// -----------------------------------------------------------------------------
// Core recompute + render pipeline
// -----------------------------------------------------------------------------

function recomputeComposite() {
  compositeScore = computeComposite(
    indicatorValuesByKey,
    valuationValuesByKey,
  );
}

function refreshAllUI() {
  // 1) Composite score + history
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
  applyFredToIndicators()
    .then(() => {
      renderAllTiles();
      refreshAllUI();
    })
    .catch(err => {
      console.error('Refresh error:', err);
      const cacheBadge = document.getElementById('cache-badge');
      if (cacheBadge) {
        cacheBadge.textContent = 'FRED cache: LOAD ERROR';
      }
      refreshAllUI();
      alert(
        'Error refreshing from data/fred_cache.json. ' +
        'Check the file exists in /data and is valid JSON.'
      );
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
1. Press "Refresh Data" to pull the latest FRED cache (auto tiles).
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
  refreshAllUI();

  // 6) Initial FRED load and full refresh.
  showLoading('Loading FRED data...');
  applyFredToIndicators()
    .then(() => {
      renderAllTiles();
      refreshAllUI();
    })
    .catch(err => {
      console.error('Init error loading FRED cache:', err);
      const cacheBadge = document.getElementById('cache-badge');
      if (cacheBadge) {
        cacheBadge.textContent = 'FRED cache: LOAD ERROR';
      }
      refreshAllUI();
      alert(
        'Could not load data/fred_cache.json. ' +
        'Check that the file exists at /data/fred_cache.json in your GitHub repo ' +
        'and that the JSON has { "series": { ... }, "generated_at": "..." }.'
      );
    })
    .finally(() => {
      hideLoading();
    });

  // 7) Wire buttons + global events.
  wireButtons();
  wireGlobalEvents();
});
