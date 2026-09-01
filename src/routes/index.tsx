import { createFileRoute } from "@tanstack/react-router";
import { GameShell } from "@/components/game/GameShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wildlands – Realistisches 2D-Tier-Survival für Handy" },
      {
        name: "description",
        content:
          "Spiele als Frosch, Maus, Wolf oder Gepard in einer riesigen lebendigen Öko-Welt: Sahara, Regenwald, Antarktis, Flüsse und Ozeane. Jagen, fressen, überleben, Tiere freischalten.",
      },
      { property: "og:title", content: "Wildlands – 2D-Tier-Survival" },
      {
        property: "og:description",
        content:
          "Riesige Open World mit realistischer Tier-KI, Biomen, Wetter, Tag-Nacht-Zyklus und 13 spielbaren Tieren.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="h-[100dvh] w-full overflow-hidden bg-background">
      <h1 className="sr-only">Wildlands – realistisches 2D-Tier-Survival-Spiel</h1>
      <GameShell />
    </main>
  );
}
