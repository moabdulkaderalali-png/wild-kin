// Robustes Speichersystem (localStorage, versioniert, autosave + Event-Save)
export type SaveData = {
  version: number;
  coins: number;
  owned: string[];
  current: string;
  discovered: string[];
  stats: {
    damageDealt: number;
    kills: number;
    playtime: number;
    coinsEarned: number;
    deaths: number;
  };
  killedBounty: Record<string, number>;
  updatedAt: number;
};

const KEY = "wildlands-save-v1";
const BACKUP = "wildlands-save-v1-backup";

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  coins: 0,
  owned: ["frog", "mouse"],
  current: "mouse",
  discovered: [],
  stats: { damageDealt: 0, kills: 0, playtime: 0, coinsEarned: 0, deaths: 0 },
  killedBounty: {},
  updatedAt: 0,
};

function parse(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d || typeof d !== "object" || d.version !== 1) return null;
    return {
      ...DEFAULT_SAVE,
      ...d,
      stats: { ...DEFAULT_SAVE.stats, ...(d.stats ?? {}) },
      owned: Array.isArray(d.owned) && d.owned.length ? d.owned : DEFAULT_SAVE.owned,
    } as SaveData;
  } catch {
    return null;
  }
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return { ...DEFAULT_SAVE };
  return (
    parse(window.localStorage.getItem(KEY)) ??
    parse(window.localStorage.getItem(BACKUP)) ?? { ...DEFAULT_SAVE }
  );
}

let lastWrite = 0;
export function writeSave(data: SaveData, force = false) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - lastWrite < 1500) return;
  lastWrite = now;
  const payload = JSON.stringify({ ...data, updatedAt: now });
  try {
    const prev = window.localStorage.getItem(KEY);
    if (prev) window.localStorage.setItem(BACKUP, prev);
    window.localStorage.setItem(KEY, payload);
  } catch {
    /* Speicher voll / privat – Spiel läuft weiter */
  }
}
