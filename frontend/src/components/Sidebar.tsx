import { useState } from "react";
import {
  Bell,
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  LocateFixed,
  MapPin,
  Pentagon,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LEVEL_META, type CongestionLevel } from "@/lib/types";

interface SidebarProps {
  drawing: boolean;
  hasArea: boolean;
  notifications: boolean;
  onToggleDraw: () => void;
  onClearArea: () => void;
  onToggleNotifications: (v: boolean) => void;
  onLocate: () => void;
  locating: boolean;
  visibleLevels: Set<CongestionLevel>;
  levelCounts: Record<CongestionLevel, number>;
  areaActive: boolean;
  onToggleLevel: (lvl: CongestionLevel) => void;
  onIsolateLevel: (lvl: CongestionLevel) => void;
  onShowAllLevels: () => void;
  onFocusWorst: (lvl: CongestionLevel) => void;
  dense?: boolean;
}

const LEGEND: CongestionLevel[] = ["low", "moderate", "heavy", "severe"];

export function Sidebar({
  drawing,
  hasArea,
  notifications,
  onToggleDraw,
  onClearArea,
  onToggleNotifications,
  onLocate,
  locating,
  visibleLevels,
  levelCounts,
  areaActive,
  onToggleLevel,
  onIsolateLevel,
  onShowAllLevels,
  onFocusWorst,
  dense = false,
}: SidebarProps) {
  const hiddenCount = LEGEND.length - visibleLevels.size;
  const [legendOpen, setLegendOpen] = useState(true);

  return (
    <aside className={cn("flex w-full flex-col gap-3 lg:w-72", !dense && "h-full")}>
      <Card className="bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary" /> Watch area
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Draw a zone on the map. Roads inside it are monitored for jams.
          </p>
          <Button onClick={onLocate} variant="secondary" className="w-full" disabled={locating}>
            <LocateFixed className={locating ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {locating ? "Locating…" : "Use my location"}
          </Button>
          <Button onClick={onToggleDraw} variant={drawing ? "default" : "secondary"} className="w-full">
            <Pentagon className="h-4 w-4" />
            {drawing ? "Drawing… click map" : "Draw area"}
          </Button>
          <Button onClick={onClearArea} variant="outline" className="w-full" disabled={!hasArea}>
            <Trash2 className="h-4 w-4" /> Clear area
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-amber-400" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Jam alerts</p>
              <p className="text-xs text-muted-foreground">Notify on heavy / severe</p>
            </div>
            <Switch checked={notifications} onCheckedChange={onToggleNotifications} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <button
            type="button"
            disabled={!dense}
            onClick={() => dense && setLegendOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold leading-none tracking-tight disabled:cursor-default"
          >
            <Layers className="h-4 w-4 text-primary" /> Legend
            {dense && (
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition-transform", legendOpen && "rotate-180")}
              />
            )}
          </button>
          {hiddenCount > 0 && (
            <button
              onClick={onShowAllLevels}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> {hiddenCount} hidden
            </button>
          )}
        </CardHeader>
        <div
          className={cn(
            dense && "grid transition-all duration-300 ease-out",
            dense && (legendOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
          )}
        >
          <div className={cn(dense && "min-h-0 overflow-hidden")}>
            <CardContent className="space-y-1">
          <p className="pb-1 text-[10px] text-muted-foreground/70">
            Click to toggle · right-click for options
          </p>
          {LEGEND.map((lvl) => {
            const on = visibleLevels.has(lvl);
            const meta = LEVEL_META[lvl];
            return (
              <ContextMenu key={lvl}>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={() => onToggleLevel(lvl)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-secondary/70 ${
                      on ? "" : "opacity-40"
                    }`}
                  >
                    <span
                      className="h-2.5 w-6 shrink-0 rounded-full transition"
                      style={{ backgroundColor: meta.color, filter: on ? "none" : "grayscale(1)" }}
                    />
                    <span className={on ? "text-foreground" : "text-muted-foreground line-through"}>
                      {meta.label}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="tabular-nums text-[11px] text-muted-foreground">
                        {levelCounts[lvl] ?? 0}
                      </span>
                      {on ? (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground/60" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>{meta.label}</ContextMenuLabel>
                  <ContextMenuItem onSelect={() => onToggleLevel(lvl)}>
                    {on ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {on ? "Hide this level" : "Show this level"}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onIsolateLevel(lvl)}>
                    <Layers className="h-3.5 w-3.5" /> Show only this level
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={!areaActive || (levelCounts[lvl] ?? 0) === 0}
                    onSelect={() => onFocusWorst(lvl)}
                  >
                    <Crosshair className="h-3.5 w-3.5" /> Focus a road on map
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={onShowAllLevels}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset — show all
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </CardContent>
          </div>
        </div>
      </Card>

      <div className="mt-auto rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Zap className="h-3.5 w-3.5" /> Phase 3
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Live Mapbox traffic, geofenced jam detection, and saved areas with severity history. Next: Web Push alerts.
        </p>
      </div>
    </aside>
  );
}
