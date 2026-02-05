/***********************
 * StudyMate v3 updates:
 * - Target history by date (changes apply from that day only)
 * - Home stats: Yesterday/Today/Streak; centered, bigger streak, no extra text
 * - Topics & Modes masters: add + deactivate (no delete); used in dropdowns
 * - Setup: Topic is dropdown; Mode dropdown from masters
 * - Analytics:
 *   1) Daily chart = double bar (Target vs Actual)
 *   2) X axis labels = "DD Mon"
 *   3) Topic filter applies to all 3 charts
 ***********************/

const $ = (id) => document.getElementById(id);

const VIEWS = {
  home: $("homeView"),
  setup: $("setupView"),
  run: $("runView"),
  analytics: $("analyticsView"),
  target: $("targetView")
};

function showView(name) {
  Object.values(VIEWS).forEach(v => v.classList.add("hidden"));
  VIEWS[name].classList.remove("hidden");
}

/* ---------- Keys ---------- */
const STORAGE_KEY = "studymate_sessions_v3";
const TARGET_HISTORY_KEY = "studymate_target_history_v1";
const TOPICS_KEY = "studymate_topics_master_v1";
const MODES_KEY = "studymate_modes_master_v1";

/* ---------- Utils ---------- */
function clampInt(n, min, max) {
  n = Number.parseInt(n, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, max != null ? Math.min(max, n) : n);
}

function hhmm(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function mmss(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function secondsToHM(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function nowISO() { return new Date().toISOString(); }

function isoToLocalDateKey(iso) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateObj, n) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + n);
  return d;
}

function prettyDateTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normKey(s) {
  return String(s || "").trim().toLowerCase();
}

function formatDDMon(dateObj) {
  const d = new Date(dateObj);
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString(undefined, { month: "short" });
  return `${dd} ${mon}`;
}

/* ---------- Logs ---------- */
function loadLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveLogs(logs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}
function addLog(entry) {
  const logs = loadLogs();
  logs.unshift(entry);
  saveLogs(logs);
}

/* ---------- Masters: seed + CRUD ---------- */
function seedIfMissing() {
// Topics (start empty)
if (!localStorage.getItem(TOPICS_KEY)) {
  localStorage.setItem(TOPICS_KEY, JSON.stringify([]));
}

// Modes (start empty)
if (!localStorage.getItem(MODES_KEY)) {
  localStorage.setItem(MODES_KEY, JSON.stringify([]));
}
  // Target history
  if (!localStorage.getItem(TARGET_HISTORY_KEY)) {
    localStorage.setItem(TARGET_HISTORY_KEY, JSON.stringify([]));
  }
}

