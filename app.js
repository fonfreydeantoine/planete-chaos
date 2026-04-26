/* ============================================================
   PLANÈTE CHAOS — app.js
   Simulation déterministe : seed fixe + temps écoulé
   Tout le monde voit la même chose au même moment
   ============================================================ */

// ============================================================
// DATE DE NAISSANCE DU MONDE
// Mettre ici la date du premier déploiement (ne plus jamais changer)
// ============================================================
const WORLD_BIRTH = new Date("2026-04-26T16:16:00Z").getTime();
const WORLD_SEED = "planete-chaos-v1";

// ============================================================
// RNG DÉTERMINISTE (Mulberry32 — rapide et de bonne qualité)
// ============================================================
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash d'une chaîne en entier 32 bits
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// RNG racine (pour l'initialisation)
const rootRng = mulberry32(hashStr(WORLD_SEED));

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

// ============================================================
// UTILITAIRES
// ============================================================
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}

// ============================================================
// COMPTEUR GLOBAL DE CRÉATURES (pour IDs uniques déterministes)
// ============================================================
let creatureCounter = 0;

// ============================================================
// CLASSE CREATURE
// ============================================================
class Creature {
  constructor(x, y, genes, generation, parentId, rngFn, birthTick) {
    this.id = ++creatureCounter;
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.generation = generation;
    this.parentId = parentId;
    this.birthTick = birthTick;
    this.age = 0;
    this.energy = genes.baseEnergy;
    this.angle = rngFn() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.descendants = 0;

    // Appendices : 2 à 4
    this.limbs = [];
    const limbCount = genes.limbCount;
    for (let i = 0; i < limbCount; i++) {
      this.limbs.push({
        baseAngle: (i / limbCount) * Math.PI * 2 + (rngFn() - 0.5) * 0.4,
        phase: rngFn() * Math.PI * 2,
        length: genes.limbLength * (0.8 + rngFn() * 0.4),
        width: genes.size * (0.25 + rngFn() * 0.15),
      });
    }

    // Yeux
    this.eyeAngle = rngFn() * Math.PI * 2;

    // État mort
    this.dead = false;
    this.deathTick = null;
    this.deathGlow = 1.0;
  }

  // Mise à jour déterministe via rng passé en paramètre
  update(tick, rngFn) {
    if (this.dead) {
      this.deathGlow -= 0.04;
      return null;
    }

    this.age++;
    this.energy -= 0.015 * this.genes.metabolism;

    // Mouvement : changement de direction progressif
    if (tick % 30 === this.id % 30) {
      this.targetAngle += (rngFn() - 0.5) * this.genes.instability * 2;
    }
    this.angle = lerpAngle(this.angle, this.targetAngle, 0.05);

    this.x += Math.cos(this.angle) * this.genes.speed;
    this.y += Math.sin(this.angle) * this.genes.speed;

    // Rebonds doux
    const W = canvas.width, H = canvas.height;
    const margin = 40;
    if (this.x < margin) this.targetAngle = (rngFn() * 0.5) * Math.PI * 2 * 0;
    if (this.x > W - margin) this.targetAngle = Math.PI + (rngFn() - 0.5) * 0.5;
    if (this.y < margin) this.targetAngle = Math.PI / 2 + (rngFn() - 0.5) * 0.5;
    if (this.y > H - margin) this.targetAngle = -Math.PI / 2 + (rngFn() - 0.5) * 0.5;

    this.x = clamp(this.x, 2, W - 2);
    this.y = clamp(this.y, 2, H - 2);

    // Mort naturelle
    if (this.energy <= 0 || this.age > this.genes.maxAge) {
      this.die(tick);
      return null;
    }

    // Reproduction
    if (
      this.energy > this.genes.reproThreshold &&
      this.age > 60 &&
      rngFn() < 0.0015 * this.genes.fertility
    ) {
      this.energy *= 0.55;
      this.descendants++;
      const childGenes = mutateGenes(this.genes, rngFn);
      return new Creature(this.x, this.y, childGenes, this.generation + 1, this.id, rngFn, tick);
    }

    return null;
  }

  die(tick) {
    this.dead = true;
    this.deathTick = tick;
    this.deathGlow = 1.0;
  }

