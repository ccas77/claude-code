"use strict";
// StoryForge web UI. Vanilla JS, no build step. Drives the same six-stage
// pipeline over the JSON API in server.py.

const $ = (s) => document.querySelector(s);
const api = {
  async get(u) { const r = await fetch(u); if (!r.ok) throw await err(r); return r.json(); },
  async post(u, body) {
    const r = await fetch(u, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body || {})});
    if (!r.ok) throw await err(r);
    return r.json();
  },
};
async function err(r) { try { return new Error((await r.json()).error || r.status); }
  catch { return new Error("HTTP " + r.status); } }

let current = null;     // current project name
let poll = null;        // status poll timer
const STAGES = ["script", "cast", "images", "voiceover", "timeline", "render"];

// ---------- sidebar ----------
async function loadProjects() {
  const projects = await api.get("/api/projects");
  const list = $("#project-list");
  list.innerHTML = "";
  for (const p of projects) {
    const el = document.createElement("div");
    el.className = "proj" + (p.name === current ? " active" : "");
    const dots = STAGES.map(s => `<span class="dot ${p.stages && p.stages[s] ? "on" : ""}"></span>`).join("");
    el.innerHTML = `<div class="t">${escapeHtml(p.title)}</div><div class="d">${dots}</div>` +
      (p.has_video ? `<div class="v">✓ video ready</div>` : "");
    el.onclick = () => openProject(p.name);
    list.appendChild(el);
  }
}

