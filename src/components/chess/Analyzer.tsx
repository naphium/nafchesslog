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
import { EvalGraph } from "./EvalGraph";
import coachAsset from "@/assets/coach.png.asset.json";
const coachImg = coachAsset.url;

type SideTab = "report" | "analysis" | "insights" | "settings";

const Board = lazy(() => import("./Board"));


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
  const [tab, setTab] = useState<SideTab>("report");
  const [showHint, setShowHint] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pgnText, setPgnText] = useState("");
  const engineRef = useRef<Engine | null>(null);
  const runId = useRef(0);
  const moveListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const e = new Engine();
    engineRef.current = e;
    e.isReady().then((ok) => setEngineName(ok ? "Stockfish 10 + Lichess cloud" : "Fallback evaluator"));
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
    setPgnText(text);
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
    eng.resetCloud();
    for (let i = 0; i < g.fens.length; i++) {
      const r = await eng.analyze(g.fens[i], 15);
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
      if (["TEXTAREA", "INPUT"].includes((e.target as HTMLElement)?.tagName)) return;
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
    moveListRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [ply]);

  const fen = game ? game.fens[ply] : new Chess().fen();
  const last = game && ply > 0 ? game.moves[ply - 1] : undefined;
  const cur = evals[ply];
  const hint = showHint && cur?.lines[0] ? { from: cur.lines[0].uci.slice(0, 2), to: cur.lines[0].uci.slice(2, 4) } : undefined;
  const h = game?.headers ?? {};
  const analyzed = !!game && done >= total;
  const rows: number[] = [];
  if (game) for (let i = 0; i < game.moves.length; i += 2) rows.push(i);

  // Clocks parsed from [%clk] comments (display only)
  const clocks = useMemo(() => {
    if (!game) return null;
    const byFen = new Map<string, number>();
    try {
      const c = new Chess();
      c.loadPgn(pgnText);
      for (const { fen: f, comment } of c.getComments()) {
        const m = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment ?? "");
        if (m) byFen.set(f, +m[1] * 3600 + +m[2] * 60 + +m[3]);
      }
    } catch {
      /* ignore */
    }
    const base = Number((h.TimeControl ?? "").split("+")[0]) || null;
    const perPly = game.moves.map((_, i) => byFen.get(game.fens[i + 1]) ?? null);
    return { base, perPly, any: byFen.size > 0 };
  }, [game, pgnText, h.TimeControl]);

  const clockFor = (color: "w" | "b") => {
    if (!clocks || (!clocks.any && !clocks.base)) return "--:--";
    let t: number | null = clocks.base;
    for (let i = 0; i < ply; i++) if (game!.moves[i].color === color && clocks.perPly[i] !== null) t = clocks.perPly[i];
    if (t === null) return "--:--";
    const hh = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    const ss = Math.floor(t % 60);
    return `${hh ? `${hh}:` : ""}${hh ? String(mm).padStart(2, "0") : mm}:${String(ss).padStart(2, "0")}`;
  };
  const turn = new Chess(fen).turn();

  // Game phases (display grouping only)
  const phases = useMemo(() => {
    if (!game) return null;
    const val: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };
    const res = { Opening: { w: [] as number[], b: [] as number[] }, Middlegame: { w: [] as number[], b: [] as number[] }, Endgame: { w: [] as number[], b: [] as number[] } };
    let endgame = false;
    game.moves.forEach((m, i) => {
      if (!endgame) {
        let mat = 0;
        for (const row of new Chess(m.before).board()) for (const p of row) if (p && val[p.type]) mat += val[p.type];
        endgame = mat <= 26;
      }
      const ph = endgame ? "Endgame" : i < 20 ? "Opening" : "Middlegame";
      if (infos[i]) res[ph][m.color].push(infos[i]!.accuracy);
    });
    return res;
  }, [game, infos]);
  const phaseCls = (a: number[]): Classification | null => {
    if (!a.length) return null;
    const v = a.reduce((x, y) => x + y, 0) / a.length;
    return v >= 90 ? "best" : v >= 80 ? "good" : v >= 65 ? "inaccuracy" : v >= 50 ? "mistake" : "blunder";
  };

  // Coach message
  const coach = useMemo(() => {
    if (!game) return { text: "Hi! Import a game and I'll walk you through the key moments.", ply: null as number | null };
    if (ply > 0 && infos[ply - 1]) {
      const m = game.moves[ply - 1];
      const inf = infos[ply - 1]!;
      const best = evals[ply - 1]?.lines[0];
      const lbl = CLASS_META[inf.cls].label;
      const alt = best && best.san !== m.san && !["best", "brilliant", "great"].includes(inf.cls) ? ` The engine preferred ${best.san}.` : "";
      return { text: `${m.san} is ${/^[AEIOU]/.test(lbl) ? "an" : "a"} ${lbl} move.${alt}`, ply };
    }
    if (!analyzed) return { text: "Give me a moment, I'm analyzing every move…", ply: null };
    const order: Classification[] = ["brilliant", "great", "blunder"];
    for (const c of order) {
      const i = infos.findIndex((x) => x?.cls === c);
      if (i >= 0) {
        const who = game.moves[i].color === "w" ? h.White ?? "White" : h.Black ?? "Black";
        return { text: `${who} played ${c === "blunder" ? "a Clown" : `${/^[AEIOU]/.test(CLASS_META[c].label) ? "an" : "a"} ${CLASS_META[c].label}`} move on move ${Math.floor(i / 2) + 1}: ${game.moves[i].san}`, ply: i + 1 };
      }
    }
    return { text: "A clean game! Step through the moves to see each rating.", ply: null };
  }, [game, ply, infos, evals, analyzed, h.White, h.Black]);

  const share = async () => {
    const p = coach.ply ?? ply;
    const m = game && p > 0 ? game.moves[p - 1] : null;
    const text = m ? `${Math.floor((p - 1) / 2) + 1}${m.color === "w" ? "." : "..."} ${m.san} — ${coach.text}\nFEN: ${game!.fens[p]}\nReviewed on NafChessLog` : fen;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const topColor = orientation === "white" ? "b" : "w";
  const botColor = orientation === "white" ? "w" : "b";
  const player = (c: "w" | "b") => ({
    name: c === "w" ? h.White : h.Black,
    elo: c === "w" ? h.WhiteElo : h.BlackElo,
    avatar: c === "w" ? meta.whiteAvatar : meta.blackAvatar,
  });

  const TABS: { id: SideTab; label: string; icon: string }[] = [
    { id: "report", label: "Report", icon: "★" },
    { id: "analysis", label: "Analysis", icon: "⚡" },
    { id: "insights", label: "Insights", icon: "◎" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-4 sm:pt-6">
        <ImportPanel onLoad={(t, src) => review(t, src)} error={error} collapsed={!inputOpen} onToggle={() => setInputOpen((o) => !o)} />
      </div>
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
        {/* Board column */}
        <section className="mx-auto flex w-full min-w-0 max-w-[min(100%,calc(100vh-140px))] flex-col gap-2 lg:max-w-[min(100%,calc(100vh-120px))]">
          <PlayerBar {...player(topColor)} color={topColor} clock={clockFor(topColor)} active={!!game && turn === topColor} />
          <div className="flex gap-1.5 sm:gap-2">
            <EvalBar score={cur?.score} orientation={orientation} />
            <div className="relative min-w-0 flex-1">
              <ClientOnly fallback={<div className="aspect-square w-full rounded-md bg-card" />}>
                <Suspense fallback={<div className="aspect-square w-full rounded-md bg-card" />}>
                  <Board fen={fen} orientation={orientation} lastMove={last} hint={hint} />
                </Suspense>
              </ClientOnly>
              {last && infos[ply - 1] && (
                <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-popover/90 px-2.5 py-1 shadow-lg animate-in fade-in zoom-in-90">
                  <ClassBadge cls={infos[ply - 1]!.cls} withLabel />
                </div>
              )}
            </div>
          </div>
          <PlayerBar {...player(botColor)} color={botColor} clock={clockFor(botColor)} active={!!game && turn === botColor} />

          {/* Move strip */}
          <div className="card-dash flex items-center gap-1 p-1.5">
            <button className="btn-nav h-9 min-w-9 shrink-0 px-0" onClick={() => goTo(ply - 1)} disabled={!game} aria-label="Previous move">
              ‹
            </button>
            <div ref={moveListRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none]">
              {!game && <span className="px-2 py-1.5 text-sm text-muted-foreground">Moves will appear here</span>}
              {game?.moves.map((m, i) => (
                <button key={i} data-active={ply === i + 1} onClick={() => goTo(i + 1)} className="move-chip">
                  {m.color === "w" && <span className="text-xs opacity-60">{i / 2 + 1}.</span>}
                  {infos[i] && <ClassBadge cls={infos[i]!.cls} />}
                  {m.san}
                </button>
              ))}
            </div>
            <button className="btn-nav h-9 min-w-9 shrink-0 px-0" onClick={() => goTo(ply + 1)} disabled={!game} aria-label="Next move">
              ›
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button className="btn-ghost h-9 px-3" onClick={() => goTo(0)} disabled={!game} title="Start (↑)">
                |‹
              </button>
              <button className="btn-ghost h-9 px-3" onClick={() => goTo(1e4)} disabled={!game} title="End (↓)">
                ›|
              </button>
            </div>
            <button onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} className="btn-ghost h-9">
              ⇅ Flip
            </button>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="card-dash flex min-w-0 flex-col gap-4 self-start p-3 sm:p-4">
          <div className="flex gap-1 rounded-2xl bg-background/60 p-1">
            {TABS.map((t) => (
              <button key={t.id} data-active={tab === t.id} onClick={() => setTab(t.id)} className="side-tab">
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "report" && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              {/* Coach */}
              <div className="flex gap-3">
                <img src={coachImg} alt="Coach" width={64} height={64} className="h-14 w-14 shrink-0 rounded-full border border-border object-cover sm:h-16 sm:w-16" />
                <div className="min-w-0 flex-1">
                  <div className="bubble">{coach.text}</div>
                  {game && (
                    <div className="mt-2 flex gap-2">
                      {coach.ply !== null && coach.ply !== ply && (
                        <button className="btn-ghost h-8 text-xs" onClick={() => goTo(coach.ply!)}>
                          Show me
                        </button>
                      )}
                      <button className="btn-primary h-8 text-xs" onClick={share}>
                        {copied ? "Copied!" : "Share the move"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {game ? (
                <>
                  {!analyzed && (
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Analyzing with {engineName}</span>
                        <span>
                          {done}/{total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <EvalGraph evals={evals.length ? game.fens.map((_, i) => evals[i]) : []} classes={infos.map((x) => x?.cls)} ply={ply} onSelect={goTo} />

                  {/* Breakdown table */}
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-background/50 px-3 py-2 text-sm">
                      <span className="truncate font-semibold">{h.White ?? "White"}</span>
                      <span />
                      <span className="truncate text-right font-semibold">{h.Black ?? "Black"}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5">
                      <span className="w-fit rounded-lg bg-eval-white px-2.5 py-1 font-display text-lg font-bold text-eval-black">{summary.w.avg?.toFixed(1) ?? "–"}</span>
                      <span className="text-xs text-muted-foreground">Accuracy</span>
                      <span className="ml-auto w-fit rounded-lg border border-border bg-eval-black px-2.5 py-1 font-display text-lg font-bold">{summary.b.avg?.toFixed(1) ?? "–"}</span>
                    </div>
                    {(Object.keys(CLASS_META) as Classification[]).map((k) => (
                      <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border/60 px-3 py-1.5 text-sm">
                        <span className="font-mono">{summary.w.counts[k] ?? 0}</span>
                        <span className="flex w-28 justify-center">
                          <ClassBadge cls={k} withLabel />
                        </span>
                        <span className="text-right font-mono">{summary.b.counts[k] ?? 0}</span>
                      </div>
                    ))}
                  </div>

                  {/* Game rating */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <RatingCard elo={analyzed ? summary.w.perf?.elo : undefined} actual={h.WhiteElo} light />
                    <span className="text-center text-xs text-muted-foreground">Game
                      <br />
                      rating
                    </span>
                    <RatingCard elo={analyzed ? summary.b.perf?.elo : undefined} actual={h.BlackElo} />
                  </div>
                  {analyzed && (summary.w.perf || summary.b.perf) && (
                    <div className="flex flex-wrap gap-1.5">
                      {[summary.w.perf, summary.b.perf].map((p, i) => p && (
                        <span key={i} className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] text-primary">
                          {i ? "Black" : "White"}: {p.note}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Phases */}
                  <div className="overflow-hidden rounded-xl border border-border">
                    {phases &&
                      (["Opening", "Middlegame", "Endgame"] as const).map((ph, i) => {
                        const wc = phaseCls(phases[ph].w);
                        const bc = phaseCls(phases[ph].b);
                        return (
                          <div key={ph} className={`grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2 text-sm ${i ? "border-t border-border/60" : ""}`}>
                            <span>{wc ? <ClassBadge cls={wc} /> : <span className="text-muted-foreground">–</span>}</span>
                            <span className="w-28 text-center text-muted-foreground">{ph}</span>
                            <span className="text-right">{bc ? <ClassBadge cls={bc} /> : <span className="text-muted-foreground">–</span>}</span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Search a username or paste a PGN above to get your game report.</p>
              )}
            </div>
          )}

          {tab === "analysis" && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Engine lines</span>
                  <span className="font-mono text-primary">{formatScore(cur?.score)}</span>
                </div>
                {!game ? (
                  <p className="text-sm text-muted-foreground">No game loaded.</p>
                ) : !cur ? (
                  <p className="text-sm text-muted-foreground">Calculating…</p>
                ) : cur.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Game over.</p>
                ) : (
                  <div className="space-y-2">
                    {cur.lines.map((l, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg bg-background/50 p-2">
                        <span className="w-12 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-xs font-bold">{formatScore(l.score)}</span>
                        <span className="min-w-0 font-mono text-xs leading-5 text-muted-foreground">
                          <span className="font-bold text-foreground">{l.pv[0]}</span> {l.pv.slice(1).join(" ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {game && (
                <>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                    <table className="w-full font-mono text-sm">
                      <tbody>
                        {rows.map((i) => (
                          <tr key={i} className="odd:bg-background/40">
                            <td className="w-10 py-1 pl-2 text-muted-foreground">{i / 2 + 1}.</td>
                            {[i, i + 1].map((j) =>
                              game.moves[j] ? (
                                <td key={j} className="w-1/2">
                                  <button data-active={ply === j + 1} onClick={() => goTo(j + 1)} className="move-cell">
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
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Meta k="Event" v={h.Event} />
                    <Meta k="Date" v={h.Date} />
                    <Meta k="Result" v={h.Result} />
                    <Meta k="Time control" v={h.TimeControl} />
                    <div className="col-span-2">
                      <Meta k="Opening" v={h.Opening ?? h.ECO} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "insights" && (
            <div className="flex flex-col gap-2 animate-in fade-in duration-300">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Key moments</p>
              {!game || !infos.some((x) => x && ["brilliant", "great", "mistake", "blunder"].includes(x.cls)) ? (
                <p className="text-sm text-muted-foreground">{game ? "No key moments yet." : "No game loaded."}</p>
              ) : (
                infos.map((x, i) =>
                  x && ["brilliant", "great", "mistake", "blunder"].includes(x.cls) ? (
                    <button key={i} onClick={() => goTo(i + 1)} data-active={ply === i + 1} className="game-row data-[active=true]:bg-secondary">
                      <ClassBadge cls={x.cls} />
                      <span className="font-mono">
                        {Math.floor(i / 2) + 1}
                        {game.moves[i].color === "w" ? "." : "…"} {game.moves[i].san}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                        {CLASS_META[x.cls].label}
                        {evals[i]?.lines[0] && !["brilliant", "great"].includes(x.cls) ? ` · best ${evals[i]!.lines[0].san}` : ""}
                      </span>
                    </button>
                  ) : null,
                )
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="flex flex-col gap-2 text-sm animate-in fade-in duration-300">
              <Toggle label="Move sounds" on={sound} set={setSound} />
              <Toggle label="Show best-move arrow" on={showHint} set={setShowHint} />
              <Toggle label="View as Black" on={orientation === "black"} set={(v) => setOrientation(v ? "black" : "white")} />
              <p className="pt-2 text-xs text-muted-foreground">Engine: {engineName}</p>
              <p className="text-xs text-muted-foreground">Keys: ← → step, ↑ start, ↓ end</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
      <span>{label}</span>
      <span data-on={on} className="relative h-5 w-9 rounded-full bg-muted transition-colors data-[on=true]:bg-primary">
        <span data-on={on} className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-foreground transition-transform data-[on=true]:translate-x-4" />
      </span>
    </button>
  );
}

function RatingCard({ elo, actual, light }: { elo?: number; actual?: string; light?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${light ? "bg-eval-white text-eval-black" : "border border-border bg-eval-black"}`}>
      <div className="font-display text-2xl font-bold">{elo ?? "…"}</div>
      <div className="text-[11px] opacity-70">Actual {actual && actual !== "?" ? actual : "—"}</div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate font-medium">{v && v !== "?" ? v : "—"}</div>
    </div>
  );
}

function PlayerBar({ name, elo, color, avatar, clock, active }: { name?: string; elo?: string; color: "w" | "b"; avatar?: string; clock: string; active: boolean }) {
  return (
    <div className="player-bar">
      <div className="flex min-w-0 items-center gap-2">
        {avatar ? (
          <img src={avatar} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold ${color === "w" ? "bg-eval-white text-eval-black" : "border border-border bg-eval-black text-eval-white"}`}>
            {(name ?? (color === "w" ? "W" : "B"))[0]?.toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-semibold">{name ?? (color === "w" ? "White" : "Black")}</span>
        {elo && elo !== "?" && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{elo}</span>}
      </div>
      <span className="clock" data-active={active}>
        {clock}
      </span>
    </div>
  );
}
