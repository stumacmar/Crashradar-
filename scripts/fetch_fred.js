// scripts/fetch_fred.js
// Build data/fred_cache.json with full history arrays for CrashRadar.
// Output schema matches existing live file:
// series[id] = { id, last_updated, observations:[{date, value}] }

const fs = require("fs/promises");
const path = require("path");

(async () => {
  try {
    const KEY = process.env.FRED_API_KEY;
    if (!KEY) {
      throw new Error("Missing env FRED_API_KEY (set FRED_API_KEY in secrets).");
    }

    // Use built-in fetch if available; fall back to node-fetch for older runners.
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      const mod = await import("node-fetch");
      _fetch = mod.default;
    }

    const FRED_BASE = "https://api.stlouisfed.org/fred";

    // IMPORTANT: only real FRED IDs, aligned to your UI.
    const SERIES = [
      // Tier 1 / core:
      "T10Y3M",        // 10y-3m curve
      "BAMLH0A0HYM2",  // HY OAS
      "UMCSENT",       // U Mich Sentiment
      "NAPMNOI",       // ISM Manufacturing New Orders  << key for ISM card
      "M2SL",          // M2 stock (UI computes YoY)
      "VIXCLS",        // VIX

      // Tier 2 / confirming:
      "ICSA",          // Initial claims (4w MA in UI)
      "UNRATE",        // Unemployment rate
      "SAHMREALTIME",  // Sahm rule
      "INDPRO",        // Industrial production
      "AWHMAN",        // Avg weekly hours, manufacturing
      "USSLIND",       // Leading index

      // Housing:
      "PERMIT",        // Building permits
      "HOUST",         // Housing starts

      // Financial stress / liquidity:
      "NFCI",          // Chicago Fed NFCI
      "TEDRATE",       // TED spread
      "TDSP"           // Term spread proxy (if used)
    ];

    async function fetchSeriesObservations(seriesId) {
      const url =
        `${FRED_BASE}/series/observations` +
        `?series_id=${encodeURIComponent(seriesId)}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=1950-01-01`;

      const res = await _fetch(url);
      if (!res.ok) {
        throw new Error(`FRED ${seriesId} ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.observations || data.observations.length === 0) {
        throw new Error(`No observations for ${seriesId}`);
      }

      const observations = data.observations.map(o => {
        if (o.value === "." || o.value === "" || o.value == null) {
          return { date: o.date, value: null };
        }
        const v = Number(o.value);
        return {
          date: o.date,
          value: Number.isFinite(v) ? v : null
        };
      });

      // last valid numeric value (for sanity logging)
      let lastValid = null;
      for (let i = observations.length - 1; i >= 0; i--) {
        if (observations[i].value !== null) {
          lastValid = observations[i];
          break;
        }
      }
      if (!lastValid) {
        throw new Error(`No numeric data for ${seriesId}`);
      }

      return {
        id: seriesId,
        last_updated: new Date().toISOString(),
        observations
      };
    }

    const out = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    for (const id of SERIES) {
      try {
        const s = await fetchSeriesObservations(id);
        out.series[id] = s;
        console.log(`✔ ${id} latest ${s.observations[s.observations.length - 1].value} (${s.observations[s.observations.length - 1].date})`);
      } catch (err) {
        console.error(`✖ ${id}: ${err.message}`);
      }
    }

    const outDir = path.join(__dirname, "..", "data");
    const outPath = path.join(outDir, "fred_cache.json");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(out, null, 2), "utf8");

    console.log(`Saved ${Object.keys(out.series).length} series to ${outPath}`);
  } catch (err) {
    console.error("FATAL", err.message);
    process.exitCode = 1;
  }
})();
