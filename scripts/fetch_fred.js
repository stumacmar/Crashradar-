// scripts/fetch_fred.js
// Builds data/fred_cache.json with full history for all required FRED series.
// Output schema:
// {
//   "generated_at": "...",
//   "series": {
//     "<ID>": {
//       "id": "<ID>",
//       "last_updated": "<ISO timestamp>",
//       "observations": [ { "date": "YYYY-MM-DD", "value": <number|null> }, ... ],
//       "value": <latest-number|null>   // convenience field (last non-null)
//     }
//   }
// }

const fs = require("fs/promises");
const path = require("path");

(async () => {
  try {
    const KEY = process.env.FRED_API_KEY;
    if (!KEY) throw new Error("Missing FRED_API_KEY");

    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      _fetch = require("node-fetch"); // node-fetch@2 installed in workflow
    }

    const FRED = "https://api.stlouisfed.org/fred";

    // REQUIRED series — MUST stay in sync with index.html INDICATORS.
    const REQUIRED_SERIES = [
      "T10Y3M",        // Yield curve (10y-3m)
      "BAMLH0A0HYM2",  // HY OAS
      "UMCSENT",       // UMich Sentiment
      "M2SL",          // M2 level (we derive YoY)
      "NFCI",          // Chicago Fed Financial Conditions Index
      "ICSA",          // Initial claims
      "SAHMREALTIME",  // Sahm Rule
      "INDPRO",        // Industrial Production (we derive YoY)
      "PERMIT"         // Building Permits (we derive 6m %Δ)
// LEI and valuations are manual inputs; no FRED id required here.
    ];

    async function fetchSeries(id) {
      const url =
        `${FRED}/series/observations` +
        `?series_id=${encodeURIComponent(id)}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=1950-01-01`;

      const res = await _fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.observations || !data.observations.length) {
        throw new Error("No observations");
      }

      const observations = data.observations.map(o => {
        if (o.value === "." || o.value === "" || o.value == null) {
          return { date: o.date, value: null };
        }
        const v = Number(o.value);
        return { date: o.date, value: Number.isFinite(v) ? v : null };
      });

      // latest non-null numeric
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
        last_updated: new Date().toISOString(),
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

    if (failed.length) {
      console.error("Missing required series:", failed.join(", "));
      // Non-zero so GitHub Actions surfaces the problem.
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("FATAL:", err.message);
    process.exitCode = 1;
  }
})();
