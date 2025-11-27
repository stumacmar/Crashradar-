// uiAudit.js
// ============================================================================
// Data Quality & Staleness panel.
// Renders counts, freshness badge, and missing indicators lists.
// Expects container ID: "audit-container"
// ============================================================================

import {
  INDICATOR_CONFIG,
  VALUATION_CONFIG,
} from './config.js';

/**
 * Update the Data Audit block.
 *
 * @param {Object} params
 *  - indicatorValuesByKey: { KEY: number|null }
 *  - valuationValuesByKey: { KEY: number|null }
 *  - cacheMeta: { cacheAgeDays: number|null }
 */
export function updateDataAudit({
  indicatorValuesByKey = {},
  valuationValuesByKey = {},
  cacheMeta = {},
}) {
  const container = document.getElementById('audit-container');
  if (!container) return;

  const { cacheAgeDays = null } = cacheMeta;

  /* ------------------------------------------------------------------------
     Categorise data
  ------------------------------------------------------------------------ */
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

  const autoFilled = autoIndicators.filter(i => Number.isFinite(i.current)).length;
  const manualFilled = manualIndicators.filter(i => Number.isFinite(i.current)).length;

  const valEntries = Object.entries(VALUATION_CONFIG).map(([key, cfg]) => ({
    key,
    label: cfg.label,
    current: valuationValuesByKey[key],
  }));

  const valTotal = valEntries.length;
  const valFilled = valEntries.filter(v => Number.isFinite(v.current)).length;

  const missingAuto = autoIndicators
    .filter(i => !Number.isFinite(i.current))
    .map(i => i.label);

  const missingManual = manualIndicators
    .filter(i => !Number.isFinite(i.current))
    .map(i => i.label);

  const missingVal = valEntries
    .filter(v => !Number.isFinite(v.current))
    .map(v => v.label);

  /* ------------------------------------------------------------------------
     Freshness badge
  ------------------------------------------------------------------------ */
  let freshnessVerdict = 'unknown';
  let freshnessLabel = 'Unknown';

  if (Number.isFinite(cacheAgeDays)) {
    freshnessLabel = `${cacheAgeDays.toFixed(1)} days`;

    if (cacheAgeDays <= 3) freshnessVerdict = 'fresh';
    else if (cacheAgeDays <= 10) freshnessVerdict = 'ok';
    else if (cacheAgeDays <= 30) freshnessVerdict = 'stale';
    else freshnessVerdict = 'very';
  }

  const freshnessBadgeHtml = (() => {
    switch (freshnessVerdict) {
      case "fresh":
        return `<span class="audit-badge audit-badge-fresh">Fresh</span>`;
      case "ok":
        return `<span class="audit-badge audit-badge-ok">OK</span>`;
      case "stale":
        return `<span class="audit-badge audit-badge-stale">Stale</span>`;
      case "very":
        return `<span class="audit-badge audit-badge-very">Very stale</span>`;
      default:
        return `<span class="audit-badge">Unknown</span>`;
    }
  })();

  /* ------------------------------------------------------------------------
     Render the block
  ------------------------------------------------------------------------ */
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

    <div class="audit-lists" style="margin-top:16px;">
      <div class="audit-list">
        <div class="audit-list-title">Missing auto indicators</div>
        ${
          missingAuto.length
            ? missingAuto.map(n => `<span class="audit-tag">${n}</span>`).join('')
            : '<span class="audit-tag audit-tag-ok">None</span>'
        }
      </div>

      <div class="audit-list" style="margin-top:16px;">
        <div class="audit-list-title">Missing manual / valuation</div>
        ${
          (missingManual.length || missingVal.length)
            ? [...missingManual, ...missingVal]
                .map(n => `<span class="audit-tag">${n}</span>`)
                .join('')
            : '<span class="audit-tag audit-tag-ok">None</span>'
        }
      </div>
    </div>
  `;
}