  draw(tick) {
    const g = this.genes;
    const alpha = this.dead ? Math.max(0, this.deathGlow) : 1;
    if (alpha <= 0) return;

    const hue = g.hue;
    const sat = 70 + g.saturation * 20;
    const lit = 55 + g.lightness * 15;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    // Appendices (dessinés derrière le corps)
    const t = tick * 0.04;
    this.limbs.forEach((limb, i) => {
      const wave = Math.sin(t * g.limbSpeed + limb.phase) * 0.6;
      const limbAngle = this.angle + limb.baseAngle + wave;

      // Segment principal
      const x1 = Math.cos(limbAngle) * g.size * 0.8;
      const y1 = Math.sin(limbAngle) * g.size * 0.8;
      const x2 = Math.cos(limbAngle) * (g.size * 0.8 + limb.length);
      const y2 = Math.sin(limbAngle) * (g.size * 0.8 + limb.length);

      // Ondulation en courbe de Bézier
      const midX = (x1 + x2) / 2 + Math.cos(limbAngle + Math.PI / 2) * limb.length * 0.35 * Math.sin(t * g.limbSpeed + limb.phase + 1);
      const midY = (y1 + y2) / 2 + Math.sin(limbAngle + Math.PI / 2) * limb.length * 0.35 * Math.sin(t * g.limbSpeed + limb.phase + 1);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(midX, midY, x2, y2);
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit + 10}%, ${0.55 * alpha})`;
      ctx.lineWidth = limb.width;
      ctx.lineCap = "round";
      ctx.stroke();

      // Extrémité légèrement plus lumineuse
      ctx.beginPath();
      ctx.arc(x2, y2, limb.width * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit + 20}%, ${0.4 * alpha})`;
      ctx.fill();
    });

    // Halo externe
    const glow = ctx.createRadialGradient(0, 0, g.size * 0.5, 0, 0, g.size * 2.2);
    glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${lit + 20}%, ${0.15 * alpha})`);
    glow.addColorStop(1, `hsla(${hue}, ${sat}%, ${lit}%, 0)`);
    ctx.beginPath();
    ctx.arc(0, 0, g.size * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Corps principal
    const bodyGrad = ctx.createRadialGradient(-g.size * 0.25, -g.size * 0.25, 0, 0, 0, g.size);
    bodyGrad.addColorStop(0, `hsla(${hue}, ${sat - 10}%, ${lit + 25}%, ${0.95 * alpha})`);
    bodyGrad.addColorStop(0.6, `hsla(${hue}, ${sat}%, ${lit}%, ${0.9 * alpha})`);
    bodyGrad.addColorStop(1, `hsla(${hue}, ${sat + 10}%, ${lit - 10}%, ${0.7 * alpha})`);

    ctx.beginPath();
    ctx.arc(0, 0, g.size, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Yeux (deux petits points)
    if (!this.dead) {
      const eyeDist = g.size * 0.42;
      const eyeR = g.size * 0.18;
      const ex = Math.cos(this.angle) * eyeDist * 0.7;
      const ey = Math.sin(this.angle) * eyeDist * 0.7;
      const perpX = -Math.sin(this.angle) * eyeDist * 0.38;
      const perpY = Math.cos(this.angle) * eyeDist * 0.38;

      [1, -1].forEach(side => {
        ctx.beginPath();
        ctx.arc(ex + perpX * side, ey + perpY * side, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fill();

        // Pupille
        ctx.beginPath();
        ctx.arc(ex + perpX * side + Math.cos(this.angle) * eyeR * 0.3, ey + perpY * side + Math.sin(this.angle) * eyeR * 0.3, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 15%, 0.9)`;
        ctx.fill();
      });
    }

    // Lueur de mort
    if (this.dead) {
      const deathGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.size * 3);
      deathGrad.addColorStop(0, `hsla(${hue}, 100%, 90%, ${this.deathGlow * 0.6})`);
      deathGrad.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      ctx.beginPath();
      ctx.arc(0, 0, g.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = deathGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // Retourne true si le point (px, py) est sur la créature
  hitTest(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.genes.size + 6;
  }

  // Traits dominants lisibles
  getTraits() {
    const traits = [];
    if (this.genes.speed > 1.2) traits.push("rapide");
    if (this.genes.speed < 0.5) traits.push("lente");
    if (this.genes.size > 7) traits.push("massive");
    if (this.genes.size < 3) traits.push("minuscule");
    if (this.genes.metabolism < 0.7) traits.push("économe");
    if (this.genes.metabolism > 1.4) traits.push("vorace");
    if (this.genes.fertility > 1.4) traits.push("prolifique");
    if (this.genes.limbCount === 4) traits.push("quatre membres");
    if (this.genes.limbCount === 2) traits.push("deux membres");
    if (traits.length === 0) traits.push("équilibrée");
    return traits;
  }
}

