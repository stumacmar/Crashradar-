// js/uiAudit.js
// Data quality & staleness card ("Data Quality & Staleness").

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

/**
 * Update the data audit card.
 *
 * @param {Object} params
 *  - indicatorValuesByKey: { [key:string]: number|null }
 *  - valuationValuesByKey: { [key:string]: number|null }
 *  - cacheMeta: { cacheAgeDays?: number|null }
 */
export function updateDataAudit({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  cacheMeta = {},
}) {
  const container = document.getElementById('data-audit');
  if (!container) return;

  const { cacheAgeDays = null } = cacheMeta;

  const autoIndicators = Object.entries(INDICATOR_CONFIG)
    .filter(([, cfg]) => cfg.fromFred)
    .map(([key, cfg]) => ({
      key,
      label: cfg.label,
      current: indicatorValuesByKey[key],
    }));

  const manualIndicators = Object.entries(INDICATOR_CONFIG)
    .filter(([, cfg]) => !cfg.fromFred)
    .map(([key, cfg]) => ({
      key,
      label: cfg.label,
      current: indicatorValuesByKey[key],
    }));

  const autoTotal = autoIndicators.length;
  const manualTotal = manualIndicators.length;

  const autoFilled = autoIndicators
    .filter(ind => Number.isFinite(ind.current))
    .length;

  const manualFilled = manualIndicators
    .filter(ind => Number.isFinite(ind.current))
    .length;

  const valEntries = Object.entries(VALUATION_CONFIG)
    .map(([key, cfg]) => ({
      key,
      label: cfg.label,
      current: valuationValuesByKey[key],
    }));

  const valTotal = valEntries.length;
  const valFilled = valEntries
    .filter(v => Number.isFinite(v.current))
    .length;

  const missingAuto = autoIndicators
    .filter(ind => !Number.isFinite(ind.current))
    .map(ind => ind.label);

  const missingManual = manualIndicators
    .filter(ind => !Number.isFinite(ind.current))
    .map(ind => ind.label);

  const missingValuations = valEntries
    .filter(v => !Number.isFinite(v.current))
    .map(v => v.label);

  let freshnessLabel = 'Unknown';
  let freshnessVerdict = 'unknown';

  if (cacheAgeDays != null && Number.isFinite(cacheAgeDays)) {
    const age = cacheAgeDays;
    freshnessLabel = age.toFixed(1) + ' days';

    if (age <= 3) {
      freshnessVerdict = 'fresh';
    } else if (age <= 10) {
      freshnessVerdict = 'ok';
    } else if (age <= 30) {
      freshnessVerdict = 'stale';
    } else {
      freshnessVerdict = 'very';
    }
  }

  const freshnessBadgeHtml =
    freshnessVerdict === 'unknown'
      ? '<span class="audit-badge">Unknown</span>'
      : `<span class="audit-badge audit-badge-${freshnessVerdict}">` +
          (freshnessVerdict === 'fresh'
            ? 'Fresh'
            : freshnessVerdict === 'ok'
            ? 'OK'
            : freshnessVerdict === 'stale'
            ? 'Stale'
            : 'Very stale') +
        '</span>';

  container.innerHTML = `
    <div class="audit-summary">
      <div class="audit-row">
        <span>Auto (FRED) indicators</span>
        <span>${autoFilled}/${autoTotal} filled</span>
      </div>
      <div class="audit-row">
        <span>Manual macro inputs</span>
        <span>${manualFilled}/${manualTotal} filled</span>
      </div>
      <div class="audit-row">
        <span>Valuation inputs</span>
        <span>${valFilled}/${valTotal} filled</span>
      </div>
      <div class="audit-row">
        <span>FRED cache age</span>
        <span>${freshnessLabel} · ${freshnessBadgeHtml}</span>
      </div>
    </div>
    <div class="audit-lists">
      <div class="audit-list">
        <div class="audit-list-title">Missing auto indicators</div>
        ${
          missingAuto.length
            ? missingAuto
                .map(name => `<span class="audit-tag">${name}</span>`)
                .join('')
            : '<span class="audit-tag audit-tag-ok">None</span>'
        }
      </div>
      <div class="audit-list">
        <div class="audit-list-title">Missing manual / valuation</div>
        ${
          (missingManual.length || missingValuations.length)
            ? [...missingManual, ...missingVal
