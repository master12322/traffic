import { AlertTriangle, CheckCircle2, Loader2, MapPin, Signpost } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_META, type AreaReport, type AreaSegment, type CongestionLevel } from "@/lib/types";

const STATE_META = {
  clear: { label: "Clear", color: "#10b981", icon: CheckCircle2 },
  building: { label: "Building up", color: "#f59e0b", icon: Loader2 },
  jam: { label: "JAM detected", color: "#ef4444", icon: AlertTriangle },
} as const;

export function AreaStatus({
  report,
  visibleLevels,
  onFocusRoad,
}: {
  report: AreaReport | null;
  visibleLevels: Set<CongestionLevel>;
  onFocusRoad: (seg: Pick<AreaSegment, "coord" | "label" | "level">) => void;
}) {
  if (!report) return null;
  const meta = STATE_META[report.state];
  const Icon = meta.icon;
  const levels = ["low", "moderate", "heavy", "severe"] as const;
  // Highlight the worst named roads currently congested in the area.
  const jammedRoads = report.segments
    .filter((s) => s.named && (s.level === "heavy" || s.level === "severe") && visibleLevels.has(s.level))
    .slice(0, 4);

  return (
    <div className="glass pointer-events-auto absolute left-2 top-2 w-52 rounded-xl p-3 shadow-xl sm:left-3 sm:top-3 sm:w-64">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" /> Watch area
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          {report.total} roads
        </span>
      </div>

      <div
        className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2"
        style={{ backgroundColor: `${meta.color}1f` }}
      >
        <Icon
          className={cn("h-5 w-5", report.state === "building" && "animate-spin")}
          style={{ color: meta.color }}
        />
        <div className="leading-tight">
          <p className="text-sm font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </p>
          <p className="text-[11px] text-muted-foreground">
            severity {Math.round(report.score * 100)}% · {report.jammed} congested
          </p>
        </div>
      </div>

      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-background/70">
        {levels.map((lvl) =>
          report.counts[lvl] ? (
            <div
              key={lvl}
              style={{
                width: `${(report.counts[lvl] / report.total) * 100}%`,
                backgroundColor: LEVEL_META[lvl].color,
              }}
            />
          ) : null
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {levels.map((lvl) => (
          <span key={lvl} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LEVEL_META[lvl].color }} />
            {report.counts[lvl]}
          </span>
        ))}
      </div>

      {jammedRoads.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Signpost className="h-3 w-3 text-primary" /> Congested roads
          </span>
          <div className="flex flex-col gap-1">
            {jammedRoads.map((s) => (
              <button
                key={s.key}
                onClick={() => onFocusRoad(s)}
                title="Show on map"
                className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-xs transition hover:bg-primary/15"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_META[s.level].color }} />
                <span className="truncate font-semibold text-foreground">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
