import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BoardCanvas from './components/BoardCanvas.jsx';
import VideoHud from './components/VideoHud.jsx';
import { useRealtime } from './hooks/useRealtime.js';
import { createRtc } from './lib/rtc.js';
import { api, getToken, setToken } from './lib/api.js';

const WS_URL = window.LARABOARD_WS || (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.hostname + ':6002/upgr';
const PALETTE = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function App() {
  const [me, setMe] = useState(null);
  const [room, setRoom] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [lobbyError, setLobbyError] = useState('');
  const [busy, setBusy] = useState(false);

  // Board collections live in refs (mutation-friendly) and re-render on bumps.
  const strokesRef = useRef([]);
  const notesRef = useRef([]);
  const peersRef = useRef(new Map());
  const myOpsRef = useRef(new Map());
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const canvasRef = useRef(null);
  const lastCursorRef = useRef(0);
  const [strokeV, setStrokeV] = useState(0);
  const [noteV, setNoteV] = useState(0);
  const [peerV, setPeerV] = useState(0);
  const [camera, setCamera] = useState({ x: 0, y: 0 });

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#3b82f6');
  const [width, setWidth] = useState(3);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [toast, setToast] = useState('');
  const [rtcEnabled, setRtcEnabled] = useState(false);
  const [selfStream, setSelfStream] = useState(null);
  const [streams, setStreams] = useState([]);

  const rtcRef = useRef(null);
  const sendRef = useRef(() => {});
  const toastTimer = useRef(0);

  const showToast = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const res = await api.me();
          setMe(res.guest);
          return;
        } catch {
          setToken(null);
        }
      }
      const res = await api.guest();
      setToken(res.token);
      setMe(res.guest);
    })().catch((e) => setLobbyError(e.message));
  }, []);

  const applyStroke = useCallback((s) => {
    strokesRef.current = [...strokesRef.current, s];
    setStrokeV((v) => v + 1);
  }, []);

  const applyRemoteOps = useCallback((ops) => {
    for (const op of ops) {
      if (op.ref && myOpsRef.current.has(op.ref)) {
        myOpsRef.current.delete(op.ref);
        continue; // our own op echoed back; already applied locally
      }
      if (op.kind === 'stroke' || op.kind === 'erase') {
        applyStroke(op.payload);
      } else if (op.kind === 'undo') {
        strokesRef.current = strokesRef.current.filter((s) => s.id !== op.payload.ref);
        setStrokeV((v) => v + 1);
      } else if (op.kind === 'clear') {
        strokesRef.current = [];
        setStrokeV((v) => v + 1);
      }
    }
  }, [applyStroke]);

  const handleMessage = useCallback((msg) => {
    switch (msg.t) {
      case 'presence': {
        const known = new Set(peersRef.current.keys());
        const incoming = new Map(msg.peers.map((p) => [p.guest, p]));
        for (const [gid, p] of incoming) {
          const prev = peersRef.current.get(gid);
          peersRef.current.set(gid, { ...prev, ...p });
          if (!known.has(gid) && me && gid !== me.id && me.id > gid && rtcRef.current) {
            rtcRef.current.call(gid, true);
          }
        }
        for (const gid of [...peersRef.current.keys()]) {
          if (!incoming.has(gid)) {
            peersRef.current.delete(gid);
            rtcRef.current?.detach(gid);
          }
        }
        setPeerV((v) => v + 1);
        break;
      }
      case 'ops':
        applyRemoteOps(msg.ops || []);
        break;
      case 'cursor': {
        const p = peersRef.current.get(msg.from);
        if (p) {
          peersRef.current.set(msg.from, { ...p, cursor: { x: msg.x, y: msg.y } });
          setPeerV((v) => v + 1);
        }
        break;
      }
      case 'note_add':
        notesRef.current = [...notesRef.current.filter((n) => n.id !== msg.id), {
          id: msg.id, body: msg.body, x: msg.x, y: msg.y, color: msg.color || 'amber',
        }];
        setNoteV((v) => v + 1);
        break;
      case 'note_move':
        notesRef.current = notesRef.current.map((n) => (n.id === msg.id ? { ...n, x: msg.x, y: msg.y } : n));
        setNoteV((v) => v + 1);
        break;
      case 'note_edit':
        notesRef.current = notesRef.current.map((n) => (n.id === msg.id ? { ...n, body: msg.body } : n));
        setNoteV((v) => v + 1);
        break;
      case 'note_del':
        notesRef.current = notesRef.current.filter((n) => n.id !== msg.id);
        setNoteV((v) => v + 1);
        break;
      case 'rtc':
        rtcRef.current?.onSignal(msg.from, msg.signal);
        break;
      case 'chat':
        setChat((c) => [...c.slice(-49), { name: msg.name, color: msg.color, text: msg.text, self: false }]);
        break;
      case 'error':
        showToast(msg.message || 'Relay error');
        break;
      default:
        break;
    }
  }, [me, applyRemoteOps, showToast]);

  const { send } = useRealtime({
    url: WS_URL,
    room: room?.code,
    token: getToken(),
    enabled: Boolean(me && room),
    onMessage: handleMessage,
  });
  sendRef.current = send;

  useEffect(() => {
    if (!me) return undefined;
    rtcRef.current = createRtc({
      send: (m) => sendRef.current(m),
      selfId: me.id,
      onStreams: (remoteMap, localStream) => {
        setSelfStream(localStream || null);
        const list = [];
        for (const [gid, p] of remoteMap) {
          if (p.stream && gid !== me.id) {
            list.push({ guest: gid, stream: p.stream, name: peersRef.current.get(gid)?.name });
          }
        }
        setStreams(list);
      },
    });
    return () => {
      rtcRef.current?.stream()?.getTracks().forEach((tr) => tr.stop());
      rtcRef.current = null;
    };
  }, [me]);

  const toggleCall = useCallback(async () => {
    if (rtcEnabled) {
      rtcRef.current?.stream()?.getTracks().forEach((tr) => tr.stop());
      setSelfStream(null);
      setStreams([]);
      setRtcEnabled(false);
      return;
    }
    try {
      setRtcEnabled(true);
      for (const gid of peersRef.current.keys()) {
        if (me && gid !== me.id) await rtcRef.current.call(gid, true);
      }
    } catch (e) {
      showToast(e.message || 'Camera unavailable');
      setRtcEnabled(false);
    }
  }, [rtcEnabled, me, showToast]);

  const handleOpLocal = useCallback((op) => {
    if (op.t === 'stroke') {
      applyStroke(op.stroke);
      myOpsRef.current.set(op.stroke.id, true);
      undoRef.current.push({ type: 'stroke', stroke: op.stroke });
      redoRef.current = [];
      sendRef.current({ t: 'ops', ops: [{ kind: op.stroke.erase ? 'erase' : 'stroke', payload: op.stroke, ref: op.stroke.id }] });
    } else if (op.t === 'pan') {
      setCamera((c) => ({ x: c.x - op.dx, y: c.y - op.dy }));
    } else if (op.t === 'note_add') {
      const note = { id: op.id, body: op.body, x: op.x, y: op.y, color: op.color };
      notesRef.current = [...notesRef.current, note];
      setNoteV((v) => v + 1);
      undoRef.current.push({ type: 'note_add', id: op.id, note });
      redoRef.current = [];
      sendRef.current({ t: 'note_add', ...note });
    } else if (op.t === 'cursor') {
      const now = Date.now();
      if (now - lastCursorRef.current > 40) {
        lastCursorRef.current = now;
        sendRef.current({ t: 'cursor', x: op.x, y: op.y });
      }
    } else if (op.t === 'clear') {
      const prev = strokesRef.current;
      strokesRef.current = [];
      setStrokeV((v) => v + 1);
      undoRef.current.push({ type: 'clear', prev });
      redoRef.current = [];
      sendRef.current({ t: 'ops', ops: [{ kind: 'clear', payload: {}, ref: `clr_${Date.now()}` }] });
    }
  }, [applyStroke]);

  const handleUndo = useCallback(() => {
    const item = undoRef.current.pop();
    if (!item) return;
    redoRef.current.push(item);
    if (item.type === 'stroke') {
      strokesRef.current = strokesRef.current.filter((s) => s.id !== item.stroke.id);
      setStrokeV((v) => v + 1);
      sendRef.current({ t: 'ops', ops: [{ kind: 'undo', payload: { ref: item.stroke.id }, ref: `u_${item.stroke.id}` }] });
    } else if (item.type === 'clear') {
      strokesRef.current = [...item.prev];
      setStrokeV((v) => v + 1);
      sendRef.current({ t: 'ops', ops: item.prev.map((s) => ({ kind: s.erase ? 'erase' : 'stroke', payload: s, ref: s.id })) });
    } else if (item.type === 'note_add') {
      notesRef.current = notesRef.current.filter((n) => n.id !== item.id);
      setNoteV((v) => v + 1);
      sendRef.current({ t: 'note_del', id: item.id });
    }
  }, []);

  const handleRedo = useCallback(() => {
    const item = redoRef.current.pop();
    if (!item) return;
    undoRef.current.push(item);
    if (item.type === 'stroke') {
      applyStroke(item.stroke);
      sendRef.current({ t: 'ops', ops: [{ kind: item.stroke.erase ? 'erase' : 'stroke', payload: item.stroke, ref: item.stroke.id }] });
    } else if (item.type === 'clear') {
      strokesRef.current = [];
      setStrokeV((v) => v + 1);
      sendRef.current({ t: 'ops', ops: [{ kind: 'clear', payload: {}, ref: `clr_${Date.now()}` }] });
    } else if (item.type === 'note_add') {
      notesRef.current = [...notesRef.current, item.note];
      setNoteV((v) => v + 1);
      sendRef.current({ t: 'note_add', ...item.note });
    }
  }, [applyStroke]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 'p') setTool('pen');
      else if (e.key === 'e') setTool('eraser');
      else if (e.key === 'n') setTool('note');
      else if (e.key === 'h') setTool('pan');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const enterRoom = useCallback(async (fn) => {
    setBusy(true);
    setLobbyError('');
    try {
      if (!me) {
        const g = await api.guest(nameInput || undefined);
        setToken(g.token);
        setMe(g.guest);
      }
      const r = await fn();
      // Hydrate persisted board state from Laravel before opening the socket
      try {
        const snap = await api.snapshot(r.code);
        strokesRef.current = snap.ops
          .filter((o) => o.kind === 'stroke' || o.kind === 'erase')
          .map((o) => o.payload);
        notesRef.current = snap.notes.map((n) => ({ id: n.id, body: n.body, x: n.x, y: n.y, color: n.color }));
        setStrokeV((v) => v + 1);
        setNoteV((v) => v + 1);
      } catch {}
      setRoom(r);
    } catch (e) {
      setLobbyError(e.message);
    } finally {
      setBusy(false);
    }
  }, [me, nameInput]);

  const onExportPng = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `board-${room.code}.png`;
    a.click();
    showToast('PNG exported');
  }, [room, showToast]);

  const onExportJson = useCallback(async () => {
    const data = await api.export(room.code);
    downloadJson(data, `board-${room.code}.json`);
    showToast('JSON exported');
  }, [room, showToast]);

  const onExportSvg = useCallback(() => {
    const svg = buildSvg(strokesRef.current, notesRef.current);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `board-${room.code}.svg`);
    showToast('SVG exported');
  }, [room, showToast]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !me) return;
    setChat((c) => [...c.slice(-49), { name: me.name, color: me.color, text, self: true }]);
    sendRef.current({ t: 'chat', text });
    setChatInput('');
  }, [chatInput, me]);

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(room.code).then(() => showToast('Board code copied'));
  }, [room, showToast]);

  const peers = useMemo(() => [...peersRef.current.values()], [peerV]);

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
          <h1 className="mb-1 text-2xl font-bold tracking-tight">LaraBoard</h1>
          <p className="mb-6 text-sm text-slate-400">Realtime collaborative whiteboard — Laravel + React + WebSockets</p>

          <label className="mb-1 block text-xs font-medium text-slate-400">Display name</label>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={me ? me.name : 'Anonymous guest'}
            className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => enterRoom(() => api.createRoom())}
            className="mb-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            Create a new board
          </button>

          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-800" /> or join <span className="h-px flex-1 bg-slate-800" />
          </div>

          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={12}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              disabled={busy || codeInput.length < 4}
              onClick={() => enterRoom(() => api.joinRoom(codeInput))}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-40"
            >
              Join
            </button>
          </div>

          {lobbyError && <p className="mt-4 rounded-lg bg-rose-950/60 px-3 py-2 text-xs text-rose-300">{lobbyError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <BoardCanvas
        strokes={strokesRef.current}
        notes={notesRef.current}
        peers={new Map(peers.map((p) => [p.guest, p]))}
        tool={tool}
        color={color}
        width={width}
        camera={camera}
        selection={null}
        onOpLocal={handleOpLocal}
        onCursor={(x, y) => handleOpLocal({ t: 'cursor', x, y })}
        onCanvasRef={(el) => { canvasRef.current = el; }}
      />

      <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-800 bg-slate-900/90 px-4 py-2 shadow-xl backdrop-blur">
        <span className="max-w-[180px] truncate text-sm font-semibold">{room.name}</span>
        <button type="button" onClick={copyCode} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs tracking-widest text-indigo-300 hover:bg-slate-700" title="Copy board code">
          {room.code}
        </button>
        <span className="flex -space-x-1.5">
          <Avatar name={me?.name} color={me?.color} self />
          {peers.filter((p) => p.guest !== me?.id).map((p) => <Avatar key={p.guest} name={p.name} color={p.color} />)}
        </span>
        <span className="h-2 w-2 rounded-full bg-emerald-400" title="live" />
        <button type="button" onClick={onExportPng} className="text-xs text-slate-300 hover:text-white">PNG</button>
        <button type="button" onClick={onExportSvg} className="text-xs text-slate-300 hover:text-white">SVG</button>
        <button type="button" onClick={onExportJson} className="text-xs text-slate-300 hover:text-white">JSON</button>
        <button type="button" onClick={() => setRoom(null)} className="text-xs text-rose-400 hover:text-rose-300">Leave</button>
      </div>

      <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/90 p-2 shadow-xl backdrop-blur">
        <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} label="Pen (P)">✏️</ToolBtn>
        <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} label="Eraser (E)">🧽</ToolBtn>
        <ToolBtn active={tool === 'note'} onClick={() => setTool('note')} label="Sticky note (N)">🗒️</ToolBtn>
        <ToolBtn active={tool === 'pan'} onClick={() => setTool('pan')} label="Pan (H)">✋</ToolBtn>
        <div className="my-1 h-px w-6 bg-slate-800" />
        <div className="grid grid-cols-2 gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); setTool('pen'); }}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <input type="range" min={1} max={18} value={width} onChange={(e) => setWidth(+e.target.value)} className="mt-1 w-16 accent-indigo-500" />
        <div className="my-1 h-px w-6 bg-slate-800" />
        <ToolBtn active={false} onClick={handleUndo} label="Undo (Ctrl+Z)">↩️</ToolBtn>
        <ToolBtn active={false} onClick={handleRedo} label="Redo (Ctrl+Shift+Z)">↪️</ToolBtn>
        <ToolBtn active={false} onClick={() => handleOpLocal({ t: 'clear' })} label="Clear board">🗑️</ToolBtn>
      </div>

      <div className="absolute bottom-4 left-4 z-20 w-72 rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur">
        <div className="max-h-44 overflow-y-auto px-3 py-2 text-xs">
          {chat.length === 0 && <p className="text-slate-500">Messages are ephemeral — say hi 👋</p>}
          {chat.map((m, i) => (
            <p key={i} className="mb-1">
              <span className="font-semibold" style={{ color: m.color }}>{m.name}{m.self ? ' (you)' : ''}: </span>
              <span className="text-slate-300">{m.text}</span>
            </p>
          ))}
        </div>
        <div className="flex border-t border-slate-800">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            placeholder="Message…"
            className="w-full bg-transparent px-3 py-2 text-xs outline-none"
          />
          <button type="button" onClick={sendChat} className="px-3 text-xs text-indigo-300 hover:text-indigo-200">Send</button>
        </div>
      </div>

      <VideoHud
        streams={streams}
        selfStream={selfStream}
        selfName={me?.name}
        enabled={rtcEnabled}
        onToggle={toggleCall}
      />

      {toast && (
        <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-xs shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, color, self }) {
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      title={self ? `${name} (you)` : name}
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold text-slate-950"
      style={{ background: color || '#64748b', borderColor: self ? '#fff' : '#0f172a' }}
    >
      {initials}
    </span>
  );
}

function ToolBtn({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition ${active ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}
    >
      {children}
    </button>
  );
}

function downloadJson(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function buildSvg(strokes, notes) {
  let minX = 0;
  let minY = 0;
  let maxX = 1200;
  let maxY = 800;
  for (const s of strokes) {
    for (let i = 0; i < s.pts.length; i += 2) {
      minX = Math.min(minX, s.pts[i]);
      maxX = Math.max(maxX, s.pts[i]);
      minY = Math.min(minY, s.pts[i + 1]);
      maxY = Math.max(maxY, s.pts[i + 1]);
    }
  }
  const pad = 20;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}" font-family="sans-serif">`,
    '<rect x="0" y="0" width="100%" height="100%" fill="#0b1220"/>',
  ];
  for (const s of strokes) {
    if (s.erase) continue;
    const pts = [];
    for (let i = 0; i < s.pts.length; i += 2) pts.push(`${s.pts[i]},${s.pts[i + 1]}`);
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const n of notes) {
    parts.push(`<g transform="translate(${n.x} ${n.y}) rotate(-2)"><rect width="180" height="140" rx="4" fill="#fde68a"/><text x="10" y="22" font-size="13" fill="#0f172a">${escapeXml(n.body)}</text></g>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
