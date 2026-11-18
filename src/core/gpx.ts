import type { Route, RoutePoint } from './types';

const MIN_SPACING_M = 5;
const MAX_POINTS = 5000;
const R_EARTH = 6371000;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Lit un fichier GPX (trace ou itinéraire). Lève une erreur en français si le fichier est inutilisable. */
export function parseGpx(xml: string, fallbackName = 'Route'): Route {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName !== 'gpx') {
    throw new Error("Ce fichier n'est pas un fichier GPX valide.");
  }
  let nodes = [...doc.getElementsByTagNameNS('*', 'trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagNameNS('*', 'rtept')];

  const raw: { lat: number; lon: number; ele: number | null }[] = [];
  for (const n of nodes) {
    const lat = Number(n.getAttribute('lat')), lon = Number(n.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleNode = [...n.children].find((c) => c.localName === 'ele');
    const ele = eleNode ? Number(eleNode.textContent) : NaN;
    raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  if (raw.length < 2) throw new Error('Le fichier GPX ne contient pas assez de points pour faire une route.');

  const hasElevation = raw.some((p) => p.ele != null);
  let lastEle = raw.find((p) => p.ele != null)?.ele ?? 0;
  const full = raw.map((p) => {
    if (p.ele != null) lastEle = p.ele;
    return { lat: p.lat, lon: p.lon, ele: hasElevation ? lastEle : 0 };
  });

  // distance totale pour choisir l'espacement minimal (5 m, ou plus pour rester sous 5000 points)
  let total = 0;
  for (let i = 1; i < full.length; i++) total += haversine(full[i - 1], full[i]);
  const spacing = Math.max(MIN_SPACING_M, total / (MAX_POINTS - 1));

  const points: RoutePoint[] = [{ ...full[0], d: 0 }];
  let d = 0, since = 0;
  for (let i = 1; i < full.length; i++) {
    const step = haversine(full[i - 1], full[i]);
    d += step;
    since += step;
    const last = i === full.length - 1;
    if (since >= spacing || (last && since > 0)) {
      if (last && since < spacing && points.length > 1) points.pop(); // le dernier point remplace un point trop proche
      points.push({ ...full[i], d });
      since = 0;
    }
  }
  if (points.length < 2) throw new Error('Le fichier GPX ne contient pas assez de points pour faire une route.');

  let gainM = 0;
  for (let i = 1; i < points.length; i++) gainM += Math.max(0, points[i].ele - points[i - 1].ele);

  const nameNode = doc.getElementsByTagNameNS('*', 'name')[0];
  const name = nameNode?.textContent?.trim() || fallbackName;
  return { id: newId(), name, points, distanceM: points[points.length - 1].d, gainM, hasElevation };
}

/** Index du tronçon [i, i+1] qui contient la distance d. */
function segmentIndex(r: Route, d: number): number {
  const pts = r.points;
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].d <= d) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function positionAt(r: Route, d: number): { lat: number; lon: number; ele: number } {
  const x = Math.min(Math.max(d, 0), r.distanceM);
  const i = segmentIndex(r, x);
  const a = r.points[i], b = r.points[i + 1];
  const t = b.d > a.d ? (x - a.d) / (b.d - a.d) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, ele: a.ele + (b.ele - a.ele) * t };
}

/** Pente (%) moyenne sur les `aheadM` mètres à venir (sur les derniers mètres en bout de route). */
export function gradeAt(r: Route, d: number, aheadM = 100): number {
  const span = Math.min(aheadM, r.distanceM);
  let from = Math.min(Math.max(d, 0), r.distanceM);
  if (from + span > r.distanceM) from = r.distanceM - span;
  if (span <= 0) return 0;
  return ((positionAt(r, from + span).ele - positionAt(r, from).ele) / span) * 100;
}

/** Dénivelé positif restant depuis la distance d. */
export function remainingGain(r: Route, d: number): number {
  const x = Math.min(Math.max(d, 0), r.distanceM);
  const i = segmentIndex(r, x);
  let gain = Math.max(0, r.points[i + 1].ele - positionAt(r, x).ele);
  for (let j = i + 2; j < r.points.length; j++) gain += Math.max(0, r.points[j].ele - r.points[j - 1].ele);
  return gain;
}

/** Niveau conseillé : niveau habituel sur le plat, +1 par tranche de 2 % de montée, −1 en descente (≤ −2 %). */
export function suggestLevel(gradePct: number, baseLevel: number): number {
  const lvl = gradePct >= 0 ? baseLevel + Math.floor(gradePct / 2) : gradePct <= -2 ? baseLevel - 1 : baseLevel;
  return Math.min(8, Math.max(1, lvl));
}
