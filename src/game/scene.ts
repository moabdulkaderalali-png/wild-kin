// Terrain- und Vegetations-Rendering
import { sample, type Biome, type Prop, valueNoise } from "./world";

const COLORS: Record<Biome, [string, string]> = {
  deep: ["#0b2a44", "#123a5c"],
  ocean: ["#155273", "#1d6f94"],
  ice: ["#9fc4d6", "#c8e0ea"],
  beach: ["#e0d0a4", "#d3c091"],
  river: ["#1f6f8f", "#2b87a8"],
  lake: ["#1b6480", "#2a7f9c"],
  swamp: ["#4a5936", "#5d6b41"],
  desert: ["#dcc084", "#cbab6c"],
  savanna: ["#bda85f", "#ae9852"],
  grass: ["#6f9a44", "#7cab4e"],
  forest: ["#3f6b34", "#4c7a3c"],
  jungle: ["#2e5c2c", "#3a6f33"],
  snow: ["#e8eef2", "#dbe5ec"],
  mountain: ["#8a8578", "#9c9686"],
};

const TILE = 32;

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  w: number,
  h: number,
  time: number,
) {
  const x0 = Math.floor((camX - w / 2) / TILE) * TILE;
  const y0 = Math.floor((camY - h / 2) / TILE) * TILE;
  const cols = Math.ceil(w / TILE) + 2;
  const rows = Math.ceil(h / TILE) + 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const wx = x0 + i * TILE;
      const wy = y0 + j * TILE;
      const s = sample(wx + TILE / 2, wy + TILE / 2);
      const pair = COLORS[s.biome];
      const n = valueNoise(wx * 0.006, wy * 0.006, 17);
      let color = n > 0.62 ? pair[1] : pair[0];
      if (s.water) {
        const wave =
          Math.sin(wx * 0.02 + time * 1.4) * 0.5 +
          Math.sin(wy * 0.025 - time * 1.1) * 0.5;
        color = wave > 0.55 ? pair[1] : pair[0];
      }
      ctx.fillStyle = color;
      ctx.fillRect(wx, wy, TILE + 1, TILE + 1);
      if (s.water && Math.sin(wx * 0.05 + wy * 0.03 + time * 2) > 0.93) {
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(wx + 4, wy + 10, TILE * 0.6, 2);
      }
      if (!s.water) {
        // organische Flecken, bewusst vom Kachelraster entkoppelt
        const t = valueNoise(wx * 0.013 + 11, wy * 0.013 - 7, 5);
        const u = valueNoise(wx * 0.017 - 31, wy * 0.019 + 5, 23);
        if (t > 0.72) {
          ctx.fillStyle = "rgba(0,0,0,0.05)";
          ctx.beginPath();
          ctx.ellipse(
            wx + (u - 0.5) * 120,
            wy + (t - 0.5) * 120,
            26 + u * 24,
            16 + t * 14,
            u * 6,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else if (t < 0.3) {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.beginPath();
          ctx.ellipse(
            wx + (t - 0.5) * 130,
            wy + (u - 0.5) * 130,
            24 + t * 22,
            15 + u * 12,
            t * 7,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
  }
}

function windSway(p: Prop, time: number) {
  return Math.sin(time * 1.6 + p.seed * 12) * (2 + p.seed * 2);
}

export function drawProp(
  ctx: CanvasRenderingContext2D,
  p: Prop,
  time: number,
  canopyPass: boolean,
) {
  const sway = windSway(p, time);
  const eaten = p.eatenUntil > time;
  ctx.save();
  ctx.translate(p.x, p.y);
  switch (p.type) {
    case "grassTuft": {
      if (canopyPass) break;
      ctx.strokeStyle = eaten ? "#6b7a3c" : "#5f8a3a";
      ctx.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2.5, 2);
        ctx.quadraticCurveTo(i * 2.5 + sway * 0.4, -4, i * 3 + sway, eaten ? -3 : -9);
        ctx.stroke();
      }
      break;
    }
    case "flower": {
      if (canopyPass) break;
      ctx.strokeStyle = "#4f7a34";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(sway * 0.4, -6);
      ctx.stroke();
      ctx.fillStyle = p.seed > 0.5 ? "#e2c14a" : "#d97ba2";
      ctx.beginPath();
      ctx.arc(sway * 0.4, -7, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "mushroom": {
      if (canopyPass) break;
      ctx.fillStyle = "#e6dcc6";
      ctx.fillRect(-1.2, -4, 2.4, 5);
      ctx.fillStyle = p.seed > 0.5 ? "#b1452f" : "#8c6a4a";
      ctx.beginPath();
      ctx.ellipse(0, -4, 5, 3.4, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case "rock": {
      if (canopyPass) break;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(2, 3, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
      g.addColorStop(0, "#9d9689");
      g.addColorStop(1, "#6b665d");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.78, p.seed, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "iceBlock": {
      if (canopyPass) break;
      ctx.fillStyle = "rgba(190,220,235,0.9)";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.7, p.seed, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      break;
    }
    case "log": {
      if (canopyPass) break;
      ctx.fillStyle = "#6b4f33";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.45, p.seed * 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "reed": {
      if (canopyPass) break;
      ctx.strokeStyle = "#7d8f47";
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3, 4);
        ctx.quadraticCurveTo(i * 3 + sway, -8, i * 3 + sway * 1.6, -18);
        ctx.stroke();
      }
      break;
    }
    case "bush":
    case "berryBush": {
      if (canopyPass) break;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(2, 4, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? "#3f6b32" : "#4d7d3b";
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 6 + sway * 0.3, Math.sin(a) * 4, 8, 6.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.type === "berryBush" && !eaten) {
        for (let i = 0; i < 7; i++) {
          const a = i * 1.7 + p.seed * 3;
          ctx.save();
          ctx.translate(Math.cos(a) * 7.5, Math.sin(a) * 5.5);
          ctx.scale(0.55, 0.55);
          drawFruit(ctx, p.fruit ?? "berry", p.seed + i * 0.11, 0);
          ctx.restore();
        }
      }
      break;
    }
    case "cactus": {
      if (canopyPass) break;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(4, 4, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3f7141";
      ctx.beginPath();
      ctx.roundRect(-5, -26, 10, 32, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-16, -18, 8, 14, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(8, -22, 8, 16, 4);
      ctx.fill();
      if (p.fruit && !eaten) {
        ctx.fillStyle = "#d4436a";
        ctx.beginPath();
        ctx.arc(0, -28, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "fruit": {
      if (canopyPass) break;
      if (eaten) break;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(2, 3.5, 6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      drawFruit(ctx, p.fruit ?? "berry", p.seed, sway);
      break;
    }
    default: {
      // Bäume: Stamm im Boden-Pass, Krone im Canopy-Pass
      const trunkColor = p.type === "palm" ? "#8a6a42" : "#5d4530";
      if (!canopyPass) {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(p.r * 0.4, p.r * 0.35, p.r * 0.9, p.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = trunkColor;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3, p.r * 0.22), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      ctx.translate(sway * 0.35, 0);
      if (p.type === "pine") {
        for (let l = 0; l < 3; l++) {
          ctx.fillStyle = l === 0 ? "#20401f" : l === 1 ? "#2a5426" : "#356630";
          ctx.beginPath();
          ctx.arc(0, 0, p.r * (1 - l * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (p.type === "palm") {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + p.seed * 3;
          ctx.fillStyle = i % 2 ? "#2f6b34" : "#3d8040";
          ctx.save();
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(p.r * 0.6, 0, p.r * 0.62, p.r * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (p.fruit && !eaten) {
          ctx.fillStyle = "#6b4a2c";
          ctx.beginPath();
          ctx.arc(3, 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (p.type === "acacia") {
        ctx.fillStyle = "#54702f";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.25, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.ellipse(-p.r * 0.3, -p.r * 0.15, p.r * 0.6, p.r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const layers = p.type === "jungleTree" ? 4 : 3;
        for (let l = 0; l < layers; l++) {
          const a = l * 2.1 + p.seed * 6;
          ctx.fillStyle =
            p.type === "jungleTree"
              ? ["#1f4a20", "#2a5c26", "#35702e", "#3f8034"][l] ?? "#2a5c26"
              : ["#345c2b", "#3f6d33", "#4a7c3b"][l] ?? "#3f6d33";
          ctx.beginPath();
          ctx.ellipse(
            Math.cos(a) * p.r * 0.3,
            Math.sin(a) * p.r * 0.25,
            p.r * (0.95 - l * 0.12),
            p.r * (0.8 - l * 0.1),
            a,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.restore();
}

// --- Detaillierte Früchte -------------------------------------------------
function glossy(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  c1: string,
  c2: string,
) {
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, 0.5, 0, 0, rx * 1.4);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-rx * 0.35, -ry * 0.42, rx * 0.26, ry * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function stalk(ctx: CanvasRenderingContext2D, h: number, lean = 0.4) {
  ctx.strokeStyle = "#5d4326";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.6);
  ctx.quadraticCurveTo(lean * 2, -h, lean * 3, -h * 1.2);
  ctx.stroke();
  ctx.fillStyle = "#4e7f34";
  ctx.beginPath();
  ctx.ellipse(lean * 4.5, -h * 1.05, 3.2, 1.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFruit(
  ctx: CanvasRenderingContext2D,
  kind: string,
  seed: number,
  sway = 0,
) {
  ctx.save();
  ctx.rotate(sway * 0.05 + (seed - 0.5) * 0.4);
  switch (kind) {
    case "apple":
      glossy(ctx, 5, 4.8, "#e2564a", "#8e1f1c");
      stalk(ctx, 5);
      break;
    case "pear":
      ctx.fillStyle = "#b7c martial";
      glossy(ctx, 4, 5.4, "#cfd martial", "#7d9a2b");
      break;
    case "plum":
      glossy(ctx, 4.2, 4.6, "#8e5fbf", "#3f2358");
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -4.4);
      ctx.quadraticCurveTo(1.2, 0, 0, 4.4);
      ctx.stroke();
      stalk(ctx, 4);
      break;
    case "orange":
      glossy(ctx, 5, 4.8, "#ffae42", "#c96a09");
      ctx.fillStyle = "rgba(120,60,0,0.25)";
      for (let i = 0; i < 8; i++) {
        const a = i * 0.9 + seed;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 2.6, Math.sin(a) * 2.4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "banana":
      ctx.fillStyle = "#e8c53c";
      ctx.strokeStyle = "#b38f1d";
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.rotate(i * 0.28);
        ctx.beginPath();
        ctx.moveTo(-5, 3);
        ctx.quadraticCurveTo(0, -6, 6, 1);
        ctx.quadraticCurveTo(1, -2.5, -5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = "#6b5a1b";
      ctx.beginPath();
      ctx.arc(-5, 3, 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "coconut":
      glossy(ctx, 5.4, 5, "#8a6238", "#3d2716");
      ctx.strokeStyle = "rgba(40,25,12,0.7)";
      ctx.lineWidth = 0.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-4.5, i * 1.8);
        ctx.quadraticCurveTo(0, i * 2.6, 4.5, i * 1.6);
        ctx.stroke();
      }
      break;
    case "mango":
      ctx.rotate(-0.4);
      glossy(ctx, 6, 4.2, "#ffc247", "#d0532a");
      stalk(ctx, 4, 0.2);
      break;
    case "papaya":
      glossy(ctx, 4.4, 6.4, "#f0b04a", "#b06b1f");
      ctx.fillStyle = "rgba(90,50,10,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 1.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "melon":
      glossy(ctx, 7.5, 6, "#5f9e3c", "#2c5320");
      ctx.strokeStyle = "rgba(20,50,15,0.7)";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2.6, -5.4);
        ctx.quadraticCurveTo(i * 3.4, 0, i * 2.6, 5.4);
        ctx.stroke();
      }
      break;
    case "pineapple":
      ctx.fillStyle = "#4e8a34";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(i * 2.2, -11 - Math.abs(i));
        ctx.lineTo(i * 2.2 + 1.6, -4);
        ctx.closePath();
        ctx.fill();
      }
      glossy(ctx, 4.6, 6.2, "#e0a52f", "#8f5c11");
      ctx.strokeStyle = "rgba(70,40,5,0.5)";
      ctx.lineWidth = 0.7;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-4.4, i * 2);
        ctx.lineTo(4.4, i * 2 - 1.2);
        ctx.stroke();
      }
      break;
    case "fig":
      glossy(ctx, 4.2, 4.8, "#8a5a86", "#3f2340");
      stalk(ctx, 4.2, 0.1);
      break;
    case "grape":
      for (let i = 0; i < 7; i++) {
        const a = i * 1.9 + seed * 4;
        ctx.save();
        ctx.translate(Math.cos(a) * 2.8, Math.sin(a) * 3.4 + 1);
        glossy(ctx, 2.4, 2.3, "#8d6fd0", "#3c2560");
        ctx.restore();
      }
      ctx.fillStyle = "#4e7f34";
      ctx.beginPath();
      ctx.ellipse(2.5, -4.5, 3, 1.6, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cactusFruit":
      glossy(ctx, 3.4, 5, "#d4436a", "#7c1b38");
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 1.6, Math.sin(a) * 2.6);
        ctx.lineTo(Math.cos(a) * 3.4, Math.sin(a) * 5);
        ctx.stroke();
      }
      break;
    default: {
      // Beeren-Traube
      for (let i = 0; i < 5; i++) {
        const a = i * 1.6 + seed * 5;
        ctx.save();
        ctx.translate(Math.cos(a) * 2.6, Math.sin(a) * 2.4);
        glossy(ctx, 2.2, 2.1, "#d2455f", "#6d1226");
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
