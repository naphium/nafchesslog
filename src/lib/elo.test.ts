import { describe, it, expect } from "vitest";
import { estimateElo, accuracyToElo } from "./elo";

describe("estimateElo", () => {
  it("rates a near-perfect long game above 2400", () => {
    expect(estimateElo({ accuracy: 96, acpl: 12, counts: { best: 30, good: 10 }, moves: 40 }).elo).toBeGreaterThan(2400);
  });
  it("rates a blunder-heavy game below 1200", () => {
    expect(estimateElo({ accuracy: 50, acpl: 120, counts: { blunder: 6, mistake: 6, good: 18 }, moves: 30 }).elo).toBeLessThan(1200);
  });
  it("shrinks very short games toward 1500", () => {
    const e = estimateElo({ accuracy: 99, acpl: 2, counts: { best: 5 }, moves: 5 });
    expect(e.elo).toBeLessThan(1900);
    expect(e.confidence).toBe("low");
  });
  it("maps 75% accuracy to 1900", () => {
    expect(accuracyToElo(75)).toBe(1900);
  });
});
