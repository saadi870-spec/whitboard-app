import { useEffect, useRef, useCallback } from 'react';

const TOOL_CURSOR = { pen: 'crosshair', eraser: 'cell', note: 'copy', pan: 'grab' };

/**
 * Canvas board renderer.
 * - committed strokes are cached as Path2D and replayed each frame
 * - the in-progress stroke is drawn per-frame with live camera transform
 * - a rAF loop repaints only when a dirty flag is set (battery/CPU friendly)
 */
export default function BoardCanvas({
  strokes, notes, peers,
  tool, color, width, camera, selection,
  onOpLocal, onCursor, onCanvasRef,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const dirtyRef = useRef(true);
  const liveRef = useRef(null);
  const cacheRef = useRef(null);
  const panningRef = useRef(null);
  const camRef = useRef(camera);
  camRef.current = camera;

  useEffect(() => { onCanvasRef(canvasRef.current); }, [onCanvasRef]);
  useEffect(() => { dirtyRef.current = true; }, [strokes, notes, peers, selection, camera, tool]);

  const paint = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cacheRef.current = null;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = camRef.current;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(148,163,184,0.07)';
    const gs = 32;
    const ox = ((-cam.x % gs) + gs) % gs;
    const oy = ((-cam.y % gs) + gs) % gs;
    for (let x = ox; x < W; x += gs) ctx.fillRect(x, 0, 1, H);
    for (let y = oy; y < H; y += gs) ctx.fillRect(0, y, W, 1);

    if (!cacheRef.current) cacheRef.current = new Map();
    const cache = cacheRef.current;
    const live = cache.get('__live__');
    if (live) cache.delete('__live__');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      let path = cache.get(s.id);
      if (!path) {
        path = new Path2D();
        const p = s.pts;
        for (let i = 0; i < p.length; i += 2) {
          const sx = p[i] - cam.x;
          const sy = p[i + 1] - cam.y;
          if (i === 0) path.moveTo(sx, sy);
          else path.lineTo(sx, sy);
        }
        cache.set(s.id, path);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w;
      if (s.erase) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.stroke(path);
        ctx.restore();
      } else {
        ctx.stroke(path);
      }
    }

    const cur = liveRef.current;
    if (cur && cur.pts.length >= 2) {
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = cur.w;
      ctx.beginPath();
      const p = cur.pts;
      for (let i = 0; i < p.length; i += 2) {
        const sx = p[i] - cam.x;
        const sy = p[i + 1] - cam.y;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    for (const n of notes) {
      const x = n.x - cam.x;
      const y = n.y - cam.y;
      if (x < -220 || y < -240 || x > W + 20 || y > H + 20) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.02);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = NOTE_COLORS[n.color]?.bg ?? '#fde68a';
      ctx.fillRect(0, 0, 180, 140);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
      wrapText(ctx, n.body, 10, 22, 160, 17);
      ctx.restore();
    }

    for (const p of peers.values()) {
      if (!p.cursor) continue;
      const x = p.cursor.x - cam.x;
      const y = p.cursor.y - cam.y;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y + 4);
      ctx.lineTo(x + 7, y + 11);
      ctx.closePath();
      ctx.fill();
      const label = p.name || 'Guest';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = p.color;
      ctx.fillRect(x + 12, y + 10, tw, 16);
      ctx.fillStyle = '#0b1220';
      ctx.fillText(label, x + 17, y + 22);
    }

    if (selection) {
      ctx.strokeStyle = '#60a5fa';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        selection.x - cam.x - 4,
        selection.y - cam.y - 4,
        selection.w + 8,
        selection.h + 8,
      );
      ctx.setLineDash([]);
    }
  }, [strokes, notes, peers, selection]);

  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        paint();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint]);

  const toWorld = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - r.left + camRef.current.x),
      y: Math.round(e.clientY - r.top + camRef.current.y),
    };
  };

  const onPointerDown = (e) => {
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch {}
    const w = toWorld(e);
    if (tool === 'note') {
      onOpLocal({ t: 'note_add', id: uid('nte'), body: 'New note', x: w.x, y: w.y, color: 'amber' });
      return;
    }
    if (tool === 'pen' || tool === 'eraser') {
      liveRef.current = {
        id: uid('str'),
        pts: [w.x, w.y],
        color,
        w: tool === 'eraser' ? 28 : width,
        erase: tool === 'eraser',
      };
      dirtyRef.current = true;
      return;
    }
    if (tool === 'pan') {
      panningRef.current = { sx: e.clientX, sy: e.clientY };
    }
  };

  const onPointerMove = (e) => {
    const w = toWorld(e);
    const live = liveRef.current;
    if (live) {
      const pts = live.pts;
      const n = pts.length;
      if (n < 2 || Math.hypot(w.x - pts[n - 2], w.y - pts[n - 1]) > 1.5) {
        pts.push(w.x, w.y);
        dirtyRef.current = true;
      }
    } else if (panningRef.current) {
      const d = panningRef.current;
      onOpLocal({ t: 'pan', dx: e.clientX - d.sx, dy: e.clientY - d.sy });
      d.sx = e.clientX;
      d.sy = e.clientY;
    }
    if (e.pointerType !== 'touch') onCursor(w.x, w.y);
  };

  const onPointerUp = () => {
    const live = liveRef.current;
    if (live) {
      liveRef.current = null;
      if (live.pts.length >= 4) onOpLocal({ t: 'stroke', stroke: live });
      dirtyRef.current = true;
    }
    panningRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      style={{ cursor: TOOL_CURSOR[tool] ?? 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}

export const NOTE_COLORS = {
  amber: { bg: '#fde68a', dot: '#f59e0b' },
  mint: { bg: '#a7f3d0', dot: '#10b981' },
  sky: { bg: '#bae6fd', dot: '#0ea5e9' },
  rose: { bg: '#fecdd3', dot: '#f43f5e' },
};

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
