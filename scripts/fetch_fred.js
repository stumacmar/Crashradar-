// scripts/fetch_fred.js
// Generates data/fred_cache.json with all required series for CrashRadar
// Compatible with update-fred-cache.yml workflow

const fs = require("fs/promises");

(async () => {
  try {
    const FRED = "https://api.stlouisfed.org/fred";
    const KEY = process.env.FRED_API_KEY;
    if (!KEY) throw new Error("Missing FRED_API_KEY environment variable.");

    let fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      fetchFn = (await import("node-fetch")).default;
    }

    const SERIES = {
      T10Y3M: "Yield curve (10y-3m)",
      BAMLH0A0HYM2: "High yield credit spread",
      UMCSENT: "U. Michigan sentiment",
      NAPMNOI: "ISM new orders",
      M2SL: "M2 money supply (YoY growth)",
      ICSA: "Initial jobless claims",
      SAHMREALTIME: "Sahm rule",
      PERMIT: "Building permits",
      T10Y2Y: "Yield curve (10y-2y)",
      NFCI: "Chicago Fed NFCI"
    };

    async function getSeries(id) {
      const url = `${FRED}/series/observations?series_id=${id}&api_key=${KEY}&file_type=json`;
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`Failed to fetch ${id}: ${res.status}`);
      const data = await res.json();
      return {
        id,
        last_updated: new Date().toISOString(),
        observations: data.observations
          .filter(o => o.value !== "." && o.value !== "")
          .map(o => ({ date: o.date, value: Number(o.value) }))
      };
    }

    console.log("Fetching from FRED...");
    const out = { generated_at: new Date().toISOString(), series: {} };

    for (const id of Object.keys(SERIES)) {
      try {
        const s = await getSeries(id);
        out.series[id] = s;
        console.log(`✅ ${id} OK (${s.observations.length} obs)`);
      } catch (err) {
        console.warn(`⚠️ ${id} failed: ${err.message}`);
      }
    }

    await fs.writeFile("data/fred_cache.json", JSON.stringify(out, null, 2));
    console.log("✅ fred_cache.json updated successfully");

  } catch (e) {
    console.error("❌ Script failed:", e);
    process.exit(1);
  }
})();
