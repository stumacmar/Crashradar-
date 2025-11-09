// scripts/fetch_fred.js
// Build data/fred_cache.json with full history for Economic Crash Radar Pro

const fs = require("fs/promises");

(async () => {
  try {
    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY");
    }

    // Use Node 18+ global fetch if present, otherwise fall back to node-fetch
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      _fetch = (await import("node-fetch")).default;
    }

    const FRED = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;

    // Series used directly by index.html (plus a few safe extras)
    const SERIES = {
      // CORE (must exist)
      T10Y3M:       "1959-01-01", // Yield curve (10y-3m)
      BAMLH0A0HYM2: "1997-01-01", // HY OAS
      UMCSENT:      "1978-01-01", // UMich Sentiment
      NAPMNOI:      "1960-01-01", // ISM New Orders
      M2SL:         "1959-01-01", // M2 Money Stock (for YoY)
      ICSA:         "1967-01-01", // Initial Claims
      SAHMREALTIME: "2000-01-01", // Sahm Rule
      PERMIT:       "1960-01-01", // Building Permits

      // EXTRAS (not required by UI, but harmless)
      UNRATE:       "1948-01-01",
      AWHMAN:       "1964-01-01",
      INDPRO:       "1919-01-01",
      NFCI:         "1971-01-01",
      VIXCLS:       "1990-01-01",
      HOUST:        "1959-01-01",
      NEWORDER:     "1960-01-01",
      SP500:        "1950-01-01",
      USSLIND:      "1960-01-01",
      RSAFS:        "1992-01-01",
      TEDRATE:      "1986-01-01",
      TDSP:         "1980-01-01"
    };

    async function getSeries(id, start) {
      const url =
        `${FRED}/series/observations` +
        `?series_id=${id}` +
        `&api_key=${KEY}` +
        `&file_type=json` +
        `&observation_start=${start}`;

      const res = await _fetch(url);
      if (!res.ok) throw new Error(`${id} HTTP ${res.status}`);

      const data = await res.json();
      const raw = data.observations || [];

      const observations = raw
        .map(o => {
          const v = Number(o.value);
          return Number.isFinite(v)
            ? { date: o.date, value: v }
            : null;
        })
        .filter(Boolean);

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
