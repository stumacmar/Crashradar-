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
//       "value": <latest-number|null>   // convenience field
//     },
//     ...
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
      // node-fetch@2 is installed by the workflow
      _fetch = require("node-fetch");
    }

    const FRED = "https://api.stlouisfed.org/fred";

    // REQUIRED series – keep this in sync with the UI.
    const REQUIRED_SERIES = [
      "T10Y3M",
      "BAMLH0A0HYM2",
      "UMCSENT",
      "ISMNOI",
      "M2SL",
      "VIXCLS",
      "ICSA",
      "UNRATE",
      "SAHMREALTIME",
      "INDPRO",
      "AWHMAN",
      "USSLIND",
      "PERMIT",
      "HOUST",
      "NFCI",
      "TEDRATE",
      "TDSP"
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

      // latest non-null
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

    if (failed.length) {
      console.error("Missing required series:", failed.join(", "));
      // Fail the workflow so you SEE the problem instead of committing junk.
      process.exitCode = 1;
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
  } catch (err) {
    console.error("FATAL:", err.message);
    process.exitCode = 1;
  }
})();
