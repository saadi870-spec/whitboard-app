const API = 'http://127.0.0.1:8000/api/v1';
const WS = 'ws://127.0.0.1:6002/upgr';
const { WebSocket } = await import('ws');

async function guest(name) {
  const r = await fetch(`${API}/auth/guest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  return r.json();
}
async function createRoom(token) {
  const r = await fetch(`${API}/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}',
  });
  return r.json();
}

function connect(token, code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const w = waiters.find((x) => x.match(msg));
      if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
      else inbox.push(msg);
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', room: code, token }));
      resolve({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        waitFor: (match, ms = 4000) => new Promise((res, rej) => {
          const i = inbox.findIndex(match);
          if (i >= 0) return res(inbox.splice(i, 1)[0]);
          const timer = setTimeout(() => rej(new Error('timeout waiting for msg')), ms);
          waiters.push({ match, resolve: (m) => { clearTimeout(timer); res(m); } });
        }),
      });
    });
    ws.on('error', reject);
  });
}

const a = await guest('Alice');
const b = await guest('Bob');
const room = await createRoom(a.token);
console.log('room code:', room.code);

const ca = await connect(a.token, room.code);
const cb = await connect(b.token, room.code);
await new Promise((r) => setTimeout(r, 400));

// Alice should see Bob join (presence), and vice versa
const presA = await ca.waitFor((m) => m.t === 'presence' && m.peers.length === 2);
console.log('presence OK — peers:', presA.peers.map((p) => p.name).join(', '));

// Alice draws; Bob should receive the op
ca.send({ t: 'ops', ops: [{ kind: 'stroke', payload: { id: 'str_1', pts: [10, 10, 40, 60], color: '#ff0000', w: 3 }, ref: 'str_1' }] });
const ops = await cb.waitFor((m) => m.t === 'ops');
console.log('op fan-out OK — kind:', ops.ops[0].kind, 'pts:', ops.ops[0].payload.pts.length);

// Cursor presence
ca.send({ t: 'cursor', x: 123, y: 456 });
const cur = await cb.waitFor((m) => m.t === 'cursor');
console.log('cursor OK —', cur.name, '@', cur.x, cur.y);

// Note add
cb.send({ t: 'note_add', id: 'nte_e2e1', body: 'hello', x: 50, y: 60, color: 'amber' });
await ca.waitFor((m) => m.t === 'note_add');
console.log('note fan-out OK');

// Persistence check after relay flush (700ms debounce)
await new Promise((r) => setTimeout(r, 1600));
const snap = await (await fetch(`${API}/rooms/${room.code}/snapshot`, { headers: { Authorization: `Bearer ${a.token}` } })).json();
console.log('persistence OK — ops in DB:', snap.ops.length, '| notes in DB:', snap.notes.length);

// Export check
const exp = await (await fetch(`${API}/rooms/${room.code}/export`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` } })).json();
console.log('export OK — meta:', exp.meta.app, '| participants:', exp.participants.length);

ca.ws.close(); cb.ws.close();
console.log('\n✅ E2E realtime chain: PASS');
process.exit(0);
