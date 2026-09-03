// Prozedurale Weltgenerierung: Biome, Gewässer, Vegetation – Chunk-basiert.

export const WORLD_SIZE = 24000;
export const CHUNK = 512;

export type Biome =
  | "deep"
  | "ocean"
  | "beach"
  | "river"
  | "lake"
  | "swamp"
  | "desert"
  | "savanna"
  | "grass"
  | "forest"
  | "jungle"
  | "snow"
  | "ice"
  | "mountain";

export const WATER_BIOMES: Biome[] = ["deep", "ocean", "river", "lake", "ice"];

export const BIOME_LABEL: Record<Biome, string> = {
  deep: "Tiefsee",
  ocean: "Ozean",
  beach: "Strand",
  river: "Fluss",
  lake: "See",
  swamp: "Sumpf",
  desert: "Sahara",
  savanna: "Savanne",
  grass: "Grasland",
  forest: "Wald",
  jungle: "Regenwald",
  snow: "Antarktis",
  ice: "Meereis",
  mountain: "Gebirge",
};

function hash2(x: number, y: number, seed = 1337): number {
  let h = x * 374761393 + y * 668265263 + seed * 144665;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed = 1): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (
    a * (1 - xf) * (1 - yf) + b * xf * (1 - yf) + c * (1 - xf) * yf + d * xf * yf
  );
}

export function fbm(x: number, y: number, oct = 4, seed = 1): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += valueNoise(x * f, y * f, seed + i * 71) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

export type Sample = {
  biome: Biome;
  water: boolean;
  elevation: number;
  moisture: number;
  depth: number; // 0..1 bei Wasser
};

const S_CONT = 0.00022;
const S_MOIST = 0.00035;

export function sample(x: number, y: number): Sample {
  const nx = x * S_CONT;
  const ny = y * S_CONT;
  // Kontinent-Maske: Rand der Welt ist Ozean
  const cx = (x / WORLD_SIZE) * 2 - 1;
  const cy = (y / WORLD_SIZE) * 2 - 1;
  const edge = Math.max(Math.abs(cx), Math.abs(cy));
  const falloff = Math.max(0, 1 - Math.pow(Math.max(0, edge - 0.55) / 0.45, 2));

  let e = fbm(nx, ny, 5, 7) * 0.85 + 0.15;
  e *= 0.35 + 0.65 * falloff;
  const m = fbm(nx * 1.7 + 40, ny * 1.7 - 22, 4, 91);
  const moist = fbm(x * S_MOIST, y * S_MOIST, 3, 313);

  // Temperatur nach Breitengrad (Pole = kalt)
  const lat = Math.abs(y / WORLD_SIZE - 0.5) * 2;
  const temp = 1 - lat + (fbm(nx * 2, ny * 2, 2, 555) - 0.5) * 0.18;

  if (e < 0.30) return { biome: "deep", water: true, elevation: e, moisture: moist, depth: 1 };
  if (e < 0.365) {
    if (temp < 0.22)
      return { biome: "ice", water: true, elevation: e, moisture: moist, depth: 0.6 };
    return { biome: "ocean", water: true, elevation: e, moisture: moist, depth: 0.6 };
  }
  if (e < 0.395)
    return { biome: "beach", water: false, elevation: e, moisture: moist, depth: 0 };

  // Flüsse: Ridged Noise
  const r = fbm(x * 0.00013 + 900, y * 0.00013 - 700, 4, 4242);
  const ridge = Math.abs(r - 0.5);
  if (ridge < 0.0075 && e < 0.72)
    return { biome: "river", water: true, elevation: e, moisture: 1, depth: 0.5 };

  // Seen
  const lake = fbm(x * 0.00055 + 300, y * 0.00055 + 120, 3, 8181);
  if (lake < 0.235 && e < 0.7)
    return { biome: "lake", water: true, elevation: e, moisture: 1, depth: 0.5 };
  if (lake < 0.275 && moist > 0.55 && temp > 0.35)
    return { biome: "swamp", water: false, elevation: e, moisture: 1, depth: 0 };

  if (e > 0.76) return { biome: "mountain", water: false, elevation: e, moisture: moist, depth: 0 };

  if (temp < 0.2) return { biome: "snow", water: false, elevation: e, moisture: moist, depth: 0 };
  if (temp < 0.42)
    return {
      biome: moist > 0.5 ? "forest" : "grass",
      water: false,
      elevation: e,
      moisture: moist,
      depth: 0,
    };
  if (temp < 0.68)
    return {
      biome: moist > 0.62 ? "forest" : moist > 0.4 ? "grass" : "savanna",
      water: false,
      elevation: e,
      moisture: moist,
      depth: 0,
    };
  if (moist > 0.6)
    return { biome: "jungle", water: false, elevation: e, moisture: moist, depth: 0 };
  if (moist > 0.42)
    return { biome: "savanna", water: false, elevation: e, moisture: moist, depth: 0 };
  return { biome: "desert", water: false, elevation: e, moisture: moist, depth: 0 };
}