// ============================================================
// GÈNES
// ============================================================
function randomGenes(rngFn) {
  return {
    size: 2.5 + rngFn() * 5,
    speed: 0.25 + rngFn() * 1.2,
    instability: 0.05 + rngFn() * 0.35,
    metabolism: 0.6 + rngFn() * 0.9,
    reproThreshold: 70 + rngFn() * 50,
    baseEnergy: 60 + rngFn() * 50,
    maxAge: 1200 + rngFn() * 2000,
    fertility: 0.6 + rngFn() * 1.2,
    hue: rngFn() * 360,
    saturation: rngFn(),
    lightness: rngFn(),
    limbCount: Math.floor(2 + rngFn() * 3), // 2, 3 ou 4
    limbLength: 6 + rngFn() * 18,
    limbSpeed: 0.6 + rngFn() * 1.4,
  };
}

function mutateGenes(g, rngFn) {
  const m = (base, delta, min, max) => clamp(base + (rngFn() - 0.5) * delta * 2, min, max);
  return {
    size: m(g.size, 0.6, 1.5, 12),
    speed: m(g.speed, 0.15, 0.15, 2.2),
    instability: m(g.instability, 0.04, 0, 0.6),
    metabolism: m(g.metabolism, 0.12, 0.3, 2.2),
    reproThreshold: m(g.reproThreshold, 12, 50, 160),
    baseEnergy: m(g.baseEnergy, 8, 40, 130),
    maxAge: m(g.maxAge, 200, 600, 4000),
    fertility: m(g.fertility, 0.2, 0.2, 2.5),
    hue: (g.hue + (rngFn() - 0.5) * 30 + 360) % 360,
    saturation: clamp(g.saturation + (rngFn() - 0.5) * 0.15, 0, 1),
    lightness: clamp(g.lightness + (rngFn() - 0.5) * 0.15, 0, 1),
    limbCount: Math.random() < 0.05 ? clamp(g.limbCount + (Math.random() < 0.5 ? 1 : -1), 2, 4) : g.limbCount,
    limbLength: m(g.limbLength, 3, 4, 30),
    limbSpeed: m(g.limbSpeed, 0.2, 0.3, 2.5),
  };
}

// ============================================================
// SIMULATION PRINCIPALE
// ============================================================
let creatures = [];
let tick = 0;

// Pool RNG de simulation (déterministe par tick)
// On crée un seul RNG enchaîné pour toute la simulation
let simRng = mulberry32(hashStr(WORLD_SEED + "-sim"));

function stepSimulation(fast = false) {
  tick++;
  const newBorns = [];

  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    const baby = c.update(tick, simRng);
    if (baby !== null) {
      newBorns.push(baby);
      // Incrémenter descendants du parent
      const parent = creatures.find(p => p.id === baby.parentId);
      // (déjà incrémenté dans update)
    }
    if (c.dead && c.deathGlow <= 0) {
      creatures.splice(i, 1);
    }
  }

  creatures.push(...newBorns);

  // Régulation : si trop de créatures, les plus âgées meurent en premier
  if (creatures.length > 280) {
    const living = creatures.filter(c => !c.dead);
    living.sort((a, b) => b.age - a.age);
    const toKill = living.slice(0, Math.floor(living.length * 0.15));
    toKill.forEach(c => c.die(tick));
  }
}

// ============================================================
// INITIALISATION DU MONDE
// ============================================================
function initWorld() {
  creatureCounter = 0;
  simRng = mulberry32(hashStr(WORLD_SEED + "-sim"));

  const initRng = mulberry32(hashStr(WORLD_SEED + "-init"));
  const W = canvas.width;
  const H = canvas.height;

  const initCount = 25 + Math.floor(initRng() * 15);

  for (let i = 0; i < initCount; i++) {
    const x = 60 + initRng() * (W - 120);
    const y = 60 + initRng() * (H - 120);
    const genes = randomGenes(initRng);
    creatures.push(new Creature(x, y, genes, 0, null, initRng, 0));
  }

  // Replay accéléré : reconstituer l'état actuel
  const elapsed = Math.floor((Date.now() - WORLD_BIRTH) / 1000);
  const replaySteps = Math.min(elapsed, 8000); // max 8000 ticks de replay

  console.log(`Replay de ${replaySteps} ticks (${elapsed}s écoulées depuis la naissance)`);

  for (let i = 0; i < replaySteps; i++) {
    stepSimulation(true);
  }

  console.log(`Monde initialisé : ${creatures.filter(c => !c.dead).length} créatures vivantes`);
}

