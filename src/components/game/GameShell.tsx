import { useEffect, useRef, useState } from "react";
import { Game, type Hud } from "@/game/engine";
import { Joystick } from "./Joystick";
import { Shop } from "./Shop";
import { isAudioEnabled, setAudioEnabled, unlockAudio } from "@/game/audio";
import { loadSave } from "@/game/save";

const EMPTY_HUD: Hud = {
  coins: 0,
  hp: 0,
  maxHp: 1,
  animal: "…",
  animalId: "mouse",
  biome: "…",
  attackName: "Biss",
  attackReady: 0,
  specialName: "Spezial",
  specialReady: 0,
  specialTotal: 10,
  timeLabel: "12:00",
  weather: "clear",
  owned: [],
  target: null,
  dead: false,
  stats: { damageDealt: 0, kills: 0, playtime: 0, coinsEarned: 0, deaths: 0 },
  poison: null,
  attackCount: 1,
  attackIndex: 0,
  stamina: 1,
  hunger: 0,
  sprinting: false,
};

const WEATHER_LABEL: Record<string, string> = {
  clear: "Sonnig",
  cloudy: "Bewölkt",
  rain: "Regen",
  storm: "Sturm",
  fog: "Nebel",
  snow: "Schneefall",
};

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [shopOpen, setShopOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [save, setSave] = useState<ReturnType<typeof loadSave> | null>(null);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !started) return;
    const game = new Game(canvas, setHud);
    gameRef.current = game;
    game.start();
    const onResize = () => game.resize();
    const onHide = () => game.persist(true);
    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      game.stop();
      gameRef.current = null;
    };
  }, [started]);

  const g = gameRef.current;
  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100);
  const specialPct = 100 - (hud.specialReady / hud.specialTotal) * 100;

  if (!started) {
    return (
      <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background px-6 text-center">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,var(--color-primary)/0.35,transparent_55%),radial-gradient(circle_at_75%_75%,var(--color-coin)/0.25,transparent_50%)]" />
        <div className="relative">
          <h1 className="text-3xl font-black tracking-tight">WILDLANDS</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Überlebe als Tier in einer riesigen, lebendigen Welt: Sahara, Regenwald,
            Antarktis, Wälder, Savannen, Flüsse und Ozeane.
          </p>
        </div>
        <button
          onClick={() => {
            unlockAudio();
            setStarted(true);
          }}
          className="relative w-full max-w-xs rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg active:scale-[0.98]"
        >
          {save && save.stats.playtime > 5 ? "WEITERSPIELEN" : "SPIEL STARTEN"}
        </button>
        {save && save.stats.playtime > 5 && (
          <p className="relative text-xs text-muted-foreground">
            Gespeichert: {Math.floor(save.coins)} Coins · {save.owned.length} Tiere ·{" "}
            {save.stats.kills} Siege
          </p>
        )}
        <p className="relative max-w-xs text-[11px] text-muted-foreground">
          Steuerung: Joystick unten links, ATTACK und SPECIAL unten rechts. Der
          Fortschritt wird automatisch gespeichert.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />

      {/* Oberes HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-2xl border border-hud-border bg-hud/75 px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {hud.animal}
            </div>
            <div className="mt-1 h-2 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-life transition-[width] duration-200"
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <div className="mt-1 flex w-32 gap-1">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-special transition-[width] duration-150"
                  style={{ width: `${Math.round(hud.stamina * 100)}%` }}
                />
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-coin transition-[width] duration-150"
                  style={{ width: `${Math.round((1 - hud.hunger) * 100)}%` }}
                />
              </div>
            </div>
            <div className="mt-1 text-[10px] text-foreground/80">
              {hud.hp}/{hud.maxHp} HP
              {hud.poison ? (
                <span className="ml-1 text-venom">· {hud.poison}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="rounded-2xl border border-hud-border bg-hud/75 px-3 py-1.5 text-sm font-bold text-coin backdrop-blur-sm">
              {hud.coins} C
            </div>
            <div className="rounded-xl border border-hud-border bg-hud/70 px-2 py-1 text-[10px] text-foreground/80 backdrop-blur-sm">
              {hud.biome} · {hud.timeLabel} · {WEATHER_LABEL[hud.weather] ?? hud.weather}
            </div>
          </div>
        </div>
        {hud.target && (
          <div className="mx-auto w-48 rounded-xl border border-hud-border bg-hud/80 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex justify-between text-[10px] font-semibold">
              <span>{hud.target.name}</span>
              <span>
                {hud.target.hp}/{hud.target.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-danger"
                style={{ width: `${(hud.target.hp / hud.target.max) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Seitliche Buttons */}
      <div className="absolute right-3 top-28 flex flex-col gap-2">
        <button
          onClick={() => setShopOpen(true)}
          className="rounded-xl border border-hud-border bg-hud/80 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm"
        >
          SHOP
        </button>
        <button
          onClick={() => {
            const next = !sound;
            setSound(next);
            setAudioEnabled(next);
          }}
          className="rounded-xl border border-hud-border bg-hud/80 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm"
        >
          {isAudioEnabled() && sound ? "TON AN" : "TON AUS"}
        </button>
        {hud.attackCount > 1 && (
          <button
            onClick={() => g?.cycleAttack()}
            className="rounded-xl border border-hud-border bg-hud/80 px-3 py-2 text-[11px] font-semibold backdrop-blur-sm"
          >
            {hud.attackName}
          </button>
        )}
      </div>

      {/* Steuerung */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-8">
        <Joystick onMove={(x, y) => g?.setMove(x, y)} />
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={() => {
              const next = !sprintOn;
              setSprintOn(next);
              g?.setSprint(next);
            }}
            className={`relative size-16 overflow-hidden rounded-full border text-[10px] font-bold uppercase tracking-wide backdrop-blur-md transition-colors active:scale-95 ${
              sprintOn
                ? "border-special bg-special/85 text-primary-foreground"
                : "border-hud-border bg-hud/80 text-foreground"
            }`}
          >
            <span className="relative z-10">Sprint</span>
            <span
              className="absolute inset-x-0 bottom-0 bg-special/35"
              style={{ height: `${Math.round(hud.stamina * 100)}%` }}
            />
          </button>
          <div className="flex items-end gap-3">
            <button
              onPointerDown={() => g?.pressSpecial()}
              className="relative size-[68px] overflow-hidden rounded-full border border-hud-border bg-special/85 text-[10px] font-bold uppercase text-primary-foreground shadow-lg backdrop-blur-md active:scale-95"
            >
              <span className="relative z-10 block leading-tight">
                Spezial
                <br />
                {hud.specialReady > 0 ? Math.ceil(hud.specialReady) : "bereit"}
              </span>
              <span
                className="absolute inset-x-0 bottom-0 bg-foreground/25"
                style={{ height: `${100 - specialPct}%` }}
              />
            </button>
            <button
              onPointerDown={() => g?.pressAttack()}
              className="relative size-24 overflow-hidden rounded-full border border-hud-border bg-danger/90 text-xs font-black uppercase tracking-wide text-primary-foreground shadow-xl backdrop-blur-md active:scale-95"
            >
              <span className="relative z-10">Attack</span>
              <span
                className="absolute inset-x-0 bottom-0 bg-foreground/25"
                style={{ height: `${Math.min(100, (hud.attackReady / 0.5) * 100)}%` }}
              />
            </button>
          </div>
        </div>
      </div>


      {hud.dead && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur">
          <h2 className="text-2xl font-black">BESIEGT</h2>
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Dein {hud.animal} wurde besiegt. Coins und Fortschritt bleiben gespeichert.
          </p>
          <button
            onClick={() => g?.respawn()}
            className="rounded-2xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground"
          >
            NEU STARTEN
          </button>
          <button
            onClick={() => setShopOpen(true)}
            className="text-xs font-semibold text-muted-foreground underline"
          >
            Anderes Tier wählen
          </button>
        </div>
      )}

      {shopOpen && (
        <Shop
          coins={hud.coins}
          owned={hud.owned}
          current={hud.animalId}
          onBuy={(id) => g?.buy(id)}
          onSelect={(id) => {
            g?.select(id);
            setShopOpen(false);
          }}
          onClose={() => setShopOpen(false)}
        />
      )}
    </div>
  );
}
