import { Chess } from "chess.js";

export type Score = { cp: number; mate?: number }; // white perspective
export type Line = { uci: string; san: string; score: Score; pv: string[] };
export type PositionEval = { score: Score; lines: Line[] };

const SF_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
const VALUES: Record<string, number> = { p: 100, n: 300, b: 320, r: 500, q: 900, k: 0 };

export function scoreToNum(s: Score): number {
  if (s.mate !== undefined) return s.mate === 0 ? 0 : Math.sign(s.mate) * (10000 - Math.abs(s.mate) * 10);
  return s.cp;
}

function uciToSan(fen: string, pv: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, 8)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

function materialEval(c: Chess): number {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === "w" ? 1 : -1) * VALUES[p.type];
  return s;
}

function mockEval(fen: string): PositionEval {
  const c = new Chess(fen);
  const side = c.turn() === "w" ? 1 : -1;
  const moves = c.moves({ verbose: true }).map((m) => {
    c.move(m);
    let v = c.isCheckmate() ? 99999 * side : materialEval(c) + (c.inCheck() ? 15 * side : 0);
    // shallow reply: opponent's best capture
    if (!c.isGameOver()) {
      let worst = v;
      for (const r of c.moves({ verbose: true })) {
        c.move(r);
        const rv = c.isCheckmate() ? -99999 * side : materialEval(c);
        c.undo();
        if (side * rv < side * worst) worst = rv;
      }
      v = worst;
    }
    c.undo();
    return { m, v };
  });
  moves.sort((a, b) => side * (b.v - a.v));
  const lines: Line[] = moves.slice(0, 2).map(({ m, v }) => ({
    uci: m.from + m.to + (m.promotion ?? ""),
    san: m.san,
    score: { cp: Math.max(-1500, Math.min(1500, v)) },
    pv: [m.san],
  }));
  return { score: lines[0]?.score ?? { cp: materialEval(c) }, lines };
}

export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<boolean>;
  public usingStockfish = false;

  constructor() {
    this.ready = new Promise((resolve) => {
      try {
        const blob = new Blob([`importScripts("${SF_URL}");`], { type: "application/javascript" });
        this.worker = new Worker(URL.createObjectURL(blob));
        const t = setTimeout(() => resolve(false), 8000);
        this.worker.onmessage = (e) => {
          if (String(e.data).includes("uciok")) {
            clearTimeout(t);
            this.worker!.postMessage("setoption name MultiPV value 2");
            this.usingStockfish = true;
            resolve(true);
          }
        };
        this.worker.onerror = () => resolve(false);
        this.worker.postMessage("uci");
      } catch {
        resolve(false);
      }
    });
  }

  async isReady() {
    return this.ready;
  }

  private cloudMisses = 0;
  resetCloud() {
    this.cloudMisses = 0;
  }

  /** Deep (often depth 30+) evaluations from Lichess' shared cloud database. */
  private async cloud(fen: string): Promise<PositionEval | null> {
    if (this.cloudMisses >= 3) return null;
    try {
      const r = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=2`);
      if (!r.ok) {
        this.cloudMisses++;
        return null;
      }
      const d = (await r.json()) as { pvs: { moves: string; cp?: number; mate?: number }[] };
      this.cloudMisses = 0;
      const lines: Line[] = d.pvs.map((pv) => {
        const uciMoves = pv.moves.split(" ");
        const sans = uciToSan(fen, uciMoves);
        const score: Score = pv.mate !== undefined ? { cp: 0, mate: pv.mate } : { cp: pv.cp ?? 0 };
        return { uci: uciMoves[0], san: sans[0] ?? uciMoves[0], score, pv: sans };
      });
      return lines.length ? { score: lines[0].score, lines } : null;
    } catch {
      this.cloudMisses++;
      return null;
    }
  }

  async analyze(fen: string, depth = 15): Promise<PositionEval> {
    const c = new Chess(fen);
    if (c.isCheckmate()) return { score: { cp: c.turn() === "w" ? -10000 : 10000 }, lines: [] };
    if (c.isGameOver()) return { score: { cp: 0 }, lines: [] };
    const cloud = await this.cloud(fen);
    if (cloud) return cloud;
    const ok = await this.ready;
    if (!ok || !this.worker) return mockEval(fen);
    const side = c.turn() === "w" ? 1 : -1;
    const w = this.worker;
    return new Promise((resolve) => {
      const lines: Record<number, { score: Score; pv: string[] }> = {};
      w.onmessage = (e) => {
        const msg = String(e.data);
        if (msg.startsWith("info") && msg.includes(" pv ")) {
          const mpv = Number(/multipv (\d+)/.exec(msg)?.[1] ?? 1);
          const cp = /score cp (-?\d+)/.exec(msg);
          const mate = /score mate (-?\d+)/.exec(msg);
          const pv = msg.split(" pv ")[1].trim().split(" ");
          const score: Score = mate
            ? { cp: 0, mate: Number(mate[1]) * side }
            : { cp: Number(cp?.[1] ?? 0) * side };
          lines[mpv] = { score, pv };
        } else if (msg.startsWith("bestmove")) {
          const out: Line[] = [1, 2]
            .filter((k) => lines[k])
            .map((k) => {
              const sans = uciToSan(fen, lines[k].pv);
              return { uci: lines[k].pv[0], san: sans[0] ?? lines[k].pv[0], score: lines[k].score, pv: sans };
            });
          resolve({ score: out[0]?.score ?? { cp: 0 }, lines: out });
        }
      };
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go depth ${depth}`);
    });
  }

  terminate() {
    this.worker?.terminate();
  }
}
