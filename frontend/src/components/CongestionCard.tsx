import { ArrowDown, ArrowUp, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_META, type Segment } from "@/lib/types";

interface CongestionCardProps {
  segment: Segment;
  prevDensity?: number;
}

export function CongestionCard({ segment, prevDensity }: CongestionCardProps) {
  const meta = LEVEL_META[segment.level];
  const pct = Math.round(segment.density * 100);
  const trend =
    prevDensity === undefined ? 0 : segment.density - prevDensity;

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-secondary/40 p-3 transition-colors hover:bg-secondary/70"
      style={{ boxShadow: `inset 3px 0 0 0 ${meta.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{segment.name}</p>
          <p className={cn("text-xs font-medium", meta.text)}>{meta.label}</p>
        </div>
        <div className="flex items-center gap-1 text-right">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums text-sm font-semibold">{segment.speedKph}</span>
          <span className="text-[10px] text-muted-foreground">km/h</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/80">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%`, backgroundColor: meta.color }}
          />
        </div>
        <span className="w-9 text-right tabular-nums text-xs text-muted-foreground">{pct}%</span>
        {trend !== 0 && (
          <span
            className={cn(
              "flex items-center text-[10px]",
              trend > 0 ? "text-red-400" : "text-emerald-400"
            )}
          >
            {trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          </span>
        )}
      </div>
    </div>
  );
}
