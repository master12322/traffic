import { useMemo } from "react";
import { KeyRound } from "lucide-react";
import { LEVEL_META, type Segment } from "@/lib/types";

interface MapFallbackProps {
  segments: Segment[];
}

// Shown when no Mapbox token is set. Renders live segments as a glowing
// "radar" scatter so the real-time feed is visible without any map provider.
export function MapFallback({ segments }: MapFallbackProps) {
  const points = useMemo(() => {
    if (segments.length === 0) return [];
    const lngs = segments.map((s) => s.coord[0]);
    const lats = segments.map((s) => s.coord[1]);
    const minLng = Math.min(...lngs),
      maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats),
      maxLat = Math.max(...lats);
    const spanLng = maxLng - minLng || 1;
    const spanLat = maxLat - minLat || 1;
    return segments.map((s) => ({
      seg: s,
      x: 8 + ((s.coord[0] - minLng) / spanLng) * 84,
      y: 8 + (1 - (s.coord[1] - minLat) / spanLat) * 84,
    }));
  }, [segments]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border app-bg">
      <div className="absolute inset-0 grid-overlay opacity-60" />

      {/* Radar sweep */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="h-full w-full animate-[spin_6s_linear_infinite] rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, hsl(173 80% 46% / 0.12) 40deg, transparent 70deg)",
          }}
        />
      </div>

      {points.map(({ seg, x, y }) => {
        const meta = LEVEL_META[seg.level];
        return (
          <div
            key={seg.id}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span
              className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <span
              className="relative block h-3 w-3 rounded-full ring-2 ring-white/70 transition-colors duration-500"
              style={{ backgroundColor: meta.color, boxShadow: `0 0 12px 2px ${meta.color}` }}
            />
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {seg.name} · {seg.speedKph} km/h
            </span>
          </div>
        );
      })}

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-card/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
        <KeyRound className="h-3.5 w-3.5 text-primary" />
        Add <code className="rounded bg-secondary px-1 text-primary">VITE_MAPBOX_TOKEN</code> to see the live traffic map
      </div>
    </div>
  );
}