export function isWater(x: number, y: number): boolean {
  return sample(x, y).water;
}

// ---------- Props ----------
export type PropType =
  | "tree"
  | "pine"
  | "palm"
  | "jungleTree"
  | "acacia"
  | "bush"
  | "berryBush"
  | "cactus"
  | "rock"
  | "grassTuft"
  | "flower"
  | "mushroom"
  | "reed"
  | "iceBlock"
  | "log"
  | "fruit";

export type FruitKind =
  | "berry"
  | "apple"
  | "banana"
  | "coconut"
  | "cactusFruit"
  | "mango"
  | "fig"
  | "papaya"
  | "melon"
  | "grape"
  | "plum"
  | "pineapple"
  | "orange"
  | "pear";

export const FRUIT_LABEL: Record<FruitKind, string> = {
  berry: "Beeren",
  apple: "Apfel",
  banana: "Banane",
  coconut: "Kokosnuss",
  cactusFruit: "Kaktusfeige",
  mango: "Mango",
  fig: "Feige",
  papaya: "Papaya",
  melon: "Melone",
  grape: "Trauben",
  plum: "Pflaume",
  pineapple: "Ananas",
  orange: "Orange",
  pear: "Birne",
};

const FRUITS_BY_BIOME: Record<string, FruitKind[]> = {
  jungle: ["banana", "mango", "papaya", "coconut", "pineapple", "fig"],
  forest: ["apple", "pear", "plum", "berry", "grape"],
  grass: ["apple", "berry", "grape", "plum"],
  savanna: ["melon", "fig", "orange"],
  beach: ["coconut", "papaya"],
  desert: ["cactusFruit", "melon"],
  swamp: ["fig", "berry"],
  mountain: ["berry", "plum"],
  snow: ["berry"],
};

function pickFruit(biome: string, roll: number): FruitKind {
  const list = FRUITS_BY_BIOME[biome] ?? ["berry"];
  return list[Math.floor(roll * list.length) % list.length] as FruitKind;
}

export type Prop = {
  id: string;
  type: PropType;
  x: number;
  y: number;
  r: number; // Kollisions-/Zeichenradius
  seed: number;
  edible: boolean;
  eatenUntil: number; // Zeitstempel bis zum Nachwachsen
  fruit?: FruitKind;
};

const TALL: PropType[] = ["tree", "pine", "palm", "jungleTree", "acacia"];
export function isCanopy(t: PropType) {
  return TALL.includes(t);
}

export function chunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