function loadMaster(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveMaster(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

function getActiveTopics() {
  return loadMaster(TOPICS_KEY).filter(t => t.active);
}
function getActiveModes() {
  return loadMaster(MODES_KEY).filter(m => m.active);
}

function addMasterItem(key, name) {
  name = String(name || "").trim();
  if (!name) return { ok:false, msg:"Name cannot be empty." };

  const items = loadMaster(key);
  if (items.some(x => normKey(x.name) === normKey(name))) {
    return { ok:false, msg:"Already exists." };
  }
  items.push({
    id: crypto?.randomUUID?.() || String(Date.now()) + "-x",
    name,
    active: true,
    createdAtISO: nowISO()
  });
  saveMaster(key, items);
  return { ok:true };
}

function toggleMasterActive(key, id) {
  const items = loadMaster(key);
  const idx = items.findIndex(x => x.id === id);
  if (idx < 0) return;
  items[idx].active = !items[idx].active;
  saveMaster(key, items);
}

/* ---------- Target history (date-effective) ---------- */
function loadTargetHistory() {
  try {
    const raw = localStorage.getItem(TARGET_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTargetHistory(arr) {
  localStorage.setItem(TARGET_HISTORY_KEY, JSON.stringify(arr));
}

// Add entry for TODAY (effective today)
function setTargetEffectiveToday(seconds) {
  const todayKey = isoToLocalDateKey(nowISO());
  let hist = loadTargetHistory();

  // If already has entry for today, overwrite
  const existingIdx = hist.findIndex(x => x.dateKey === todayKey);
  const entry = { dateKey: todayKey, targetSeconds: seconds, savedAtISO: nowISO() };

  if (existingIdx >= 0) hist[existingIdx] = entry;
  else hist.push(entry);

  // Keep sorted ascending
  hist.sort((a,b) => a.dateKey.localeCompare(b.dateKey));
  saveTargetHistory(hist);
}

function clearTargetHistory() {
  saveTargetHistory([]);
}

function getTargetForDate(dateKey) {
  // Find latest entry with dateKey <= given dateKey
  const hist = loadTargetHistory().slice().sort((a,b) => a.dateKey.localeCompare(b.dateKey));
  let found = null;
  for (const h of hist) {
    if (h.dateKey <= dateKey) found = h;
    else break;
  }
  return found ? found.targetSeconds : null;
}

function renderTargetHistoryTable() {
  const tbody = $("targetHistoryTbody");
  const hist = loadTargetHistory().slice().sort((a,b) => b.dateKey.localeCompare(a.dateKey)); // newest first
  tbody.innerHTML = hist.length ? "" : `<tr><td colspan="2" class="mutedSmall">No target history yet.</td></tr>`;

  for (const h of hist) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHTML(h.dateKey)}</td><td>${escapeHTML(secondsToHM(h.targetSeconds))}</td>`;
    tbody.appendChild(tr);
  }
}

/* ---------- Dropdown binding (Setup) ---------- */
function fillSelectWithMasters(selectEl, activeItems, placeholder) {
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.disabled = true;
  ph.selected = true;
  ph.textContent = placeholder;
  selectEl.appendChild(ph);

  activeItems
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.name; // store by name for simplicity
      opt.textContent = item.name;
      selectEl.appendChild(opt);
    });
}

function updateMasterSetupHintAndStartState() {
  const topics = getActiveTopics();
  const modes = getActiveModes();

  const hintEl = $("masterSetupHint");
  const startBtn = $("startSessionBtn");

  if (topics.length === 0 || modes.length === 0) {
    hintEl.textContent =
      "To start studying, please add at least one Topic and one Study mode in Set Target and Topics → Set topic and mode.";
    startBtn.disabled = true;
  } else {
    hintEl.textContent = "";
    startBtn.disabled = false;
  }
}

function refreshSetupDropdowns() {
  fillSelectWithMasters($("topic"), getActiveTopics(), "Select topic…");
  fillSelectWithMasters($("method"), getActiveModes(), "Select mode…");
  updateMasterSetupHintAndStartState(); 
}

/* ---------- Alarm (kept “proper” two-tone beeps) ---------- */
let audioCtx = null;
function ensureAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
async function unlockAudioIfNeeded() {
  try {
    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    $("audioHint").textContent = "";
  } catch {
    $("audioHint").textContent = "Audio may be blocked. Click Start/Resume again.";
  }
}
function alarm(durationSec = 2.0) {
  const ctx = ensureAudioContext();
  const t0 = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
  master.gain.linearRampToValueAtTime(0.0001, t0 + durationSec);
  master.connect(ctx.destination);

  const beepDur = 0.17;
  const gap = 0.07;
  const cycle = beepDur + gap;
  const count = Math.floor(durationSec / cycle);

  for (let i = 0; i < count; i++) {
    const start = t0 + i * cycle;
    const freq = (i % 2 === 0) ? 880 : 660;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);

    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.95, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + beepDur);

    osc.connect(g);
    g.connect(master);

    osc.start(start);
    osc.stop(start + beepDur);
  }
}

/* ---------- Timer ---------- */
const PHASE = { IDLE: "IDLE", STUDY: "STUDY", BREAK: "BREAK", DONE: "DONE" };

let timer = {};
let tickHandle = null;

function resetTimerState() {
  timer = {
    phase: PHASE.IDLE,
    totalSeconds: 0,
    studySeconds: 0,
    breakSeconds: 0,
    elapsedSeconds: 0,
    phaseElapsedSeconds: 0,
    activeStudySeconds: 0,
    activeBreakSeconds: 0,
    isRunning: false,
    isPaused: false,
    method: "",
    topic: "",
    startedAtISO: "",
    endedAtISO: "",
    status: "idle",
    transitions: [],
    pausedTotalSeconds: 0
  };
}

function validateAndBuildConfig() {
  const totalMin = clampInt($("totalMin").value, 1);
  const studyMin = clampInt($("studyMin").value, 1);
  const breakMin = clampInt($("breakMin").value, 0);

  const totalSeconds = totalMin * 60;
  const studySeconds = studyMin * 60;
  const breakSeconds = breakMin * 60;

  if (studySeconds > totalSeconds) throw new Error("Study session cannot exceed total time.");

  const method = $("method").value;
  const topic = $("topic").value;
  if (!method) throw new Error("Study mode is mandatory.");
  if (!topic) throw new Error("Topic is mandatory.");

  return { totalSeconds, studySeconds, breakSeconds, method, topic };
}

function currentPhaseLength() {
  if (timer.phase === PHASE.STUDY) return timer.studySeconds;
  if (timer.phase === PHASE.BREAK) return timer.breakSeconds;
  return 0;
}

function setPhase(nextPhase) {
  const prev = timer.phase;
  timer.phase = nextPhase;
  timer.phaseElapsedSeconds = 0;

  if (
    (prev === PHASE.STUDY && nextPhase === PHASE.BREAK) ||
    (prev === PHASE.BREAK && nextPhase === PHASE.STUDY)
  ) {
    alarm(2.0);
  }

  applyRingPhaseStyle();
  updateRunUI();
}

function stopTick() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

function finishSession(status) {
  stopTick();
  timer.isRunning = false;
  timer.isPaused = false;
  timer.phase = PHASE.DONE;
  timer.endedAtISO = nowISO();
  timer.status = status;

  if (status === "completed") alarm(2.0);

  addLog({
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
    startedAtISO: timer.startedAtISO,
    endedAtISO: timer.endedAtISO,
    status: timer.status,
    plannedTotalSeconds: timer.totalSeconds,
    plannedStudySeconds: timer.studySeconds,
    plannedBreakSeconds: timer.breakSeconds,
    activeStudySeconds: timer.activeStudySeconds,
    activeBreakSeconds: timer.activeBreakSeconds,
    totalActiveSeconds: timer.activeStudySeconds + timer.activeBreakSeconds,
    pausedTotalSeconds: timer.pausedTotalSeconds,
    method: timer.method,
    topic: timer.topic
  });

  refreshHomeStats();

  showView("analytics");
  setActiveTab("logTab");
  renderStudyLog();
  initDefaultRange();
  renderTrendCharts();
}

function tick() {
  if (!timer.isRunning) return;

  if (timer.isPaused) {
    timer.pausedTotalSeconds += 1;
    return;
  }

  timer.elapsedSeconds += 1;
  timer.phaseElapsedSeconds += 1;

  if (timer.phase === PHASE.STUDY) timer.activeStudySeconds += 1;
  if (timer.phase === PHASE.BREAK) timer.activeBreakSeconds += 1;

  if (timer.elapsedSeconds >= timer.totalSeconds) {
    timer.elapsedSeconds = timer.totalSeconds;
    finishSession("completed");
    return;
  }

  const phaseLen = currentPhaseLength();
  if (timer.phase === PHASE.BREAK && timer.breakSeconds === 0) {
    setPhase(PHASE.STUDY);
  } else if (phaseLen > 0 && timer.phaseElapsedSeconds >= phaseLen) {
    if (timer.phase === PHASE.STUDY) {
      if (timer.breakSeconds > 0) setPhase(PHASE.BREAK);
      else setPhase(PHASE.STUDY);
    } else {
      setPhase(PHASE.STUDY);
    }
  }

  updateRunUI();
}

function startSession() {
  unlockAudioIfNeeded();
  const cfg = validateAndBuildConfig();

  resetTimerState();
  timer.totalSeconds = cfg.totalSeconds;
  timer.studySeconds = cfg.studySeconds;
  timer.breakSeconds = cfg.breakSeconds;
  timer.method = cfg.method;
  timer.topic = cfg.topic;
  timer.isRunning = true;
  timer.startedAtISO = nowISO();

  setPhase(PHASE.STUDY);
  alarm(2.0);

  $("runTopic").textContent = timer.topic;
  $("runMode").textContent = timer.method;

  showView("run");
  updateRunUI();

  stopTick();
  tickHandle = setInterval(tick, 1000);
}

function pauseSession() { timer.isPaused = true; updateRunUI(); }
function resumeSession() { unlockAudioIfNeeded(); timer.isPaused = false; updateRunUI(); }
function stopSessionWithConfirm() {
  const totalActive = timer.activeStudySeconds + timer.activeBreakSeconds;
  const msg =
    "Are you sure you want to stop the session?\n\n" +
    "Your active time so far (excluding pauses) will be saved.\n" +
    `Active time: ${mmss(totalActive)} (Study: ${mmss(timer.activeStudySeconds)}, Break: ${mmss(timer.activeBreakSeconds)})`;
  if (confirm(msg)) finishSession("stopped");
}

/* ---------- Setup preview ---------- */
function updateSetupPreview() {
  const totalMin = clampInt($("totalMin").value, 1);
  const studyMin = clampInt($("studyMin").value, 1);
  const breakMin = clampInt($("breakMin").value, 0);

  $("previewTotal").textContent = mmss(totalMin * 60);
  $("previewCycle").textContent = `${mmss(studyMin * 60)} / ${mmss(breakMin * 60)}`;
  $("previewTopic").textContent = $("topic").value || "—";
  $("previewMode").textContent = $("method").value || "—";
}

/* ---------- Run ring (phase progress) ---------- */
const phaseRingEl = $("phaseRing");
const R = 52;
const CIRC = 2 * Math.PI * R;
phaseRingEl.style.strokeDasharray = `${CIRC} ${CIRC}`;
phaseRingEl.style.strokeDashoffset = `${CIRC}`;

function setRingProgress(pct01) {
  const pct = Math.max(0, Math.min(1, pct01));
  phaseRingEl.style.strokeDashoffset = `${CIRC * (1 - pct)}`;
}

function applyRingPhaseStyle() {
  if (timer.phase === PHASE.BREAK) {
    phaseRingEl.style.stroke = "rgba(255,204,102,0.95)";
    $("ringLabel").textContent = "Break";
    $("runPhasePill").textContent = "Break";
  } else {
    phaseRingEl.style.stroke = "rgba(124,92,255,0.95)";
    $("ringLabel").textContent = "Study";
    $("runPhasePill").textContent = "Study";
  }
}

function updateRunUI() {
  const totalRemaining = Math.max(0, timer.totalSeconds - timer.elapsedSeconds);
  const phaseLen = currentPhaseLength();
  const phaseRemaining =
    (timer.phase === PHASE.DONE || timer.phase === PHASE.IDLE)
      ? 0
      : Math.max(0, phaseLen - timer.phaseElapsedSeconds);

  $("ringTime").textContent = mmss(phaseRemaining);
  $("runElapsed").textContent = mmss(timer.elapsedSeconds);
  $("runRemaining").textContent = mmss(totalRemaining);
  $("runActiveStudy").textContent = mmss(timer.activeStudySeconds);
  $("runActiveBreak").textContent = mmss(timer.activeBreakSeconds);

  if (phaseLen > 0 && (timer.phase === PHASE.STUDY || timer.phase === PHASE.BREAK)) {
    setRingProgress(timer.phaseElapsedSeconds / phaseLen);
  } else {
    setRingProgress(0);
  }

  $("pauseBtn").disabled = timer.isPaused;
  $("resumeBtn").disabled = !timer.isPaused;
}

/* ---------- Home stats: Yesterday / Today / Streak + target history ---------- */
// Yesterday ring
const yesterdayRingFg = $("yesterdayRingFg");
const YR = 52;
const YCIRC = 2 * Math.PI * YR;
yesterdayRingFg.style.strokeDasharray = `${YCIRC} ${YCIRC}`;
yesterdayRingFg.style.strokeDashoffset = `${YCIRC}`;

function setYesterdayRing(pct01) {
  const pct = Math.max(0, Math.min(1, pct01));
  yesterdayRingFg.style.strokeDashoffset = `${YCIRC * (1 - pct)}`;
}

const todayRingFg = $("todayRingFg");
const TR = 52;
const TCIRC = 2 * Math.PI * TR;
todayRingFg.style.strokeDasharray = `${TCIRC} ${TCIRC}`;
todayRingFg.style.strokeDashoffset = `${TCIRC}`;

function setTodayRing(pct01) {
  const pct = Math.max(0, Math.min(1, pct01));
  todayRingFg.style.strokeDashoffset = `${TCIRC * (1 - pct)}`;
}

function sumActiveStudyByDateKey(logs) {
  const map = new Map();
  for (const s of logs) {
    const key = isoToLocalDateKey(s.startedAtISO);
    map.set(key, (map.get(key) || 0) + (s.activeStudySeconds || 0));
  }
  return map;
}

function computeStreak(dateToSecondsMap) {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = addDays(today, -i);
    const key = isoToLocalDateKey(d.toISOString());
    const sec = dateToSecondsMap.get(key) || 0;
    if (sec > 0) streak += 1;
    else break;
  }
  return streak;
}

function refreshHomeStats() {
  const logs = loadLogs();
  const map = sumActiveStudyByDateKey(logs);

  const today = new Date();
  const yday = addDays(today, -1);
  const todayKey = isoToLocalDateKey(today.toISOString());
  const ydayKey = isoToLocalDateKey(yday.toISOString());

  const todayStudy = map.get(todayKey) || 0;
  const ydayStudy = map.get(ydayKey) || 0;

  $("todayDatePill").textContent = todayKey;
  $("yesterdayDatePill").textContent = ydayKey;

  // targets per date
  const todayTarget = getTargetForDate(todayKey);
  const ydayTarget = getTargetForDate(ydayKey);

  $("todayBig").textContent = hhmm(todayStudy);
  $("yesterdayBig").textContent = hhmm(ydayStudy);

  // percentages
  const pctToday = (todayTarget && todayTarget > 0) ? Math.min(100, Math.round((todayStudy / todayTarget) * 100)) : null;
  const pctYday = (ydayTarget && ydayTarget > 0) ? Math.min(100, Math.round((ydayStudy / ydayTarget) * 100)) : null;

  $("todayPct").textContent = pctToday == null ? "—%" : `${pctToday}%`;
  $("todayMeta").textContent = todayTarget == null
    ? "Target: — (Set target)"
    : `Target: ${secondsToHM(todayTarget)} • Studied: ${secondsToHM(todayStudy)}`;

  $("yesterdayMeta").textContent = ydayTarget == null
    ? "Target: — • —%"
    : `Target: ${secondsToHM(ydayTarget)} • ${pctYday}%`;

  setTodayRing(pctToday == null ? 0 : (pctToday / 100));
  setYesterdayRing(pctYday == null ? 0 : (pctYday / 100));

  const streak = computeStreak(map);
  $("streakBig").textContent = String(streak);
}

/* ---------- Masters UI render ---------- */
function countUsage() {
  const logs = loadLogs();
  const topicCount = new Map();
  const modeCount = new Map();
  for (const s of logs) {
    const t = s.topic || "";
    const m = s.method || "";
    topicCount.set(t, (topicCount.get(t) || 0) + 1);
    modeCount.set(m, (modeCount.get(m) || 0) + 1);
  }
  return { topicCount, modeCount };
}

function renderMasters() {
  const topics = loadMaster(TOPICS_KEY).slice().sort((a,b) => a.name.localeCompare(b.name));
  const modes = loadMaster(MODES_KEY).slice().sort((a,b) => a.name.localeCompare(b.name));
  const { topicCount, modeCount } = countUsage();

  // Topics list
  const tWrap = $("topicMasterList");
  tWrap.innerHTML = "";
  topics.forEach(t => {
    const used = topicCount.get(t.name) || 0;
    const div = document.createElement("div");
    div.className = "masterItem";
    div.innerHTML = `
      <div class="masterLeft">
        <div class="masterName">${escapeHTML(t.name)} ${t.active ? "" : "<span class='mutedSmall'>(inactive)</span>"}</div>
        <div class="masterMeta">Used in ${used} session(s)</div>
      </div>
      <button class="toggleBtn" data-kind="topic" data-id="${t.id}">
        ${t.active ? "Deactivate" : "Activate"}
      </button>
    `;
    tWrap.appendChild(div);
  });
  $("topicMasterHint").textContent = topics.length ? "" : "No topics. Add one.";

  // Modes list
  const mWrap = $("modeMasterList");
  mWrap.innerHTML = "";
  modes.forEach(m => {
    const used = modeCount.get(m.name) || 0;
    const div = document.createElement("div");
    div.className = "masterItem";
    div.innerHTML = `
      <div class="masterLeft">
        <div class="masterName">${escapeHTML(m.name)} ${m.active ? "" : "<span class='mutedSmall'>(inactive)</span>"}</div>
        <div class="masterMeta">Used in ${used} session(s)</div>
      </div>
      <button class="toggleBtn" data-kind="mode" data-id="${m.id}">
        ${m.active ? "Deactivate" : "Activate"}
      </button>
    `;
    mWrap.appendChild(div);
  });
  $("modeMasterHint").textContent = modes.length ? "" : "No modes. Add one.";

  // Wire toggles
  document.querySelectorAll(".toggleBtn").forEach(btn => {
    btn.onclick = () => {
      const kind = btn.getAttribute("data-kind");
      const id = btn.getAttribute("data-id");
      toggleMasterActive(kind === "topic" ? TOPICS_KEY : MODES_KEY, id);
      renderMasters();
      refreshSetupDropdowns();
      updateSetupPreview();
      refreshHomeStats();
      initDefaultRange();
      renderTrendCharts();
    };
  });
}

/* ---------- Analytics: Study Log ---------- */
function renderStudyLog() {
  const logs = loadLogs();
  const tbody = $("logTbody");
  tbody.innerHTML = "";

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="mutedSmall">No sessions yet.</td></tr>`;
    $("logCount").textContent = "";
    return;
  }

  for (const s of logs) {
    const topic = s.topic && s.topic.trim() ? s.topic.trim() : "—";
    const mode = s.method || "—";
    const status = s.status === "completed" ? "Completed" : "Stopped";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(prettyDateTime(s.startedAtISO))}</td>
      <td>${escapeHTML(topic)}</td>
      <td>${escapeHTML(mode)}</td>
      <td>${mmss(s.plannedTotalSeconds)}</td>
      <td>${mmss(s.activeStudySeconds || 0)}</td>
      <td>${mmss(s.activeBreakSeconds || 0)}</td>
      <td><b>${mmss(s.totalActiveSeconds || 0)}</b></td>
      <td>${escapeHTML(status)}</td>
    `;
    tbody.appendChild(tr);
  }
  $("logCount").textContent = `${logs.length} session(s) saved in this browser.`;
}

/* ---------- Analytics: Trend Charts ---------- */
let dailyBarChart = null;
let topicPieChart = null;
let modePieChart = null;

function destroyCharts() {
  if (dailyBarChart) dailyBarChart.destroy();
  if (topicPieChart) topicPieChart.destroy();
  if (modePieChart) modePieChart.destroy();
  dailyBarChart = topicPieChart = modePieChart = null;
}

function initDefaultRange() {
  const end = new Date();
  const start = addDays(end, -6);
  $("rangeStart").value = isoToLocalDateKey(start.toISOString());
  $("rangeEnd").value = isoToLocalDateKey(end.toISOString());
  $("rangeHint").textContent = "Default: last 7 days.";
}

function parseRange() {
  const startStr = $("rangeStart").value;
  const endStr = $("rangeEnd").value;
  if (!startStr || !endStr) return null;

  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T23:59:59");

  if (end < start) throw new Error("End date must be after start date.");
  const days = Math.floor((end - start) / (24 * 3600 * 1000)) + 1;
  if (days > 31) throw new Error("Date range cannot exceed 31 days.");

  return { start, end, days };
}

function filterSessionsByRange(sessions, start, end) {
  return sessions.filter(s => {
    const d = new Date(s.startedAtISO);
    return d >= start && d <= end;
  });
}

function makeDayLabels(startDate, days) {
  const labels = [];
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startDate, i);
    const key = isoToLocalDateKey(d.toISOString());
    keys.push(key);
    labels.push(formatDDMon(d));
  }
  return { labels, keys };
}

function aggregateByKey(sessions, keyFn, valueFn) {
  const map = new Map();
  for (const s of sessions) {
    const k = keyFn(s);
    const v = valueFn(s);
    map.set(k, (map.get(k) || 0) + v);
  }
  return map;
}

function updateTopicFilterOptions(rangeSessions) {
  // union of master topics + topics used in range (including inactive)
  const master = loadMaster(TOPICS_KEY).map(t => ({ name: t.name, active: t.active }));
  const used = new Set(rangeSessions.map(s => s.topic).filter(Boolean));

  const map = new Map();
  master.forEach(t => map.set(t.name, t.active));
  used.forEach(name => {
    if (!map.has(name)) map.set(name, true); // unknown topic treated active for filter visibility
  });

  const select = $("topicFilter");
  const current = select.value || "__ALL__";
  select.innerHTML = `<option value="__ALL__">All topics</option>`;

  Array.from(map.entries())
    .sort((a,b) => a[0].localeCompare(b[0]))
    .forEach(([name, active]) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = active ? name : `${name} (inactive)`;
      select.appendChild(opt);
    });

  const exists = Array.from(select.options).some(o => o.value === current);
  select.value = exists ? current : "__ALL__";
}

function renderTrendCharts() {
  const logs = loadLogs();
  let range;
  try { range = parseRange(); }
  catch (e) { $("rangeHint").textContent = e.message || "Invalid range."; return; }

  $("rangeHint").textContent = `Showing ${range.days} day(s).`;

  const inRange = filterSessionsByRange(logs, range.start, range.end);
  updateTopicFilterOptions(inRange);

  const selectedTopic = $("topicFilter").value;
  const filtered = (selectedTopic === "__ALL__") ? inRange : inRange.filter(s => s.topic === selectedTopic);

  const { labels, keys } = makeDayLabels(range.start, range.days);

  // DAILY: actual vs target (topic filter applies to actual)
  const actualStudySecByDay = new Map(keys.map(k => [k, 0]));
  for (const s of filtered) {
    const k = isoToLocalDateKey(s.startedAtISO);
    if (actualStudySecByDay.has(k)) {
      actualStudySecByDay.set(k, actualStudySecByDay.get(k) + (s.activeStudySeconds || 0));
    }
  }

  const actualMinutes = keys.map(k => Math.round((actualStudySecByDay.get(k) || 0) / 60));

  // target varies by date (history)
  const targetMinutes = keys.map(k => {
    const t = getTargetForDate(k);
    return t == null ? 0 : Math.round(t / 60);
  });

  // Topic pie: topics by time (topic filter applies -> will become single topic if selected)
  const topicMap = aggregateByKey(
    filtered,
    (s) => s.topic || "—",
    (s) => (s.activeStudySeconds || 0)
  );

  // Mode pie: modes by time (topic filter applies)
  const modeMap = aggregateByKey(
    filtered,
    (s) => s.method || "—",
    (s) => (s.activeStudySeconds || 0)
  );

  const topicLabels = [];
  const topicValues = [];
  for (const [k, v] of Array.from(topicMap.entries()).sort((a,b) => b[1]-a[1])) {
    if (v > 0) { topicLabels.push(k); topicValues.push(v); }
  }

  const modeLabels = [];
  const modeValues = [];
  for (const [k, v] of Array.from(modeMap.entries()).sort((a,b) => b[1]-a[1])) {
    if (v > 0) { modeLabels.push(k); modeValues.push(v); }
  }

  destroyCharts();

  dailyBarChart = new Chart($("dailyBar"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Target (minutes)", data: targetMinutes },
        { label: "Actual (minutes)", data: actualMinutes }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 0, minRotation: 0 } }
      }
    }
  });

  topicPieChart = new Chart($("topicPie"), {
    type: "doughnut",
    data: {
      labels: topicLabels.length ? topicLabels : ["No data"],
      datasets: [{ data: topicValues.length ? topicValues : [1] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  modePieChart = new Chart($("modePie"), {
    type: "doughnut",
    data: {
      labels: modeLabels.length ? modeLabels : ["No data"],
      datasets: [{ data: modeValues.length ? modeValues : [1] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

/* ---------- Tabs helper ---------- */
function setActiveTab(tabId) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach(p => p.classList.add("hidden"));
  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add("active");
  $(tabId).classList.remove("hidden");
}

/* ---------- Export/Clear ---------- */
function exportJSON() {
  const logs = loadLogs();
  const data = JSON.stringify(logs, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "studymate-sessions.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Wiring ---------- */
function initApp() {
  seedIfMissing();
  resetTimerState();

  // Setup dropdowns from masters
  refreshSetupDropdowns();
  updateSetupPreview();

  // Initial home stats
  refreshHomeStats();

  // Home
  $("homeBtnTop").onclick = () => { refreshHomeStats(); showView("home"); };

  $("goStudyBtn").onclick = () => {
    refreshSetupDropdowns();
    updateSetupPreview();
    showView("setup");
  };

  $("goTargetBtn").onclick = () => {
    // preload target inputs from effective target today (or default)
    const todayKey = isoToLocalDateKey(nowISO());
    const t = getTargetForDate(todayKey);
    const h = t ? Math.floor(t / 3600) : 1;
    const m = t ? Math.floor((t % 3600) / 60) : 0;
    $("targetHours").value = h;
    $("targetMinutes").value = m;
    $("targetSavedHint").textContent = t ? `Current (effective today): ${secondsToHM(t)}` : "No target set for today.";
    renderTargetHistoryTable();
    renderMasters();
    setActiveTab("targetTab");
    showView("target");
  };

  $("goAnalyticsBtn").onclick = () => {
    showView("analytics");
    setActiveTab("logTab");
    renderStudyLog();
    initDefaultRange();
    renderTrendCharts();
  };

  // Back buttons
  $("backToHomeFromSetup").onclick = () => { refreshHomeStats(); showView("home"); };
  $("backToHomeFromAnalytics").onclick = () => { refreshHomeStats(); showView("home"); };
  $("backToHomeFromTarget").onclick = () => { refreshHomeStats(); showView("home"); };

  // Setup preview live
  ["totalMin","studyMin","breakMin","method","topic"].forEach(id => {
    $(id).addEventListener("input", updateSetupPreview);
    $(id).addEventListener("change", updateSetupPreview);
  });

  // Start
  $("startSessionBtn").onclick = () => {
    $("setupError").textContent = "";
    try { startSession(); }
    catch (e) {
      $("setupError").textContent = e.message || "Invalid configuration.";
      alert(e.message || "Invalid configuration.");
    }
  };

  // Run controls
  $("pauseBtn").onclick = pauseSession;
  $("resumeBtn").onclick = resumeSession;
  $("stopBtn").onclick = stopSessionWithConfirm;

  // Target tab actions
  $("saveTargetBtn").onclick = () => {
    const h = clampInt($("targetHours").value, 0, 24);
    const m = clampInt($("targetMinutes").value, 0, 59);
    $("targetHours").value = h;
    $("targetMinutes").value = m;
    const sec = (h * 3600) + (m * 60);
    setTargetEffectiveToday(sec);
    $("targetSavedHint").textContent = `Saved: ${secondsToHM(sec)} (effective today)`;
    renderTargetHistoryTable();
    refreshHomeStats();
    initDefaultRange();
    renderTrendCharts();
  };

  $("viewTargetHistoryBtn").onclick = () => renderTargetHistoryTable();

  $("clearTargetHistoryBtn").onclick = () => {
    if (confirm("Clear all target history? This removes target comparisons for all days.")) {
      clearTargetHistory();
      renderTargetHistoryTable();
      refreshHomeStats();
      initDefaultRange();
      renderTrendCharts();
      $("targetSavedHint").textContent = "Target history cleared.";
    }
  };

  // Masters add
  $("addTopicBtn").onclick = () => {
    const name = $("newTopicInput").value;
    const res = addMasterItem(TOPICS_KEY, name);
    if (!res.ok) alert(res.msg);
    $("newTopicInput").value = "";
    renderMasters();
    refreshSetupDropdowns();
  };

  $("addModeBtn").onclick = () => {
    const name = $("newModeInput").value;
    const res = addMasterItem(MODES_KEY, name);
    if (!res.ok) alert(res.msg);
    $("newModeInput").value = "";
    renderMasters();
    refreshSetupDropdowns();
  };

  // Tabs (both in target view and analytics view share class .tab)
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      setActiveTab(tabId);

      if (tabId === "masterTab") {
        renderMasters();
      }
      if (tabId === "targetTab") {
        renderTargetHistoryTable();
      }
      if (tabId === "trendTab") {
        initDefaultRange();
        renderTrendCharts();
      }
      if (tabId === "logTab") {
        renderStudyLog();
      }
    });
  });

  // Trend controls
  $("applyRangeBtn").onclick = () => renderTrendCharts();
  $("topicFilter").onchange = () => renderTrendCharts();

  // Log actions
  $("exportBtn").onclick = exportJSON;
  $("clearLogsBtn").onclick = () => {
    if (confirm("Clear all StudyMate sessions saved in this browser?")) {
      localStorage.removeItem(STORAGE_KEY);
      refreshHomeStats();
      renderStudyLog();
      renderTrendCharts();
      renderMasters();
    }
  };

  showView("home");
}

initApp();