// ============================================================
// FICHE CRÉATURE
// ============================================================
const ficheEl = document.getElementById("fiche");
const ficheContent = document.getElementById("fiche-content");
const ficheClose = document.getElementById("fiche-close");
let selectedCreature = null;

ficheClose.addEventListener("click", () => {
  ficheEl.classList.add("hidden");
  selectedCreature = null;
});

function showFiche(creature, mx, my) {
  selectedCreature = creature;

  const hue = creature.genes.hue;
  const ageDays = Math.floor(creature.age / 60);
  const traits = creature.getTraits().join(", ");

  ficheContent.innerHTML = `
    <span class="fiche-name">
      <span class="fiche-dot" style="background: hsl(${hue}, 70%, 60%); color: hsl(${hue}, 70%, 60%)"></span>
      Créature #${creature.id}
    </span>
    <div class="fiche-row"><span class="fiche-label">âge</span><span>${ageDays} cycles</span></div>
    <div class="fiche-row"><span class="fiche-label">génération</span><span>${creature.generation}</span></div>
    <div class="fiche-row"><span class="fiche-label">descendants</span><span>${creature.descendants}</span></div>
    <div class="fiche-row"><span class="fiche-label">énergie</span><span>${Math.round(creature.energy)} / ${Math.round(creature.genes.baseEnergy)}</span></div>
    <div class="fiche-traits">${traits}</div>
  `;

  // Positionner la bulle près du clic, en évitant les bords
  const fw = 240, fh = 180;
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
  if (!selectedCreature) return;
  if (selectedCreature.dead) {
    ficheEl.classList.add("hidden");
    selectedCreature = null;
    return;
  }
  const ageDays = Math.floor(selectedCreature.age / 60);
  const rows = ficheContent.querySelectorAll(".fiche-row span:last-child");
  if (rows.length >= 4) {
    rows[0].textContent = ageDays + " cycles";
    rows[2].textContent = selectedCreature.descendants;
    rows[3].textContent = Math.round(selectedCreature.energy) + " / " + Math.round(selectedCreature.genes.baseEnergy);
  }
}

// ============================================================
// INTERACTION SOURIS
// ============================================================
canvas.addEventListener("mousemove", (e) => {
  const mx = e.clientX, my = e.clientY;
  const hit = creatures.find(c => !c.dead && c.hitTest(mx, my));
  document.body.classList.toggle("hovering", !!hit);
});

canvas.addEventListener("click", (e) => {
  const mx = e.clientX, my = e.clientY;
  const hit = creatures.find(c => !c.dead && c.hitTest(mx, my));
  if (hit) {
    showFiche(hit, mx, my);
  } else {
    ficheEl.classList.add("hidden");
    selectedCreature = null;
  }
});

// ============================================================
// UI — HORLOGE ET STATS
// ============================================================
const birthEl = document.getElementById("ui-birthdate");
const ageEl = document.getElementById("ui-age");
const countEl = document.getElementById("ui-count");

function formatBirthDate() {
  const d = new Date(WORLD_BIRTH);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    timeZone: "UTC"
  });
}

function formatElapsed() {
  const ms = Date.now() - WORLD_BIRTH;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${days}j ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

birthEl.textContent = "né le " + formatBirthDate();

function updateUI() {
  ageEl.textContent = formatElapsed();
  const living = creatures.filter(c => !c.dead).length;
  countEl.textContent = living === 0
    ? "— monde éteint —"
    : `${living} créature${living > 1 ? "s" : ""}`;
}

// ============================================================
// BOUCLE DE RENDU
// ============================================================
let lastUiUpdate = 0;
let lastFicheUpdate = 0;

function loop(timestamp) {
  // Fond avec traîne légère
  ctx.fillStyle = "rgba(0, 0, 8, 0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Simuler un pas
  stepSimulation();

  // Dessiner toutes les créatures
  creatures.forEach(c => c.draw(tick));

  // Mise à jour UI (1 fois par seconde)
  if (timestamp - lastUiUpdate > 1000) {
    updateUI();
    lastUiUpdate = timestamp;
  }

  // Mise à jour fiche (10 fois par seconde)
  if (timestamp - lastFicheUpdate > 100) {
    updateFiche();
    lastFicheUpdate = timestamp;
  }

  requestAnimationFrame(loop);
}

// ============================================================
// DÉMARRAGE
// ============================================================
initWorld();
requestAnimationFrame(loop);
