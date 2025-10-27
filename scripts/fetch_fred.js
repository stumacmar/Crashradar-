// scripts/fetch_fred.js  (CommonJS, self-diagnosing, fetch polyfill fallback)
const fs = require("fs/promises");

(async () => {
  try {
    // --- diagnostics ---
    console.log("Node:", process.version);
    if (!process.env.FRED_API_KEY) {
      throw new Error("Missing env FRED_API_KEY (set repo secret named FRED_API_KEY).");
    }

    // --- fetch: use built-in if present; otherwise lazy-import node-fetch ---
    let _fetch = global.fetch;
    if (typeof _fetch !== "function") {
      console.log("Global fetch not found; loading node-fetch polyfill…");
      _fetch = (await import("node-fetch")).default;
    }

    const FRED = "https://api.stlouisfed.org/fred";
    const KEY  = process.env.FRED_API_KEY;

    const SERIES = [
      "T10Y3M",        // Yield curve
      "BAMLH0A0HYM2",  // HY OAS (credit)
      "BAA10YM",       // fallback credit proxy
      "UNRATE",        // Unemployment
      "SP500",         // S&P 500
      "NFCI",          // Financial conditions
      "VIXCLS",        // VIX
      "RSAFS",         // Retail sales
      "UMCSENT",       // Consumer sentiment
      "CPIAUCSL"       // CPI (for YoY overlay)
    ];

    async function fetchSeries(id){
      const url = `${FRED}/series/observations?series_id=${id}&api_key=${KEY}&file_type=json&observation_start=1990-01-01`;
      const r = await _fetch(url);
      if (!r.ok) {
        const txt = await r.text().catch(()=> "");
        throw new Error(`${id} HTTP ${r.status} ${r.statusText} ${txt.slice(0,200)}`);
      }
      const j = await r.json();
      const now = new Date().toISOString();
      const observations = (j.observations || [])
        .filter(o => o.value !== ".")
        .map(o => ({ date: o.date.slice(0,10), value: o.value }));
      return { observations, fetchedAt: now };
    }

    function deriveCPIYoY(cpi){
      const o = cpi?.observations || [];
      if (o.length < 13) return null;
      const monthMap = new Map(o.map(x => [x.date.slice(0,7), +x.value]));
      const months = [...monthMap.keys()].sort();
      const out = [];
      for (let i = 12; i < months.length; i++){
        const cur = months[i], prev = months[i-12];
        const y = monthMap.get(cur), p = monthMap.get(prev);
        if (isFinite(y) && isFinite(p) && p !== 0){
          const [yy, mm] = cur.split("-").map(Number);
          const d = new Date(Date.UTC(yy, mm, 0));
          out.push({ date: d.toISOString().slice(0,10), value: ((y/p - 1)*100).toFixed(2) });
        }
      }
      return { observations: out, fetchedAt: cpi.fetchedAt };
    }

    const out = {};
    for (const id of SERIES){
      try {
        console.log("Fetching:", id);
        out[id] = await fetchSeries(id);
      } catch (e) {
        console.error("Fetch failed:", id, "-", e.message);
      }
    }

    // Map convenience keys the dashboard auto-detects
    if (out.BAMLH0A0HYM2) out.CREDIT = out.BAMLH0A0HYM2;
    else if (out.BAA10YM) out.CREDIT = out.BAA10YM;

    if (out.CPIAUCSL){
      const yoy = deriveCPIYoY(out.CPIAUCSL);
      if (yoy) out.CPI_YOY = yoy;
    }

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/fred_cache.json", JSON.stringify(out, null, 2));
    console.log("Wrote data/fred_cache.json with keys:", Object.keys(out).join(", "));

  } catch (err) {
    console.error("FRED refresh failed:", err.stack || err.message);
    process.exit(1);
  }
})();
