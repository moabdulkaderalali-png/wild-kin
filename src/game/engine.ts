// Spiel-Engine: Welt-Simulation, Tier-KI, Kampf, Kamera, Rendering.
import {
  ANIMALS,
  KMH,
  speciesById,
  type AnimalDef,
  type AttackDef,
} from "./animals";
import { drawCreature, type Pose } from "./draw";
import { drawTerrain, drawProp } from "./scene";
import { setAmbient, sfx } from "./audio";
import { loadSave, writeSave, type SaveData } from "./save";
import {
  BIOME_LABEL,
  CHUNK,
  chunkKey,
  generateProps,
  isCanopy,
  sample,
  SPAWN_TABLE,
  WORLD_SIZE,
  type Prop,
} from "./world";

export type Dot = { label: string; dps: number; until: number; source: string };

export type Ent = {
  id: number;
  def: AnimalDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  hunger: number;
  phase: number;
  speed01: number;
  state: "wander" | "food" | "drink" | "rest" | "flee" | "chase" | "attack";
  stateUntil: number;
  targetId: number | null;
  targetProp: Prop | null;
  atkReady: number;
  specialReady: number;
  attack: { def: AttackDef; t: number; dur: number; hit: boolean } | null;
  hurt: number;
  dots: Dot[];
  dead: boolean;
  deadAt: number;
  invisibleUntil: number;
  curlUntil: number;
  boostUntil: number;
  boostPow: number;
  ambush: boolean;
  jumpUntil: number;
  jumpDur: number;
  tongueUntil: number;
  restUntil: number;
  wander: number;
  coinsFarmed: number;
  bountyPaid: boolean;
  isPlayer: boolean;
  chunk: string;
  lastSound: number;
  lastStep: number;
  engagedUntil: number;
  lastCombatAt: number; // Heilung erst 10 s nach dem letzten Kampfkontakt
  peaceful: boolean; // greift nur an, wenn es selbst angegriffen wurde
  skeleton: boolean;
  stamina: number; // 0..1
  sprinting: boolean;
  gripId: number | null; // hält dieses Ziel fest (Umschlingen/Todesrolle/Rückensprung)
  gripUntil: number;
  gripDps: number;
  gripMode: "constrict" | "carry" | "pounce" | null;
  heldUntil: number; // wird gerade festgehalten
  rollUntil: number;
};

type Critter = {
  kind: "fish" | "insect";
  x: number;
  y: number;
  a: number;
  sp: number;
  seed: number;
  hp: number;
  maxHp: number;
  size: number; // Körperlänge in px
  species: string;
};

