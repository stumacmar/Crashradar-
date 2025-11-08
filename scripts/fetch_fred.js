// scripts/fetch_fred.js
// FRED cache builder matching ESI v2.0 frontend expectations

const fs = require("fs/promises");

(async () => {
  try {
    console.log("Node version:", process.version);

    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY (set repo secret FRED_API_KEY).");
    }

    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      console.log("global.fetch not found; loading node-fetch polyfill…");
      _fetch = (await import("node-fetch")).default;
    }

    const FRED_BASE = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;

    // All series referenced in INDICATORS (fred_id/cacheKeys)
    const SERIES = [
      // Yield curve / term structure
      "T10Y3M",
      "T10Y2Y",

      // Leading real economy
      "NAPMNO",      // ISM New Orders
      "PERMIT",      // Building Permits
      "HOUST",       // Housing Starts
      "UMCSENT",     // Consumer Sentiment
      "AWHMAN",      // Avg Weekly Hours, Mfg
      "USSLIND",     // LEI proxy
      "DRTSCILM",    // SLOOS standards
      "AMDMNO",      // New Orders ex-defense

      // Financial conditions
      "BAMLH0A0HYM2", // HY OAS
      "NFCI",         // Chicago Fed NFCI
      "VIXCLS",       // VIX
      "TEDRATE",      // TED Spread
      "REAINTRATREARAT1YE", // Real policy rate proxy
      "TDSP",         // Debt service
      "T5YIFR",       // 5y5y inflation (breakeven proxy)

      // Nowcast / confirmation
      "ICSA",         // Initial claims
      "SAHMREALTIME", // Sahm Rule
      "INDPRO",       // Industrial production
      "RRSFS"         // Real retail sales proxy (or RSXFS/RSAFS fallback in frontend)
    ];

    async function fetchSeries(id) {
      const url =
        `${FRED_BASE}/series/observations` +
        `?series_id=${id}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=1970-01-01`;

      const res = await _fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);

      const json = await res.json();
      if (!json.observations || !json.observations.length) {
        throw new Error(`No observations for ${id}`);
      }

      const history = json.observations
        .filter(o => o.value !== "." && o.value !== "")
        .map(o => ({
          date: o.date,
          value: Number(o.value)
        }))
        .filter(o => Number.isFinite(o.value));

      if (!history.length) {
        throw new Error(`No numeric observations for ${id}`);
      }

      const latest = history[history.length - 1];

      return {
        history,
        last: latest.value,
        last_date: latest.date
      };
    }

    const cache = {
      generated_at: new Date().toISOString()
    };

    for (const id of SERIES) {
      try {
        console.log(`Fetching ${id}…`);
        cache[id] = await fetchSeries(id);
      } catch (err) {
        console.error(`ERROR for ${id}: ${err.message}`);
        // Missing ones will be surfaced in the Data Audit panel
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
