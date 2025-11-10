// scripts/fetch_fred.js
// Builds data/fred_cache.json with latest values for all required FRED series.
// Designed for GitHub Actions / Node 18+ with fallback to node-fetch if needed.

const fs = require("fs/promises");
const path = require("path");

(async () => {
  try {
    // --- ENV + DIAGNOSTICS ---------------------------------------------------
    const KEY = process.env.FRED_API_KEY;
    if (!KEY) {
      throw new Error("Missing env FRED_API_KEY (set this in your repo secrets).");
    }

    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      console.log("Global fetch not found; loading node-fetch polyfill…");
      _fetch = (await import("node-fetch")).default;
    }

    const FRED_BASE = "https://api.stlouisfed.org/fred";

    // --- SERIES CONFIG -------------------------------------------------------
    // Only use REAL FRED IDs. No fake / shorthand codes.
    // Add here if you surface a new indicator in the UI.
    const SERIES = [
      // Core Crash / Lead Indicators
      "T10Y3M",        // 10y-3m yield curve spread
      "BAMLH0A0HYM2",  // HY credit spread (ICE BofA US High Yield)
      "UMCSENT",       // U. Michigan Consumer Sentiment
      "NAPMNOI",       // ISM Manufacturing New Orders (this is your ISM New Orders)
      "M2SL",          // M2 (for YoY calc in UI or downstream)
      "VIXCLS",        // VIX close

      // Labor market / confirming
      "ICSA",          // Initial Claims SA
      "UNRATE",        // Unemployment Rate
      "SAHMREALTIME",  // Sahm Rule real-time

      // Activity / production
      "INDPRO",        // Industrial Production Index
      "AWHMAN",        // Avg Weekly Hours Mfg
      "USSLIND",       // Leading Index for the US

      // Housing
      "PERMIT",        // Building Permits
      "HOUST",         // Housing Starts

      // Financial stress / liquidity
      "NFCI",          // Chicago Fed National Financial Conditions Index
      "TEDRATE",       // TED spread
      "TDSP"           // Term spread proxy (if you use it)
    ];

    // --- HELPERS -------------------------------------------------------------

    async function getLatestObservation(seriesId) {
      const url = `${FRED_BASE}/series/observations?series_id=${encodeURIComponent(
        seriesId
      )}&api_key=${KEY}&file_type=json&observation_start=1990-01-01`;

      const res = await _fetch(url);
      if (!res.ok) {
        throw new Error(
          `FRED request failed for ${seriesId}: ${res.status} ${res.statusText}`
        );
      }

      const data = await res.json();
      if (!data.observations || data.observations.length === 0) {
        throw new Error(`No observations returned for ${seriesId}`);
      }

      // Walk backwards to find the last real numeric value (FRED uses "." for missing)
      for (let i = data.observations.length - 1; i >= 0; i--) {
        const o = data.observations[i];
        if (o && o.value !== null && o.value !== "." && o.value !== "") {
          const v = Number(o.value);
          if (!Number.isNaN(v)) {
            return {
              id: seriesId,
              last_updated: o.date,
              value: v
            };
          }
        }
      }

      throw new Error(`No valid numeric observations for ${seriesId}`);
    }

    // Optional: YoY helper (used for M2 if you want to precompute)
    function computeYoY(observations) {
      if (!observations || observations.length === 0) return null;

      // last valid
      let lastIdx = observations.length - 1;
      while (lastIdx >= 0) {
        const v = observations[lastIdx].value;
        if (v !== "." && v !== "" && v != null) break;
        lastIdx--;
      }
      if (lastIdx < 0) return null;

      const last = Number(observations[lastIdx].value);
      if (!Number.isFinite(last)) return null;

      // find ~12 months earlier
      const lastDate = new Date(observations[lastIdx].date);
      const targetYear = lastDate.getUTCFullYear() - 1;
      const targetMonth = lastDate.getUTCMonth();

      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < observations.length; i++) {
        const o = observations[i];
        if (o.value === "." || o.value === "" || o.value == null) continue;
        const d = new Date(o.date);
        const dy = Math.abs(d.getUTCFullYear() - targetYear);
        const dm = Math.abs(d.getUTCMonth() - targetMonth);
        const score = dy * 12 + dm;
        if (score < bestDiff) {
          bestDiff = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1 || bestDiff > 2) return null; // too far → skip

      const prev = Number(observations[bestIdx].value);
      if (!Number.isFinite(prev) || prev === 0) return null;

      return ((last - prev) / prev) * 100;
    }

    async function getSeriesWithHistory(seriesId) {
      const url = `${FRED_BASE}/series/observations?series_id=${encodeURIComponent(
        seriesId
      )}&api_key=${KEY}&file_type=json&observation_start=1990-01-01`;

      const res = await _fetch(url);
      if (!res.ok) {
        throw new Error(
          `FRED history request failed for ${seriesId}: ${res.status} ${res.statusText}`
        );
      }

      const data = await res.json();
      if (!data.observations || data.observations.length === 0) {
        throw new Error(`No observations returned for ${seriesId}`);
      }

      // Normalize to {date, value:Number|null}
      const observations = data.observations.map(o => ({
        date: o.date,
        value:
          o.value === "." || o.value === "" || o.value == null
            ? null
            : Number(o.value)
      }));

      // latest valid
      let lastIdx = observations.length - 1;
      while (lastIdx >= 0 && !Number.isFinite(observations[lastIdx].value)) {
        lastIdx--;
      }
      if (lastIdx < 0) {
        throw new Error(`No valid numeric observations for ${seriesId}`);
      }

      return {
        id: seriesId,
        last_updated: observations[lastIdx].date,
        value: observations[lastIdx].value,
        observations
      };
    }

    // --- FETCH LOOP ----------------------------------------------------------
    const out = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    for (const id of SERIES) {
      try {
        // For M2SL we may want history for YoY;
        if (id === "M2SL") {
          const m2 = await getSeriesWithHistory(id);
          const yoy = computeYoY(m2.observations);
          out.series[id] = {
            id: m2.id,
            last_updated: m2.last_updated,
            value: m2.value
          };
          if (yoy !== null) {
            out.series["M2SL_YOY"] = {
              id: "M2SL_YOY",
              last_updated: m2.last_updated,
              value: Number(yoy.toFixed(2))
            };
          }
          console.log(
            `✔ ${id} -> ${m2.value} (last: ${m2.last_updated})`,
            yoy !== null ? ` | YoY: ${yoy.toFixed(2)}%` : ""
          );
        } else {
          const s = await getLatestObservation(id);
          out.series[id] = s;
          console.log(`✔ ${id} -> ${s.value} (last: ${s.last_updated})`);
        }
      } catch (err) {
        console.error(`✖ Failed for ${id}: ${err.message}`);
      }
    }

    // --- WRITE FILE ----------------------------------------------------------
    const outDir = path.join(__dirname, "..", "data");
    const outFile = path.join(outDir, "fred_cache.json");

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(out, null, 2), "utf8");

    console.log(`\nSaved ${Object.keys(out.series).length} series to ${outFile}`);
    console.log("Done.");
  } catch (err) {
    console.error("FATAL:", err.message);
    process.exitCode = 1;
  }
})();
