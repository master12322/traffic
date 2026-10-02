import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { Check, MousePointerClick, X } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  LEVEL_META,
  type AreaReport,
  type AreaSegment,
  type CongestionLevel,
  type FocusRoad,
  type Segment,
} from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import { MapFallback } from "./MapFallback";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const SAMPLE_MS = 5000;
const WEIGHT: Record<CongestionLevel, number> = { low: 0, moderate: 0.4, heavy: 0.8, severe: 1 };
const ORDER: Record<CongestionLevel, number> = { severe: 0, heavy: 1, moderate: 2, low: 3 };

// Map base style per resolved UI theme (light/dark synced with the app chrome).
const STYLE_URL: Record<"dark" | "light", string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
};

// Congestion → color, shared by the base traffic line layer.
const COLOR_EXPR: mapboxgl.Expression = [
  "match",
  ["get", "congestion"],
  "low", LEVEL_META.low.color,
  "moderate", LEVEL_META.moderate.color,
  "heavy", LEVEL_META.heavy.color,
  "severe", LEVEL_META.severe.color,
  "#64748b",
];

// Inject the jam-marker pulse keyframes once (self-contained, no global CSS).
function ensurePulseStyles() {
  if (document.getElementById("jam-pulse-styles")) return;
  const style = document.createElement("style");
  style.id = "jam-pulse-styles";
  style.textContent =
    "@keyframes jamPulse{0%{box-shadow:0 0 0 0 var(--pulse)}70%{box-shadow:0 0 0 16px transparent}100%{box-shadow:0 0 0 0 transparent}}" +
    ".jam-pulse{border-radius:9999px;border:2px solid #fff;animation:jamPulse 1.6s ease-out infinite;}";
  document.head.appendChild(style);
}

const CLASS_LABEL: Record<string, string> = {
  motorway: "Motorway",
  motorway_link: "Motorway ramp",
  trunk: "Highway",
  trunk_link: "Highway ramp",
  primary: "Primary road",
  primary_link: "Primary link",
  secondary: "Secondary road",
  tertiary: "Tertiary road",
  street: "Street",
  street_limited: "Street",
  service: "Service road",
  link: "Link road",
};
const labelFor = (cls: string) =>
  CLASS_LABEL[cls] ?? cls.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Collect the vertices of a (tile-clipped) road geometry that actually fall
// INSIDE the polygon. queryRenderedFeatures returns lines clipped to tiles,
// so a road that merely grazes the area would otherwise be counted — and its
// midpoint could land outside. Keeping only inside-vertices fixes both.
const insideVertices = (
  g: any,
  poly: GeoJSON.Feature<GeoJSON.Polygon>
): [number, number][] => {
  const out: [number, number][] = [];
  const test = (c: [number, number]) => {
    try {
      if (booleanPointInPolygon(c as any, poly as any)) out.push(c);
    } catch {
      /* ignore malformed coord */
    }
  };
  if (!g) return out;
  if (g.type === "LineString") (g.coordinates as [number, number][]).forEach(test);
  else if (g.type === "MultiLineString")
    (g.coordinates as [number, number][][]).forEach((line) => line.forEach(test));
  else if (g.type === "Point") test(g.coordinates as [number, number]);
  return out;
};

