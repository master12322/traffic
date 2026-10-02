import "./env.js";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import webpush from "web-push";
import { snapshot, tick, type Segment } from "./data/mockTraffic.js";
import {
  addSnapshot,
  addSubscription,
  deleteArea,
  getArea,
  getHistory,
  getSubscriptions,
  getVapidKeys,
  pruneEndpoint,
  putArea,
  removeSubscription,
  setVapidKeys,
  stats,
  type PushSub,
  type Snapshot,
} from "./store.js";

const PORT = Number(process.env.PORT ?? 4000);
const TICK_MS = Number(process.env.TICK_MS ?? 2000);
const ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

const app = express();
app.use(cors({ origin: ORIGINS }));
app.use(express.json({ limit: "256kb" }));

// --- Web Push (VAPID) setup -------------------------------------------------
// Keys come from env when provided, else are generated once and persisted so
// existing browser subscriptions keep working across restarts. Fully free —
// no third-party push service beyond the browser's own endpoint.
let pushReady = false;
// The public key currently configured in web-push — this is what browsers must
// subscribe with. It may come from env or the persisted store; the endpoint
// below serves THIS one so the subscribe key always matches the signing key.
let activeVapidPublicKey: string | null = null;
(function initPush() {
  let keys = getVapidKeys();
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    keys = { publicKey: envPub, privateKey: envPriv };
  } else if (!keys) {
    keys = webpush.generateVAPIDKeys();
    setVapidKeys(keys);
    console.log("✓ push: generated VAPID keys (persisted to store)");
  }
  try {
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@traffic-radar.local";
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    activeVapidPublicKey = keys.publicKey;
    pushReady = true;
    console.log(`✓ push: VAPID ready (key …${keys.publicKey.slice(-6)})`);
  } catch (err) {
    console.warn("push: failed to configure VAPID, push disabled", err);
  }
})();

// Per-client cooldown so a sustained jam doesn't spam a device.
const PUSH_COOLDOWN_MS = Number(process.env.PUSH_COOLDOWN_MS ?? 60_000);
const lastPushAt = new Map<string, number>();

// Send a jam push to every subscription a client registered; prune dead ones.
async function pushJam(clientId: string, snap: Snapshot) {
  if (!pushReady) return;
  const subs = getSubscriptions(clientId);
  if (subs.length === 0) return;
  const now = Date.now();
  if (now - (lastPushAt.get(clientId) ?? 0) < PUSH_COOLDOWN_MS) return;
  lastPushAt.set(clientId, now);

  const payload = JSON.stringify({
    title: "🚦 Jam in your watch area",
    body: `${snap.jammed} road(s) heavily congested · severity ${Math.round(snap.score * 100)}%.`,
    at: snap.at,
  });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as unknown as webpush.PushSubscription, payload);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) pruneEndpoint(sub.endpoint);
      }
    })
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), segments: snapshot().length, push: pushReady, ...stats() });
});

app.get("/api/segments", (_req, res) => {
  res.json(snapshot());
});

// --- Watch-area persistence (file-backed, keyed by anonymous clientId) ------

app.get("/api/area/:clientId", (req, res) => {
  res.json(getArea(req.params.clientId));
});

app.put("/api/area/:clientId", (req, res) => {
  const { geometry, name } = req.body ?? {};
  if (!geometry || (geometry as { type?: string }).type !== "Polygon") {
    return res.status(400).json({ error: "a GeoJSON Polygon geometry is required" });
  }
  res.json(putArea(req.params.clientId, geometry, typeof name === "string" ? name : undefined));
});

app.delete("/api/area/:clientId", (req, res) => {
  deleteArea(req.params.clientId);
  res.json({ ok: true });
});

// --- Congestion snapshot history (severity over time) -----------------------

const LEVELS = ["clear", "building", "jam"] as const;

app.post("/api/snapshots/:clientId", (req, res) => {
  const b = req.body ?? {};
  const score = Number(b.score);
  if (!Number.isFinite(score)) return res.status(400).json({ error: "score is required" });
  const snap: Snapshot = {
    at: Number.isFinite(Number(b.at)) ? Number(b.at) : Date.now(),
    score: Math.max(0, Math.min(1, score)),
    jammed: Math.max(0, Math.round(Number(b.jammed) || 0)),
    total: Math.max(0, Math.round(Number(b.total) || 0)),
    state: LEVELS.includes(b.state) ? b.state : "clear",
    counts: b.counts && typeof b.counts === "object" ? b.counts : undefined,
  };
  const list = addSnapshot(req.params.clientId, snap);
  // Phase 4: a client's area is only sampled in the browser, so the server
  // learns about a jam from the snapshot it posts — and relays it as a push.
  if (snap.state === "jam") void pushJam(req.params.clientId, snap);
  res.status(201).json({ ok: true, points: list.length });
});

app.get("/api/snapshots/:clientId", (req, res) => {
  const since = Number(req.query.since);
  res.json(getHistory(req.params.clientId, Number.isFinite(since) ? since : undefined));
});

// --- Web Push subscriptions -------------------------------------------------

app.get("/api/push/public-key", (_req, res) => {
  res.json({ publicKey: activeVapidPublicKey, enabled: pushReady });
});

app.post("/api/push/subscribe/:clientId", (req, res) => {
  const sub = req.body as PushSub;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: "a valid PushSubscription is required" });
  }
  addSubscription(req.params.clientId, { endpoint: sub.endpoint, keys: sub.keys });
  res.status(201).json({ ok: true });
});

app.post("/api/push/unsubscribe/:clientId", (req, res) => {
  const endpoint = (req.body as { endpoint?: string })?.endpoint;
  removeSubscription(req.params.clientId, endpoint);
  res.json({ ok: true });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: ORIGINS } });

io.on("connection", (socket) => {
  // Send the current state immediately on connect.
  socket.emit("segments", snapshot());
  socket.on("disconnect", () => {});
});

// Live engine: advance the simulation and broadcast on an interval.
setInterval(() => {
  const segments: Segment[] = tick();
  io.emit("segments", segments);

  // Derive jam alerts and push them as discrete events.
  const jams = segments.filter((s) => s.level === "heavy" || s.level === "severe");
  if (jams.length) {
    io.emit("alert", {
      at: Date.now(),
      count: jams.length,
      segments: jams.map((s) => ({ id: s.id, name: s.name, level: s.level })),
    });
  }
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`▶ Traffic Radar API on http://localhost:${PORT}`);
  console.log(`  live tick every ${TICK_MS}ms  •  origins: ${ORIGINS.join(", ")}`);
});
