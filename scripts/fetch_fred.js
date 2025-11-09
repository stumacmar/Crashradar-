// scripts/fetch_fred.js
// Build data/fred_cache.json with full history for Economic Crash Radar Pro

const fs = require("fs/promises");

(async () => {
  try {
    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY");
    }

    // Use Node 18+ fetch if available, else node-fetch
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      _fetch = (await import("node-fetch")).default;
    }

    const FRED = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;

    // Series needed by the current index + safe extras.
    // Keys must match CONFIG.ALIAS in index.html.
    const SERIES = {
      T10Y3M:      "1959-01-01", // 10y-3m curve
      BAMLH0A0HYM2:"1997-01-01", // HY OAS
      UNRATE:      "1948-01-01", // Unemployment
      ICSA:        "1967-01-01", // Initial claims (4w MA)
      AWHMAN:      "1964-01-01", // Avg weekly hours, manufacturing
      INDPRO:      "1919-01-01", // Industrial production
      UMCSENT:     "1978-01-01", // U. Michigan sentiment
      NFCI:        "1971-01-01", // Chicago Fed NFCI
      VIXCLS:      "1990-01-01", // VIX
      PERMIT:      "1960-01-01", // Building permits
      HOUST:       "1959-01-01", // Housing starts (fallback)
      NEWORDER:    "1960-01-01", // ISM new orders (if available)
      NAPMNOI:     "1960-01-01", // alt ISM new orders (fallback)
      SP500:       "1950-01-01", // S&P (anchors history if needed)

      // Legacy/extra (harmless for front-end if unused)
      SAHMREALTIME:"2000-01-01",
      USSLIND:     "1960-01-01",
      RSAFS:       "1992-01-01",
      TEDRATE:     "1986-01-01",
      TDSP:        "1980-01-01"
    };

    async function getSeries(id, start) {
      const url =
        `${FRED}/series/observations` +
        `?series_id=${id}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=${start}`;

      const res = await _fetch(url);
      if (!res.ok) {
        throw new Error(`${id} HTTP ${res.status}`);
      }

      const data = await res.json();
      const raw = data.observations || [];

      const observations = raw
        .map(o => ({
          date: o.date,
          value: Number(o.value)
        }))
        .filter(o => Number.isFinite(o.value));

      if (!observations.length) {
        throw new Error(`No numeric observations for ${id}`);
      }

      const last = observations[observations.length - 1];

      return {
        id,
        last_updated: last.date,
        observations
      };
    }

    const cache = {
      generated_at: new Date().toISOString(),
      series: {}
    };

    for (const [id, start] of Object.entries(SERIES)) {
      try {
        console.log("Fetching", id);
        cache.series[id] = await getSeries(id, start);
      } catch (err) {
        console.error("ERROR", id, "-", err.message);
      }
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(
      "data/fred_cache.json",
      JSON.stringify(cache, null, 2),
      "utf8"
    );

    console.log("✅ data/fred_cache.json written.");
  } catch (err) {
    console.error("FATAL", err);
    process.exit(1);
  }
})();
