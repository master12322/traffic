# Traffic Radar — Phase 1

Live traffic congestion dashboard. **Phase 1** delivers the full UI + a real-time
backend feed over WebSockets. No database yet (per spec) — areas are stored
in-memory and congestion is simulated so the whole pipeline is live end-to-end.

```
New folder (9)/
├── backend/     Express + Socket.IO · streams live congestion every 2s
└── frontend/    Vite + React + TS + Tailwind + shadcn/ui + Mapbox GL
```

## Stack

- **Frontend:** React 18, Vite (SWC), TypeScript, TailwindCSS, shadcn/ui
  (Radix primitives), lucide-react, Mapbox GL JS + Draw, Turf, socket.io-client
- **Backend:** Node, Express, Socket.IO (TypeScript, run with `tsx`)

## Run it

Open two terminals.

**Backend**
```bash
cd backend
cp .env.example .env
npm install
npm run dev        # http://localhost:4000
```

**Frontend**
```bash
cd frontend
cp .env.example .env
# optional: paste a free token from https://account.mapbox.com into VITE_MAPBOX_TOKEN
npm install
npm run dev        # http://localhost:5173
```

## What works now

- Real-time congestion feed (Socket.IO) → live-updating segment cards, stat
  tiles, trend arrows, and an alert feed.
- Area drawing (polygon) on the map; connection + "last updated" status.
- Browser notifications toggle — fires on heavy/severe jams (asks permission).
- **With a Mapbox token:** live `mapbox-traffic-v1` congestion tiles + markers.
- **Without a token:** an animated radar fallback still shows the live feed.

## Next phases

- Geofence jam detection to the drawn area via `queryRenderedFeatures` + Turf.
- Web Push (VAPID) for alerts when the tab is closed.
- MongoDB (`2dsphere`) for areas, cameras, and congestion history.
