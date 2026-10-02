import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { SeverityPoint } from "@/lib/persistence";

// Thresholds mirror the backend's area "state" bands.
function severityColor(score: number): string {
  if (score > 0.55) return "#ef4444"; // jam
  if (score > 0.3) return "#f59e0b"; // building
  return "#10b981"; // clear
}

function spanLabel(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// Dependency-free severity-over-time sparkline (SVG). Severity is a 0..1 score
// mapped to the full height; the x axis is simply sample order over the window.
export function SeverityChart({ points }: { points: SeverityPoint[] }) {
  const data = useMemo(() => points.slice(-120), [points]);

  const model = useMemo(() => {
    const n = data.length;
    if (n < 2) return null;
    const xy = data.map((p, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(1, p.score)) * 100;
      return [x, y] as const;
    });
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const area = `${line} L100 100 L0 100 Z`;
    const latest = data[n - 1].score;
    const peak = data.reduce((m, p) => Math.max(m, p.score), 0);
    const span = data[n - 1].at - data[0].at;
    return { line, area, latest, peak, span, latestY: 100 - latest * 100 };
  }, [data]);

  if (!model) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Collecting severity readings…
      </p>
    );
  }

  const latestColor = severityColor(model.latest);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Severity trend
        </span>
        <span className="tabular-nums text-[10px] text-muted-foreground/70">
          last {spanLabel(model.span)} · {data.length} pts
        </span>
      </div>

      <div className="relative h-16 w-full overflow-hidden rounded-md border border-border bg-secondary/30">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* 50% reference line */}
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="hsl(var(--border))"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path d={model.area} fill="url(#sev-fill)" />
          <path
            d={model.line}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Latest-value marker (positioned so it isn't distorted by the stretch) */}
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
          style={{ right: 2, top: `${model.latestY}%`, backgroundColor: latestColor }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Now{" "}
          <span className="font-semibold tabular-nums" style={{ color: latestColor }}>
            {Math.round(model.latest * 100)}%
          </span>
        </span>
        <span>
          Peak{" "}
          <span className="font-semibold tabular-nums" style={{ color: severityColor(model.peak) }}>
            {Math.round(model.peak * 100)}%
          </span>
        </span>
      </div>
    </div>
  );
}
