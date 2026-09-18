const DEMO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1920" />
<title>GridWise live benchmark</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0e0b; color: #ecefef; font-family: ui-sans-serif, system-ui, sans-serif; padding: 48px 56px; }
  h1 { font-size: 44px; font-weight: 700; letter-spacing: -0.02em; }
  h1 .accent { color: #34d399; }
  .meta { color: #9aa3a0; font-size: 20px; margin-top: 8px; font-family: ui-monospace, monospace; }
  #run { margin-top: 26px; font-size: 24px; font-weight: 650; background: #34d399; color: #06251b; border: 0; border-radius: 12px; padding: 16px 34px; cursor: pointer; }
  #run:disabled { background: #22352a; color: #5a6a60; cursor: default; }
  .groups { display: flex; gap: 36px; margin-top: 34px; }
  .group { flex: 1; background: #10160f; border: 1px solid #22352a; border-radius: 18px; padding: 26px 28px; min-height: 620px; }
  .group h2 { font-size: 26px; margin-bottom: 4px; }
  .group .sub2 { color: #9aa3a0; font-size: 17px; margin-bottom: 18px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 8px 0; font-family: ui-monospace, monospace; font-size: 19px; opacity: 0; transform: translateY(8px); transition: opacity .25s, transform .25s; }
  .row.on { opacity: 1; transform: translateY(0); }
  .row .idx { width: 34px; color: #5a6a60; }
  .row .st { width: 58px; font-weight: 700; }
  .row .ok { color: #34d399; }
  .row .bad { color: #f87171; }
  .row .ms { width: 110px; text-align: right; }
  .row .bar { height: 14px; border-radius: 7px; background: #34d399; min-width: 3px; }
  .cold .bar { background: #fbbf24; }
  .row .types { color: #9aa3a0; font-size: 16px; margin-left: 8px; }
  .summary { margin-top: 20px; padding-top: 18px; border-top: 1px solid #22352a; font-family: ui-monospace, monospace; font-size: 20px; color: #d7dedb; opacity: 0; transition: opacity .4s; }
  .summary.on { opacity: 1; }
  .summary b { color: #34d399; }
  .cold .summary b { color: #fbbf24; }
</style>
</head>
<body>
  <h1>GridWise <span class="accent">live benchmark</span></h1>
  <div class="meta">POST /optimize-energy · production worker · sequential</div>
  <button id="run">Run 20 requests</button>
  <div class="groups">
    <div class="group" id="g-cached">
      <h2>10× cached</h2>
      <div class="sub2">identical body — interpretation cache hits</div>
      <div class="rows"></div>
      <div class="summary"></div>
    </div>
    <div class="group cold" id="g-cold">
      <h2>10× cold</h2>
      <div class="sub2">unique note per request — full LLM path</div>
      <div class="rows"></div>
      <div class="summary"></div>
    </div>
  </div>
<script>
const DEMAND = [70,65,60,60,62,68,85,110,130,145,155,160,165,160,150,140,135,150,175,190,180,150,110,85];
const SOLAR  = [0,0,0,0,0,0,2,10,25,45,60,75,80,75,60,45,25,10,0,0,0,0,0,0];
const TARIFF = [5,5,4,4,4,5,6,8,10,12,13,14,14,13,12,11,10,12,16,18,16,12,8,6];
const HOURS = DEMAND.map((d, h) => ({ hour: h, demand_kwh: d, solar_kwh: SOLAR[h], tariff_bdt_per_kwh: TARIFF[h] }));
const BATTERY = { capacity_kwh: 200, initial_energy_kwh: 100, minimum_energy_kwh: 20, max_charge_kwh_per_hour: 50, max_discharge_kwh_per_hour: 50 };
const COLD_NOTES = [
  "Do not charge the battery from 2 PM until 5 PM.",
  "PV output will drop to roughly 30% between 11 AM and 1 PM.",
  "Keep at least 40% of battery capacity in reserve from 7 PM until 10 PM.",
  "Battery discharging is disabled from 5 PM until 8 PM.",
  "Grid import must not exceed 150 kWh from 6 PM until 8 PM.",
  "Panel cleaning leaves about half of normal solar from 10 AM until noon.",
  "The charger is offline for maintenance between 3 AM and 6 AM.",
  "Hold a minimum of 80 kWh in the battery from 8 PM until 11 PM.",
  "Campus grid intake should stay at or below 120 kWh between noon and 3 PM.",
  "Inverter work will cut rooftop solar to about 35% from 9 AM until 11 AM."
];
const RUN_ID = Date.now().toString(36);

function bodyFor(note) {
  return { scenario_id: "BENCH-" + RUN_ID, operator_notes: [note], hours: HOURS, battery: BATTERY };
}

async function fire(note) {
  const t0 = performance.now();
  try {
    const res = await fetch("/optimize-energy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyFor(note)) });
    const ms = performance.now() - t0;
    if (res.status !== 200) return { status: res.status, ms, types: [] };
    const json = await res.json();
    return { status: 200, ms, types: json.directive_interpretation.map(d => d.directive_type) };
  } catch {
    return { status: 0, ms: performance.now() - t0, types: [] };
  }
}

function addRow(group, i, r, maxMs) {
  const rows = group.querySelector(".rows");
  const el = document.createElement("div");
  el.className = "row";
  const w = Math.max(3, Math.round((r.ms / maxMs) * 420));
  el.innerHTML = '<span class="idx">' + String(i).padStart(2, "0") + '</span>'
    + '<span class="st ' + (r.status === 200 ? "ok" : "bad") + '">' + (r.status === 200 ? "200" : String(r.status || "ERR")) + '</span>'
    + '<span class="ms">' + Math.round(r.ms) + ' ms</span>'
    + '<span class="bar" style="width:' + w + 'px"></span>'
    + '<span class="types">' + r.types.join(", ") + '</span>';
  rows.appendChild(el);
  requestAnimationFrame(() => el.classList.add("on"));
}

function stats(list) {
  const a = list.map(r => r.ms).sort((x, y) => x - y);
  const p50 = a[Math.floor(a.length / 2)];
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  return { min: a[0], p50, mean, max: a[a.length - 1], ok: list.filter(r => r.status === 200).length };
}

async function runGroup(group, notes) {
  const results = [];
  for (let i = 0; i < notes.length; i++) {
    const r = await fire(notes[i]);
    results.push(r);
    addRow(group, i + 1, r, 3000);
  }
  const s = stats(results);
  const el = group.querySelector(".summary");
  el.innerHTML = s.ok + "/" + notes.length + " OK · min <b>" + Math.round(s.min) + "</b> · p50 <b>" + Math.round(s.p50) + "</b> · mean <b>" + Math.round(s.mean) + "</b> · max <b>" + Math.round(s.max) + "</b> ms";
  el.classList.add("on");
}

document.getElementById("run").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  ev.target.textContent = "Running…";
  const cached = document.getElementById("g-cached");
  const cold = document.getElementById("g-cold");
  await runGroup(cached, Array(10).fill("Do not charge the battery between 1 PM and 4 PM."));
  await runGroup(cold, COLD_NOTES.map(n => n + " [run " + RUN_ID + "]"));
  ev.target.textContent = "Done — 20/20 complete";
});
</script>
</body>
</html>`;

export function demoHtml(): string {
  return DEMO_PAGE;
}