// Reverse-geocode a point to a full street address via the Mapbox Geocoding
// API (free tier). Called only on click, so request volume stays tiny.
const reverseGeocode = async ([lng, lat]: [number, number]): Promise<string | null> => {
  try {
    // NOTE: "street" is NOT a valid v5 geocoding type — including it makes the
    // API reject the whole request (422) and we'd always fall back to "unavailable".
    // Valid point types, most-specific first: address → neighborhood → locality → place.
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?types=address,neighborhood,locality,place&language=en&limit=1&access_token=${TOKEN}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const feat = json.features?.[0];
    if (!feat) return null;
    // Prefer the human-readable full address; fall back to text + context.
    if (feat.place_name) return feat.place_name as string;
    const ctx = Array.isArray(feat.context)
      ? feat.context.map((c: { text?: string }) => c.text).filter(Boolean)
      : [];
    return [feat.text, ...ctx].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
};

interface TrafficMapProps {
  segments: Segment[];
  drawing: boolean;
  hasArea: boolean;
  onAreaChange: (geometry: GeoJSON.Geometry | null) => void;
  onAreaReport: (report: AreaReport | null) => void;
  clearSignal: number;
  userLocation: [number, number] | null;
  restoreArea: GeoJSON.Feature<GeoJSON.Polygon> | null;
  serverRestore?: GeoJSON.Feature<GeoJSON.Polygon> | null;
  focus: FocusRoad | null;
  visibleLevels: Set<CongestionLevel>;
}

export function TrafficMap({
  segments,
  drawing,
  hasArea,
  onAreaChange,
  onAreaReport,
  clearSignal,
  userLocation,
  restoreArea,
  serverRestore,
  focus,
  visibleLevels,
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const offsetRef = useRef<[number, number]>([0, 0]);
  const centroidRef = useRef<[number, number] | null>(null);
  const levelsRef = useRef(visibleLevels);
  levelsRef.current = visibleLevels;

  // Custom polygon drawing state (replaces mapbox-gl-draw for a Done button).
  const areaRef = useRef<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);
  const draftRef = useRef<[number, number][]>([]);
  const editingRef = useRef(false);
  const cursorRef = useRef<[number, number] | null>(null);
  const focusMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const focusPopupRef = useRef<mapboxgl.Popup | null>(null);
  const restoreRef = useRef(restoreArea);
  restoreRef.current = restoreArea;
  const [draftCount, setDraftCount] = useState(0);

  // Theme-synced base style. themeRef lets the once-only init effect read the
  // current theme without re-running, while a dedicated effect swaps the style.
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const appliedThemeRef = useRef(resolvedTheme);
  // Pulsing DOM markers over heavy/severe roads inside the drawn area.
  const jamMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const displayCoord = (c: [number, number]): [number, number] => [
    c[0] + offsetRef.current[0],
    c[1] + offsetRef.current[1],
  ];

  // Paint the in-progress / finalized polygon into the "area" source.
  const renderDraw = () => {
    const src = mapRef.current?.getSource("area") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [];
    const pts = draftRef.current;
    if (editingRef.current) {
      const preview = cursorRef.current ? [...pts, cursorRef.current] : pts;
      if (preview.length >= 2)
        features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: preview } });
      if (preview.length >= 3)
        features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...preview, preview[0]]] } });
      pts.forEach((p) =>
        features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } })
      );
    } else if (areaRef.current) {
      features.push(areaRef.current);
    }
    src.setData({ type: "FeatureCollection", features });
  };

  // Install the traffic + area sources/layers. Runs on first style load AND
  // after every setStyle (a style swap wipes custom sources/layers), so it must
  // be idempotent.
  const installTrafficLayers = (map: mapboxgl.Map) => {
    const levels = [...levelsRef.current];
    if (!map.getSource("mapbox-traffic")) {
      map.addSource("mapbox-traffic", { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
    }
    // Base traffic lines, colored by congestion.
    if (!map.getLayer("traffic")) {
      map.addLayer({
        id: "traffic",
        type: "line",
        source: "mapbox-traffic",
        "source-layer": "traffic",
        filter: ["in", ["get", "congestion"], ["literal", levels]],
        paint: { "line-width": 2, "line-color": COLOR_EXPR },
      });
    }
    if (!map.getSource("area")) {
      map.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("area-fill")) {
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.12 },
      });
    }
    if (!map.getLayer("area-line")) {
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "area",
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": "#2dd4bf", "line-width": 2, "line-dasharray": [2, 1] },
      });
    }
    if (!map.getLayer("area-vertex")) {
      map.addLayer({
        id: "area-vertex",
        type: "circle",
        source: "area",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#2dd4bf", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });
    }
  };

  // Keep the base traffic layer filter in sync with the legend toggles.
  const applyLevelFilters = (map: mapboxgl.Map, levels: CongestionLevel[]) => {
    const inLevels: mapboxgl.Expression = ["in", ["get", "congestion"], ["literal", levels]];
    if (map.getLayer("traffic")) map.setFilter("traffic", inLevels);
  };

  // Drop a pulsing marker on each heavy/severe road inside the area.
  const renderJamMarkers = (map: mapboxgl.Map, segs: AreaSegment[]) => {
    for (const m of jamMarkersRef.current) m.remove();
    jamMarkersRef.current = [];
    ensurePulseStyles();
    const jams = segs.filter((s) => s.level === "heavy" || s.level === "severe").slice(0, 12);
    for (const s of jams) {
      const color = LEVEL_META[s.level].color;
      const el = document.createElement("div");
      el.className = "jam-pulse";
      el.style.cssText = `width:14px;height:14px;background:${color};--pulse:${color};`;
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(s.coord).addTo(map);
      jamMarkersRef.current.push(marker);
    }
  };

  const clearJamMarkers = () => {
    for (const m of jamMarkersRef.current) m.remove();
    jamMarkersRef.current = [];
  };

  // Look up the real street name at a point by probing the base style's road
  // layers (mapbox-traffic-v1 only carries road class, not names).
  const roadNameAt = (map: mapboxgl.Map, lngLat: [number, number]): string | null => {
    let feats: any[] = [];
    try {
      const p = map.project(lngLat as any);
      feats = map.queryRenderedFeatures(
        [
          [p.x - 6, p.y - 6],
          [p.x + 6, p.y + 6],
        ] as any
      );
    } catch {
      return null;
    }
    for (const f of feats) {
      const isRoad = f.sourceLayer === "road" || String(f.layer?.id ?? "").includes("road");
      const name = f.properties?.name ?? f.properties?.name_en;
      if (isRoad && typeof name === "string" && name.trim()) return name.trim();
    }
    return null;
  };

  // Read real Mapbox traffic clipped to the polygon → live area summary.
  const sampleArea = () => {
    const map = mapRef.current;
    const area = areaRef.current;
    if (!map || !area || !map.getLayer("traffic")) return;
    let roads: any[] = [];
    try {
      roads = map.queryRenderedFeatures({ layers: ["traffic"] } as any);
    } catch {
      return;
    }
    const counts: Record<CongestionLevel, number> = { low: 0, moderate: 0, heavy: 0, severe: 0 };
    const segs: AreaSegment[] = [];
    const seen = new Set<string>();
    let weighted = 0;
    let total = 0;
    for (const r of roads) {
      const level = (r.properties?.congestion ?? "") as CongestionLevel;
      if (!(level in counts)) continue;
      // Only keep road portions whose vertices lie inside the drawn polygon.
      const inside = insideVertices(r.geometry, area);
      if (inside.length === 0) continue;
      counts[level] += 1;
      weighted += WEIGHT[level];
      total += 1;
      if (level !== "low") {
        const cls = String(r.properties?.class ?? "road");
        // Representative point is a vertex that is genuinely inside the area.
        const mid = inside[Math.floor(inside.length / 2)];
        const name = roadNameAt(map, mid);
        // De-duplicate by name+level so the same street isn't listed repeatedly.
        const dedupe = `${name ?? cls}-${level}`;
        if (name && seen.has(dedupe)) continue;
        if (name) seen.add(dedupe);
        segs.push({
          key: `${cls}-${segs.length}`,
          label: name ?? labelFor(cls),
          cls,
          level,
          named: !!name,
          coord: mid,
        });
      }
    }
    // Named roads first (more useful), then by severity.
    segs.sort((a, b) => Number(b.named) - Number(a.named) || ORDER[a.level] - ORDER[b.level]);
    const jammed = counts.heavy + counts.severe;
    const score = total ? weighted / total : 0;
    const state: AreaReport["state"] =
      jammed >= 2 || score > 0.55 ? "jam" : jammed >= 1 || score > 0.3 ? "building" : "clear";
    onAreaReport({ at: Date.now(), total, counts, jammed, score, state, segments: segs.slice(0, 40) });
    renderJamMarkers(map, segs);
  };

  const finalizeDraw = () => {
    const pts = draftRef.current;
    const map = mapRef.current;
    if (!map || pts.length < 3) return;
    const ring = [...pts, pts[0]];
    const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    areaRef.current = feature;
    editingRef.current = false;
    cursorRef.current = null;
    draftRef.current = [];
    setDraftCount(0);
    renderDraw();
    map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = "";
    try {
      const b = new mapboxgl.LngLatBounds();
      ring.forEach((c) => b.extend(c as [number, number]));
      map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 800 });
    } catch {
      /* ignore */
    }
    map.once("idle", sampleArea);
    onAreaChange(feature.geometry);
  };

  const cancelDraw = () => {
    const map = mapRef.current;
    draftRef.current = [];
    editingRef.current = false;
    cursorRef.current = null;
    setDraftCount(0);
    renderDraw();
    if (map) {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    }
    onAreaChange(null);
  };

  // __REST__
  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URL[themeRef.current],
      center: [-0.128, 51.515],
      zoom: 12.5,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "bottom-right"
    );

    map.on("load", () => {
      installTrafficLayers(map);

      // Restore a previously saved watch area from this session.
      if (restoreRef.current) {
        areaRef.current = restoreRef.current;
        renderDraw();
        try {
          const b = new mapboxgl.LngLatBounds();
          restoreRef.current.geometry.coordinates[0].forEach((c) => b.extend(c as [number, number]));
          map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 0 });
        } catch {
          /* ignore */
        }
        map.once("idle", sampleArea);
      }
    });

    map.on("click", (e) => {
      if (!editingRef.current) return;
      draftRef.current = [...draftRef.current, [e.lngLat.lng, e.lngLat.lat]];
      setDraftCount(draftRef.current.length);
      renderDraw();
    });
    map.on("mousemove", (e) => {
      if (!editingRef.current) return;
      cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
      renderDraw();
    });
    map.on("dblclick", (e) => {
      if (!editingRef.current) return;
      e.preventDefault();
      finalizeDraw();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // __REST2__
  // Enter / leave drawing mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    editingRef.current = drawing;
    if (drawing) {
      areaRef.current = null;
      draftRef.current = [];
      cursorRef.current = null;
      setDraftCount(0);
      onAreaReport(null);
      clearJamMarkers();
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
      renderDraw();
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      if (!areaRef.current) {
        draftRef.current = [];
        setDraftCount(0);
        renderDraw();
      }
    }
  }, [drawing]);

  // Clear drawn area on external signal.
  useEffect(() => {
    if (clearSignal === 0) return;
    areaRef.current = null;
    draftRef.current = [];
    editingRef.current = false;
    cursorRef.current = null;
    setDraftCount(0);
    focusMarkerRef.current?.remove();
    focusMarkerRef.current = null;
    focusPopupRef.current?.remove();
    focusPopupRef.current = null;
    clearJamMarkers();
    renderDraw();
    onAreaChange(null);
    onAreaReport(null);
  }, [clearSignal]);

  // Re-sample real congestion inside the area on an interval.
  useEffect(() => {
    const id = setInterval(() => {
      if (areaRef.current) sampleArea();
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  // Restore a server-persisted area when this browser has no local copy.
  // Only applies when nothing is already drawn or being drawn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !serverRestore || areaRef.current || drawing) return;
    const apply = () => {
      if (areaRef.current || !map.getLayer("traffic")) return;
      areaRef.current = serverRestore;
      renderDraw();
      try {
        const b = new mapboxgl.LngLatBounds();
        serverRestore.geometry.coordinates[0].forEach((c) => b.extend(c as [number, number]));
        map.fitBounds(b, { padding: 80, maxZoom: 15, duration: 600 });
      } catch {
        /* ignore */
      }
      map.once("idle", sampleArea);
      onAreaChange(serverRestore.geometry); // sync app state + sessionStorage
    };
    if (map.getLayer("traffic")) apply();
    else map.once("idle", apply);
  }, [serverRestore]);

  // Show/hide traffic lines by congestion level (legend toggles).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("traffic")) return;
    applyLevelFilters(map, [...visibleLevels]);
  }, [visibleLevels]);

  // Swap the Mapbox base style when the UI theme changes, then re-install our
  // custom layers (setStyle wipes them) and repaint the current area + jams.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedThemeRef.current === resolvedTheme) return; // first mount / no change
    appliedThemeRef.current = resolvedTheme;
    map.setStyle(STYLE_URL[resolvedTheme]);
    map.once("style.load", () => {
      installTrafficLayers(map);
      applyLevelFilters(map, [...levelsRef.current]);
      renderDraw();
      if (areaRef.current) map.once("idle", sampleArea);
    });
  }, [resolvedTheme]);

  // Fly to a clicked road, drop a pulsing pin, and resolve its full address.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const color = LEVEL_META[focus.level].color;

    map.flyTo({ center: focus.coord, zoom: 16, speed: 1.6, essential: true });

    const el = document.createElement("div");
    el.style.cssText =
      `width:18px;height:18px;border-radius:9999px;border:3px solid #fff;background:${color};` +
      `box-shadow:0 0 0 4px ${color}55,0 0 16px 4px ${color};`;
    focusMarkerRef.current?.remove();
    focusMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(focus.coord).addTo(map);

    focusPopupRef.current?.remove();
    const popup = new mapboxgl.Popup({ offset: 20, closeButton: true, className: "road-popup" })
      .setLngLat(focus.coord)
      .setHTML(
        `<div style="font-weight:600;color:${color}">${focus.label}</div>` +
          `<div style="font-size:11px;color:#94a3b8;margin-top:2px">Resolving address…</div>`
      )
      .addTo(map);
    focusPopupRef.current = popup;

    let cancelled = false;
    reverseGeocode(focus.coord).then((addr) => {
      if (cancelled) return;
      popup.setHTML(
        `<div style="font-weight:600;color:${color}">${focus.label}</div>` +
          `<div style="font-size:11px;color:#cbd5e1;margin-top:3px;line-height:1.35">${
            addr ?? "Address unavailable"
          }</div>`
      );
    });

    return () => {
      cancelled = true;
    };
  }, [focus]);

  // Center on the user and shift the demo network to their location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    if (!centroidRef.current && segments.length) {
      let sx = 0;
      let sy = 0;
      for (const s of segments) {
        sx += s.coord[0];
        sy += s.coord[1];
      }
      centroidRef.current = [sx / segments.length, sy / segments.length];
    }
    const centroid = centroidRef.current ?? userLocation;
    offsetRef.current = [userLocation[0] - centroid[0], userLocation[1] - centroid[1]];
    // Don't yank the view off a restored/active watch area.
    if (!areaRef.current) map.flyTo({ center: userLocation, zoom: 13, speed: 1.4, essential: true });
    for (const seg of segments) {
      markersRef.current.get(seg.id)?.setLngLat(displayCoord(seg.coord));
    }
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 0 0 4px rgba(56,189,248,.35),0 0 14px 3px #38bdf8;";
      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(userLocation)
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText("You are here"))
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(userLocation);
    }
  }, [userLocation, segments.length]);

  // Sync segment markers with the live demo feed. The demo dots are hidden once
  // a watch area is drawn — then only the real Mapbox traffic inside the area
  // matters, so the simulated points would just be noise.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const seg of segments) {
      let marker = markersRef.current.get(seg.id);
      const color = LEVEL_META[seg.level].color;
      if (!marker) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:9999px;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 12px 2px " +
          color + ";background:" + color + ";transition:background .5s,box-shadow .5s;";
        marker = new mapboxgl.Marker({ element: el })
          .setLngLat(displayCoord(seg.coord))
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(seg.name))
          .addTo(map);
        markersRef.current.set(seg.id, marker);
      } else {
        const el = marker.getElement();
        el.style.background = color;
        el.style.boxShadow = `0 0 12px 2px ${color}`;
      }
      marker.getElement().style.display = hasArea ? "none" : "";
    }
  }, [segments, hasArea]);

  if (!TOKEN) {
    return <MapFallback segments={segments} />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />
      {drawing && (
        <div className="glass absolute bottom-safe left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full p-1.5 shadow-xl">
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 text-primary" />
            {draftCount < 3
              ? `Click ${3 - draftCount} more point${3 - draftCount > 1 ? "s" : ""}`
              : `${draftCount} points · double-click or Done`}
          </span>
          <button
            onClick={finalizeDraw}
            disabled={draftCount < 3}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition active:scale-95 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Done
          </button>
          <button
            onClick={cancelDraw}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs transition active:scale-95"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}




