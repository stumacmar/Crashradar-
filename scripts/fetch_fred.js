// scripts/fetch_fred.js
// Builds data/fred_cache.json with full history for all required FRED series.
// Output schema:
// {
//   "generated_at": "...",
//   "series": {
//     "<ID>": {
//       "id": "<ID>",
//       "last_updated": "<ISO timestamp of last obs>",
//       "observations": [ { "date": "YYYY-MM-DD", "value": <number|null> }, ... ],
//       "value": <latest-number|null>
//     }
//   }
// }

const fs = require("fs/promises");
const path = require("path");

(async () => {
  try {
    const KEY = process.env.FRED_API_KEY;
    if (!KEY) throw new Error("Missing FRED_API_KEY");

    // Use built-in fetch if available (Node 18+), else node-fetch@2 (installed in workflow)
    let fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      const nf = require("node-fetch");
      fetchFn = nf.default || nf;
    }

    const FRED = "https://api.stlouisfed.org/fred";

    // KEEP IN SYNC WITH DASHBOARD
    const REQUIRED_SERIES = [
      "T10Y3M",        // 10y-3m
      "BAMLH0A0HYM2",  // HY OAS
      "UMCSENT",       // UMich sentiment
      "ISMNOI",        // ISM New Orders (replaces deprecated NAPMNOI)
      "M2SL",          // M2
      "VIXCLS",        // VIX
      "ICSA",          // Initial claims
      "UNRATE",        // Unemployment rate
      "SAHMREALTIME",  // Sahm rule
      "INDPRO",        // Industrial production
      "AWHMAN",        // Avg weekly hours, manufacturing
      "USSLIND",       // Leading index
      "PERMIT",        // Building permits
      "HOUST",         // Housing starts
      "NFCI",          // Chicago Fed NFCI
      "TEDRATE",       // TED spread
      "TDSP"           // Debt service ratio
    ];

    async function fetchSeries(id) {
      const url =
        `${FRED}/series/observations` +
        `?series_id=${encodeURIComponent(id)}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=1950-01-01`;

      const res = await fetchFn(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!Array.isArray(data.observations) || data.observations.length === 0) {
        throw new Error("No observations");
      }

      const observations = data.observations.map(o => {
        if (o.value === "." || o.value === "" || o.value == null) {
          return { date: o.date, value: null };
        }
        const v = Number(o.value);
        return { date: o.date, value: Number.isFinite(v) ? v : null };
      });

      // Find last non-null value + its date
      let latest = null;
      for (let i = observations.length - 1; i >= 0; i--) {
        if (observations[i].value !== null) {
          latest = observations[i];
          break;
        }
      }
      if (!latest) throw new Error("No numeric values");

      return {
        id,
        last_updated: latest.date,
        observations,
        value: latest.value
      };
    }

    const out = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    const failed = [];

    for (const id of REQUIRED_SERIES) {
      try {
        const s = await fetchSeries(id);
        out.series[id] = s;
        console.log(`✔ ${id}: ${s.value} (latest)`);
      } catch (err) {
        console.error(`✖ ${id}: ${err.message}`);
        failed.push(id);
      }
    }

    const outDir = path.join(__dirname, "..", "data");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(
      path.join(outDir, "fred_cache.json"),
      JSON.stringify(out, null, 2),
      "utf8"
    );

    console.log(
      `Written fred_cache.json with ${Object.keys(out.series).length} series`
    );

    // If any required series failed, flag the workflow as failed
    if (failed.length) {
      console.error("Missing required series:", failed.join(", "));
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("FATAL:", err.message);
    process.exitCode = 1;
  }
})();
