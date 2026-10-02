// Simulated live congestion engine.
// Generates a stable set of road segments whose congestion level drifts over
// time so the UI shows a believable "live feed" before we wire real sources.

export type CongestionLevel = "low" | "moderate" | "heavy" | "severe";

export interface Segment {
  id: string;
  name: string;
  // [lng, lat] center point of the segment
  coord: [number, number];
  level: CongestionLevel;
  // 0..1 utilisation of the road's capacity
  density: number;
  speedKph: number;
  freeFlowKph: number;
  updatedAt: number;
}

const LEVELS: CongestionLevel[] = ["low", "moderate", "heavy", "severe"];

// A small seed network (centered on central London as a demo area).
const SEED: Array<Omit<Segment, "level" | "density" | "speedKph" | "updatedAt">> = [
  { id: "s1", name: "Oxford St", coord: [-0.1419, 51.5154], freeFlowKph: 50 },
  { id: "s2", name: "Strand", coord: [-0.1195, 51.5101], freeFlowKph: 50 },
  { id: "s3", name: "Euston Rd", coord: [-0.1337, 51.5265], freeFlowKph: 60 },
  { id: "s4", name: "Victoria Embankment", coord: [-0.1206, 51.5085], freeFlowKph: 60 },
  { id: "s5", name: "Park Lane", coord: [-0.1527, 51.5074], freeFlowKph: 70 },
  { id: "s6", name: "Tottenham Court Rd", coord: [-0.1308, 51.5204], freeFlowKph: 48 },
  { id: "s7", name: "Farringdon Rd", coord: [-0.1052, 51.5205], freeFlowKph: 50 },
  { id: "s8", name: "Blackfriars Bridge", coord: [-0.1037, 51.5110], freeFlowKph: 50 },
  { id: "s9", name: "Vauxhall Bridge Rd", coord: [-0.1372, 51.4934], freeFlowKph: 55 },
  { id: "s10", name: "Marylebone Rd", coord: [-0.1570, 51.5225], freeFlowKph: 60 },
];

// Mutable live state keyed by id.
const state = new Map<string, Segment>();

function levelFromDensity(d: number): CongestionLevel {
  if (d > 0.8) return "severe";
  if (d > 0.6) return "heavy";
  if (d > 0.35) return "moderate";
  return "low";
}

// Initialise each segment with a random-ish starting density.
for (const s of SEED) {
  const density = Math.random() * 0.6 + 0.1;
  state.set(s.id, {
    ...s,
    density,
    level: levelFromDensity(density),
    speedKph: Math.round(s.freeFlowKph * (1 - density * 0.8)),
    updatedAt: Date.now(),
  });
}

// Advance the simulation one step: nudge each density by a random walk.
export function tick(): Segment[] {
  const now = Date.now();
  for (const seg of state.values()) {
    const drift = (Math.random() - 0.5) * 0.18;
    let density = Math.min(0.98, Math.max(0.05, seg.density + drift));
    seg.density = density;
    seg.level = levelFromDensity(density);
    seg.speedKph = Math.max(3, Math.round(seg.freeFlowKph * (1 - density * 0.85)));
    seg.updatedAt = now;
  }
  return snapshot();
}

export function snapshot(): Segment[] {
  return Array.from(state.values());
}

export { LEVELS };
