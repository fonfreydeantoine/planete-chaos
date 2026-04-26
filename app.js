/* ============================================================
   PLANÈTE CHAOS — app.js v2 (client Netlify)
   Espèces, hybrides, prédation, affinités
   ============================================================ */

const SERVER_URL = "wss://planete-chaos-server-production.up.railway.app";

// ============================================================
// CANVAS
// ============================================================
const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener("resize", resize);

const SERVER_W = 1280, SERVER_H = 800;
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
let localCreatures = new Map();
let worldBirth = null;
let renderTick = 0;
let speciesCounts = {};

// Implosions en cours (animations de mort par prédation)
let implosions = [];

// ============================================================
// WEBSOCKET
// ============================================================
let ws = null;
let reconnectDelay = 2000;

function connect() {
  ws = new WebSocket(SERVER_URL);
  ws.addEventListener("open", () => { reconnectDelay = 2000; hideOverlay(); });
  ws.addEventListener("message", e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "snapshot") handleSnapshot(msg.data);
    } catch (err) { console.error(err); }
  });
  ws.addEventListener("close", () => {
    showOverlay("connexion perdue — reconnexion en cours…");
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
  });
  ws.addEventListener("error", () => {});
}

// ============================================================
// SNAPSHOT
// ============================================================
function handleSnapshot(data) {
  if (worldBirth === null) worldBirth = data.worldBirth;
  speciesCounts = data.speciesCounts ?? {};

  const incomingIds = new Set();

  data.creatures.forEach(c => {
    incomingIds.add(c.id);
    if (!localCreatures.has(c.id)) {
      localCreatures.set(c.id, {
        ...c, lx: c.x, ly: c.y, la: c.angle,
        deathGlow: c.dead ? 1.0 : null,
        implosionPhase: c.deathCause === "predation" ? 1.0 : null,
        limbOffset: Math.random() * Math.PI * 2,
      });
    } else {
      const local = localCreatures.get(c.id);
      // Détecter mort par prédation pour déclencher l'animation
      if (c.dead && !local.dead && c.deathCause === "predation") {
        implosions.push({
          x: local.lx, y: local.ly,
          hue: c.predatorHue ?? 0,
          size: scaleR(c.genes.size),
          phase: 1.0,
        });
      }
      Object.assign(local, c);
      if (c.dead && local.deathGlow === null) local.deathGlow = 1.0;
    }
  });

  for (const id of localCreatures.keys()) {
    if (!incomingIds.has(id)) { localCreatures.delete(id); }
  }
}

