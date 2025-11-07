// scripts/fetch_fred.js
// Robust FRED cache builder for Economic Stress Index

const fs = require("fs/promises");

(async () => {
  try {
    console.log("Node version:", process.version);

    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY (set repo secret FRED_API_KEY).");
    }

    // Use built-in fetch if available; otherwise polyfill
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      console.log("global.fetch not found; loading node-fetch polyfill…");
      _fetch = (await import("node-fetch")).default;
    }

    const FRED_BASE = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;

    // Series required by ESI & related components
    const SERIES = [
      // Labour / cycle
      "ICSA",          // Initial Claims
      "UNRATE",        // Unemployment Rate
      "SAHMREALTIME",  // Sahm Rule
      "AWHAEMAN",      // Avg Weekly Hours, Manufacturing

      // Manufacturing / activity
      "NAPMNO",        // ISM New Orders
      "INDPRO",        // Industrial Production Index

      // Credit & financial conditions
      "BAMLH0A0HYM2",  // HY OAS
      "NFCI",          // Chicago Fed NFCI
      "VIXCLS",        // VIX (proxy risk)
      
      // Term structure / leading indicators used elsewhere
      "T10Y3M",
      "T10Y2Y",
      "USSLIND",
      "RSAFS"          // Retail & Food Services
      // Add any extra IDs your index.html explicitly references.
    ];

    async function fetchLatestObservation(id) {
      const url =
        `${FRED_BASE}/series/observations` +
        `?series_id=${id}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=2000-01-01`;

      const res = await _fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);

      const json = await res.json();
      if (!json.observations || !json.observations.length) {
        throw new Error(`No observations for ${id}`);
      }

      // Take most recent valid numeric value
      const obs = [...json.observations]
        .reverse()
        .find(o => o.value !== "." && o.value !== "");

      if (!obs) throw new Error(`No valid values for ${id}`);

      const valueNum = Number(obs.value);
      if (Number.isNaN(valueNum)) {
        throw new Error(`Non-numeric value for ${id}: ${obs.value}`);
      }

      return {
        id,
        last_updated: obs.date,
        value: valueNum
      };
    }

    const cache = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    for (const id of SERIES) {
      try {
        console.log(`Fetching ${id}…`);
        cache.series[id] = await fetchLatestObservation(id);
      } catch (err) {
        console.error(`ERROR for ${id}: ${err.message}`);
        // Leave it out; frontend will flag MISSING_IN_CACHE explicitly
      }
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/fred_cache.json", JSON.stringify(cache, null, 2));
    console.log("Wrote data/fred_cache.json successfully.");
  } catch (err) {
    console.error("FATAL in fetch_fred.js:", err.message || err);
    process.exit(1);
  }
})();
