import { Chess, type Move } from "chess.js";
import { scoreToNum, type PositionEval } from "./engine";

export type Classification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export const CLASS_META: Record<Classification, { label: string; symbol: string }> = {
  brilliant: { label: "Brilliant", symbol: "!!" },
  great: { label: "Great", symbol: "!" },
  best: { label: "Best", symbol: "★" },
  excellent: { label: "Excellent", symbol: "👍" },
  good: { label: "Good", symbol: "✓" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!" },
  mistake: { label: "Mistake", symbol: "?" },
  miss: { label: "Miss", symbol: "✕" },
  blunder: { label: "Blunder", symbol: "??" },
};

export type ParsedGame = { headers: Record<string, string>; moves: Move[]; fens: string[] };

export function parsePgn(pgn: string): ParsedGame {
  const text = pgn.trim();
  if (!text) throw new Error("Please paste a PGN first.");
  const c = new Chess();
  try {
    c.loadPgn(text);
  } catch (e) {
    throw new Error(`Invalid PGN: ${(e as Error).message?.split("\n")[0] ?? "could not parse"}`);
  }
  const moves = c.history({ verbose: true });
  if (moves.length === 0) throw new Error("This PGN contains no moves.");
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  return { headers: c.getHeaders() as Record<string, string>, moves, fens };
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const cap = (n: number) => Math.max(-1500, Math.min(1500, n));

export function winPct(cp: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function evalNum(e: PositionEval, fen: string): number {
  const c = new Chess(fen);
  if (c.isCheckmate()) return c.turn() === "w" ? -10000 : 10000;
  return scoreToNum(e.score);
}

export function classifyMove(move: Move, before: PositionEval, after: PositionEval): {
  cls: Classification;
  loss: number;
  accuracy: number;
} {
  const sign = move.color === "w" ? 1 : -1;
  const b = cap(evalNum(before, move.before) * sign);
  const a = cap(evalNum(after, move.after) * sign);
  const loss = Math.max(0, b - a);
  const wl = Math.max(0, winPct(b) - winPct(a));
  const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * wl) - 3.1669));
  const uci = move.from + move.to + (move.promotion ?? "");
  const isBest = before.lines[0]?.uci === uci;

  let cls: Classification;
  if (isBest || wl < 1) {
    cls = "best";
    const after = new Chess(move.after);
    const captured = move.captured ? VAL[move.captured] : 0;
    const sacrifice =
      VAL[move.piece] > captured + 1 &&
      after.isAttacked(move.to, move.color === "w" ? "b" : "w") &&
      move.piece !== "p";
    const second = before.lines[1] ? cap(scoreToNum(before.lines[1].score) * sign) : null;
    if (sacrifice && loss <= 20 && a > -100) cls = "brilliant";
    else if (isBest && second !== null && b - second >= 150 && a > -200) cls = "great";
  } else if (wl < 3) cls = "excellent";
  else if (wl < 6) cls = "good";
  else if (wl < 10) cls = "inaccuracy";
  // Miss: a clearly winning chance was available but not taken, yet the position isn't lost
  else if (b >= 200 && a > -100 && a < b - 150 && wl < 30) cls = "miss";
  else if (wl < 20) cls = "mistake";
  else cls = "blunder";
  return { cls, loss, accuracy };
}

export function formatScore(e: { cp: number; mate?: number } | undefined): string {
  if (!e) return "0.0";
  if (e.mate !== undefined) return `${e.mate < 0 ? "-" : ""}M${Math.abs(Math.round(e.mate))}`;
  if (Math.abs(e.cp) >= 10000) return e.cp > 0 ? "1-0" : "0-1";
  const v = e.cp / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}
