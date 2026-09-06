// Prozedurale, detaillierte Top-Down-Darstellung der Tiere.
// Jede Animation nutzt dasselbe Körpermodell -> das Tier sieht in jedem
// Frame identisch aus, nur Pose/Gliedmaßen ändern sich.
import type { AnimalDef, BodyPlan } from "./animals";
import { animalSprite } from "./sprites";

export type Pose = {
  x: number;
  y: number;
  angle: number;
  phase: number; // Laufzyklus 0..2PI
  speed01: number; // 0 = steht, 1 = Sprint
  scale: number;
  attack: { anim: string; t: number } | null; // t 0..1
  hurt: number; // 0..1
  dead: boolean;
  curled: boolean;
  swimming: boolean;
  alpha: number;
  tongue: number; // 0..1 Zungenausfahrt
  jump: number; // 0..1 Sprunghöhe
  resting: boolean;
  skeleton?: boolean; // Leiche ist zu Knochen verfallen
  decay?: number; // 0..1 Verwesungsgrad der Leiche
  breathe?: number; // Atem-/Idle-Phase
  rolling?: number; // Todesrolle 0..1
  ridden?: boolean; // trägt gerade einen Angreifer auf dem Rücken
  mouthOpen?: boolean; // Maul offen (Biss / Fähigkeit) -> Action-Sprite
};


function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.4, rx), Math.max(0.4, ry), rot, 0, Math.PI * 2);
}

function limb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function pattern(ctx: CanvasRenderingContext2D, b: BodyPlan, len: number, wid: number) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = b.color2;
  ctx.strokeStyle = b.color2;
  const hl = len / 2;
  const hw = wid / 2;
  if (b.pattern === "spots") {
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.399) % 1;
      const px = -hl * 0.75 + a * len * 0.8;
      const py = Math.sin(i * 2.7) * hw * 0.6;
      ellipse(ctx, px, py, 1.7, 1.5);
      ctx.fill();
    }
  } else if (b.pattern === "rosettes") {
    for (let i = 0; i < 12; i++) {
      const a = (i * 2.399) % 1;
      const px = -hl * 0.8 + a * len * 0.85;
      const py = Math.sin(i * 1.9) * hw * 0.65;
      ctx.lineWidth = 0.9;
      ellipse(ctx, px, py, 2.6, 2.2);
      ctx.stroke();
      ellipse(ctx, px, py, 1.1, 1);
      ctx.fill();
    }
  } else if (b.pattern === "stripes" || b.pattern === "bands") {
    for (let i = 0; i < 9; i++) {
      const px = -hl * 0.85 + (i / 8) * len * 0.85;
      const h = hw * (b.pattern === "bands" ? 0.95 : 0.8) * (1 - Math.abs(i / 8 - 0.5) * 0.5);
      ctx.lineWidth = b.pattern === "bands" ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.moveTo(px, -h);
      ctx.quadraticCurveTo(px + 2, 0, px, h);
      ctx.stroke();
    }
  } else if (b.pattern === "patch") {
    ellipse(ctx, -len * 0.15, -hw * 0.25, len * 0.22, hw * 0.5, 0.2);
    ctx.fill();
    ellipse(ctx, len * 0.12, hw * 0.3, len * 0.14, hw * 0.35, -0.3);
    ctx.fill();
  }
  ctx.restore();
}

