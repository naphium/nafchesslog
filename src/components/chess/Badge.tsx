import { CLASS_META, type Classification } from "@/lib/analysis";

const BG: Record<Classification, string> = {
  brilliant: "bg-cls-brilliant",
  great: "bg-cls-great",
  best: "bg-cls-best",
  excellent: "bg-cls-excellent",
  good: "bg-cls-good",
  inaccuracy: "bg-cls-inaccuracy",
  mistake: "bg-cls-mistake",
  miss: "bg-cls-miss",
  blunder: "bg-cls-blunder",
};

export function ClassBadge({ cls, withLabel }: { cls: Classification; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={CLASS_META[cls].label}
        className={`${BG[cls]} inline-flex h-4 min-w-4 text-[8px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-background`}
      >
        {CLASS_META[cls].symbol}
      </span>
      {withLabel && <span className="text-sm">{CLASS_META[cls].label}</span>}
    </span>
  );
}
