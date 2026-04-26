/* ============================================================
   PLANÈTE CHAOS — app.js (client Netlify)
   Se connecte au serveur Railway via WebSocket
   Reçoit l'état du monde et l'anime localement
   ============================================================ */

// ============================================================
// ADRESSE DU SERVEUR RAILWAY
// À mettre à jour après déploiement Railway
// ============================================================
const SERVER_URL = "wss://planete-chaos-server-production.up.railway.app";

// ============================================================
// CANVAS
// ============================================================
const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// Dimensions de référence du serveur
const SERVER_W = 1280;
const SERVER_H = 800;

function scaleX(x) { return x / SERVER_W * canvas.width; }
function scaleY(y) { return y / SERVER_H * canvas.height; }
function scaleR(r) { return r / SERVER_W * canvas.width; }

// ============================================================
// UTILITAIRES
// ============================================================
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function lerpAngle(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

// ============================================================
// ÉTAT LOCAL
// ============================================================
let serverCreatures = new Map();
let localCreatures = new Map();
let worldBirth = null;
let renderTick = 0;
let connected = false;

// ============================================================
// CONNEXION WEBSOCKET
// ============================================================
let ws = null;
let reconnectDelay = 2000;

function connect() {
  ws = new WebSocket(SERVER_URL);

  ws.addEventListener("open", () => {
    connected = true;
    reconnectDelay = 2000;
    console.log("Connecté au serveur Planète Chaos");
    hideOverlay();
  });

  ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "snapshot") handleSnapshot(msg.data);
    } catch (e) {
      console.error("Erreur parsing :", e);
    }
  });

  ws.addEventListener("close", () => {
    connected = false;
    showOverlay("connexion perdue — reconnexion en cours…");
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
  });

  ws.addEventListener("error", () => {});
}

// ============================================================
// TRAITEMENT SNAPSHOT
// ============================================================
function handleSnapshot(data) {
  if (worldBirth === null) worldBirth = data.worldBirth;

  const incomingIds = new Set();

  data.creatures.forEach(c => {
    incomingIds.add(c.id);
    serverCreatures.set(c.id, c);

    if (!localCreatures.has(c.id)) {
      localCreatures.set(c.id, {
        ...c,
        lx: c.x, ly: c.y, la: c.angle,
        deathGlow: c.dead ? 1.0 : null,
        limbOffset: Math.random() * Math.PI * 2,
      });
    } else {
      const local = localCreatures.get(c.id);
      Object.assign(local, c);
      if (c.dead && local.deathGlow === null) local.deathGlow = 1.0;
    }
  });

  for (const id of localCreatures.keys()) {
    if (!incomingIds.has(id)) {
      localCreatures.delete(id);
      serverCreatures.delete(id);
    }
  }
}

