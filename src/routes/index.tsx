import { createFileRoute } from "@tanstack/react-router";
import { Analyzer } from "@/components/chess/Analyzer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NafChessLog — Free PGN Chess Game Review" },
      { name: "description", content: "Paste a PGN and review your chess game with Stockfish: eval bar, move classifications, accuracy and best lines." },
      { property: "og:title", content: "NafChessLog — Free PGN Chess Game Review" },
      { property: "og:description", content: "Analyze chess games in your browser with Stockfish." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <span className="text-2xl text-primary">♞</span>
          <h1 className="font-display text-xl font-bold tracking-tight">
            Naf<span className="text-primary">Chess</span>Log
          </h1>
          <span className="ml-2 hidden text-sm text-muted-foreground sm:inline">Game Review</span>
        </div>
      </header>
      <main className="flex-1">
        <Analyzer />
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>
          Built by Md. Nafim Muttaki •{" "}
          <a className="text-primary hover:underline" href="https://nafim.vercel.app" target="_blank" rel="noreferrer">
            Portfolio
          </a>
        </p>
        <p className="mt-1">
          Enjoying the tool?{" "}
          <a className="text-primary hover:underline" href="https://buymeacoffee.com/mdnafimmuttaki" target="_blank" rel="noreferrer">
            Buy Me a Coffee ☕
          </a>
        </p>
        <p className="mt-1 text-xs">Powered by chess.js and Stockfish WASM.</p>
      </footer>
    </div>
  );
}
