// File-backed persistence for watch areas + congestion snapshots.
// Deliberately NOT a database: Phase 3 keeps everything in-memory and mirrors
// it to a single JSON file so areas and severity history survive restarts
// without standing up MongoDB. Keyed by an anonymous per-browser clientId
// (no user accounts yet).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type CongestionLevel = "low" | "moderate" | "heavy" | "severe";

export interface StoredArea {
  clientId: string;
  name: string;
  geometry: unknown; // GeoJSON Polygon
  sig: string; // fingerprint of the geometry, for change detection
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  at: number;
  score: number; // 0..1 weighted severity
  jammed: number; // heavy + severe road count
  total: number; // roads sampled in the area
  state: "clear" | "building" | "jam";
  counts?: Record<CongestionLevel, number>;
}

// A browser Web Push subscription (as produced by PushManager.subscribe()).
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// Keep history bounded so the JSON file can't grow without limit.
const MAX_SNAPSHOTS = 600; // per client
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dir, "..", "data-store");
const DATA_FILE = join(DATA_DIR, "store.json");

interface Persisted {
  areas: Record<string, StoredArea>;
  snapshots: Record<string, Snapshot[]>;
  subs: Record<string, PushSub[]>; // Web Push subscriptions per client
  vapid?: VapidKeys; // stable keys so existing subscriptions keep working
}

const db: Persisted = { areas: {}, snapshots: {}, subs: {} };

// Hydrate from disk on module load (best-effort — a corrupt file is ignored).
(function load() {
  try {
    if (!existsSync(DATA_FILE)) return;
    const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Persisted>;
    if (parsed.areas) Object.assign(db.areas, parsed.areas);
    if (parsed.snapshots) Object.assign(db.snapshots, parsed.snapshots);
    if (parsed.subs) Object.assign(db.subs, parsed.subs);
    if (parsed.vapid) db.vapid = parsed.vapid;
    console.log(
      `✓ store: loaded ${Object.keys(db.areas).length} area(s), ` +
        `${Object.keys(db.snapshots).length} history series, ` +
        `${Object.values(db.subs).reduce((n, s) => n + s.length, 0)} push sub(s)`
    );
  } catch (err) {
    console.warn("store: could not read persisted data, starting fresh", err);
  }
})();

// Debounced, best-effort write so bursts of snapshots don't thrash the disk.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(db), "utf8");
    } catch (err) {
      console.warn("store: failed to persist data", err);
    }
  }, 1000);
  // Never keep the process alive just to flush a pending save.
  if (typeof saveTimer.unref === "function") saveTimer.unref();
}

function fingerprint(geometry: unknown): string {
  const coords = (geometry as { coordinates?: unknown })?.coordinates ?? geometry;
  try {
    return JSON.stringify(coords);
  } catch {
    return String(coords);
  }
}

function prune(list: Snapshot[]): Snapshot[] {
  const cutoff = Date.now() - SNAPSHOT_TTL_MS;
  let next = list.filter((s) => s.at >= cutoff);
  if (next.length > MAX_SNAPSHOTS) next = next.slice(next.length - MAX_SNAPSHOTS);
  return next;
}

export function getArea(clientId: string): StoredArea | null {
  return db.areas[clientId] ?? null;
}

// Upsert the client's watch area. If the geometry changed (a genuinely new
// area was drawn), the stale severity history is discarded so the chart only
// ever reflects the area currently being watched.
export function putArea(clientId: string, geometry: unknown, name?: string): StoredArea {
  const sig = fingerprint(geometry);
  const existing = db.areas[clientId];
  if (!existing || existing.sig !== sig) {
    db.snapshots[clientId] = [];
  }
  const now = Date.now();
  const area: StoredArea = {
    clientId,
    name: name || existing?.name || "My watch area",
    geometry,
    sig,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  db.areas[clientId] = area;
  scheduleSave();
  return area;
}

export function deleteArea(clientId: string): boolean {
  const had = clientId in db.areas || clientId in db.snapshots;
  delete db.areas[clientId];
  delete db.snapshots[clientId];
  if (had) scheduleSave();
  return had;
}

export function addSnapshot(clientId: string, snap: Snapshot): Snapshot[] {
  const list = db.snapshots[clientId] ?? [];
  list.push(snap);
  db.snapshots[clientId] = prune(list);
  scheduleSave();
  return db.snapshots[clientId];
}

export function getHistory(clientId: string, sinceMs?: number): Snapshot[] {
  const list = prune(db.snapshots[clientId] ?? []);
  db.snapshots[clientId] = list;
  if (sinceMs && sinceMs > 0) return list.filter((s) => s.at >= sinceMs);
  return list;
}

export function stats() {
  return {
    areas: Object.keys(db.areas).length,
    series: Object.keys(db.snapshots).length,
    subs: Object.values(db.subs).reduce((n, s) => n + s.length, 0),
  };
}

// --- Web Push: VAPID keys + per-client subscriptions -----------------------

export function getVapidKeys(): VapidKeys | null {
  return db.vapid ?? null;
}

export function setVapidKeys(keys: VapidKeys): void {
  db.vapid = keys;
  scheduleSave();
}

export function getSubscriptions(clientId: string): PushSub[] {
  return db.subs[clientId] ?? [];
}

export function addSubscription(clientId: string, sub: PushSub): void {
  const list = db.subs[clientId] ?? [];
  if (!list.some((s) => s.endpoint === sub.endpoint)) {
    list.push(sub);
    db.subs[clientId] = list;
    scheduleSave();
  }
}

// Remove one subscription (by endpoint) or all for a client when no endpoint.
export function removeSubscription(clientId: string, endpoint?: string): void {
  if (!db.subs[clientId]) return;
  if (endpoint) {
    db.subs[clientId] = db.subs[clientId].filter((s) => s.endpoint !== endpoint);
    if (db.subs[clientId].length === 0) delete db.subs[clientId];
  } else {
    delete db.subs[clientId];
  }
  scheduleSave();
}

// Drop a dead endpoint wherever it lives (used when a push returns 404/410).
export function pruneEndpoint(endpoint: string): void {
  let changed = false;
  for (const [id, list] of Object.entries(db.subs)) {
    const next = list.filter((s) => s.endpoint !== endpoint);
    if (next.length !== list.length) {
      changed = true;
      if (next.length) db.subs[id] = next;
      else delete db.subs[id];
    }
  }
  if (changed) scheduleSave();
}
