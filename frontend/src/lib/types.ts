export type CongestionLevel = "low" | "moderate" | "heavy" | "severe";

export interface Segment {
  id: string;
  name: string;
  coord: [number, number];
  level: CongestionLevel;
  density: number;
  speedKph: number;
  freeFlowKph: number;
  updatedAt: number;
}

export interface Alert {
  at: number;
  count: number;
  segments: Array<{ id: string; name: string; level: CongestionLevel }>;
}

// One congested road found inside the watch area (from real Mapbox traffic).
export interface AreaSegment {
  key: string;
  label: string; // real street name when available, else road class
  cls: string; // raw Mapbox road class
  level: CongestionLevel;
  named: boolean; // true when label is a real street name
  coord: [number, number]; // representative point on the road, for fly-to
}

// A congestion alert for the watch area, carrying the affected road names.
export interface AreaAlert {
  at: number;
  level: CongestionLevel;
  roads: string[];
}

// A road the user clicked that the map should fly to and highlight.
export interface FocusRoad {
  coord: [number, number];
  label: string;
  level: CongestionLevel;
  nonce: number; // bumped on every click so re-selecting the same road refocuses
}

// Live congestion summary for the user's drawn watch area, derived from the
// real Mapbox traffic tiles clipped to the polygon.
export interface AreaReport {
  at: number;
  total: number;
  counts: Record<CongestionLevel, number>;
  jammed: number; // heavy + severe
  score: number; // 0..1 weighted severity
  state: "clear" | "building" | "jam";
  segments: AreaSegment[]; // non-free-flow roads, worst first
}

export const LEVEL_META: Record<
  CongestionLevel,
  { label: string; color: string; ring: string; text: string }
> = {
  low: { label: "Free flow", color: "#10b981", ring: "shadow-emerald-500/40", text: "text-emerald-400" },
  moderate: { label: "Moderate", color: "#f59e0b", ring: "shadow-amber-500/40", text: "text-amber-400" },
  heavy: { label: "Heavy", color: "#f97316", ring: "shadow-orange-500/40", text: "text-orange-400" },
  severe: { label: "Severe jam", color: "#ef4444", ring: "shadow-red-500/40", text: "text-red-400" },
};