// ---------- create ----------
function charRow(id = "", desc = "") {
  const row = document.createElement("div");
  row.className = "char-row";
  row.innerHTML =
    `<input class="cid" placeholder="id" value="${escapeAttr(id)}">
     <textarea class="cdesc" rows="2" placeholder="locked appearance — same string injected into every scene">${escapeHtml(desc)}</textarea>
     <button class="ghost rm">✕</button>`;
  row.querySelector(".rm").onclick = () => row.remove();
  return row;
}
function showCreate() {
  current = null;
  stopPoll();
  $("#project-view").classList.add("hidden");
  $("#create-view").classList.remove("hidden");
  $("#create-msg").textContent = "";
  loadProjects();
}
async function submitCreate() {
  const characters = [...document.querySelectorAll(".char-row")].map(r => ({
    id: r.querySelector(".cid").value.trim(),
    description: r.querySelector(".cdesc").value.trim(),
  })).filter(c => c.id && c.description);
  const body = {
    name: $("#f-name").value.trim(),
    title: $("#f-title").value.trim(),
    premise: $("#f-premise").value.trim(),
    style: $("#f-style").value.trim(),
    minutes: parseFloat($("#f-minutes").value) || 3,
    aspect: $("#f-aspect").value,
    characters,
  };
  const msg = $("#create-msg");
  msg.className = "msg"; msg.textContent = "creating…";
  try {
    const st = await api.post("/api/projects", body);
    await loadProjects();
    openProject(st.name);
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
}

// ---------- project detail ----------
async function openProject(name) {
  current = name;
  stopPoll();
  $("#create-view").classList.add("hidden");
  $("#project-view").classList.remove("hidden");
  await renderProject();
  await loadProjects();
  // if a run is in progress (e.g. after reload), resume polling
  const s = await api.get(`/api/projects/${name}/status`);
  if (s.running) startPoll();
}

async function renderProject() {
  const st = await api.get(`/api/projects/${current}`);
  $("#p-title").textContent = st.title;
  $("#p-meta").textContent = `${st.target_minutes} min · ${st.aspect} · ${st.scenes.length} scenes`;

  // pipeline chips
  const pl = $("#pipeline"); pl.innerHTML = "";
  for (const s of STAGES) {
    const el = document.createElement("div");
    el.className = "stage" + (st.stages[s] ? " done" : "");
    el.id = "stage-" + s;
    el.innerHTML = `<span class="s-dot"></span>${s}`;
    pl.appendChild(el);
  }

  // video
  const vw = $("#video-wrap");
  if (st.has_video) {
    vw.classList.remove("hidden");
    const v = $("#video");
    v.src = `/api/projects/${current}/video?t=${Date.now()}`;
    $("#video-dl").href = `/api/projects/${current}/video`;
  } else { vw.classList.add("hidden"); }

  // storyboard
  const board = $("#board");
  board.innerHTML = "";
  if (st.scenes.length) {
    $("#board-title").classList.remove("hidden");
    for (const sc of st.scenes) board.appendChild(sceneCard(sc));
  } else { $("#board-title").classList.add("hidden"); }
}

function sceneCard(sc) {
  const card = document.createElement("div");
  card.className = "card" + (sc.flagged ? " flagged" : "");
  const img = sc.has_image
    ? `<img src="/api/projects/${current}/image/${sc.id}?t=${Date.now()}" loading="lazy">`
    : `<span class="none">not generated</span>`;
  const badge = sc.qc_score == null ? ""
    : (sc.flagged ? `<span class="badge flag">⚠ drift</span>`
                  : `<span class="badge ok">qc ${sc.qc_score}</span>`);
  card.innerHTML =
    `<div class="thumb">${img}</div>
     <div class="b">
       <div class="top"><span class="num">Scene ${String(sc.id).padStart(2,"0")}</span>${badge}
         <span class="tags">${escapeHtml(sc.mood)} · ${escapeHtml(sc.shot)}</span></div>
       <div class="narr">${escapeHtml(sc.narration)}</div>
       <button class="ghost regen">↻ regenerate this scene</button>
     </div>`;
  card.querySelector(".regen").onclick = () => regenerate(sc.id);
  return card;
}

// ---------- runs ----------
async function run(opts) {
  $("#run-state").className = "msg";
  $("#run-state").textContent = "starting…";
  $("#log-wrap").classList.remove("hidden");
  $("#log").textContent = "";
  try {
    await api.post(`/api/projects/${current}/run`, opts);
    startPoll();
  } catch (e) {
    $("#run-state").className = "msg err";
    $("#run-state").textContent = e.message;
  }
}
function regenerate(sid) {
  // clear that scene's image + downstream, then rebuild images -> render
  run({from: "images", clear_scenes: [sid]});
}

function setRunning(running) {
  $("#run-all").disabled = running;
  $("#run-images").disabled = running;
  document.querySelectorAll(".regen").forEach(b => b.disabled = running);
}

function startPoll() {
  setRunning(true);
  stopPoll();
  poll = setInterval(pollStatus, 900);
  pollStatus();
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

async function pollStatus() {
  let s;
  try { s = await api.get(`/api/projects/${current}/status`); }
  catch { return; }
  $("#log").textContent = s.log.join("\n");
  $("#log").scrollTop = $("#log").scrollHeight;
  // highlight active stage
  document.querySelectorAll(".stage").forEach(e => e.classList.remove("active"));
  if (s.stage) {
    $("#log-stage").textContent = "· " + s.stage;
    const el = $("#stage-" + s.stage);
    if (el) el.classList.add("active");
  }
  if (!s.running && s.done) {
    stopPoll();
    setRunning(false);
    $("#log-stage").textContent = "";
    $("#run-state").className = s.error ? "msg err" : "msg";
    $("#run-state").textContent = s.error ? ("failed: " + s.error) : "✓ done";
    await renderProject();
    await loadProjects();
  } else if (!s.running) {
    stopPoll(); setRunning(false);
  }
}

// ---------- utils ----------
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

// ---------- wire up ----------
$("#new-btn").onclick = showCreate;
$("#create-submit").onclick = submitCreate;
$("#add-char").onclick = () => $("#char-rows").appendChild(charRow());
$("#run-all").onclick = () => run({force: $("#force").checked});
$("#run-images").onclick = () => run({to: "images", force: $("#force").checked});

async function init() {
  $("#char-rows").appendChild(charRow("protagonist", ""));
  const projects = await api.get("/api/projects");
  $("#backends").innerHTML = "backends: stub by default<br>(set STORYFORGE_IMAGE=gemini etc. to go live)";
  if (projects.length) { showCreateHidden(); openProject(projects[0].name); }
  else showCreate();
  loadProjects();
}
function showCreateHidden() { $("#create-view").classList.add("hidden"); }
init();
