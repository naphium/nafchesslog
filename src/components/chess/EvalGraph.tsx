import { winPct, type Classification } from "@/lib/analysis";
import { scoreToNum, type PositionEval } from "@/lib/engine";

const DOT: Partial<Record<Classification, string>> = {
  brilliant: "fill-cls-brilliant",
  great: "fill-cls-great",
  mistake: "fill-cls-mistake",
  miss: "fill-cls-miss",
  blunder: "fill-cls-blunder",
};

export function EvalGraph({
  evals,
  classes,
  ply,
  onSelect,
}: {
  evals: (PositionEval | undefined)[];
  classes: (Classification | undefined)[];
  ply: number;
  onSelect: (p: number) => void;
}) {
  const n = Math.max(evals.length, 2);
  const W = 400;
  const H = 90;
  const pts = evals.map((e, i) => {
    const v = e ? (e.score.mate !== undefined ? (e.score.mate > 0 ? 100 : 0) : winPct(Math.max(-1500, Math.min(1500, scoreToNum(e.score))))) : 50;
    return [(i / (n - 1)) * W, H - (v / 100) * H] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H} L0,${H} Z` : "";
  const cx = (ply / (n - 1)) * W;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-24 w-full cursor-pointer overflow-visible rounded-lg bg-eval-black"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
      }}
    >
      <path d={area} className="fill-eval-white" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-muted-foreground/40" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <line x1={cx} x2={cx} y1={0} y2={H} className="stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {classes.map((c, i) =>
        c && DOT[c] && pts[i + 1] ? (
          <circle key={i} cx={pts[i + 1][0]} cy={pts[i + 1][1]} r={3.5} className={`${DOT[c]} stroke-background`} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
    </svg>
  );
}
