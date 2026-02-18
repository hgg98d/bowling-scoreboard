/* TSSAA Bowling Personal Scoreboard
   Pins-only entry, computes points per 2025-26 TSSAA Bowling Regulations:
   - Two American games (8 points each): 6 head-to-head + 2 team pinfall
   - Two Baker games (3 points each)
   - 2 points for combined Baker pinfall
   - 3 points for overall total pinfall
   - Half points for ties
   - Match tiebreaks if points tie: (1) total pinfall, (2) points after American G1, (3) pinfall after American G1
*/

const POS = ["1A","2A","3A","1B","2B","3B"];

const els = {
  els.themeToggle = document.getElementById("themeToggle");
  const THEME_KEY = "tssaa_theme";

  homeName: document.getElementById("homeName"),
  visitorName: document.getElementById("visitorName"),
  matchDate: document.getElementById("matchDate"),
  entry: document.getElementById("entry"),

  scoreLine: document.getElementById("scoreLine"),
  leadLine: document.getElementById("leadLine"),
  pinLine: document.getElementById("pinLine"),
  statusChip: document.getElementById("statusChip"),
  breakdown: document.getElementById("breakdown"),

  saveBtn: document.getElementById("saveBtn"),
  clearBtn: document.getElementById("clearBtn"),

  history: document.getElementById("history"),
  exportBtn: document.getElementById("exportBtn"),
  wipeBtn: document.getElementById("wipeBtn"),
};

