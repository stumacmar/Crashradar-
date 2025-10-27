// scripts/fetch_fred.js  (CommonJS; works on GitHub Actions without package.json)
const fs = require("fs/promises");

const FRED = "https://api.stlouisfed.org/fred";
const KEY  = process.env.FRED_API_KEY;

// Series your dashboard expects (plus fallback & CPI for YoY overlay)
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
  "CPIAUCSL"       // CPI (optional overlay)
];

async function fetchSeries(id){
  const url = `${FRED}/series/observations?series_id=${id}&api_key=${KEY}&file_type=json&observation_start=1990-01-01`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`${id} HTTP ${r.status}`);
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
  const monthMap = new Map