function drawQuad(ctx: CanvasRenderingContext2D, def: AnimalDef, p: Pose) {
  const b = def.body;
  const len = b.len;
  const wid = b.wid;
  const hl = len / 2;
  const hw = wid / 2;
  const walk = p.phase;
  const gait = 0.35 + p.speed01 * 0.9;
  const att = p.attack;
  const bite = att && (att.anim === "bite" || att.anim === "horn") ? Math.sin(att.t * Math.PI) : 0;
  const paw = att && att.anim === "paw" ? Math.sin(att.t * Math.PI) : 0;
  const kick = att && att.anim === "kick" ? Math.sin(att.t * Math.PI) : 0;
  const tailHit = att && att.anim === "tail" ? Math.sin(att.t * Math.PI) : 0;

  // Schwanz
  if (b.tail !== "none") {
    const sway = Math.sin(walk * 0.8) * 0.35 + tailHit * 1.4;
    const tl = b.tailLen;
    const tx = -hl - tl * 0.55;
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineCap = "round";
    ctx.lineWidth = b.tail === "bushy" ? wid * 0.5 : b.tail === "flat" ? wid * 0.4 : wid * 0.18;
    ctx.beginPath();
    ctx.moveTo(-hl * 0.95, 0);
    ctx.quadraticCurveTo(-hl - tl * 0.4, sway * tl * 0.35, tx - tl * 0.25, sway * tl * 0.6);
    ctx.stroke();
    if (b.tail === "tuft") {
      ctx.fillStyle = b.color2;
      ellipse(ctx, tx - tl * 0.3, sway * tl * 0.6, 4, 3.4);
      ctx.fill();
    }
    ctx.restore();
  }

  // Beine (4) – Trab-Zyklus
  if (b.legLen > 0) {
    const legs: Array<[number, number, number]> = [
      [hl * 0.55, -hw * 0.85, 0],
      [hl * 0.55, hw * 0.85, Math.PI],
      [-hl * 0.6, -hw * 0.85, Math.PI],
      [-hl * 0.6, hw * 0.85, 0],
    ];
    legs.forEach(([lx, ly, off], i) => {
      const sw = Math.sin(walk + off) * gait * b.legLen * 0.55;
      const lift = Math.max(0, Math.cos(walk + off)) * 1.6 * p.speed01;
      const isRear = i >= 2;
      const kickExtra = isRear ? -kick * b.legLen * 1.2 : 0;
      const pawExtra = !isRear && i === 0 ? paw * b.legLen * 1.1 : 0;
      const fx = lx + sw + pawExtra + kickExtra;
      const fy = ly + (isRear ? 0 : paw * 2) + Math.sign(ly) * lift;
      limb(ctx, lx, ly * 0.7, fx, fy, Math.max(2.2, wid * 0.2), shade(b.color, -35));
      ctx.fillStyle = shade(b.color, -55);
      ellipse(ctx, fx, fy, wid * 0.11 + 1, wid * 0.09 + 1);
      ctx.fill();
    });
  }

  // Körper
  const squash = p.curled ? 0.75 : 1 + Math.sin(walk * 2) * 0.02 * p.speed01;
  const grad = ctx.createLinearGradient(0, -hw, 0, hw);
  grad.addColorStop(0, shade(b.color, 22));
  grad.addColorStop(0.55, b.color);
  grad.addColorStop(1, shade(b.color, -28));
  ctx.fillStyle = grad;
  ellipse(ctx, 0, 0, hl * squash, hw * (p.curled ? 1.15 : 1));
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, hl * squash, hw, 0, 0, Math.PI * 2);
  ctx.clip();
  pattern(ctx, b, len * squash, wid);
  ctx.restore();

  // Rückenlinie / Glanz
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-hl * 0.7, -hw * 0.35);
  ctx.quadraticCurveTo(0, -hw * 0.55, hl * 0.7, -hw * 0.3);
  ctx.stroke();

  if (b.plates) {
    // Panzerschuppen in Reihen
    ctx.fillStyle = shade(b.color2, 12);
    for (let row = -1; row <= 1; row++) {
      for (let i = 0; i < 9; i++) {
        const px = -hl * 0.85 + (i / 8) * len * 0.85;
        const py = row * hw * 0.42;
        ctx.beginPath();
        ctx.roundRect(px - 2.2, py - 1.8, 4.4, 3.6, 1.2);
        ctx.fill();
      }
    }
    ctx.fillStyle = shade(b.color2, -18);
    for (let i = 0; i < 7; i++) {
      const px = -hl * 0.5 + (i / 6) * len * 0.7;
      ctx.beginPath();
      ctx.moveTo(px - 2, 0);
      ctx.lineTo(px, -3.4);
      ctx.lineTo(px + 2, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (b.spines) {
    ctx.strokeStyle = shade(b.color2, -10);
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      const ex = Math.cos(a) * hl * 0.92;
      const ey = Math.sin(a) * hw * 0.92;
      const l = p.curled ? 6 : 4.2;
      ctx.beginPath();
      ctx.moveTo(ex * 0.7, ey * 0.7);
      ctx.lineTo(ex + Math.cos(a) * l, ey + Math.sin(a) * l);
      ctx.stroke();
    }
  }

  if (p.curled) return; // Kugel: Kopf eingezogen

  // Kopf
  const headX = hl * 0.92 + bite * 3.5 + (b.headR ? 0 : 0);
  const headY = Math.sin(walk) * 0.6 * p.speed01;
  ctx.save();
  ctx.translate(headX, headY);
  const hgrad = ctx.createRadialGradient(0, -b.headR * 0.4, 1, 0, 0, b.headR * 1.4);
  hgrad.addColorStop(0, shade(b.color, 26));
  hgrad.addColorStop(1, shade(b.color, -14));
  ctx.fillStyle = hgrad;
  ellipse(ctx, 0, 0, b.headR * 1.05, b.headR * 0.92);
  ctx.fill();

  // Ohren
  ctx.fillStyle = shade(b.color, -18);
  const er = b.headR;
  if (b.ears === "point") {
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(-er * 0.2, s * er * 0.55);
      ctx.lineTo(-er * 0.9, s * er * 1.25);
      ctx.lineTo(er * 0.25, s * er * 1.0);
      ctx.closePath();
      ctx.fill();
    });
  } else if (b.ears === "round") {
    [-1, 1].forEach((s) => {
      ellipse(ctx, -er * 0.35, s * er * 0.95, er * 0.42, er * 0.36);
      ctx.fill();
    });
  } else if (b.ears === "long") {
    [-1, 1].forEach((s) => {
      ellipse(ctx, -er * 0.4, s * er * 1.1, er * 0.75, er * 0.3, s * 0.5);
      ctx.fill();
    });
  } else if (b.ears === "tiny") {
    [-1, 1].forEach((s) => {
      ellipse(ctx, -er * 0.2, s * er * 0.8, er * 0.22, er * 0.2);
      ctx.fill();
    });
  }

  if (b.horns) {
    ctx.strokeStyle = "#d9cdb4";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(-er * 0.1, s * er * 0.5);
      ctx.quadraticCurveTo(-er * 1.1, s * er * 1.1, -er * 0.2, s * er * 1.5);
      ctx.stroke();
    });
  }

  // Lange Kiefer (Krokodil)
  if (b.jaws) {
    const open = bite * 0.55;
    ctx.save();
    ctx.fillStyle = shade(b.color, 4);
    [-1, 1].forEach((sd) => {
      ctx.save();
      ctx.rotate(sd * open);
      ctx.beginPath();
      ctx.moveTo(b.headR * 0.2, sd * b.headR * 0.55);
      ctx.quadraticCurveTo(b.snout * 0.9, sd * b.headR * 0.42, b.snout * 1.15, sd * 1.2);
      ctx.lineTo(b.snout * 1.15, -sd * 0.4);
      ctx.quadraticCurveTo(b.snout * 0.7, -sd * 0.5, b.headR * 0.2, -sd * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f4f0e2";
      for (let i = 0; i < 7; i++) {
        const tx = b.headR * 0.5 + (i / 6) * b.snout * 0.6;
        ctx.beginPath();
        ctx.moveTo(tx, sd * b.headR * 0.34);
        ctx.lineTo(tx + 1.4, sd * (b.headR * 0.34 - sd * 0));
        ctx.lineTo(tx + 0.6, sd * b.headR * 0.1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = shade(b.color, 4);
      ctx.restore();
    });
    ctx.restore();
  }

  // Schnauze
  if (b.snout > 0 && !b.jaws) {
    ctx.fillStyle = shade(b.color, 8);
    ellipse(ctx, b.headR * 0.65, 0, b.snout * 0.85, b.headR * 0.5);
    ctx.fill();
  }
  // Maul beim Biss
  if (bite > 0.05) {
    ctx.fillStyle = "#3a1f22";
    ellipse(ctx, b.headR * 0.85, 0, b.snout * 0.6 * bite + 1.4, b.headR * 0.42 * bite + 1);
    ctx.fill();
    ctx.fillStyle = "#fff";
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(b.headR * 0.95, i * b.headR * 0.22);
      ctx.lineTo(b.headR * 1.25, i * b.headR * 0.1);
      ctx.lineTo(b.headR * 0.95, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Nase & Augen
  ctx.fillStyle = "#2b2320";
  ellipse(ctx, b.headR * 0.62 + b.snout * 0.5, 0, 1.5, 1.2);
  ctx.fill();
  const eyeOpen = p.resting || p.dead ? 0.25 : 1;
  [-1, 1].forEach((s) => {
    ctx.fillStyle = "#f7f3e8";
    ellipse(ctx, b.headR * 0.25, s * b.headR * 0.45, 2.1, 1.7 * eyeOpen);
    ctx.fill();
    ctx.fillStyle = "#20180f";
    ellipse(ctx, b.headR * 0.32, s * b.headR * 0.45, 1.1, 1.1 * eyeOpen);
    ctx.fill();
  });
  ctx.restore();

  // Zunge (Frosch-Spezial auch für Quadrupeden nutzbar)
  if (p.tongue > 0) {
    ctx.strokeStyle = "#d2596b";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hl, 0);
    ctx.lineTo(hl + p.tongue * 90, 0);
    ctx.stroke();
    ctx.fillStyle = "#e2798a";
    ellipse(ctx, hl + p.tongue * 90, 0, 3.4, 3);
    ctx.fill();
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, def: AnimalDef, p: Pose) {
  const b = def.body;
  const segs = 16;
  const amp = (p.attack ? 1.4 : 4 + p.speed01 * 3) * (p.resting ? 0.4 : 1);
  ctx.lineCap = "round";
  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const x = b.len / 2 - t * b.len;
    const y = Math.sin(p.phase * 1.2 - t * 5) * amp * (0.3 + t);
    const w = b.wid * (1 - Math.pow(Math.abs(t - 0.28) * 1.5, 1.6)) * 0.5;
    ctx.fillStyle = i % 3 === 0 ? b.color2 : b.color;
    ellipse(ctx, x, y, Math.max(1, w), Math.max(1, w * 0.85));
    ctx.fill();
  }
  const hx = b.len / 2 + (p.attack ? Math.sin(p.attack.t * Math.PI) * 8 : 0);
  ctx.fillStyle = shade(b.color, 18);
  ellipse(ctx, hx, 0, b.headR, b.headR * 0.7);
  ctx.fill();
  ctx.fillStyle = "#231d12";
  [-1, 1].forEach((s) => {
    ellipse(ctx, hx + 2, s * b.headR * 0.35, 1.3, 1.1);
    ctx.fill();
  });
  // gespaltene Zunge
  const tf = p.tongue > 0 ? p.tongue : (Math.sin(p.phase * 2) > 0.9 ? 0.4 : 0);
  if (tf > 0) {
    ctx.strokeStyle = "#c8354c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + b.headR, 0);
    ctx.lineTo(hx + b.headR + 7 * tf, -2 * tf);
    ctx.moveTo(hx + b.headR, 0);
    ctx.lineTo(hx + b.headR + 7 * tf, 2 * tf);
    ctx.stroke();
  }
}

function drawFrog(ctx: CanvasRenderingContext2D, def: AnimalDef, p: Pose) {
  const b = def.body;
  const hop = Math.max(0, Math.sin(p.phase)) * p.speed01;
  const grad = ctx.createRadialGradient(0, -3, 2, 0, 0, b.len * 0.7);
  grad.addColorStop(0, shade(b.color2, 20));
  grad.addColorStop(1, b.color);
  // Hinterbeine
  [-1, 1].forEach((s) => {
    const ext = 6 + hop * 10;
    limb(ctx, -b.len * 0.15, s * b.wid * 0.4, -b.len * 0.15 - ext, s * (b.wid * 0.75 + ext * 0.4), 4.5, shade(b.color, -25));
    ctx.fillStyle = shade(b.color, -35);
    ellipse(ctx, -b.len * 0.15 - ext, s * (b.wid * 0.75 + ext * 0.4), 4, 2.6, s * 0.5);
    ctx.fill();
  });
  // Vorderbeine
  [-1, 1].forEach((s) => {
    limb(ctx, b.len * 0.25, s * b.wid * 0.32, b.len * 0.42 + hop * 3, s * (b.wid * 0.6), 3.2, shade(b.color, -20));
  });
  ctx.fillStyle = grad;
  ellipse(ctx, 0, 0, b.len * 0.5, b.wid * 0.5);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, b.len * 0.5, b.wid * 0.5, 0, 0, Math.PI * 2);
  ctx.clip();
  pattern(ctx, b, b.len, b.wid);
  ctx.restore();
  // Kopf + Augen
  ctx.fillStyle = shade(b.color, 12);
  ellipse(ctx, b.len * 0.36, 0, b.headR, b.headR * 0.85);
  ctx.fill();
  [-1, 1].forEach((s) => {
    ctx.fillStyle = "#e8d98a";
    ellipse(ctx, b.len * 0.4, s * b.headR * 0.6, 3.2, 2.9);
    ctx.fill();
    ctx.fillStyle = "#191308";
    ellipse(ctx, b.len * 0.43, s * b.headR * 0.6, 1.5, 1.4);
    ctx.fill();
  });
  if (p.attack) {
    ctx.strokeStyle = "#7a3a2c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.len * 0.42, 0, 4, -0.7, 0.7);
    ctx.stroke();
  }
  if (p.tongue > 0) {
    ctx.strokeStyle = "#d2596b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.len * 0.45, 0);
    ctx.lineTo(b.len * 0.45 + p.tongue * 150, 0);
    ctx.stroke();
    ctx.fillStyle = "#e2798a";
    ellipse(ctx, b.len * 0.45 + p.tongue * 150, 0, 4, 3.4);
    ctx.fill();
  }
}


// ---- Skelett: an die Körperform des Tieres angepasst ----------------------
function bone(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
) {
  ctx.strokeStyle = "#efeadc";
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function skull(ctx: CanvasRenderingContext2D, r: number, snout: number) {
  ctx.fillStyle = "#f2eddf";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  // Schnauzenknochen
  ctx.beginPath();
  ctx.moveTo(r * 0.3, -r * 0.42);
  ctx.quadraticCurveTo(r * 0.4 + snout, -r * 0.22, r * 0.4 + snout, 0);
  ctx.quadraticCurveTo(r * 0.4 + snout, r * 0.22, r * 0.3, r * 0.42);
  ctx.closePath();
  ctx.fill();
  // Augenhöhlen
  ctx.fillStyle = "#3a352c";
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, -r * 0.4, r * 0.26, r * 0.22, -0.3, 0, Math.PI * 2);
  ctx.ellipse(-r * 0.1, r * 0.4, r * 0.26, r * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Zähne
  ctx.fillStyle = "#fffaf0";
  for (let i = 0; i < 4; i++) {
    const tx = r * 0.45 + (i / 4) * Math.max(2, snout);
    ctx.fillRect(tx, -0.9, 1.1, 1.8);
  }
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  def: AnimalDef,
  p: Pose,
) {
  const b = def.body;
  const hl = b.len / 2;
  ctx.globalAlpha = p.alpha;
  if (b.form === "snake") {
    ctx.strokeStyle = "#efeadc";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = -hl + t * b.len;
      const y = Math.sin(t * 7 + p.phase * 0.1) * b.wid * 0.6;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, b.wid * 0.28 * (1 - t * 0.5), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(hl, Math.sin(7 + p.phase * 0.1) * b.wid * 0.6);
    skull(ctx, b.headR * 0.8, b.snout);
    ctx.restore();
    return;
  }

  // Wirbelsäule
  bone(ctx, -hl * 0.95 - b.tailLen * 0.9, 0, hl * 0.7, 0, 2.4);
  // Schwanzwirbel
  if (b.tailLen > 4) {
    for (let i = 0; i < 6; i++) {
      const x = -hl * 0.95 - (i / 5) * b.tailLen * 0.9;
      ctx.fillStyle = "#e8e2d2";
      ctx.beginPath();
      ctx.ellipse(x, 0, 1.6, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Rippen
  ctx.strokeStyle = "#efeadc";
  ctx.lineWidth = 1.5;
  const ribs = Math.max(5, Math.round(b.len / 8));
  for (let i = 0; i < ribs; i++) {
    const x = -hl * 0.5 + (i / (ribs - 1)) * b.len * 0.75;
    const w = b.wid * 0.5 * Math.sin(0.35 + (i / ribs) * Math.PI * 0.9);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 1.5, w * 0.8, x - 0.5, w);
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 1.5, -w * 0.8, x - 0.5, -w);
    ctx.stroke();
  }
  // Becken & Schultern
  ctx.strokeStyle = "#e6dfcd";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(hl * 0.42, -b.wid * 0.42);
  ctx.lineTo(hl * 0.42, b.wid * 0.42);
  ctx.moveTo(-hl * 0.72, -b.wid * 0.4);
  ctx.lineTo(-hl * 0.72, b.wid * 0.4);
  ctx.stroke();
  // Beine mit Füßen
  if (b.legLen > 0) {
    const legs: Array<[number, number]> = [
      [hl * 0.42, -b.wid * 0.42],
      [hl * 0.42, b.wid * 0.42],
      [-hl * 0.72, -b.wid * 0.4],
      [-hl * 0.72, b.wid * 0.4],
    ];
    legs.forEach(([lx, ly], i) => {
      const dir = ly < 0 ? -1 : 1;
      const kx = lx + (i < 2 ? 3 : -3);
      const ky = ly + dir * b.legLen * 0.45;
      bone(ctx, lx, ly, kx, ky, 1.7);
      const fx = kx + (i < 2 ? 2 : -2);
      const fy = ky + dir * b.legLen * 0.45;
      bone(ctx, kx, ky, fx, fy, 1.5);
      // Fuß / Zehen
      for (let t = -1; t <= 1; t++) {
        bone(ctx, fx, fy, fx + t * 2 + (i < 2 ? 2.5 : -2.5), fy + dir * 2, 1);
      }
    });
  }
  // Hals + Schädel
  bone(ctx, hl * 0.6, 0, hl * 0.88, 0, 2);
  ctx.save();
  ctx.translate(hl * 0.95 + b.headR * 0.2, 0);
  skull(ctx, b.headR, b.snout);
  ctx.restore();
}

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  def: AnimalDef,
  p: Pose,
) {
  const s = def.scale * p.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Schatten
  ctx.save();
  ctx.globalAlpha = 0.28 * p.alpha * (1 - p.jump * 0.4);
  ctx.fillStyle = "#000";
  ellipse(
    ctx,
    3 * s,
    5 * s + p.jump * 10,
    def.body.len * 0.5 * s * (1 + p.jump * 0.1),
    def.body.wid * 0.42 * s,
  );
  ctx.fill();
  ctx.restore();

  ctx.translate(0, -p.jump * 26 * s);
  ctx.rotate(p.angle);
  ctx.scale(s, s);
  ctx.globalAlpha = p.alpha;
  if (p.rolling) {
    ctx.rotate(p.rolling * Math.PI * 4);
  }
  if (p.dead) {
    ctx.rotate(1.4);
    ctx.globalAlpha = p.alpha * (p.skeleton ? 1 : 0.85);
  }
  if (p.skeleton) {
    drawSkeleton(ctx, def, p);
    ctx.restore();
    return;
  }
  // KI-Sprite (Vogelperspektive), falls vorhanden
  const variant = p.attack && p.attack.t < 0.85 ? p.attack.anim : null;
  const sprite = animalSprite(def.id, Boolean(p.mouthOpen), variant);
  if (sprite) {
    const w = def.body.len * 1.28;
    const h = (w * sprite.naturalHeight) / sprite.naturalWidth;
    const bob = p.dead ? 0 : Math.sin(p.phase) * 0.04 * p.speed01;
    ctx.save();
    ctx.scale(1 + bob, 1 - bob);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (p.hurt > 0) {
      ctx.globalAlpha = p.hurt * 0.45 * p.alpha;
      ctx.fillStyle = "#ff3b30";
      ellipse(ctx, 0, 0, def.body.len * 0.55, def.body.wid * 0.6);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (p.swimming) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, def.body.len * 0.55, def.body.wid * 0.35, 0, 0, Math.PI * 2);
    ctx.clip();
  }
  if (def.body.form === "snake") drawSnake(ctx, def, p);
  else if (def.body.form === "frog") drawFrog(ctx, def, p);
  else drawQuad(ctx, def, p);
  if (p.swimming) ctx.restore();

  if (p.dead && (p.decay ?? 0) > 0) {
    ctx.globalAlpha = Math.min(0.6, (p.decay ?? 0) * 0.6) * p.alpha;
    ctx.fillStyle = "#5b5346";
    ellipse(ctx, 0, 0, def.body.len * 0.5, def.body.wid * 0.5);
    ctx.fill();
    ctx.globalAlpha = p.alpha;
  }

  if (p.hurt > 0) {
    ctx.globalAlpha = p.hurt * 0.5 * p.alpha;
    ctx.fillStyle = "#ff3b30";
    ellipse(ctx, 0, 0, def.body.len * 0.55, def.body.wid * 0.6);
    ctx.fill();
  }
  ctx.restore();
}
