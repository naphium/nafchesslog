import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { Engine, type PositionEval } from "@/lib/engine";
import { classifyMove, CLASS_META, formatScore, parsePgn, type Classification, type ParsedGame } from "@/lib/analysis";
import { playMoveSound } from "@/lib/sounds";
import { EvalBar } from "./EvalBar";
import { ClassBadge } from "./Badge";
import { ImportPanel } from "./ImportPanel";
import { fetchChessComAvatars, type GameSummary, type PlayerMeta } from "@/lib/importers";
import { setLastPgn } from "@/lib/recent";
import { estimateElo } from "@/lib/elo";

const Board = lazy(() => import("./Board"));

const SAMPLE = `[Event "Casual Game"]
[Site "London ENG"]
[Date "1851.06.21"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]
[WhiteElo "2600"]
[BlackElo "2500"]
[TimeControl "-"]
[Opening "King's Gambit Accepted: Bishop's Gambit"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`;

type MoveInfo = { cls: Classification; loss: number; accuracy: number };

export function Analyzer() {
  const [meta, setMeta] = useState<PlayerMeta>({});
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [evals, setEvals] = useState<(PositionEval | undefined)[]>([]);
  const [inputOpen, setInputOpen] = useState(true);
  const [engineName, setEngineName] = useState("Loading engine…");
  const [sound, setSound] = useState(true);
  const engineRef = useRef<Engine | null>(null);
  const runId = useRef(0);
  const moveListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const e = new Engine();
    engineRef.current = e;
    e.isReady().then((ok) => setEngineName(ok ? "Stockfish 10 (WASM/JS)" : "Fallback evaluator"));
    return () => e.terminate();
  }, []);

  const review = async (text: string, source?: GameSummary) => {
    setError(null);
    let g: ParsedGame;
    try {
      g = parsePgn(text);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setGame(g);
    setLastPgn(text);
    setMeta({});
    const plat = source?.platform ?? (/chess\.com/i.test(g.headers.Site ?? "") ? "chesscom" : /lichess/i.test(g.headers.Site ?? "") ? "lichess" : undefined);
    if (plat === "chesscom" && g.headers.White && g.headers.Black)
      fetchChessComAvatars(g.headers.White, g.headers.Black).then(setMeta);
    else if (plat) setMeta({ platform: plat });
    if (source) setOrientation(source.userColor === "w" ? "white" : "black");
    setPly(0);
    setEvals([]);
    setInputOpen(false);
    const id = ++runId.current;
    const eng = engineRef.current!;
    for (let i = 0; i < g.fens.length; i++) {
      const r = await eng.analyze(g.fens[i]);
      if (runId.current !== id) return;
      setEvals((prev) => {
        const n = [...prev];
        n[i] = r;
        return n;
      });
    }
  };

  const infos: (MoveInfo | undefined)[] = useMemo(() => {
    if (!game) return [];
    return game.moves.map((m, i) => (evals[i] && evals[i + 1] ? classifyMove(m, evals[i]!, evals[i + 1]!) : undefined));
  }, [game, evals]);

  const summary = useMemo(() => {
    const s = {
      w: { acc: [] as number[], loss: [] as number[], counts: {} as Record<string, number> },
      b: { acc: [] as number[], loss: [] as number[], counts: {} as Record<string, number> },
    };
    game?.moves.forEach((m, i) => {
      const inf = infos[i];
      if (!inf) return;
      s[m.color].acc.push(inf.accuracy);
      s[m.color].loss.push(Math.min(inf.loss, 1000));
      s[m.color].counts[inf.cls] = (s[m.color].counts[inf.cls] ?? 0) + 1;
    });
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const fin = (x: typeof s.w) => {
      const a = avg(x.acc);
      const perf = a === null ? null : estimateElo({ accuracy: a, acpl: avg(x.loss) ?? 0, counts: x.counts, moves: x.acc.length });
      return { ...x, avg: a, acpl: avg(x.loss), perf };
    };
    return { w: fin(s.w), b: fin(s.b) };
  }, [game, infos]);

  const total = game ? game.fens.length : 0;
  const done = evals.filter(Boolean).length;

  const goTo = useCallback(
    (p: number) => {
      if (!game) return;
      const np = Math.max(0, Math.min(game.moves.length, p));
      if (np === ply) return;
      if (sound && np > 0 && np === ply + 1) {
        const m = game.moves[np - 1];
        const c = new Chess(m.after);
        playMoveSound(c.isGameOver() ? "end" : m.san.includes("+") ? "check" : m.captured ? "capture" : "move");
      } else if (sound && np !== ply) playMoveSound("move");
      setPly(np);
    },
    [game, ply, sound],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const map: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: 0, ArrowDown: 1e4 };
      if (e.key in map) {
        e.preventDefault();
        goTo(map[e.key]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [goTo, ply]);

  useEffect(() => {
    moveListRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [ply]);

  const fen = game ? game.fens[ply] : new Chess().fen();
  const last = game && ply > 0 ? game.moves[ply - 1] : undefined;
  const cur = evals[ply];
  const hint = cur?.lines[0] ? { from: cur.lines[0].uci.slice(0, 2), to: cur.lines[0].uci.slice(2, 4) } : undefined;
  const h = game?.headers ?? {};

  const rows: number[] = [];
  if (game) for (let i = 0; i < game.moves.length; i += 2) rows.push(i);

  return (
    <>
    <div className="mx-auto w-full max-w-7xl px-4 pt-6">
      <ImportPanel
        onLoad={(t, src) => review(t, src)}
        sample={SAMPLE}
        error={error}
        collapsed={!inputOpen}
        onToggle={() => setInputOpen((o) => !o)}
      />
    </div>
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Board column */}
      <section className="flex flex-col gap-3">
        <PlayerTag name={orientation === "white" ? h.Black : h.White} elo={orientation === "white" ? h.BlackElo : h.WhiteElo} color={orientation === "white" ? "b" : "w"} avatar={orientation === "white" ? meta.blackAvatar : meta.whiteAvatar} platform={meta.platform} />
        <div className="flex gap-3">
          <div className="hidden lg:flex">
            <EvalBar score={cur?.score} orientation={orientation} />
          </div>
          <div className="relative w-full max-w-[720px]">
            <ClientOnly fallback={<div className="aspect-square w-full rounded-md bg-card" />}>
              <Suspense fallback={<div className="aspect-square w-full rounded-md bg-card" />}>
                <Board fen={fen} orientation={orientation} lastMove={last} hint={hint} />
              </Suspense>
            </ClientOnly>
            {last && infos[ply - 1] && (
              <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-popover/90 px-3 py-1 shadow-lg">
                <ClassBadge cls={infos[ply - 1]!.cls} withLabel />
              </div>
            )}
          </div>
        </div>
        <PlayerTag name={orientation === "white" ? h.White : h.Black} elo={orientation === "white" ? h.WhiteElo : h.BlackElo} color={orientation === "white" ? "w" : "b"} avatar={orientation === "white" ? meta.whiteAvatar : meta.blackAvatar} platform={meta.platform} />
        <div className="lg:hidden">
          <EvalBar score={cur?.score} orientation={orientation} horizontal />
        </div>
        <div className="flex max-w-[760px] items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {[
              ["|<", 0, "Start (↑)"],
              ["<", ply - 1, "Previous (←)"],
              [">", ply + 1, "Next (→)"],
              [">|", 1e4, "End (↓)"],
            ].map(([l, p, t]) => (
              <button key={l as string} title={t as string} onClick={() => goTo(p as number)} disabled={!game} className="btn-nav">
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setSound((s) => !s)} className="btn-ghost" title="Toggle sound">
              {sound ? "🔊" : "🔇"}
            </button>
            <button onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} className="btn-ghost">
              ⇅ Flip
            </button>
          </div>
        </div>
      </section>

      {/* Side panel */}
      <aside className="flex flex-col gap-4">

        {game && (
          <>
            <Panel title={h.Event && h.Event !== "?" ? h.Event : "Game"}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Meta k="White" v={`${h.White ?? "?"}${h.WhiteElo ? ` (${h.WhiteElo})` : ""}`} />
                <Meta k="Black" v={`${h.Black ?? "?"}${h.BlackElo ? ` (${h.BlackElo})` : ""}`} />
                <Meta k="Result" v={h.Result} />
                <Meta k="Date" v={h.Date} />
                <Meta k="Time control" v={h.TimeControl} />
                <Meta k="ECO" v={h.ECO} />
                <div className="col-span-2">
                  <Meta k="Opening" v={h.Opening ?? h.Variant} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(["w", "b"] as const).map((c) => {
                  const p = summary[c].perf;
                  const actual = c === "w" ? h.WhiteElo : h.BlackElo;
                  const diff = p && actual && !isNaN(+actual) ? p.elo - +actual : null;
                  return (
                    <div key={c} className="perf-card">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{c === "w" ? "White" : "Black"} performance</span>
                        {p && <span title="Estimate confidence">{p.confidence}</span>}
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold text-primary">{p && done >= total ? `~${p.elo}` : "…"}</span>
                        {diff !== null && done >= total && (
                          <span className={`font-mono text-xs ${diff >= 0 ? "text-cls-best" : "text-cls-blunder"}`}>
                            {diff >= 0 ? "+" : ""}
                            {diff}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Actual: {actual && actual !== "?" ? actual : "—"}
                        {summary[c].acpl !== null && ` · ACPL ${Math.round(summary[c].acpl!)}`}
                      </div>
                      {p && done >= total && <div className="mt-2 rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">{p.note}</div>}
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Accuracy" action={<span className="text-xs text-muted-foreground">{engineName}</span>}>
              {done < total && (
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Analyzing…</span>
                    <span>
                      {done}/{total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {(["w", "b"] as const).map((c) => (
                  <div key={c} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`h-3 w-3 rounded-sm ${c === "w" ? "bg-eval-white" : "border border-border bg-eval-black"}`} />
                      {c === "w" ? "White" : "Black"}
                    </div>
                    <div className="font-display text-3xl font-bold">
                      {summary[c].avg === null ? "–" : `${summary[c].avg.toFixed(1)}%`}
                    </div>
                    <div className="mt-2 space-y-1">
                      {(Object.keys(CLASS_META) as Classification[]).map((k) => (
                        <div key={k} className="flex items-center justify-between text-xs">
                          <ClassBadge cls={k} withLabel />
                          <span className="font-mono">{summary[c].counts[k] ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Engine Lines" action={<span className="font-mono text-xs text-primary">{formatScore(cur?.score)}</span>}>
              {!cur ? (
                <p className="text-sm text-muted-foreground">Calculating…</p>
              ) : cur.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Game over.</p>
              ) : (
                <div className="space-y-2">
                  {cur.lines.map((l, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md bg-background/50 p-2">
                      <span className="w-12 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-xs font-bold">
                        {formatScore(l.score)}
                      </span>
                      <span className="font-mono text-xs leading-5 text-muted-foreground">
                        <span className="font-bold text-foreground">{l.pv[0]}</span> {l.pv.slice(1).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Moves">
              <div ref={moveListRef} className="max-h-80 overflow-y-auto pr-1">
                <table className="w-full font-mono text-sm">
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i} className="odd:bg-background/40">
                        <td className="w-10 py-1 pl-2 text-muted-foreground">{i / 2 + 1}.</td>
                        {[i, i + 1].map((j) =>
                          game.moves[j] ? (
                            <td key={j} className="w-1/2">
                              <button
                                data-active={ply === j + 1}
                                onClick={() => goTo(j + 1)}
                                className="move-cell"
                              >
                                <span>{game.moves[j].san}</span>
                                {infos[j] && <ClassBadge cls={infos[j]!.cls} />}
                              </button>
                            </td>
                          ) : (
                            <td key={j} />
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </aside>
    </div>
    </>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Meta({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate font-medium">{v && v !== "?" ? v : "—"}</div>
    </div>
  );
}

function PlayerTag({ name, elo, color, avatar, platform }: { name?: string; elo?: string; color: "w" | "b"; avatar?: string; platform?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {avatar ? (
        <img src={avatar} alt="" className="h-7 w-7 rounded-md object-cover" />
      ) : (
        <span className={`flex h-7 w-7 items-center justify-center rounded-md font-bold ${color === "w" ? "bg-eval-white text-eval-black" : "border border-border bg-eval-black text-eval-white"}`}>
          {(name ?? "?")[0]?.toUpperCase()}
        </span>
      )}
      <span className="font-semibold">{name ?? (color === "w" ? "White" : "Black")}</span>
      {elo && elo !== "?" && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{elo}</span>}
      {platform && <span className="text-xs text-muted-foreground">{platform === "chesscom" ? "Chess.com" : "Lichess"}</span>}
    </div>
  );
}
