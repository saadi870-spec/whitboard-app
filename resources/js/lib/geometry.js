// Bundled Sutherland–Hodgman rect clipping (no polyfill deps).
export function clipSegmentToRect(p1, p2, w, h) {
  let [x1, y1] = p1;
  let [x2, y2] = p2;

  const out = [];
  const clip = (prev, cur) => {
    const inside = (p, edge) => {
      if (edge === 0) return p[0] >= 0;
      if (edge === 1) return p[0] <= w;
      if (edge === 2) return p[1] >= 0;
      return p[1] <= h;
    };
    const intersect = (prev, cur, edge) => {
      if (edge === 0 || edge === 1) {
        const x = edge === 0 ? 0 : w;
        const t = (x - prev[0]) / (cur[0] - prev[0]);
        return [x, prev[1] + t * (cur[1] - prev[1])];
      }
      const y = edge === 2 ? 0 : h;
      const t = (y - prev[1]) / (cur[1] - prev[1]);
      return [prev[0] + t * (cur[0] - prev[0]), y];
    };
    for (let edge = 0; edge < 4; edge++) {
      if (inside(cur, edge)) {
        if (!inside(prev, edge)) out.push(intersect(prev, cur, edge));
        out.push(cur);
      } else if (inside(prev, edge)) {
        out.push(intersect(prev, cur, edge));
      }
      [prev, cur] = [out.shift() ?? prev, out.shift() ?? cur];
      break;
    }
  };
  clip(p1, p2);
  return out.length >= 2 ? [out[0], out[out.length - 1]] : null;
}
