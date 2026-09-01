import { ANIMALS, type AnimalDef } from "@/game/animals";

type Props = {
  coins: number;
  owned: string[];
  current: string;
  onBuy: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function AnimalCard({
  def,
  owned,
  active,
  coins,
  onBuy,
  onSelect,
}: {
  def: AnimalDef;
  owned: boolean;
  active: boolean;
  coins: number;
  onBuy: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const affordable = coins >= def.price;
  return (
    <div className="rounded-2xl border border-hud-border bg-card/80 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-hud-border"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${def.body.color2}, ${def.body.color})`,
          }}
        >
          <span className="text-lg font-bold text-foreground/90">
            {def.name.slice(0, 1)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">{def.name}</h3>
            <span className="shrink-0 text-xs font-semibold text-coin">
              {def.price === 0 ? "GRATIS" : `${def.price} C`}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{def.note}</p>
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        <Stat label="HP" value={String(def.hp)} />
        <Stat
          label="Tempo"
          value={`${def.speed} km/h${def.swim ? ` · ${def.swim} Wasser` : ""}`}
        />
        <Stat
          label="Angriffe"
          value={def.attacks.map((a) => `${a.name} ${a.damage}`).join(" · ")}
        />
        <Stat label="Spezial" value={`${def.special.name} (${def.special.cooldown}s)`} />
        <Stat label="Biome" value={def.biomes.join(", ")} />
      </div>
      <div className="mt-3">
        {active ? (
          <button
            disabled
            className="w-full rounded-xl bg-primary/25 py-2 text-xs font-semibold text-primary"
          >
            AKTIV
          </button>
        ) : owned ? (
          <button
            onClick={() => onSelect(def.id)}
            className="w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground active:scale-[0.98]"
          >
            AUSWÄHLEN
          </button>
        ) : affordable ? (
          <button
            onClick={() => onBuy(def.id)}
            className="w-full rounded-xl bg-coin py-2 text-xs font-semibold text-coin-foreground active:scale-[0.98]"
          >
            KAUFEN
          </button>
        ) : (
          <button
            disabled
            className="w-full rounded-xl bg-muted py-2 text-xs font-semibold text-muted-foreground"
          >
            ZU WENIG COINS
          </button>
        )}
      </div>
    </div>
  );
}

export function Shop({ coins, owned, current, onBuy, onSelect, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur">
      <header className="flex items-center justify-between border-b border-hud-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Tier-Shop</h2>
          <p className="text-[11px] text-muted-foreground">
            {owned.length} von {ANIMALS.length} Tieren freigeschaltet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-coin/15 px-3 py-1 text-sm font-semibold text-coin">
            {coins} C
          </span>
          <button
            onClick={onClose}
            className="rounded-xl border border-hud-border px-3 py-1.5 text-xs font-semibold"
          >
            Schließen
          </button>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 pb-8">
        {ANIMALS.map((a) => (
          <AnimalCard
            key={a.id}
            def={a}
            owned={owned.includes(a.id)}
            active={current === a.id}
            coins={coins}
            onBuy={onBuy}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
