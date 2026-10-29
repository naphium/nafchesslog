import type { Classification } from "./analysis";

// Accuracy -> rating anchor points (piecewise linear).
const ANCHORS: [number, number][] = [
  [0, 400],
  [50, 700],
  [65, 1300],
  [75, 1900],
  [82, 2300],
  [88, 2650],
  [93, 2900],
  [100, 3200],
];

export function accuracyToElo(acc: number): number {
  const a = Math.max(0, Math.min(100, acc));
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x1, y1] = ANCHORS[i];
    const [x0, y0] = ANCHORS[i - 1];
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 3000;
}

export type EloEstimate = { elo: number; note: string; confidence: "low" | "medium" | "high" };

/**
 * Estimates performance Elo from accuracy, ACPL, move-class ratios and game length.
 * Short games are shrunk toward 1500 because they carry little signal.
 */
export function estimateElo(input: {
  accuracy: number;
  acpl: number;
  counts: Partial<Record<Classification, number>>;
  moves: number;
}): EloEstimate {
  const { accuracy, acpl, counts, moves } = input;
  const n = Math.max(1, moves);
  const top = (counts.brilliant ?? 0) + (counts.great ?? 0) + (counts.best ?? 0);
  const blunders = counts.blunder ?? 0;
  const mistakes = counts.mistake ?? 0;
  const inacc = counts.inaccuracy ?? 0;

  const accElo = accuracyToElo(accuracy);
  const acplElo = Math.max(400, Math.min(3200, 3100 - 20 * Math.min(acpl, 130)));
  const ratioAdj = (top / n - 0.5) * 300 - (blunders / n) * 900 - (mistakes / n) * 250 - (inacc / n) * 100;

  const raw = 0.55 * accElo + 0.45 * acplElo + ratioAdj;
  const weight = Math.min(1, n / 25);
  const elo = Math.round(Math.max(400, Math.min(3200, 1500 + (raw - 1500) * weight)) / 10) * 10;

  let note: string;
  if (blunders === 0 && top / n >= 0.6) note = `Played like a ~${elo} in tactical accuracy`;
  else if (blunders >= 2) note = `Blunders held this back to ~${elo}`;
  else if (acpl < 30) note = `Solid, low-loss play at a ~${elo} level`;
  else note = `Overall move quality of a ~${elo}`;

  return { elo, note, confidence: n < 12 ? "low" : n < 25 ? "medium" : "high" };
}
