/** Profil d'altitude et tracé de la route, en SVG (aucune carte externe). */
import { useMemo } from 'preact/hooks';

let clipSeq = 0;

interface P { d: number; ele: number }
interface LL { lat: number; lon: number }

const W = 320;

export function RouteProfile({ points, pos, height = 90 }: { points: P[]; pos?: number; height?: number }) {
  const clipId = useMemo(() => `rp-done-${++clipSeq}`, []);
  if (points.length < 2) return null;
  const total = points[points.length - 1].d || 1;
  const eles = points.map((p) => p.ele);
  let min = Math.min(...eles), max = Math.max(...eles);
  if (max - min < 20) { const mid = (max + min) / 2; min = mid - 10; max = mid + 10; }
  const x = (d: number) => (d / total) * W;
  const y = (e: number) => height - 4 - ((e - min) / (max - min)) * (height - 8);
  const line = points.map((p) => `${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ');
  let marker = null;
  if (pos != null) {
    const i = Math.max(0, points.findIndex((p) => p.d >= pos) - 1);
    const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
    const t = b.d > a.d ? Math.min(1, Math.max(0, (pos - a.d) / (b.d - a.d))) : 0;
    const e = a.ele + (b.ele - a.ele) * t;
    marker = <circle cx={x(Math.min(pos, total))} cy={y(e)} r="5" fill="var(--accent)" stroke="#fff" stroke-width="1.5" />;
  }
  const done = pos != null ? Math.min(pos, total) : 0;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style="display:block">
      <defs><clipPath id={clipId}><rect x="0" y="0" width={x(done)} height={height} /></clipPath></defs>
      <polygon points={`0,${height} ${line} ${W},${height}`} fill="#3c9cff33" />
      <polygon points={`0,${height} ${line} ${W},${height}`} fill="#ff6b2c55" clip-path={`url(#${clipId})`} />
      <polyline points={line} fill="none" stroke="#3c9cff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      {marker}
    </svg>
  );
}

/** Tracé vu du dessus (projection équirectangulaire, suffisante à l'échelle d'une route). */
export function RouteTrace({ points, pos, size = 140 }: { points: LL[]; pos?: LL; size?: number }) {
  if (points.length < 2) return null;
  const lat0 = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lon * k), ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1e-6;
  const pad = 8, inner = size - 2 * pad;
  const ox = pad + (inner - ((maxX - minX) / span) * inner) / 2, oy = pad + (inner - ((maxY - minY) / span) * inner) / 2;
  const px = (p: LL) => ox + ((p.lon * k - minX) / span) * inner;
  const py = (p: LL) => oy + ((-p.lat - minY) / span) * inner;
  const step = Math.max(1, Math.floor(points.length / 600));
  const line = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => `${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const s = points[0], e = points[points.length - 1];
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
