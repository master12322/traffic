import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, PanelRightOpen } from "lucide-react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { StatusPanel } from "@/components/StatusPanel";
import { TrafficMap } from "@/components/TrafficMap";
import { AreaStatus } from "@/components/AreaStatus";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useLiveTraffic } from "@/lib/useLiveTraffic";
import { useAreaHistory } from "@/lib/useAreaHistory";
import { fetchArea, getClientId } from "@/lib/persistence";
import { disablePush, enablePush, pushSupported } from "@/lib/push";
import type { AreaAlert, AreaReport, AreaSegment, CongestionLevel, FocusRoad } from "@/lib/types";

const AREA_KEY = "traffic-radar.watchArea";
const LEVELS_KEY = "traffic-radar.levels";
const PUSH_KEY = "traffic-radar.push";
const ALL_LEVELS: CongestionLevel[] = ["low", "moderate", "heavy", "severe"];

// Load a previously saved watch-area polygon from this browser session.
function loadSavedArea(): GeoJSON.Feature<GeoJSON.Polygon> | null {
  try {
    const raw = sessionStorage.getItem(AREA_KEY);
    if (!raw) return null;
    const geo = JSON.parse(raw) as GeoJSON.Geometry;
    if (geo?.type !== "Polygon") return null;
    return { type: "Feature", properties: {}, geometry: geo };
  } catch {
    return null;
  }
}

// Load the set of congestion levels the user chose to keep visible.
function loadVisibleLevels(): Set<CongestionLevel> {
  try {
    const raw = sessionStorage.getItem(LEVELS_KEY);
    if (!raw) return new Set(ALL_LEVELS);
    const arr = (JSON.parse(raw) as CongestionLevel[]).filter((l) => ALL_LEVELS.includes(l));
    return new Set(arr.length ? arr : ALL_LEVELS);
  } catch {
    return new Set(ALL_LEVELS);
  }
}

