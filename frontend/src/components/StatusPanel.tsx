import { useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Bell, ChevronDown, Info, MapPin, Signpost, TrafficCone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CongestionCard } from "./CongestionCard";
import { SeverityChart } from "./SeverityChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SeverityPoint } from "@/lib/persistence";
import {
  LEVEL_META,
  type Alert,
  type AreaAlert,
  type AreaReport,
  type AreaSegment,
  type CongestionLevel,
  type Segment,
} from "@/lib/types";

interface StatusPanelProps {
  segments: Segment[];
  alerts: Alert[];
  areaReport: AreaReport | null;
  areaAlerts: AreaAlert[];
  visibleLevels: Set<CongestionLevel>;
  onFocusRoad: (seg: Pick<AreaSegment, "coord" | "label" | "level">) => void;
  history?: SeverityPoint[];
  dense?: boolean;
}

function StatTile({
  label,
  value,
  accent,
  icon,
  dense,
}: {
  label: string;
  value: string | number;
  accent: string;
  icon: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-secondary/40", dense ? "p-2.5" : "p-3")}>
      <div className="flex items-center justify-between">
        <span className={cn("uppercase tracking-wider text-muted-foreground", dense ? "text-[10px]" : "text-[11px]")}>
          {label}
        </span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className={cn("mt-1 font-semibold tabular-nums", dense ? "text-xl" : "text-2xl")} style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

// Collapsible card section used in the compact (mobile) layout.
function Section({
  title,
  count,
  badgeVariant,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  count: number;
  badgeVariant: "secondary" | "warning";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold">{title}</span>
        <span className="flex items-center gap-1.5">
          <Badge variant={badgeVariant}>{count}</Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <div className={cn("grid transition-all duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </Card>
  );
}

export function StatusPanel({
  segments,
  alerts,
  areaReport,
  areaAlerts,
  visibleLevels,
  onFocusRoad,
  history = [],
  dense = false,
}: StatusPanelProps) {
  // Keep previous densities to show per-card trend arrows.
  const prevRef = useRef<Map<string, number>>(new Map());
  const prev = prevRef.current;
  const areaActive = !!areaReport;

  // Respect the legend's level visibility filters.
  const areaSegs = useMemo(
    () => (areaReport ? areaReport.segments.filter((s) => visibleLevels.has(s.level)) : []),
    [areaReport, visibleLevels]
  );

  // Map a road label → its segment so alert-feed chips can also fly to it.
  const labelToSeg = useMemo(() => {
    const m = new Map<string, AreaSegment>();
    areaReport?.segments.forEach((s) => {
      if (!m.has(s.label)) m.set(s.label, s);
    });
    return m;
  }, [areaReport]);

  const stats = useMemo(() => {
    const total = segments.length;
    const jams = segments.filter((s) => s.level === "heavy" || s.level === "severe").length;
    const avgSpeed = total ? Math.round(segments.reduce((a, s) => a + s.speedKph, 0) / total) : 0;
    const worst = [...segments].sort((a, b) => b.density - a.density)[0];
    return { total, jams, avgSpeed, worst };
  }, [segments]);

  const sorted = useMemo(
    () => [...segments].filter((s) => visibleLevels.has(s.level)).sort((a, b) => b.density - a.density),
    [segments, visibleLevels]
  );

  // Snapshot current densities for the next render's trend comparison.
  const trendMap = new Map(prev);
  segments.forEach((s) => prev.set(s.id, s.density));

  const statTiles = areaActive ? (
    <>
      <StatTile label="Area roads" value={areaReport!.total} accent="#2dd4bf" icon={<MapPin className="h-4 w-4" />} dense={dense} />
      <StatTile label="Congested" value={areaReport!.jammed} accent="#f97316" icon={<TrafficCone className="h-4 w-4" />} dense={dense} />
      <StatTile label="Severity" value={`${Math.round(areaReport!.score * 100)}%`} accent="#ef4444" icon={<AlertTriangle className="h-4 w-4" />} dense={dense} />
      <StatTile label="Free" value={areaReport!.counts.low} accent="#10b981" icon={<Activity className="h-4 w-4" />} dense={dense} />
    </>
  ) : (
    <>
      <StatTile label="Segments" value={stats.total} accent="#2dd4bf" icon={<Activity className="h-4 w-4" />} dense={dense} />
      <StatTile label="Active jams" value={stats.jams} accent="#f97316" icon={<TrafficCone className="h-4 w-4" />} dense={dense} />
      <StatTile label="Avg speed" value={`${stats.avgSpeed}`} accent="#60a5fa" icon={<Activity className="h-4 w-4" />} dense={dense} />
      <StatTile
        label="Worst"
        value={stats.worst ? `${Math.round(stats.worst.density * 100)}%` : "—"}
        accent={stats.worst ? LEVEL_META[stats.worst.level].color : "#94a3b8"}
        icon={<AlertTriangle className="h-4 w-4" />}
        dense={dense}
      />
    </>
  );

  // Shared row renderers (reused by desktop + compact layouts).
  const areaRoadRow = (s: AreaSegment) => (
    <button
      key={s.key}
      onClick={() => onFocusRoad(s)}
      title="Show on map"
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left transition hover:border-primary/60 hover:bg-secondary/70 active:scale-[.99]"
      style={{ boxShadow: `inset 3px 0 0 0 ${LEVEL_META[s.level].color}` }}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_META[s.level].color }} />
        {s.named ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Signpost className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-semibold text-foreground">{s.label}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{s.label}</span>
        )}
      </span>
      <span className={`shrink-0 text-xs font-medium ${LEVEL_META[s.level].text}`}>{LEVEL_META[s.level].label}</span>
    </button>
  );

  const areaAlertRow = (a: AreaAlert, i: number) => (
    <div
      key={a.at + "-" + i}
      className="rounded-lg border border-border bg-secondary/40 px-2.5 py-2"
      style={{ boxShadow: `inset 3px 0 0 0 ${LEVEL_META[a.level].color}` }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: LEVEL_META[a.level].color }}>
          <AlertTriangle className="h-3.5 w-3.5" />
          {LEVEL_META[a.level].label}
        </span>
        <span className="tabular-nums text-[10px] text-muted-foreground/70">{new Date(a.at).toLocaleTimeString()}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {a.roads.slice(0, 6).map((r, j) => {
          const seg = labelToSeg.get(r);
          return (
            <button
              key={r + j}
              disabled={!seg}
              onClick={() => seg && onFocusRoad(seg)}
              title={seg ? "Show on map" : undefined}
              className="max-w-full truncate rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground transition enabled:hover:bg-primary/20 enabled:hover:text-primary disabled:cursor-default"
            >
              {r}
            </button>
          );
        })}
        {a.roads.length > 6 && <span className="px-1 text-[11px] text-muted-foreground">+{a.roads.length - 6}</span>}
      </div>
    </div>
  );

  const demoAlertRow = (a: Alert, i: number) => (
    <div key={a.at + "-" + i} className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <AlertTriangle className="h-3 w-3 text-amber-400" />
        {a.count} road{a.count > 1 ? "s" : ""} congested
      </span>
      <span className="tabular-nums text-muted-foreground/70">{new Date(a.at).toLocaleTimeString()}</span>
    </div>
  );

  // Section title with an explanatory shadcn tooltip (hover/focus).
  const roadsTitle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex cursor-help items-center gap-2">
          {areaActive ? (
            <MapPin className="h-4 w-4 text-primary" />
          ) : (
            <TrafficCone className="h-4 w-4 text-primary" />
          )}
          {areaActive ? "Watch-area roads" : "Live segments"}
          <Info className="h-3 w-3 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] leading-snug">
        {areaActive
          ? "Live-congested roads inside your drawn watch area, worst first. Click any road to fly to it and resolve its address."
          : "Live congestion across the monitored demo network. Click a segment to inspect its speed and density."}
      </TooltipContent>
    </Tooltip>
  );

  // Compact, collapsible layout for the mobile bottom drawer.
  if (dense) {
    return (
      <div className="flex flex-col gap-2.5 pb-2">
        <div className="grid grid-cols-2 gap-2">{statTiles}</div>

        <Section
          title={roadsTitle}
          count={areaActive ? areaSegs.length : sorted.length}
          badgeVariant="secondary"
        >
          <div className="space-y-2 px-3.5 pb-3.5">
            {areaActive ? (
              areaSegs.length === 0 ? (
                <p className="py-6 text-center text-sm text-emerald-400">All clear in this area ✓</p>
              ) : (
                areaSegs.map(areaRoadRow)
              )
            ) : sorted.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Waiting for live data…</p>
            ) : (
              sorted.map((s) => <CongestionCard key={s.id} segment={s} prevDensity={trendMap.get(s.id)} />)
            )}
          </div>
        </Section>

        <Section
          title={<><Bell className="h-4 w-4 text-amber-400" /> {areaActive ? "Area alert feed" : "Alert feed"}</>}
          count={areaActive ? areaAlerts.length : alerts.length}
          badgeVariant="warning"
          defaultOpen={false}
        >
          <div className="space-y-1.5 px-3.5 pb-3.5">
            {areaActive ? (
              areaAlerts.length === 0 ? (
                <p className="py-2 text-center text-xs text-emerald-400">No jams in your area ✓</p>
              ) : (
                areaAlerts.map(areaAlertRow)
              )
            ) : alerts.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No jams detected yet.</p>
            ) : (
              alerts.slice(0, 8).map(demoAlertRow)
            )}
          </div>
        </Section>

        {areaActive && history.length >= 2 && (
          <Card className="bg-card/60 p-3">
            <SeverityChart points={history} />
          </Card>
        )}
      </div>
    );
  }

  // DESKTOP_RETURN
  return (
    <div className="scroll-slim flex h-full flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-2">{statTiles}</div>

      <Card className="flex min-h-[14rem] flex-1 flex-col bg-card/60">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">{roadsTitle}</CardTitle>
          <Badge variant="secondary">{areaActive ? areaSegs.length : sorted.length}</Badge>
        </CardHeader>
        <CardContent className="scroll-slim min-h-0 flex-1 space-y-2 overflow-y-auto">
          {areaActive ? (
            areaSegs.length === 0 ? (
              <p className="py-8 text-center text-sm text-emerald-400">All clear in this area ✓</p>
            ) : (
              areaSegs.map(areaRoadRow)
            )
          ) : (
            <>
              {sorted.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Waiting for live data…</p>
              )}
              {sorted.map((s) => (
                <CongestionCard key={s.id} segment={s} prevDensity={trendMap.get(s.id)} />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shrink-0 bg-card/60">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-amber-400" /> {areaActive ? "Area alert feed" : "Alert feed"}
          </CardTitle>
          <Badge variant="warning">{areaActive ? areaAlerts.length : alerts.length}</Badge>
        </CardHeader>
        <CardContent className="scroll-slim max-h-28 space-y-1.5 overflow-y-auto">
          {areaActive ? (
            areaAlerts.length === 0 ? (
              <p className="py-2 text-center text-xs text-emerald-400">No jams in your area ✓</p>
            ) : (
              areaAlerts.map(areaAlertRow)
            )
          ) : (
            <>
              {alerts.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">No jams detected yet.</p>
              )}
              {alerts.slice(0, 8).map(demoAlertRow)}
            </>
          )}
        </CardContent>
      </Card>

      {areaActive && history.length >= 2 && (
        <Card className="shrink-0 bg-card/60 p-3">
          <SeverityChart points={history} />
        </Card>
      )}
    </div>
  );
}