// ============================================================
// DESSIN D'UNE CRÉATURE
// ============================================================
function drawCreature(c, tick) {
  const g = c.genes;
  const cx = scaleX(c.lx);
  const cy = scaleY(c.ly);
  const size = scaleR(g.size);
  const alpha = c.dead ? Math.max(0, c.deathGlow ?? 0) : 1;
  if (alpha <= 0) return;

  const hue = g.hue;
  const sat = 70 + g.saturation * 20;
  const lit = 55 + g.lightness * 15;
  const t = (tick + (c.limbOffset ?? 0)) * 0.04;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  // Appendices
  const limbCount = g.limbCount;
  const phases = c.limbPhases ?? [];
  for (let i = 0; i < limbCount; i++) {
    const phase = phases[i] ?? (i / limbCount) * Math.PI * 2;
    const baseAngle = c.la + (i / limbCount) * Math.PI * 2;
    const wave = Math.sin(t * g.limbSpeed + phase) * 0.6;
    const limbAngle = baseAngle + wave;
    const limbLen = scaleR(g.limbLength);
    const limbW = Math.max(1, scaleR(g.size * 0.28));

    const x1 = Math.cos(limbAngle) * size * 0.8;
    const y1 = Math.sin(limbAngle) * size * 0.8;
    const x2 = Math.cos(limbAngle) * (size * 0.8 + limbLen);
    const y2 = Math.sin(limbAngle) * (size * 0.8 + limbLen);
    const midX = (x1 + x2) / 2 + Math.cos(limbAngle + Math.PI / 2) * limbLen * 0.35 * Math.sin(t * g.limbSpeed + phase + 1);
    const midY = (y1 + y2) / 2 + Math.sin(limbAngle + Math.PI / 2) * limbLen * 0.35 * Math.sin(t * g.limbSpeed + phase + 1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit + 10}%, ${0.55 * alpha})`;
    ctx.lineWidth = limbW;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x2, y2, limbW * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit + 20}%, ${0.4 * alpha})`;
    ctx.fill();
  }

  // Halo
  const glow = ctx.createRadialGradient(0, 0, size * 0.5, 0, 0, size * 2.2);
  glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${lit + 20}%, ${0.15 * alpha})`);
  glow.addColorStop(1, `hsla(${hue}, ${sat}%, ${lit}%, 0)`);
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Corps
  const bodyGrad = ctx.createRadialGradient(-size * 0.25, -size * 0.25, 0, 0, 0, size);
  bodyGrad.addColorStop(0, `hsla(${hue}, ${sat - 10}%, ${lit + 25}%, ${0.95 * alpha})`);
  bodyGrad.addColorStop(0.6, `hsla(${hue}, ${sat}%, ${lit}%, ${0.9 * alpha})`);
  bodyGrad.addColorStop(1, `hsla(${hue}, ${sat + 10}%, ${lit - 10}%, ${0.7 * alpha})`);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Yeux
  if (!c.dead) {
    const eyeDist = size * 0.42;
    const eyeR = Math.max(1, size * 0.18);
    const ex = Math.cos(c.la) * eyeDist * 0.7;
    const ey = Math.sin(c.la) * eyeDist * 0.7;
    const perpX = -Math.sin(c.la) * eyeDist * 0.38;
    const perpY = Math.cos(c.la) * eyeDist * 0.38;

    [1, -1].forEach(side => {
      ctx.beginPath();
      ctx.arc(ex + perpX * side, ey + perpY * side, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        ex + perpX * side + Math.cos(c.la) * eyeR * 0.3,
        ey + perpY * side + Math.sin(c.la) * eyeR * 0.3,
        eyeR * 0.5, 0, Math.PI * 2
      );
      ctx.fillStyle = `hsla(${hue}, 80%, 15%, 0.9)`;
      ctx.fill();
    });
  }

  // Lueur de mort
  if (c.dead && (c.deathGlow ?? 0) > 0) {
    const deathGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.5);
    deathGrad.addColorStop(0, `hsla(${hue}, 100%, 90%, ${c.deathGlow * 0.7})`);
    deathGrad.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.beginPath();
    ctx.arc(0, 0, size * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = deathGrad;
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// INTERPOLATION LOCALE
// ============================================================
function updateLocalCreatures() {
  localCreatures.forEach(c => {
    if (c.dead) {
      if (c.deathGlow === null) c.deathGlow = 1.0;
      c.deathGlow = Math.max(0, c.deathGlow - 0.025);
      return;
    }
    c.lx += (c.x - c.lx) * 0.12;
    c.ly += (c.y - c.ly) * 0.12;
    c.la = lerpAngle(c.la, c.angle, 0.08);
  });
}

// ============================================================
// FICHE CRÉATURE
// ============================================================
const ficheEl = document.getElementById("fiche");
const ficheContent = document.getElementById("fiche-content");
const ficheClose = document.getElementById("fiche-close");
let selectedId = null;

ficheClose.addEventListener("click", () => {
  ficheEl.classList.add("hidden");
  selectedId = null;
});

function showFiche(c, mx, my) {
  selectedId = c.id;
  const hue = c.genes.hue;
  const traits = getTraits(c.genes);

  ficheContent.innerHTML = `
    <span class="fiche-name">
      <span class="fiche-dot" style="background:hsl(${hue},70%,60%);color:hsl(${hue},70%,60%)"></span>
      Créature n°${c.id}
    </span>
    <div class="fiche-row"><span class="fiche-label">âge</span><span id="f-age">${Math.floor(c.age / 60)} cycles</span></div>
    <div class="fiche-row"><span class="fiche-label">génération</span><span>${c.generation}</span></div>
    <div class="fiche-row"><span class="fiche-label">descendants</span><span id="f-desc">${c.descendants}</span></div>
    <div class="fiche-row"><span class="fiche-label">énergie</span><span id="f-energy">${Math.round(c.energy)} / ${Math.round(c.genes.baseEnergy)}</span></div>
    <div class="fiche-traits">${traits.join(", ")}</div>
  `;

  const fw = 240, fh = 185;
  let fx = mx + 18;
  let fy = my - fh / 2;
  if (fx + fw > window.innerWidth - 10) fx = mx - fw - 18;
  if (fy < 10) fy = 10;
  if (fy + fh > window.innerHeight - 10) fy = window.innerHeight - fh - 10;
  ficheEl.style.left = fx + "px";
  ficheEl.style.top = fy + "px";
  ficheEl.classList.remove("hidden");
}

function updateFiche() {
  if (!selectedId) return;
  const c = localCreatures.get(selectedId);
  if (!c || c.dead) { ficheEl.classList.add("hidden"); selectedId = null; return; }
  const a = document.getElementById("f-age");
  const d = document.getElementById("f-desc");
  const e = document.getElementById("f-energy");
  if (a) a.textContent = Math.floor(c.age / 60) + " cycles";
  if (d) d.textContent = c.descendants;
  if (e) e.textContent = Math.round(c.energy) + " / " + Math.round(c.genes.baseEnergy);
}

function getTraits(genes) {
  const traits = [];
  if (genes.speed > 1.2) traits.push("rapide");
  else if (genes.speed < 0.5) traits.push("lente");
  if (genes.size > 7) traits.push("massive");
  else if (genes.size < 3) traits.push("minuscule");
  if (genes.metabolism < 0.7) traits.push("économe");
  else if (genes.metabolism > 1.4) traits.push("vorace");
  if (genes.fertility > 1.4) traits.push("prolifique");
  if (traits.length === 0) traits.push("équilibrée");
  return traits;
}

// ============================================================
// INTERACTION SOURIS
// ============================================================
function hitTest(c, mx, my) {
  const cx = scaleX(c.lx), cy = scaleY(c.ly);
  const r = scaleR(c.genes.size) + 8;
  return Math.hypot(mx - cx, my - cy) < r;
}

canvas.addEventListener("mousemove", e => {
  const hit = [...localCreatures.values()].find(c => !c.dead && hitTest(c, e.clientX, e.clientY));
  document.body.classList.toggle("hovering", !!hit);
});

canvas.addEventListener("click", e => {
  const hit = [...localCreatures.values()].find(c => !c.dead && hitTest(c, e.clientX, e.clientY));
  if (hit) { showFiche(hit, e.clientX, e.clientY); }
  else { ficheEl.classList.add("hidden"); selectedId = null; }
});

// ============================================================
// OVERLAY CONNEXION
// ============================================================
function showOverlay(msg) {
  let el = document.getElementById("overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "overlay";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = "flex";
}
function hideOverlay() {
  const el = document.getElementById("overlay");
  if (el) el.style.display = "none";
}

// ============================================================
// UI
// ============================================================
const birthEl = document.getElementById("ui-birthdate");
const ageEl = document.getElementById("ui-age");
const countEl = document.getElementById("ui-count");

function formatElapsed(birth) {
  const ms = Date.now() - birth;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}j ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`;
}

function updateUI() {
  if (!worldBirth) return;
  birthEl.textContent = "né le " + new Date(worldBirth).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC"
  });
  ageEl.textContent = formatElapsed(worldBirth);
  const living = [...localCreatures.values()].filter(c => !c.dead).length;
  countEl.textContent = living === 0 ? "— monde éteint —" : `${living} créature${living > 1 ? "s" : ""}`;
}

// ============================================================
// BOUCLE DE RENDU
// ============================================================
let lastUiUpdate = 0, lastFicheUpdate = 0;

function loop(timestamp) {
  ctx.fillStyle = "rgba(0, 0, 8, 0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  renderTick++;
  updateLocalCreatures();
  localCreatures.forEach(c => {
    if (c.dead && (c.deathGlow ?? 0) <= 0) return;
    drawCreature(c, renderTick);
  });

  if (timestamp - lastUiUpdate > 1000) { updateUI(); lastUiUpdate = timestamp; }
  if (timestamp - lastFicheUpdate > 150) { updateFiche(); lastFicheUpdate = timestamp; }

  requestAnimationFrame(loop);
}

// ============================================================
// DÉMARRAGE
// ============================================================
showOverlay("connexion au monde en cours…");
connect();
requestAnimationFrame(loop);
