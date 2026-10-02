// Phase 4 — Web Push client helpers.
// Registers the service worker, subscribes to the backend's VAPID push, and
// mirrors the subscription to the server (keyed by the anonymous clientId).
// Everything is best-effort; failures degrade to "push unavailable" rather
// than breaking the app.

import { getClientId } from "./persistence";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export type PushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "dismissed" | "server" | "error" };

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, reason: perm === "denied" ? "denied" : "dismissed" };
    }

    const keyRes = await fetch(`${API_URL}/api/push/public-key`);
    const { publicKey, enabled } = await keyRes.json();
    if (!enabled || !publicKey) return { ok: false, reason: "server" };

    await getRegistration();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await fetch(`${API_URL}/api/push/subscribe/${encodeURIComponent(getClientId())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;
    if (sub) await sub.unsubscribe();
    await fetch(`${API_URL}/api/push/unsubscribe/${encodeURIComponent(getClientId())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* ignore */
  }
}
