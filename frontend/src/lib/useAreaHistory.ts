import { useEffect, useMemo, useRef, useState } from "react";
import type { AreaReport } from "./types";
import {
  fetchHistory,
  postSnapshot,
  removeArea,
  saveArea,
  type SeverityPoint,
} from "./persistence";

const POST_THROTTLE_MS = 4000; // don't post more than ~one snapshot / sample
const MAX_LOCAL_POINTS = 300;

// Owns server-side persistence of the watch area AND its severity-over-time
// history, keyed by the anonymous clientId:
//   - when the watched polygon changes, the area is saved first (which clears
//     stale history server-side for a genuinely new area) and the persisted
//     history is then read back — this ordering avoids showing the previous
//     area's trend for a new one.
//   - each fresh area report is posted (throttled) and appended locally so the
//     chart updates live.
// Everything is best-effort; if the API is down the chart still works from the
// optimistic local series.
export function useAreaHistory(
  clientId: string,
  areaGeometry: GeoJSON.Geometry | null,
  report: AreaReport | null
) {
  const [history, setHistory] = useState<SeverityPoint[]>([]);
  const lastPostRef = useRef(0);
  const lastAtRef = useRef(0);
  const mountedRef = useRef(false);

  const sig = useMemo(
    () =>
      areaGeometry && areaGeometry.type === "Polygon"
        ? JSON.stringify(areaGeometry.coordinates)
        : null,
    [areaGeometry]
  );

  // Persist the area + (re)load its history whenever the polygon changes.
  useEffect(() => {
    let cancelled = false;
    const mounted = mountedRef.current;
    mountedRef.current = true;

    if (!sig || !areaGeometry) {
      setHistory([]);
      // Only remove server-side after mount — a cold load with no local area
      // must not wipe a server area we may be about to restore.
      if (mounted) removeArea(clientId);
      return;
    }

    setHistory([]);
    (async () => {
      await saveArea(clientId, areaGeometry);
      if (cancelled) return;
      const h = await fetchHistory(clientId);
      if (!cancelled) setHistory(h);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, clientId]);

  // Persist + append each new area report.
  useEffect(() => {
    if (!sig || !report) return;
    if (report.at === lastAtRef.current) return; // same sample, ignore
    lastAtRef.current = report.at;

    const now = Date.now();
    if (now - lastPostRef.current < POST_THROTTLE_MS) return;
    lastPostRef.current = now;

    const point: SeverityPoint = {
      at: report.at,
      score: report.score,
      jammed: report.jammed,
      total: report.total,
      state: report.state,
    };
    setHistory((prev) => [...prev, point].slice(-MAX_LOCAL_POINTS));
    postSnapshot(clientId, { ...point, counts: report.counts });
  }, [report, sig, clientId]);

  return history;
}