const STORAGE_KEY = "tssaa_bowling_history_v1";
const CURRENT_KEY = "tssaa_bowling_current_v1";

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function numOrNull(v){
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampPins(n){
  if (n === null) return null;
  return Math.max(0, Math.min(400, Math.round(n)));
}

function getEmptyMatch(){
  return {
    id: null,
    date: todayISO(),
    homeName: "Home",
    visitorName: "Visitor",
    american1: { home: Array(6).fill(null), visitor: Array(6).fill(null) },
    american2: { home: Array(6).fill(null), visitor: Array(6).fill(null) },
    baker1: { homeTotal: null, visitorTotal: null },
    baker2: { homeTotal: null, visitorTotal: null },
  };
}

function saveCurrent(){
  localStorage.setItem(CURRENT_KEY, JSON.stringify(match));
}
function loadCurrent(){
  try{
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

let match = loadCurrent() ?? getEmptyMatch();

function clearCurrent(){
  match = getEmptyMatch();
  saveCurrent();
  // Mark entry as NOT built so it rebuilds fresh (important!)
  delete els.entry.dataset.built;
  renderAll();
}

function loadHistory(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function saveHistory(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}
function addToHistory(snapshot){
  const hist = loadHistory();
  hist.unshift(snapshot);
  saveHistory(hist.slice(0, 200));
}

// ---------- DISPLAY NAME HELPERS (FIXES TEAM NAME EDITING) ----------
function displayHomeName(){
  const s = (match.homeName ?? "").trim();
  return s ? s : "Home";
}
function displayVisitorName(){
  const s = (match.visitorName ?? "").trim();
  return s ? s : "Visitor";
}

// Update labels without rebuilding inputs (prevents keyboard from closing)
function updateEntryLabelsOnly(){
  // If entry hasn't been built yet, do nothing
  if (!els.entry.dataset.built) return;

  // Update each American grid header inside entry
  const grids = els.entry.querySelectorAll(".posGrid");
  grids.forEach(grid => {
    const hdrs = grid.querySelectorAll(".hdr");
    if (hdrs.length >= 3){
      hdrs[1].textContent = displayHomeName();
      hdrs[2].textContent = displayVisitorName();
    }
  });

  // Update Baker labels inside entry
  const bakerCards = Array.from(els.entry.querySelectorAll(".card"))
    .filter(c => c.textContent.includes("Baker Game"));
  bakerCards.forEach(card => {
    const labels = card.querySelectorAll("label");
    if (labels.length >= 2){
      labels[0].textContent = `${displayHomeName()} Total Pins`;
      labels[1].textContent = `${displayVisitorName()} Total Pins`;
    }
  });
}

// ---------- SCORING ----------
function pointsWinTie(homePins, visitorPins, winPts, tiePtsEach){
  if (homePins === null || visitorPins === null) return {home:0, visitor:0, decided:false};
  if (homePins > visitorPins) return {home:winPts, visitor:0, decided:true};
  if (homePins < visitorPins) return {home:0, visitor:winPts, decided:true};
  return {home:tiePtsEach, visitor:tiePtsEach, decided:true};
}

function computeAmerican(game){
  const homeArr = game.home;
  const visArr  = game.visitor;

  let homePins = 0, visPins = 0;

  let indHomePts = 0, indVisPts = 0;
  const posLines = [];

  for (let i=0;i<6;i++){
    const hp = homeArr[i];
    const vp = visArr[i];
    const p = pointsWinTie(hp, vp, 1.0, 0.5);
    indHomePts += p.home;
    indVisPts  += p.visitor;

    if (hp !== null) homePins += hp;
    if (vp !== null) visPins  += vp;

    posLines.push({pos: POS[i], homePins: hp, visitorPins: vp, homePts: p.home, visitorPts: p.visitor});
  }

  const teamP = pointsWinTie(
    homeArr.every(x=>x!==null) ? homePins : null,
    visArr.every(x=>x!==null) ? visPins  : null,
    2.0,
    1.0
  );

  return {
    posLines,
    pinfall: {home: homePins, visitor: visPins, complete: homeArr.every(x=>x!==null) && visArr.every(x=>x!==null)},
    points: {
      individual: {home: indHomePts, visitor: indVisPts},
      teamPinfall: {home: teamP.home, visitor: teamP.visitor},
      total: {home: indHomePts + teamP.home, visitor: indVisPts + teamP.visitor}
    }
  };
}

function computeBaker(b1, b2){
  const b1Pts = pointsWinTie(b1.homeTotal, b1.visitorTotal, 3.0, 1.5);
  const b2Pts = pointsWinTie(b2.homeTotal, b2.visitorTotal, 3.0, 1.5);

  const b1HomePins = b1.homeTotal ?? 0;
  const b1VisPins  = b1.visitorTotal ?? 0;
  const b2HomePins = b2.homeTotal ?? 0;
  const b2VisPins  = b2.visitorTotal ?? 0;

  const bakerPinsHome = b1HomePins + b2HomePins;
  const bakerPinsVis  = b1VisPins + b2VisPins;

  const bakerBonus = pointsWinTie(
    (b1.homeTotal !== null && b2.homeTotal !== null) ? bakerPinsHome : null,
    (b1.visitorTotal !== null && b2.visitorTotal !== null) ? bakerPinsVis : null,
    2.0,
    1.0
  );

  return {
    games: [
      {name:"Baker Game 1", pins:{home:b1.homeTotal, visitor:b1.visitorTotal}, pts:b1Pts},
      {name:"Baker Game 2", pins:{home:b2.homeTotal, visitor:b2.visitorTotal}, pts:b2Pts},
    ],
    combinedPins: {
      home: bakerPinsHome,
      visitor: bakerPinsVis,
      complete: (b1.homeTotal!==null && b1.visitorTotal!==null && b2.homeTotal!==null && b2.visitorTotal!==null)
    },
    bonusPts: bakerBonus
  };
}

function computeOverall(amer1, amer2, baker){
  const totalPinsHome = amer1.pinfall.home + amer2.pinfall.home + baker.combinedPins.home;
  const totalPinsVis  = amer1.pinfall.visitor + amer2.pinfall.visitor + baker.combinedPins.visitor;

  const completeOverall =
    amer1.pinfall.complete && amer2.pinfall.complete && baker.combinedPins.complete;

  const overallBonus = pointsWinTie(
    completeOverall ? totalPinsHome : null,
    completeOverall ? totalPinsVis  : null,
    3.0,
    1.5
  );

  return { totalPins:{home:totalPinsHome, visitor:totalPinsVis, complete: completeOverall}, bonusPts: overallBonus };
}

function determineWinner({points, totalPins, amer1Pts, amer1Pins}){
  if (points.home > points.visitor) return {leader:"home", method:"Points"};
  if (points.home < points.visitor) return {leader:"visitor", method:"Points"};

  if (totalPins.complete){
    if (totalPins.home > totalPins.visitor) return {leader:"home", method:"Tiebreak: Total Pinfall"};
    if (totalPins.home < totalPins.visitor) return {leader:"visitor", method:"Tiebreak: Total Pinfall"};
  } else {
    return {leader:"tie", method:"Points tied (need more pins entered)"};
  }

  if (amer1Pins.complete){
    if (amer1Pts.home > amer1Pts.visitor) return {leader:"home", method:"Tiebreak: After American Game 1 (Points)"};
    if (amer1Pts.home < amer1Pts.visitor) return {leader:"visitor", method:"Tiebreak: After American Game 1 (Points)"};

    if (amer1Pins.home > amer1Pins.visitor) return {leader:"home", method:"Tiebreak: After American Game 1 (Pinfall)"};
    if (amer1Pins.home < amer1Pins.visitor) return {leader:"visitor", method:"Tiebreak: After American Game 1 (Pinfall)"};
  }

  return {leader:"tie", method:"Still tied"};
}

function computeAll(){
  const amer1 = computeAmerican(match.american1);
  const amer2 = computeAmerican(match.american2);
  const baker = computeBaker(match.baker1, match.baker2);
  const overall = computeOverall(amer1, amer2, baker);

  const pointsHome =
    amer1.points.total.home + amer2.points.total.home +
    baker.games[0].pts.home + baker.games[1].pts.home +
    baker.bonusPts.home + overall.bonusPts.home;

  const pointsVis =
    amer1.points.total.visitor + amer2.points.total.visitor +
    baker.games[0].pts.visitor + baker.games[1].pts.visitor +
    baker.bonusPts.visitor + overall.bonusPts.visitor;

  const status = determineWinner({
    points: {home: pointsHome, visitor: pointsVis},
    totalPins: overall.totalPins,
    amer1Pts: amer1.points.total,
    amer1Pins: amer1.pinfall,
  });

  return { amer1, amer2, baker, overall, totals: {points:{home:pointsHome, visitor:pointsVis}}, status };
}

// ---------- UI RENDER ----------
function fmt1(n){
  return (Math.round(n*10)/10).toFixed(1);
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function makeNumberInput(value, onChange){
  const inp = document.createElement("input");
  inp.type = "number";
  inp.inputMode = "numeric";
  inp.min = "0";
  inp.max = "400";
  inp.placeholder = "—";
  inp.value = (value === null ? "" : String(value));
  inp.addEventListener("input", () => {
    const n = clampPins(numOrNull(inp.value));
    onChange(n);
  });
  return inp;
}

function renderAmericanSection(title, key){
  const card = document.createElement("div");
  card.className = "card";

  const h = document.createElement("div");
  h.className = "sectionTitle";
  h.innerHTML = `<h2>${title}</h2><span class="note">Enter pins</span>`;
  card.appendChild(h);

  const grid = document.createElement("div");
  grid.className = "posGrid";
  grid.innerHTML = `
    <div class="hdr">Pos</div>
    <div class="hdr">${escapeHtml(displayHomeName())}</div>
    <div class="hdr">${escapeHtml(displayVisitorName())}</div>
  `;

  POS.forEach((p, i) => {
    const pos = document.createElement("div");
    pos.className = "pos mono";
    pos.textContent = p;

    const homeInp = makeNumberInput(match[key].home[i], (n) => {
      match[key].home[i] = n;
      saveCurrent();
      renderSummary(); // IMPORTANT: do not rebuild entry
    });
    const visInp = makeNumberInput(match[key].visitor[i], (n) => {
      match[key].visitor[i] = n;
      saveCurrent();
      renderSummary(); // IMPORTANT: do not rebuild entry
    });

    grid.appendChild(pos);
    grid.appendChild(homeInp);
    grid.appendChild(visInp);
  });

  card.appendChild(grid);
  return card;
}

function renderBakerSection(title, key){
  const card = document.createElement("div");
  card.className = "card";

  const h = document.createElement("div");
  h.className = "sectionTitle";
  h.innerHTML = `<h2>${title}</h2><span class="note">Enter team total at end of game</span>`;
  card.appendChild(h);

  const row = document.createElement("div");
  row.className = "row";
  row.style.marginTop = "10px";

  const f1 = document.createElement("div");
  f1.className = "field";
  f1.innerHTML = `<label>${escapeHtml(displayHomeName())} Total Pins</label>`;
  const i1 = makeNumberInput(match[key].homeTotal, (n) => {
    match[key].homeTotal = n;
    saveCurrent();
    renderSummary(); // IMPORTANT: do not rebuild entry
  });
  f1.appendChild(i1);

  const f2 = document.createElement("div");
  f2.className = "field";
  f2.innerHTML = `<label>${escapeHtml(displayVisitorName())} Total Pins</label>`;
  const i2 = makeNumberInput(match[key].visitorTotal, (n) => {
    match[key].visitorTotal = n;
    saveCurrent();
    renderSummary(); // IMPORTANT: do not rebuild entry
  });
  f2.appendChild(i2);

  row.appendChild(f1); row.appendChild(f2);
  card.appendChild(row);
  return card;
}

function renderEntry(){
  const wrap = document.createElement("div");
  wrap.appendChild(renderAmericanSection("American 10-Pin Game 1", "american1"));
  wrap.appendChild(renderAmericanSection("American 10-Pin Game 2", "american2"));
  wrap.appendChild(renderBakerSection("Baker Game 1 Totals", "baker1"));
  wrap.appendChild(renderBakerSection("Baker Game 2 Totals", "baker2"));

  els.entry.innerHTML = "";
  els.entry.appendChild(wrap);
}

function renderBreakdownHTML(c){
  const rows = [];
  rows.push(`<table>
    <thead><tr><th>Section</th><th>${escapeHtml(displayHomeName())}</th><th>${escapeHtml(displayVisitorName())}</th></tr></thead>
    <tbody>
      <tr><td><b>American Game 1 (max 8)</b></td><td class="mono">${fmt1(c.amer1.points.total.home)}</td><td class="mono">${fmt1(c.amer1.points.total.visitor)}</td></tr>
      <tr><td class="note">• Individual (6)</td><td class="mono">${fmt1(c.amer1.points.individual.home)}</td><td class="mono">${fmt1(c.amer1.points.individual.visitor)}</td></tr>
      <tr><td class="note">• Team Pinfall (2)</td><td class="mono">${fmt1(c.amer1.points.teamPinfall.home)}</td><td class="mono">${fmt1(c.amer1.points.teamPinfall.visitor)}</td></tr>

      <tr><td><b>American Game 2 (max 8)</b></td><td class="mono">${fmt1(c.amer2.points.total.home)}</td><td class="mono">${fmt1(c.amer2.points.total.visitor)}</td></tr>
      <tr><td class="note">• Individual (6)</td><td class="mono">${fmt1(c.amer2.points.individual.home)}</td><td class="mono">${fmt1(c.amer2.points.individual.visitor)}</td></tr>
      <tr><td class="note">• Team Pinfall (2)</td><td class="mono">${fmt1(c.amer2.points.teamPinfall.home)}</td><td class="mono">${fmt1(c.amer2.points.teamPinfall.visitor)}</td></tr>

      <tr><td><b>Baker Game 1 (max 3)</b></td><td class="mono">${fmt1(c.baker.games[0].pts.home)}</td><td class="mono">${fmt1(c.baker.games[0].pts.visitor)}</td></tr>
      <tr><td class="note">• Pins</td><td class="mono">${c.baker.games[0].pins.home ?? "—"}</td><td class="mono">${c.baker.games[0].pins.visitor ?? "—"}</td></tr>

      <tr><td><b>Baker Game 2 (max 3)</b></td><td class="mono">${fmt1(c.baker.games[1].pts.home)}</td><td class="mono">${fmt1(c.baker.games[1].pts.visitor)}</td></tr>
      <tr><td class="note">• Pins</td><td class="mono">${c.baker.games[1].pins.home ?? "—"}</td><td class="mono">${c.baker.games[1].pins.visitor ?? "—"}</td></tr>

      <tr><td><b>Baker Combined Bonus (max 2)</b></td><td class="mono">${fmt1(c.baker.bonusPts.home)}</td><td class="mono">${fmt1(c.baker.bonusPts.visitor)}</td></tr>

      <tr><td><b>Overall Total Pinfall Bonus (max 3)</b></td><td class="mono">${fmt1(c.overall.bonusPts.home)}</td><td class="mono">${fmt1(c.overall.bonusPts.visitor)}</td></tr>

      <tr><td><b>TOTAL POINTS (max 27)</b></td><td class="mono"><b>${fmt1(c.totals.points.home)}</b></td><td class="mono"><b>${fmt1(c.totals.points.visitor)}</b></td></tr>
      <tr><td class="note">TOTAL PINS</td><td class="mono">${c.overall.totalPins.home}</td><td class="mono">${c.overall.totalPins.visitor}</td></tr>
    </tbody>
  </table>`);

  return rows.join("\n");
}

function renderSummary(){
  const c = computeAll();

  els.scoreLine.textContent = `${fmt1(c.totals.points.home)} – ${fmt1(c.totals.points.visitor)}`;
  els.pinLine.textContent = `Pins: ${c.overall.totalPins.home} – ${c.overall.totalPins.visitor}`;

  if (c.status.leader === "home"){
    els.leadLine.textContent = `${displayHomeName()} leads (${c.status.method}).`;
    els.statusChip.textContent = c.status.method;
    els.statusChip.className = "chip mono good";
  } else if (c.status.leader === "visitor"){
    els.leadLine.textContent = `${displayVisitorName()} leads (${c.status.method}).`;
    els.statusChip.textContent = c.status.method;
    els.statusChip.className = "chip mono good";
  } else {
    els.leadLine.textContent = `Tied (${c.status.method}).`;
    els.statusChip.textContent = c.status.method;
    els.statusChip.className = "chip mono warn";
  }

  els.breakdown.innerHTML = renderBreakdownHTML(c);
}

function renderHistory(){
  const hist = loadHistory();
  els.history.innerHTML = "";

  if (hist.length === 0){
    els.history.innerHTML = `<p class="note">No saved matches yet.</p>`;
    return;
  }

  hist.slice(0, 25).forEach((m, idx) => {
    const div = document.createElement("div");
    div.className = "historyItem";

    const top = document.createElement("div");
    top.className = "historyTop";

    const name = document.createElement("div");
    name.className = "historyName";
    name.textContent = `${m.homeName} vs ${m.visitorName}`;

    const meta = document.createElement("div");
    meta.className = "mono";
    meta.textContent = `${m.date} • ${fmt1(m.points.home)}–${fmt1(m.points.visitor)} • Pins ${m.pins.home}–${m.pins.visitor}`;

    const btnRow = document.createElement("div");
    btnRow.className = "row";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.addEventListener("click", () => {
      match = m.raw;
      saveCurrent();
      delete els.entry.dataset.built; // force rebuild for loaded match
      renderAll();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      const all = loadHistory();
      all.splice(idx, 1);
      saveHistory(all);
      renderHistory();
    });

    btnRow.appendChild(loadBtn);
    btnRow.appendChild(delBtn);

    top.appendChild(name);
    top.appendChild(meta);
    div.appendChild(top);
    div.appendChild(btnRow);
    els.history.appendChild(div);
  });
}

function snapshotForHistory(){
  const c = computeAll();
  return {
    id: `${Date.now()}`,
    date: match.date,
    homeName: displayHomeName(),
    visitorName: displayVisitorName(),
    points: {home: c.totals.points.home, visitor: c.totals.points.visitor},
    pins: {home: c.overall.totalPins.home, visitor: c.overall.totalPins.visitor},
    leader: c.status.leader,
    method: c.status.method,
    raw: structuredClone(match)
  };
}

function renderAll(){
  // Setup fields without forcing "Home" while typing
  els.matchDate.value = match.date || todayISO();
  els.homeName.value = match.homeName ?? "Home";
  els.visitorName.value = match.visitorName ?? "Visitor";

  // Build entry ONCE so keyboard stays open while typing
  if (!els.entry.dataset.built){
    renderEntry();
    els.entry.dataset.built = "1";
  } else {
    updateEntryLabelsOnly();
  }

  renderSummary();
  renderHistory();
}

// ---------- EVENTS ----------
els.matchDate.addEventListener("change", () => {
  match.date = els.matchDate.value || todayISO();
  saveCurrent();
  renderSummary();
});

els.homeName.addEventListener("input", () => {
  match.homeName = els.homeName.value; // allow blank while editing
  saveCurrent();
  updateEntryLabelsOnly();
  renderSummary();
});
els.homeName.addEventListener("blur", () => {
  if (!els.homeName.value.trim()){
    els.homeName.value = "Home";
    match.homeName = "Home";
    saveCurrent();
    updateEntryLabelsOnly();
    renderSummary();
  }
});

els.visitorName.addEventListener("input", () => {
  match.visitorName = els.visitorName.value;
  saveCurrent();
  updateEntryLabelsOnly();
  renderSummary();
});
els.visitorName.addEventListener("blur", () => {
  if (!els.visitorName.value.trim()){
    els.visitorName.value = "Visitor";
    match.visitorName = "Visitor";
    saveCurrent();
    updateEntryLabelsOnly();
    renderSummary();
  }
});

els.saveBtn.addEventListener("click", () => {
  addToHistory(snapshotForHistory());
  renderHistory();
});

els.clearBtn.addEventListener("click", () => {
  if (confirm("Clear the current match entry? (History will remain)")){
    clearCurrent();
  }
});

els.exportBtn.addEventListener("click", () => {
  const hist = loadHistory();
  const blob = new Blob([JSON.stringify(hist, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bowling-history.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

els.wipeBtn.addEventListener("click", () => {
  if (confirm("Wipe ALL saved history on this device? This cannot be undone.")){
    saveHistory([]);
    renderHistory();
  }
});
function applyTheme(theme){
  if (theme === "light"){
    document.body.classList.add("light");
    els.themeToggle.textContent = "Dark Mode";
  } else {
    document.body.classList.remove("light");
    els.themeToggle.textContent = "Light Mode";
  }
  localStorage.setItem(THEME_KEY, theme);
}

els.themeToggle.addEventListener("click", () => {
  const current = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

// INIT
if (!match.date) match.date = todayISO();

const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(savedTheme);

renderAll();