export default function App() {
  const { connected, segments, alerts, lastTick } = useLiveTraffic();
  const clientId = useMemo(() => getClientId(), []);
  const [restoreArea] = useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(loadSavedArea);
  const [serverArea, setServerArea] = useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);
  const [areaGeometry, setAreaGeometry] = useState<GeoJSON.Geometry | null>(
    restoreArea?.geometry ?? null
  );
  const [drawing, setDrawing] = useState(false);
  const [hasArea, setHasArea] = useState(!!restoreArea);
  const [notifications, setNotifications] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(
    () => pushSupported() && localStorage.getItem(PUSH_KEY) === "1"
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [areaReport, setAreaReport] = useState<AreaReport | null>(null);
  const [areaAlerts, setAreaAlerts] = useState<AreaAlert[]>([]);
  const [focus, setFocus] = useState<FocusRoad | null>(null);
  const [visibleLevels, setVisibleLevels] = useState<Set<CongestionLevel>>(loadVisibleLevels);
  const [mobilePanel, setMobilePanel] = useState<"controls" | "status" | null>(null);
  const lastNotifiedRef = useRef(0);
  const jamCooldownRef = useRef(0);
  const areaSigRef = useRef("");

  // Severity-over-time history for the active watch area (file-backed server).
  // The hook also owns persisting the area itself as it changes.
  const history = useAreaHistory(clientId, areaGeometry, areaReport);

  // When this browser has no locally-cached area, fall back to the server's
  // saved area (persists across sessions / machines for the same clientId).
  useEffect(() => {
    if (restoreArea) return; // sessionStorage copy wins for instant restore
    let cancelled = false;
    fetchArea(clientId).then((a) => {
      if (cancelled || !a?.geometry || a.geometry.type !== "Polygon") return;
      setServerArea({ type: "Feature", properties: {}, geometry: a.geometry as GeoJSON.Polygon });
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, restoreArea]);

  // Persist the visible-level filter so it survives reloads in this session.
  const commitLevels = useCallback((next: Set<CongestionLevel>) => {
    setVisibleLevels(next);
    try {
      sessionStorage.setItem(LEVELS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLevel = useCallback(
    (lvl: CongestionLevel) => {
      const next = new Set(visibleLevels);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      if (next.size === 0) return; // never hide everything
      commitLevels(next);
    },
    [visibleLevels, commitLevels]
  );

  const isolateLevel = useCallback((lvl: CongestionLevel) => commitLevels(new Set([lvl])), [commitLevels]);
  const showAllLevels = useCallback(() => commitLevels(new Set(ALL_LEVELS)), [commitLevels]);

  // Live per-level counts for the legend (area roads when drawn, else demo feed).
  const levelCounts = useMemo<Record<CongestionLevel, number>>(() => {
    if (areaReport) return areaReport.counts;
    const c: Record<CongestionLevel, number> = { low: 0, moderate: 0, heavy: 0, severe: 0 };
    for (const s of segments) c[s.level] += 1;
    return c;
  }, [areaReport, segments]);

  // Ask the browser for the user's current position (lng, lat).
  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) {
      alert("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.longitude, pos.coords.latitude]);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        alert(`Could not get your location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Try to center on the user automatically on first load.
  useEffect(() => {
    locateMe();
  }, [locateMe]);

  const handleAreaChange = useCallback((geometry: GeoJSON.Geometry | null) => {
    setHasArea(!!geometry);
    setDrawing(false);
    setAreaGeometry(geometry);
    if (geometry) {
      try {
        sessionStorage.setItem(AREA_KEY, JSON.stringify(geometry));
      } catch {
        /* ignore quota / privacy-mode errors */
      }
    } else {
      sessionStorage.removeItem(AREA_KEY);
      setAreaReport(null);
      setAreaAlerts([]);
      setFocus(null);
      areaSigRef.current = "";
    }
  }, []);

  // Fly the map to a road the user clicked in the lists / alert feed.
  const handleFocusRoad = useCallback((seg: Pick<AreaSegment, "coord" | "label" | "level">) => {
    setFocus({ coord: seg.coord, label: seg.label, level: seg.level, nonce: Date.now() });
    setMobilePanel(null); // close any open drawer so the map is visible
  }, []);

  // Jump to the worst (first-listed) road of a given level inside the area.
  const focusWorstOfLevel = useCallback(
    (lvl: CongestionLevel) => {
      const seg = areaReport?.segments.find((s) => s.level === lvl);
      if (seg) handleFocusRoad(seg);
    },
    [areaReport, handleFocusRoad]
  );

  const toggleNotifications = useCallback((v: boolean) => {
    setNotifications(v);
    if (v && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Web Push toggle (Phase 4). ON → subscribe this browser with the backend so
  // jams in the watch area arrive as OS notifications even from another tab;
  // OFF → unsubscribe. Persisted to localStorage so it survives reloads.
  const togglePush = useCallback((v: boolean) => {
    setPushBusy(true);
    (async () => {
      if (v) {
        const res = await enablePush();
        if (res.ok) {
          setPushEnabled(true);
          localStorage.setItem(PUSH_KEY, "1");
        } else {
          setPushEnabled(false);
          localStorage.removeItem(PUSH_KEY);
        }
      } else {
        await disablePush();
        setPushEnabled(false);
        localStorage.removeItem(PUSH_KEY);
      }
      setPushBusy(false);
    })();
  }, []);

  // Re-affirm the push subscription with the server on load when it was left on
  // (the browser may have dropped or rotated the subscription since last visit).
  useEffect(() => {
    if (!pushEnabled) return;
    let cancelled = false;
    enablePush().then((res) => {
      if (cancelled || res.ok) return;
      setPushEnabled(false);
      localStorage.removeItem(PUSH_KEY);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jam notification driven by REAL congestion inside the drawn area.
  // Skipped when Web Push is on — the server delivers that alert instead, so we
  // avoid firing two notifications for the same jam.
  useEffect(() => {
    if (pushEnabled) return;
    if (!notifications || !areaReport || areaReport.state !== "jam") return;
    const now = Date.now();
    if (now - jamCooldownRef.current < 60_000) return; // 1-min cooldown
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    jamCooldownRef.current = now;
    new Notification("🚦 Jam in your watch area", {
      body: `${areaReport.jammed} road(s) heavily congested · severity ${Math.round(
        areaReport.score * 100
      )}%.`,
    });
  }, [areaReport, notifications, pushEnabled]);

  // Build a highlighted alert feed from the REAL congested roads in the area.
  // A new entry is pushed only when the set of congested roads changes.
  useEffect(() => {
    if (!areaReport) {
      areaSigRef.current = "";
      return;
    }
    const congested = areaReport.segments.filter(
      (s) => s.level === "heavy" || s.level === "severe"
    );
    if (congested.length === 0) {
      areaSigRef.current = "";
      return;
    }
    const roads = Array.from(new Set(congested.map((s) => s.label)));
    const worst: CongestionLevel = congested.some((s) => s.level === "severe") ? "severe" : "heavy";
    const sig = `${worst}|${roads.join("|")}`;
    if (sig === areaSigRef.current) return;
    areaSigRef.current = sig;
    setAreaAlerts((prev) =>
      [{ at: areaReport.at, level: worst, roads }, ...prev].slice(0, 12)
    );
  }, [areaReport]);


  if (
    notifications &&
    !hasArea &&
    alerts.length > 0 &&
    alerts[0].at !== lastNotifiedRef.current &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    lastNotifiedRef.current = alerts[0].at;
    new Notification("🚦 Traffic jam detected", {
      body: `${alerts[0].count} road(s) congested in the monitored network.`,
    });
  }

  const renderSidebar = (dense = false) => (
    <Sidebar
      dense={dense}
      drawing={drawing}
      hasArea={hasArea}
      notifications={notifications}
      onToggleDraw={() => {
        setDrawing((d) => !d);
        setMobilePanel(null);
      }}
      onClearArea={() => {
        setClearSignal((n) => n + 1);
        setHasArea(false);
      }}
      onToggleNotifications={toggleNotifications}
      onLocate={locateMe}
      locating={locating}
      visibleLevels={visibleLevels}
      levelCounts={levelCounts}
      areaActive={!!areaReport}
      onToggleLevel={toggleLevel}
      onIsolateLevel={isolateLevel}
      onShowAllLevels={showAllLevels}
      onFocusWorst={focusWorstOfLevel}
    />
  );

  const renderStatus = (dense = false) => (
    <StatusPanel
      dense={dense}
      segments={segments}
      alerts={alerts}
      areaReport={areaReport}
      areaAlerts={areaAlerts}
      visibleLevels={visibleLevels}
      onFocusRoad={handleFocusRoad}
      history={history}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-bg flex h-screen-safe flex-col overflow-hidden pt-safe">
        <Header
          connected={connected}
          lastTick={lastTick}
          pushEnabled={pushEnabled}
          onTogglePush={togglePush}
          pushBusy={pushBusy}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-0 p-2 sm:p-3 lg:grid lg:grid-cols-[auto_1fr_auto] lg:gap-3">
          {/* Desktop controls */}
          <div className="hidden lg:block">{renderSidebar(false)}</div>

          <section className="relative min-h-0 flex-1">
            <TrafficMap
              segments={segments}
              drawing={drawing}
              hasArea={hasArea}
              onAreaChange={handleAreaChange}
              onAreaReport={setAreaReport}
              clearSignal={clearSignal}
              userLocation={userLocation}
              restoreArea={restoreArea}
              serverRestore={serverArea}
              focus={focus}
              visibleLevels={visibleLevels}
            />
            <AreaStatus report={areaReport} visibleLevels={visibleLevels} onFocusRoad={handleFocusRoad} />

            {/* Mobile open-panel buttons (hidden on desktop & while drawing) */}
            {!drawing && (
              <div className="pointer-events-none absolute inset-x-0 bottom-safe flex justify-between px-3 lg:hidden">
                <button
                  onClick={() => setMobilePanel("controls")}
                  className="glass pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-xl active:scale-95"
                >
                  <Menu className="h-4 w-4 text-primary" /> Controls
                </button>
                <button
                  onClick={() => setMobilePanel("status")}
                  className="glass pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-xl active:scale-95"
                >
                  <PanelRightOpen className="h-4 w-4 text-primary" /> Live status
                </button>
              </div>
            )}
          </section>

          {/* Desktop status panel */}
          <div className="hidden w-80 min-h-0 lg:block">{renderStatus(false)}</div>
        </main>

        {/* Mobile drawers */}
        <Sheet open={mobilePanel === "controls"} onOpenChange={(o) => !o && setMobilePanel(null)}>
          <SheetContent side="left" className="w-80 max-w-[88vw]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Menu className="h-4 w-4 text-primary" /> Controls
              </SheetTitle>
            </SheetHeader>
            <SheetBody>{renderSidebar(true)}</SheetBody>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="secondary" className="w-full">
                  Close
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Sheet open={mobilePanel === "status"} onOpenChange={(o) => !o && setMobilePanel(null)}>
          <SheetContent side="bottom" className="h-drawer-safe">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-sm">
                <PanelRightOpen className="h-4 w-4 text-primary" /> Live status
              </SheetTitle>
            </SheetHeader>
            <SheetBody>{renderStatus(true)}</SheetBody>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="secondary" className="w-full">
                  Close
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
