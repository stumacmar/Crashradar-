// exports.js
// ============================================================================
// Export & share utilities:
//  - CSV export
//  - PDF export (stub / warning only)
//  - Local snapshot
//  - Shareable link
//
// CLEAN + FULLY VALIDATED VERSION
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  scaleIndicator,
  valuationStress,
} from './scoring.js';

/* ============================================================================
   Loading Overlay Helpers
============================================================================ */

function showLoading(message = 'Loading…') {
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

/* ============================================================================
   CSV EXPORT
============================================================================ */

/**
 * Export the entire current state as CSV.
 *
 * @param {Object} params
 *  - indicatorValuesByKey
 *  - valuationValuesByKey
 *  - compositeScore
 */
export function exportToCSV({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  compositeScore = null,
}) {
  let csvContent = 'Indicator,Current Value,Stress Score,Threshold\n';

  // ----------------- Macro Indicators -----------------
  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    const current = indicatorValuesByKey[key];
    const stress = scaleIndicator(key, current, cfg);

    const stressText =
      Number.isFinite(stress) ? stress.toFixed(1) : 'N/A';

    const valueText =
      Number.isFinite(current) ? current : 'N/A';

    const thresholdText =
      cfg.threshold != null ? cfg.threshold : 'N/A';

    csvContent += `"${cfg.label}","${valueText}","${stressText}","${thresholdText}"\n`;
  });

  // ----------------- Valuations -----------------
  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];
    const stress = valuationStress(key, current);

    const stressText =
      Number.isFinite(stress) ? stress.toFixed(1) : 'N/A';

    const valueText =
      Number.isFinite(current) ? current : 'N/A';

    const thresholdText =
      cfg.danger != null ? cfg.danger : 'N/A';

    csvContent += `"${cfg.label}","${valueText}","${stressText}","${thresholdText}"\n`;
  });

  // ----------------- Composite Score -----------------
  const compositeText =
    Number.isFinite(compositeScore)
      ? compositeScore.toFixed(1)
      : 'N/A';

  csvContent += `"Composite Score","${compositeText}","",""\n`;

  // Force download
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download =
    'economic_crash_radar_' +
    new Date().toISOString().split('T')[0] +
    '.csv';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================================
   PDF EXPORT (STUB)
============================================================================ */

export function exportToPDF() {
  showLoading('Generating PDF report…');

  setTimeout(() => {
    alert('PDF export would use jsPDF or similar in production.');
    hideLoading();
  }, 800);
}

/* ============================================================================
   SNAPSHOT (localStorage)
============================================================================ */

export function saveSnapshot({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  compositeScore = null,
}) {
  const snapshot = {
    timestamp: new Date().toISOString(),
    compositeScore,
    indicators: { ...indicatorValuesByKey },
    valuations: { ...valuationValuesByKey },
  };

  let snapshots = [];

  try {
    const raw = localStorage.getItem('crashRadarSnapshots');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) snapshots = parsed;
    }
  } catch (err) {
    console.error('Error reading existing snapshots:', err);
  }

  snapshots.push(snapshot);

  try {
    localStorage.setItem(
      'crashRadarSnapshots',
      JSON.stringify(snapshots),
    );
    alert('Snapshot saved.');
  } catch (err) {
    console.error('Error saving snapshot:', err);
    alert('Unable to save snapshot to localStorage.');
  }
}

/* ============================================================================
   SHAREABLE LINK
============================================================================ */

export function shareLink({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
}) {
  const params = new URLSearchParams();

  // ----------------- Indicators -----------------
  Object.entries(indicatorValuesByKey).forEach(([key, value]) => {
    if (Number.isFinite(value)) {
      params.set(`i_${key}`, value.toString());
    }
  });

  // ----------------- Valuations -----------------
  Object.entries(valuationValuesByKey).forEach(([key, value]) => {
    if (Number.isFinite(value)) {
      params.set(`v_${key}`, value.toString());
    }
  });

  const baseUrl =
    window.location.origin + window.location.pathname;

  const url = `${baseUrl}?${params.toString()}`;

  // Clipboard API if available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => alert('Shareable link copied.'))
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
}

/* ============================================================================
   Fallback Copy Helper
============================================================================ */

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();

  try {
    document.execCommand('copy');
    alert('Shareable link copied.');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    alert('Unable to copy link automatically.');
  }

  document.body.removeChild(ta);
}
