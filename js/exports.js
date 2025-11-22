// js/exports.js
// Export & share utilities:
// - CSV export
// - PDF export stub
// - Local snapshot
// - Shareable link
//
// This is a modular extraction of the original:
//   exportToCSV, exportToPDF, saveSnapshot, shareLink
//
// It does NOT read global indicator/valuation objects. Instead, callers
// must pass in the current indicator/valuation values and composite score.

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

import {
  scaleIndicator,
  valuationStress,
} from './scoring.js';

/* ---------- Internal: loading overlay helpers ---------- */

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

/* ---------- CSV export (unchanged logic) ---------- */

/**
 * Export current state as CSV.
 *
 * Mirrors original exportToCSV:
 * - One row per macro indicator, then per valuation indicator.
 * - Final row for composite score.
 *
 * @param {Object} params
 *  - indicatorValuesByKey: { [key:string]: number|null }
 *  - valuationValuesByKey: { [key:string]: number|null }
 *  - compositeScore: number|null
 */
export function exportToCSV({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  compositeScore = null,
}) {
  let csvContent = 'Indicator,Current Value,Stress Score,Threshold\n';

  // Macro indicators
  Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
    const current = indicatorValuesByKey[key];
    const stress = scaleIndicator(key, current, cfg);

    const stressText =
      stress !== null && Number.isFinite(stress)
        ? stress.toFixed(1)
        : 'N/A';

    const valueText =
      current !== null && Number.isFinite(current)
        ? current
        : 'N/A';

    const thresholdText =
      cfg.threshold !== null && cfg.threshold !== undefined
        ? cfg.threshold
        : 'N/A';

    csvContent += `"${cfg.label}","${valueText}","${stressText}","${thresholdText}"\n`;
  });

  // Valuation indicators
  Object.entries(VALUATION_CONFIG).forEach(([key, cfg]) => {
    const current = valuationValuesByKey[key];
    const stress = valuationStress(key, current);

    const stressText =
      stress !== null && Number.isFinite(stress)
        ? stress.toFixed(1)
        : 'N/A';

    const valueText =
      current !== null && Number.isFinite(current)
        ? current
        : 'N/A';

    const thresholdText =
      cfg.danger !== null && cfg.danger !== undefined
        ? cfg.danger
        : 'N/A';

    csvContent += `"${cfg.label}","${valueText}","${stressText}","${thresholdText}"\n`;
  });

  // Composite row
  const compositeText =
    compositeScore !== null && Number.isFinite(compositeScore)
      ? compositeScore.toFixed(1)
      : 'N/A';

  csvContent += `"Composite Score","${compositeText}","",""\n`;

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

/* ---------- PDF export (stub, same UX) ---------- */

/**
 * PDF export stub.
 *
 * Mirrors original exportToPDF:
 * - Shows loading overlay briefly.
 * - Alerts that jsPDF or similar would be used in production.
 */
export function exportToPDF() {
  showLoading('Generating PDF report...');
  setTimeout(() => {
    alert('PDF export would be implemented with jsPDF or similar in production.');
    hideLoading();
  }, 800);
}

/* ---------- Snapshot (localStorage) ---------- */

/**
 * Save a local snapshot of current state to localStorage.
 *
 * Mirrors original saveSnapshot, but uses passed-in values instead
 * of globals.
 *
 * @param {Object} params
 *  - indicatorValuesByKey: { [key:string]: number|null }
 *  - valuationValuesByKey: { [key:string]: number|null }
 *  - compositeScore: number|null
 */
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
    console.error('Error loading existing snapshots:', err);
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
    alert('Error saving snapshot to localStorage.');
  }
}

/* ---------- Shareable link ---------- */

/**
 * Generate and copy a shareable link containing current indicator
 * and valuation inputs in the querystring.
 *
 * Mirrors original shareLink behaviour:
 * - i_KEY for indicators
 * - v_KEY for valuations
 *
 * @param {Object} params
 *  - indicatorValuesByKey: { [key:string]: number|null }
 *  - valuationValuesByKey: { [key:string]: number|null }
 */
export function shareLink({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
}) {
  const params = new URLSearchParams();

  Object.entries(indicatorValuesByKey).forEach(([key, value]) => {
    if (value !== null && Number.isFinite(value)) {
      params.set(`i_${key}`, value.toString());
    }
  });

  Object.entries(valuationValuesByKey).forEach(([key, value]) => {
    if (value !== null && Number.isFinite(value)) {
      params.set(`v_${key}`, value.toString());
    }
  });

  const baseUrl =
    window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?${params.toString()}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        alert('Shareable link copied to clipboard.');
      })
      .catch(() => {
        fallbackCopyToClipboard(shareUrl);
      });
  } else {
    fallbackCopyToClipboard(shareUrl);
  }
}

/* ---------- Fallback copy helper ---------- */

function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    alert('Shareable link copied to clipboard.');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    alert('Unable to copy link automatically. Please copy it from the address bar.');
  } finally {
    document.body.removeChild(textArea);
  }
}