const FISH_KINDS = [
  { name: "Elritze", hp: 10, size: 6, c1: "#9fb8c4", c2: "#6d8494" },
  { name: "Rotauge", hp: 25, size: 9, c1: "#b9c6cc", c2: "#a04a3a" },
  { name: "Barsch", hp: 40, size: 12, c1: "#7f9c52", c2: "#3f4f26" },
  { name: "Forelle", hp: 60, size: 15, c1: "#8fa6b5", c2: "#c1723f" },
  { name: "Karpfen", hp: 80, size: 19, c1: "#c2a15c", c2: "#7a5c2a" },
  { name: "Wels", hp: 100, size: 24, c1: "#6b6357", c2: "#3a352d" },
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

export type Hud = {
  coins: number;
  hp: number;
  maxHp: number;
  animal: string;
  animalId: string;
  biome: string;
  attackName: string;
  attackReady: number;
  specialName: string;
  specialReady: number;
  specialTotal: number;
  timeLabel: string;
  weather: string;
  owned: string[];
  target: { name: string; hp: number; max: number } | null;
  dead: boolean;
  stats: SaveData["stats"];
  poison: string | null;
  attackCount: number;
  attackIndex: number;
  stamina: number;
  hunger: number;
  sprinting: boolean;
};

const DAY_LENGTH = 300; // s pro Tag
const VIEW_W = 430;

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Großes Tier? Große Fleischfresser jagen nur solche Beute. */
function isBig(d: { hp: number; scale: number }) {
  return d.hp >= 300 || d.scale >= 1.3;
}
/** Jagt aktiv von sich aus (nur große Fleischfresser). */
function isHunter(d: { hp: number; scale: number; diet: string }) {
  return d.diet === "carnivore" && isBig(d);
}

function power(e: Ent) {
  const dmg = Math.max(...e.def.attacks.map((a) => a.damage));
  return e.maxHp * 0.5 + dmg * 6 + e.def.speed;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private time = 90; // Start am Vormittag
  private tick = 0;
  private dpr = 1;
  private zoom = 1;
  private cssW = 390;
  private cssH = 780;

  save: SaveData;
  player!: Ent;
  private ents: Ent[] = [];
  private critters: Critter[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private chunks = new Map<string, Prop[]>();
  private camX = 0;
  private camY = 0;
  private nextId = 1;
  private move = { x: 0, y: 0 };
  private attackIndex = 0;
  private weather: "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow" = "clear";
  private weatherUntil = 40;
  private autosave = 0;
  private onHud: (h: Hud) => void;
  private hudTimer = 0;
  private targetId: number | null = null;

  constructor(canvas: HTMLCanvasElement, onHud: (h: Hud) => void) {
    this.canvas = canvas;
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("Canvas 2D nicht verfügbar");
    this.ctx = c;
    this.onHud = onHud;
    this.save = loadSave();
    this.spawnPlayer(this.save.current);
    this.resize();
  }

  // ---------- Setup ----------
  private startPosition(): { x: number; y: number } {
    let x = WORLD_SIZE * 0.5;
    let y = WORLD_SIZE * 0.5;
    for (let i = 0; i < 4000; i++) {
      const s = sample(x, y);
      if (!s.water && s.biome !== "mountain") return { x, y };
      x += 137;
      y += 91;
      if (x > WORLD_SIZE * 0.9) x = WORLD_SIZE * 0.2;
      if (y > WORLD_SIZE * 0.9) y = WORLD_SIZE * 0.2;
    }
    return { x, y };
  }

  private makeEnt(def: AnimalDef, x: number, y: number, isPlayer = false): Ent {
    return {
      id: this.nextId++,
      def,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      hp: def.hp,
      maxHp: def.hp,
      hunger: Math.random() * 0.4,
      phase: Math.random() * 6,
      speed01: 0,
      state: "wander",
      stateUntil: 0,
      targetId: null,
      targetProp: null,
      atkReady: 0,
      specialReady: 0,
      attack: null,
      hurt: 0,
      dots: [],
      dead: false,
      deadAt: 0,
      invisibleUntil: 0,
      curlUntil: 0,
      boostUntil: 0,
      boostPow: 1,
      ambush: false,
      jumpUntil: 0,
      jumpDur: 0.45,
      tongueUntil: 0,
      restUntil: 0,
      wander: Math.random() * Math.PI * 2,
      coinsFarmed: 0,
      bountyPaid: false,
      isPlayer,
      chunk: "",
      lastSound: 0,
      lastStep: 0,
      engagedUntil: 0,
      lastCombatAt: -Infinity,
      peaceful: !isPlayer && !isHunter(def),
      skeleton: false,
      stamina: 1,
      sprinting: false,
      gripId: null,
      gripUntil: 0,
      gripDps: 0,
      gripMode: null,
      heldUntil: 0,
      rollUntil: 0,
    };
  }

  spawnPlayer(id: string) {
    const def = speciesById(id) ?? speciesById("mouse");
    const pos = this.player
      ? { x: this.player.x, y: this.player.y }
      : this.startPosition();
    this.player = this.makeEnt(def, pos.x, pos.y, true);
    this.camX = pos.x;
    this.camY = pos.y;
    this.attackIndex = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width || 390;
    this.cssH = rect.height || 780;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.zoom = this.cssW / VIEW_W;
  }

  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.persist(true);
  }

  persist(force = false) {
    writeSave(this.save, force);
  }

  // ---------- Eingabe ----------
  setMove(x: number, y: number) {
    this.move.x = x;
    this.move.y = y;
  }

  setSprint(on: boolean) {
    this.player.sprinting = on;
  }

  cycleAttack() {
    this.attackIndex = (this.attackIndex + 1) % this.player.def.attacks.length;
  }

  pressAttack() {
    const p = this.player;
    if (p.dead) return;
    const a = p.def.attacks[this.attackIndex % p.def.attacks.length];
    if (!a || this.time < p.atkReady || p.attack) return;
    const frenzy = p.boostUntil > this.time && p.def.special.kind === "frenzy" ? 0.6 : 1;
    p.attack = { def: a, t: 0, dur: 0.34, hit: false };
    p.atkReady = this.time + a.cooldown * frenzy;
    if (a.anim === "bite") sfx.bite();
    else if (a.anim === "paw") sfx.paw();
    else sfx.horn();
  }

  pressSpecial() {
    const p = this.player;
    if (p.dead || this.time < p.specialReady) return;
    const sp = p.def.special;
    p.specialReady = this.time + sp.cooldown;
    sfx.special();
    this.applySpecial(p, true);
  }

  private applySpecial(e: Ent, isPlayer: boolean) {
    const sp = e.def.special;
    switch (sp.kind) {
      case "leap":
        e.jumpUntil = this.time + sp.duration;
        e.jumpDur = sp.duration;
        e.vx = Math.cos(e.angle) * (sp.power ?? 250);
        e.vy = Math.sin(e.angle) * (sp.power ?? 250);
        sfx.jump();
        break;
      case "invisible":
        e.invisibleUntil = this.time + sp.duration;
        break;
      case "curl":
        e.curlUntil = this.time + sp.duration;
        break;
      case "boost":
      case "frenzy":
        e.boostUntil = this.time + sp.duration;
        e.boostPow = sp.power ?? 1.5;
        break;
      case "ambush":
        e.invisibleUntil = this.time + sp.duration;
        e.ambush = true;
        break;
      case "tongue":
        e.tongueUntil = this.time + 0.6;
        this.tongueGrab(e);
        break;
      case "pounce": {
        const t = this.nearestFoe(e, 220);
        e.jumpUntil = this.time + 0.4;
        e.jumpDur = 0.4;
        if (t) {
          const a = Math.atan2(t.y - e.y, t.x - e.x);
          e.angle = a;
          e.vx = Math.cos(a) * 320;
          e.vy = Math.sin(a) * 320;
          this.startGrip(e, t, sp.power ?? 5, sp.duration, "pounce");
        } else {
          e.vx = Math.cos(e.angle) * 320;
          e.vy = Math.sin(e.angle) * 320;
        }
        sfx.jump();
        break;
      }
      case "constrict": {
        const t = this.nearestFoe(e, 90);
        if (t) this.startGrip(e, t, sp.power ?? 25, sp.duration, "constrict");
        break;
      }
      case "carry": {
        const t = this.nearestFoe(e, 100);
        if (t) this.startGrip(e, t, sp.power ?? 30, sp.duration, "carry");
        break;
      }
      case "spin":
        e.attack = {
          def: { ...e.def.attacks[1]!, arc: Math.PI, range: 46 },
          t: 0,
          dur: sp.duration,
          hit: false,
        };
        break;
      default:
        break;
    }
    if (isPlayer) this.floats.push({ x: e.x, y: e.y - 30, text: sp.name, life: 1, color: "#8fd6ff" });
  }

  private tongueGrab(e: Ent) {
    const reach = 150;
    for (const c of this.critters) {
      if (c.kind !== "insect") continue;
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      if (d < reach) {
        const a = Math.atan2(c.y - e.y, c.x - e.x);
        if (Math.abs(this.angDiff(a, e.angle)) < 0.6) {
          c.x = e.x;
          c.y = e.y;
          if (e.isPlayer) {
            this.addCoins(2, e.x, e.y);
            e.hunger = Math.max(0, e.hunger - 0.3);
          }
        }
      }
    }
  }

  private angDiff(a: number, b: number) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  private nearestFoe(e: Ent, range: number): Ent | null {
    let best: Ent | null = null;
    let bd = range * range;
    const list = e.isPlayer ? this.ents : [this.player, ...this.ents];
    for (const t of list) {
      if (t === e || t.dead) continue;
      const d = dist2(e.x, e.y, t.x, t.y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private startGrip(
    e: Ent,
    t: Ent,
    dps: number,
    dur: number,
    mode: "constrict" | "carry" | "pounce",
  ) {
    e.gripId = t.id;
    e.gripUntil = this.time + dur;
    e.gripDps = dps;
    e.gripMode = mode;
    t.heldUntil = mode === "pounce" ? 0 : this.time + dur;
    t.engagedUntil = this.time + dur + 4;
    if (!t.isPlayer) t.targetId = e.id;
    if (e.isPlayer) this.targetId = t.id;
  }

  private updateGrip(e: Ent, dt: number) {
    if (!e.gripId || this.time > e.gripUntil) {
      if (e.gripId && this.time > e.gripUntil) {
        e.gripId = null;
        e.gripMode = null;
      }
      return;
    }
    const t = this.entById(e.gripId);
    if (!t || t.dead) {
      e.gripId = null;
      e.gripMode = null;
      return;
    }
    if (dist2(e.x, e.y, t.x, t.y) > 160 * 160) {
      e.gripId = null;
      e.gripMode = null;
      return;
    }
    this.damage(t, e.gripDps * dt, e, null);
    if (e.gripMode === "pounce") {
      // reitet auf dem Rücken – bleibt dran
      t.hurt = Math.max(t.hurt, 0.4);
      const a = Math.atan2(t.y - e.y, t.x - e.x);
      e.x += Math.cos(a) * 60 * dt;
      e.y += Math.sin(a) * 60 * dt;
    } else {
      t.heldUntil = Math.max(t.heldUntil, this.time + 0.2);
      t.x += (e.x - t.x) * Math.min(1, dt * 6);
      t.y += (e.y - t.y) * Math.min(1, dt * 6);
      if (e.gripMode === "carry") {
        // Beute steckt im Maul und wird mitgeschleppt
        const mx = e.x + Math.cos(e.angle) * e.def.body.len * 0.55 * e.def.scale;
        const my = e.y + Math.sin(e.angle) * e.def.body.len * 0.55 * e.def.scale;
        t.x += (mx - t.x) * Math.min(1, dt * 10);
        t.y += (my - t.y) * Math.min(1, dt * 10);
        t.angle = e.angle;
      }
    }
  }

  private waterDirection(x: number, y: number): number | null {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      if (sample(x + Math.cos(ang) * 160, y + Math.sin(ang) * 160).water) return ang;
    }
    return null;
  }

  private entById(id: number): Ent | null {
    if (this.player.id === id) return this.player;
    return this.ents.find((e) => e.id === id) ?? null;
  }

  // ---------- Shop ----------
  buy(id: string): boolean {
    const def = ANIMALS.find((a) => a.id === id);
    if (!def || this.save.owned.includes(id)) return false;
    if (this.save.coins < def.price) return false;
    this.save.coins -= def.price;
    this.save.owned.push(id);
    sfx.buy();
    this.persist(true);
    return true;
  }

  select(id: string): boolean {
    if (!this.save.owned.includes(id)) return false;
    this.save.current = id;
    this.spawnPlayer(id);
    this.persist(true);
    return true;
  }

  respawn() {
    this.spawnPlayer(this.save.current);
    this.save.stats.deaths += 1;
    this.persist(true);
  }

  private addCoins(n: number, x: number, y: number) {
    const v = Math.round(n);
    if (v <= 0) return;
    this.save.coins += v;
    this.save.stats.coinsEarned += v;
    this.floats.push({ x, y: y - 24, text: `+${v} Coins`, life: 1.1, color: "#ffd66b" });
    sfx.coin();
  }

  // ---------- Welt-Streaming ----------
  private ensureChunks() {
    const pcx = Math.floor(this.player.x / CHUNK);
    const pcy = Math.floor(this.player.y / CHUNK);
    const R = 2;
    const keep = new Set<string>();
    for (let cy = pcy - R; cy <= pcy + R; cy++) {
      for (let cx = pcx - R; cx <= pcx + R; cx++) {
        const k = chunkKey(cx, cy);
        keep.add(k);
        if (!this.chunks.has(k)) {
          this.chunks.set(k, generateProps(cx, cy));
          this.spawnChunkLife(cx, cy);
        }
      }
    }
    for (const k of [...this.chunks.keys()]) if (!keep.has(k)) this.chunks.delete(k);
    // NPCs weit weg entfernen
    const maxD = CHUNK * 4;
    this.ents = this.ents.filter(
      (e) => Math.abs(e.x - this.player.x) < maxD && Math.abs(e.y - this.player.y) < maxD,
    );
    this.critters = this.critters.filter(
      (c) => Math.abs(c.x - this.player.x) < maxD && Math.abs(c.y - this.player.y) < maxD,
    );
  }

  private spawnChunkLife(cx: number, cy: number) {
    if (this.ents.length > 46) return;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const x = cx * CHUNK + Math.random() * CHUNK;
      const y = cy * CHUNK + Math.random() * CHUNK;
      const s = sample(x, y);
      // nicht direkt vor dem Spieler spawnen
      if (dist2(x, y, this.player.x, this.player.y) < 300 * 300) continue;
      if (s.water) {
        for (let f = 0; f < 5; f++) {
          const k = FISH_KINDS[Math.floor(Math.random() * FISH_KINDS.length)]!;
          this.critters.push({
            kind: "fish",
            x: x + Math.random() * 60,
            y: y + Math.random() * 60,
            a: Math.random() * 6,
            sp: 20 + Math.random() * 40,
            seed: Math.random(),
            hp: k.hp,
            maxHp: k.hp,
            size: k.size,
            species: k.name,
          });
        }
        continue;
      }
      const table = SPAWN_TABLE[s.biome];
      if (!table || table.length === 0) continue;
      const id = table[Math.floor(Math.random() * table.length)];
      if (!id) continue;
      const def = speciesById(id);
      if (!def) continue;
      this.ents.push(this.makeEnt(def, x, y));
      // Insekten bevorzugt an Büschen und Ufern
      const bushes = (this.chunks.get(chunkKey(cx, cy)) ?? []).filter(
        (pr) => pr.type === "bush" || pr.type === "berryBush" || pr.type === "reed" || pr.type === "flower",
      );
      const spot = bushes[Math.floor(Math.random() * bushes.length)];
      for (let k = 0; k < 3; k++) {
        const ix = spot ? spot.x + (Math.random() - 0.5) * 50 : x + 40;
        const iy = spot ? spot.y + (Math.random() - 0.5) * 50 : y + 40;
        this.critters.push({
          kind: "insect",
          x: ix,
          y: iy,
          a: Math.random() * 6,
          sp: 25 + Math.random() * 30,
          seed: Math.random(),
          hp: 1,
          maxHp: 1,
          size: 2,
          species: "Insekt",
        });
      }
    }
  }

  private propsNear(x: number, y: number): Prop[] {
    const out: Prop[] = [];
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const list = this.chunks.get(chunkKey(cx + i, cy + j));
        if (list) out.push(...list);
      }
    return out;
  }

  // ---------- Simulation ----------
  private update(dt: number) {
    this.time += dt;
    this.tick++;
    this.save.stats.playtime += dt;
    this.ensureChunks();
    this.updateWeather();

    this.updatePlayer(dt);
    for (const e of this.ents) this.updateNpc(e, dt);
    for (const e of this.ents)
      if (e.dead && !e.skeleton && this.time - e.deadAt > 30) e.skeleton = true;
    this.ents = this.ents.filter((e) => !(e.dead && this.time - e.deadAt > 150));

    for (const c of this.critters) this.updateCritter(c, dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.life -= dt;
      f.y -= dt * 22;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    // Kamera weich folgen
    const k = 1 - Math.pow(0.001, dt);
    this.camX += (this.player.x - this.camX) * k;
    this.camY += (this.player.y - this.camY) * k;

    // Biom entdecken + Ambiente
    const s = sample(this.player.x, this.player.y);
    if (!this.save.discovered.includes(s.biome)) {
      this.save.discovered.push(s.biome);
      this.floats.push({
        x: this.player.x,
        y: this.player.y - 40,
        text: `Entdeckt: ${BIOME_LABEL[s.biome]}`,
        life: 2.4,
        color: "#c9f0a1",
      });
      this.persist(true);
    }
    if (this.tick % 30 === 0) setAmbient(s.biome);

    this.autosave += dt;
    if (this.autosave > 10) {
      this.autosave = 0;
      this.persist();
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.onHud(this.buildHud(s.biome));
    }
  }

  private updateWeather() {
    if (this.time < this.weatherUntil) return;
    this.weatherUntil = this.time + 40 + Math.random() * 60;
    const s = sample(this.player.x, this.player.y);
    const cold = s.biome === "snow" || s.biome === "ice";
    const dry = s.biome === "desert";
    const r = Math.random();
    if (cold) this.weather = r < 0.5 ? "snow" : r < 0.75 ? "cloudy" : "clear";
    else if (dry) this.weather = r < 0.7 ? "clear" : "cloudy";
    else this.weather = r < 0.4 ? "clear" : r < 0.6 ? "cloudy" : r < 0.8 ? "rain" : r < 0.9 ? "fog" : "storm";
  }

  private speedOf(e: Ent, inWater: boolean): number {
    let base = e.def.speed;
    if (inWater) {
      // Grundregel: im Wasser 5 km/h – außer echten Schwimmern
      base = e.def.fastSwimmer ? (e.def.swim ?? e.def.speed) : 5;
    }
    let v = base * KMH;
    if (e.sprinting && e.stamina > 0) v *= e.def.sprintFactor;
    if (e.boostUntil > this.time) v *= e.boostPow;
    if (e.curlUntil > this.time) v *= 0.35;
    if (e.attack) v *= 0.55;
    if (e.heldUntil > this.time) v *= 0.1;
    return v;
  }

  private collide(e: Ent, dt: number) {
    const props = this.propsNear(e.x, e.y);
    const r = e.def.body.len * 0.35 * e.def.scale;
    for (const p of props) {
      if (!isCanopy(p.type) && p.type !== "rock" && p.type !== "iceBlock") continue;
      if (e.def.climber && isCanopy(p.type)) continue; // Kletterer nutzen Bäume
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = r + p.r * 0.45;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0.001) {
        e.x = p.x + (dx / d) * rr;
        e.y = p.y + (dy / d) * rr;
      }
    }
    e.x = Math.max(60, Math.min(WORLD_SIZE - 60, e.x));
    e.y = Math.max(60, Math.min(WORLD_SIZE - 60, e.y));
  }

  private applyDots(e: Ent, dt: number) {
    if (e.dots.length === 0) return;
    for (let i = e.dots.length - 1; i >= 0; i--) {
      const d = e.dots[i]!;
      if (this.time > d.until) {
        e.dots.splice(i, 1);
        continue;
      }
      const dmg = d.dps * dt;
      e.hp -= dmg;
      if (d.source === "player") {
        this.save.stats.damageDealt += dmg;
        if (e.coinsFarmed < e.maxHp * 1.5) {
          e.coinsFarmed += dmg;
          this.save.coins += dmg;
          this.save.stats.coinsEarned += dmg;
        }
      }
      if (e.hp <= 0 && !e.dead) this.kill(e, d.source === "player");
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.dead) return;
    const s = sample(p.x, p.y);
    const inWater = s.water;
    const deep = s.biome === "deep" || s.biome === "ocean";
    const mag = Math.hypot(this.move.x, this.move.y);
    const maxSpeed = this.speedOf(p, inWater) * (deep && !p.def.aquatic ? 0.4 : 1);
    if (p.jumpUntil > this.time) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    } else if (mag > 0.08 && p.curlUntil < this.time) {
      const nx = this.move.x / mag;
      const ny = this.move.y / mag;
      const target = Math.min(1, mag) * maxSpeed;
      p.vx = nx * target;
      p.vy = ny * target;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle = Math.atan2(ny, nx);
      p.speed01 = Math.min(1, target / (p.def.speed * KMH));
      p.phase += dt * (6 + p.speed01 * 10);
      if (this.time - p.lastStep > (inWater ? 0.4 : 0.28 - p.speed01 * 0.12)) {
        p.lastStep = this.time;
        sfx.step(inWater);
      }
    } else {
      p.vx *= 0.8;
      p.vy *= 0.8;
      p.speed01 = 0;
      p.phase += dt * 1.4;
    }
    this.collide(p, dt);
    this.advanceAttack(p, dt);
    this.applyDots(p, dt);
    p.hurt = Math.max(0, p.hurt - dt * 3);
    this.updateGrip(p, dt);
    const moving = p.speed01 > 0.05;
    if (p.sprinting && moving && p.stamina > 0) {
      p.stamina = Math.max(0, p.stamina - dt / Math.max(2, p.def.stamina));
      if (p.stamina === 0) p.sprinting = false;
    } else {
      p.stamina = Math.min(1, p.stamina + dt / Math.max(3, p.def.stamina * 1.6));
    }
    p.hunger = Math.min(1, p.hunger + dt * (inWater ? 0.015 : 0.01));
    if (p.hunger > 0.9) p.hp -= dt * 1.5;
    // Gut gesättigt und seit 10 s kampffrei → 2 % maximales Leben pro Sekunde.
    else if (p.hunger < 0.5 && this.time - p.lastCombatAt >= 10 && p.hp > 0)
      p.hp = Math.min(p.maxHp, p.hp + dt * p.maxHp * 0.02);

    if (p.hp <= 0 && !p.dead) {
      p.dead = true;
      p.deadAt = this.time;
      sfx.defeat();
      this.persist(true);
    }
    // Fressen
    if (this.tick % 12 === 0) this.tryEat(p);
    if (inWater && this.tick % 20 === 0 && p.speed01 > 0.2) {
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0.5,
        max: 0.5,
        color: "rgba(220,240,255,0.7)",
        size: 3,
      });
    }
  }

  private eatCritters(e: Ent) {
    const wantsInsects = e.def.diet === "insectivore" || e.def.diet === "omnivore";
    const wantsFish = e.def.diet !== "herbivore";
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i]!;
      if (c.kind === "insect" && !wantsInsects) continue;
      if (c.kind === "fish" && !wantsFish) continue;
      const reach = c.kind === "fish" ? 26 : 20;
      if (dist2(c.x, c.y, e.x, e.y) > reach * reach) continue;
      if (c.kind === "fish" && c.hp > e.def.attacks[0]!.damage * 3) continue;
      this.critters.splice(i, 1);
      e.hunger = Math.max(0, e.hunger - (c.kind === "fish" ? 0.25 + c.size / 60 : 0.12));
      if (e.isPlayer) {
        e.hp = Math.min(e.maxHp, e.hp + (c.kind === "fish" ? c.maxHp * 0.4 : 4));
        this.floats.push({
          x: e.x,
          y: e.y - 20,
          text: c.kind === "fish" ? `${c.species} gefressen` : "Insekt",
          life: 0.9,
          color: "#b6e58a",
        });
        this.addCoins(c.kind === "fish" ? Math.round(c.maxHp / 8) : 1, e.x, e.y);
      }
      return;
    }
  }

  private tryEat(e: Ent) {
    if (e.hunger > 0.1) this.eatCritters(e);
    if (e.hunger < 0.15) return;
    if (e.def.diet === "carnivore") return;
    const props = this.propsNear(e.x, e.y);
    for (const p of props) {
      if (!p.edible || p.eatenUntil > this.time) continue;
      if (dist2(p.x, p.y, e.x, e.y) < 26 * 26) {
        p.eatenUntil = this.time + 45;
        e.hunger = Math.max(0, e.hunger - 0.45);
        if (e.isPlayer) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.08);
          this.floats.push({ x: e.x, y: e.y - 20, text: "Gefressen", life: 0.9, color: "#b6e58a" });
        }
        return;
      }
    }
  }

  private advanceAttack(e: Ent, dt: number) {
    const a = e.attack;
    if (!a) return;
    a.t += dt / a.dur;
    if (!a.hit && a.t >= a.def.windup / a.dur) {
      a.hit = true;
      this.resolveHit(e, a.def);
    }
    if (a.t >= 1) e.attack = null;
  }

  private resolveHit(attacker: Ent, atk: AttackDef) {
    const baseAngle = attacker.angle + (atk.rear ? Math.PI : 0);
    const targets: Ent[] = attacker.isPlayer ? this.ents : [this.player, ...this.ents];
    let hitAny = false;
    for (const t of targets) {
      if (t === attacker || t.dead) continue;
      const reach = atk.range + t.def.body.len * 0.3 * t.def.scale;
      if (dist2(t.x, t.y, attacker.x, attacker.y) > reach * reach) continue;
      const a = Math.atan2(t.y - attacker.y, t.x - attacker.x);
      if (Math.abs(this.angDiff(a, baseAngle)) > atk.arc) continue;
      hitAny = true;
      let dmg = atk.damage;
      if (attacker.ambush && attacker.isPlayer) {
        dmg *= 2;
        attacker.ambush = false;
        attacker.invisibleUntil = 0;
      }
      this.damage(t, dmg, attacker, atk);
      // Igel-Konter
      if (t.curlUntil > this.time && atk.anim === "bite") {
        this.damage(attacker, t.def.special.power ?? 8, t, null);
      }
    }
    const ate = this.biteCorpse(attacker, atk, baseAngle);
    if (hitAny || ate) {
      // Jeder Treffer sättigt um 10 %
      attacker.hunger = Math.max(0, attacker.hunger - 0.1);
    }
    if (hitAny) sfx.hit();
  }

  /** Fleischfresser fressen beim Biss gleichzeitig an frischen Kadavern. */
  private biteCorpse(attacker: Ent, atk: AttackDef, baseAngle: number): boolean {
    if (attacker.def.diet === "herbivore" || attacker.def.diet === "insectivore") return false;
    for (const t of this.ents) {
      if (t === attacker || !t.dead || t.skeleton) continue;
      if (this.time - t.deadAt > 30) continue;
      const reach = atk.range + t.def.body.len * 0.35 * t.def.scale;
      if (dist2(t.x, t.y, attacker.x, attacker.y) > reach * reach) continue;
      const a = Math.atan2(t.y - attacker.y, t.x - attacker.x);
      if (Math.abs(this.angDiff(a, baseAngle)) > atk.arc + 0.3) continue;
      attacker.hunger = Math.max(0, attacker.hunger - 0.25);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.maxHp * 0.04);
      sfx.bite();
      if (attacker.isPlayer) {
        this.floats.push({
          x: attacker.x,
          y: attacker.y - 24,
          text: "Gefressen",
          life: 0.9,
          color: "#b6e58a",
        });
      }
      for (let i = 0; i < 4; i++)
        this.particles.push({
          x: t.x,
          y: t.y,
          vx: (Math.random() - 0.5) * 70,
          vy: (Math.random() - 0.5) * 70,
          life: 0.5,
          max: 0.5,
          color: "rgba(170,50,45,0.75)",
          size: 2.5,
        });
      return true;
    }
    return false;
  }


  private damage(target: Ent, amount: number, source: Ent, atk: AttackDef | null) {
    if (target.dead) return;
    let dmg = amount;
    if (target.curlUntil > this.time) dmg *= 0.4;
    target.hp -= dmg;
    target.hurt = 1;
    target.engagedUntil = this.time + 6;
    target.lastCombatAt = this.time;
    source.lastCombatAt = this.time;
    target.invisibleUntil = 0;
    if (!target.isPlayer) {
      target.targetId = source.id;
      target.peaceful = false; // wehrt sich ab jetzt
    }
    for (let i = 0; i < 5; i++)
      this.particles.push({
        x: target.x,
        y: target.y,
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90,
        life: 0.4,
        max: 0.4,
        color: "rgba(190,60,50,0.8)",
        size: 2.5,
      });
    this.floats.push({
      x: target.x + (Math.random() - 0.5) * 10,
      y: target.y - 26,
      text: `-${Math.round(dmg)}`,
      life: 0.8,
      color: source.isPlayer ? "#ffd9d0" : "#ff8d7a",
    });
    if (atk?.dot) {
      const ex = target.dots.find((d) => d.label === atk.dot!.label);
      const until = this.time + atk.dot.duration;
      if (ex) ex.until = Math.max(ex.until, until);
      else
        target.dots.push({
          label: atk.dot.label,
          dps: atk.dot.dps,
          until,
          source: source.isPlayer ? "player" : "npc",
        });
    }
    if (source.isPlayer) {
      this.save.stats.damageDealt += dmg;
      const cap = target.maxHp * 1.5;
      const gain = Math.min(dmg, Math.max(0, cap - target.coinsFarmed));
      target.coinsFarmed += dmg;
      if (gain > 0) this.addCoins(gain, target.x, target.y);
      this.targetId = target.id;
    }
    if (target.hp <= 0) this.kill(target, source.isPlayer);
  }

  private kill(e: Ent, byPlayer: boolean) {
    if (e.dead) return;
    e.dead = true;
    e.deadAt = this.time;
    e.attack = null;
    sfx.defeat();
    if (e.isPlayer) {
      this.persist(true);
      return;
    }
    if (byPlayer && !e.bountyPaid) {
      e.bountyPaid = true;
      const bonus = Math.max(10, Math.min(300, e.def.bounty));
      this.addCoins(bonus, e.x, e.y);
      this.save.stats.kills += 1;
      this.persist(true);
    }
  }

  // ---------- NPC-KI ----------
  private updateNpc(e: Ent, dt: number) {
    if (e.dead) return;
    const far = dist2(e.x, e.y, this.player.x, this.player.y) > 900 * 900;
    if (far && this.tick % 4 !== 0) return;
    const step = far ? dt * 4 : dt;

    this.applyDots(e, step);
    e.hurt = Math.max(0, e.hurt - step * 3);
    e.hunger = Math.min(1, e.hunger + step * (sample(e.x, e.y).water ? 0.015 : 0.01));
    if (e.hunger < 0.5 && this.time - e.lastCombatAt >= 10 && e.hp > 0)
      e.hp = Math.min(e.maxHp, e.hp + step * e.maxHp * 0.02);

    this.updateGrip(e, step);
    e.stamina = Math.min(1, e.stamina + step * 0.1);

    const s = sample(e.x, e.y);
    // Ziel bestimmen: Spieler oder anderes NPC
    let foe: Ent = this.player;
    let foeVisible = this.player.invisibleUntil < this.time && !this.player.dead;
    let foeDist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
    if (e.targetId) {
      const t = this.entById(e.targetId);
      if (t && !t.dead) {
        const d = Math.hypot(t.x - e.x, t.y - e.y);
        if (d < 500) {
          foe = t;
          foeVisible = t.invisibleUntil < this.time;
          foeDist = d;
        }
      }
    }
    if (foe === this.player && !e.peaceful && isHunter(e.def)) {
      // nächstes schwächeres NPC als Beute suchen
      let best: Ent | null = null;
      let bd = 340 * 340;
      for (const o of this.ents) {
        if (o === e || o.dead || o.invisibleUntil > this.time) continue;
        if (power(o) > power(e) * 0.9) continue;
        if (!isBig(o.def)) continue; // große Jäger reißen nur große Tiere
        const d = dist2(e.x, e.y, o.x, o.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best && (!foeVisible || Math.sqrt(bd) < foeDist)) {
        foe = best;
        foeVisible = true;
        foeDist = Math.sqrt(bd);
      }
    }
    const playerVisible = foeVisible;
    const dToPlayer = foeDist;
    const myPower = power(e);
    const foePower = power(foe);

    // Zustandslogik
    if (this.time > e.stateUntil) {
      e.state = "wander";
      e.stateUntil = this.time + 1 + Math.random() * 2;
      e.targetId = null;

      const threatened =
        playerVisible &&
        dToPlayer < 260 &&
        (foePower > myPower * 1.15 || e.hp < e.maxHp * 0.35) &&
        (!e.peaceful || e.engagedUntil > this.time || foe !== this.player);
      const hunts =
        playerVisible &&
        dToPlayer < 320 &&
        isHunter(e.def) &&
        (isBig(foe.def) || e.engagedUntil > this.time) &&
        myPower > foePower * 0.85 &&
        (!e.peaceful || e.engagedUntil > this.time) &&
        (e.hunger > 0.35 || e.engagedUntil > this.time || foe !== this.player);

      if (e.peaceful && e.engagedUntil < this.time && foe === this.player) {
        // friedliches Tier: geht dem Spieler höchstens aus dem Weg
        if (dToPlayer < 120 && playerVisible) {
          e.state = "flee";
          e.stateUntil = this.time + 1.2;
        }
      } else if (e.engagedUntil > this.time && playerVisible && dToPlayer < 400) {
        e.state = e.hp < e.maxHp * 0.25 ? "flee" : "chase";
        e.stateUntil = this.time + 1.5;
      } else if (threatened) {
        e.state = "flee";
        e.stateUntil = this.time + 2 + Math.random();
      } else if (hunts) {
        e.state = "chase";
        e.stateUntil = this.time + 2.5;
      } else if (e.hunger > 0.55 && e.def.diet !== "carnivore") {
        e.state = "food";
        e.stateUntil = this.time + 3;
        e.targetProp =
          this.propsNear(e.x, e.y).find((p) => p.edible && p.eatenUntil < this.time) ?? null;
      } else if (e.hunger > 0.7) {
        e.state = "drink";
        e.stateUntil = this.time + 3;
      } else if (Math.random() < 0.12) {
        e.state = "rest";
        e.stateUntil = this.time + 3 + Math.random() * 4;
      } else {
        e.wander += (Math.random() - 0.5) * 2;
      }
    }

    let desired = e.wander;
    let speedScale = 0.4;
    switch (e.state) {
      case "flee": {
        desired = Math.atan2(e.y - foe.y, e.x - foe.x);
        speedScale = 1;
        // in Richtung bevorzugtes Biom ausweichen
        const probe = sample(e.x + Math.cos(desired) * 120, e.y + Math.sin(desired) * 120);
        if (probe.water && !e.def.aquatic) desired += 1.2;
        break;
      }
      case "chase": {
        desired = Math.atan2(foe.y - e.y, foe.x - e.x);
        speedScale = 0.95;
        if (dToPlayer < e.def.attacks[0]!.range + 12) {
          e.state = "attack";
          e.stateUntil = this.time + 0.8;
        }
        break;
      }
      case "attack": {
        desired = Math.atan2(foe.y - e.y, foe.x - e.x);
        speedScale = 0.2;
        const atk = e.def.attacks[0]!;
        if (this.time > e.atkReady && !e.attack && dToPlayer < atk.range + 16) {
          e.attack = { def: atk, t: 0, dur: 0.34, hit: false };
          e.atkReady = this.time + atk.cooldown + 0.4;
        }
        if (this.time > e.specialReady && dToPlayer < 120 && Math.random() < 0.02) {
          e.specialReady = this.time + e.def.special.cooldown;
          e.targetId = foe.id;
          this.applySpecial(e, false);
        }
        if (dToPlayer > atk.range + 40) {
          e.state = "chase";
          e.stateUntil = this.time + 1.5;
        }
        break;
      }
      case "food": {
        if (e.targetProp) {
          desired = Math.atan2(e.targetProp.y - e.y, e.targetProp.x - e.x);
          speedScale = 0.5;
          if (dist2(e.x, e.y, e.targetProp.x, e.targetProp.y) < 24 * 24) {
            this.tryEat(e);
            e.targetProp = null;
            e.stateUntil = 0;
          }
        }
        break;
      }
      case "drink": {
        speedScale = 0.45;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          if (sample(e.x + Math.cos(ang) * 200, e.y + Math.sin(ang) * 200).water) {
            desired = ang;
            break;
          }
        }
        if (s.water || sample(e.x + Math.cos(e.angle) * 30, e.y).water) {
          e.hunger = Math.max(0, e.hunger - 0.3 * step);
        }
        break;
      }
      case "rest": {
        speedScale = 0;
        break;
      }
      default:
        speedScale = 0.35;
    }

    // Nachtaktivität
    const night = this.dayFactor() < 0.35;
    if (night && (e.def.id === "fox" || e.def.id === "wolf" || e.def.id === "leopard"))
      speedScale *= 1.15;
    else if (night && e.state === "wander") speedScale *= 0.7;

    const inWater = s.water;
    if (inWater && !e.def.aquatic) speedScale *= 0.4;
    const maxV = this.speedOf(e, inWater) * speedScale;
    const da = this.angDiff(desired, e.angle);
    e.angle += Math.max(-6 * step, Math.min(6 * step, da * 4 * step + da * 0.2));
    e.x += Math.cos(e.angle) * maxV * step;
    e.y += Math.sin(e.angle) * maxV * step;
    e.speed01 = Math.min(1, maxV / (e.def.speed * KMH));
    e.phase += step * (4 + e.speed01 * 12);
    this.collide(e, step);
    this.advanceAttack(e, step);

    // Frösche fressen Insekten an Ufern und Büschen
    if (e.def.diet === "insectivore" && this.tick % 15 === 0) this.eatCritters(e);

    // Laute
    if (!far && this.time - e.lastSound > 12 + Math.random() * 20) {
      e.lastSound = this.time;
      if (dToPlayer < 500 && Math.random() < 0.3) sfx.voice(e.def.voice);
    }
  }

  private updateCritter(c: Critter, dt: number) {
    if (c.kind === "insect") {
      c.a += Math.sin(this.time * 3 + c.seed * 10) * dt * 6;
    }
    const p = this.player;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < 90) c.a = Math.atan2(c.y - p.y, c.x - p.x);
    else c.a += (Math.random() - 0.5) * dt * 4;
    const nx = c.x + Math.cos(c.a) * c.sp * dt;
    const ny = c.y + Math.sin(c.a) * c.sp * dt;
    const s = sample(nx, ny);
    if (c.kind === "fish" && !s.water) {
      c.a += Math.PI * 0.7;
      return;
    }
    c.x = nx;
    c.y = ny;
  }

  private dayFactor(): number {
    const t = (this.time % DAY_LENGTH) / DAY_LENGTH;
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2); // 0 = Mitternacht, 1 = Mittag
  }

  private timeLabel(): string {
    const t = (this.time % DAY_LENGTH) / DAY_LENGTH;
    const hours = Math.floor(t * 24);
    return `${String(hours).padStart(2, "0")}:00`;
  }

  // ---------- Rendering ----------
  private render() {
    const ctx = this.ctx;
    const w = this.cssW;
    const h = this.cssH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    const viewW = w / this.zoom;
    const viewH = h / this.zoom;
    drawTerrain(ctx, this.camX, this.camY, viewW, viewH, this.time);

    const minX = this.camX - viewW / 2 - 80;
    const maxX = this.camX + viewW / 2 + 80;
    const minY = this.camY - viewH / 2 - 80;
    const maxY = this.camY + viewH / 2 + 80;

    const visibleProps: Prop[] = [];
    for (const list of this.chunks.values())
      for (const p of list)
        if (p.x > minX && p.x < maxX && p.y > minY && p.y < maxY) visibleProps.push(p);
    visibleProps.sort((a, b) => a.y - b.y);
    for (const p of visibleProps) drawProp(ctx, p, this.time, false);

    // Fische & Insekten
    for (const c of this.critters) {
      if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      if (c.kind === "fish") {
        const k = FISH_KINDS.find((f) => f.name === c.species) ?? FISH_KINDS[0]!;
        const L = c.size;
        const wob = Math.sin(this.time * 8 + c.seed * 12) * 0.25;
        ctx.globalAlpha = 0.85;
        const g = ctx.createLinearGradient(0, -L * 0.3, 0, L * 0.3);
        g.addColorStop(0, k.c1);
        g.addColorStop(1, k.c2);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(L * 0.55, 0);
        ctx.quadraticCurveTo(0, -L * 0.3, -L * 0.45, wob * L * 0.2);
        ctx.quadraticCurveTo(0, L * 0.3, L * 0.55, 0);
        ctx.fill();
        // Rückenflosse
        ctx.fillStyle = k.c2;
        ctx.beginPath();
        ctx.moveTo(L * 0.1, -L * 0.22);
        ctx.lineTo(-L * 0.1, -L * 0.45);
        ctx.lineTo(-L * 0.2, -L * 0.18);
        ctx.closePath();
        ctx.fill();
        // Schwanzflosse
        ctx.save();
        ctx.translate(-L * 0.45, wob * L * 0.2);
        ctx.rotate(wob);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-L * 0.3, -L * 0.28);
        ctx.lineTo(-L * 0.22, 0);
        ctx.lineTo(-L * 0.3, L * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Auge
        ctx.fillStyle = "#12181c";
        ctx.beginPath();
        ctx.arc(L * 0.34, -L * 0.06, Math.max(0.7, L * 0.055), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#3a3226";
        ctx.beginPath();
        ctx.ellipse(0, Math.sin(this.time * 20 + c.seed * 10) * 1.5, 2, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Tiere
    const all = [...this.ents, this.player].filter(
      (e) => e.x > minX && e.x < maxX && e.y > minY && e.y < maxY,
    );
    all.sort((a, b) => a.y - b.y);
    for (const e of all) this.drawEnt(ctx, e);

    // Baumkronen über allem
    for (const p of visibleProps) if (isCanopy(p.type)) drawProp(ctx, p, this.time, true);

    // Partikel
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // HP-Balken & Schadenszahlen
    for (const e of all) {
      if (e.isPlayer || e.dead) continue;
      const engaged = e.engagedUntil > this.time || e.id === this.targetId;
      if (!engaged) continue;
      this.drawHpBar(ctx, e);
    }
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawAtmosphere(ctx, w, h);
  }

  private drawEnt(ctx: CanvasRenderingContext2D, e: Ent) {
    const s = sample(e.x, e.y);
    const jumpT =
      e.jumpUntil > this.time
        ? Math.sin(((e.jumpDur - (e.jumpUntil - this.time)) / e.jumpDur) * Math.PI)
        : 0;
    const invisible = e.invisibleUntil > this.time;
    const pose: Pose = {
      x: e.x,
      y: e.y,
      angle: e.angle,
      phase: e.phase,
      speed01: e.speed01,
      scale: 1,
      attack: e.attack ? { anim: e.attack.def.anim, t: Math.min(1, e.attack.t) } : null,
      hurt: e.hurt,
      dead: e.dead,
      curled: e.curlUntil > this.time,
      swimming: s.water && !e.dead,
      alpha: invisible ? (e.isPlayer ? 0.35 : 0.12) : e.dead ? (e.skeleton ? 0.9 : 0.7) : 1,
      tongue: e.tongueUntil > this.time ? Math.sin((0.6 - (e.tongueUntil - this.time)) / 0.6 * Math.PI) : 0,
      jump: jumpT,
      resting: e.state === "rest",
      skeleton: e.skeleton,
      decay: e.dead ? Math.min(1, (this.time - e.deadAt) / 30) : 0,
      rolling: 0,
      ridden: e.heldUntil > this.time,
      mouthOpen:
        !e.dead &&
        ((e.attack !== null && e.attack.t > 0.12 && e.attack.t < 0.75) ||
          (e.gripId !== null && e.gripUntil > this.time)),
    };

    drawCreature(ctx, e.def, pose);
    if (s.water && !e.dead) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        e.x,
        e.y + 2,
        e.def.body.len * 0.5 * e.def.scale + Math.sin(this.time * 4 + e.id) * 2,
        e.def.body.wid * 0.4 * e.def.scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (e.dots.length > 0 && !e.dead) {
      ctx.fillStyle = "rgba(120,220,120,0.8)";
      for (let i = 0; i < 3; i++) {
        const a = this.time * 3 + i * 2;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * 10, e.y - 14 + Math.sin(a) * 4, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHpBar(ctx: CanvasRenderingContext2D, e: Ent) {
    const w = 46;
    const y = e.y - e.def.body.wid * e.def.scale - 20;
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(e.x - w / 2, y, w, 12);
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = pct > 0.5 ? "#5fc46b" : pct > 0.22 ? "#e0a13c" : "#d8503f";
    ctx.fillRect(e.x - w / 2 + 1, y + 6, (w - 2) * pct, 5);
    ctx.fillStyle = "#f3efe6";
    ctx.fillText(
      `${e.def.name} ${Math.max(0, Math.round(e.hp))}/${e.maxHp}`,
      e.x,
      y + 5,
    );
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const day = this.dayFactor();
    const night = 1 - day;
    if (night > 0.05) {
      ctx.fillStyle = `rgba(10,18,45,${night * 0.6})`;
      ctx.fillRect(0, 0, w, h);
      // Lichtkegel um den Spieler
      const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.85);
      g.addColorStop(0, `rgba(255,230,180,${night * 0.16})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.weather === "rain" || this.weather === "storm") {
      const n = this.weather === "storm" ? 140 : 70;
      ctx.strokeStyle = "rgba(190,215,240,0.45)";
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x = (i * 137.5 + this.time * 340) % w;
        const y = (i * 91.7 + this.time * 900) % h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 14);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(30,45,60,0.18)";
      ctx.fillRect(0, 0, w, h);
    } else if (this.weather === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 80; i++) {
        const x = (i * 97.3 + this.time * 40 + Math.sin(this.time + i) * 20) % w;
        const y = (i * 61.7 + this.time * 90) % h;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.weather === "fog") {
      ctx.fillStyle = "rgba(210,215,220,0.28)";
      ctx.fillRect(0, 0, w, h);
    } else if (this.weather === "cloudy") {
      ctx.fillStyle = "rgba(60,70,80,0.12)";
      ctx.fillRect(0, 0, w, h);
    }
    // Vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  private buildHud(biome: string): Hud {
    const p = this.player;
    const atk = p.def.attacks[this.attackIndex % p.def.attacks.length]!;
    const target = this.ents.find(
      (e) => e.id === this.targetId && !e.dead && e.engagedUntil > this.time,
    );
    return {
      coins: Math.floor(this.save.coins),
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      animal: p.def.name,
      animalId: p.def.id,
      biome: BIOME_LABEL[biome as keyof typeof BIOME_LABEL] ?? biome,
      attackName: atk.name,
      attackReady: Math.max(0, p.atkReady - this.time),
      specialName: p.def.special.name,
      specialReady: Math.max(0, p.specialReady - this.time),
      specialTotal: p.def.special.cooldown,
      timeLabel: this.timeLabel(),
      weather: this.weather,
      owned: [...this.save.owned],
      target: target
        ? { name: target.def.name, hp: Math.max(0, Math.round(target.hp)), max: target.maxHp }
        : null,
      dead: p.dead,
      stats: { ...this.save.stats },
      poison: p.dots[0]?.label ?? null,
      attackCount: p.def.attacks.length,
      attackIndex: this.attackIndex % p.def.attacks.length,
      stamina: p.stamina,
      hunger: p.hunger,
      sprinting: p.sprinting,
    };
  }
}
