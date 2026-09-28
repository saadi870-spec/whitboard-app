# LaraBoard — Real-Time Collaborative Whiteboard

A frontend-heavy collaborative whiteboard built with **Laravel 13 + React 19 + Node WebSocket relay**.

## Features

- Realtime drawing (pen, eraser, sticky notes) with sub-second fan-out
- WebSocket synchronization with auto-retry and an offline outbox
- Room codes for join-by-code collaboration
- WebRTC video/audio calls (mesh P2P, signaling over the relay)
- Ephemeral chat + live cursor presence with name labels
- Export to PNG / SVG / JSON
- Undo/redo with network propagation
- Laravel-persisted ops (SQLite) with idempotent batch writes

## Quick start (3 terminals)

```bash
# 1. API + web (Laravel, port 8000)
php artisan serve --host=127.0.0.1 --port=8000

# 2. WebSocket relay (Node, port 6002)
npm run relay

# 3. Frontend assets (Vite dev server, port 5173) — or use the prebuilt bundle
npm run dev
```

Then open http://localhost:5173 (or http://127.0.0.1:8000 with the built bundle).

Create a board, share the 7-char code, and open a second browser window to
collaborate — cursors, strokes, notes, chat and video sync live.

## Architecture

```
┌──────────┐  HTTP (REST + token auth)   ┌─────────────┐
│ React SPA│ ───────────────────────────▶│   Laravel    │
│ (Vite)   │                             │  (API+auth)  │
└────┬─────┘                             └──────▲──────┘
     │ ws://:6002/upgr                          │ Bearer RELAY_SECRET
     ▼                                          │
┌──────────────┐   ops flush (700ms batches)    │
│  Node relay  │ ───────────────────────────────┘
│ (fan-out)    │
└──────────────┘
```

**Why a Node relay?** On this machine, PHP lacks `pcntl` (Reverb dependency),
so a tiny (~200-line) Node relay handles ephemeral fan-out: drawing ops,
cursors, notes, chat and WebRTC signaling. Laravel remains the source of truth
for rooms, guests, ops and notes — the relay flushes batches to
`POST /api/v1/relay/rooms/{code}/snapshot` (bearer-authenticated) where they're
stored idempotently via `(room_id, client_ref)` unique constraint.

**Performance notes**
- Committed strokes are cached as `Path2D` — repaints replay cached paths.
- A rAF loop repaints only when a dirty flag is set.
- Cursors are throttled to 25Hz; strokes stream in batches (200/burst).
- The relay batches ops (700ms debounce) before hitting Laravel.

**Persistence model** — ops (stroke/erase/undo/clear) + notes live in SQLite.
A reconnecting client gets the last 400 ephemeral ops replayed from the relay,
and a fresh page load hydrates the full board from Laravel's snapshot API.

## Key files

| Layer     | Path |
|-----------|------|
| Frontend  | `resources/js/App.jsx`, `resources/js/components/BoardCanvas.jsx` |
| Realtime  | `relay/server.cjs`, `resources/js/hooks/useRealtime.js` |
| API       | `app/Http/Controllers/Api/V1/*.php` |
| WebRTC    | `resources/js/lib/rtc.js` (mesh calls, STUN only) |

## Test

```bash
node scripts/e2e.mjs   # two simulated clients: presence, ops, cursors, notes, persistence, export
```

## Env

```
RELAY_SECRET=dev-relay-secret-change-me
RELAY_URL=http://127.0.0.1:6002
```
