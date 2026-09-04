// KI-generierte Top-Down-Sprites (Vogelperspektive) für alle Tiere.
// Datei-Konvention: src/assets/animals/<id>.png  und  <id>-action.png
const urls = import.meta.glob("../assets/animals/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(urls)) {
  const name = path.split("/").pop()!.replace(/\.png$/, "");
  byName[name] = url;
}

const cache = new Map<string, HTMLImageElement | null>();

function load(name: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  if (cache.has(name)) return cache.get(name) ?? null;
  const url = byName[name];
  if (!url) {
    cache.set(name, null);
    return null;
  }
  const img = new Image();
  img.src = url;
  cache.set(name, img);
  return img;
}

/** Sprite für ein Tier; `action` = Maul offen / Fähigkeit. */
export function animalSprite(id: string, action: boolean): HTMLImageElement | null {
  const img = (action ? load(`${id}-action`) : null) ?? load(id);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export function hasSprite(id: string): boolean {
  return Boolean(byName[id]);
}
