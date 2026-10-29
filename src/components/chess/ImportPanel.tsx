import { useEffect, useState } from "react";
import { fetchChessCom, fetchLichess, type GameSummary, type Platform } from "@/lib/importers";
import { addRecentUser, getLastPgn, getRecentUsers, type RecentUser } from "@/lib/recent";

type Tab = Platform | "pgn";

const ChessComIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
    <path d="M12 2a3 3 0 0 0-1.6 5.5L9 11h6l-1.4-3.5A3 3 0 0 0 12 2Zm-4 10v2h8v-2H8Zm-1 3-1 5h12l-1-5H7Z" />
  </svg>
);
const LichessIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
    <path d="M8 3c4 0 9 2 11 8 1 3 0 7-2 10H6c0-3 1-5 3-7-2 0-4 1-5 2l-1-3c2-3 4-4 6-5-1-1-2-1-3-1l2-4Z" />
  </svg>
);
const PgnIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} aria-hidden>
    <path d="M14 3H6v18h12V7l-4-4Zm0 0v4h4M9 13h6M9 17h6" />
  </svg>
);

const RESULT_STYLE = { win: "bg-cls-best/20 text-cls-best", loss: "bg-cls-blunder/20 text-cls-blunder", draw: "bg-muted text-muted-foreground" };

export function ImportPanel({
  onLoad,
  error,
  collapsed,
  onToggle,
}: {
  onLoad: (pgn: string, game?: GameSummary) => void;
  error: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chesscom");
  const [username, setUsername] = useState("");
  const [pgn, setPgn] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentUser[]>([]);
  const [lastPgn, setLast] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setRecent(getRecentUsers());
    setLast(getLastPgn());
  }, []);

  const search = async (platform: Platform, name: string) => {
    if (!name.trim()) return;
    setTab(platform);
    setUsername(name);
    setLoading(true);
    setFetchError(null);
    setGames(null);
    try {
      const list = platform === "chesscom" ? await fetchChessCom(name) : await fetchLichess(name);
      setGames(list);
      setRecent(addRecentUser({ platform, username: name.trim() }));
    } catch (e) {
      setFetchError((e as Error).message || "Could not fetch games.");
    } finally {
      setLoading(false);
    }
  };

  const readFile = async (f?: File) => {
    if (!f) return;
    const text = await f.text();
    setPgn(text);
    onLoad(text);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chesscom", label: "Chess.com", icon: <ChessComIcon /> },
    { id: "lichess", label: "Lichess", icon: <LichessIcon /> },
    { id: "pgn", label: "PGN / File", icon: <PgnIcon /> },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-background/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                if (collapsed) onToggle();
              }}
              data-active={tab === t.id}
              className="tab-btn"
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {lastPgn && (
            <button className="btn-ghost h-9" onClick={() => onLoad(lastPgn)}>
              ↺ Last review
            </button>
          )}
          <button className="btn-ghost h-9 w-9 px-0" onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 animate-in fade-in duration-200">
          {tab !== "pgn" ? (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  search(tab, username);
                }}
              >
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={`${tab === "chesscom" ? "chess.com" : "Lichess"} username (ex. MdNafimMuttaki)`}
                  className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button className="btn-primary" disabled={loading}>
                  {loading ? "Fetching…" : "Fetch games"}
                </button>
              </form>
              {recent.filter((r) => r.platform === tab).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recent
                    .filter((r) => r.platform === tab)
                    .map((r) => (
                      <button key={r.username} onClick={() => search(r.platform, r.username)} className="chip">
                        {r.username}
                      </button>
                    ))}
                </div>
              )}
              {fetchError && <p className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{fetchError}</p>}
              {loading && (
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              )}
              {games && (
                <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {games.map((g) => {
                    const opp = g.userColor === "w" ? g.black : g.white;
                    const oppElo = g.userColor === "w" ? g.blackElo : g.whiteElo;
                    const myElo = g.userColor === "w" ? g.whiteElo : g.blackElo;
                    return (
                      <li key={g.id}>
                        <button onClick={() => onLoad(g.pgn, g)} className="game-row">
                          <span className={`w-12 rounded px-1.5 py-0.5 text-center text-xs font-bold uppercase ${RESULT_STYLE[g.result]}`}>
                            {g.result}
                          </span>
                          <span className={`h-3 w-3 shrink-0 rounded-sm ${g.userColor === "w" ? "bg-eval-white" : "border border-border bg-eval-black"}`} />
                          <span className="min-w-0 flex-1 truncate">
                            vs <b>{opp}</b> <span className="text-muted-foreground">({oppElo ?? "?"})</span>
                          </span>
                          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{myElo}</span>
                          <span className="w-20 text-right text-xs capitalize text-muted-foreground">{g.speed}</span>
                          <span className="hidden w-20 text-right text-xs text-muted-foreground md:inline">
                            {g.date ? new Date(g.date).toLocaleDateString() : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div
              className="flex flex-col gap-2"
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                readFile(e.dataTransfer.files[0]);
              }}
            >
              <textarea
                value={pgn}
                onChange={(e) => setPgn(e.target.value)}
                placeholder={'Paste PGN here, or drop a .pgn file\n\n[Event "..."]\n1. e4 e5 2. Nf3 ...'}
                data-drag={drag}
                className="h-40 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:border-primary data-[drag=true]:border-primary data-[drag=true]:bg-primary/10"
              />
              <div className="flex gap-2">
                <button onClick={() => onLoad(pgn)} className="btn-primary flex-1">
                  Review Game
                </button>
                <label className="btn-ghost cursor-pointer">
                  Upload .pgn
                  <input type="file" accept=".pgn,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          )}
          {error && <p className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
