const ws = require('ws');
const http = require('http');

const PORT = Number(process.env.RELAY_PORT || process.env.PORT) || 6002;
const SECRET = process.env.RELAY_SECRET || 'dev-relay-secret-change-me';
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://127.0.0.1:8000';
const ROOM_TTL_MS = 10 * 60 * 1000;

/**
 * LaraBoard relay.
 *
 *  - /upgr        : browser websocket endpoint (token verified by Laravel)
 *  - /internal/*  : admin surface for Laravel (bearer RELAY_SECRET)
 *
 * Ephemeral fan-out (drawing, cursors, notes, WebRTC signaling) happens here;
 * Laravel remains the source of truth for rooms, ops and persistence.
 */

const rooms = new Map(); // code -> { sockets:Set, opQueue:[], opTimer, lastTouched }

function roomState(code) {
  code = String(code || '').toUpperCase();
  let r = rooms.get(code);
  if (!r) {
    r = { sockets: new Set(), opQueue: [], opTimer: null, lastTouched: Date.now() };
    rooms.set(code, r);
  }
  r.lastTouched = Date.now();
  return r;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.sockets.size === 0 && now - r.lastTouched > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`[relay] evicted idle room ${code}`);
    }
  }
}, 60_000).unref();

async function laravel(path, body, method = 'POST') {
  const res = await fetch(LARAVEL_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: method === 'DELETE' ? undefined : JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`laravel ${method} ${path} -> ${res.status}`);
  return res.json().catch(() => ({}));
}

function send(s, payload) {
  if (s.readyState === s.OPEN) s.send(JSON.stringify(payload));
}

function broadcast(code, payload, exceptId = null) {
  const r = rooms.get(String(code).toUpperCase());
  if (!r) return;
  for (const s of r.sockets) {
    if (exceptId && s.id === exceptId) continue;
    send(s, payload);
  }
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = {};
    try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

    if (req.url.startsWith('/internal/')) {
      if ((req.headers.authorization || '') !== `Bearer ${SECRET}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'unauthorized' }));
      }
      if (req.method === 'POST' && req.url === '/internal/rooms/evict') {
        rooms.delete(String(body.room || '').toUpperCase());
        return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not_found' }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
});

const wss = new ws.WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/upgr') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
});

wss.on('connection', (conn) => {
  conn.isAlive = true;
  conn.id = 'sock_' + Math.random().toString(36).slice(2, 10);
  conn.meta = null;

  conn.on('pong', () => { conn.isAlive = true; });

  conn.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Handshake: verify the browser token with Laravel, then join the room.
    if (msg.t === 'hello') {
      try {
        const res = await fetch(`${LARAVEL_URL}/api/v1/me`, {
          headers: { Authorization: `Bearer ${msg.token}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('bad token');
        const me = await res.json();

        conn.meta = {
          room: String(msg.room || '').toUpperCase(),
          guest: me.guest.id,
          name: me.guest.name,
          color: me.guest.color,
        };

        const r = roomState(conn.meta.room);
        r.sockets.add(conn);

        laravel('/api/v1/relay/sessions/upsert', {
          socket_id: conn.id,
          room_code: conn.meta.room,
          guest_id: conn.meta.guest,
          user_agent: String(msg.ua || '').slice(0, 255),
        }).catch(() => {});

        const roster = [...r.sockets].filter((s) => s.meta)
          .map((s) => ({ guest: s.meta.guest, name: s.meta.name, color: s.meta.color, socket: s.id }));
        for (const s of r.sockets) send(s, { t: 'presence', peers: roster });

        send(conn, { t: 'hello_ok', socket: conn.id, you: conn.meta, replay: r.opQueue.slice(-400) });
      } catch (e) {
        send(conn, { t: 'error', code: 'auth', message: 'handshake failed' });
        conn.close();
      }
      return;
    }

    if (!conn.meta) return;
    const { room } = conn.meta;
    const now = new Date().toISOString();

    if (msg.t === 'ops') {
      const ops = Array.isArray(msg.ops) ? msg.ops.slice(0, 200) : [];
      broadcast(room, { t: 'ops', from: conn.meta.guest, at: now, ops }, conn.id);

      const r = roomState(room);
      r.opQueue.push(...ops.map((o) => ({ ...o, guest: conn.meta.guest, at: now })));
      if (r.opQueue.length > 2000) r.opQueue.splice(0, r.opQueue.length - 2000);

      if (!r.opTimer) {
        r.opTimer = setTimeout(() => {
          r.opTimer = null;
          const batch = r.opQueue.splice(0, r.opQueue.length);
          if (batch.length) {
            laravel('/api/v1/relay/rooms/' + room + '/snapshot', {
              ops: batch.map((o) => ({
                kind: o.kind,
                payload: o.payload,
                client_ref: o.ref, guest: o.guest,
                rev: o.rev ?? null,
              })),
            }).catch((e) => console.error('[relay] snapshot flush:', e.message));
          }
        }, 700);
      }
      return;
    }

    if (msg.t === 'cursor') {
      broadcast(room, {
        t: 'cursor', from: conn.meta.guest, name: conn.meta.name,
        color: conn.meta.color, x: +msg.x || 0, y: +msg.y || 0,
      }, conn.id);
      return;
    }

    if (msg.t === 'note_add' || msg.t === 'note_move' || msg.t === 'note_del') {
      broadcast(room, { ...msg, from: conn.meta.guest }, conn.id);
      if (msg.t === 'note_add') {
        laravel('/api/v1/relay/rooms/' + room + '/notes', {
          id: String(msg.id || '').slice(0, 32),
          body: String(msg.body || ''),
          x: msg.x | 0,
          y: msg.y | 0,
          color: msg.color || 'amber',
        }).catch(() => {});
      } else if (msg.t === 'note_move') {
        laravel('/api/v1/relay/rooms/' + room + '/notes/' + msg.id, { x: msg.x | 0, y: msg.y | 0 }, 'PUT').catch(() => {});
      } else {
        laravel('/api/v1/relay/rooms/' + room + '/notes/' + msg.id, {}, 'DELETE').catch(() => {});
      }
      return;
    }

    if (msg.t === 'rtc') {
      broadcast(room, { t: 'rtc', from: conn.meta.guest, to: msg.to, signal: msg.signal }, conn.id);
      return;
    }

    if (msg.t === 'chat') {
      broadcast(room, {
        t: 'chat', from: conn.meta.guest, name: conn.meta.name,
        color: conn.meta.color, text: String(msg.text || '').slice(0, 500),
      }, conn.id);
    }
  });

  conn.on('close', () => {
    if (!conn.meta) return;
    const r = rooms.get(conn.meta.room);
    if (r) {
      r.sockets.delete(conn);
      const roster = [...r.sockets].filter((s) => s.meta)
        .map((s) => ({ guest: s.meta.guest, name: s.meta.name, color: s.meta.color, socket: s.id }));
      for (const s of r.sockets) send(s, { t: 'presence', peers: roster });
      laravel('/api/v1/relay/sessions/prune', { socket_ids: [conn.id] }).catch(() => {});
    }
  });
});

setInterval(() => {
  for (const r of rooms.values()) {
    for (const s of r.sockets) {
      if (!s.isAlive) { s.terminate(); continue; }
      s.isAlive = false;
      try { s.ping(); } catch {}
    }
  }
}, 30_000).unref();

server.listen(PORT, () => {
  console.log(`[relay] listening on http://127.0.0.1:${PORT} (ws path /upgr)`);
});
