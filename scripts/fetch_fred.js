// scripts/fetch_fred.js
// Server-side FRED fetcher for CrashRadar ESI
// Uses FRED_API_KEY (repo secret) and writes data/fred_cache.json
// Shape is aligned with index.html expectations.

const fs = require("fs/promises");

(async () => {
  try {
    console.log("Node:", process.version);

    const API_KEY = process.env.FRED_API_KEY;
    if (!API_KEY) {
      throw new Error("Missing env FRED_API_KEY (set repo secret named FRED_API_KEY).");
    }

    // fetch polyfill for older runners
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      console.log("Global fetch not found; loading node-fetch polyfill…");
      _fetch = (await import("node-fetch")).default;
    }

    const BASE = "https://api.stlouisfed.org/fred/series/observations";

    // SERIES:
    // outKey = key used in fred_cache.json
    // fred_id = FRED series_id
    // start  = observation_start
    // optional = if true, missing won't break; UI will treat as non-critical
    const SERIES = [
      // Leading (core)
      { outKey: "T10Y3M",            fred_id: "T10Y3M",        start: "1985-01-01" }, // yield curve
      { outKey: "INITIAL_CLAIMS",    fred_id: "ICSA",          start: "1985-01-01" },
      { outKey: "ISM_NEW_ORDERS",    fred_id: "NAPMNOI",       start: "1985-01-01" },
      { outKey: "CONSUMER_SENTIMENT",fred_id: "UMCSENT",       start: "1985-01-01" },
      { outKey: "AVG_HOURS",         fred_id: "AWHMAN",        start: "1985-01-01" },
      // Leading (optional)
      { outKey: "BUILDING_PERMITS",  fred_id: "PERMIT",        start: "1985-01-01", optional: true },

      // Financial
      { outKey: "HY_OAS",            fred_id: "BAMLH0A0HYM2",  start: "1997-01-01" },
      { outKey: "NFCI",              fred_id: "NFCI",          start: "1985-01-01" },
      { outKey: "VIX",               fred_id: "VIXCLS",        start: "1990-01-01" },

      // Nowcast / confirmatory
      { outKey: "SAHM",              fred_id: "SAHMREALTIME",  start: "1976-01-01" },
      { outKey: "INDPRO",            fred_id: "INDPRO",        start: "1985-01-01" }
    ];

    async function fetchSeries(s) {
      const url = new URL(BASE);
      url.searchParams.set("series_id", s.fred_id);
      url.searchParams.set("api_key", API_KEY);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("observation_start", s.start);

      const res = await _fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP_${res.status} ${res.statusText} ${txt.slice(0, 160)}`);
      }

      const json = await res.json();
      const obs = (json.observations || [])
        .filter(o => o.value !== ".")
        .map(o => ({
          date: o.date.slice(0, 10),
          value: Number(o.value)
        }))
        .filter(d => Number.isFinite(d.value));

      if (!obs.length) throw new Error("NO_OBS");

      const last = obs[obs.length - 1];

      return {
        fred_id: s.fred_id,
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
        console.log(`Fetching ${s.outKey} (${s.fred_id})`);
        const data = await fetchSeries(s);
        // primary key used by front-end
        out[s.outKey] = data;
        // alias by fred_id as well, in case front-end wants it
        out[s.fred_id] = data;
        console.log(`OK ${s.outKey}: last=${data.last} @ ${data.last_date}`);
      } catch (err) {
        const msg = `FAIL ${s.outKey} (${s.fred_id}): ${err.message}`;
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

    if (failures.length) {
      console.error("Completed with failures (these series will show as missing on the UI):");
      console.error(failures.join("\n"));
      // do NOT exit(1): we want partial cache rather than nothing
    }
  } catch (err) {
    console.error("FRED refresh failed:", err.stack || err.message);
    process.exit(1);
  }
})();
