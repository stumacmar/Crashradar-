// scripts/fetch_fred.js
// CrashRadar ESI FRED fetcher
// Uses FRED_API_KEY (GitHub repo secret)
// Writes data/fred_cache.json in a shape that index.html expects.

const fs = require("fs/promises");

(async () => {
  try {
    const API_KEY = process.env.FRED_API_KEY;
    if (!API_KEY) {
      throw new Error("Missing env FRED_API_KEY (set repo secret FRED_API_KEY).");
    }

    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      _fetch = (await import("node-fetch")).default;
    }

    const BASE = "https://api.stlouisfed.org/fred/series/observations";

    // Each entry: FRED series_id + canonical cache key used by the UI.
    const SERIES = [
      // Leading (core)
      { fred_id: "T10Y3M",       key: "T10Y3M",            start: "1985-01-01" },
      { fred_id: "ICSA",         key: "INITIAL_CLAIMS",    start: "1985-01-01" },
      { fred_id: "NAPMNOI",      key: "ISM_NEW_ORDERS",    start: "1985-01-01" },
      { fred_id: "UMCSENT",      key: "CONSUMER_SENTIMENT",start: "1985-01-01" },
      { fred_id: "AWHMAN",       key: "AVG_HOURS",         start: "1985-01-01" },
      // Leading (optional, you hadn’t wired it originally)
      { fred_id: "PERMIT",       key: "BUILDING_PERMITS",  start: "1985-01-01", optional: true },

      // Financial
      { fred_id: "BAMLH0A0HYM2", key: "HY_OAS",            start: "1997-01-01" },
      { fred_id: "NFCI",         key: "NFCI",              start: "1985-01-01" },
      { fred_id: "VIXCLS",       key: "VIX",               start: "1990-01-01" },

      // Nowcast / confirmatory
      { fred_id: "SAHMREALTIME", key: "SAHM",              start: "1976-01-01" },
      { fred_id: "INDPRO",       key: "INDPRO",            start: "1985-01-01" }
    ];

    async function fetchSeries({ fred_id, start }) {
      const url = new URL(BASE);
      url.searchParams.set("series_id", fred_id);
      url.searchParams.set("api_key", API_KEY);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("observation_start", start);

      const res = await _fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP_${res.status} ${res.statusText} ${txt.slice(0,160)}`);
      }

      const json = await res.json();
      const obs = (json.observations || [])
        .filter(o => o.value !== ".")
        .map(o => ({
          date: o.date.slice(0,10),
          value: Number(o.value)
        }))
        .filter(d => Number.isFinite(d.value));

      if (!obs.length) throw new Error("NO_OBS");

      const last = obs[obs.length - 1];

      return {
        fred_id,
        last: last.value,
        last_date: last.date,
        history: obs,
        fetchedAt: new Date().toISOString()
      };
    }

    const out = {};
    const failures = [];

    for (const s of SERIES) {
      try {
        console.log(`Fetching ${s.key} (${s.fred_id})`);
        const data = await fetchSeries(s);
        // Store under canonical key (what UI reads)
        out[s.key] = data;
        // Also under raw FRED id as a convenience alias
        out[s.fred_id] = data;
        console.log(`OK ${s.key}: last=${data.last} @ ${data.last_date}`);
      } catch (err) {
        const msg = `FAIL ${s.key} (${s.fred_id}): ${err.message}`;
        if (s.optional) {
          console.warn(msg, " [optional]");
        } else {
          console.error(msg);
          failures.push(msg);
        }
      }
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/fred_cache.json", JSON.stringify(out, null, 2));

    console.log("Wrote data/fred_cache.json with keys:", Object.keys(out).join(", "));

    // Don’t hard-fail if some required series miss; UI will display missing explicitly.
    if (failures.length) {
      console.error("Completed with failures for required series:");
      console.error(failures.join("\n"));
    }

  } catch (err) {
    console.error("FRED refresh failed:", err.stack || err.message);
    process.exit(1);
  }
})();