export function generateProps(cx: number, cy: number): Prop[] {
  const props: Prop[] = [];
  const baseX = cx * CHUNK;
  const baseY = cy * CHUNK;
  const density = 46;
  for (let i = 0; i < density; i++) {
    const rx = hash2(cx * 91 + i, cy * 17 + i * 3, 99);
    const ry = hash2(cx * 31 - i * 7, cy * 53 + i, 1234);
    const x = baseX + rx * CHUNK;
    const y = baseY + ry * CHUNK;
    const s = sample(x, y);
    if (s.water) continue;
    const roll = hash2(i * 13, cx * 7 + cy * 3, 777);
    const seed = hash2(i, cx + cy * 31, 6161);
    let type: PropType | null = null;
    let fruit: Prop["fruit"] | undefined;
    switch (s.biome) {
      case "forest":
        type = roll < 0.34 ? "tree" : roll < 0.5 ? "pine" : roll < 0.62 ? "bush" : roll < 0.7 ? "berryBush" : roll < 0.78 ? "mushroom" : roll < 0.86 ? "rock" : "grassTuft";
        if (type === "berryBush") fruit = pickFruit("forest", seed);
        break;
      case "jungle":
        type = roll < 0.45 ? "jungleTree" : roll < 0.58 ? "palm" : roll < 0.74 ? "bush" : roll < 0.82 ? "fruit" : roll < 0.9 ? "flower" : "grassTuft";
        if (type === "fruit") fruit = pickFruit("jungle", seed);
        break;
      case "savanna":
        type = roll < 0.2 ? "acacia" : roll < 0.28 ? "bush" : roll < 0.34 ? "fruit" : roll < 0.42 ? "rock" : "grassTuft";
        if (type === "fruit") fruit = pickFruit("savanna", seed);
        break;
      case "grass":
        type = roll < 0.12 ? "tree" : roll < 0.22 ? "bush" : roll < 0.3 ? "berryBush" : roll < 0.34 ? "fruit" : roll < 0.4 ? "flower" : "grassTuft";
        if (type === "berryBush" || type === "fruit") fruit = pickFruit("grass", seed);
        break;
      case "desert":
        if (roll < 0.14) type = "cactus";
        else if (roll < 0.22) type = "rock";
        else if (roll < 0.3) type = "grassTuft";
        if (type === "cactus" && roll < 0.09) fruit = "cactusFruit";
        else if (type === null && roll < 0.33) {
          type = "fruit";
          fruit = pickFruit("desert", seed);
        }
        break;
      case "snow":
        type = roll < 0.22 ? "pine" : roll < 0.4 ? "iceBlock" : roll < 0.5 ? "rock" : null;
        break;
      case "mountain":
        type = roll < 0.55 ? "rock" : roll < 0.68 ? "pine" : roll < 0.78 ? "grassTuft" : null;
        break;
      case "swamp":
        type = roll < 0.38 ? "reed" : roll < 0.52 ? "bush" : roll < 0.62 ? "fruit" : roll < 0.72 ? "mushroom" : roll < 0.82 ? "log" : "grassTuft";
        if (type === "fruit") fruit = pickFruit("swamp", seed);
        break;
      case "beach":
        type = roll < 0.12 ? "palm" : roll < 0.2 ? "rock" : null;
        if (type === "palm" && roll < 0.08) fruit = "coconut";
        break;
      default:
        type = null;
    }
    if (!type) continue;
    const isTree = isCanopy(type);
    const r =
      type === "grassTuft" || type === "flower"
        ? 6
        : type === "mushroom"
          ? 5
          : type === "fruit"
            ? 7
            : isTree
              ? 22 + seed * 16
              : type === "rock"
                ? 12 + seed * 12
                : 14;
    const edible =
      type === "berryBush" ||
      type === "fruit" ||
      type === "grassTuft" ||
      type === "bush" ||
      type === "reed" ||
      !!fruit;
    props.push({
      id: `${cx}:${cy}:${i}`,
      type,
      x,
      y,
      r,
      seed,
      edible,
      eatenUntil: 0,
      ...(fruit ? { fruit } : {}),
    });
  }
  return props;
}

// Welche NPC-Arten passen in welches Biom
export const SPAWN_TABLE: Record<Biome, string[]> = {
  deep: [],
  ocean: [],
  ice: ["penguin"],
  beach: ["frog", "rabbit"],
  river: ["frog", "otter", "anaconda", "crocodile"],
  lake: ["frog", "otter", "crocodile"],
  swamp: ["frog", "snake", "otter", "anaconda", "crocodile"],
  desert: ["snake", "hyena", "camel"],
  savanna: ["hyena", "cheetah", "zebra", "snake", "leopard", "goat"],
  grass: ["mouse", "rabbit", "cat", "deer", "goat", "wolf", "cheetah"],
  forest: ["mouse", "rabbit", "hedgehog", "fox", "deer", "wolf", "cat", "leopard"],
  jungle: ["leopard", "komodo", "snake", "frog", "anaconda", "crocodile"],
  snow: ["wolf", "fox", "penguin"],
  mountain: ["goat", "wolf"],
};
