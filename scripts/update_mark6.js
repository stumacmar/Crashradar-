import fs from "fs";
const OUT_DIR = "./data";
const today = new Date().toISOString().slice(0,10);
const outFile = `${OUT_DIR}/run_${today}.json`;

// quick test file until we wire live FRED
const sample = {
  model_version: "MARK-6 v1.2",
  date: new Date().toISOString(),
  manifest_hash: Math.random().toString(16).slice(2,10),
  levers: [],
  total: 55,
  regime: "amber",
  total_mayhem: { reds: 1, ambers: 2, flag: "none" },
  stale_summary: { count: 0, ids: [] }
};

fs.writeFileSync(outFile, JSON.stringify(sample, null, 2));
console.log("✅ Wrote", outFile);
