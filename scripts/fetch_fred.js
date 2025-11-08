// scripts/fetch_fred.js
// Builds data/fred_cache.json for CrashRadar from live FRED data

const fs = require("fs/promises");

(async () => {
  try {
    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY");
    }

    // Use built-in fetch if available (Node 18+), else node-fetch
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      _fetch = (await import("node-fetch")).default;
    }

    const FRED = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;

    // Series required by the current CrashRadar index
    const SERIES = [
      "T10Y3M",        // 3m10y curve
      "BAMLH0A0HYM2",  // HY OAS
      "UNRATE",        // Unemployment rate
      "ICSA",          // Jobless claims
      "SAHMREALTIME",  // Sahm rule
      "AWHMAN",        // Avg weekly hours, manufacturing
      "INDPRO",        // Industrial production
      "USSLIND",       // Leading index
      "RSAFS",         // Retail sales
      "UMCSENT",       // U. Michigan sentiment
      "NFCI",          // Chicago Fed NFCI
      "VIXCLS",        // VIX close
      "PERMIT",        // Building permits
      "HOUST",         // Housing starts
      "TEDRATE",       // TED spread
      "TDSP"           // Debt service ratio
    ];

    async function getLatestObservation(id) {
      const url =
        `${FRED}/series/observations` +
        `?series_id=${id}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&sort_order=desc` +
        `&limit=10`; // small buffer to skip "." values

      const res = await _fetch(url);
      if (!res.ok) throw new Error(`${id} HTTP ${res.status}`);

      const data = await res.json();

      const obs = (data.observations || [])
        .find(o => o.value !== "." && o.value !== "");

      if (!obs) throw new Error(`No numeric data for ${id}`);

      const value = Number(obs.value);
      if (!Number.isFinite(value)) {
        throw new Error(`Non-numeric value for ${id}: ${obs.value}`);
      }

      return {
        id,
        last_updated: obs.date,
        value
      };
    }

    const cache = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    for (const id of SERIES) {
      try {
        console.log("Fetching", id);
        cache.series[id] = await getLatestObservation(id);
      } catch (err) {
        console.error("ERROR", id, err.message);
      }
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/fred_cache.json", JSON.stringify(cache, null, 2));
    console.log("✅ data/fred_cache.json written.");
  } catch (err) {
    console.error("FATAL", err);
    process.exit(1);
  }
})();
