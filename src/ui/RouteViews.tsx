/** Profil d'altitude et tracé de la route, en SVG (aucune carte externe). */
import { useMemo } from 'preact/hooks';

let clipSeq = 0;

interface P { d: number; ele: number }
interface LL { lat: number; lon: number }

const W = 320;

export function RouteProfile({ points, pos, height = 90 }: { points: P[]; pos?: number; height?: number }) {
  const clipId = useMemo(() => `rp-done-${++clipSeq}`, []);
  // tout ce qui dépend de la route est calculé une fois ; seule la position change chaque seconde
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const total = points[points.length - 1].d || 1;
    let min = Infinity, max = -Infinity;
    for (const p of points) { if (p.ele < min) min = p.ele; if (p.ele > max) max = p.ele; }
    if (max - min < 20) { const mid = (max + min) / 2; min = mid - 10; max = mid + 10; }
    const x = (d: number) => (d / total) * W;
    const y = (e: number) => height - 4 - ((e - min) / (max - min)) * (height - 8);
    const line = points.map((p) => `${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ');
    return { total, x, y, line, area: `0,${height} ${line} ${W},${height}` };
  }, [points, height]);
  if (!geo) return null;
  const { total, x, y, line, area } = geo;
  let marker: { cx: number; cy: number } | null = null;
  if (pos != null) {
    const d = Math.min(Math.max(pos, 0), total);
    let lo = 0, hi = points.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (points[mid].d <= d) lo = mid; else hi = mid - 1; }
    const a = points[lo], b = points[lo + 1];
    const t = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
    marker = { cx: x(d), cy: y(a.ele + (b.ele - a.ele) * t) };
  }
  const done = pos != null ? Math.min(Math.max(pos, 0), total) : 0;
  return (
    <div style="position:relative">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style="display:block">
        <defs><clipPath id={clipId}><rect x="0" y="0" width={x(done)} height={height} /></clipPath></defs>
        <polygon points={area} fill="#3c9cff33" />
        <polygon points={area} fill="#ff6b2c55" clip-path={`url(#${clipId})`} />
        <polyline points={line} fill="none" stroke="#3c9cff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      </svg>
      {marker && (
        // point en HTML positionné en %, pour rester rond malgré l'étirement du SVG
        <span style={`position:absolute;left:${(100 * marker.cx) / W}%;top:${marker.cy}px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--accent);border:1.5px solid #fff`} />
      )}
    </div>
  );
}

/** Tracé vu du dessus (projection équirectangulaire, suffisante à l'échelle d'une route). */
export function RouteTrace({ points, pos, size = 140 }: { points: LL[]; pos?: LL; size?: number }) {
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const lat0 = points.reduce((a, p) => a + p.lat, 0) / points.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const X = p.lon * k, Y = -p.lat;
      if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
    }
    const span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    const pad = 8, inner = size - 2 * pad;
    const ox = pad + (inner - ((maxX - minX) / span) * inner) / 2, oy = pad + (inner - ((maxY - minY) / span) * inner) / 2;
    const px = (p: LL) => ox + ((p.lon * k - minX) / span) * inner;
    const py = (p: LL) => oy + ((-p.lat - minY) / span) * inner;
    const step = Math.max(1, Math.floor(points.length / 600));
    const line = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => `${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
    return { px, py, line, s: points[0], e: points[points.length - 1] };
  }, [points, size]);
  if (!geo) return null;
  const { px, py, line, s, e } = geo;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style="display:block">
      <polyline points={line} fill="none" stroke="#3c9cff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx={px(s)} cy={py(s)} r="4" fill="var(--ok)" />
      <circle cx={px(e)} cy={py(e)} r="4" fill="var(--bad)" />
      {pos && <circle cx={px(pos)} cy={py(pos)} r="6" fill="var(--accent)" stroke="#fff" stroke-width="2" />}
    </svg>
  );
}

/** Pente maximale (%) sur des tronçons d'au moins 100 m. */
export function maxGrade(points: P[]): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    while (j < points.length - 1 && points[j].d - points[i].d < 100) j++;
    const dd = points[j].d - points[i].d;
    if (dd >= 100) best = Math.max(best, ((points[j].ele - points[i].ele) / dd) * 100);
  }
  return best;
}
