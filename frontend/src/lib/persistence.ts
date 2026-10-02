// Thin client for the backend's file-backed persistence (Phase 3).
// Every call is best-effort: if the API is unreachable the UI keeps working
// from its local sessionStorage copy, so the app never hard-depends on the
// server being up. No accounts yet — a watch area + its severity history are
// keyed by an anonymous id kept in localStorage.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const CLIENT_KEY = "traffic-radar.clientId";

// A stable, anonymous per-browser id. Falls back to an in-memory id when
// localStorage is unavailable (private mode) so the session still works.
let memoryId: string | null = null;
export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    if (!memoryId) memoryId = `c_mem_${Math.random().toString(36).slice(2, 10)}`;
    return memoryId;
  }
}

export interface SeverityPoint {
  at: number;
  score: number; // 0..1
  jammed: number;
  total: number;
  state: "clear" | "building" | "jam";
}

export interface StoredArea {
  geometry: GeoJSON.Geometry;
  name?: string;
  updatedAt?: number;
}

export async function fetchArea(clientId: string): Promise<StoredArea | null> {
  try {
    const res = await fetch(`${API_URL}/api/area/${encodeURIComponent(clientId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.geometry ? (json as StoredArea) : null;
  } catch {
    return null;
  }
}

export async function saveArea(
  clientId: string,
  geometry: GeoJSON.Geometry,
  name?: string
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/area/${encodeURIComponent(clientId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry, name }),
    });
  } catch {
    /* offline — sessionStorage still holds the area */
  }
}

export async function removeArea(clientId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/area/${encodeURIComponent(clientId)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

export async function postSnapshot(
  clientId: string,
  snap: Omit<SeverityPoint, never> & { counts?: Record<string, number> }
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/snapshots/${encodeURIComponent(clientId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snap),
      keepalive: true,
    });
  } catch {
    /* ignore — the local history array still updates optimistically */
  }
}

export async function fetchHistory(clientId: string): Promise<SeverityPoint[]> {
  try {
    const res = await fetch(`${API_URL}/api/snapshots/${encodeURIComponent(clientId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as SeverityPoint[]) : [];
  } catch {
    return [];
  }
}