// ============================================================
// DESSIN D'UNE CRÉATURE
// ============================================================
function drawCreature(c, tick) {
  const g = c.genes;
  const cx = scaleX(c.lx), cy = scaleY(c.ly);
  const size = scaleR(g.size);
  const isDead = c.dead;
  const isPredation = isDead && c.deathCause === "predation";

  // Les morts par prédation sont gérés par l'implosion séparée
  if (isPredation) return;

  const alpha = isDead ? Math.max(0, c.deathGlow ?? 0) : 1;
  if (alpha <= 0) return;

  const hue = g.hue, sat = 70 + g.saturation * 20, lit = 55 + g.lightness * 15;
  const t = (tick + (c.limbOffset ?? 0)) * 0.04;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  // Appendices
  const phases = c.limbPhases ?? [];
  for (let i = 0; i < g.limbCount; i++) {
    const phase = phases[i] ?? (i / g.limbCount) * Math.PI * 2;
    const baseAngle = c.la + (i / g.limbCount) * Math.PI * 2;
    const wave = Math.sin(t * g.limbSpeed + phase) * 0.6;
    const limbAngle = baseAngle + wave;
    const limbLen = scaleR(g.limbLength);
    const limbW = Math.max(1, scaleR(g.size * 0.28));

    const x1 = Math.cos(limbAngle) * size * 0.8, y1 = Math.sin(limbAngle) * size * 0.8;
    const x2 = Math.cos(limbAngle) * (size * 0.8 + limbLen), y2 = Math.sin(limbAngle) * (size * 0.8 + limbLen);
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

  // Halo prédateur
  if (g.isPredator && !isDead) {
    const predGlow = ctx.createRadialGradient(0, 0, size * 0.8, 0, 0, size * 3);
    predGlow.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.08)`);
    predGlow.addColorStop(1, `hsla(${hue}, 100%, 40%, 0)`);
    ctx.beginPath();
    ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
    ctx.fillStyle = predGlow;
    ctx.fill();
  }

  // Halo standard
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
  if (!isDead) {
    const eyeDist = size * 0.42, eyeR = Math.max(1, size * 0.18);
    const ex = Math.cos(c.la) * eyeDist * 0.7, ey = Math.sin(c.la) * eyeDist * 0.7;
    const perpX = -Math.sin(c.la) * eyeDist * 0.38, perpY = Math.cos(c.la) * eyeDist * 0.38;
    [1, -1].forEach(side => {
      ctx.beginPath();
      ctx.arc(ex + perpX * side, ey + perpY * side, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + perpX * side + Math.cos(c.la) * eyeR * 0.3, ey + perpY * side + Math.sin(c.la) * eyeR * 0.3, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 15%, 0.9)`;
      ctx.fill();
    });
  }

  // Lueur de mort naturelle
  if (isDead && !isPredation && (c.deathGlow ?? 0) > 0) {
    const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.5);
    dg.addColorStop(0, `hsla(${hue}, 100%, 90%, ${c.deathGlow * 0.7})`);
    dg.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.beginPath();
    ctx.arc(0, 0, size * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = dg;
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// IMPLOSIONS (mort par prédation)
// ============================================================
function updateAndDrawImplosions() {
  implosions = implosions.filter(imp => imp.phase > 0);
  implosions.forEach(imp => {
    imp.phase -= 0.04;
    const p = imp.phase;
    const cx = scaleX(imp.x), cy = scaleY(imp.y);
    const currentSize = imp.size * (1 - (1 - p) * 0.85);
    const alpha = p;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    // Contraction lumineuse
    const blast = ctx.createRadialGradient(0, 0, 0, 0, 0, currentSize * 4);
    blast.addColorStop(0, `hsla(${imp.hue}, 100%, 95%, ${alpha * 0.9})`);
    blast.addColorStop(0.3, `hsla(${imp.hue}, 100%, 70%, ${alpha * 0.6})`);
    blast.addColorStop(1, `hsla(${imp.hue}, 100%, 50%, 0)`);
    ctx.beginPath();
    ctx.arc(0, 0, currentSize * 4, 0, Math.PI * 2);
    ctx.fillStyle = blast;
    ctx.fill();

    // Noyau brillant
    ctx.beginPath();
    ctx.arc(0, 0, currentSize, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${imp.hue}, 80%, 90%, ${alpha})`;
    ctx.fill();

    ctx.restore();
  });
}

// ============================================================
// INTERPOLATION
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

ficheClose.addEventListener("click", () => { ficheEl.classList.add("hidden"); selectedId = null; });

function getTraits(genes) {
  const t = [];
  if (genes.isPredator) t.push("prédatrice");
  if (genes.speed > 1.2) t.push("rapide"); else if (genes.speed < 0.4) t.push("lente");
  if (genes.size > 8) t.push("massive"); else if (genes.size < 2.5) t.push("minuscule");
  if (genes.metabolism < 0.6) t.push("économe"); else if (genes.metabolism > 1.5) t.push("vorace");
  if (genes.fertility > 1.6) t.push("prolifique");
  if ((genes.hybridDepth ?? 0) > 0) t.push(`hybride gen.${genes.hybridDepth}`);
  if (t.length === 0) t.push("équilibrée");
  return t;
}

function showFiche(c, mx, my) {
  selectedId = c.id;
  const g = c.genes;
  const hue = g.hue;
  const parentInfo = (g.parentSpecies?.length > 1)
    ? `<div class="fiche-row"><span class="fiche-label">parents</span><span>${g.parentSpecies.join(" × ")}</span></div>`
    : "";

  ficheContent.innerHTML = `
    <span class="fiche-name">
      <span class="fiche-dot" style="background:hsl(${hue},70%,60%);color:hsl(${hue},70%,60%)"></span>
      ${g.speciesName}
    </span>
    <div class="fiche-row"><span class="fiche-label">créature</span><span>n°${c.id}</span></div>
    ${parentInfo}
    <div class="fiche-row"><span class="fiche-label">âge</span><span id="f-age">${Math.floor(c.age / 60)} cycles</span></div>
    <div class="fiche-row"><span class="fiche-label">génération</span><span>${c.generation}</span></div>
    <div class="fiche-row"><span class="fiche-label">descendants</span><span id="f-desc">${c.descendants}</span></div>
    <div class="fiche-row"><span class="fiche-label">énergie</span><span id="f-energy">${Math.round(c.energy)} / ${Math.round(g.baseEnergy)}</span></div>
    <div class="fiche-traits">${getTraits(g).join(", ")}</div>
  `;

  const fw = 250, fh = 210;
  let fx = mx + 18, fy = my - fh / 2;
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

// ============================================================
// INTERACTION SOURIS
// ============================================================
function hitTest(c, mx, my) {
  return Math.hypot(mx - scaleX(c.lx), my - scaleY(c.ly)) < scaleR(c.genes.size) + 8;
}

canvas.addEventListener("mousemove", e => {
  const hit = [...localCreatures.values()].find(c => !c.dead && hitTest(c, e.clientX, e.clientY));
  document.body.classList.toggle("hovering", !!hit);
});

canvas.addEventListener("click", e => {
  const hit = [...localCreatures.values()].find(c => !c.dead && hitTest(c, e.clientX, e.clientY));
  if (hit) showFiche(hit, e.clientX, e.clientY);
  else { ficheEl.classList.add("hidden"); selectedId = null; }
});

// ============================================================
// OVERLAY
// ============================================================
function showOverlay(msg) {
  let el = document.getElementById("overlay");
  if (!el) { el = document.createElement("div"); el.id = "overlay"; document.body.appendChild(el); }
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
  const s = Math.floor((Date.now() - birth) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
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

  // Compteur par espèce
  const speciesEl = document.getElementById("ui-species");
  if (speciesEl && Object.keys(speciesCounts).length > 0) {
    const entries = Object.entries(speciesCounts)
      .filter(([sp, n]) => n >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    speciesEl.textContent = entries.map(([sp, n]) => `${sp} ${n}`).join("  ·  ");
  }
}

// ============================================================
// BOUCLE
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

  updateAndDrawImplosions();

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
