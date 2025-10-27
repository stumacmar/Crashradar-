// scripts/fetch_fred.js (Node 20+)
import fs from "fs/promises";

const FRED = "https://api.stlouisfed.org/fred";
const KEY  = process.env.FRED_API_KEY;

// Series your dashboard expects (plus fallbacks & CPI for YoY overlay)
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
  "CPIAUCSL"       // CPI (for optional Inflation Drift overlay)
];

async function fetchSeries(id){
  const url = `${FRED}/series/observations?series_id=${id}&api_key=${KEY}&file_type=json&observation_start=1990-01-01`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`${id} HTTP ${r.status}`);
  const j = await r.json();
  const now = new Date().toISOString();
  const observations = (j.observations||[])
    .filter(o => o.value !== ".")
    .map(o => ({ date:o.date.slice(0,10), value:o.value }));
  return { observations, fetchedAt: now };
}

function deriveCPIYoY(cpi){
  const o = cpi?.observations || [];
  if (o.length < 13) return null;
  const m = new Map(o.map(x => [x.date.slice(0,7), +x.value]));
  const months = [...m.keys()].sort();
  const out = [];
  for (let i = 12; i < months.length; i++){
    const cur = months[i], prev = months[i-12];
    const y = m.get(cur), p = m.get(prev);
    if (isFinite(y) && isFinite(p) && p !== 0){
      const [yy,mm] = cur.split("-").map(Number);
      const d = new Date(Date.UTC(yy, mm, 0));
      out.push({ date:d.toISOString().slice(0,10), value: ((y/p - 1)*100).toFixed(2) });
    }
  }
  return { observations: out, fetchedAt: cpi.fetchedAt };
}

(async ()=>{
  const out = {};
  for (const id of SERIES){
    try { out[id] = await fetchSeries(id); }
    catch (e) { console.error("Fetch failed:", id, e.message); }
  }

  // Map convenience keys used by index.html
  if (out.BAMLH0A0HYM2) out.CREDIT = out.BAMLH0A0HYM2;
  else if (out.BAA10YM) out.CREDIT = out.BAA10YM;

  if (out.CPIAUCSL){
    const yoy = deriveCPIYoY(out.CPIAUCSL);
    if (yoy) out.CPI_YOY = yoy;
  }

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/fred_cache.json", JSON.stringify(out, null, 2));
  console.log("Wrote data/fred_cache.json with:", Object.keys(out).join(", "));
})();
