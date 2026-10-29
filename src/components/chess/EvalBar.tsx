import { formatScore, winPct } from "@/lib/analysis";
import { scoreToNum, type Score } from "@/lib/engine";

export function EvalBar({
  score,
  orientation,
  horizontal,
}: {
  score?: Score;
  orientation: "white" | "black";
  horizontal?: boolean;
}) {
  const n = score ? Math.max(-1500, Math.min(1500, scoreToNum(score))) : 0;
  const white = score?.mate !== undefined ? (score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50) : winPct(n);
  const label = formatScore(score);
  const flipped = orientation === "black";
  const whiteLeads = n >= 0;

  if (horizontal) {
    return (
      <div className="relative h-6 w-full overflow-hidden rounded-md bg-eval-black">
        <div
          className="absolute inset-y-0 bg-eval-white transition-all duration-500"
          style={{ width: `${white}%`, [flipped ? "right" : "left"]: 0 }}
        />
        <span
          className={`absolute inset-y-0 flex items-center px-2 font-mono text-xs font-bold ${
            whiteLeads ? "text-eval-black" : "text-eval-white"
          }`}
          style={{ [whiteLeads !== flipped ? "left" : "right"]: 0 }}
        >
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className="relative w-4 shrink-0 sm:w-7 self-stretch overflow-hidden rounded-md bg-eval-black">
      <div
        className="absolute inset-x-0 bg-eval-white transition-all duration-500"
        style={{ height: `${white}%`, [flipped ? "top" : "bottom"]: 0 }}
      />
      <span
        className={`absolute inset-x-0 text-center font-mono text-[7px] sm:text-[10px] font-bold ${
          whiteLeads ? "text-eval-black" : "text-eval-white"
        }`}
        style={{ [whiteLeads !== flipped ? "bottom" : "top"]: 4 }}
      >
        {label}
      </span>
    </div>
  );
}
